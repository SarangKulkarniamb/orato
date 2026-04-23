import base64
import json
import os
import tempfile
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", BASE_DIR / "uploads")).resolve()
CHROMA_DIR = Path(os.getenv("CHROMA_DIR", BASE_DIR / "db" / "chroma")).resolve()

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
CHROMA_DIR.mkdir(parents=True, exist_ok=True)


def get_chroma_path(doc_id: str) -> str:
    return str((CHROMA_DIR / str(doc_id)).resolve())


def get_cors_origins() -> list[str]:
    raw_value = os.getenv("CORS_ORIGINS", "")
    origins = [origin.strip() for origin in raw_value.split(",") if origin.strip()]
    if origins:
        return origins

    return [
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "orato-7rya697xw-sarang-kulkarnis-projects-586de903.vercel.app",
        "https://orato-six.vercel.app/",
    ]


def get_cors_origin_regex() -> str | None:
    value = os.getenv("CORS_ORIGIN_REGEX", "").strip()
    return value or None


def ensure_google_credentials_file():
    credentials_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "").strip()
    if credentials_path and Path(credentials_path).exists():
        return

    raw_json = os.getenv("GOOGLE_CREDENTIALS_JSON", "").strip()
    raw_json_b64 = os.getenv("GOOGLE_CREDENTIALS_JSON_BASE64", "").strip()

    if not raw_json and raw_json_b64:
        raw_json = base64.b64decode(raw_json_b64).decode("utf-8")

    if not raw_json:
        return

    parsed = json.loads(raw_json)
    credentials_dir = Path(tempfile.gettempdir()) / "orato-google"
    credentials_dir.mkdir(parents=True, exist_ok=True)
    credentials_file = credentials_dir / "service-account.json"
    credentials_file.write_text(json.dumps(parsed), encoding="utf-8")
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(credentials_file)


ensure_google_credentials_file()
