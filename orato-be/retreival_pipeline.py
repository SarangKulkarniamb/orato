import re
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_chroma import Chroma

def load_vector_db():
    embedding_model = HuggingFaceEmbeddings(
        model_name="all-MiniLM-L6-v2"
    )
    vector_db = Chroma(
        collection_name="ppt_assistant",
        persist_directory="db/chroma",
        embedding_function=embedding_model
    )
    return vector_db


def parse_command(query):
    """Parses queries and intercepts global UI commands before they hit the database."""
    query_lower = query.lower().strip()
    
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
    # 2. PURE NAVIGATION (e.g., "go to page 5")
    # ---------------------------------------------------------
    target_slide = None
    slide_match = re.search(r'(?:slide|page)\s+(\d+)', query_lower)
    
    if slide_match:
        target_slide = int(slide_match.group(1))
        # Remove the slide reference to see what's left
        remainder = re.sub(r'(?:on\s+|go\s+to\s+)?(?:slide|page)\s+\d+', '', query_lower).strip()
        
        # If the remaining words are just fluff, it's a pure navigation command
        nav_fluff = ["go", "to", "move", "navigate", "open", "show", "me", "please", "can", "you", "let's", "lets", "look", "at"]
        clean_remainder = [w for w in remainder.split() if w not in nav_fluff]
        
        if not clean_remainder:
            return {"intent": "navigate", "target_slide": target_slide, "is_direct": True}

    # ---------------------------------------------------------
    # 3. CONTEXTUAL SEARCH (Requires Vector DB)
    # ---------------------------------------------------------
    intent = "navigate" # Default contextual action
    
    if "highlight" in query_lower:
        intent = "highlight"
    elif "zoom" in query_lower: # e.g., "zoom into the diagram"
        intent = "zoom"
    elif any(w in query_lower for w in ["inspect", "extract", "details"]):
        intent = "inspect"

    # Strip conversational filler before sending to the database
    stop_words = ["zoom", "into", "highlight", "show", "me", "the", "go", "to", "move", "look", "at", "inspect", "see", "let's", "lets", "can", "we", "navigate", "find", "where", "is", "please"]
    clean_query = " ".join([word for word in query_lower.split() if word not in stop_words])
    
    if not clean_query.strip():
        clean_query = query # fallback
        
    return {
        "intent": intent,
        "clean_query": clean_query,
        "target_slide": target_slide,
        "is_direct": False
    }


def retrieve(query, vector_db, k=5):
    parsed = parse_command(query)
    intent = parsed["intent"]

    # --- Direct Actions Fast-Path ---
    if parsed.get("is_direct"):
        return {
            "intent": intent,
            "slide": parsed.get("target_slide"), # Populated for pure 'navigate'
            "bbox": [0, 0, 0, 0],
            "type": "control",
            "content": f"Executing UI command: {intent}",
            # These keys prevent FastAPI KeyError crashes
            "section": "general",
            "title": "Control Command",
            "imageInd": 0 
        }

    # --- Vector Search Slow-Path ---
    clean_query = parsed["clean_query"]
    target_slide = parsed["target_slide"]
    
    filter_dict = {"slide": target_slide} if target_slide else None
    results = vector_db.similarity_search(clean_query, k=k, filter=filter_dict)

    if not results:
        return None

    # Filter based on intent
    if intent in ["zoom", "inspect"]:
        filtered = [r for r in results if r.metadata.get("type") == "image"]
        results = filtered if filtered else results
    elif intent == "highlight":
        filtered = [r for r in results if r.metadata.get("type") == "text"]
        results = filtered if filtered else results

    best = results[0]
    meta_id = best.metadata.get("id", "obj_0")
    image_ind = int(meta_id.split("_")[-1]) if meta_id.startswith("obj_") else 0

    return {
        "intent": intent,
        "content": best.page_content,
        "slide": best.metadata["slide"],
        "bbox": best.metadata.get("bbox", [0, 0, 0, 0]),
        "type": best.metadata.get("type", "text"),
        "section": best.metadata.get("section", "general"),
        "title": best.metadata.get("title", "Untitled"),
        "imageInd": image_ind
    }


if __name__ == "__main__":
    vector_db = load_vector_db()
    while True:
        query = input("\nEnter query: ")
        result = retrieve(query, vector_db)
        if result:
            print("\n--- RESULT ---")
            for key, value in result.items():
                if key == "content" and value and len(str(value)) > 100:
                    print(f"{key.capitalize():<10}: {str(value)[:100]}...")
                else:
                    print(f"{key.capitalize():<10}: {value}")
        else:
            print("No result found")