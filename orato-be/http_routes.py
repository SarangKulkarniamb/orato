from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile, WebSocket, WebSocketDisconnect
from datetime import datetime, timezone
from pathlib import Path
import shutil
import os
from bson import ObjectId
from fastapi.responses import FileResponse
from database import UserCollection, db
from models import UserCreate, UserLogin, UserResponse, Token
from auth import get_password_hash, verify_password, create_access_token, get_current_user, create_access_token

http_router = APIRouter(prefix="/auth", tags=["Authentication"])
websocket_router = APIRouter()
active_connections = {}

@http_router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register_user(user: UserCreate):
    existing_user = await UserCollection.find_one({"email": user.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed_password = get_password_hash(user.password)
    user_dict = user.dict()
    user_dict["password"] = hashed_password 
    user_dict["created_at"] = datetime.now(timezone.utc)
    result = await UserCollection.insert_one(user_dict)
    user_dict["id"] = str(result.inserted_id)
    return user_dict

@http_router.post("/login", response_model=Token)
async def login_user(user_credentials: UserLogin):
    user = await UserCollection.find_one({"email": user_credentials.email})
    if not user or not verify_password(user_credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    access_token = create_access_token(data={"sub": user["email"]})
    return {"access_token": access_token, "token_type": "bearer"}

@http_router.get("/me", response_model=UserResponse)
async def get_my_profile(current_user: dict = Depends(get_current_user)):
    return current_user

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

@http_router.post("/upload")
async def upload_document(file: UploadFile = File(...), current_user: dict = Depends(get_current_user)):
    unique_filename = f"{current_user['id']}_{file.filename}"
    file_path = UPLOAD_DIR / unique_filename
    try:
        with file_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    finally:
        file.file.close()
    doc_metadata = {
        "owner_id": current_user["id"],
        "filename": file.filename,
        "storage_path": str(file_path),
        "content_type": file.content_type,
        "uploaded_at": datetime.now(timezone.utc)
    }
    result = await db.documents.insert_one(doc_metadata)
    return {"id": str(result.inserted_id), "filename": file.filename}

@http_router.get("/my-docs")
async def get_my_documents(current_user: dict = Depends(get_current_user)):
    cursor = db.documents.find({"owner_id": current_user["id"]})
    docs = []
    async for doc in cursor:
        docs.append({
            "id": str(doc["_id"]),
            "filename": doc["filename"],
            "uploaded_at": doc["uploaded_at"]
        })
    return docs

@http_router.get("/doc/{doc_id}")
async def get_document_meta(doc_id: str, current_user: dict = Depends(get_current_user)):
    doc = await db.documents.find_one({"_id": ObjectId(doc_id), "owner_id": current_user["id"]})
    if not doc: raise HTTPException(status_code=404)
    return {"filename": doc["filename"]}

@http_router.get("/view-doc/{doc_id}")
async def serve_secure_pdf(doc_id: str, current_user: dict = Depends(get_current_user)):
    doc = await db.documents.find_one({"_id": ObjectId(doc_id), "owner_id": current_user["id"]})
    if not doc or not os.path.exists(doc["storage_path"]):
        raise HTTPException(status_code=404)
    return FileResponse(path=doc["storage_path"], media_type="application/pdf", filename=doc["filename"])

