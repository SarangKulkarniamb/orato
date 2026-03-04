from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict
from retreival_pipeline  import retrieve, load_vector_db # Ensure it imports from query.py
import json
import wave

from google.cloud.speech_v1 import SpeechAsyncClient
from google.cloud.speech_v1.types import (
    RecognitionConfig,
    StreamingRecognitionConfig,
    StreamingRecognizeRequest
)

websocket_router = APIRouter()
active_connections: Dict[str, WebSocket] = {}

@websocket_router.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str, token: str = None):
    if not token:
        await websocket.close(code=4008)
        return
    
    from auth import SECRET_KEY, ALGORITHM
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
    print(f"✅ Client '{client_id}' Connected. Total: {len(active_connections)}")

    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
                continue

            print(f"Received from {client_id}: {data}")
            for i, sock in active_connections.items():
                await sock.send_text(f"Echo: {data}")

    except WebSocketDisconnect:
        if client_id in active_connections:
            del active_connections[client_id]
        print(f"❌ Client '{client_id}' Disconnected")


@websocket_router.post("/simulate-speech/{client_id}")
async def simulate_speech(client_id: str, message: str):
    target_socket = active_connections.get(client_id)
    if not target_socket:
        return {"status": "error", "message": f"User {client_id} not connected"}

    try:
        real_payload = json.loads(message)
    except json.JSONDecodeError:
        real_payload = {"type": "speech", "text": message}

    await target_socket.send_json(real_payload)
    return {"status": "success", "message": f"Sent to {client_id}"}


# =====================================================================
# GOOGLE CLOUD SPEECH-TO-TEXT WEBSOCKET (Backend Terminal Only)
# =====================================================================

@websocket_router.websocket("/ws/stt/{client_id}")
async def stt_endpoint(websocket: WebSocket, client_id: str):
    await websocket.accept()
    print(f"🎤 STT Audio stream connected for {client_id}")

    # --- 🔥 DYNAMIC DATABASE LOADING 🔥 ---
    # Parse doc_id from frontend client_id (format: "user_id_doc_id")
    parts = client_id.split("_")
    doc_id = parts[-1] if len(parts) > 1 else client_id
    
    try:
        session_vector_db = load_vector_db(doc_id)
        print(f"📚 Successfully loaded Vector DB context for Document: {doc_id}")
    except Exception as e:
        print(f"⚠️ Warning: Could not load Vector DB for {doc_id}. Did ingestion fail? Error: {e}")
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
        interim_results=True
    )

    async def audio_generator():
        yield StreamingRecognizeRequest(streaming_config=streaming_config)
        print("🚀 Stream config sent. Listening for audio chunks...")
        try:
            while True:
                data = await websocket.receive_bytes()
                yield StreamingRecognizeRequest(audio_content=data)
        except WebSocketDisconnect:
            pass 
        except Exception as e:
            print(f"⚠️ Audio generator error: {e}")

    try:
        requests = audio_generator()
        responses = await client.streaming_recognize(requests=requests)
        
        print("🎧 Connected to Google ML. Waiting for words...")

        async for response in responses:
            if not response.results:
                continue

            result = response.results[0]
            if not result.alternatives:
                continue

            transcript = result.alternatives[0].transcript
            
            if result.is_final:
                print(f"✅ [FINAL]: {transcript}")
                
                # --- Execute Query using Document-Specific DB ---
                if session_vector_db:
                    action_response = retrieve(transcript, session_vector_db)
                    
                    if action_response:
                        print(f"🎯 Action: {action_response}")
                        target_socket = active_connections.get(client_id)
                        
                        if target_socket:
                            # Forward exact UI commands to the frontend via WebSocket
                            await target_socket.send_json({
                                "type": "action",
                                "intent": action_response["intent"],
                                "slide": action_response["slide"],
                                "bbox": action_response["bbox"],
                                "section": action_response["section"],
                                "title": action_response["title"],
                                "imageInd": action_response.get("imageInd", 0)
                            })
                else:
                    print("⚠️ Context not loaded, cannot search vector DB.")
            else:
                print(f"⏳ [INTERIM]: {transcript}")

    except Exception as e:
        print(f"\n❌ Google STT Error for {client_id}: {e}")
    finally:
        print(f"\n🛑 STT Audio stream closed for {client_id}")
        try:
            if websocket.client_state.name != "DISCONNECTED":
                await websocket.close()
        except Exception:
            pass