from fastapi import APIRouter, Depends, HTTPException, status, File, UploadFile
from datetime import datetime, timezone
from pathlib import Path
import shutil
import os
import asyncio # <-- IMPORT ASYNCIO
from bson import ObjectId
from fastapi.responses import FileResponse
from database import UserCollection, db
from models import UserCreate, UserLogin, UserResponse, Token
from auth import get_password_hash, verify_password, create_access_token, get_current_user

from ingestion_pipeline import process_document_pipeline

http_router = APIRouter(prefix="/auth", tags=["Authentication"])

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)

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

@http_router.post("/upload")
async def upload_document(
    file: UploadFile = File(...), 
    current_user: dict = Depends(get_current_user)
):
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
    doc_id = str(result.inserted_id)
    
    # 🔥 AWAIT INGESTION SYNCHRONOUSLY
    # asyncio.to_thread runs the heavy CPU parsing in a separate thread 
    # so it doesn't freeze your entire FastAPI server for other users, 
    # but the API response WILL wait here until it finishes!
    await asyncio.to_thread(process_document_pipeline, str(file_path), doc_id)
    
    return {"id": doc_id, "filename": file.filename}

@http_router.get("/my-docs")
async def get_my_documents(current_user: dict = Depends(get_current_user)):
    cursor = db.documents.find({"owner_id": current_user["id"]}).sort("uploaded_at", -1)
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

import gc

@http_router.delete("/delete-doc/{doc_id}")
async def delete_document(doc_id: str, current_user: dict = Depends(get_current_user)):
    doc = await db.documents.find_one({"_id": ObjectId(doc_id), "owner_id": current_user["id"]})
    if not doc:
        raise HTTPException(status_code=404)
    
    # 1. Delete the physical PDF file
    if os.path.exists(doc["storage_path"]):
        try:
            os.remove(doc["storage_path"])
        except Exception as e:
            print(f"Warning: Could not delete PDF file: {e}")
            
    # 2. Clean up ChromaDB safely to avoid WinError 32
    chroma_path = f"db/chroma/{doc_id}"
    if os.path.exists(chroma_path):
        try:
            from retreival_pipeline import load_vector_db
            vdb = load_vector_db(doc_id)
            vdb.delete_collection() # This deletes the vector data inside Chroma
            
            del vdb
            gc.collect() 
            
            shutil.rmtree(chroma_path) 
            
        except PermissionError:
            print(f"⚠️ Windows File Lock: Could not physically delete folder {chroma_path}. It will be cleaned up later.")
        except Exception as e:
            print(f"⚠️ Error cleaning up Chroma DB: {e}")
    
    # 3. Remove from MongoDB
    await db.documents.delete_one({"_id": ObjectId(doc_id)})
    
    return {"detail": "Document and associated Vector DB deleted successfully"}