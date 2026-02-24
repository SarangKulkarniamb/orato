from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict
import json
import asyncio
from auth import create_access_token
import wave
# --- NEW IMPORTS FOR GOOGLE STT ---
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

    # --- DEBUG: Create a WAV file to record the incoming audio ---
    wav_filename = f"debug_audio_{client_id}.wav"
    wav_file = wave.open(wav_filename, "wb")
    wav_file.setnchannels(1) # Mono
    wav_file.setsampwidth(2) # 16-bit
    wav_file.setframerate(48000) # Match your frontend

    async def audio_generator():
        yield StreamingRecognizeRequest(streaming_config=streaming_config)
        print("🚀 Stream config sent. Listening for audio chunks...")
        
        chunk_count = 0
        try:
            while True:
                data = await websocket.receive_bytes()
                
                # --- DEBUG: Write the raw bytes to the WAV file ---
                wav_file.writeframes(data)
                
                chunk_count += 1
                if chunk_count % 50 == 0:
                    print(f"📦 Receiving audio data... (Chunk {chunk_count})")
                    
                yield StreamingRecognizeRequest(audio_content=data)
        except WebSocketDisconnect:
            pass 
        except Exception as e:
            print(f"⚠️ Audio generator error: {e}")
        finally:
            # Safely close and save the WAV file when the mic turns off
            wav_file.close()
            print(f"💾 Saved debug audio to {wav_filename}")

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
    """Dedicated websocket for receiving binary audio and streaming to Google STT."""
    await websocket.accept()
    print(f"🎤 STT Audio stream connected for {client_id}")

    client = SpeechAsyncClient()

    # --- FIX 1: Ensure this matches the frontend (16000) ---
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
        # Yield the configuration as the very first request
        yield StreamingRecognizeRequest(streaming_config=streaming_config)
        print("🚀 Stream config sent. Listening for audio chunks...")
        
        chunk_count = 0
        try:
            while True:
                # Then, yield the audio chunks as they arrive
                data = await websocket.receive_bytes()
                chunk_count += 1
                
                # Print a heartbeat every 50 chunks so you know it's alive in PowerShell
                if chunk_count % 50 == 0:
                    print(f"📦 Receiving audio data... (Chunk {chunk_count})")
                    
                yield StreamingRecognizeRequest(audio_content=data)
        except WebSocketDisconnect:
            pass # Disconnects are expected when turning mic off
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
            
            # --- FIX 2: Plain text prints that PowerShell can actually read ---
            if result.is_final:
                print(f"✅ [FINAL]: {transcript}") 
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