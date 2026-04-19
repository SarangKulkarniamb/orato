from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from datetime import datetime, timezone
from pathlib import Path
import shutil
import os
import asyncio # <-- IMPORT ASYNCIO
from io import BytesIO
from urllib.parse import quote_plus, urlparse
from bson import ObjectId
from fastapi.responses import FileResponse, StreamingResponse
import httpx
from lxml import html
from PIL import Image, ImageDraw, ImageFont
from pydantic import BaseModel
from pypdf import PdfReader
from database import UserCollection, db
from models import UserCreate, UserLogin, UserResponse, Token
from auth import get_password_hash, verify_password, create_access_token, get_current_user

from ingestion_pipeline import process_document_pipeline
from llm_reasoner import LLMCommandReasoner
from retreival_pipeline import load_vector_db
from websocket_routes import client_states

http_router = APIRouter(prefix="/auth", tags=["Authentication"])

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)
SUMMARY_REASONER = LLMCommandReasoner()
WEB_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36"


class WebSearchRequest(BaseModel):
    query: str


def _normalize_search_query(query: str) -> str:
    query = " ".join((query or "").strip().split())
    lowered = query.lower()
    for prefix in [
        "go and search for",
        "go and search",
        "go search for",
        "go search",
        "search for",
        "search",
        "google this",
        "search this online",
        "search this on google",
        "search this",
        "look this up",
        "google",
        "search google for",
        "search google",
        "search the web for",
        "search the web",
        "search web for",
        "search web",
        "search online for",
        "search online",
        "look up",
        "web search",
    ]:
        if lowered.startswith(prefix):
            trimmed = query[len(prefix):].strip(" :,-")
            return trimmed
    return query


def _build_session_search_context(doc_id: str, current_user: dict) -> dict:
    primary_client_id = f"{current_user['id']}_{doc_id}"
    fallback_client_id = f"client_{doc_id}"
    return client_states.get(primary_client_id) or client_states.get(fallback_client_id) or {}


def _resolve_contextual_web_query(raw_query: str, doc_title: str, session_state: dict) -> str:
    normalized = _normalize_search_query(raw_query)
    lowered = normalized.lower()
    contextual_only = not normalized or lowered in {
        "this",
        "that",
        "it",
        "this topic",
        "this concept",
        "this diagram",
        "this figure",
        "this image",
        "this architecture",
    }
    if not contextual_only:
        return normalized

    focus_text = " ".join(str(session_state.get("last_focus_text") or "").split())
    if focus_text:
        return focus_text[:220]

    transcript_history = session_state.get("transcript_history") or []
    if transcript_history:
        return " ".join(transcript_history[-3:])[:220]

    return Path(doc_title or "lecture topic").stem.replace("_", " ")


async def _google_custom_search(query: str, max_results: int = 5) -> list[dict]:
    api_key = os.getenv("GOOGLE_SEARCH_API_KEY") or os.getenv("GOOGLE_API_KEY")
    engine_id = os.getenv("GOOGLE_SEARCH_CX") or os.getenv("GOOGLE_SEARCH_ENGINE_ID")
    if not api_key or not engine_id:
        return []

    params = {
        "key": api_key,
        "cx": engine_id,
        "q": query,
        "num": max(1, min(max_results, 10)),
    }
    headers = {"User-Agent": WEB_USER_AGENT}

    async with httpx.AsyncClient(timeout=12.0, headers=headers, follow_redirects=True) as client:
        response = await client.get("https://www.googleapis.com/customsearch/v1", params=params)
        response.raise_for_status()
        payload = response.json()

    items = payload.get("items") or []
    results = []
    for item in items[:max_results]:
        url = item.get("link")
        if not url:
            continue
        host = urlparse(url).netloc.replace("www.", "")
        results.append(
            {
                "title": item.get("title") or url,
                "url": url,
                "snippet": item.get("snippet") or "",
                "displayHost": host,
                "provider": "google",
            }
        )
    return results


async def _duckduckgo_search(query: str, max_results: int = 5) -> list[dict]:
    headers = {"User-Agent": WEB_USER_AGENT}
    search_url = f"https://duckduckgo.com/html/?q={quote_plus(query)}"

    async with httpx.AsyncClient(timeout=12.0, headers=headers, follow_redirects=True) as client:
        response = await client.get(search_url)
        response.raise_for_status()
        document = html.fromstring(response.text)

    links = document.xpath("//a[contains(@class, 'result__a')]")
    snippets = document.xpath("//*[contains(@class, 'result__snippet')]")
    results: list[dict] = []

    for index, link in enumerate(links[:max_results]):
        url = link.get("href") or ""
        title = " ".join(link.text_content().split())
        snippet = " ".join(snippets[index].text_content().split()) if index < len(snippets) else ""
        host = urlparse(url).netloc.replace("www.", "")
        if not url:
            continue
        results.append(
            {
                "title": title or url,
                "url": url,
                "snippet": snippet,
                "displayHost": host,
                "provider": "duckduckgo",
            }
        )
    return results


async def _fetch_web_preview(url: str) -> str:
    if not url.startswith("http"):
        return ""

    headers = {"User-Agent": WEB_USER_AGENT}
    try:
        async with httpx.AsyncClient(timeout=10.0, headers=headers, follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()
    except Exception as exc:
        print(f"Web preview fetch failed for {url}: {exc}")
        return ""

    content_type = response.headers.get("content-type", "")
    if "html" not in content_type:
        return ""

    try:
        document = html.fromstring(response.text)
        for node in document.xpath("//script|//style|//noscript|//header|//footer|//nav|//aside|//form"):
            parent = node.getparent()
            if parent is not None:
                parent.remove(node)
        paragraphs = []
        for node in document.xpath("//main//p | //article//p | //p"):
            text = " ".join(node.text_content().split())
            if len(text) >= 60:
                paragraphs.append(text)
            if len("\n\n".join(paragraphs)) > 2400:
                break
        return "\n\n".join(paragraphs[:6])[:2600]
    except Exception as exc:
        print(f"Web preview parsing failed for {url}: {exc}")
        return ""


async def _perform_web_search(query: str) -> tuple[str, list[dict]]:
    try:
        google_results = await _google_custom_search(query)
        if google_results:
            return "google", google_results
    except Exception as exc:
        print(f"Google custom search unavailable: {exc}")

    try:
        duck_results = await _duckduckgo_search(query)
        if duck_results:
            return "duckduckgo", duck_results
    except Exception as exc:
        print(f"DuckDuckGo search unavailable: {exc}")

    return "none", []


def _normalize_lines(value: str) -> list[str]:
    return [line.strip() for line in (value or "").splitlines() if line.strip()]


def _dedupe_lines(lines: list[str], limit: int) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for line in lines:
        marker = line.lower()
        if marker in seen:
            continue
        seen.add(marker)
        result.append(line)
        if len(result) >= limit:
            break
    return result


def _extract_document_context(doc_id: str, storage_path: str, transcript_history: list[str]) -> str:
    excerpts: list[str] = []
    transcript_query = " ".join(transcript_history[-12:]).strip()

    if transcript_query:
        try:
            vector_db = load_vector_db(doc_id)
            results = vector_db.similarity_search(transcript_query[:1200], k=6)
            for match in results:
                slide = match.metadata.get("slide", "?")
                content = " ".join(str(match.page_content).split())
                if content:
                    excerpts.append(f"Page {slide}: {content}")
        except Exception as exc:
            print(f"Vector excerpt extraction unavailable for summary export: {exc}")

    if not excerpts:
        try:
            reader = PdfReader(storage_path)
            for page_index, page in enumerate(reader.pages[:6], start=1):
                content = " ".join((page.extract_text() or "").split())
                if content:
                    excerpts.append(f"Page {page_index}: {content[:1500]}")
                if sum(len(item) for item in excerpts) > 7000:
                    break
        except Exception as exc:
            print(f"PDF text extraction unavailable for summary export: {exc}")

    return "\n\n".join(excerpts)[:9000]


def _build_fallback_summary(document_title: str, transcript_history: list[str], document_context: str) -> str:
    teacher_points = _dedupe_lines(
        [f"- {line}" for line in transcript_history[-10:] if line.strip()],
        8,
    )
    context_lines = _dedupe_lines(
        [f"- {line}" for line in _normalize_lines(document_context)],
        6,
    )

    sections = [
        "Lecture Overview",
        f"- Summary prepared for {document_title or 'the active lecture document'}.",
        f"- Captured {len(transcript_history)} spoken lecture utterances in this session.",
        "",
        "Key Concepts",
        *(teacher_points or ["- No teacher speech was captured for this session."]),
        "",
        "Teacher Emphasis",
        *(teacher_points[:4] or ["- No repeated teacher emphasis was available."]),
        "",
        "Document Connections",
        *(context_lines or ["- No supporting document excerpts were available."]),
        "",
        "Study Notes",
        "- Review the teacher emphasis items together with the referenced document sections.",
        "- Use the highlighted concepts as the main revision checklist for this lecture.",
    ]
    return "\n".join(sections).strip()


def _build_summary_text(document_title: str, transcript_history: list[str], document_context: str) -> str:
    teacher_speech = "\n".join(_dedupe_lines(transcript_history, 24))
    llm_summary = SUMMARY_REASONER.summarize_lecture(
        document_title=document_title,
        teacher_speech=teacher_speech,
        document_context=document_context,
    )
    return llm_summary or _build_fallback_summary(document_title, transcript_history, document_context)


def _load_pdf_font(size: int, bold: bool = False):
    candidates = [
        "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/calibrib.ttf" if bold else "C:/Windows/Fonts/calibri.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            return ImageFont.truetype(path, size=size)
    return ImageFont.load_default()


def _wrap_for_width(draw: ImageDraw.ImageDraw, text: str, font, max_width: int) -> list[str]:
    if not text:
        return [""]

    lines: list[str] = []
    for paragraph in text.splitlines():
        paragraph = paragraph.rstrip()
        if not paragraph:
            lines.append("")
            continue

        words = paragraph.split()
        current = words[0]
        for word in words[1:]:
            candidate = f"{current} {word}"
            if draw.textlength(candidate, font=font) <= max_width:
                current = candidate
            else:
                lines.append(current)
                current = word
        lines.append(current)
    return lines


def _render_summary_pdf(document_title: str, summary_text: str) -> BytesIO:
    page_width, page_height = 1240, 1754
    margin_x, margin_y = 84, 88
    content_width = page_width - (margin_x * 2)
    title_font = _load_pdf_font(34, bold=True)
    meta_font = _load_pdf_font(18, bold=False)
    body_font = _load_pdf_font(22, bold=False)
    heading_font = _load_pdf_font(24, bold=True)

    pages: list[Image.Image] = []

    def new_page():
        image = Image.new("RGB", (page_width, page_height), "white")
        draw = ImageDraw.Draw(image)
        return image, draw, margin_y

    image, draw, y = new_page()
    draw.text((margin_x, y), "Lecture Summary", fill="#111111", font=title_font)
    y += 54
    draw.text(
        (margin_x, y),
        f"Document: {document_title or 'Untitled document'}",
        fill="#3b4260",
        font=meta_font,
    )
    y += 32
    draw.text(
        (margin_x, y),
        f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        fill="#3b4260",
        font=meta_font,
    )
    y += 44
    draw.line((margin_x, y, page_width - margin_x, y), fill="#d8dcea", width=2)
    y += 28

    for raw_line in summary_text.splitlines():
        stripped = raw_line.strip()
        if not stripped:
            y += 16
            continue

        current_font = heading_font if not stripped.startswith("-") and stripped.endswith(("Overview", "Concepts", "Emphasis", "Connections", "Notes")) else body_font
        wrapped_lines = _wrap_for_width(draw, stripped, current_font, content_width)
        line_height = 34 if current_font is heading_font else 30

        for line in wrapped_lines:
            if y + line_height > page_height - margin_y:
                pages.append(image)
                image, draw, y = new_page()
            draw.text((margin_x, y), line, fill="#111111", font=current_font)
            y += line_height
        y += 8

    pages.append(image)

    pdf_buffer = BytesIO()
    pages[0].save(pdf_buffer, format="PDF", save_all=True, append_images=pages[1:])
    pdf_buffer.seek(0)
    return pdf_buffer

@http_router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_user(user: UserCreate):
    existing_user = await UserCollection.find_one({"email": user.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = get_password_hash(user.password)
    user_dict = user.dict()
    user_dict["password"] = hashed_password 
    user_dict["created_at"] = datetime.now(timezone.utc)
    
    result = await UserCollection.insert_one(user_dict)
    user_dict["id"] = str(result.inserted_id)
    return user_dict

@http_router.post("/login", response_model=Token)
async def login_user(user_credentials: UserLogin):
    user = await UserCollection.find_one({"email": user_credentials.email})
    if not user or not verify_password(user_credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    access_token = create_access_token(data={"sub": user["email"]})
    return {"access_token": access_token, "token_type": "bearer"}

@http_router.get("/me", response_model=UserResponse)
async def get_my_profile(current_user: dict = Depends(get_current_user)):
    return current_user

@http_router.post("/upload")
async def upload_document(
    file: UploadFile = File(...), 
    current_user: dict = Depends(get_current_user)
):
    unique_filename = f"{current_user['id']}_{file.filename}"
    file_path = UPLOAD_DIR / unique_filename
    
    try:
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    finally:
        file.file.close()
        
    doc_metadata = {
        "owner_id": current_user["id"],
        "filename": file.filename,
        "storage_path": str(file_path),
        "content_type": file.content_type,
        "uploaded_at": datetime.now(timezone.utc)
    }
    
    result = await db.documents.insert_one(doc_metadata)
    doc_id = str(result.inserted_id)
    
    # 🔥 AWAIT INGESTION SYNCHRONOUSLY
    # asyncio.to_thread runs the heavy CPU parsing in a separate thread 
    # so it doesn't freeze your entire FastAPI server for other users, 
    # but the API response WILL wait here until it finishes!
    await asyncio.to_thread(process_document_pipeline, str(file_path), doc_id)
    
    return {"id": doc_id, "filename": file.filename}

@http_router.get("/my-docs")
async def get_my_documents(current_user: dict = Depends(get_current_user)):
    cursor = db.documents.find({"owner_id": current_user["id"]}).sort("uploaded_at", -1)
    docs = []
    async for doc in cursor:
        docs.append({
            "id": str(doc["_id"]),
            "filename": doc["filename"],
            "uploaded_at": doc["uploaded_at"]
        })
    return docs

@http_router.get("/doc/{doc_id}")
async def get_document_meta(doc_id: str, current_user: dict = Depends(get_current_user)):
    doc = await db.documents.find_one({"_id": ObjectId(doc_id), "owner_id": current_user["id"]})
    if not doc: raise HTTPException(status_code=404)
    return {"filename": doc["filename"]}

@http_router.get("/view-doc/{doc_id}")
async def serve_secure_pdf(doc_id: str, current_user: dict = Depends(get_current_user)):
    doc = await db.documents.find_one({"_id": ObjectId(doc_id), "owner_id": current_user["id"]})
    if not doc or not os.path.exists(doc["storage_path"]):
        raise HTTPException(status_code=404)
    return FileResponse(path=doc["storage_path"], media_type="application/pdf", filename=doc["filename"])


@http_router.post("/export-lecture-summary/{doc_id}")
async def export_lecture_summary_pdf(doc_id: str, current_user: dict = Depends(get_current_user)):
    doc = await db.documents.find_one({"_id": ObjectId(doc_id), "owner_id": current_user["id"]})
    if not doc or not os.path.exists(doc["storage_path"]):
        raise HTTPException(status_code=404, detail="Document not found")

    primary_client_id = f"{current_user['id']}_{doc_id}"
    fallback_client_id = f"client_{doc_id}"
    session_state = client_states.get(primary_client_id) or client_states.get(fallback_client_id) or {}
    transcript_history = [
        line.strip()
        for line in (session_state.get("transcript_history") or [])
        if str(line).strip()
    ]

    document_context = await asyncio.to_thread(
        _extract_document_context,
        doc_id,
        doc["storage_path"],
        transcript_history,
    )
    summary_text = await asyncio.to_thread(
        _build_summary_text,
        doc["filename"],
        transcript_history,
        document_context,
    )
    pdf_buffer = await asyncio.to_thread(
        _render_summary_pdf,
        doc["filename"],
        summary_text,
    )

    export_name = f"{Path(doc['filename']).stem}_lecture_summary.pdf"
    headers = {"Content-Disposition": f'attachment; filename="{export_name}"'}
    return StreamingResponse(pdf_buffer, media_type="application/pdf", headers=headers)


@http_router.post("/web-search/{doc_id}")
async def web_search_document_context(
    doc_id: str,
    request: WebSearchRequest,
    current_user: dict = Depends(get_current_user),
):
    doc = await db.documents.find_one({"_id": ObjectId(doc_id), "owner_id": current_user["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    session_state = _build_session_search_context(doc_id, current_user)
    resolved_query = _resolve_contextual_web_query(request.query, doc["filename"], session_state)
    provider, results = await _perform_web_search(resolved_query)

    if not results:
        return {
            "mode": "search",
            "provider": provider,
            "query": resolved_query,
            "results": [],
            "selected": None,
        }

    enriched_results = []
    for result in results[:5]:
        preview_text = await _fetch_web_preview(result["url"])
        enriched_results.append({**result, "previewText": preview_text})

    selected = enriched_results[0]
    return {
        "mode": "search",
        "provider": provider,
        "query": resolved_query,
        "results": enriched_results,
        "selected": selected,
    }

import gc

@http_router.delete("/delete-doc/{doc_id}")
async def delete_document(doc_id: str, current_user: dict = Depends(get_current_user)):
    doc = await db.documents.find_one({"_id": ObjectId(doc_id), "owner_id": current_user["id"]})
    if not doc:
        raise HTTPException(status_code=404)
    
    # 1. Delete the physical PDF file
    if os.path.exists(doc["storage_path"]):
        try:
            os.remove(doc["storage_path"])
        except Exception as e:
            print(f"Warning: Could not delete PDF file: {e}")
            
    # 2. Clean up ChromaDB safely to avoid WinError 32
    chroma_path = f"db/chroma/{doc_id}"
    if os.path.exists(chroma_path):
        try:
            from retreival_pipeline import load_vector_db
            vdb = load_vector_db(doc_id)
            vdb.delete_collection() # This deletes the vector data inside Chroma
            
            del vdb
            gc.collect() 
            
            shutil.rmtree(chroma_path) 
            
        except PermissionError:
            print(f"⚠️ Windows File Lock: Could not physically delete folder {chroma_path}. It will be cleaned up later.")
        except Exception as e:
            print(f"⚠️ Error cleaning up Chroma DB: {e}")
    
    # 3. Remove from MongoDB
    await db.documents.delete_one({"_id": ObjectId(doc_id)})
    
    return {"detail": "Document and associated Vector DB deleted successfully"}
