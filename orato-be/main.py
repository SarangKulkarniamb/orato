from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from fastapi.staticfiles import StaticFiles
from http_routes import http_router
from websocket_routes import websocket_router

app = FastAPI()
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(http_router)
app.include_router(websocket_router)

@app.get("/")
def health_check():
    return {"status": "ok", "message": "Orato Backend is Running!"}

if __name__ == "__main__":
    # Run server on Port 8000
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)