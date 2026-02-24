import React, { useState, useCallback, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";

// --- 1. WORKER CONFIGURATION ---
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

// --- 2. CSS STYLES ---
const staticStyles = `
  .pdf-page-container {
    margin-bottom: 20px; 
    box-shadow: 0 2px 10px rgba(0,0,0,0.3); 
    position: relative; 
    overflow: hidden; 
    transition: transform 0.6s cubic-bezier(0.25, 1, 0.5, 1); 
    background: white;
  }
  .active-page { outline: 4px solid rgba(33, 150, 243, 0.5); }
  
  .test-btn {
    background: #2563eb; color: white; border: none; padding: 10px; 
    border-radius: 6px; cursor: pointer; margin-bottom: 10px;
    font-weight: 600; text-align: left; transition: background 0.2s;
  }
  .test-btn:hover { background: #1d4ed8; }
  .test-btn.clear { background: #dc2626; }
  .test-btn.clear:hover { background: #b91c1c; }
`;

const PdfParserApp = () => {
  const [file, setFile] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [activePage, setActivePage] = useState(1);
  const [scale, setScale] = useState(1.5);
  
  // Format: { 1: { bbox: [left, top, width, height], type: "highlight", color: "yellow" } }
  const [overlays, setOverlays] = useState({});
  const [zoomTarget, setZoomTarget] = useState(null); 
  
  const [log, setLog] = useState("Ready for manual testing...");
  const pageRefs = useRef({});

  // --- API ACTIONS ---
  const navigate = useCallback(({ page }) => {
    const pageNum = parseInt(page);
    const el = pageRefs.current[pageNum];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setActivePage(pageNum);
    }
  }, []);

  const highlight = useCallback(({ page, bbox, color = "rgba(255, 255, 0, 0.4)" }) => {
    const pageNum = parseInt(page);
    setOverlays((prev) => ({
      ...prev,
      [pageNum]: { bbox, color, type: "highlight" },
    }));
    navigate({ page: pageNum });
    setLog(`Highlighted BBOX on Page ${pageNum}`);
  }, [navigate]);

  const ink = useCallback(({ page, bbox, color = "#ef4444" }) => {
    const pageNum = parseInt(page);
    setOverlays((prev) => ({
      ...prev,
      [pageNum]: { bbox, color, type: "ink" },
    }));
    navigate({ page: pageNum });
    setLog(`Drawn ink box on Page ${pageNum}`);
  }, [navigate]);

  // FIXED ZOOM CALCULATION FOR [left, top, width, height]
  const smartZoom = useCallback(({ page, bbox }) => {
    const pageNum = parseInt(page);
    
    // Center X = left + (width / 2)
    const centerX = (bbox[0] + (bbox[2] / 2)) * 100;
    // Center Y = top + (height / 2)
    const centerY = (bbox[1] + (bbox[3] / 2)) * 100;

    setZoomTarget({ page: pageNum, origin: `${centerX}% ${centerY}%` });
    navigate({ page: pageNum });
    setLog(`Smart Zoomed to (${centerX.toFixed(1)}%, ${centerY.toFixed(1)}%) on Page ${pageNum}`);
  }, [navigate]);

  const clear = useCallback(() => {
    setOverlays({});
    setZoomTarget(null);
    setLog("Cleared all overlays and zooms.");
  }, []);

  const onDocumentLoadSuccess = (pdf) => {
    setNumPages(pdf.numPages);
  };

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "sans-serif" }}>
      <style>{staticStyles}</style>

      {/* --- LEFT SIDEBAR (TEST PANEL) --- */}
      <div style={{ width: 300, background: "#1e1e1e", color: "#fff", padding: 20, display: "flex", flexDirection: "column", borderRight: "1px solid #333" }}>
        <h3>Test Panel</h3>
        <input type="file" onChange={(e) => setFile(e.target.files[0])} style={{ margin: "20px 0", color: "#aaa" }} />
        
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <small style={{ color: "#888", marginBottom: 10, display: "block" }}>MANUAL BBOX CONTROLS</small>
          
          <button 
            className="test-btn" 
            onClick={() => highlight({ page: 1, bbox: [0.125, 0.1175, 0.625, 0.027] })}
          >
            1. Highlight Area
            <div style={{fontSize: 10, fontWeight: "normal", opacity: 0.8}}>[left, top, width, height]</div>
          </button>

          <button 
            className="test-btn" 
            onClick={() => ink({ page: 1, bbox: [0.2885, 0.2233, 0.1344, 0.4667] })}
          >
            2. Box Diagram
            <div style={{fontSize: 10, fontWeight: "normal", opacity: 0.8}}>[left, top, width, height]</div>
          </button>

          <button 
            className="test-btn" 
            onClick={() => smartZoom({ page: 1, bbox: [0.2885, 0.2233, 0.1344, 0.4667] })}
          >
            3. Smart Zoom
            <div style={{fontSize: 10, fontWeight: "normal", opacity: 0.8}}>Zooms scale(2.5) at BBOX center</div>
          </button>

          <button className="test-btn clear" onClick={clear} style={{ marginTop: "auto" }}>
            ❌ Clear All Effects
          </button>
        </div>

        <div style={{ background: "#000", padding: 10, borderRadius: 4, fontFamily: "monospace", fontSize: 11, color: "#0f0", marginTop: 20 }}>
          <div style={{color: "#666", marginBottom: 5}}>LOGS:</div>
          {log}
        </div>
      </div>

      {/* --- MAIN PDF VIEW --- */}
      <div style={{ flex: 1, overflowY: "auto", background: "#333", padding: 40, display: "flex", justifyContent: "center" }}>
        {file ? (
          <div style={{ maxWidth: 900, width: "100%" }}>
            <Document file={file} onLoadSuccess={onDocumentLoadSuccess}>
              {Array.from(new Array(numPages), (_, i) => {
                const pageNum = i + 1;
                const overlay = overlays[pageNum];
                const isZoomed = zoomTarget?.page === pageNum;

                return (
                  <div
                    key={pageNum}
                    id={`page-wrapper-${pageNum}`}
                    data-page-number={pageNum}
                    ref={(el) => (pageRefs.current[pageNum] = el)}
                    className={`pdf-page-container ${activePage === pageNum ? "active-page" : ""}`}
                    style={{
                      transform: isZoomed ? "scale(2.5)" : "scale(1)",
                      transformOrigin: isZoomed ? zoomTarget.origin : "center center",
                      zIndex: isZoomed ? 50 : 1,
                    }}
                  >
                    <Page
                      pageNumber={pageNum}
                      scale={scale}
                      renderTextLayer={false} 
                      renderAnnotationLayer={false}
                    />

                    {/* FIXED OVERLAY MAGIC FOR [left, top, width, height] */}
                    {overlay && (
                      <div
                        style={{
                          position: "absolute",
                          left: `${overlay.bbox[0] * 100}%`,
                          top: `${overlay.bbox[1] * 100}%`,
                          width: `${overlay.bbox[2] * 100}%`, // Just use width directly
                          height: `${overlay.bbox[3] * 100}%`, // Just use height directly
                          backgroundColor: overlay.type === "highlight" ? overlay.color : "transparent",
                          border: overlay.type === "ink" ? `3px solid ${overlay.color}` : "none",
                          borderRadius: "4px",
                          pointerEvents: "none", 
                          mixBlendMode: overlay.type === "highlight" ? "multiply" : "normal", 
                          transition: "all 0.3s ease"
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </Document>
          </div>
        ) : (
          <div style={{ color: "#aaa", marginTop: 100, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{fontSize: 40, marginBottom: 10}}>📄</div>
            <h2>Upload a PDF to Test BBOX</h2>
            <p style={{fontSize: 14}}>The buttons on the left will apply overlays to Page 1.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PdfParserApp;