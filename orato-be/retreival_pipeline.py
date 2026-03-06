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


def retrieve(query, vector_db, k=8, current_slide=None):
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
    
    # --- STRICT IMAGE KEYWORD CHECK ---
    IMAGE_KEYWORDS = ["image", "diagram", "figure", "picture", "graph", "chart", "flowchart", "schematic", "plot"]
    has_image_keyword = any(w in clean_query.lower() for w in IMAGE_KEYWORDS)

    if intent == "inspect" and not has_image_keyword:
        intent = "highlight"

    filter_dict = {"slide": target_slide} if target_slide else None
    results_with_scores = vector_db.similarity_search_with_score(
        clean_query, 
        k=k, 
        filter=filter_dict
    )

    if not results_with_scores:
        return None
    
    filtered_results = []
    if intent == "inspect":
        filtered_results = [(d, s) for d, s in results_with_scores if d.metadata.get("type") == "image"]
    elif intent == "highlight":
        filtered_results = [(d, s) for d, s in results_with_scores if d.metadata.get("type") == "text"]
    elif intent == "zoom":
        if has_image_keyword:
            filtered_results = [(d, s) for d, s in results_with_scores if d.metadata.get("type") == "image"]
        else:
            filtered_results = [(d, s) for d, s in results_with_scores if d.metadata.get("type") == "text"]
    
    if not filtered_results:
        filtered_results = results_with_scores

    # 3. 🔥 DYNAMIC CONTEXT BOOSTING 🔥
    best_match = None
    best_adjusted_score = float('inf')

    for doc, raw_score in filtered_results:
        adjusted_score = raw_score
        
        if current_slide and not target_slide and doc.metadata.get("slide") == current_slide:
            adjusted_score = raw_score * 0.75 

        if adjusted_score < best_adjusted_score:
            best_adjusted_score = adjusted_score
            best_match = doc

    # We grab the exact slide and exact bounding box of the winner. No messy merging!
    focus_slide = best_match.metadata["slide"]
    final_bbox = best_match.metadata.get("bbox", [0, 0, 0, 0])
    
    image_ind = best_match.metadata.get("image_ind", 0)

    return {
        "intent": intent,
        "content": best_match.page_content,
        "slide": focus_slide,
        "bbox": final_bbox,
        "type": best_match.metadata.get("type", "text"),
        "section": best_match.metadata.get("section", "general"),
        "title": best_match.metadata.get("title", "Untitled"),
        "imageInd": image_ind
    }

if __name__ == "__main__":
    test_doc_id = input("Enter a doc_id to test local retrieval: ")
    try:
        vector_db = load_vector_db(test_doc_id)
        while True:
            query = input("\nEnter query: ")
            result = retrieve(query, vector_db, current_slide=None) 
            if result:
                print("\n--- RESULT ---")
                for key, value in result.items():
                    if key == "content" and value and len(str(value)) > 100:
                        print(f"{key.capitalize():<10}: {str(value)[:100]}...")
                    else:
                        print(f"{key.capitalize():<10}: {value}")
            else:
                print("No result found")
    except Exception as e:
        print(f"Could not load Vector DB for {test_doc_id}: {e}")