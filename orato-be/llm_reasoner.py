import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import httpx
from dotenv import load_dotenv


load_dotenv(Path(__file__).with_name(".env"))


ALLOWED_INTENTS = {
    "navigate",
    "search",
    "highlight",
    "zoom",
    "inspect",
    "next",
    "prev",
    "zoom_in",
    "zoom_out",
    "clear",
}

ALLOWED_TARGET_TYPES = {"auto", "text", "image"}
DEFAULT_BASE_URL = "https://api.openai.com/v1"
DEFAULT_MODEL = "gpt-4o-mini"
GEMINI_OPENAI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai"
DEFAULT_GEMINI_MODEL = "gemini-2.5-flash"


@dataclass
class LLMCommandDecision:
    intent: str
    direct_command: bool = False
    target_slide: Optional[int] = None
    search_query: str = ""
    target_type: str = "auto"
    confidence: float = 0.0
    refers_to_document: bool = True


def _strip_code_fences(value: str) -> str:
    cleaned = value.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z0-9_-]*\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    return cleaned.strip()


def _extract_json_object(value: str) -> str:
    cleaned = _strip_code_fences(value)
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No JSON object found in LLM response")
    return cleaned[start:end + 1]


def _normalize_intent(value: Optional[str]) -> str:
    if not value:
        return "navigate"

    normalized = value.strip().lower().replace("-", "_").replace(" ", "_")

    intent_aliases = {
        "go_to": "navigate",
        "move_to": "navigate",
        "find": "search",
        "search_for": "search",
        "previous": "prev",
        "previous_slide": "prev",
        "previous_page": "prev",
        "back": "prev",
        "next_slide": "next",
        "next_page": "next",
        "zoomin": "zoom_in",
        "zoomout": "zoom_out",
    }

    normalized = intent_aliases.get(normalized, normalized)
    return normalized if normalized in ALLOWED_INTENTS else "navigate"


def _normalize_target_type(value: Optional[str]) -> str:
    if not value:
        return "auto"

    normalized = value.strip().lower()
    type_aliases = {
        "diagram": "image",
        "figure": "image",
        "chart": "image",
        "visual": "image",
        "slide_text": "text",
        "content": "text",
        "any": "auto",
    }
    normalized = type_aliases.get(normalized, normalized)
    return normalized if normalized in ALLOWED_TARGET_TYPES else "auto"


class LLMCommandReasoner:
    def __init__(self):
        self.enabled = os.getenv("LLM_REASONING_ENABLED", "true").strip().lower() not in {
            "0",
            "false",
            "no",
        }
        self.api_key = (
            os.getenv("GEMINI_API_KEY")
            or os.getenv("OPENAI_API_KEY")
            or os.getenv("LLM_API_KEY")
        )
        self.provider = os.getenv("LLM_PROVIDER", "").strip().lower()
        self.using_gemini = bool(os.getenv("GEMINI_API_KEY")) or self.provider == "gemini"
        self.model = (
            os.getenv("GEMINI_MODEL")
            or os.getenv("OPENAI_MODEL")
            or os.getenv("LLM_MODEL")
            or (DEFAULT_GEMINI_MODEL if self.using_gemini else DEFAULT_MODEL)
        )
        default_base_url = GEMINI_OPENAI_BASE_URL if self.using_gemini else DEFAULT_BASE_URL
        self.base_url = (
            os.getenv("GEMINI_BASE_URL")
            or os.getenv("OPENAI_BASE_URL")
            or os.getenv("LLM_BASE_URL")
            or default_base_url
        ).rstrip("/")
        self.reasoning_effort = (
            os.getenv("GEMINI_REASONING_EFFORT")
            or os.getenv("LLM_REASONING_EFFORT")
            or ("low" if self.using_gemini else "")
        ).strip().lower()
        self.timeout_seconds = float(os.getenv("LLM_TIMEOUT_SECONDS", "8"))

    @property
    def is_available(self) -> bool:
        return self.enabled and bool(self.api_key)

    def reason(
        self,
        transcript: str,
        current_slide: Optional[int] = None,
        session_context: str = "",
    ) -> Optional[LLMCommandDecision]:
        transcript = (transcript or "").strip()
        if not transcript or not self.is_available:
            return None

        payload = {
            "model": self.model,
            "temperature": 0,
            "messages": [
                {
                        "role": "system",
                        "content": (
                            "You convert spoken presenter commands into structured JSON for a live slide controller. "
                            "Return only one JSON object with keys intent, direct_command, target_slide, search_query, target_type, confidence, refers_to_document. "
                            "Allowed intents: navigate, search, highlight, zoom, inspect, next, prev, zoom_in, zoom_out, clear. "
                            "Allowed target_type values: auto, text, image. "
                            "Use direct_command=true only for immediate UI controls like clear/next/prev/zoom_in/zoom_out, "
                            "or pure slide navigation with an explicit slide number and no semantic lookup needed. "
                            "Use inspect only when the speaker clearly wants to view or open a visual element such as a diagram, chart, figure, picture, graph, or image in more detail. "
                            "If the speaker is referring to ordinary slide text or concepts rather than explicitly asking to see a visual, do not use inspect. Prefer highlight or search instead. "
                            "If the speaker refers to something like 'this', 'here', 'current slide', or 'on this page', use the provided current slide context. "
                            "Use the provided session context to decide whether the speaker is currently discussing slide content or just talking conversationally to students. "
                            "If the speaker is talking to students conversationally, asking classroom-management questions, or saying something not meant to control or reference slide content, set refers_to_document=false. "
                            "If the utterance is about text or visuals on the slide, or is clearly asking to point out something from the document, set refers_to_document=true. "
                            "search_query should be short, focused, and useful for semantic document retrieval. "
                            "If no extra query is needed for a direct command or for non-document speech, use an empty string. "
                            "confidence must be a number between 0 and 1."
                        ),
                    },
                {
                    "role": "user",
                    "content": (
                        f"Current slide: {current_slide if current_slide else 'unknown'}\n"
                        f"Session context: {session_context or 'none'}\n"
                        f"Transcript: {transcript}"
                    ),
                },
            ],
        }

        if self.reasoning_effort:
            payload["reasoning_effort"] = self.reasoning_effort

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        try:
            with httpx.Client(timeout=self.timeout_seconds) as client:
                response = client.post(
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                )
                response.raise_for_status()

            data = response.json()
            content = data["choices"][0]["message"]["content"]
            parsed = json.loads(_extract_json_object(content))
        except Exception as exc:
            print(f"LLM reasoning unavailable, falling back to regex parser: {exc}")
            return None

        target_slide = parsed.get("target_slide")
        if isinstance(target_slide, str) and target_slide.strip().isdigit():
            target_slide = int(target_slide.strip())
        elif not isinstance(target_slide, int):
            target_slide = None

        confidence = parsed.get("confidence", 0.0)
        try:
            confidence = float(confidence)
        except (TypeError, ValueError):
            confidence = 0.0

        return LLMCommandDecision(
            intent=_normalize_intent(parsed.get("intent")),
            direct_command=bool(parsed.get("direct_command", False)),
            target_slide=target_slide,
            search_query=(parsed.get("search_query") or "").strip(),
            target_type=_normalize_target_type(parsed.get("target_type")),
            confidence=max(0.0, min(confidence, 1.0)),
            refers_to_document=bool(parsed.get("refers_to_document", True)),
        )

    def summarize_lecture(
        self,
        document_title: str,
        teacher_speech: str,
        document_context: str,
    ) -> Optional[str]:
        teacher_speech = (teacher_speech or "").strip()
        document_context = (document_context or "").strip()
        if not self.is_available or (not teacher_speech and not document_context):
            return None

        payload = {
            "model": self.model,
            "temperature": 0.2,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You create concise, accurate lecture summaries for students. "
                        "Use both the teacher's spoken lecture transcript and the provided document context. "
                        "Return plain text only, no markdown code fences. "
                        "Use these section headings exactly: Lecture Overview, Key Concepts, Teacher Emphasis, Document Connections, Study Notes. "
                        "Keep the output compact but useful, with short bullet-style lines under each heading. "
                        "Do not invent facts that are not grounded in the supplied speech or document context."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Document title: {document_title or 'Untitled document'}\n\n"
                        f"Teacher speech:\n{teacher_speech or 'No teacher speech captured.'}\n\n"
                        f"Document context:\n{document_context or 'No document context available.'}"
                    ),
                },
            ],
        }

        if self.reasoning_effort:
            payload["reasoning_effort"] = self.reasoning_effort

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        try:
            with httpx.Client(timeout=max(self.timeout_seconds, 20.0)) as client:
                response = client.post(
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json=payload,
                )
                response.raise_for_status()

            data = response.json()
            content = data["choices"][0]["message"]["content"]
            return _strip_code_fences(content)
        except Exception as exc:
            print(f"LLM lecture summarization unavailable, falling back to heuristic summary: {exc}")
            return None
