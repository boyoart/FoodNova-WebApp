from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import timedelta
from models import User, Admin
from schemas import UserRegister, UserLogin, UserResponse, TokenResponse
from auth import hash_password, verify_password, create_access_token, get_current_user, get_current_admin
from database import get_db

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/register", response_model=TokenResponse)
def register(user_data: UserRegister, db: Session = Depends(get_db)):
    # Check if user exists
    existing_user = db.query(User).filter(User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create new user
    db_user = User(
        name=user_data.name,
        email=user_data.email,
        phone=user_data.phone,
        password_hash=hash_password(user_data.password)
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    access_token = create_access_token(data={"sub": db_user.id, "is_admin": False})
    return {
        "access_token": access_token,
        "user": UserResponse.from_orm(db_user)
    }

@router.post("/login", response_model=TokenResponse)
def login(credentials: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == credentials.email).first()
    
    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    access_token = create_access_token(data={"sub": user.id, "is_admin": False})
    return {
        "access_token": access_token,
        "user": UserResponse.from_orm(user)
    }

@router.post("/admin-login", response_model=TokenResponse)
def admin_login(credentials: UserLogin, db: Session = Depends(get_db)):
    admin = db.query(Admin).filter(Admin.email == credentials.email).first()
    
    if not admin or not verify_password(credentials.password, admin.password_hash):
        raise HTTPException(status_code=401, detail="Invalid admin credentials")
    
    access_token = create_access_token(data={"sub": admin.id, "is_admin": True})
    return {
        "access_token": access_token,
        "user": {
            "id": admin.id,
            "name": admin.name,
            "email": admin.email
        }
    }

@router.get("/me", response_model=UserResponse)
def get_current_user_info(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.id == user["user_id"]).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    return UserResponse.from_orm(db_user)
