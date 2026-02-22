from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict
import json
import asyncio
from auth import create_access_token
websocket_router = APIRouter()
active_connections: Dict[str, WebSocket] = {}

@websocket_router.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str, token: str = None):
    """Authenticate the incoming websocket and track it by a predictable client_id.

    The front‑end constructs the ID as `<userId>_<docId>` so that the
    server can easily address a particular user+document session.  This
    also means the client should always use the current host and the
    appropriate protocol (ws/wss) when opening the connection.
    """
    if not token:
        await websocket.close(code=4008)
        return
    # simple JWT validation using the same secret/alg as the regular
    # authentication logic; we don't need the full user object here,
    # just that the token is well‑formed and contains a subject.
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

    # accept the socket and remember it
    await websocket.accept()
    active_connections[client_id] = websocket
    print(f"✅ Client '{client_id}' Connected. Total: {len(active_connections)}")

    try:
        while True:
            data = await websocket.receive_text()
            # simple ping/pong keeps connection alive
            if data == "ping":
                await websocket.send_text("pong")
                continue

            # echo anything else for debugging
            print(f"Received from {client_id}: {data}")
            for i, sock in active_connections.items():
                await sock.send_text(f"Echo: {data}")

    except WebSocketDisconnect:
        if client_id in active_connections:
            del active_connections[client_id]
        print(f"❌ Client '{client_id}' Disconnected")

@websocket_router.post("/simulate-speech/{client_id}")
async def simulate_speech(client_id: str, message: str):
    """Send a fake speech/text event or arbitrary action payload to a
    connected websocket client.

    * If `message` is valid JSON we assume the caller already built an
      object with `type`/`data` etc and send that directly.
    * Otherwise we wrap the string in a simple `speech` event that the
      front end can choose how to interpret.
    """
    target_socket = active_connections.get(client_id)
    if not target_socket:
        return {"status": "error", "message": f"User {client_id} not connected"}

    try:
        # attempt to parse JSON first
        real_payload = json.loads(message)
    except json.JSONDecodeError:
        real_payload = {"type": "speech", "text": message}

    await target_socket.send_json(real_payload)
    return {"status": "success", "message": f"Sent to {client_id}"}