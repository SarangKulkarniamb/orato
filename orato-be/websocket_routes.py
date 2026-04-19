import asyncio
import json
import time
from typing import Dict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from google.cloud.speech_v1 import SpeechAsyncClient
from google.cloud.speech_v1.types import (
    RecognitionConfig,
    StreamingRecognitionConfig,
    StreamingRecognizeRequest,
)

from retreival_pipeline import analyze_query, load_vector_db, preview_highlight, retrieve


websocket_router = APIRouter()

active_connections: Dict[str, WebSocket] = {}
client_states: Dict[str, dict] = {}
pending_actions: Dict[str, list[dict]] = {}


def _normalize_transcript(transcript: str) -> str:
    return " ".join((transcript or "").strip().lower().split())


def _should_process_interim_preview(state: dict, transcript: str) -> bool:
    normalized = _normalize_transcript(transcript)
    if not normalized or len(normalized) < 18:
        return False

    semantic_length = len([word for word in normalized.split() if len(word) > 2])
    if semantic_length < 4:
        return False

    last_preview_transcript = state.get("last_preview_transcript", "")
    if normalized == last_preview_transcript:
        return False

    if normalized.startswith(last_preview_transcript) and len(normalized) - len(last_preview_transcript) < 12:
        return False

    last_preview_at = float(state.get("last_preview_at", 0.0) or 0.0)
    now = time.perf_counter()
    if now - last_preview_at < 0.45:
        return False

    state["last_preview_transcript"] = normalized
    state["last_preview_at"] = now
    return True


def _append_recent_utterance(state: dict, transcript: str):
    normalized = _normalize_transcript(transcript)
    if not normalized:
        return

    recent = state.setdefault("recent_utterances", [])
    recent.append(normalized)
    if len(recent) > 6:
        del recent[:-6]


def _update_doc_focus_score(state: dict, refers_to_document: bool):
    current = int(state.get("doc_focus_score", 0))
    if refers_to_document:
        state["doc_focus_score"] = min(current + 1, 4)
    else:
        state["doc_focus_score"] = max(current - 1, 0)


async def _send_action(client_id: str, action_response: dict, preview: bool = False):
    payload = {
        "type": "action",
        "intent": action_response["intent"],
        "slide": action_response["slide"],
        "bbox": action_response["bbox"],
        "section": action_response["section"],
        "title": action_response["title"],
        "imageInd": action_response.get("imageInd", 0),
        "content": action_response.get("content"),
        "targetType": action_response.get("type", "text"),
        "preview": preview,
    }

    target_socket = active_connections.get(client_id)
    if not target_socket:
        queued = pending_actions.setdefault(client_id, [])
        queued.append(payload)
        del queued[:-8]
        return

    try:
        await target_socket.send_json(payload)
    except Exception as exc:
        print(f"Queued action for {client_id} after websocket send failure: {exc}")
        queued = pending_actions.setdefault(client_id, [])
        queued.append(payload)
        del queued[:-8]
        if active_connections.get(client_id) is target_socket:
            active_connections.pop(client_id, None)


async def _flush_pending_actions(client_id: str):
    target_socket = active_connections.get(client_id)
    queued = pending_actions.get(client_id) or []
    if not target_socket or not queued:
        return

    while queued:
        payload = queued.pop(0)
        try:
            await target_socket.send_json(payload)
        except Exception as exc:
            print(f"Stopped pending action flush for {client_id}: {exc}")
            queued.insert(0, payload)
            if active_connections.get(client_id) is target_socket:
                active_connections.pop(client_id, None)
            break

    if not queued:
        pending_actions.pop(client_id, None)


@websocket_router.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str, token: str = None):
    if not token:
        await websocket.close(code=4008)
        return

    from auth import ALGORITHM, SECRET_KEY
    from jose import JWTError, jwt

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_email = payload.get("sub")
        if not user_email:
            raise JWTError("no subject")
    except JWTError:
        await websocket.close(code=4008)
        return

    await websocket.accept()
    active_connections[client_id] = websocket
    existing_state = client_states.get(client_id, {})
    client_states[client_id] = {
        "active_page": 1,
        "last_preview_transcript": "",
        "last_preview_signature": None,
        "last_preview_at": 0.0,
        "recent_utterances": [],
        "doc_focus_score": 0,
        **existing_state,
    }

    print(f"Client '{client_id}' connected. Total: {len(active_connections)}")
    await _flush_pending_actions(client_id)

    try:
        while True:
            data = await websocket.receive_text()

            if data == "ping":
                await websocket.send_text("pong")
                continue

            try:
                message = json.loads(data)
                if message.get("type") == "state_update":
                    new_page = message.get("activePage", 1)
                    state = client_states.setdefault(
                        client_id,
                        {
                            "active_page": 1,
                            "last_preview_transcript": "",
                            "last_preview_signature": None,
                            "last_preview_at": 0.0,
                            "recent_utterances": [],
                            "doc_focus_score": 0,
                        },
                    )
                    state["active_page"] = new_page
                    state["last_preview_transcript"] = ""
                    state["last_preview_signature"] = None
                    state["last_preview_at"] = 0.0
                    print(f"Client {client_id} moved to slide {new_page}")
                    continue
            except json.JSONDecodeError:
                pass

    except WebSocketDisconnect:
        if active_connections.get(client_id) is websocket:
            active_connections.pop(client_id, None)
        print(f"Client '{client_id}' disconnected")


@websocket_router.websocket("/ws/stt/{client_id}")
async def stt_endpoint(websocket: WebSocket, client_id: str):
    await websocket.accept()
    print(f"STT audio stream connected for {client_id}")

    parts = client_id.split("_")
    doc_id = parts[-1] if len(parts) > 1 else client_id

    try:
        session_vector_db = load_vector_db(doc_id)
        print(f"Successfully loaded vector DB for: {doc_id}")
    except Exception as exc:
        print(f"Warning: could not load vector DB: {exc}")
        session_vector_db = None

    client = SpeechAsyncClient()
    config = RecognitionConfig(
        encoding=RecognitionConfig.AudioEncoding.LINEAR16,
        sample_rate_hertz=48000,
        language_code="en-US",
        enable_automatic_punctuation=True,
    )
    streaming_config = StreamingRecognitionConfig(
        config=config,
        interim_results=True,
    )

    async def audio_generator():
        yield StreamingRecognizeRequest(streaming_config=streaming_config)
        try:
            while True:
                data = await websocket.receive_bytes()
                yield StreamingRecognizeRequest(audio_content=data)
        except WebSocketDisconnect:
            pass

    try:
        requests = audio_generator()
        responses = await client.streaming_recognize(requests=requests)

        async for response in responses:
            if not response.results:
                continue

            result = response.results[0]
            if not result.alternatives:
                continue

            transcript = result.alternatives[0].transcript

            if result.is_final:
                print(f"[FINAL] {transcript}")

                if not session_vector_db:
                    continue

                user_state = client_states.setdefault(
                    client_id,
                    {
                        "active_page": 1,
                        "last_preview_transcript": "",
                        "last_preview_signature": None,
                        "last_preview_at": 0.0,
                        "recent_utterances": [],
                        "doc_focus_score": 0,
                    },
                )
                current_slide = user_state.get("active_page", 1)
                _append_recent_utterance(user_state, transcript)
                user_state["last_preview_transcript"] = ""
                user_state["last_preview_signature"] = None
                user_state["last_preview_at"] = 0.0

                analysis = await asyncio.to_thread(
                    analyze_query,
                    transcript,
                    current_slide,
                    user_state,
                    False,
                )
                _update_doc_focus_score(user_state, analysis.get("refers_to_document", True))
                if not analysis.get("refers_to_document", True):
                    print("Ignored non-document utterance")
                    continue

                started_at = time.perf_counter()
                action_response = await asyncio.to_thread(
                    retrieve,
                    transcript,
                    session_vector_db,
                    8,
                    current_slide,
                    user_state,
                    analysis,
                )
                retrieval_ms = (time.perf_counter() - started_at) * 1000
                print(f"Retrieval completed in {retrieval_ms:.1f} ms")

                if action_response:
                    print(f"Action: {action_response}")
                    await _send_action(client_id, action_response, preview=False)
            else:
                print(f"[INTERIM] {transcript}")

                if not session_vector_db:
                    continue

                user_state = client_states.setdefault(
                    client_id,
                    {
                        "active_page": 1,
                        "last_preview_transcript": "",
                        "last_preview_signature": None,
                        "last_preview_at": 0.0,
                        "recent_utterances": [],
                        "doc_focus_score": 0,
                    },
                )
                if not _should_process_interim_preview(user_state, transcript):
                    continue

                current_slide = user_state.get("active_page", 1)
                preview_started_at = time.perf_counter()
                preview_response = await asyncio.to_thread(
                    preview_highlight,
                    transcript,
                    session_vector_db,
                    2,
                    current_slide,
                    user_state,
                )
                preview_ms = (time.perf_counter() - preview_started_at) * 1000
                print(f"Preview retrieval completed in {preview_ms:.1f} ms")

                if not preview_response:
                    continue

                preview_signature = (
                    f"{preview_response['slide']}|"
                    f"{preview_response['bbox']}|"
                    f"{preview_response.get('title', '')}"
                )
                if preview_signature == user_state.get("last_preview_signature"):
                    continue

                user_state["last_preview_signature"] = preview_signature
                print(f"Preview action: {preview_response}")
                await _send_action(client_id, preview_response, preview=True)

    except Exception as exc:
        print(f"\nSTT error for {client_id}: {exc}")
    finally:
        print(f"\nSTT audio stream closed for {client_id}")
        try:
            if websocket.client_state.name != "DISCONNECTED":
                await websocket.close()
        except Exception:
            pass
