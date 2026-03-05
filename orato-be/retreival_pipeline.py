import re
import string
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma

def load_vector_db(doc_id):
    """Loads the specific vector database for the requested document."""
    embedding_model = HuggingFaceEmbeddings(
        model_name="all-MiniLM-L6-v2"
    )
    vector_db = Chroma(
        collection_name=f"doc_{doc_id}",
        persist_directory=f"db/chroma/{doc_id}",
        embedding_function=embedding_model
    )
    return vector_db

def parse_command(query):
    """Parses queries and intercepts global UI commands before they hit the database."""
    # 1. Clean query of punctuation (STT adds periods that break exact matching)
    query_lower = query.lower().strip()
    query_lower = re.sub(r'[^\w\s]', '', query_lower)
    
    # ---------------------------------------------------------
    # 1. DIRECT UI COMMANDS (Bypass Vector DB entirely)
    # ---------------------------------------------------------
    if any(w in query_lower for w in ["clear", "reset", "remove"]):
        return {"intent": "clear", "is_direct": True}
        
    if "zoom in" in query_lower:
        return {"intent": "zoom_in", "is_direct": True}
        
    if "zoom out" in query_lower:
        return {"intent": "zoom_out", "is_direct": True}
        
    if any(w in query_lower for w in ["next page", "next slide"]):
        return {"intent": "next", "is_direct": True}
        
    if any(w in query_lower for w in ["previous page", "previous slide", "go back"]):
        return {"intent": "prev", "is_direct": True}

    # ---------------------------------------------------------
    # 2. PURE NAVIGATION (e.g., "go to page number 5")
    # ---------------------------------------------------------
    target_slide = None
    
    # Updated regex to gracefully handle "page 6" AND "page number 6"
    slide_match = re.search(r'(?:slide|page)\s+(?:number\s+)?(\d+)', query_lower)
    
    if slide_match:
        target_slide = int(slide_match.group(1))
        
        # Remove the exact navigation phrase to see what's left
        remainder = re.sub(r'(?:on\s+|go\s+to\s+)?(?:slide|page)\s+(?:number\s+)?\d+', '', query_lower).strip()
        
        # If the remaining words are just fluff, it's a pure UI navigation command
        nav_fluff = ["go", "to", "move", "navigate", "open", "show", "me", "please", "can", "you", "lets", "let", "look", "at", "number"]
        clean_remainder = [w for w in remainder.split() if w not in nav_fluff]
        
        if not clean_remainder:
            return {"intent": "navigate", "target_slide": target_slide, "is_direct": True}

    # ---------------------------------------------------------
    # 3. CONTEXTUAL SEARCH (Requires Vector DB)
    # ---------------------------------------------------------
    intent = "navigate" # Default contextual action
    
    if "highlight" in query_lower:
        intent = "highlight"
    elif "zoom" in query_lower: 
        intent = "zoom"
    elif any(w in query_lower for w in ["inspect", "extract", "details"]):
        intent = "inspect"

    # Strip conversational filler before sending to the database
    stop_words = ["zoom", "into", "highlight", "show", "me", "the", "go", "to", "move", "look", "at", "inspect", "see", "lets", "let", "can", "we", "navigate", "find", "where", "is", "please", "number"]
    clean_query = " ".join([word for word in query_lower.split() if word not in stop_words])
    
    if not clean_query.strip():
        clean_query = query # fallback
        
    return {
        "intent": intent,
        "clean_query": clean_query,
        "target_slide": target_slide,
        "is_direct": False
    }
def merge_bboxes(bboxes):
    if not bboxes:
        return [0,0,0,0]

    x_min = min(b[0] for b in bboxes)
    y_min = min(b[1] for b in bboxes)

    x_max = max(b[0] + b[2] for b in bboxes)
    y_max = max(b[1] + b[3] for b in bboxes)

    return [
        x_min,
        y_min,
        x_max - x_min,
        y_max - y_min
    ]


def retrieve(query, vector_db, k=8, current_slide=None):
    parsed = parse_command(query)
    intent = parsed["intent"]

    # ---------------------------
    # DIRECT COMMAND FAST PATH
    # ---------------------------
    if parsed.get("is_direct"):
        return {
            "intent": intent,
            "slide": parsed.get("target_slide"),
            "bbox": [0, 0, 0, 0],
            "type": "control",
            "content": f"Executing UI command: {intent}",
            "section": "general",
            "title": "Control Command",
            "imageInd": 0
        }

    clean_query = parsed["clean_query"]
    target_slide = parsed["target_slide"]

    filter_dict = {"slide": target_slide} if target_slide else None

    results = vector_db.similarity_search(
        clean_query,
        k=k,
        filter=filter_dict
    )

    if not results:
        return None

    # ---------------------------
    # Intent filtering
    # ---------------------------
    if intent in ["zoom", "inspect"]:
        filtered = [r for r in results if r.metadata.get("type") == "image"]
        results = filtered if filtered else results

    elif intent == "highlight":
        filtered = [r for r in results if r.metadata.get("type") == "text"]
        results = filtered if filtered else results

    # ---------------------------
    # Determine which slide to focus on
    # ---------------------------
    if target_slide:
        focus_slide = target_slide
    elif current_slide:
        focus_slide = current_slide
    else:
        focus_slide = results[0].metadata["slide"]

    # ---------------------------
    # Filter results to focus slide
    # ---------------------------
    slide_results = [
        r for r in results if r.metadata.get("slide") == focus_slide
    ]

    # If no matches on current slide, fallback to best global result
    if not slide_results:
        slide_results = [results[0]]

    # ---------------------------
    # Merge bbox of top semantic matches
    # ---------------------------
    top_results = slide_results[:3]

    bboxes = [
        r.metadata.get("bbox", [0, 0, 0, 0])
        for r in top_results
    ]

    merged_bbox = merge_bboxes(bboxes)

    best = top_results[0]

    meta_id = best.metadata.get("id", "obj_0")
    image_ind = int(meta_id.split("_")[-1]) if meta_id.startswith("obj_") else 0

    return {
        "intent": intent,
        "content": best.page_content,
        "slide": focus_slide,
        "bbox": merged_bbox,
        "type": best.metadata.get("type", "text"),
        "section": best.metadata.get("section", "general"),
        "title": best.metadata.get("title", "Untitled"),
        "imageInd": image_ind
    }