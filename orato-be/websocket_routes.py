from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict
import json

from google.cloud.speech_v1 import SpeechAsyncClient
from google.cloud.speech_v1.types import (
    RecognitionConfig,
    StreamingRecognitionConfig,
    StreamingRecognizeRequest,
)

from retreival_pipeline import load_vector_db, retrieve


websocket_router = APIRouter()

active_connections: Dict[str, WebSocket] = {}
client_states: Dict[str, dict] = {}


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
    client_states[client_id] = {"active_page": 1}

    print(f"Client '{client_id}' connected. Total: {len(active_connections)}")

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
                    client_states[client_id]["active_page"] = new_page
                    print(f"Client {client_id} moved to slide {new_page}")
                    continue
            except json.JSONDecodeError:
                pass

    except WebSocketDisconnect:
        if client_id in active_connections:
            del active_connections[client_id]
        if client_id in client_states:
            del client_states[client_id]
        print(f"Client '{client_id}' disconnected")


@websocket_router.websocket("/ws/stt/{client_id}")
async def stt_endpoint(websocket: WebSocket, client_id: str):
    await websocket.accept()
    print(f"STT audio stream connected for {client_id}")

    parts = client_id.split("_")
    doc_id = parts[-1] if len(parts) > 1 else client_id

    try:
        session_vector_db = load_vector_db(doc_id)
        print(f"Successfully loaded Vector DB for: {doc_id}")
    except Exception as e:
        print(f"Warning: Could not load Vector DB: {e}")
        session_vector_db = None

    client = SpeechAsyncClient()

    config = RecognitionConfig(
        encoding=RecognitionConfig.AudioEncoding.LINEAR16,
        sample_rate_hertz=48000,
        language_code="en-US",
        enable_automatic_punctuation=True,
    )
    streaming_config = StreamingRecognitionConfig(config=config, interim_results=True)

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
            target_socket = active_connections.get(client_id)

            if result.is_final:
                print(f"[FINAL]: {transcript}")
                if target_socket:
                    await target_socket.send_json(
                        {
                            "type": "action",
                            "intent": "speech",
                            "content": transcript,
                        }
                    )

                if session_vector_db:
                    user_state = client_states.get(client_id, {})
                    current_slide = user_state.get("active_page", 1)
                    action_response = retrieve(transcript, session_vector_db, current_slide=current_slide)

                    if action_response:
                        print(f"Action: {action_response}")
                        if target_socket:
                            await target_socket.send_json(
                                {
                                    "type": "action",
                                    "intent": action_response["intent"],
                                    "slide": action_response["slide"],
                                    "bbox": action_response["bbox"],
                                    "section": action_response["section"],
                                    "title": action_response["title"],
                                    "imageInd": action_response.get("imageInd", 0),
                                    "parserSource": action_response.get("parserSource", "rules"),
                                }
                            )
            else:
                print(f"[INTERIM]: {transcript}")
                if target_socket:
                    await target_socket.send_json(
                        {
                            "type": "action",
                            "intent": "speech",
                            "content": transcript,
                        }
                    )

    except Exception as e:
        print(f"\nGoogle STT Error for {client_id}: {e}")
    finally:
        print(f"\nSTT audio stream closed for {client_id}")
        try:
            if websocket.client_state.name != "DISCONNECTED":
                await websocket.close()
        except Exception:
            pass
