from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict
import json
import asyncio

websocket_router = APIRouter()
active_connections: Dict[str, WebSocket] = {}

@websocket_router.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await websocket.accept()
    
    # Store the connection with the ID
    active_connections[client_id] = websocket
    print(f"✅ Client '{client_id}' Connected. Total: {len(active_connections)}")

    try:
        while True:
            # 1. Wait for message
            data = await websocket.receive_text()
            
            # Ping-Pong
            if data == "ping":
                await websocket.send_text("pong")
                continue 
            else:
                print(f"Received from {client_id}: {data}")
                # Echo back the message
                for i in active_connections:

                    await active_connections[i].send_text(f"Echo: {data}")

    except WebSocketDisconnect:
        if client_id in active_connections:
            del active_connections[client_id]
        print(f"❌ Client '{client_id}' Disconnected")

@websocket_router.post("/simulate-speech/{client_id}")
async def simulate_speech(client_id: str, message: str):
    # 1. Convert the String input into a real Python Dictionary
    try:
        real_payload = json.loads(message)
    except json.JSONDecodeError:
        return {"status": "error", "message": "Invalid JSON string format"}

    target_socket = active_connections.get(client_id)
    
    if target_socket:
        # 2. Send the dictionary (FastAPI will serialize it to JSON automatically)
        await target_socket.send_json(real_payload)
        return {"status": "success", "message": f"Sent to {client_id}"}
    else:
        return {"status": "error", "message": f"User {client_id} not connected"}