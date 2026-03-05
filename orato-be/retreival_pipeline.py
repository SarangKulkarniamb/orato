import re
import string
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma

def load_vector_db(doc_id):
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
    query_lower = query.lower().strip()
    query_lower = re.sub(r'[^\w\s]', '', query_lower)
    
    # 1. DIRECT UI COMMANDS
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

    # 2. PURE NAVIGATION
    target_slide = None
    slide_match = re.search(r'(?:slide|page)\s+(?:number\s+)?(\d+)', query_lower)
    
    if slide_match:
        target_slide = int(slide_match.group(1))
        remainder = re.sub(r'(?:on\s+|go\s+to\s+)?(?:slide|page)\s+(?:number\s+)?\d+', '', query_lower).strip()
        nav_fluff = ["go", "to", "move", "navigate", "open", "show", "me", "please", "can", "you", "lets", "let", "look", "at", "number"]
        clean_remainder = [w for w in remainder.split() if w not in nav_fluff]
        if not clean_remainder:
            return {"intent": "navigate", "target_slide": target_slide, "is_direct": True}

    # 3. CONTEXTUAL SEARCH
    intent = "navigate"
    if "highlight" in query_lower: intent = "highlight"
    elif "zoom" in query_lower: intent = "zoom"
    elif any(w in query_lower for w in ["inspect", "extract", "details"]): intent = "inspect"

    stop_words = ["zoom", "into", "highlight", "show", "me", "the", "go", "to", "move", "look", "at", "inspect", "see", "lets", "let", "can", "we", "navigate", "find", "where", "is", "please", "number"]
    clean_query = " ".join([word for word in query_lower.split() if word not in stop_words])
    
    if not clean_query.strip():
        clean_query = query 
        
    return {
        "intent": intent,
        "clean_query": clean_query,
        "target_slide": target_slide,
        "is_direct": False
    }


def retrieve(query, vector_db, k=6, current_slide=None):
    parsed = parse_command(query)
    intent = parsed["intent"]

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
    results = []
    focus_slide = None

    # --- 🔥 STRICT LOCAL SEARCH 🔥 ---
    # If the user doesn't specify a page, strictly check the current page first.
    if current_slide and not target_slide:
        local_results = vector_db.similarity_search_with_score(
            clean_query, 
            k=k, 
            filter={"slide": current_slide}
        )
        
        # A distance score < 1.35 is a confident match in all-MiniLM-L6-v2
        valid_local = [r for r, score in local_results if score < 1.35]
        
        if valid_local:
            print(f"📍 STRICT LOCAL MATCH: Staying on Slide {current_slide}")
            results = valid_local
            focus_slide = current_slide
        else:
            print(f"⏭️ NO LOCAL MATCH: Moving away from Slide {current_slide} to global search")

    # --- 🌍 GLOBAL SEARCH FALLBACK ---
    if not results:
        filter_dict = {"slide": target_slide} if target_slide else None
        global_results = vector_db.similarity_search(clean_query, k=k, filter=filter_dict)
        
        if not global_results:
            return None
            
        results = global_results
        focus_slide = results[0].metadata["slide"]

    # --- INTENT FILTERING ---
    if intent in ["zoom", "inspect"]:
        filtered = [r for r in results if r.metadata.get("type") == "image"]
        results = filtered if filtered else results
    elif intent == "highlight":
        filtered = [r for r in results if r.metadata.get("type") == "text"]
        results = filtered if filtered else results

    # Ensure we only process results on the chosen focus slide
    slide_results = [r for r in results if r.metadata.get("slide") == focus_slide]
    if not slide_results:
        slide_results = [results[0]]

    # 🔥 FIX: Stop merging bboxes! Take the absolute best chunk's exact bounding box.
    best = slide_results[0]
    final_bbox = best.metadata.get("bbox", [0, 0, 0, 0])
    
    meta_id = best.metadata.get("id", "obj_0")
    image_ind = int(meta_id.split("_")[-1]) if meta_id.startswith("obj_") else 0

    return {
        "intent": intent,
        "content": best.page_content,
        "slide": focus_slide,
        "bbox": final_bbox,
        "type": best.metadata.get("type", "text"),
        "section": best.metadata.get("section", "general"),
        "title": best.metadata.get("title", "Untitled"),
        "imageInd": image_ind
    }