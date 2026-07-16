from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional, List

# User schemas
class UserRegister(BaseModel):
    name: str
    email: EmailStr
    phone: str
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    phone: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Optional[UserResponse]

# Product schemas
class ProductCreate(BaseModel):
    name: str
    description: Optional[str] = None
    price: float
    category: Optional[str] = None
    stock: int = 0
    image: Optional[str] = None
    contents: Optional[List[str]] = None
    pack_info: Optional[str] = None
    serving_estimate: Optional[str] = None
    freshness_note: Optional[str] = None
    delivery_note: Optional[str] = None

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    category: Optional[str] = None
    stock: Optional[int] = None
    image: Optional[str] = None
    contents: Optional[List[str]] = None
    pack_info: Optional[str] = None
    serving_estimate: Optional[str] = None
    freshness_note: Optional[str] = None
    delivery_note: Optional[str] = None

class ProductResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    price: float
    category: Optional[str]
    stock: int
    image: Optional[str]
    contents: Optional[List[str]] = None
    pack_info: Optional[str] = None
    serving_estimate: Optional[str] = None
    freshness_note: Optional[str] = None
    delivery_note: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True

# Food Pack schemas
class FoodPackCreate(BaseModel):
    name: str
    description: Optional[str] = None
    price: float
    category: Optional[str] = None
    items_json: str
    stock: int = 0
    image: Optional[str] = None

class FoodPackResponse(BaseModel):
    id: int
    name: str
    description: Optional[str]
    price: float
    category: Optional[str]
    items_json: str
    stock: int
    image: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True

# Order Item schemas
class OrderItemCreate(BaseModel):
    product_id: int
    quantity: int

class OrderItemResponse(BaseModel):
    id: int
    product_id: int
    product_name: str
    quantity: int
    price: float
    
    class Config:
        from_attributes = True

# Order schemas
class OrderCreate(BaseModel):
    customer_name: str
    customer_email: str
    customer_phone: str
    delivery_address: str
    items: List[OrderItemCreate]
    payment_method: str = "bank_transfer"
    total_amount: float

class OrderUpdate(BaseModel):
    status: Optional[str] = None
    notes: Optional[str] = None

class OrderResponse(BaseModel):
    id: int
    customer_name: str
    customer_email: str
    customer_phone: str
    delivery_address: str
    total_amount: float
    status: str
    payment_method: str
    receipt_url: Optional[str]
    created_at: datetime
    items: List[OrderItemResponse] = []
    
    class Config:
        from_attributes = True
