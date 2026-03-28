import logging
import os
import re
import threading
from functools import lru_cache
from typing import Optional


LOGGER = logging.getLogger(__name__)


class LocalIntentClassifier:
    """Local transformer fallback used only for conversational voice commands."""

    def __init__(self, model_name: Optional[str] = None):
        self.model_name = model_name or os.getenv(
            "ORATO_COMMAND_LLM_MODEL",
            "typeform/distilbert-base-uncased-mnli",
        )
        self._classifier = None
        self._load_lock = threading.Lock()

    def is_ready(self) -> bool:
        return self._classifier is not None

    def warmup(self) -> None:
        self._ensure_loaded()
        self.classify_intent("show me the title slide")

    def classify_intent(self, query: str) -> Optional[str]:
        normalized_query = self._normalize_query(query)
        if not normalized_query:
            return None
        return self._classify_cached(normalized_query)

    def classify_if_ready(self, query: str) -> Optional[str]:
        if not self.is_ready():
            return None
        return self.classify_intent(query)

    def _ensure_loaded(self) -> None:
        if self.is_ready():
            return

        with self._load_lock:
            if self.is_ready():
                return

            from transformers import pipeline

            LOGGER.info("Loading local command classifier: %s", self.model_name)
            self._classifier = pipeline(
                "zero-shot-classification",
                model=self.model_name,
                device=-1,
            )
            LOGGER.info("Local command classifier ready: %s", self.model_name)

    @lru_cache(maxsize=256)
    def _classify_cached(self, normalized_query: str) -> Optional[str]:
        self._ensure_loaded()
        label_map = {
            "navigate to the right slide": "navigate",
            "highlight the requested text or area": "highlight",
            "zoom in for a closer visual look": "zoom",
            "inspect or explain a chart image or diagram": "inspect",
        }
        result = self._classifier(
            normalized_query,
            candidate_labels=list(label_map.keys()),
            hypothesis_template="This presentation request is to {}.",
        )
        return label_map.get(result["labels"][0])

    @staticmethod
    def _normalize_query(query: str) -> str:
        return re.sub(r"\s+", " ", (query or "").strip())
