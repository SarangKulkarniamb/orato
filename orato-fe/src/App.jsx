import React, { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";

// --- 1. WORKER CONFIGURATION ---
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// --- 2. CSS STYLES ---
const staticStyles = `
  .react-pdf__Page__textContent {
    position: absolute; top: 0; left: 0; transform-origin: 0 0; line-height: 1;
  }
  .react-pdf__Page__textContent span {
    position: absolute; white-space: pre; cursor: text; transform-origin: 0% 0%;
    color: transparent;
  }
  ::selection { background: rgba(0, 0, 255, 0.2); }
  .pdf-page-container {
    margin-bottom: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.2); position: relative;
  }
  .active-page { outline: 4px solid rgba(33, 150, 243, 0.3); }
`;

const PdfParserApp = () => {
  // --- STATE ---
  const [file, setFile] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [activePage, setActivePage] = useState(1);
  const [scale, setScale] = useState(1.5);
  const [highlights, setHighlights] = useState({});
  const [pdfDocument, setPdfDocument] = useState(null);
  
  // Changed: No list of images, just the active modal
  const [modalImage, setModalImage] = useState(null);
  
  const [log, setLog] = useState("Waiting for WebSocket...");
  const [clientId, setClientId] = useState("");

  // --- REFS ---
  const pageRefs = useRef({});
  const wsRef = useRef(null);

  // --- HELPER: IMAGE CONVERTER ---
  const convertRawDataToUrl = useCallback((imgObj) => {
    if (!imgObj) return null;

    if (imgObj.bitmap) {
      const canvas = document.createElement("canvas");
      canvas.width = imgObj.width;
      canvas.height = imgObj.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(imgObj.bitmap, 0, 0);
      return canvas.toDataURL();
    }

    const { width, height, data } = imgObj;
    if (!width || !height || !data) return null;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const imageData = ctx.createImageData(width, height);
    const size = width * height;

    let components = 0;
    if (data.length === size * 4) components = 4;
    else if (data.length === size * 3) components = 3;
    else if (data.length === size) components = 1;

    let s = 0, d = 0;
    for (let i = 0; i < size; i++) {
      if (components === 1) {
        const val = data[s++];
        imageData.data[d++] = val; imageData.data[d++] = val; imageData.data[d++] = val; imageData.data[d++] = 255;
      } else if (components === 3) {
        imageData.data[d++] = data[s++]; imageData.data[d++] = data[s++]; imageData.data[d++] = data[s++]; imageData.data[d++] = 255;
      } else {
        imageData.data[d++] = data[s++]; imageData.data[d++] = data[s++]; imageData.data[d++] = data[s++]; imageData.data[d++] = data[s++];
      }
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL();
  }, []);

  // --- API ACTIONS ---
  const navigate = useCallback(({ page }) => {
    const pageNum = parseInt(page);
    const el = pageRefs.current[pageNum];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setLog(`Mapsd to page ${pageNum}`);
      setActivePage(pageNum);
    }
  }, []);

  const color = useCallback(({ page, start, end, color = "red" }) => {
    const pageNum = parseInt(page);
    setHighlights((prev) => ({
      ...prev,
      [pageNum]: { start, end, color, type: "text-color" },
    }));
    navigate({ page: pageNum });
  }, [navigate]);

  const highlight = useCallback(({ page, start, end, color = "yellow" }) => {
    const pageNum = parseInt(page);
    setHighlights((prev) => ({
      ...prev,
      [pageNum]: { start, end, color, type: "background" },
    }));
    navigate({ page: pageNum });
  }, [navigate]);

  const zoom = useCallback(({ value, delta }) => {
    if (value) setScale(parseFloat(value));
    if (delta) setScale((prev) => Math.max(0.5, prev + parseFloat(delta)));
  }, []);

  const clear = useCallback(() => {
    setHighlights({});
    setModalImage(null); // Clear modal too
  }, []);

  // --- NEW: INSPECT IMAGE FUNCTION ---
  const inspectImage = useCallback(async ({ page, imageInd }) => {
    if (!pdfDocument) return;
    const pageNum = parseInt(page);
    const index = parseInt(imageInd);

    setLog(`Inspecting Image #${index} on Page ${pageNum}...`);

    try {
      const pdfPage = await pdfDocument.getPage(pageNum);
      const ops = await pdfPage.getOperatorList();
      
      // 1. Collect all image references on this page
      const imageRefs = [];
      for (let i = 0; i < ops.fnArray.length; i++) {
        if (
          ops.fnArray[i] === pdfjs.OPS.paintImageXObject ||
          ops.fnArray[i] === pdfjs.OPS.paintInlineImageXObject
        ) {
          imageRefs.push(ops.argsArray[i][0]);
        }
      }

      // 2. Validate Index
      if (imageRefs.length === 0) {
        setLog(`No images found on page ${pageNum}`);
        return;
      }
      if (index < 0 || index >= imageRefs.length) {
        setLog(`Image index ${index} out of bounds (Found ${imageRefs.length} images)`);
        return;
      }

      // 3. Extract Specific Image
      const imgName = imageRefs[index];
      const imgObj = await pdfPage.objs.get(imgName);
      const url = convertRawDataToUrl(imgObj);

      // 4. Show Modal
      if (url) {
        setModalImage(url);
        setLog(`Displaying Image #${index}`);
      } else {
        setLog(`Failed to decode Image #${index}`);
      }

    } catch (e) {
      console.error("Inspection error:", e);
      setLog("Error inspecting image");
    }
  }, [pdfDocument, convertRawDataToUrl]);

  // --- WEBSOCKET SETUP ---
  useEffect(() => {
    if (wsRef.current) return;

    const id = "client_" + Math.random().toString(36).substring(2, 10);
    setClientId(id);

    const ws = new WebSocket(`ws://127.0.0.1:8000/ws/${id}`);
    wsRef.current = ws;

    ws.onopen = () => setLog(`Connected as ${id}`);
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const { type, ...params } = message; 
        const data = message.data || params; 

        switch (type) {
          case "navigate": navigate(data); break;
          case "color": color(data); break;
          case "highlight": highlight(data); break;
          case "zoom": zoom(data); break;
          // REPLACED EXTRACT WITH INSPECT
          case "inspect": inspectImage(data); break; 
          case "clear": clear(); break;
          default: console.log("Unknown command:", type);
        }
      } catch (e) {
        console.error("WS Parse Error", e);
      }
    };

    ws.onclose = () => setLog("Disconnected from server");

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [navigate, color, highlight, zoom, inspectImage, clear]);

  // --- SCROLL OBSERVER ---
  useEffect(() => {
    if (!numPages) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActivePage(parseInt(entry.target.getAttribute("data-page-number")));
          }
        });
      },
      { threshold: 0.5 }
    );
    Object.values(pageRefs.current).forEach((el) => {
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [numPages]);

  // --- RENDER HELPERS ---
  const onDocumentLoadSuccess = (pdf) => {
    setNumPages(pdf.numPages);
    setPdfDocument(pdf);
  };

  const textRenderer = useCallback((textItem) => textItem.str, []);

  // --- RENDER ---
  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "sans-serif" }}>
      
      {/* Styles */}
      <style>{`
        ${staticStyles}
        ${Object.entries(highlights).map(([page, cfg]) => {
           const selector = `#page-wrapper-${page} .react-pdf__Page__textContent span:nth-child(n+${cfg.start}):nth-child(-n+${cfg.end})`;
           if (cfg.type === "text-color") {
             return `${selector} { color: ${cfg.color} !important; opacity: 1 !important; background: transparent !important; }`;
           } else {
             return `${selector} { background-color: ${cfg.color}; opacity: 0.4 !important; color: transparent; }`;
           }
        }).join("")}
      `}</style>

      {/* --- LEFT SIDEBAR --- */}
      <div style={{ width: 300, background: "#1e1e1e", color: "#fff", padding: 20, display: "flex", flexDirection: "column", borderRight: "1px solid #333" }}>
        <h3>PDF Controller</h3>
        
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, color: "#888" }}>DOCUMENT</label>
          <input 
            type="file" 
            onChange={(e) => setFile(e.target.files[0])} 
            style={{ width: "100%", marginTop: 5, fontSize: 12 }} 
          />
        </div>

        <div style={{ marginBottom: 20, fontSize: 12, color: "#aaa" }}>
          Status: <span style={{ color: wsRef.current ? "#0f0" : "#f00" }}>●</span>
          <br />
          ID: {clientId}
        </div>

        <div style={{ flex: 1, background: "#000", padding: 10, borderRadius: 4, overflowY: "auto", fontFamily: "monospace", fontSize: 11 }}>
          <div style={{ color: "#666", marginBottom: 5 }}>LOGS:</div>
          <div style={{ color: "#0f0" }}>{log}</div>
        </div>
      </div>

      {/* --- MAIN PDF VIEW --- */}
      <div style={{ flex: 1, overflowY: "auto", background: "#555", padding: 20, display: "flex", justifyContent: "center" }}>
        {file ? (
          <div style={{ maxWidth: 900, width: "100%" }}>
            <Document file={file} onLoadSuccess={onDocumentLoadSuccess}>
              {Array.from(new Array(numPages), (_, i) => {
                const pageNum = i + 1;
                return (
                  <div
                    key={pageNum}
                    id={`page-wrapper-${pageNum}`}
                    data-page-number={pageNum}
                    ref={(el) => (pageRefs.current[pageNum] = el)}
                    className={`pdf-page-container ${activePage === pageNum ? "active-page" : ""}`}
                  >
                    <div style={{ position: "absolute", left: -40, top: 0, color: "#fff", fontWeight: "bold" }}>
                      {pageNum}
                    </div>
                    
                    <Page
                      pageNumber={pageNum}
                      scale={scale}
                      renderTextLayer={true}
                      renderAnnotationLayer={false}
                      customTextRenderer={textRenderer}
                    />
                  </div>
                );
              })}
            </Document>
          </div>
        ) : (
          <div style={{ color: "#ccc", marginTop: 100 }}>
            Upload a PDF to begin session
          </div>
        )}
      </div>

      {/* --- MODAL (INSPECT MODE) --- */}
      {modalImage && (
        <div 
          onClick={() => setModalImage(null)}
          style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.9)", zIndex: 999, display: "flex", justifyContent: "center", alignItems: "center" }}
        >
          <img src={modalImage} style={{ maxWidth: "90%", maxHeight: "90%", borderRadius: "4px", boxShadow: "0 0 20px rgba(0,0,0,0.5)" }} alt="Inspected Content" />
          <div style={{ position: "absolute", bottom: 20, color: "white", background: "rgba(0,0,0,0.7)", padding: "5px 10px", borderRadius: "4px" }}>
            Click anywhere to close
          </div>
        </div>
      )}
    </div>
  );
};

export default PdfParserApp;