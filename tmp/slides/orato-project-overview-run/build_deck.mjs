const fs = await import("node:fs/promises");
const path = await import("node:path");
const { Presentation, PresentationFile } = await import("@oai/artifact-tool");

const W = 1280;
const H = 720;

const DECK_ID = "orato-project-overview";
const OUT_DIR = path.resolve("D:/personal/projects/isa/outputs/orato-project-overview");
const SCRATCH_DIR = path.resolve("D:/personal/projects/isa/tmp/slides/orato-project-overview");
const PREVIEW_DIR = path.join(SCRATCH_DIR, "preview");
const VERIFICATION_DIR = path.join(SCRATCH_DIR, "verification");
const INSPECT_PATH = path.join(SCRATCH_DIR, "inspect.ndjson");
const MAX_RENDER_VERIFY_LOOPS = 3;

const BG = "#090D18";
const BG_PANEL = "#121A2B";
const BG_PANEL_SOFT = "#151F33";
const BG_PANEL_ALT = "#0F1726";
const WHITE = "#F8FAFF";
const TEXT = "#D9E2F2";
const MUTED = "#94A3B8";
const MUTED_2 = "#6F8097";
const VIOLET = "#8B5CF6";
const CYAN = "#22D3EE";
const EMERALD = "#34D399";
const AMBER = "#FBBF24";
const ROSE = "#FB7185";
const INK = "#050816";
const LINE = "#25324A";
const GLASS = "#FFFFFF10";
const GLASS_2 = "#FFFFFF14";
const SHADOW = "#020617";
const TRANSPARENT = "#00000000";

const TITLE_FACE = "Poppins";
const BODY_FACE = "Lato";
const MONO_FACE = "Aptos Mono";

const SOURCES = {
  frontend: "Frontend routes and UX: orato-fe/src/app/App.tsx, pages/Landing.tsx, pages/Library.tsx, pages/Presentation.tsx, store/authStore.ts",
  backend: "Backend API and app boot: orato-be/main.py, orato-be/http_routes.py, orato-be/auth.py, orato-be/database.py",
  realtime: "Realtime voice handling: orato-be/websocket_routes.py",
  retrieval: "Retrieval and command reasoning: orato-be/retreival_pipeline.py, orato-be/llm_reasoner.py",
  ingestion: "Parsing and vectorization: orato-be/parsing.py, orato-be/ingestion_pipeline.py",
};

const inspectRecords = [];

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureDirs() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.mkdir(SCRATCH_DIR, { recursive: true });
  await fs.mkdir(PREVIEW_DIR, { recursive: true });
  await fs.mkdir(VERIFICATION_DIR, { recursive: true });
}

function lineConfig(fill = TRANSPARENT, width = 0, style = "solid") {
  return { style, fill, width };
}

function addShape(slide, geometry, x, y, w, h, fill = TRANSPARENT, lineFill = TRANSPARENT, lineWidth = 0, meta = {}) {
  const shape = slide.shapes.add({
    geometry,
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: lineConfig(lineFill, lineWidth),
  });
  if (meta.slideNo) {
    inspectRecords.push({
      kind: "shape",
      slide: meta.slideNo,
      role: meta.role || geometry,
      shapeType: geometry,
      bbox: [x, y, w, h],
    });
  }
  return shape;
}

function textLineCount(text) {
  return String(text ?? "").split(/\n/).filter(Boolean).length || 1;
}

function requiredTextHeight(text, fontSize, lineHeight = 1.18) {
  return Math.max(fontSize * 1.2, textLineCount(text) * fontSize * lineHeight);
}

function addText(
  slide,
  slideNo,
  text,
  x,
  y,
  w,
  h,
  {
    size = 22,
    color = TEXT,
    bold = false,
    face = BODY_FACE,
    align = "left",
    valign = "top",
    fill = TRANSPARENT,
    line = TRANSPARENT,
    lineWidth = 0,
    role = "text",
    checkFit = true,
  } = {},
) {
  if (checkFit && h < requiredTextHeight(text, size)) {
    throw new Error(`Textbox too short for role=${role}: height=${h}, required>=${requiredTextHeight(text, size).toFixed(1)}`);
  }
  const shape = addShape(slide, "rect", x, y, w, h, fill, line, lineWidth, { slideNo, role });
  shape.text = text;
  shape.text.fontSize = size;
  shape.text.color = color;
  shape.text.bold = bold;
  shape.text.typeface = face;
  shape.text.alignment = align;
  shape.text.verticalAlignment = valign;
  shape.text.insets = { left: 0, right: 0, top: 0, bottom: 0 };
  inspectRecords.push({
    kind: "textbox",
    slide: slideNo,
    role,
    text: String(text ?? ""),
    textChars: String(text ?? "").length,
    textLines: textLineCount(text),
    bbox: [x, y, w, h],
  });
  return shape;
}

function wrapText(text, widthChars) {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > widthChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.join("\n");
}

function addBackground(slide, slideNo) {
  slide.background.fill = BG;
  addShape(slide, "ellipse", -120, -160, 430, 430, "#7C3AED22", TRANSPARENT, 0, { slideNo, role: "bg glow" });
  addShape(slide, "ellipse", 1000, -90, 300, 300, "#06B6D422", TRANSPARENT, 0, { slideNo, role: "bg glow" });
  addShape(slide, "ellipse", 980, 540, 340, 280, "#8B5CF61A", TRANSPARENT, 0, { slideNo, role: "bg glow" });
  addShape(slide, "rect", 54, 36, 1172, 648, GLASS, "#FFFFFF12", 1, { slideNo, role: "frame" });
}

function addHeader(slide, slideNo, kicker, page) {
  addText(slide, slideNo, kicker.toUpperCase(), 84, 58, 380, 20, {
    size: 12,
    color: CYAN,
    bold: true,
    face: MONO_FACE,
    role: "header kicker",
    checkFit: false,
  });
  addText(slide, slideNo, page, 1110, 58, 90, 20, {
    size: 12,
    color: MUTED,
    bold: true,
    face: MONO_FACE,
    align: "right",
    role: "header page",
    checkFit: false,
  });
  addShape(slide, "rect", 84, 88, 1112, 1.5, "#FFFFFF18", TRANSPARENT, 0, { slideNo, role: "header rule" });
}

function addTitle(slide, slideNo, title, subtitle, x = 84, y = 110, w = 760) {
  addText(slide, slideNo, title, x, y, w, 108, {
    size: 34,
    color: WHITE,
    bold: true,
    face: TITLE_FACE,
    role: "title",
  });
  addText(slide, slideNo, subtitle, x, y + 96, w, 56, {
    size: 18,
    color: MUTED,
    face: BODY_FACE,
    role: "subtitle",
  });
}

function addChip(slide, slideNo, text, x, y, w, fill, role = "chip") {
  addShape(slide, "roundRect", x, y, w, 30, fill, TRANSPARENT, 0, { slideNo, role });
  addText(slide, slideNo, text, x + 12, y + 7, w - 24, 16, {
    size: 11,
    color: WHITE,
    bold: true,
    face: MONO_FACE,
    role: `${role} label`,
    checkFit: false,
  });
}

function addCard(slide, slideNo, x, y, w, h, title, body, accent = VIOLET, icon = "dot") {
  addShape(slide, "roundRect", x, y, w, h, BG_PANEL, "#FFFFFF14", 1, { slideNo, role: `card ${title}` });
  addShape(slide, "rect", x, y, 8, h, accent, TRANSPARENT, 0, { slideNo, role: `card accent ${title}` });
  addShape(slide, "ellipse", x + 22, y + 24, 28, 28, "#FFFFFF12", TRANSPARENT, 0, { slideNo, role: `card icon bg ${title}` });
  if (icon === "flow") {
    addShape(slide, "ellipse", x + 28, y + 30, 6, 6, CYAN, TRANSPARENT, 0, { slideNo, role: "icon" });
    addShape(slide, "ellipse", x + 38, y + 38, 6, 6, CYAN, TRANSPARENT, 0, { slideNo, role: "icon" });
    addShape(slide, "rect", x + 33, y + 34, 9, 2, CYAN, TRANSPARENT, 0, { slideNo, role: "icon" });
  } else if (icon === "stack") {
    addShape(slide, "roundRect", x + 27, y + 29, 14, 6, CYAN, TRANSPARENT, 0, { slideNo, role: "icon" });
    addShape(slide, "roundRect", x + 24, y + 37, 20, 6, VIOLET, TRANSPARENT, 0, { slideNo, role: "icon" });
    addShape(slide, "roundRect", x + 29, y + 45, 10, 4, EMERALD, TRANSPARENT, 0, { slideNo, role: "icon" });
  } else {
    addShape(slide, "ellipse", x + 31, y + 33, 10, 10, accent, TRANSPARENT, 0, { slideNo, role: "icon" });
  }
  addText(slide, slideNo, title, x + 66, y + 20, w - 84, 24, {
    size: 16,
    color: WHITE,
    bold: true,
    face: TITLE_FACE,
    role: "card title",
    checkFit: false,
  });
  addText(slide, slideNo, wrapText(body, Math.max(34, Math.floor(w / 9))), x + 24, y + 60, w - 48, h - 76, {
    size: 14,
    color: TEXT,
    face: BODY_FACE,
    role: "card body",
  });
}

function addMiniTag(slide, slideNo, text, x, y, w, fill = "#0F2238") {
  addShape(slide, "roundRect", x, y, w, 26, fill, "#FFFFFF10", 0.5, { slideNo, role: "mini tag" });
  addText(slide, slideNo, text, x + 10, y + 6, w - 20, 14, {
    size: 10,
    color: CYAN,
    bold: true,
    face: MONO_FACE,
    role: "mini tag label",
    checkFit: false,
  });
}

function addArrow(slide, slideNo, x, y, w, h, fill = CYAN, role = "arrow") {
  addShape(slide, "rightArrow", x, y, w, h, fill, TRANSPARENT, 0, { slideNo, role });
}

function addBulletList(slide, slideNo, items, x, y, w, lineGap = 36, size = 17, accent = CYAN, role = "bullet") {
  items.forEach((item, idx) => {
    addShape(slide, "ellipse", x, y + idx * lineGap + 6, 10, 10, accent, TRANSPARENT, 0, { slideNo, role: `${role} dot` });
    addText(slide, slideNo, item, x + 22, y + idx * lineGap, w - 22, 26, {
      size,
      color: TEXT,
      face: BODY_FACE,
      role: `${role} text`,
      checkFit: false,
    });
  });
}

function addNotes(slide, body, sourceKeys) {
  const sourceLines = sourceKeys.map((key) => `- ${SOURCES[key] || key}`).join("\n");
  slide.speakerNotes.setText(`${body}\n\n[Sources]\n${sourceLines}`);
}

function slide1(presentation) {
  const slideNo = 1;
  const slide = presentation.slides.add();
  addBackground(slide, slideNo);
  addChip(slide, slideNo, "VOICE-FIRST PDF PRESENTATION ASSISTANT", 84, 84, 300, "#4C1D9522");
  addText(slide, slideNo, "ORATO", 84, 140, 220, 42, {
    size: 40,
    color: WHITE,
    bold: true,
    face: TITLE_FACE,
    role: "brand",
    checkFit: false,
  });
  addText(slide, slideNo, "Explaining the full project from product idea to live AI architecture", 84, 202, 660, 110, {
    size: 44,
    color: WHITE,
    bold: true,
    face: TITLE_FACE,
    role: "cover title",
  });
  addText(slide, slideNo, "Orato turns static PDF presentations into an interactive, voice-controlled experience with live navigation, highlighting, zoom, contextual web search, and lecture summary export.", 84, 326, 670, 82, {
    size: 20,
    color: TEXT,
    face: BODY_FACE,
    role: "cover subtitle",
  });
  addCard(slide, slideNo, 84, 468, 310, 142, "Core promise", "Present naturally while Orato listens and controls the document for you.", VIOLET, "flow");
  addCard(slide, slideNo, 412, 468, 310, 142, "Primary inputs", "PDF files, microphone audio, user identity, and live session context.", CYAN, "stack");
  addCard(slide, slideNo, 740, 468, 456, 142, "Output experience", "Voice-driven navigation, highlights, inspection, search mode, and summary export.", EMERALD, "dot");

  addShape(slide, "roundRect", 798, 112, 360, 280, BG_PANEL_ALT, "#FFFFFF14", 1, { slideNo, role: "hero panel" });
  addMiniTag(slide, slideNo, "Frontend", 826, 144, 86);
  addMiniTag(slide, slideNo, "FastAPI", 922, 144, 82);
  addMiniTag(slide, slideNo, "WebSockets", 1016, 144, 110);
  addShape(slide, "roundRect", 826, 188, 126, 74, "#8B5CF622", TRANSPARENT, 0, { slideNo, role: "hero block" });
  addText(slide, slideNo, "Upload", 846, 212, 80, 24, { size: 18, color: WHITE, bold: true, face: TITLE_FACE, role: "hero label", checkFit: false });
  addShape(slide, "roundRect", 1004, 188, 126, 74, "#06B6D422", TRANSPARENT, 0, { slideNo, role: "hero block" });
  addText(slide, slideNo, "Listen", 1026, 212, 80, 24, { size: 18, color: WHITE, bold: true, face: TITLE_FACE, role: "hero label", checkFit: false });
  addArrow(slide, slideNo, 954, 213, 38, 20, CYAN, "hero arrow");
  addShape(slide, "roundRect", 826, 292, 304, 74, "#34D39922", TRANSPARENT, 0, { slideNo, role: "hero block" });
  addText(slide, slideNo, "Understand and act on the document", 850, 315, 260, 24, { size: 18, color: WHITE, bold: true, face: TITLE_FACE, role: "hero label", checkFit: false });
  addText(slide, slideNo, "React + FastAPI + retrieval + STT", 846, 648, 300, 18, { size: 11, color: MUTED_2, face: MONO_FACE, role: "footer", checkFit: false });
  addNotes(slide, "Opening frame for the project. Establishes that Orato is both a product concept and a working technical system assembled from the repo's frontend, backend, and AI services.", ["frontend", "backend", "realtime", "retrieval"]);
}

function slide2(presentation) {
  const slideNo = 2;
  const slide = presentation.slides.add();
  addBackground(slide, slideNo);
  addHeader(slide, slideNo, "Problem and Value", "02 / 08");
  addTitle(slide, slideNo, "What problem does Orato solve?", "The project is built around one idea: presenters should not have to break flow to control a document.");

  addCard(slide, slideNo, 84, 246, 340, 326, "Pain in traditional presenting", "Presenters keep switching attention between speaking and operating the interface. That creates friction when changing slides, locating content, zooming into diagrams, or answering spontaneous questions.", ROSE, "dot");
  addCard(slide, slideNo, 470, 246, 340, 326, "What Orato changes", "The system lets the user upload a PDF, open it inside a focused presentation view, and then drive the session with natural phrases such as next slide, go to page 5, highlight this, or search the web.", VIOLET, "flow");
  addCard(slide, slideNo, 856, 246, 340, 326, "Who benefits", "Teachers, student presenters, demo teams, and workshop facilitators who need hands-free control, clearer pacing, and better audience interaction during document-based presentations.", EMERALD, "stack");

  addMiniTag(slide, slideNo, "Voice control", 84, 612, 106, "#11263E");
  addMiniTag(slide, slideNo, "Semantic highlight", 202, 612, 142, "#11263E");
  addMiniTag(slide, slideNo, "Live search mode", 356, 612, 132, "#11263E");
  addMiniTag(slide, slideNo, "Lecture summary export", 500, 612, 160, "#11263E");
  addNotes(slide, "Explains the user-facing value proposition visible in the landing page and presentation experience. The slide converts UI features into a clear product story.", ["frontend"]);
}

function slide3(presentation) {
  const slideNo = 3;
  const slide = presentation.slides.add();
  addBackground(slide, slideNo);
  addHeader(slide, slideNo, "Product Workflow", "03 / 08");
  addTitle(slide, slideNo, "End-to-end user journey", "The repo supports a complete flow from account creation to document ingestion to live AI-assisted presentation.");

  const steps = [
    { title: "1. Sign in and open the library", body: "JWT-based auth and a protected dashboard manage who can upload, list, and present documents.", x: 84, accent: VIOLET },
    { title: "2. Upload a PDF", body: "The file is stored under uploads/, document metadata is written to MongoDB, and ingestion starts immediately.", x: 372, accent: CYAN },
    { title: "3. Parse and index content", body: "Text blocks, tables, and image context are extracted, chunked, embedded, and persisted in Chroma for semantic retrieval.", x: 660, accent: EMERALD },
    { title: "4. Present and enrich", body: "Inside the presentation screen, voice actions drive navigation, highlighting, zoom, search mode, and lecture summary export.", x: 948, accent: AMBER },
  ];

  steps.forEach((step) => {
    addShape(slide, "roundRect", step.x, 286, 248, 240, BG_PANEL, "#FFFFFF14", 1, { slideNo, role: `step ${step.title}` });
    addShape(slide, "rect", step.x, 286, 248, 10, step.accent, TRANSPARENT, 0, { slideNo, role: "step accent" });
    addText(slide, slideNo, step.title, step.x + 22, 320, 200, 52, {
      size: 22,
      color: WHITE,
      bold: true,
      face: TITLE_FACE,
      role: "step title",
    });
    addText(slide, slideNo, wrapText(step.body, 28), step.x + 22, 390, 204, 100, {
      size: 15,
      color: TEXT,
      face: BODY_FACE,
      role: "step body",
    });
  });

  addArrow(slide, slideNo, 334, 393, 28, 18, CYAN, "workflow arrow");
  addArrow(slide, slideNo, 622, 393, 28, 18, CYAN, "workflow arrow");
  addArrow(slide, slideNo, 910, 393, 28, 18, CYAN, "workflow arrow");

  addBulletList(slide, slideNo, [
    "Library.tsx handles file upload and document listing.",
    "http_routes.py performs secure upload, storage, and retrieval APIs.",
    "ingestion_pipeline.py creates searchable vector data before the UI uses the file.",
  ], 108, 582, 1050, 30, 15, CYAN, "journey");

  addNotes(slide, "Maps the visible product experience to backend processing. This is the best slide for explaining Orato to a non-technical audience before diving into architecture.", ["frontend", "backend", "ingestion"]);
}

function slide4(presentation) {
  const slideNo = 4;
  const slide = presentation.slides.add();
  addBackground(slide, slideNo);
  addHeader(slide, slideNo, "Architecture", "04 / 08");
  addTitle(slide, slideNo, "System architecture across the stack", "Orato is split into a React client, a FastAPI service layer, document intelligence services, and persistent storage.");

  addShape(slide, "roundRect", 96, 252, 248, 320, "#181F33", "#FFFFFF16", 1, { slideNo, role: "layer frontend" });
  addShape(slide, "roundRect", 384, 252, 248, 320, "#151C30", "#FFFFFF16", 1, { slideNo, role: "layer api" });
  addShape(slide, "roundRect", 672, 252, 248, 320, "#141A2B", "#FFFFFF16", 1, { slideNo, role: "layer intelligence" });
  addShape(slide, "roundRect", 960, 252, 224, 320, "#121726", "#FFFFFF16", 1, { slideNo, role: "layer storage" });

  addText(slide, slideNo, "Frontend", 120, 276, 140, 30, { size: 24, color: WHITE, bold: true, face: TITLE_FACE, role: "layer title", checkFit: false });
  addText(slide, slideNo, "React + Vite + Tailwind\nreact-pdf + Zustand\nPresentation UI + Search Mode", 120, 326, 180, 120, { size: 16, color: TEXT, face: BODY_FACE, role: "layer body" });

  addText(slide, slideNo, "FastAPI Layer", 408, 276, 170, 30, { size: 24, color: WHITE, bold: true, face: TITLE_FACE, role: "layer title", checkFit: false });
  addText(slide, slideNo, "REST routes for auth,\nupload, document serving,\nweb search, and summary export\n\nWebSocket endpoints for\nstate sync and audio streaming", 408, 326, 184, 180, { size: 16, color: TEXT, face: BODY_FACE, role: "layer body" });

  addText(slide, slideNo, "AI / Retrieval", 696, 276, 170, 30, { size: 24, color: WHITE, bold: true, face: TITLE_FACE, role: "layer title", checkFit: false });
  addText(slide, slideNo, "PDF/PPT parsing\nChunking + embeddings\nRegex + LLM reasoning\nSemantic retrieval\nContextual web search\nLecture summarization", 696, 326, 184, 180, { size: 16, color: TEXT, face: BODY_FACE, role: "layer body" });

  addText(slide, slideNo, "Storage", 984, 276, 120, 30, { size: 24, color: WHITE, bold: true, face: TITLE_FACE, role: "layer title", checkFit: false });
  addText(slide, slideNo, "MongoDB\nusers + documents\n\nChroma\nvector indexes\n\nuploads/\nsecure file store", 984, 326, 150, 180, { size: 16, color: TEXT, face: BODY_FACE, role: "layer body" });

  addArrow(slide, slideNo, 348, 404, 26, 18, CYAN, "arch arrow");
  addArrow(slide, slideNo, 636, 404, 26, 18, CYAN, "arch arrow");
  addArrow(slide, slideNo, 924, 404, 26, 18, CYAN, "arch arrow");

  addMiniTag(slide, slideNo, "/auth/upload", 120, 520, 112, "#1B2740");
  addMiniTag(slide, slideNo, "/ws/stt/{client_id}", 408, 520, 148, "#1B2740");
  addMiniTag(slide, slideNo, "analyze_query()", 696, 520, 126, "#1B2740");
  addMiniTag(slide, slideNo, "db/chroma/<doc>", 984, 520, 130, "#1B2740");

  addNotes(slide, "High-level technical map of the project. Connects the repo's modules into four understandable layers so reviewers can immediately place each subsystem.", ["frontend", "backend", "realtime", "retrieval", "ingestion"]);
}

function slide5(presentation) {
  const slideNo = 5;
  const slide = presentation.slides.add();
  addBackground(slide, slideNo);
  addHeader(slide, slideNo, "Realtime Control Loop", "05 / 08");
  addTitle(slide, slideNo, "How live voice control works", "The presentation experience is driven by two WebSocket channels: one for control state and one for streaming microphone audio.");

  addShape(slide, "roundRect", 84, 262, 1112, 332, BG_PANEL, "#FFFFFF16", 1, { slideNo, role: "loop panel" });
  addText(slide, slideNo, "Interim preview path", 110, 286, 200, 24, { size: 18, color: CYAN, bold: true, face: TITLE_FACE, role: "lane", checkFit: false });
  addText(slide, slideNo, "Final action path", 110, 430, 200, 24, { size: 18, color: EMERALD, bold: true, face: TITLE_FACE, role: "lane", checkFit: false });

  const topY = 330;
  const bottomY = 474;
  const boxes = [
    { x: 116, w: 164, label: "Mic audio\nfrom browser", fill: "#8B5CF622" },
    { x: 326, w: 164, label: "Google STT\nstreaming", fill: "#06B6D422" },
    { x: 536, w: 190, label: "preview_highlight()\nchecks likely target", fill: "#13233B" },
    { x: 772, w: 170, label: "Action payload\nqueued and sent", fill: "#102739" },
    { x: 988, w: 166, label: "UI preview overlay\nbefore final command", fill: "#113122" },
  ];
  boxes.forEach((box) => {
    addShape(slide, "roundRect", box.x, topY, box.w, 74, box.fill, "#FFFFFF10", 1, { slideNo, role: "top loop box" });
    addText(slide, slideNo, box.label, box.x + 16, topY + 18, box.w - 32, 40, { size: 15, color: WHITE, bold: true, face: BODY_FACE, role: "top loop label" });
  });
  addArrow(slide, slideNo, 286, topY + 27, 28, 18, CYAN, "top arrow");
  addArrow(slide, slideNo, 498, topY + 27, 28, 18, CYAN, "top arrow");
  addArrow(slide, slideNo, 734, topY + 27, 28, 18, CYAN, "top arrow");
  addArrow(slide, slideNo, 950, topY + 27, 28, 18, CYAN, "top arrow");

  const finalBoxes = [
    { x: 116, w: 164, label: "Final transcript", fill: "#3B1F6A" },
    { x: 326, w: 190, label: "analyze_query()\nregex + LLM reasoning", fill: "#14304A" },
    { x: 562, w: 180, label: "retrieve()\nsemantic match", fill: "#12333A" },
    { x: 788, w: 182, label: "navigate / highlight /\nzoom / inspect", fill: "#17321D" },
    { x: 1016, w: 138, label: "Transcript\nfeedback", fill: "#312315" },
  ];
  finalBoxes.forEach((box) => {
    addShape(slide, "roundRect", box.x, bottomY, box.w, 74, box.fill, "#FFFFFF10", 1, { slideNo, role: "bottom loop box" });
    addText(slide, slideNo, box.label, box.x + 16, bottomY + 18, box.w - 32, 40, { size: 15, color: WHITE, bold: true, face: BODY_FACE, role: "bottom loop label" });
  });
  addArrow(slide, slideNo, 286, bottomY + 27, 28, 18, EMERALD, "bottom arrow");
  addArrow(slide, slideNo, 524, bottomY + 27, 28, 18, EMERALD, "bottom arrow");
  addArrow(slide, slideNo, 750, bottomY + 27, 28, 18, EMERALD, "bottom arrow");
  addArrow(slide, slideNo, 978, bottomY + 27, 28, 18, EMERALD, "bottom arrow");

  addText(slide, slideNo, "Why this matters: previews make the interface feel responsive before a sentence is even finished, while the final path uses more deliberate reasoning and retrieval before changing the document.", 110, 618, 1000, 44, {
    size: 16,
    color: MUTED,
    face: BODY_FACE,
    role: "explain",
  });

  addNotes(slide, "This slide is the technical core of the live experience. It shows how websocket_routes.py separates low-latency interim previews from final command execution.", ["realtime", "retrieval"]);
}

function slide6(presentation) {
  const slideNo = 6;
  const slide = presentation.slides.add();
  addBackground(slide, slideNo);
  addHeader(slide, slideNo, "Document Intelligence", "06 / 08");
  addTitle(slide, slideNo, "What makes the document 'understandable' to the system", "Orato does more than speech-to-text. It builds structured context around the file and the current session.");

  addCard(slide, slideNo, 84, 254, 340, 188, "Parsing and chunking", "parsing.py extracts text, tables, and image context. ingestion_pipeline.py converts that into searchable documents with slide, section, and bounding-box metadata.", VIOLET, "stack");
  addCard(slide, slideNo, 470, 254, 340, 188, "Retrieval and reasoning", "retreival_pipeline.py combines rule-based parsing with optional LLM reasoning so the system can decide whether to navigate, search, zoom, inspect, or ignore non-document chatter.", CYAN, "flow");
  addCard(slide, slideNo, 856, 254, 340, 188, "Session-aware enrichment", "http_routes.py resolves contextual web queries from focus text and transcript history, then reuses the same session context to build lecture summaries.", EMERALD, "dot");

  addShape(slide, "roundRect", 84, 482, 1112, 118, BG_PANEL_SOFT, "#FFFFFF14", 1, { slideNo, role: "feature strip" });
  addMiniTag(slide, slideNo, "Image captions for diagrams", 110, 510, 182, "#13233B");
  addMiniTag(slide, slideNo, "Bounding boxes for highlight overlays", 304, 510, 232, "#13233B");
  addMiniTag(slide, slideNo, "Chroma vector index per document", 548, 510, 206, "#13233B");
  addMiniTag(slide, slideNo, "Contextual web search fallback chain", 766, 510, 236, "#13233B");
  addMiniTag(slide, slideNo, "Lecture summary PDF export", 1014, 510, 156, "#13233B");

  addText(slide, slideNo, "This combination is what turns static content into an interactive teaching companion rather than a simple PDF viewer.", 110, 554, 980, 24, {
    size: 16,
    color: MUTED,
    face: BODY_FACE,
    role: "summary",
    checkFit: false,
  });

  addNotes(slide, "Summarizes the intelligence layer that sits underneath the user experience: parsing, vector search, intent reasoning, contextual search, and summary generation.", ["ingestion", "retrieval", "backend"]);
}

function slide7(presentation) {
  const slideNo = 7;
  const slide = presentation.slides.add();
  addBackground(slide, slideNo);
  addHeader(slide, slideNo, "Stack and APIs", "07 / 08");
  addTitle(slide, slideNo, "Technology stack and implementation footprint", "The project mixes modern frontend tooling, FastAPI services, retrieval infrastructure, and external AI providers.");

  addCard(slide, slideNo, 84, 250, 340, 282, "Frontend stack", "React 18, Vite, React Router, Tailwind styles, Framer Motion, lucide-react icons, react-pdf for document rendering, and Zustand for auth/session state.", VIOLET, "dot");
  addCard(slide, slideNo, 470, 250, 340, 282, "Backend stack", "FastAPI, Motor for MongoDB access, JWT auth with passlib + python-jose, pypdf/pdfplumber/python-pptx parsing utilities, and httpx for provider integrations.", CYAN, "stack");
  addCard(slide, slideNo, 856, 250, 340, 282, "AI and infra stack", "Google Cloud Speech streaming, Chroma + HuggingFace embeddings for retrieval, optional Gemini/OpenAI-compatible reasoning, and external web search providers for search mode.", EMERALD, "flow");

  addShape(slide, "roundRect", 84, 566, 1112, 76, BG_PANEL_ALT, "#FFFFFF14", 1, { slideNo, role: "endpoint rail" });
  addText(slide, slideNo, "Representative API surface", 108, 588, 190, 22, {
    size: 14,
    color: CYAN,
    bold: true,
    face: MONO_FACE,
    role: "rail label",
    checkFit: false,
  });
  const endpointLabels = [
    "/auth/login",
    "/auth/upload",
    "/auth/view-doc/{id}",
    "/auth/web-search/{id}",
    "/ws/{client_id}",
    "/ws/stt/{client_id}",
  ];
  endpointLabels.forEach((label, idx) => {
    addMiniTag(slide, slideNo, label, 320 + idx * 140, 580, 126, "#11263E");
  });

  addNotes(slide, "Useful review slide for explaining exactly what technologies and endpoints the repo currently uses without overwhelming the audience with code.", ["frontend", "backend", "realtime", "retrieval", "ingestion"]);
}

function slide8(presentation) {
  const slideNo = 8;
  const slide = presentation.slides.add();
  addBackground(slide, slideNo);
  addHeader(slide, slideNo, "Assessment and Next Steps", "08 / 08");
  addTitle(slide, slideNo, "What is strong already, and what should improve next?", "The repo already demonstrates a compelling idea, but it also reveals clear engineering opportunities for the next iteration.");

  addCard(slide, slideNo, 84, 252, 360, 314, "Current strengths", "The project already covers the entire experience: auth, uploads, parsing, vector indexing, live document control, web search mode, and summary export. That makes it much more complete than a narrow proof of concept.", EMERALD, "dot");
  addCard(slide, slideNo, 460, 252, 360, 314, "Current risks and gaps", "Upload ingestion is synchronous, which can slow large files. Some secrets are stored in .env. Search reliability depends on external providers. The UI currently focuses on PDFs even though parsing.py also supports PPTX.", ROSE, "stack");
  addCard(slide, slideNo, 836, 252, 360, 314, "Best next steps", "Move ingestion to background jobs, harden provider configuration and secret handling, add richer analytics and observability, improve testing, and extend the UI so presentation intelligence works consistently across more source formats.", VIOLET, "flow");

  addShape(slide, "roundRect", 84, 604, 1112, 62, "#8B5CF620", "#8B5CF655", 1, { slideNo, role: "closing bar" });
  addText(slide, slideNo, "Bottom line: Orato is already a strong full-stack AI product prototype, and the next round of work should focus on reliability, scalability, and polish rather than reinventing the core concept.", 110, 624, 1060, 20, {
    size: 16,
    color: WHITE,
    bold: true,
    face: BODY_FACE,
    role: "closing text",
    checkFit: false,
  });

  addNotes(slide, "Closes the presentation with an honest assessment. This helps explain the project 'properly' by showing both what works and what deserves future engineering attention.", ["frontend", "backend", "realtime", "retrieval", "ingestion"]);
}

async function createDeck() {
  await ensureDirs();
  const presentation = Presentation.create({ slideSize: { width: W, height: H } });
  [
    slide1,
    slide2,
    slide3,
    slide4,
    slide5,
    slide6,
    slide7,
    slide8,
  ].forEach((builder) => builder(presentation));
  return presentation;
}

async function saveBlobToFile(blob, filePath) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await fs.writeFile(filePath, bytes);
}

async function writeInspectArtifact(presentation) {
  const header = {
    kind: "deck",
    id: DECK_ID,
    slideCount: presentation.slides.count,
    slideSize: { width: W, height: H },
  };
  const lines = [header, ...inspectRecords].map((record) => JSON.stringify(record)).join("\n") + "\n";
  await fs.writeFile(INSPECT_PATH, lines, "utf8");
}

async function currentRenderLoopCount() {
  const logPath = path.join(VERIFICATION_DIR, "render_verify_loops.ndjson");
  if (!(await pathExists(logPath))) return 0;
  const previous = await fs.readFile(logPath, "utf8");
  return previous.split(/\r?\n/).filter((line) => line.trim()).length;
}

async function appendRenderVerifyLoop(presentation, previewPaths, pptxPath) {
  const logPath = path.join(VERIFICATION_DIR, "render_verify_loops.ndjson");
  const record = {
    kind: "render_verify_loop",
    deckId: DECK_ID,
    loop: (await currentRenderLoopCount()) + 1,
    maxLoops: MAX_RENDER_VERIFY_LOOPS,
    timestamp: new Date().toISOString(),
    slideCount: presentation.slides.count,
    previewCount: previewPaths.length,
    previewDir: PREVIEW_DIR,
    inspectPath: INSPECT_PATH,
    pptxPath,
  };
  await fs.appendFile(logPath, JSON.stringify(record) + "\n", "utf8");
}

async function verifyAndExport(presentation) {
  await ensureDirs();
  const nextLoop = (await currentRenderLoopCount()) + 1;
  if (nextLoop > MAX_RENDER_VERIFY_LOOPS) {
    throw new Error(`Render loop cap reached (${MAX_RENDER_VERIFY_LOOPS}).`);
  }
  await writeInspectArtifact(presentation);
  const previewPaths = [];
  for (let idx = 0; idx < presentation.slides.items.length; idx += 1) {
    const slide = presentation.slides.items[idx];
    const preview = await presentation.export({ slide, format: "png", scale: 1 });
    const previewPath = path.join(PREVIEW_DIR, `slide-${String(idx + 1).padStart(2, "0")}.png`);
    await saveBlobToFile(preview, previewPath);
    previewPaths.push(previewPath);
  }
  const pptxBlob = await PresentationFile.exportPptx(presentation);
  const pptxPath = path.join(OUT_DIR, "orato-project-overview.pptx");
  await pptxBlob.save(pptxPath);
  await appendRenderVerifyLoop(presentation, previewPaths, pptxPath);
  return { pptxPath, previewPaths };
}

const presentation = await createDeck();
const result = await verifyAndExport(presentation);
console.log(result.pptxPath);
