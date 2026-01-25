from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Import routers from your other files
from http_routes import http_router
from websocket_routes import websocket_router

app = FastAPI()

# 1. CORS (Allow React Frontend to connect)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, change to specific frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Include the separated logic
app.include_router(http_router)
app.include_router(websocket_router)

# 3. Simple Health Check
@app.get("/")
def health_check():
    return {"status": "ok", "message": "Orato Backend is Running!"}

if __name__ == "__main__":
    # Run server on Port 8000
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)