import re
import string

from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings

from llm_command_router import LocalIntentClassifier


COMMAND_LLM = LocalIntentClassifier()

DIRECT_CONTROL_PATTERNS = (
    ("clear", ("clear", "reset", "remove")),
    ("zoom_in", ("zoom in", "increase zoom")),
    ("zoom_out", ("zoom out", "decrease zoom")),
    ("next", ("next page", "next slide")),
    ("prev", ("previous page", "previous slide", "go back")),
)

EXPLICIT_INTENT_PATTERNS = {
    "highlight": (
        "highlight",
        "point out",
        "mark",
        "underline",
        "spotlight",
    ),
    "zoom": (
        "zoom",
        "closer look",
        "look closer",
        "focus on",
        "magnify",
    ),
    "inspect": (
        "inspect",
        "extract",
        "drill into",
    ),
    "navigate": (
        "go to",
        "navigate to",
        "move to",
        "take me to",
        "open slide",
        "open page",
        "show slide",
        "show page",
    ),
}

CONVERSATIONAL_INTENT_PATTERNS = {
    "inspect": (
        "what does",
        "what is in",
        "explain",
        "walk me through",
        "break down",
        "help me understand",
    ),
    "zoom": (
        "hard to read",
        "too small",
        "cant read",
        "cannot read",
    ),
    "highlight": (
        "where does it say",
        "which line says",
        "point me to",
    ),
    "navigate": (
        "the part where",
        "the part about",
        "the slide about",
        "the slide on",
        "section about",
        "section on",
        "the one about",
    ),
}

QUERY_FILLER_PHRASES = (
    "take a closer look at",
    "take a closer look",
    "closer look at",
    "look closer at",
    "focus on",
    "point out",
    "take me to",
    "go to",
    "navigate to",
    "move to",
    "show me",
    "show us",
    "show",
    "open",
    "walk me through",
    "tell me about",
    "can you",
    "could you",
    "would you",
    "can we",
    "could we",
    "would we",
    "please",
)

QUERY_STOP_WORDS = {
    "a",
    "an",
    "at",
    "current",
    "does",
    "find",
    "go",
    "highlight",
    "inspect",
    "into",
    "is",
    "let",
    "lets",
    "look",
    "me",
    "move",
    "navigate",
    "on",
    "page",
    "please",
    "part",
    "see",
    "show",
    "slide",
    "the",
    "this",
    "to",
    "we",
    "what",
    "where",
    "you",
    "zoom",
}


def load_vector_db(doc_id):
    embedding_model = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")
    vector_db = Chroma(
        collection_name=f"doc_{doc_id}",
        persist_directory=f"db/chroma/{doc_id}",
        embedding_function=embedding_model,
    )
    return vector_db


def warmup_command_llm():
    try:
        COMMAND_LLM.warmup()
    except Exception as exc:
        print(f"WARNING: Command LLM warmup skipped: {exc}")


def _extract_slide(query_lower):
    slide_match = re.search(r"\b(?:slide|page)\s+(?:number\s+)?(\d+)\b", query_lower)
    return int(slide_match.group(1)) if slide_match else None


def _strip_slide_reference(query_lower):
    return re.sub(r"\b(?:on\s+)?(?:go\s+to\s+)?(?:slide|page)\s+(?:number\s+)?\d+\b", "", query_lower).strip()


def _is_pure_slide_navigation(query_lower, target_slide):
    if not target_slide:
        return False

    remainder = _strip_slide_reference(query_lower)
    nav_fluff = {
        "go",
        "to",
        "move",
        "navigate",
        "open",
        "show",
        "me",
        "please",
        "can",
        "you",
        "lets",
        "let",
        "look",
        "at",
        "number",
    }
    clean_remainder = [word for word in remainder.split() if word not in nav_fluff]
    return not clean_remainder


def _match_explicit_intent(query_lower):
    for intent, phrases in EXPLICIT_INTENT_PATTERNS.items():
        if any(phrase in query_lower for phrase in phrases):
            return intent
    return None


def _match_conversational_intent(query_lower):
    for intent, phrases in CONVERSATIONAL_INTENT_PATTERNS.items():
        if any(phrase in query_lower for phrase in phrases):
            return intent
    return None


def _normalize_search_query(query, query_lower):
    clean_query = query_lower
    for phrase in QUERY_FILLER_PHRASES:
        clean_query = clean_query.replace(phrase, " ")

    clean_query = _strip_slide_reference(clean_query)
    clean_query = re.sub(rf"[{re.escape(string.punctuation)}]", " ", clean_query)
    clean_query = " ".join(word for word in clean_query.split() if word not in QUERY_STOP_WORDS)
    clean_query = re.sub(r"\s+", " ", clean_query).strip()
    return clean_query or query


def _infer_intent_with_llm(query):
    try:
        return COMMAND_LLM.classify_if_ready(query)
    except Exception as exc:
        print(f"WARNING: Command LLM inference failed: {exc}")
        return None


def parse_command(query):
    normalized_query = re.sub(r"\s+", " ", query.lower().strip())
    match_query = re.sub(rf"[{re.escape(string.punctuation)}]", " ", normalized_query)
    match_query = re.sub(r"\s+", " ", match_query).strip()

    for intent, phrases in DIRECT_CONTROL_PATTERNS:
        if any(phrase in match_query for phrase in phrases):
            return {"intent": intent, "is_direct": True, "parser_source": "rules"}

    target_slide = _extract_slide(match_query)
    if _is_pure_slide_navigation(match_query, target_slide):
        return {
            "intent": "navigate",
            "target_slide": target_slide,
            "is_direct": True,
            "parser_source": "rules",
        }

    intent = _match_explicit_intent(match_query)
    parser_source = "rules"

    if not intent:
        intent = _match_conversational_intent(match_query)
        if intent:
            parser_source = "rules_conversational"
        else:
            intent = _infer_intent_with_llm(query) or "navigate"
        if not intent:
            intent = "navigate"
        if parser_source == "rules_conversational":
            pass
        elif COMMAND_LLM.is_ready():
            parser_source = "llm"
        else:
            parser_source = "rules_fallback"

    clean_query = _normalize_search_query(query, normalized_query)

    return {
        "intent": intent,
        "clean_query": clean_query,
        "target_slide": target_slide,
        "is_direct": False,
        "parser_source": parser_source,
    }


def retrieve(query, vector_db, k=6, current_slide=None):
    parsed = parse_command(query)
    intent = parsed["intent"]
    parser_source = parsed.get("parser_source", "rules")

    print(f"[PARSER] Selected '{intent}' via {parser_source}")

    if parsed.get("is_direct"):
        return {
            "intent": intent,
            "slide": parsed.get("target_slide"),
            "bbox": [0, 0, 0, 0],
            "type": "control",
            "content": f"Executing UI command: {intent}",
            "section": "general",
            "title": "Control Command",
            "imageInd": 0,
            "parserSource": parser_source,
        }

    clean_query = parsed["clean_query"]
    target_slide = parsed["target_slide"]
    results = []
    focus_slide = None

    if current_slide and not target_slide:
        local_results = vector_db.similarity_search_with_score(
            clean_query,
            k=k,
            filter={"slide": current_slide},
        )

        valid_local = [result for result, score in local_results if score < 1.35]

        if valid_local:
            print(f"[SEARCH] Strict local match on slide {current_slide}")
            results = valid_local
            focus_slide = current_slide
        else:
            print(f"[SEARCH] No local match on slide {current_slide}; using global search")

    if not results:
        filter_dict = {"slide": target_slide} if target_slide else None
        global_results = vector_db.similarity_search(clean_query, k=k, filter=filter_dict)

        if not global_results:
            return None

        results = global_results
        focus_slide = results[0].metadata["slide"]

    if intent in ["zoom", "inspect"]:
        filtered = [result for result in results if result.metadata.get("type") == "image"]
        results = filtered if filtered else results
    elif intent == "highlight":
        filtered = [result for result in results if result.metadata.get("type") == "text"]
        results = filtered if filtered else results

    slide_results = [result for result in results if result.metadata.get("slide") == focus_slide]
    if not slide_results:
        slide_results = [results[0]]

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
        "imageInd": image_ind,
        "parserSource": parser_source,
    }
