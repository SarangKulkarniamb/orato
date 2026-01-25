import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router";
import { Mic, MicOff, ArrowLeft, Maximize2, Upload, Wifi, WifiOff, FileText } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Document, Page, pdfjs } from "react-pdf";

// --- 1. WORKER CONFIG ---
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// --- 2. CSS STYLES (Dynamic Highlighting) ---
const staticStyles = `
  .react-pdf__Page__textContent { position: absolute; top: 0; left: 0; transform-origin: 0 0; line-height: 1; }
  .react-pdf__Page__textContent span { position: absolute; white-space: pre; cursor: text; transform-origin: 0% 0%; color: transparent; }
  ::selection { background: rgba(59, 130, 246, 0.3); }
  .pdf-page-container { margin-bottom: 20px; position: relative; transition: all 0.3s ease; }
  .active-page { outline: 4px solid rgba(59, 130, 246, 0.5); border-radius: 4px; }
`;

export function Presentation() {
  const navigate = useNavigate();
  const { id } = useParams();

  // --- UI STATE ---
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("Waiting for commands...");

  // --- PDF & WEBSOCKET STATE ---
  const [file, setFile] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [activePage, setActivePage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [highlights, setHighlights] = useState({});
  const [pdfDocument, setPdfDocument] = useState(null);
  const [modalImage, setModalImage] = useState(null);
  
  // Connection State
  const [log, setLog] = useState("Initializing...");
  const [clientId, setClientId] = useState("");
  const [isConnected, setIsConnected] = useState(false);

  // Refs
  const pageRefs = useRef({});
  const wsRef = useRef(null);

  // --- AUTH CHECK ---
  useEffect(() => {
    const userStr = localStorage.getItem("orato_user");
    if (!userStr) navigate("/auth");
  }, [navigate]);

  // --- HELPER: IMAGE CONVERTER ---
  const convertRawDataToUrl = useCallback((imgObj) => {
    if (!imgObj) return null;
    if (imgObj.bitmap) {
      const canvas = document.createElement("canvas");
      canvas.width = imgObj.width; canvas.height = imgObj.height;
      canvas.getContext("2d").drawImage(imgObj.bitmap, 0, 0);
      return canvas.toDataURL();
    }
    const { width, height, data } = imgObj;
    if (!width || !height || !data) return null;
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d");
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

  // --- API ACTIONS ---
  const navigateToPage = useCallback(({ page }) => {
    const pageNum = parseInt(page);
    const el = pageRefs.current[pageNum];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setActivePage(pageNum);
      setTranscript(`Mapsd to Page ${pageNum}`);
    }
  }, []);

  const color = useCallback(({ page, start, end, color = "red" }) => {
    const pageNum = parseInt(page);
    setHighlights((prev) => ({ ...prev, [pageNum]: { start, end, color, type: "text-color" } }));
    navigateToPage({ page: pageNum });
    setTranscript(`Inked text on Page ${pageNum}`);
  }, [navigateToPage]);

  const highlight = useCallback(({ page, start, end, color = "yellow" }) => {
    const pageNum = parseInt(page);
    setHighlights((prev) => ({ ...prev, [pageNum]: { start, end, color, type: "background" } }));
    navigateToPage({ page: pageNum });
    setTranscript(`Highlighted text on Page ${pageNum}`);
  }, [navigateToPage]);

  const zoom = useCallback(({ value, delta }) => {
    if (value) setScale(parseFloat(value));
    if (delta) setScale((prev) => Math.max(0.5, prev + parseFloat(delta)));
    setTranscript("Zoom updated");
  }, []);

  const clear = useCallback(() => {
    setHighlights({});
    setModalImage(null);
    setTranscript("Cleared all annotations");
  }, []);

  const inspectImage = useCallback(async ({ page, imageInd }) => {
    if (!pdfDocument) return;
    const pageNum = parseInt(page);
    const index = parseInt(imageInd);
    setTranscript(`Inspecting Image ${index} on Page ${pageNum}...`);

    try {
      const pdfPage = await pdfDocument.getPage(pageNum);
      const ops = await pdfPage.getOperatorList();
      const imageRefs = [];
      for (let i = 0; i < ops.fnArray.length; i++) {
        if (ops.fnArray[i] === pdfjs.OPS.paintImageXObject || ops.fnArray[i] === pdfjs.OPS.paintInlineImageXObject) {
          imageRefs.push(ops.argsArray[i][0]);
        }
      }
      if (index >= 0 && index < imageRefs.length) {
        const imgObj = await pdfPage.objs.get(imageRefs[index]);
        const url = convertRawDataToUrl(imgObj);
        if (url) setModalImage(url);
      }
    } catch (e) { console.error(e); }
  }, [pdfDocument, convertRawDataToUrl]);

  // --- WEBSOCKET CONNECTION ---
  useEffect(() => {
    if (wsRef.current) return;
    const id = "client_" + Math.random().toString(36).substring(2, 6);
    setClientId(id);

    const ws = new WebSocket(`ws://127.0.0.1:8000/ws/${id}`);
    wsRef.current = ws;

    ws.onopen = () => { setIsConnected(true); setLog(`Connected: ${id}`); };
    ws.onclose = () => { setIsConnected(false); setLog("Disconnected"); };
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const { type, ...params } = message; 
        const data = message.data || params; 

        switch (type) {
          case "navigate": navigateToPage(data); break;
          case "color": color(data); break;
          case "highlight": highlight(data); break;
          case "zoom": zoom(data); break;
          case "inspect": inspectImage(data); break;
          case "clear": clear(); break;
          default: console.log("Unknown:", type);
        }
      } catch (e) { console.error("WS Error", e); }
    };

    return () => { ws.close(); wsRef.current = null; };
  }, [navigateToPage, color, highlight, zoom, inspectImage, clear]);

  // --- SCROLL OBSERVER ---
  useEffect(() => {
    if (!numPages) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) setActivePage(parseInt(entry.target.getAttribute("data-page-number")));
      });
    }, { threshold: 0.5 });
    Object.values(pageRefs.current).forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [numPages]);

  // --- RENDER HELPERS ---
  const onDocumentLoadSuccess = (pdf) => { setNumPages(pdf.numPages); setPdfDocument(pdf); };
  const textRenderer = useCallback((textItem) => textItem.str, []);

  const toggleListening = () => {
    setIsListening(!isListening);
    setTranscript(isListening ? "Microphone off" : "Listening for server commands...");
  };

  return (
    <div className="h-screen bg-[#121212] flex overflow-hidden font-sans text-slate-200">
      
      {/* DYNAMIC CSS INJECTION */}
      <style>{`
        ${staticStyles}
        ${Object.entries(highlights).map(([page, cfg]) => {
           const selector = `#page-wrapper-${page} .react-pdf__Page__textContent span:nth-child(n+${cfg.start}):nth-child(-n+${cfg.end})`;
           if (cfg.type === "text-color") return `${selector} { color: ${cfg.color} !important; opacity: 1 !important; background: transparent !important; }`;
           return `${selector} { background-color: ${cfg.color}; opacity: 0.4 !important; color: transparent; }`;
        }).join("")}
      `}</style>

      {/* --- SIDEBAR --- */}
      <motion.div
        initial={false}
        animate={{ width: sidebarCollapsed ? 80 : 320 }}
        className="bg-[#1a1a1a] border-r border-[#333] flex flex-col z-20 shadow-xl"
      >
        {/* Sidebar Header */}
        <div className="p-5 flex items-center justify-between border-b border-[#333]">
           {!sidebarCollapsed && <h1 className="font-bold text-xl tracking-tight text-white">ORATO<span className="text-blue-500">.AI</span></h1>}
           <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="p-2 hover:bg-[#333] rounded-lg transition-colors">
              <Maximize2 className="w-5 h-5 text-slate-400" />
           </button>
        </div>

        {/* Sidebar Content (Hidden when collapsed) */}
        {!sidebarCollapsed && (
            <div className="flex-1 overflow-y-auto p-5 space-y-6">
                
                {/* 1. Connection Status */}
                <div className="bg-[#252525] rounded-xl p-4 border border-[#333]">
                    <div className="flex items-center gap-3 mb-2">
                        {isConnected ? <Wifi className="w-4 h-4 text-green-500" /> : <WifiOff className="w-4 h-4 text-red-500" />}
                        <span className="text-sm font-medium text-slate-300">{isConnected ? "System Online" : "Disconnected"}</span>
                    </div>
                    <div className="text-xs font-mono text-slate-500 bg-[#151515] p-2 rounded border border-[#333] select-all">
                        ID: {clientId}
                    </div>
                </div>

                {/* 2. File Upload */}
                <div>
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 block">Document Source</label>
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-[#444] rounded-xl cursor-pointer hover:border-blue-500 hover:bg-[#252525] transition-all group">
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                            <Upload className="w-8 h-8 text-slate-500 group-hover:text-blue-400 mb-2" />
                            <p className="text-xs text-slate-400 group-hover:text-slate-200">Click to upload PDF</p>
                        </div>
                        <input type="file" className="hidden" onChange={(e) => setFile(e.target.files[0])} accept="application/pdf" />
                    </label>
                    {file && <div className="mt-2 flex items-center gap-2 text-xs text-green-400"><FileText className="w-3 h-3"/> {file.name}</div>}
                </div>

                {/* 3. Live Logs */}
                <div className="flex-1 flex flex-col min-h-[200px]">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">System Log</label>
                    <div className="flex-1 bg-black/50 rounded-lg p-3 font-mono text-[10px] text-green-400 overflow-y-auto border border-[#333]">
                        {log}
                    </div>
                </div>
            </div>
        )}

        {/* Back Button */}
        <button onClick={() => navigate("/library")} className="p-5 border-t border-[#333] text-slate-400 hover:text-white hover:bg-[#252525] transition-all flex items-center gap-3">
             <ArrowLeft className="w-5 h-5" />
             {!sidebarCollapsed && <span>Back to Library</span>}
        </button>
      </motion.div>

      {/* --- MAIN PRESENTATION AREA --- */}
      <div className="flex-1 flex flex-col items-center justify-center bg-[#121212] relative overflow-hidden">
        
        {/* PDF Viewer Container */}
        <div className="w-full h-full overflow-y-auto flex justify-center p-8 custom-scrollbar">
            {file ? (
                <div className="max-w-4xl w-full">
                    <Document file={file} onLoadSuccess={onDocumentLoadSuccess} className="flex flex-col items-center gap-6">
                        {Array.from(new Array(numPages), (_, i) => {
                            const pageNum = i + 1;
                            return (
                                <div 
                                    key={pageNum} 
                                    id={`page-wrapper-${pageNum}`}
                                    data-page-number={pageNum}
                                    ref={(el) => (pageRefs.current[pageNum] = el)}
                                    className={`pdf-page-container w-full transition-opacity duration-300 ${activePage === pageNum ? 'opacity-100 active-page shadow-2xl' : 'opacity-60'}`}
                                >
                                    <Page 
                                        pageNumber={pageNum} 
                                        scale={scale} 
                                        renderTextLayer={true} 
                                        renderAnnotationLayer={false} 
                                        customTextRenderer={textRenderer}
                                        className="shadow-xl"
                                    />
                                    <div className="absolute top-4 -left-12 text-slate-500 font-mono text-xs font-bold">{pageNum}</div>
                                </div>
                            );
                        })}
                    </Document>
                </div>
            ) : (
                <div className="text-center space-y-4 opacity-50">
                    <div className="w-24 h-24 bg-[#222] rounded-full flex items-center justify-center mx-auto mb-4">
                        <Upload className="w-10 h-10 text-slate-500" />
                    </div>
                    <h2 className="text-xl font-medium text-slate-300">No Presentation Loaded</h2>
                    <p className="text-sm text-slate-500">Upload a PDF from the sidebar to begin.</p>
                </div>
            )}
        </div>

        {/* --- FLOATING COMMAND CENTER --- */}
        <AnimatePresence>
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 z-50"
          >
            <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 rounded-full px-6 py-4 shadow-2xl flex items-center gap-4 min-w-[400px]">
              
              {/* Status Indicator */}
              <motion.div
                animate={{ backgroundColor: isListening ? "#ef4444" : isConnected ? "#22c55e" : "#64748b" }}
                className="w-3 h-3 rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)]"
              />

              {/* Transcript / Log Display */}
              <div className="flex-1 min-w-0 flex flex-col">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Active Command</span>
                <motion.p
                  key={transcript}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-white text-sm font-medium truncate"
                >
                  {transcript}
                </motion.p>
              </div>

              {/* Mic Toggle (Simulated) */}
              <button
                onClick={toggleListening}
                className={`p-3 rounded-full transition-all ${isListening ? "bg-red-600 hover:bg-red-700 shadow-red-900/20" : "bg-blue-600 hover:bg-blue-700 shadow-blue-900/20"} shadow-lg`}
              >
                {isListening ? <MicOff className="w-5 h-5 text-white" /> : <Mic className="w-5 h-5 text-white" />}
              </button>
            </div>
          </motion.div>
        </AnimatePresence>

        {/* --- IMAGE INSPECTION MODAL --- */}
        {modalImage && (
            <div 
                onClick={() => setModalImage(null)}
                className="fixed inset-0 bg-black/90 z-[100] flex items-center justify-center p-10 cursor-pointer backdrop-blur-sm animate-in fade-in duration-200"
            >
                <img src={modalImage} className="max-w-full max-h-full rounded-lg shadow-2xl border border-[#333]" alt="Inspected" />
                <div className="absolute bottom-10 text-white/50 text-sm bg-black/50 px-4 py-2 rounded-full">Click anywhere to close</div>
            </div>
        )}

      </div>
    </div>
  );
}