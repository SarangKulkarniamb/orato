from fastapi import APIRouter

http_router = APIRouter()

# Mock Login Endpoint
@http_router.post("/api/login")
def login(data: dict):
    # In real app: Check DB
    if data.get("username") == "admin" and data.get("password") == "1234":
        return {"token": "fake-jwt-token", "message": "Login Successful"}
    return {"error": "Invalid Credentials"}

# Mock Upload Endpoint
@http_router.post("/api/upload")
def upload_file():
    return {"message": "File uploaded successfully (Mock)"}