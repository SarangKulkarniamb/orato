import React, { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page, pdfjs } from "react-pdf";

// --- 1. CSS CONFIG ---
const staticStyles = `
  /* Base Text Layer: Default is transparent so you see the PDF image underneath */
  .react-pdf__Page__textContent { position: absolute; top: 0; left: 0; transform-origin: 0 0; line-height: 1; }
  .react-pdf__Page__textContent span { 
      position: absolute; white-space: pre; cursor: text; transform-origin: 0% 0%; 
      color: transparent; 
  }
  
  /* Selection Color */
  ::selection { background: rgba(0, 0, 255, 0.2); }
  
  /* Layout */
  .pdf-page-container { margin-bottom: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.2); position: relative; }
  .active-page { outline: 4px solid rgba(33, 150, 243, 0.3); }
  
  /* Modal Animation */
  .modal-overlay { animation: fadeIn 0.2s ease-in-out; }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
`;

// Worker Configuration
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const PdfParserApp = () => {
  // --- STATE ---
  const [file, setFile] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [activePage, setActivePage] = useState(1);
  const [scale, setScale] = useState(1.5); // Default larger zoom for clarity
  
  // Highlight State Map: { [pageNumber]: { start, end, color, type } }
  // type can be 'text-color' (ink change) or 'background' (marker highlight)
  const [highlights, setHighlights] = useState({});
  
  // Extraction State
  const [pdfDocument, setPdfDocument] = useState(null);
  const [extractedImages, setExtractedImages] = useState([]);
  const [modalImage, setModalImage] = useState(null);
  const [log, setLog] = useState("System Ready. Waiting for commands...");

  // Refs
  const pageRefs = useRef({}); 
  const observerRef = useRef(null);

  // --- 2. HELPER FUNCTIONS ---

  // Robust Image Converter (Handles Grayscale, RGB, RGBA)
  const convertRawDataToUrl = (imgObj) => {
    if (!imgObj) return null;

    // A. Bitmap (Fastest - Modern Browsers)
    if (imgObj.bitmap) {
        const canvas = document.createElement('canvas');
        canvas.width = imgObj.width; canvas.height = imgObj.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(imgObj.bitmap, 0, 0);
        return canvas.toDataURL();
    }

    const { width, height, data } = imgObj;
    if (!width || !height || !data) return null;

    // B. JPEG Direct (Fast)
    if (data.length > 2 && data[0] === 0xFF && data[1] === 0xD8) {
       return URL.createObjectURL(new Blob([data], { type: 'image/jpeg' }));
    }

    // C. Raw Pixel Parsing (Robust Fallback)
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(width, height);
    
    const size = width * height;
    let components = 0;
    if (data.length === size * 4) components = 4;      // RGBA
    else if (data.length === size * 3) components = 3; // RGB
    else if (data.length === size) components = 1;     // Grayscale

    if (components === 0) return null;

    let s = 0, d = 0;
    for (let i = 0; i < size; i++) {
        if (components === 1) { 
            const val = data[s++]; 
            imageData.data[d++] = val; imageData.data[d++] = val; imageData.data[d++] = val; imageData.data[d++] = 255;
        } else if (components === 3) { 
            imageData.data[d++] = data[s++]; imageData.data[d++] = data[s++]; imageData.data[d++] = data[s++]; imageData.data[d++] = 255;
        } else if (components === 4) { 
            imageData.data[d++] = data[s++]; imageData.data[d++] = data[s++]; imageData.data[d++] = data[s++]; imageData.data[d++] = data[s++];
        }
    }
    ctx.putImageData(imageData, 0, 0); 
    return canvas.toDataURL();
  };

  // --- 3. MODULAR CONTROLLER API ---
  // These functions are what your WebSocket would call
  const api = {
    // Navigation
    navigate: ({ page }) => {
      const pageNum = parseInt(page);
      const el = pageRefs.current[pageNum];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setLog(`Executed: Navigated to Page ${pageNum}`);
      } else {
        setLog(`Error: Page ${pageNum} not found.`);
      }
    },

    // COMMAND 1: Change Text Color (The "Ink" Replacement)
    color: ({ page, start, end, color = 'red' }) => {
      const pageNum = parseInt(page);
      setHighlights(prev => ({
        ...prev,
        [pageNum]: { start: parseInt(start), end: parseInt(end), color, type: 'text-color' }
      }));
      setLog(`Executed: Changed text color on P${pageNum} to ${color}`);
      api.navigate({ page: pageNum });
    },

    // COMMAND 2: Standard Highlight (The "Marker" Background)
    highlight: ({ page, start, end, color = 'yellow' }) => {
      const pageNum = parseInt(page);
      setHighlights(prev => ({
        ...prev,
        [pageNum]: { start: parseInt(start), end: parseInt(end), color, type: 'background' }
      }));
      setLog(`Executed: Highlighted P${pageNum} (Marker Style)`);
      api.navigate({ page: pageNum });
    },

    clear: () => {
        setHighlights({});
        setLog(`Executed: Cleared all styles.`);
    },

    zoom: ({ value, delta }) => {
      if (value) setScale(parseFloat(value));
      else if (delta) setScale(s => Math.max(0.5, s + parseFloat(delta)));
      setLog(`Executed: Zoom updated`);
    },

    extractImages: async ({ page, index }) => {
      if (!pdfDocument) return setLog("Error: No PDF loaded.");
      const pageNum = parseInt(page);
      setLog(`Processing: Scanning Page ${pageNum}...`);
      
      try {
        const pdfPage = await pdfDocument.getPage(pageNum);
        const ops = await pdfPage.getOperatorList();
        
        const imageOps = [];
        ops.fnArray.forEach((fn, idx) => {
          if (fn === pdfjs.OPS.paintImageXObject || fn === pdfjs.OPS.paintInlineImageXObject) {
            imageOps.push(ops.argsArray[idx][0]);
          }
        });

        if (imageOps.length === 0) return setLog(`Result: No images on Page ${pageNum}`);

        let targetOps = imageOps;
        if (index !== undefined && index !== null) {
            const i = parseInt(index);
            if (imageOps[i]) targetOps = [imageOps[i]];
            else return setLog(`Error: Image index ${i} out of bounds.`);
        }

        setLog(`Found ${targetOps.length} raw images. Decoding...`);
        const images = [];
        for (const imgName of targetOps) {
          try {
            const imgObj = await pdfPage.objs.get(imgName);
            const url = convertRawDataToUrl(imgObj);
            if (url) images.push(url);
          } catch (e) { console.error(e); }
        }
        
        setExtractedImages(images);
        setLog(`Success: Extracted ${images.length} images.`);
      } catch (err) {
        setLog(`Critical Error: ${err.message}`);
      }
    }
  };

  // --- 4. COMMAND PARSER ---
  const handleCommandString = (cmdString) => {
    try {
      if (!cmdString) return;
      const parts = cmdString.split(';');
      const command = parts[0].trim().toLowerCase(); 
      const params = {};
      parts.slice(1).forEach(part => {
        const [key, val] = part.split('=');
        if (key && val) params[key.trim()] = val.trim();
      });

      switch (command) {
        case 'navigate': api.navigate(params); break;
        case 'color': api.color(params); break;         // NEW: Change Ink Color
        case 'highlight': api.highlight(params); break; // OLD: Highlight Background
        case 'clear': api.clear(); break;
        case 'zoom': api.zoom(params); break;
        case 'image': case 'extract': api.extractImages(params); break;
        default: setLog(`Unknown Command: ${command}`);
      }
    } catch (e) { setLog(`Parse Error: ${e.message}`); }
  };

  // --- 5. REACT HANDLERS ---
  const onFileChange = (e) => setFile(e.target.files[0]);
  const onDocumentLoadSuccess = (pdf) => { setNumPages(pdf.numPages); setPdfDocument(pdf); };
  const makeTextRenderer = useCallback((textItem) => textItem.str, []);

  // Scroll Observer
  useEffect(() => {
    if (!numPages) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) setActivePage(parseInt(entry.target.dataset.pageNumber));
      });
    }, { threshold: 0.5 });
    Object.values(pageRefs.current).forEach(el => el && observer.observe(el));
    return () => observer.disconnect();
  }, [numPages]);

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'monospace' }}>
      
      {/* --- DYNAMIC CSS GENERATOR --- */}
      <style>{`
        ${staticStyles}
        ${Object.entries(highlights).map(([page, cfg]) => {
           // MODE 1: Text Color Change ("Ink")
           // We force the text layer to be Opaque (1) and set the color.
           // This covers the black pixels of the PDF image underneath.
           if (cfg.type === 'text-color') {
             return `
               #page-wrapper-${page} .react-pdf__Page__textContent span:nth-child(n + ${cfg.start}):nth-child(-n + ${cfg.end}) {
                  color: ${cfg.color} !important;
                  opacity: 1 !important; 
                  background-color: transparent !important;
                  text-shadow: 0 0 0.5px ${cfg.color}; /* Bold it slightly to fully cover the black underneath */
               }
             `;
           }
           // MODE 2: Standard Highlight ("Marker")
           else {
             return `
               #page-wrapper-${page} .react-pdf__Page__textContent span:nth-child(n + ${cfg.start}):nth-child(-n + ${cfg.end}) {
                  background-color: ${cfg.color};
                  opacity: 0.4 !important;
                  color: transparent;
               }
             `;
           }
        }).join('')}
      `}</style>

      {/* --- LEFT PANEL: TERMINAL --- */}
      <div style={{ width: '300px', background: '#222', color: '#0f0', padding: '20px', display: 'flex', flexDirection: 'column' }}>
        <h3>PDF Command Terminal</h3>
        
        <div style={{marginBottom: 20, borderBottom: '1px solid #444', paddingBottom: 10}}>
           <label>1. Load PDF:</label>
           <input type="file" onChange={onFileChange} style={{color: 'white', marginTop: 5}} />
        </div>

        <label>2. Command Input:</label>
        <textarea 
          id="cmdInput" 
          style={{background: '#000', color: '#0f0', border: '1px solid #0f0', height: '80px', fontFamily: 'monospace', marginBottom: 10}}
          placeholder="e.g. color;page=1;start=10;end=20;color=red"
        ></textarea>
        <button 
          onClick={() => handleCommandString(document.getElementById('cmdInput').value)}
          style={{background: '#0f0', color: '#000', border: 'none', padding: '10px', cursor: 'pointer', fontWeight: 'bold'}}
        >
          EXECUTE COMMAND
        </button>

        {/* Quick Tests */}
        <div style={{marginTop: 20, display: 'flex', flexDirection: 'column', gap: 5}}>
          <small style={{color:'white'}}>Quick Tests:</small>
          <button onClick={() => handleCommandString("color;page=1;start=0;end=50;color=red")}>
             Test: Make Text Red
          </button>
          <button onClick={() => handleCommandString("color;page=1;start=50;end=100;color=blue")}>
             Test: Make Text Blue
          </button>
          <button onClick={() => handleCommandString("highlight;page=1;start=10;end=30;color=yellow")}>
             Test: Highlight Yellow
          </button>
          <button onClick={() => handleCommandString("extract;page=1")}>Extract Images P1</button>
          <button onClick={() => handleCommandString("navigate;page=1")}>Go Page 1</button>
          <button onClick={() => handleCommandString("clear")}>Clear All</button>
        </div>

        <div style={{marginTop: 'auto', borderTop: '1px solid #444', paddingTop: 10}}>
          <small>System Log:</small>
          <div style={{color: 'white', fontSize: '12px', marginTop: 5}}>{log}</div>
        </div>
      </div>

      {/* --- RIGHT PANEL: VIEWER --- */}
      <div style={{ flex: 1, background: '#555', overflowY: 'auto', padding: '20px', position: 'relative' }}>
         
         {/* Extracted Images Overlay */}
         {extractedImages.length > 0 && (
            <div style={{position: 'fixed', right: 20, top: 20, width: 220, background: 'white', padding: 10, zIndex: 100, borderRadius: 8, boxShadow: '0 5px 15px rgba(0,0,0,0.5)'}}>
               <strong>Extracted Data ({extractedImages.length})</strong>
               <div style={{marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5, maxHeight: '50vh', overflow: 'auto'}}>
                  {extractedImages.map((src, i) => (
                    <img key={i} src={src} onClick={() => setModalImage(src)} style={{width: '100%', border: '1px solid #eee', cursor: 'pointer'}} />
                  ))}
               </div>
               <button onClick={() => setExtractedImages([])} style={{marginTop: 5, width: '100%', padding: 5}}>Clear</button>
            </div>
         )}

         {/* Fullscreen Image Modal */}
         {modalImage && (
            <div className="modal-overlay" style={{position:'fixed', top:0, left:0, width:'100%', height:'100%', background:'rgba(0,0,0,0.9)', zIndex:200, display:'flex', justifyContent:'center', alignItems:'center'}}>
                <img src={modalImage} style={{maxHeight:'90vh', maxWidth:'90vw'}} />
                <button onClick={() => setModalImage(null)} style={{position:'absolute', top: 20, right: 20, padding: '10px 20px', background: 'red', color: 'white', border: 'none'}}>Close</button>
            </div>
         )}

         {/* PDF Document */}
         {file ? (
            <Document file={file} onLoadSuccess={onDocumentLoadSuccess}>
               {Array.from(new Array(numPages), (_, i) => {
                 const pageNum = i + 1;
                 return (
                   <div 
                     key={pageNum}
                     id={`page-wrapper-${pageNum}`}
                     data-page-number={pageNum}
                     ref={el => pageRefs.current[pageNum] = el}
                     className={`pdf-page-container ${activePage === pageNum ? 'active-page' : ''}`}
                     style={{display: 'flex', justifyContent: 'center'}}
                   >
                      <span style={{position:'absolute', left: -30, color: 'white', fontWeight: 'bold'}}>{pageNum}</span>
                      <Page 
                        pageNumber={pageNum} 
                        scale={scale} 
                        customTextRenderer={makeTextRenderer}
                        renderTextLayer={true} 
                        renderAnnotationLayer={false} 
                      />
                   </div>
                 );
               })}
            </Document>
         ) : <div style={{color: 'white', textAlign: 'center', marginTop: 100}}>Waiting for PDF...</div>}
      </div>
    </div>
  );
};

export default PdfParserApp;