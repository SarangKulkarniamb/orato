import re
from functools import lru_cache

from langchain_chroma import Chroma
from langchain_huggingface import HuggingFaceEmbeddings

from llm_reasoner import LLMCommandReasoner


IMAGE_KEYWORDS = {
    "image",
    "diagram",
    "figure",
    "picture",
    "graph",
    "chart",
    "flowchart",
    "schematic",
    "plot",
}

VISUAL_INSPECT_VERBS = {
    "inspect",
    "show",
    "show me",
    "see",
    "open",
    "expand",
    "enlarge",
    "extract",
    "details",
    "detail",
    "focus on",
}

WEB_SEARCH_PHRASES = {
    "google",
    "google this",
    "search google",
    "search the web",
    "search web",
    "search online",
    "look up",
    "look this up",
    "look that up",
    "web search",
    "internet search",
    "online search",
}

NAV_FLUFF = {
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
    "the",
    "now",
    "we",
    "will",
    "a",
    "an",
    "is",
    "this",
    "that",
    "for",
}

STOP_WORDS = {
    "zoom",
    "into",
    "highlight",
    "show",
    "me",
    "the",
    "go",
    "to",
    "move",
    "look",
    "at",
    "inspect",
    "see",
    "lets",
    "let",
    "can",
    "we",
    "navigate",
    "find",
    "where",
    "is",
    "please",
    "number",
    "on",
    "page",
    "slide",
    "a",
    "an",
    "of",
    "and",
}

CONTEXTUAL_REFERENCE_WORDS = {
    "this",
    "that",
    "these",
    "those",
    "here",
    "there",
    "it",
    "current",
}

CURRENT_PAGE_PHRASES = {
    "this page",
    "this slide",
    "on this page",
    "on this slide",
    "current page",
    "current slide",
}

HIGHLIGHT_CUE_PHRASES = {
    "highlight",
    "show me",
    "find",
    "where is",
    "wheres",
    "point to",
    "focus on",
    "mark",
}

EXPLICIT_JUMP_PHRASES = {
    "go to",
    "jump to",
    "move to",
    "navigate to",
    "switch to",
    "take me to",
    "open slide",
    "open page",
}

NON_HIGHLIGHT_INTENTS = {
    "clear",
    "next",
    "prev",
    "zoom",
    "zoom_in",
    "zoom_out",
    "inspect",
    "web_search",
    "search_mode",
    "document_mode",
    "open_result",
}

NON_HIGHLIGHT_QUERY_PHRASES = {
    "thank you",
    "thanks",
    "hello",
    "hi everyone",
    "good morning",
    "good afternoon",
    "good evening",
}

CLASSROOM_CHAT_LEADINS = {
    "do you",
    "did you",
    "can anyone",
    "can you",
    "are you",
    "have you",
    "will you",
    "could you",
    "would you",
    "who can",
    "who remembers",
    "anyone",
    "everybody",
    "everyone",
}

AUDIENCE_WORDS = {
    "anyone",
    "students",
    "student",
    "class",
    "guys",
    "everyone",
    "everybody",
    "kids",
}

CLASSROOM_PERSON_FOCUSED_LEADINS = {
    "what are you",
    "why are you",
    "where are you",
    "who are you",
    "what were you",
    "why were you",
    "what are they",
    "why are they",
}

CLASSROOM_BEHAVIOR_WORDS = {
    "doing",
    "talking",
    "speaking",
    "laughing",
    "sitting",
    "standing",
    "listening",
    "playing",
    "back",
    "front",
    "there",
}

COMMAND_REASONER = LLMCommandReasoner()


@lru_cache(maxsize=1)
def _get_embedding_model():
    return HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")


_VECTOR_DB_CACHE: dict[str, Chroma] = {}

def load_vector_db(doc_id):
    """Loads the specific vector database for the requested document."""
    if doc_id in _VECTOR_DB_CACHE:
        return _VECTOR_DB_CACHE[doc_id]

    vector_db = Chroma(
        collection_name=f"doc_{doc_id}",
        persist_directory=f"db/chroma/{doc_id}",
        embedding_function=_get_embedding_model(),
    )
    _VECTOR_DB_CACHE[doc_id] = vector_db
    return vector_db


def _normalize_query(query: str) -> str:
    return re.sub(r"[^\w\s]", "", (query or "").lower().strip())


def _semantic_terms(query: str) -> list[str]:
    normalized = _normalize_query(query)
    return [
        word
        for word in normalized.split()
        if word not in STOP_WORDS and word not in NAV_FLUFF and len(word) > 2 and not word.isdigit()
    ]


def _infer_target_type(intent: str, clean_query: str) -> str:
    has_image_keyword = any(word in (clean_query or "").lower() for word in IMAGE_KEYWORDS)

    if intent == "inspect":
        return "image"
    if intent == "highlight":
        return "text"
    if intent == "zoom":
        return "image" if has_image_keyword else "text"
    if intent == "web_search":
        return "auto"
    if has_image_keyword:
        return "image"
    return "auto"


def _build_direct_response(intent: str, target_slide=None):
    return {
        "intent": intent,
        "slide": target_slide,
        "bbox": [0, 0, 0, 0],
        "type": "control",
        "content": f"Executing UI command: {intent}",
        "section": "general",
        "title": "Control Command",
        "imageInd": 0,
    }


def _build_web_search_response(query: str, target_slide=None):
    return {
        "intent": "web_search",
        "slide": target_slide,
        "bbox": [0, 0, 0, 0],
        "type": "web",
        "content": query,
        "section": "web",
        "title": "Web Search",
        "imageInd": 0,
    }


def _build_mode_response(intent: str):
    return {
        "intent": intent,
        "slide": None,
        "bbox": [0, 0, 0, 0],
        "type": "control",
        "content": "",
        "section": "mode",
        "title": "Viewer Mode",
        "imageInd": 0,
    }


def _build_match_response(intent: str, best_match):
    image_ind = best_match.metadata.get("image_ind", 0)
    return {
        "intent": intent,
        "content": best_match.page_content,
        "slide": best_match.metadata["slide"],
        "bbox": best_match.metadata.get("bbox", [0, 0, 0, 0]),
        "type": best_match.metadata.get("type", "text"),
        "section": best_match.metadata.get("section", "general"),
        "title": best_match.metadata.get("title", "Untitled"),
        "imageInd": image_ind,
    }


def _has_current_page_reference(query_lower: str) -> bool:
    if any(phrase in query_lower for phrase in CURRENT_PAGE_PHRASES):
        return True

    words = set(query_lower.split())
    return bool(words & {"here", "current"})


def _has_highlight_cue(query_lower: str) -> bool:
    return any(phrase in query_lower for phrase in HIGHLIGHT_CUE_PHRASES)


def _has_visual_reference(query_lower: str) -> bool:
    return any(word in query_lower for word in IMAGE_KEYWORDS)


def _has_visual_inspect_verb(query_lower: str) -> bool:
    return any(phrase in query_lower for phrase in VISUAL_INSPECT_VERBS)


def _is_web_search_candidate(query: str) -> bool:
    query_lower = _normalize_query(query)
    semantic_terms = _semantic_terms(query)
    if any(phrase in query_lower for phrase in WEB_SEARCH_PHRASES):
        return True
    if (
        query_lower.startswith("search this")
        or query_lower.startswith("search that")
        or query_lower.startswith("search it")
    ):
        return True

    search_verb_present = any(
        phrase in query_lower
        for phrase in [
            " search ",
            "search ",
            "google ",
            "look up ",
            "lookup ",
        ]
    )
    if search_verb_present and len(semantic_terms) >= 2:
        return True

    return False


def _is_visual_inspect_candidate(query: str) -> bool:
    query_lower = _normalize_query(query)
    return _has_visual_reference(query_lower) and _has_visual_inspect_verb(query_lower)


def _has_explicit_jump_phrase(query_lower: str) -> bool:
    return any(phrase in query_lower for phrase in EXPLICIT_JUMP_PHRASES)


def _looks_like_plain_speech(query_lower: str) -> bool:
    return any(phrase in query_lower for phrase in NON_HIGHLIGHT_QUERY_PHRASES)


def _is_probably_classroom_chatter(query: str) -> bool:
    raw_query = (query or "").strip().lower()
    query_lower = _normalize_query(query)

    if not query_lower:
        return False

    if _is_web_search_candidate(query):
        return False

    if _has_current_page_reference(query_lower) or _has_highlight_cue(query_lower) or _has_explicit_jump_phrase(query_lower):
        return False

    if any(phrase in query_lower for phrase in NON_HIGHLIGHT_QUERY_PHRASES):
        return True

    if any(raw_query.startswith(lead) for lead in CLASSROOM_CHAT_LEADINS):
        return True

    if any(raw_query.startswith(lead) for lead in CLASSROOM_PERSON_FOCUSED_LEADINS):
        return True

    words = set(query_lower.split())
    if words & AUDIENCE_WORDS and any(token in words for token in {"remember", "study", "studied", "understand", "recall", "answer", "tell"}):
        return True

    has_explicit_doc_signal = (
        _has_current_page_reference(query_lower)
        or _has_highlight_cue(query_lower)
        or _is_visual_inspect_candidate(query)
    )
    if "you" in words and words & CLASSROOM_BEHAVIOR_WORDS and not has_explicit_doc_signal:
        return True

    return False


def _search_results(vector_db, clean_query: str, k: int = 8, slide: int | None = None):
    filter_dict = {"slide": slide} if slide else None
    return vector_db.similarity_search_with_score(clean_query, k=k, filter=filter_dict)


def _build_session_context(session_state: dict | None) -> str:
    if not session_state:
        return ""

    recent_utterances = session_state.get("recent_utterances") or []
    recent_text = " | ".join(str(item).strip() for item in recent_utterances[-4:] if str(item).strip())
    doc_focus_score = session_state.get("doc_focus_score", 0)
    active_page = session_state.get("active_page")

    parts = [
        f"doc_focus_score={doc_focus_score}",
        f"active_page={active_page}" if active_page else "",
        f"recent_utterances={recent_text}" if recent_text else "",
    ]
    return "; ".join(part for part in parts if part)


def _has_explicit_document_signal(query: str, intent: str = "navigate", target_slide: int | None = None) -> bool:
    query_lower = _normalize_query(query)
    return any(
        [
            bool(target_slide),
            intent in {"highlight", "zoom", "inspect", "web_search"},
            _has_current_page_reference(query_lower),
            _has_highlight_cue(query_lower),
            _has_visual_reference(query_lower),
            _has_explicit_jump_phrase(query_lower),
            _is_web_search_candidate(query),
        ]
    )


def _has_strong_document_signal(query: str, session_state: dict | None = None) -> bool:
    query_lower = _normalize_query(query)
    semantic_terms = _semantic_terms(query)
    doc_focus_score = int((session_state or {}).get("doc_focus_score", 0))

    if _is_probably_classroom_chatter(query):
        return False

    if _is_visual_inspect_candidate(query):
        return True

    if _has_explicit_document_signal(query):
        return True

    if len(semantic_terms) >= 5:
        return True

    if doc_focus_score >= 1 and len(semantic_terms) >= 3:
        return True

    return False


def _should_prefer_llm_for_final(query: str, session_state: dict | None = None) -> bool:
    if not COMMAND_REASONER.is_available:
        return False

    if _is_web_search_candidate(query):
        return False

    if _is_probably_classroom_chatter(query):
        return True

    return not _has_strong_document_signal(query, session_state=session_state)


def _has_strong_preview_signal(query: str, session_state: dict | None = None) -> bool:
    query_lower = _normalize_query(query)
    doc_focus_score = int((session_state or {}).get("doc_focus_score", 0))
    semantic_terms = _semantic_terms(query)

    if _is_probably_classroom_chatter(query):
        return False

    if _has_current_page_reference(query_lower) or _has_highlight_cue(query_lower) or _is_visual_inspect_candidate(query):
        return True

    if doc_focus_score >= 2 and len(semantic_terms) >= 4:
        return True

    return False

def parse_command(query, session_state: dict | None = None):
    query_lower = _normalize_query(query)
    words = query_lower.split()
    viewer_mode = str((session_state or {}).get("viewer_mode") or "document").strip().lower()
    if not words:
        return {
            "intent": "navigate",
            "clean_query": "",
            "target_slide": None,
            "is_direct": False,
            "explicit_jump": False,
            "refers_to_document": False,
            "target_type": "auto",
            "reasoning_source": "regex",
        }

    core_words = [word for word in words if word not in NAV_FLUFF]

    if any(phrase in query_lower for phrase in ["switch to doc mode", "switch to document mode", "doc mode", "document mode", "back to document mode", "back to doc mode"]):
        return {
            "intent": "document_mode",
            "clean_query": "",
            "target_slide": None,
            "is_direct": True,
            "explicit_jump": False,
            "refers_to_document": True,
            "target_type": "auto",
            "reasoning_source": "regex",
        }

    if any(phrase in query_lower for phrase in ["switch to search mode", "search mode", "go to search mode", "show search mode"]):
        return {
            "intent": "search_mode",
            "clean_query": "",
            "target_slide": None,
            "is_direct": True,
            "explicit_jump": False,
            "refers_to_document": True,
            "target_type": "auto",
            "reasoning_source": "regex",
        }

    if viewer_mode == "search" and any(
        phrase in query_lower
        for phrase in ["open", "open link", "open result", "open this", "open that", "open it"]
    ) and len(core_words) <= 3:
        return {
            "intent": "open_result",
            "clean_query": "",
            "target_slide": None,
            "is_direct": True,
            "explicit_jump": False,
            "refers_to_document": True,
            "target_type": "auto",
            "reasoning_source": "regex",
        }

    if any(word in query_lower for word in ["clear", "reset", "remove"]) and len(core_words) <= 3:
        return {
            "intent": "clear",
            "clean_query": "",
            "target_slide": None,
            "is_direct": True,
            "explicit_jump": False,
            "refers_to_document": True,
            "target_type": "auto",
            "reasoning_source": "regex",
        }

    if "zoom in" in query_lower and len(core_words) <= 3:
        return {
            "intent": "zoom_in",
            "clean_query": "",
            "target_slide": None,
            "is_direct": True,
            "explicit_jump": False,
            "refers_to_document": True,
            "target_type": "auto",
            "reasoning_source": "regex",
        }

    if "zoom out" in query_lower and len(core_words) <= 3:
        return {
            "intent": "zoom_out",
            "clean_query": "",
            "target_slide": None,
            "is_direct": True,
            "explicit_jump": False,
            "refers_to_document": True,
            "target_type": "auto",
            "reasoning_source": "regex",
        }

    if viewer_mode == "search" and any(word in query_lower for word in ["next", "next result", "forward"]):
        return {
            "intent": "next",
            "clean_query": "",
            "target_slide": None,
            "is_direct": True,
            "explicit_jump": True,
            "refers_to_document": True,
            "target_type": "auto",
            "reasoning_source": "regex",
        }

    if viewer_mode == "search" and any(
        word in query_lower for word in ["previous", "previous result", "prev", "back", "go back", "last"]
    ):
        return {
            "intent": "prev",
            "clean_query": "",
            "target_slide": None,
            "is_direct": True,
            "explicit_jump": True,
            "refers_to_document": True,
            "target_type": "auto",
            "reasoning_source": "regex",
        }

    is_next = any(word in query_lower for word in ["next page", "next slide", "forward"])
    is_prev = any(
        word in query_lower
        for word in ["previous page", "previous slide", "go back", "last slide", "last page", "backward"]
    )

    if is_next or is_prev:
        remainder = query_lower
        for trigger in [
            "next page",
            "next slide",
            "previous page",
            "previous slide",
            "go back",
            "last slide",
            "last page",
            "forward",
            "backward",
        ]:
            remainder = remainder.replace(trigger, " ")

        clean_remainder = [word for word in remainder.split() if word not in NAV_FLUFF]
        if not clean_remainder:
            intent = "next" if is_next else "prev"
            return {
                "intent": intent,
                "clean_query": "",
                "target_slide": None,
                "is_direct": True,
                "explicit_jump": True,
                "refers_to_document": True,
                "target_type": "auto",
                "reasoning_source": "regex",
            }

    target_slide = None
    slide_match = re.search(r"(?:slide|page)\s+(?:number\s+)?(\d+)", query_lower)
    explicit_jump = _has_explicit_jump_phrase(query_lower)

    if slide_match:
        target_slide = int(slide_match.group(1))
        remainder = re.sub(
            r"(?:on\s+|go\s+to\s+)?(?:slide|page)\s+(?:number\s+)?\d+",
            "",
            query_lower,
        ).strip()
        clean_remainder = [word for word in remainder.split() if word not in NAV_FLUFF]

        if not clean_remainder:
            return {
                "intent": "navigate",
                "clean_query": "",
                "target_slide": target_slide,
                "is_direct": True,
                "explicit_jump": True,
                "refers_to_document": True,
                "target_type": "auto",
                "reasoning_source": "regex",
            }

        explicit_jump = True

    intent = "navigate"
    if _is_visual_inspect_candidate(query):
        intent = "inspect"
    elif _is_web_search_candidate(query):
        intent = "web_search"
    elif "highlight" in query_lower:
        intent = "highlight"
    elif "zoom" in query_lower:
        intent = "zoom"
    elif any(word in query_lower for word in ["inspect", "extract", "details"]) and _has_visual_reference(query_lower):
        intent = "inspect"

    clean_query_words = [word for word in query_lower.split() if word not in STOP_WORDS]
    if target_slide:
        clean_query_words = [word for word in clean_query_words if word != str(target_slide)]

    clean_query = " ".join(clean_query_words).strip() or query

    refers_to_document = _has_explicit_document_signal(
        query,
        intent=intent,
        target_slide=target_slide,
    ) or _has_strong_document_signal(query)

    return {
        "intent": intent,
        "clean_query": clean_query,
        "target_slide": target_slide,
        "is_direct": False,
        "explicit_jump": explicit_jump,
        "refers_to_document": refers_to_document,
        "target_type": _infer_target_type(intent, clean_query),
        "reasoning_source": "regex",
    }


def _should_use_llm(query: str, regex_decision: dict, prefer_llm: bool = False) -> bool:
    if not COMMAND_REASONER.is_available:
        return False

    if regex_decision.get("intent") == "web_search":
        return False

    query_lower = _normalize_query(query)
    words = set(query_lower.split())
    has_contextual_reference = bool(words & CONTEXTUAL_REFERENCE_WORDS)

    if regex_decision.get("is_direct"):
        return False

    if prefer_llm:
        return True

    if _is_probably_classroom_chatter(query):
        return True

    if _is_local_highlight_candidate(query, regex_decision):
        return False

    if has_contextual_reference:
        return True

    intent = regex_decision.get("intent")
    clean_query = (regex_decision.get("clean_query") or "").strip()

    if intent in {"highlight", "zoom", "inspect"} and clean_query:
        return False

    if intent == "navigate" and regex_decision.get("target_slide"):
        return False

    return False


def _is_local_highlight_candidate(query: str, parsed: dict) -> bool:
    if parsed.get("is_direct") or parsed.get("explicit_jump") or not parsed.get("refers_to_document", True):
        return False

    if parsed.get("intent") == "web_search":
        return False

    if _is_visual_inspect_candidate(query):
        return False

    if parsed.get("intent") in NON_HIGHLIGHT_INTENTS:
        return False

    query_lower = _normalize_query(query)
    semantic_terms = _semantic_terms(query)
    if len(semantic_terms) < 2 or _looks_like_plain_speech(query_lower) or _is_probably_classroom_chatter(query):
        return False

    if parsed.get("intent") == "highlight":
        return True

    if _has_current_page_reference(query_lower) or _has_highlight_cue(query_lower):
        return True

    return len(semantic_terms) >= 3 and parsed.get("intent") == "navigate"


def reason_command(query, current_slide=None, session_state: dict | None = None, prefer_llm: bool = False):
    regex_decision = parse_command(query, session_state=session_state)

    if not _should_use_llm(query, regex_decision, prefer_llm=prefer_llm):
        return regex_decision

    llm_decision = COMMAND_REASONER.reason(
        query,
        current_slide=current_slide,
        session_context=_build_session_context(session_state),
    )
    if not llm_decision:
        return regex_decision

    intent = llm_decision.intent
    target_slide = llm_decision.target_slide
    clean_query = llm_decision.search_query.strip()
    target_type = llm_decision.target_type

    if target_type == "auto":
        target_type = _infer_target_type(intent, clean_query or query)

    is_direct = llm_decision.direct_command or intent in {
        "clear",
        "next",
        "prev",
        "zoom_in",
        "zoom_out",
    }

    if intent == "navigate" and target_slide and not clean_query:
        is_direct = True

    if not clean_query and not is_direct:
        clean_query = regex_decision.get("clean_query") or query
        if target_type == "auto":
            target_type = regex_decision.get("target_type", "auto")

    return {
        "intent": intent,
        "clean_query": clean_query,
        "target_slide": target_slide,
        "is_direct": is_direct,
        "explicit_jump": bool(target_slide) or regex_decision.get("explicit_jump", False),
        "refers_to_document": llm_decision.refers_to_document,
        "target_type": target_type,
        "reasoning_source": "llm",
        "confidence": llm_decision.confidence,
    }


def analyze_query(query, current_slide=None, session_state: dict | None = None, prefer_llm: bool = False):
    return reason_command(
        query,
        current_slide=current_slide,
        session_state=session_state,
        prefer_llm=prefer_llm,
    )


def _filter_results(results_with_scores, intent: str, target_type: str):
    filtered_results = results_with_scores

    if target_type == "image":
        filtered_results = [(doc, score) for doc, score in results_with_scores if doc.metadata.get("type") == "image"]
    elif target_type == "text":
        filtered_results = [(doc, score) for doc, score in results_with_scores if doc.metadata.get("type") == "text"]
    elif intent == "inspect":
        filtered_results = [(doc, score) for doc, score in results_with_scores if doc.metadata.get("type") == "image"]
    elif intent == "highlight":
        filtered_results = [(doc, score) for doc, score in results_with_scores if doc.metadata.get("type") == "text"]

    return filtered_results or results_with_scores


def _select_best_match(filtered_results, current_slide=None, target_slide=None):
    best_match = None
    best_adjusted_score = float("inf")

    for doc, raw_score in filtered_results:
        adjusted_score = raw_score

        if current_slide and not target_slide and doc.metadata.get("slide") == current_slide:
            adjusted_score = raw_score * 0.75

        if adjusted_score < best_adjusted_score:
            best_adjusted_score = adjusted_score
            best_match = doc

    return best_match


def preview_highlight(query, vector_db, k=4, current_slide=None, session_state: dict | None = None):
    if not current_slide:
        return None

    parsed = parse_command(query, session_state=session_state)
    if not parsed.get("refers_to_document", True):
        return None

    if not _has_strong_preview_signal(query, session_state=session_state):
        return None

    if not _is_local_highlight_candidate(query, parsed):
        return None

    clean_query = " ".join(_semantic_terms(query)).strip()
    if not clean_query:
        return None

    results_with_scores = _search_results(
        vector_db,
        clean_query,
        k=max(1, k),
        slide=current_slide,
    )
    if not results_with_scores:
        return None

    filtered_results = _filter_results(results_with_scores, "highlight", "text")
    best_match = _select_best_match(filtered_results, current_slide=current_slide, target_slide=current_slide)
    if not best_match:
        return None

    return _build_match_response("highlight", best_match)


def retrieve(query, vector_db, k=8, current_slide=None, session_state: dict | None = None, parsed: dict | None = None):
    parsed = parsed or analyze_query(
        query,
        current_slide=current_slide,
        session_state=session_state,
        prefer_llm=_should_prefer_llm_for_final(query, session_state=session_state),
    )
    if not parsed.get("refers_to_document", True):
        return None

    intent = parsed["intent"]

    if parsed.get("is_direct"):
        if intent in {"search_mode", "document_mode", "open_result"}:
            return _build_mode_response(intent)
        return _build_direct_response(intent, parsed.get("target_slide"))

    if intent == "web_search":
        return _build_web_search_response(parsed.get("clean_query") or query, parsed.get("target_slide"))

    clean_query = parsed.get("clean_query") or query
    target_slide = parsed.get("target_slide")
    target_type = parsed.get("target_type", "auto")
    explicit_jump = parsed.get("explicit_jump", False)
    local_highlight_mode = current_slide and _is_local_highlight_candidate(query, parsed)

    if intent == "inspect" and target_type != "image":
        target_type = "image"

    if local_highlight_mode:
        intent = "highlight"
        target_type = "text"
        target_slide = current_slide
        clean_query = " ".join(_semantic_terms(query)).strip() or clean_query
        results_with_scores = _search_results(vector_db, clean_query, k=k, slide=current_slide)
    else:
        results_with_scores = _search_results(vector_db, clean_query, k=k, slide=target_slide)

    if not results_with_scores:
        if target_slide and explicit_jump:
            return _build_direct_response("navigate", target_slide)
        return None
    
    filtered_results = _filter_results(results_with_scores, intent, target_type)
    
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

    if local_highlight_mode:
        intent = "highlight"

    return _build_match_response(intent, best_match)

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
