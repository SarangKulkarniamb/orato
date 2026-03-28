from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import threading
import uvicorn
from fastapi.staticfiles import StaticFiles
from http_routes import http_router
from retreival_pipeline import warmup_command_llm
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


@app.on_event("startup")
def startup_event():
    threading.Thread(target=warmup_command_llm, daemon=True).start()

@app.get("/")
def health_check():
    return {"status": "ok", "message": "Orato Backend is Running!"}

if __name__ == "__main__":
    # Run server on Port 8000
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
