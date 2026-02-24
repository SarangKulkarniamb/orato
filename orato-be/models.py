from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime

# --- 1. User Schemas ---

class UserCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=6)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    full_name: str
    email: EmailStr
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True 

# --- 2. Token Schemas ---

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    email: Optional[str] = None


# --- 3. Document Schemas ---

class DocumentCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)
    content: str = Field(..., min_length=1)