import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Mic, MicOff, ArrowLeft, Maximize2, Wifi, WifiOff, FileText, Loader2, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Download, Globe2, ExternalLink, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Document, Page, pdfjs } from "react-pdf";
import useAuthStore from "../store/authStore";
import api from "../api/api";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const staticStyles = `
  .react-pdf__Page__textContent { position: absolute; top: 0; left: 0; transform-origin: 0 0; line-height: 1; }
  .react-pdf__Page__textContent span { position: absolute; white-space: pre; color: transparent; }
  ::selection { background: rgba(139, 92, 246, 0.3); } /* Violet selection */
  .pdf-page-container { margin-bottom: 60px; position: relative; transition: transform 0.4s ease; }
  .active-page { outline: 2px solid rgba(139, 92, 246, 0.5); border-radius: 4px; }
  .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
  .custom-scrollbar::-webkit-scrollbar-track { background: #05070e; }
  .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e243b; border-radius: 10px; }
  
  @keyframes pulse-border {
    0% { box-shadow: 0 0 0 0 var(--shadow-color); }
    70% { box-shadow: 0 0 0 15px rgba(0,0,0,0); }
    100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
  }
  .bbox-highlight {
    position: absolute;
    border-radius: 8px;
    pointer-events: none;
    z-index: 10;
    overflow: hidden;
    isolation: isolate;
    transform-origin: left center;
    will-change: transform, opacity;
  }
  .bbox-highlight-fill {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(90deg, color-mix(in srgb, var(--bg-color) 68%, white 32%) 0%, var(--bg-color) 56%, color-mix(in srgb, var(--bg-color) 88%, black 12%) 100%);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--border-color) 42%, white 58%);
    transform-origin: left center;
    mix-blend-mode: screen;
  }
  .bbox-highlight-outline {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    border: 2px solid var(--border-color);
    animation: pulse-border 1.9s ease-out infinite;
    animation-delay: var(--pulse-delay, 0s);
  }
  .bbox-highlight.is-preview {
    border-style: dashed;
    opacity: 0.92;
  }
  .bbox-highlight.is-preview .bbox-highlight-outline {
    border-style: dashed;
  }
`;

type BboxOverlay = {
  id: string;
  bbox: number[]; 
  bgColor: string;
  borderColor: string;
  shadowColor: string;
  scanColor: string;
  preview?: boolean;
};

type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
  previewText?: string;
  displayHost?: string;
  provider?: string;
};

type WebSearchState = {
  provider: string;
  query: string;
  results: WebSearchResult[];
  selected: WebSearchResult | null;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getBboxArea = (bbox: number[]) => Math.max(0, bbox[2] ?? 0) * Math.max(0, bbox[3] ?? 0);

const getBboxOverlap = (a: number[], b: number[]) => {
  const ax2 = (a[0] ?? 0) + (a[2] ?? 0);
  const ay2 = (a[1] ?? 0) + (a[3] ?? 0);
  const bx2 = (b[0] ?? 0) + (b[2] ?? 0);
  const by2 = (b[1] ?? 0) + (b[3] ?? 0);

  const intersectionWidth = Math.max(0, Math.min(ax2, bx2) - Math.max(a[0] ?? 0, b[0] ?? 0));
  const intersectionHeight = Math.max(0, Math.min(ay2, by2) - Math.max(a[1] ?? 0, b[1] ?? 0));
  const intersectionArea = intersectionWidth * intersectionHeight;
  const smallerArea = Math.max(0.00001, Math.min(getBboxArea(a), getBboxArea(b)));

  return intersectionArea / smallerArea;
};

const areBboxesEquivalent = (a: number[], b: number[]) => {
  if (a.length !== 4 || b.length !== 4) return false;

  const positionalDrift = Math.abs((a[0] ?? 0) - (b[0] ?? 0)) + Math.abs((a[1] ?? 0) - (b[1] ?? 0));
  const sizeDrift = Math.abs((a[2] ?? 0) - (b[2] ?? 0)) + Math.abs((a[3] ?? 0) - (b[3] ?? 0));

  return getBboxOverlap(a, b) >= 0.82 || (positionalDrift <= 0.02 && sizeDrift <= 0.03);
};

const getBboxAnimationConfig = (bbox: number[], preview = false) => {
  const width = bbox[2] ?? 0;
  const height = bbox[3] ?? 0;
  const bboxSpan = clamp(width + (height * 0.45), 0.08, 0.9);
  const revealDuration = clamp(
    0.42 + (bboxSpan * 1.1),
    preview ? 0.28 : 0.5,
    preview ? 0.78 : 1.4,
  );

  return {
    revealDuration,
    outlineDelay: clamp(revealDuration * 0.16, 0.05, 0.24),
    pulseDelay: revealDuration * 0.42,
    fillOpacity: preview ? 0.56 : 0.86,
    outlineOpacity: preview ? 0.82 : 1,
    fillInset: preview ? 1 : 1.5,
  };
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
  const activePageRef = useRef(activePage); 
  
  const [baseScale, setBaseScale] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(1);
  const scale = baseScale * zoomLevel;
  
  const [bboxes, setBboxes] = useState<Record<number, BboxOverlay[]>>({});
  const [modalImage, setModalImage] = useState<string | null>(null);
  
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [clientId, setClientId] = useState("");
  const [isExportingSummary, setIsExportingSummary] = useState(false);
  const [viewerMode, setViewerMode] = useState<"document" | "search">("document");
  const [webSearchState, setWebSearchState] = useState<WebSearchState | null>(null);
  const [isWebSearching, setIsWebSearching] = useState(false);
  
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const bboxRefs = useRef<Record<string, HTMLDivElement | null>>({});
  
  const wsRef = useRef<WebSocket | null>(null);
  const wsReconnectTimerRef = useRef<number | null>(null);
  const wsReconnectAttemptsRef = useRef(0);
  const sttWsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  // --- NEW: Tracking state for Sticky Highlights & Duplicates ---
  const stickyIntentRef = useRef<string | null>(null);
  const activeBboxesRef = useRef<Record<number, number[][]>>({});
  const previewBboxesRef = useRef<Record<number, number[] | null>>({});
  const viewerModeRef = useRef<"document" | "search">(viewerMode);
  const webSearchStateRef = useRef<WebSearchState | null>(webSearchState);

  useEffect(() => { activePageRef.current = activePage; }, [activePage]);
  useEffect(() => { viewerModeRef.current = viewerMode; }, [viewerMode]);
  useEffect(() => { webSearchStateRef.current = webSearchState; }, [webSearchState]);

  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "state_update", activePage: activePage, viewerMode }));
    }
  }, [activePage, isConnected, viewerMode]);

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

  const resolvePdfImageObject = useCallback(async (pdfPage: any, imageRef: any, attempts = 0): Promise<any> => {
    if (!pdfPage?.objs) return null;

    try {
      const existing = pdfPage.objs.get(imageRef);
      if (existing) {
        return existing;
      }
    } catch (_err) {}

    if (attempts >= 10) {
      return null;
    }

    return new Promise((resolve) => {
      let settled = false;

      try {
        pdfPage.objs.get(imageRef, (obj: any) => {
          settled = true;
          resolve(obj ?? null);
        });
      } catch (_err) {}

      window.setTimeout(async () => {
        if (settled) return;
        const retried = await resolvePdfImageObject(pdfPage, imageRef, attempts + 1);
        resolve(retried);
      }, 80);
    });
  }, []);

  const extractAndShowImage = useCallback(async (pageNum: number, index: number, attempts = 0) => {
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
        const imgObj = await resolvePdfImageObject(pdfPage, imageRefs[index]);
        const url = convertRawDataToUrl(imgObj);
        if (url) {
          setModalImage(url);
          return;
        }
      }

      if (attempts < 8) {
        window.setTimeout(() => {
          extractAndShowImage(pageNum, index, attempts + 1);
        }, 120);
      }
    } catch (e) { console.error("Error extracting image:", e); }
  }, [pdfDocument, convertRawDataToUrl, resolvePdfImageObject]);

  const handleNavigate = useCallback((slide: number) => {
    const pageNum = Math.min(Math.max(1, slide), numPages || 1);
    if (pageNum === activePageRef.current) {
      setActivePage(pageNum);
      return;
    }
    const el = pageRefs.current[pageNum];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setActivePage(pageNum);
    }
  }, [numPages]);

  const handleHighlightLegacy = useCallback((slide: number, bbox: number[], type = "text") => {
    if (bbox.every(v => v === 0)) return null;

    // 🔥 PREVENT DUPLICATES 🔥
    const currentBoxesOnSlide = activeBboxesRef.current[slide] || [];
    if (currentBoxesOnSlide.some((existingBox) => areBboxesEquivalent(existingBox, bbox))) {
      return null; // Ignore if already highlighted
    }
    
    activeBboxesRef.current[slide] = [...currentBoxesOnSlide, bbox];

    const overlayId = `bbox_${slide}_${Date.now()}`;
    
    const bgColor = type === "image" ? "rgba(139, 92, 246, 0.2)" : "rgba(235, 238, 34, 0.44)";
    const borderColor = type === "image" ? "rgba(139, 92, 246, 0.8)" : "rgba(238, 173, 34, 0.66)";
    const shadowColor = type === "image" ? "rgba(139, 92, 246, 0.4)" : "rgba(238, 173, 34, 0.64)";
    
    setBboxes(prev => {
      const pageBoxes = prev[slide] || [];
      return { ...prev, [slide]: [...pageBoxes, { id: overlayId, bbox, bgColor, borderColor, shadowColor }] };
    });
    
    handleNavigate(slide);
    return overlayId; 
  }, [handleNavigate]);

  const handleHighlight = useCallback((
    slide: number,
    bbox: number[],
    type = "text",
    options?: { preview?: boolean; navigate?: boolean }
  ) => {
    if (bbox.every(v => v === 0)) return null;

    const isPreview = options?.preview ?? false;
    const shouldNavigate = options?.navigate ?? (slide !== activePageRef.current);
    const currentPreview = previewBboxesRef.current[slide];
    const currentBoxesOnSlide = activeBboxesRef.current[slide] || [];
    const matchesPreview = currentPreview ? areBboxesEquivalent(currentPreview, bbox) : false;
    const matchesActive = currentBoxesOnSlide.some((existingBox) => areBboxesEquivalent(existingBox, bbox));

    if (isPreview) {
      if (matchesActive) {
        setBboxes(prev => ({
          ...prev,
          [slide]: (prev[slide] || []).filter((box) => !box.preview),
        }));
        previewBboxesRef.current[slide] = null;
        return `preview_${slide}`;
      }
      if (matchesPreview) {
        return `preview_${slide}`;
      }
      previewBboxesRef.current[slide] = bbox;
    } else {
      if (matchesPreview) {
        previewBboxesRef.current[slide] = null;
      }
      if (matchesActive) {
        setBboxes(prev => ({
          ...prev,
          [slide]: (prev[slide] || []).filter((box) => !box.preview),
        }));
        return null;
      }
      activeBboxesRef.current[slide] = [...currentBoxesOnSlide, bbox];
    }

    const overlayId = isPreview ? `preview_${slide}_${Date.now()}` : `bbox_${slide}_${Date.now()}`;
    const bgColor = type === "image" ? "rgba(139, 92, 246, 0.2)" : "rgba(235, 238, 34, 0.44)";
    const borderColor = type === "image" ? "rgba(139, 92, 246, 0.8)" : "rgba(238, 173, 34, 0.66)";
    const shadowColor = type === "image" ? "rgba(139, 92, 246, 0.4)" : "rgba(238, 173, 34, 0.64)";
    const scanColor = type === "image" ? "rgba(255, 255, 255, 0.72)" : "rgba(255, 247, 179, 0.9)";

    setBboxes(prev => {
      const persistentBoxes = (prev[slide] || []).filter((box) => !box.preview);
      if (isPreview) {
        return {
          ...prev,
          [slide]: [...persistentBoxes, { id: overlayId, bbox, bgColor, borderColor, shadowColor, scanColor, preview: true }],
        };
      }
      return {
        ...prev,
        [slide]: [...persistentBoxes, { id: overlayId, bbox, bgColor, borderColor, shadowColor, scanColor, preview: false }],
      };
    });

    if (shouldNavigate) {
      handleNavigate(slide);
    }
    return overlayId;
  }, [handleNavigate]);

  const centerBboxInView = useCallback((slide: number, bbox: number[], attempts = 0) => {
    const container = scrollContainerRef.current;
    const pageEl = pageRefs.current[slide];
    if (!container || !pageEl) {
      if (attempts < 18) {
        setTimeout(() => centerBboxInView(slide, bbox, attempts + 1), 80);
      }
      return;
    }

    const pageRect = pageEl.getBoundingClientRect();
    if (pageRect.width < 10 || pageRect.height < 10) {
      if (attempts < 18) {
        setTimeout(() => centerBboxInView(slide, bbox, attempts + 1), 80);
      }
      return;
    }

    const [x = 0, y = 0, w = 0, h = 0] = bbox;
    const bboxCenterX = x + (w / 2);
    const bboxCenterY = y + (h / 2);
    const downwardBias = Math.min(container.clientHeight * 0.12, 96);

    const targetLeft = pageEl.offsetLeft + (pageEl.clientWidth * bboxCenterX) - (container.clientWidth / 2);
    const targetTop = pageEl.offsetTop + (pageEl.clientHeight * bboxCenterY) - (container.clientHeight / 2) + downwardBias;

    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);

    container.scrollTo({
      left: clamp(targetLeft, 0, maxScrollLeft),
      top: clamp(targetTop, 0, maxScrollTop),
      behavior: attempts === 0 ? "smooth" : "auto",
    });

    if (attempts < 3) {
      setTimeout(() => centerBboxInView(slide, bbox, attempts + 1), 120);
    }
  }, []);

  const handleZoom = useCallback((slide: number, bbox: number[], type = "image") => {
    setZoomLevel(2.5);
    handleHighlight(slide, bbox, type, { navigate: true });
    setTimeout(() => centerBboxInView(slide, bbox), 220);
  }, [centerBboxInView, handleHighlight]);

  const handleInspect = useCallback((slide: number, bbox: number[], imageInd?: number) => {
    handleNavigate(slide);
    if (imageInd !== undefined && imageInd !== null) {
      setTimeout(() => {
        extractAndShowImage(slide, imageInd);
      }, 120);
    }
  }, [handleNavigate, extractAndShowImage]);

  const handleSelectSearchResult = useCallback((result: WebSearchResult) => {
    setWebSearchState((prev) => prev ? { ...prev, selected: result } : prev);
    setViewerMode("search");
  }, []);

  const handleSearchResultStep = useCallback((direction: 1 | -1) => {
    const state = webSearchStateRef.current;
    if (!state?.results?.length) {
      setTranscript("No search results to browse");
      return;
    }

    const currentIndex = Math.max(
      0,
      state.results.findIndex((result) => result.url === state.selected?.url),
    );
    const nextIndex = (currentIndex + direction + state.results.length) % state.results.length;
    const nextResult = state.results[nextIndex];
    setWebSearchState({ ...state, selected: nextResult });
    setViewerMode("search");
    setTranscript(`Selected result ${nextIndex + 1}: ${nextResult.title}`);
  }, []);

  const handleOpenSelectedSearchResult = useCallback(() => {
    const selected = webSearchStateRef.current?.selected;
    if (!selected?.url) {
      setTranscript("No search result selected to open");
      return;
    }
    const opened = window.open(selected.url, "_blank", "noopener,noreferrer");
    if (!opened) {
      const anchor = document.createElement("a");
      anchor.href = selected.url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    }
    setTranscript(`Opened ${selected.title}`);
  }, []);

  const handleWebSearch = useCallback(async (rawQuery: string) => {
    if (!id) return;

    try {
      setIsWebSearching(true);
      setViewerMode("search");
      setTranscript("Searching the web...");

      const response = await api.post(`/auth/web-search/${id}`, { query: rawQuery });
      const payload = response.data as WebSearchState;
      setWebSearchState({
        provider: payload.provider || "web",
        query: payload.query || rawQuery,
        results: payload.results || [],
        selected: payload.selected || (payload.results?.[0] ?? null),
      });

      if (payload.results?.length) {
        setTranscript(`Web search ready for "${payload.query}"`);
      } else {
        setTranscript(`No web results found for "${payload.query || rawQuery}"`);
      }
    } catch (_err) {
      setTranscript("Web search failed");
    } finally {
      setIsWebSearching(false);
    }
  }, [id]);

  const handleExportSummary = useCallback(async () => {
    if (!id || isExportingSummary) return;

    try {
      setIsExportingSummary(true);
      setTranscript("Preparing lecture summary PDF...");

      const response = await api.post(`/auth/export-lecture-summary/${id}`, {}, { responseType: "blob" });
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const baseName = (docTitle || "lecture").replace(/\.[^/.]+$/, "").trim() || "lecture";
      link.href = url;
      link.download = `${baseName}_lecture_summary.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setTranscript("Lecture summary PDF downloaded");
    } catch (_err) {
      setTranscript("Could not export lecture summary");
    } finally {
      setIsExportingSummary(false);
    }
  }, [docTitle, id, isExportingSummary]);

  const handleClear = useCallback(() => {
    setBboxes({}); 
    activeBboxesRef.current = {}; // Clear duplicate tracker
    previewBboxesRef.current = {};
    stickyIntentRef.current = null; // Clear sticky highlight mode
    setViewerMode("document");
    setModalImage(null);
    setZoomLevel(1); 
    setTranscript("Cleared all effects");
  }, []);

  const wsHandlersRef = useRef({
    navigate: handleNavigate, highlight: handleHighlight, zoom: handleZoom,
    inspect: handleInspect,
    webSearch: handleWebSearch,
    switchToDocumentMode: () => {
      setViewerMode("document");
      setTranscript("Switched to document mode");
    },
    switchToSearchMode: () => {
      setViewerMode("search");
      setTranscript(webSearchStateRef.current?.results?.length ? "Switched to search mode" : "Search mode ready");
    },
    openSearchResult: handleOpenSelectedSearchResult,
    searchResultStep: handleSearchResultStep,
    clear: handleClear,
    transcriptUpdater: setTranscript
  });

  useEffect(() => {
    wsHandlersRef.current = {
      navigate: handleNavigate, highlight: handleHighlight, zoom: handleZoom,
      inspect: handleInspect,
      webSearch: handleWebSearch,
      switchToDocumentMode: () => {
        setViewerMode("document");
        setTranscript("Switched to document mode");
      },
      switchToSearchMode: () => {
        setViewerMode("search");
        setTranscript(webSearchStateRef.current?.results?.length ? "Switched to search mode" : "Search mode ready");
      },
      openSearchResult: handleOpenSelectedSearchResult,
      searchResultStep: handleSearchResultStep,
      clear: handleClear,
      transcriptUpdater: setTranscript
    };
  }, [handleNavigate, handleHighlight, handleZoom, handleInspect, handleWebSearch, handleOpenSelectedSearchResult, handleSearchResultStep, handleClear]);

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

    let disposed = false;

    const clearReconnectTimer = () => {
      if (wsReconnectTimerRef.current !== null) {
        window.clearTimeout(wsReconnectTimerRef.current);
        wsReconnectTimerRef.current = null;
      }
    };

    const connectControlSocket = () => {
      if (disposed) return;

      const ws = new WebSocket(`${wsBase}/ws/${cId}?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) {
          ws.close();
          return;
        }
        clearReconnectTimer();
        wsReconnectAttemptsRef.current = 0;
        setIsConnected(true);
        ws.send(JSON.stringify({ type: "state_update", activePage: activePageRef.current, viewerMode: viewerModeRef.current }));
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          wsRef.current = null;
        }
        setIsConnected(false);
        if (disposed) return;

        clearReconnectTimer();
        const delay = Math.min(1000 * (2 ** wsReconnectAttemptsRef.current), 5000);
        wsReconnectAttemptsRef.current += 1;
        wsReconnectTimerRef.current = window.setTimeout(connectControlSocket, delay);
      };

      ws.onerror = () => {
        try {
          ws.close();
        } catch (_err) {}
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          const handlers = wsHandlersRef.current;
          
          const rawIntent = (msg.intent || msg.Intent || "").toLowerCase();
          let resolvedIntent = rawIntent;

          const slide = msg.slide || msg.Slide;
          const bbox = msg.bbox || msg.BBOX;
          const targetType = (msg.targetType || msg.target_type || msg.contentType || msg.content_type || "text").toLowerCase();
          const isPreview = Boolean(msg.preview ?? msg.isPreview ?? msg.Preview);
          const imageInd = msg.imageind ?? msg.imageInd ?? msg.ImageInd ?? msg.imageIndex ?? msg.ImageIndex; 
          const textData = msg.content || msg.Content || msg.text || msg.Text;

          // 🔥 STICKY HIGHLIGHT LOGIC 🔥
          if (rawIntent === "clear") {
            handlers.clear();
            return;
          } else if (rawIntent === "highlight") {
            stickyIntentRef.current = "highlight";
          } else if (["zoom", "inspect", "next", "prev", "zoom_in", "zoom_out"].includes(rawIntent)) {
            stickyIntentRef.current = null;
          } else if ((rawIntent === "navigate" || rawIntent === "search") && stickyIntentRef.current === "highlight") {
            if (slide === activePageRef.current) {
              resolvedIntent = "highlight";
            }
          }

          switch (resolvedIntent) {
            case "zoom_in": setZoomLevel(z => Math.min(z + 0.3, 4)); break;
            case "zoom_out": setZoomLevel(z => Math.max(z - 0.3, 0.4)); break;
            case "next":
              if (viewerModeRef.current === "search" && webSearchStateRef.current?.results?.length) {
                handlers.searchResultStep(1);
              } else {
                handlers.navigate(activePageRef.current + 1);
              }
              break;
            case "prev":
              if (viewerModeRef.current === "search" && webSearchStateRef.current?.results?.length) {
                handlers.searchResultStep(-1);
              } else {
                handlers.navigate(activePageRef.current - 1);
              }
              break;
            case "navigate": 
            case "search": if (slide) handlers.navigate(slide); break;
            case "highlight": if (slide && bbox) handlers.highlight(slide, bbox, targetType, { preview: isPreview }); break;
            case "zoom": if (slide && bbox) handlers.zoom(slide, bbox, targetType); break;
            case "inspect": if (slide && bbox) handlers.inspect(slide, bbox, imageInd); break;
            case "web_search": if (textData) handlers.webSearch(textData); break;
            case "search_mode": handlers.switchToSearchMode(); break;
            case "document_mode": handlers.switchToDocumentMode(); break;
            case "open_result": handlers.openSearchResult(); break;
            case "speech": if (textData) handlers.transcriptUpdater(textData); break;
          }
        } catch (_err) {}
      };
    };

    connectControlSocket();
    
    return () => {
      disposed = true;
      clearReconnectTimer();
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
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

        sttWs.onclose = () => { if (isListening) setIsListening(false); };

      } catch (err) {
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

    if (isListening && clientId) startRecording();
    else {
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
      const horizontalPadding = 96;
      const usableWidth = Math.max(container.clientWidth - horizontalPadding, 320);
      const newBaseScale = clamp(usableWidth / viewport.width, 0.5, 2.2);
      setBaseScale(newBaseScale);
    };
    const scheduledRecalc = () => {
      window.requestAnimationFrame(() => {
        recalcBaseScale();
      });
    };

    scheduledRecalc();
    const settleTimers = [
      window.setTimeout(scheduledRecalc, 160),
      window.setTimeout(scheduledRecalc, 360),
    ];

    const resizeObserver = new ResizeObserver(() => {
      scheduledRecalc();
    });
    if (scrollContainerRef.current) {
      resizeObserver.observe(scrollContainerRef.current);
    }

    window.addEventListener("resize", recalcBaseScale);
    return () => {
      settleTimers.forEach((timer) => window.clearTimeout(timer));
      resizeObserver.disconnect();
      window.removeEventListener("resize", recalcBaseScale);
    };
  }, [pdfDocument, sidebarCollapsed, viewerMode, webSearchState]);

  if (isLoading) return (
    <div className="h-screen bg-[#080b14] flex items-center justify-center">
      <Loader2 className="w-12 h-12 text-[#8b5cf6] animate-spin" />
    </div>
  );

  return (
    <div className="h-screen bg-[#080b14] flex overflow-hidden font-sans text-slate-200">
      <style>{staticStyles}</style>

      {/* --- SIDEBAR --- */}
      <motion.div animate={{ width: sidebarCollapsed ? 80 : 320 }} className="bg-[#0e1120] border-r border-white/[0.05] flex flex-col z-20 shadow-2xl shrink-0">
        <div className="p-6 flex items-center justify-between border-b border-white/[0.05]">
          {!sidebarCollapsed && <h1 className="font-bold text-xl text-white tracking-tight">ORATO<span className="text-[#8b5cf6]">.AI</span></h1>}
          <button onClick={() => setSidebarCollapsed(!sidebarCollapsed)} className="p-2 text-slate-400 hover:text-white hover:bg-white/[0.05] rounded-lg transition-colors"><Maximize2 size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6 flex flex-col items-center">
          {!sidebarCollapsed && (
            <>
              <div className="w-full bg-white/[0.02] rounded-xl p-4 border border-white/[0.05] text-center">
                <div className="flex items-center justify-center gap-3 mb-2">
                  {isConnected ? <Wifi className="w-4 text-emerald-400" /> : <WifiOff className="w-4 text-red-500" />}
                  <span className="text-sm font-medium">{isConnected ? "Connected" : "Offline"}</span>
                </div>
              </div>

              <div className="w-full bg-[#8b5cf6]/10 p-4 rounded-xl border border-[#8b5cf6]/20 text-center">
                <FileText className="text-[#8b5cf6] mx-auto mb-2" size={24}/>
                <span className="text-sm font-medium text-white truncate block">{docTitle}</span>
              </div>

              <div className="w-full grid grid-cols-2 gap-3">
                <button onClick={() => setZoomLevel(z => Math.min(z + 0.1, 4))} className="flex items-center justify-center gap-2 p-3 bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.05] text-slate-300 rounded-xl text-xs transition-colors"><ZoomIn size={14}/> In</button>
                <button onClick={() => setZoomLevel(z => Math.max(z - 0.1, 0.4))} className="flex items-center justify-center gap-2 p-3 bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.05] text-slate-300 rounded-xl text-xs transition-colors"><ZoomOut size={14}/> Out</button>
              </div>

              <button
                onClick={handleExportSummary}
                disabled={isExportingSummary}
                className="w-full flex items-center justify-center gap-2 p-3 bg-[#8b5cf6]/12 hover:bg-[#8b5cf6]/18 disabled:opacity-60 disabled:cursor-not-allowed border border-[#8b5cf6]/25 text-violet-100 rounded-xl text-xs font-medium transition-colors"
              >
                {isExportingSummary ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                {isExportingSummary ? "Saving..." : "Export Summary PDF"}
              </button>

              <div className="w-full mt-auto pt-6 space-y-4">
                <div className="bg-[#080b14]/50 border border-white/[0.05] rounded-2xl p-5 flex flex-col items-center gap-5">
                   <button 
                    onClick={() => setIsListening(!isListening)} 
                    className={`p-5 rounded-full transition-all duration-300 shadow-xl ${isListening ? "bg-red-500 scale-110 shadow-red-500/20" : "bg-[#8b5cf6] hover:bg-violet-500 shadow-violet-600/20"}`}
                   >
                    {isListening ? <MicOff size={24} color="white" /> : <Mic size={24} color="white" />}
                   </button>
                   <div className="text-center w-full">
                      <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-2">AI Session</p>
                      <p className="text-slate-300 text-xs font-medium leading-relaxed bg-[#0e1120] p-3.5 rounded-xl border border-white/[0.05] min-h-[60px] flex items-center justify-center text-center">
                        {transcript}
                      </p>
                   </div>
                </div>
              </div>
            </>
          )}
          
          {sidebarCollapsed && (
             <div className="flex flex-col gap-6 items-center py-4">
                <button onClick={() => setIsListening(!isListening)} className={`p-3 rounded-full ${isListening ? "bg-red-500 shadow-red-500/20" : "bg-[#8b5cf6] shadow-violet-600/20"}`}>
                  {isListening ? <MicOff size={20} className="text-white" /> : <Mic size={20} className="text-white" />}
                </button>
                <div className={`w-3 h-3 rounded-full ${isConnected ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]" : "bg-red-500"}`} />
                <button onClick={handleExportSummary} disabled={isExportingSummary} className="text-slate-400 hover:text-white disabled:opacity-50 transition-colors"><Download size={20}/></button>
                <button onClick={() => setZoomLevel(z => Math.min(z + 0.1, 4))} className="text-slate-400 hover:text-white transition-colors"><ZoomIn size={20}/></button>
                <button onClick={() => setZoomLevel(z => Math.max(z - 0.1, 0.4))} className="text-slate-400 hover:text-white transition-colors"><ZoomOut size={20}/></button>
             </div>
          )}
        </div>

        <button onClick={() => navigate("/library")} className="p-6 border-t border-white/[0.05] hover:bg-white/[0.02] text-slate-300 hover:text-white flex items-center gap-3 transition-colors mt-auto">
          <ArrowLeft size={20} /> {!sidebarCollapsed && <span className="font-medium">Library</span>}
        </button>
      </motion.div>

      {/* --- MAIN CONTENT AREA --- */}
      <div className="flex-1 bg-[#05070e] relative flex min-w-0">
        <motion.div
          ref={scrollContainerRef}
          className="overflow-auto custom-scrollbar relative"
          animate={{
            width: viewerMode === "search" && webSearchState ? "58%" : "100%",
          }}
          transition={{ type: "spring", stiffness: 180, damping: 26 }}
        >
          <div className="min-h-full w-full flex flex-col items-center py-24 px-8">
            {fileUrl && (
              <div ref={viewerRef} className="relative">
                <Document 
                  file={fileUrl} 
                  onLoadSuccess={(pdf) => { setNumPages(pdf.numPages); setPdfDocument(pdf); }} 
                  className="flex flex-col items-center"
                  loading={<Loader2 className="w-10 h-10 text-[#8b5cf6] animate-spin mt-20" />}
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
                        <Page pageNumber={pageNum} scale={scale} renderAnnotationLayer={false} className="rounded-md overflow-hidden shadow-2xl shadow-black/50" customTextRenderer={(t) => t.str} loading="" />
                        
                        {/* BBOX OVERLAYS */}
                        {pageBboxes.map((box) => {
                          const left = box.bbox[0] * 100;
                          const top = box.bbox[1] * 100;
                          const width = box.bbox[2] * 100;
                          const height = box.bbox[3] * 100;
                          const animation = getBboxAnimationConfig(box.bbox, box.preview);

                          return (
                            <div
                              key={box.id}
                              ref={(el) => { bboxRefs.current[box.id] = el; }}
                              className={`bbox-highlight ${box.preview ? "is-preview" : "is-final"}`}
                              style={{
                                left: `${left}%`,
                                top: `${top}%`,
                                width: `${width}%`,
                                height: `${height}%`,
                                '--bg-color': box.bgColor,
                                '--border-color': box.borderColor,
                                '--shadow-color': box.shadowColor,
                                '--pulse-delay': `${animation.pulseDelay}s`,
                              } as React.CSSProperties}
                            >
                              <motion.div
                                className="bbox-highlight-fill"
                                style={{ inset: `${animation.fillInset}px` }}
                                initial={{ scaleX: 0.03, opacity: 0.08 }}
                                animate={{ scaleX: 1, opacity: animation.fillOpacity }}
                                transition={{
                                  duration: animation.revealDuration,
                                  ease: [0.22, 1, 0.36, 1],
                                }}
                              />
                              <motion.div
                                className="bbox-highlight-outline"
                                initial={{ opacity: 0.16, scaleX: 0.97, scaleY: 0.98 }}
                                animate={{ opacity: animation.outlineOpacity, scaleX: 1, scaleY: 1 }}
                                transition={{
                                  duration: animation.revealDuration * 0.76,
                                  delay: animation.outlineDelay,
                                  ease: [0.22, 1, 0.36, 1],
                                }}
                              />
                            </div>
                          );
                        })}

                        <div className="absolute top-0 -left-16 text-slate-600 font-mono text-xs font-bold pt-4">{String(pageNum).padStart(2, '0')}</div>
                      </div>
                    );
                  })}
                </Document>
              </div>
            )}
          </div>
        </motion.div>

        <AnimatePresence>
          {webSearchState && viewerMode === "search" && (
            <motion.aside
              initial={{ opacity: 0, x: 48 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 48 }}
              transition={{ type: "spring", stiffness: 180, damping: 24 }}
              className="w-[42%] min-w-[380px] max-w-[620px] border-l border-white/[0.06] bg-[radial-gradient(circle_at_top_right,rgba(139,92,246,0.16),transparent_34%),linear-gradient(180deg,#0d1120_0%,#080b14_100%)]"
            >
              <div className="h-full overflow-auto custom-scrollbar px-6 py-24">
                <div className="rounded-3xl border border-white/[0.06] bg-white/[0.03] shadow-2xl shadow-black/30 overflow-hidden">
                  <div className="border-b border-white/[0.06] px-6 py-5 bg-white/[0.02]">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500 mb-2">Search Mode</p>
                        <h2 className="text-lg font-semibold text-white leading-tight">{webSearchState.query}</h2>
                        <p className="text-xs text-slate-400 mt-2 flex items-center gap-2">
                          <Globe2 size={14} />
                          {isWebSearching ? "Searching live web..." : `Source: ${webSearchState.provider}`}
                        </p>
                      </div>
                      <button
                        onClick={() => setViewerMode("document")}
                        className="px-3 py-2 rounded-full border border-white/[0.08] text-xs text-slate-300 hover:text-white hover:bg-white/[0.05] transition-colors"
                      >
                        Doc Focus
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-[minmax(240px,0.95fr)_minmax(0,1.25fr)] min-h-[560px]">
                    <div className="border-r border-white/[0.06] bg-black/10">
                      <div className="px-4 py-4 space-y-3">
                        {webSearchState.results.map((result) => {
                          const isSelected = webSearchState.selected?.url === result.url;
                          return (
                            <button
                              key={result.url}
                              onClick={() => handleSelectSearchResult(result)}
                              className={`w-full text-left rounded-2xl border px-4 py-4 transition-all ${
                                isSelected
                                  ? "border-[#8b5cf6]/40 bg-[#8b5cf6]/14 shadow-[0_14px_32px_rgba(139,92,246,0.12)]"
                                  : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]"
                              }`}
                            >
                              <p className="text-sm font-semibold text-white leading-snug">{result.title}</p>
                              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500 mt-2">{result.displayHost || "Web"}</p>
                              <p className="text-xs text-slate-300 mt-3 leading-relaxed">{result.snippet || "Open result for full context."}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="px-6 py-5">
                      {webSearchState.selected ? (
                        <div className="space-y-5">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500 mb-2">Embedded Web Context</p>
                              <h3 className="text-xl font-semibold text-white leading-tight">{webSearchState.selected.title}</h3>
                              <p className="text-sm text-slate-400 mt-2">{webSearchState.selected.snippet}</p>
                            </div>
                            <a
                              href={webSearchState.selected.url}
                              target="_blank"
                              rel="noreferrer"
                              className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-full border border-white/[0.08] text-xs text-slate-300 hover:text-white hover:bg-white/[0.05] transition-colors"
                            >
                              <ExternalLink size={14} />
                              Open
                            </a>
                          </div>

                          <div className="rounded-2xl border border-white/[0.06] bg-[#090d19] px-5 py-5">
                            <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500 mb-3">Preview</p>
                            <div className="space-y-4 text-sm leading-7 text-slate-200">
                              {(webSearchState.selected.previewText || webSearchState.selected.snippet || "No embedded preview was available for this result.")
                                .split("\n\n")
                                .filter(Boolean)
                                .slice(0, 6)
                                .map((paragraph, index) => (
                                  <p key={`${webSearchState.selected?.url}_${index}`}>{paragraph}</p>
                                ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="h-full flex items-center justify-center text-slate-500 text-sm">
                          Select a result to inspect the embedded web preview.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </div>

      {/* PAGE NAVIGATOR (TOP RIGHT) */}
      <div className="fixed top-8 right-8 flex items-center gap-4 z-30">
        {webSearchState && (
          <div className="bg-[#0e1120]/90 border border-white/[0.08] rounded-full p-1 flex items-center gap-1 shadow-xl backdrop-blur-md">
            <button
              onClick={() => setViewerMode("document")}
              className={`px-4 py-2 rounded-full text-xs font-medium transition-colors ${viewerMode === "document" ? "bg-white text-[#080b14]" : "text-slate-300 hover:text-white"}`}
            >
              Doc Mode
            </button>
            <button
              onClick={() => setViewerMode("search")}
              className={`px-4 py-2 rounded-full text-xs font-medium transition-colors ${viewerMode === "search" ? "bg-[#8b5cf6] text-white" : "text-slate-300 hover:text-white"}`}
            >
              Search Mode
            </button>
          </div>
        )}
        <div className="bg-[#0e1120]/90 border border-white/[0.08] rounded-full px-4 py-2 flex items-center gap-3 shadow-xl backdrop-blur-md">
           <button onClick={() => handleNavigate(activePage - 1)} className="p-1 hover:text-violet-400 transition-colors"><ChevronLeft size={20}/></button>
           <span className="text-xs font-mono font-bold w-12 text-center text-slate-300">{activePage} / {numPages}</span>
           <button onClick={() => handleNavigate(activePage + 1)} className="p-1 hover:text-violet-400 transition-colors"><ChevronRight size={20}/></button>
        </div>
      </div>

      {/* IMAGE MODAL */}
      <AnimatePresence>
        {modalImage && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setModalImage(null)} 
            className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center p-12 cursor-pointer backdrop-blur-md"
          >
            <motion.img 
              initial={{ scale: 0.8, y: 20 }} 
              animate={{ scale: 1, y: 0 }} 
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              src={modalImage} 
              className="max-w-[90%] max-h-[90%] rounded-2xl shadow-[0_0_60px_rgba(139,92,246,0.25)] border border-white/10" 
            />
            <div className="absolute bottom-10 text-slate-400 text-xs font-mono">Click or say "clear" to close</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
