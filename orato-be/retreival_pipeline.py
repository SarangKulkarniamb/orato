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


def detect_intent(query):
    query = query.lower()

    if any(word in query for word in [
        "zoom", "focus", "look at", "show", "see", "display"
    ]):
        return "zoom"

    if any(word in query for word in [
        "figure", "diagram", "graph", "flowchart", "image"
    ]):
        return "zoom"

    if any(word in query for word in [
        "highlight", "mark", "underline"
    ]):
        return "highlight"

    if any(word in query for word in [
        "go to", "move to", "open"
    ]):
        return "navigate"

    return "search"


def filter_results(results, intent):
    if intent == "zoom":
        results = [r for r in results if r.metadata["type"] == "image"] or results

    elif intent == "highlight":
        results = [r for r in results if r.metadata["type"] == "text"] or results

    return results


def retrieve(query, vector_db, k=5):
    intent = detect_intent(query)

    results = vector_db.similarity_search(query, k=k)

    results = filter_results(results, intent)

    if not results:
        return None

    best = results[0]

    response = {
        "intent": intent,
        "content": best.page_content,
        "slide": best.metadata["slide"],
        "bbox": best.metadata["bbox"],
        "type": best.metadata["type"],
        "section": best.metadata.get("section", "general"),
        "title": best.metadata.get("title")
    }

    return response


if __name__ == "__main__":
    vector_db = load_vector_db()

    while True:
        query = input("\nEnter query: ")

        result = retrieve(query, vector_db)

        if result:
            print("\n--- RESULT ---")
            print(f"Intent   : {result['intent']}")
            print(f"Slide    : {result['slide']}")
            print(f"Type     : {result['type']}")
            print(f"Section  : {result['section']}")
            print(f"BBOX     : {result['bbox']}")
            print(f"Title    : {result['title']}")
            print(f"Content  : {result['content'][:200]}...")
        else:
            print("No result found")