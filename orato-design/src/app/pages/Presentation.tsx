import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Mic, MicOff, ArrowLeft, Maximize2, Wifi, WifiOff, FileText, Loader2, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { Document, Page, pdfjs } from "react-pdf";
import useAuthStore from "../store/authStore";
import api from "../api/api";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const staticStyles = `
  .react-pdf__Page__textContent { position: absolute; top: 0; left: 0; transform-origin: 0 0; line-height: 1; }
  .react-pdf__Page__textContent span { position: absolute; white-space: pre; color: transparent; }
  ::selection { background: rgba(59, 130, 246, 0.3); }
  .pdf-page-container { margin-bottom: 60px; position: relative; transition: transform 0.4s ease; }
  .active-page { outline: 2px solid rgba(59, 130, 246, 0.5); border-radius: 4px; }
  .custom-scrollbar::-webkit-scrollbar { width: 8px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: #0a0a0a; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: #333; border-radius: 10px; }
  
  /* BBOX Overlay animations */
  @keyframes pulse-border {
    0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
    70% { box-shadow: 0 0 0 15px rgba(239, 68, 68, 0); }
    100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
  }
  .bbox-highlight {
    position: absolute;
    border-radius: 4px;
    pointer-events: none;
    transition: all 0.3s ease-in-out;
    z-index: 10;
  }
`;

type BboxOverlay = {
  id: string;
  bbox: number[]; 
  color: string;
  isInspect?: boolean;
};

export function Presentation() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("System Ready");
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [docTitle, setDocTitle] = useState("");
  const [numPages, setNumPages] = useState<number | null>(null);
  const [activePage, setActivePage] = useState(1);
  const [baseScale, setBaseScale] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(1);
  const scale = baseScale * zoomLevel;
  
  const [bboxes, setBboxes] = useState<Record<number, BboxOverlay[]>>({});
  const [modalImage, setModalImage] = useState<string | null>(null);
  
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [clientId, setClientId] = useState("");
  
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const bboxRefs = useRef<Record<string, HTMLDivElement | null>>({});
  
  const wsRef = useRef<WebSocket | null>(null);
  const sttWsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  useEffect(() => {
    const token = useAuthStore.getState().token || localStorage.getItem("token");
    if (!token) { navigate("/auth"); return; }
    const stored = useAuthStore.getState().user;
    if (!stored) {
      api.get("/auth/me").then(res => useAuthStore.getState().setUser(res.data)).catch(() => {});
    }
  }, [navigate]);

  useEffect(() => {
    const loadSecurePDF = async () => {
      try {
        const response = await api.get(`/auth/view-doc/${id}`, { responseType: "blob" });
        const url = URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
        setFileUrl(url);
        const meta = await api.get(`/auth/doc/${id}`);
        setDocTitle(meta.data.filename);
      } catch (err) {
        setTranscript("Error: Access Denied");
      } finally {
        setIsLoading(false);
      }
    };
    if (id) loadSecurePDF();
    return () => { if (fileUrl) URL.revokeObjectURL(fileUrl); };
  }, [id]);


  // =====================================================================
  // IMAGE EXTRACTION LOGIC
  // =====================================================================
  const convertRawDataToUrl = useCallback((imgObj: any) => {
    if (!imgObj) return null;
    if (imgObj.bitmap) {
      const canvas = document.createElement("canvas");
      canvas.width = imgObj.width; canvas.height = imgObj.height;
      canvas.getContext("2d")?.drawImage(imgObj.bitmap, 0, 0);
      return canvas.toDataURL();
    }
    const { width, height, data } = imgObj;
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const imageData = ctx.createImageData(width, height);
    const size = width * height;
    let components = data.length === size * 4 ? 4 : data.length === size * 3 ? 3 : 1;
    let s = 0, d = 0;
    for (let i = 0; i < size; i++) {
      const val = data[s++];
      if (components === 1) { imageData.data[d++] = val; imageData.data[d++] = val; imageData.data[d++] = val; imageData.data[d++] = 255; }
      else if (components === 3) { imageData.data[d++] = val; imageData.data[d++] = data[s++]; imageData.data[d++] = data[s++]; imageData.data[d++] = 255; }
      else { imageData.data[d++] = val; imageData.data[d++] = data[s++]; imageData.data[d++] = data[s++]; imageData.data[d++] = data[s++]; }
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL();
  }, []);

  const extractAndShowImage = useCallback(async (pageNum: number, index: number) => {
    if (!pdfDocument) return;
    try {
      const pdfPage = await pdfDocument.getPage(pageNum);
      const ops = await pdfPage.getOperatorList();
      const imageRefs: any[] = [];
      for (let i = 0; i < ops.fnArray.length; i++) {
        if (ops.fnArray[i] === pdfjs.OPS.paintImageXObject || ops.fnArray[i] === pdfjs.OPS.paintInlineImageXObject) {
          imageRefs.push(ops.argsArray[i][0]);
        }
      }
      if (index >= 0 && index < imageRefs.length) {
        const imgObj = await pdfPage.objs.get(imageRefs[index]);
        const url = convertRawDataToUrl(imgObj);
        if (url) {
          setModalImage(url);
        }
      } else {
        console.warn(`⚠️ Tried to extract image index ${index}, but only found ${imageRefs.length} raster images on slide ${pageNum}. (It might be a vector graphic)`);
      }
    } catch (e) { console.error("Error extracting image:", e); }
  }, [pdfDocument, convertRawDataToUrl]);


  // =====================================================================
  // SPATIAL / BBOX HANDLERS
  // =====================================================================
  const handleNavigate = useCallback((slide: number) => {
    const pageNum = Math.min(Math.max(1, slide), numPages || 1);
    const el = pageRefs.current[pageNum];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setActivePage(pageNum);
    }
  }, [numPages]);

  const handleHighlight = useCallback((slide: number, bbox: number[], type = "text", isInspect = false) => {
    const overlayId = `bbox_${slide}_${Date.now()}`;
    
    let color = "rgba(253, 224, 71, 0.4)"; // Yellow for text
    if (isInspect) color = "rgba(239, 68, 68, 0.3)"; // Red for inspect
    else if (type === "image") color = "rgba(59, 130, 246, 0.4)"; // Blue for image
    
    setBboxes(prev => {
      const pageBoxes = prev[slide] || [];
      return { ...prev, [slide]: [...pageBoxes, { id: overlayId, bbox, color, isInspect }] };
    });
    
    handleNavigate(slide);
  }, [handleNavigate]);

  const handleZoom = useCallback((slide: number, bbox: number[], type = "image") => {
    setZoomLevel(2.2); 
    handleHighlight(slide, bbox, type); 
    handleNavigate(slide);

    setTimeout(() => {
      const overlaysOnPage = Object.values(bboxRefs.current);
      const latestOverlay = overlaysOnPage[overlaysOnPage.length - 1];
      if (latestOverlay) {
        latestOverlay.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
      }
    }, 300);
  }, [handleHighlight, handleNavigate]);

  const handleInspect = useCallback((slide: number, bbox: number[], imageInd?: number) => {
    handleHighlight(slide, bbox, "image", true);
    setZoomLevel(1.5);
    handleNavigate(slide);

    if (imageInd !== undefined && imageInd !== null) {
      extractAndShowImage(slide, imageInd);
    }
  }, [handleHighlight, handleNavigate, extractAndShowImage]);

  const handleClear = useCallback(() => {
    setBboxes({});
    setModalImage(null);
    setZoomLevel(1);
    setTranscript("Cleared all selections");
  }, []);

  const wsHandlersRef = useRef({
    navigate: handleNavigate,
    highlight: handleHighlight,
    zoom: handleZoom,
    inspect: handleInspect,
    clear: handleClear,
    transcriptUpdater: setTranscript
  });

  useEffect(() => {
    wsHandlersRef.current = {
      navigate: handleNavigate,
      highlight: handleHighlight,
      zoom: handleZoom,
      inspect: handleInspect,
      clear: handleClear,
      transcriptUpdater: setTranscript
    };
  }, [handleNavigate, handleHighlight, handleZoom, handleInspect, handleClear]);

  // =====================================================================
  // WEBSOCKET 1: MAIN CONTROL 
  // =====================================================================
  useEffect(() => {
    if (!id) return;
    
    const token = useAuthStore.getState().token || localStorage.getItem("token");
    const user = useAuthStore.getState().user;
    if (!token) return;

    const cId = user?.id && id ? `${user.id}_${id}` : `client_${id}`;
    setClientId(cId);
    
    const apiBase = (import.meta as any).env.VITE_API_URL || "http://127.0.0.1:8000";
    const wsBase = apiBase.replace(/^http/, apiBase.startsWith("https") ? "wss" : "ws");
    
    const ws = new WebSocket(`${wsBase}/ws/${cId}?token=${token}`);
    wsRef.current = ws;
    
    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const handlers = wsHandlersRef.current;
        
        const intent = (msg.intent || msg.Intent || "").toLowerCase();
        const slide = msg.slide || msg.Slide;
        const bbox = msg.bbox || msg.BBOX;
        const type = (msg.type || msg.Type || "text").toLowerCase();
        // Bulletproof image index parser
        const imageInd = msg.imageind ?? msg.imageInd ?? msg.ImageInd ?? msg.imageIndex ?? msg.ImageIndex; 
        const textData = msg.content || msg.Content || msg.text || msg.Text;

        switch (intent) {
          case "navigate": 
            handlers.navigate(slide); 
            break;
          case "highlight": 
          case "search": 
            if (slide && bbox) handlers.navigate(slide);
            break;
          case "zoom": 
            if (slide && bbox) handlers.zoom(slide, bbox, type);
            break;
          case "inspect": 
            if (slide && bbox) handlers.inspect(slide, bbox, imageInd);
            break;
          case "clear": 
            handlers.clear(); 
            break;
          case "speech": 
            if (textData) handlers.transcriptUpdater(textData); 
            break;
        }
      } catch (e) {}
    };
    
    return () => { 
      ws.close(); 
      wsRef.current = null; 
    };
  }, [id]);


  // =====================================================================
  // WEBSOCKET 2 & MIC: GOOGLE STT 
  // =====================================================================
  useEffect(() => {
    let sttWs: WebSocket | null = null;

    const startRecording = async () => {
      try {
        if (!clientId) return;

        const apiBase = (import.meta as any).env.VITE_API_URL || "http://127.0.0.1:8000";
        const wsBase = apiBase.replace(/^http/, apiBase.startsWith("https") ? "wss" : "ws");
        
        sttWs = new WebSocket(`${wsBase}/ws/stt/${clientId}`);
        sttWsRef.current = sttWs;

        sttWs.onopen = async () => {
          console.log("🎤 STT WebSocket Connected");
          setTranscript("Listening...");

          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          streamRef.current = stream;

          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          const audioContext = new AudioContextClass({ sampleRate: 48000 });
          audioContextRef.current = audioContext;

          const source = audioContext.createMediaStreamSource(stream);
          const processor = audioContext.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;

          // @ts-ignore
          processor.onaudioprocess = (e) => {
            const inputData = e.inputBuffer.getChannelData(0);
            const pcmData = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
              pcmData[i] = Math.max(-1, Math.min(1, inputData[i])) * 0x7FFF;
            }
            if (sttWs && sttWs.readyState === WebSocket.OPEN) {
              sttWs.send(pcmData.buffer);
            }
          };

          source.connect(processor);
          processor.connect(audioContext.destination);
        };

        sttWs.onclose = () => {
          console.log("🛑 STT WebSocket Disconnected");
          if (isListening) setIsListening(false);
        };

      } catch (err) {
        console.error("Microphone access denied or error:", err);
        setIsListening(false);
        setTranscript("Error: Microphone access denied");
      }
    };

    const stopRecording = () => {
      if (processorRef.current && audioContextRef.current) {
        processorRef.current.disconnect();
        audioContextRef.current.close().catch(console.error);
        processorRef.current = null;
        audioContextRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (sttWs) {
        sttWs.close();
        sttWs = null;
        sttWsRef.current = null;
      }
    };

    if (isListening && clientId) {
      startRecording();
    } else {
      stopRecording();
      setTranscript(prev => prev === "Listening..." ? "System Ready" : prev);
    }

    return () => stopRecording();
  }, [isListening, clientId]);


  // =====================================================================
  // UI LOGIC
  // =====================================================================
  useEffect(() => {
    if (!numPages) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pageNum = parseInt(entry.target.getAttribute("data-page-number") || "1");
            setActivePage(pageNum);
          }
        });
      },
      { root: scrollContainerRef.current, threshold: 0.5 }
    );
    Object.values(pageRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [numPages]);

  useEffect(() => {
    if (!pdfDocument) return;
    const recalcBaseScale = async () => {
      const page = await pdfDocument.getPage(1);
      const viewport = page.getViewport({ scale: 1 });
      const container = scrollContainerRef.current;
      if (!container) return;
      const usableWidth = container.clientWidth - 950;
      const newBaseScale = usableWidth / viewport.width;
      setBaseScale(newBaseScale);
    };
    recalcBaseScale();
    window.addEventListener("resize", recalcBaseScale);
    return () => window.removeEventListener("resize", recalcBaseScale);
  }, [pdfDocument, sidebarCollapsed]);

  if (isLoading) return (
    <div className="h-screen bg-slate-950 flex items-center justify-center">
      <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
    </div>
  );

  return (
    <div className="h-screen bg-[#0a0a0a] flex overflow-hidden font-sans text-slate-200">
      <style>{staticStyles}</style>

      {/* --- SIDEBAR --- */}
      <motion.div animate={{ width: sidebarCollapsed ? 80 : 320 }} className="bg-[#161616] border-r border-[#2a2a2a] flex flex-col z-20 shadow-2xl shrink-0">
        <div className="p-6 flex items-center justify-between border-b border-[#2a2a2a]">
          {!sidebarCollapsed && <h1 className="font-bold text-xl text-white tracking-tight">ORATO<span className="text-blue-500">.AI</span></h1>}
          <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="p-2 hover:bg-[#2a2a2a] rounded-lg transition-colors"><Maximize2 size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6 flex flex-col items-center">
          {!sidebarCollapsed && (
            <>
              <div className="w-full bg-[#1f1f1f] rounded-xl p-4 border border-[#2a2a2a] text-center">
                <div className="flex items-center justify-center gap-3 mb-2">
                  {isConnected ? <Wifi className="w-4 text-green-500" /> : <WifiOff className="w-4 text-red-500" />}
                  <span className="text-sm font-medium">{isConnected ? "Connected" : "Offline"}</span>
                </div>
              </div>

              <div className="w-full bg-blue-600/10 p-4 rounded-xl border border-blue-500/20 text-center">
                <FileText className="text-blue-500 mx-auto mb-2" size={24}/>
                <span className="text-sm font-medium text-white truncate block">{docTitle}</span>
              </div>

              <div className="w-full grid grid-cols-2 gap-2">
                <button onClick={() => setZoomLevel(z => Math.min(z + 0.1, 4))} className="flex items-center justify-center gap-2 p-3 bg-[#2a2a2a] hover:bg-[#333] rounded-xl text-xs"><ZoomIn size={14}/> In</button>
                <button onClick={() => setZoomLevel(z => Math.max(z - 0.1, 0.4))} className="flex items-center justify-center gap-2 p-3 bg-[#2a2a2a] hover:bg-[#333] rounded-xl text-xs"><ZoomOut size={14}/> Out</button>
              </div>

              <div className="w-full mt-auto pt-6 space-y-4">
                <div className="bg-black/30 border border-[#2a2a2a] rounded-2xl p-4 flex flex-col items-center gap-4">
                   <button 
                    onClick={() => setIsListening(!isListening)} 
                    className={`p-5 rounded-full transition-all duration-300 shadow-xl ${isListening ? "bg-red-600 scale-110 shadow-red-500/20" : "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20"}`}
                   >
                    {isListening ? <MicOff size={24} color="white" /> : <Mic size={24} color="white" />}
                   </button>
                   <div className="text-center w-full">
                      <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">AI Session</p>
                      <p className="text-white text-xs font-medium leading-relaxed bg-[#161616] p-3 rounded-lg border border-[#2a2a2a] min-h-[60px] flex items-center justify-center text-center">
                        {transcript}
                      </p>
                   </div>
                </div>
              </div>
            </>
          )}
          
          {sidebarCollapsed && (
             <div className="flex flex-col gap-6 items-center py-4">
                <button onClick={() => setIsListening(!isListening)} className={`p-3 rounded-full ${isListening ? "bg-red-600" : "bg-blue-600"}`}>
                  {isListening ? <MicOff size={20} /> : <Mic size={20} />}
                </button>
                <div className={`w-3 h-3 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`} />
                <button onClick={() => setZoomLevel(z => Math.min(z + 0.1, 4))}><ZoomIn size={20}/></button>
                <button onClick={() => setZoomLevel(z => Math.max(z - 0.1, 0.4))}><ZoomOut size={20}/></button>
             </div>
          )}
        </div>

        <button onClick={() => navigate("/library")} className="p-6 border-t border-[#2a2a2a] hover:bg-[#1f1f1f] flex items-center gap-3 transition-colors mt-auto">
          <ArrowLeft size={20} /> {!sidebarCollapsed && <span className="font-medium">Library</span>}
        </button>
      </motion.div>

      {/* --- MAIN CONTENT AREA --- */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto bg-[#0a0a0a] custom-scrollbar">
        <div className="min-h-full w-full flex flex-col items-center py-24 px-8">
          {fileUrl && (
            <div ref={viewerRef} className="relative">
              <Document 
                file={fileUrl} 
                onLoadSuccess={(pdf) => { setNumPages(pdf.numPages); setPdfDocument(pdf); }} 
                className="flex flex-col items-center"
                loading={<Loader2 className="w-10 h-10 text-blue-500 animate-spin mt-20" />}
              >
                {Array.from(new Array(numPages), (_, i) => {
                  const pageNum = i + 1;
                  const pageBboxes = bboxes[pageNum] || [];
                  
                  return (
                    <div 
                      key={pageNum} id={`page-wrapper-${pageNum}`} data-page-number={pageNum} 
                      ref={(el) => { pageRefs.current[pageNum] = el; }} 
                      className={`pdf-page-container ${activePage === pageNum ? 'active-page' : 'opacity-100'}`}
                    >
                      {/* PDF RENDER */}
                      <Page pageNumber={pageNum} scale={scale} renderAnnotationLayer={false} className="rounded-sm overflow-hidden" customTextRenderer={(t) => t.str} loading="" />
                      
                      {/* BBOX OVERLAYS */}
                      {pageBboxes.map((box) => {
                        const left = box.bbox[0] * 100;
                        const top = box.bbox[1] * 100;
                        const width = (box.bbox[2] - box.bbox[0]) * 100;
                        const height = (box.bbox[3] - box.bbox[1]) * 100;

                        return (
                          <div
                            key={box.id}
                            ref={(el) => { bboxRefs.current[box.id] = el; }}
                            className="bbox-highlight"
                            style={{
                              left: `${left}%`,
                              top: `${top}%`,
                              width: `${width}%`,
                              height: `${height}%`,
                              backgroundColor: box.color,
                              border: box.isInspect ? '3px solid rgba(239, 68, 68, 0.8)' : '1px solid rgba(255,255,255,0.2)',
                              boxShadow: box.isInspect ? '0 0 20px rgba(239, 68, 68, 0.4)' : 'none',
                              animation: box.isInspect ? 'pulse-border 2s infinite' : 'none'
                            }}
                          />
                        );
                      })}

                      <div className="absolute top-0 -left-16 text-slate-700 font-mono text-xs font-bold pt-4">{String(pageNum).padStart(2, '0')}</div>
                    </div>
                  );
                })}
              </Document>
            </div>
          )}
        </div>
      </div>

      {/* PAGE NAVIGATOR (TOP RIGHT) */}
      <div className="fixed top-8 right-8 flex items-center gap-4 z-30">
        <div className="bg-[#1a1a1a] border border-[#2a2a2a] rounded-full px-4 py-2 flex items-center gap-3 shadow-xl backdrop-blur-md">
           <button onClick={() => handleNavigate(activePage - 1)} className="p-1 hover:text-blue-500"><ChevronLeft size={20}/></button>
           <span className="text-xs font-mono font-bold w-12 text-center text-slate-400">{activePage} / {numPages}</span>
           <button onClick={() => handleNavigate(activePage + 1)} className="p-1 hover:text-blue-500"><ChevronRight size={20}/></button>
        </div>
      </div>

      {/* IMAGE MODAL */}
      {modalImage && (
        <div onClick={() => setModalImage(null)} className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-12 cursor-pointer backdrop-blur-md transition-all">
          <motion.img initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} src={modalImage} className="max-w-[90%] max-h-[90%] rounded-xl shadow-2xl border border-white/5" />
          <div className="absolute bottom-10 text-white/40 text-xs font-mono">Click to close</div>
        </div>
      )}
    </div>
  );
}