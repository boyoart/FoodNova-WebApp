from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from models import FoodPack
from schemas import FoodPackResponse, FoodPackCreate
from database import get_db

router = APIRouter(prefix="/packs", tags=["food-packs"])

@router.get("", response_model=list[FoodPackResponse])
def get_packs(
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    search: str = Query(""),
    category: str = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(FoodPack)

    if search:
        query = query.filter(
            (FoodPack.name.ilike(f"%{search}%")) |
            (FoodPack.description.ilike(f"%{search}%"))
        )

    if category:
        query = query.filter(FoodPack.category == category)

    packs = query.offset(skip).limit(limit).all()
    return packs

@router.get("/{pack_id}", response_model=FoodPackResponse)
def get_pack(pack_id: int, db: Session = Depends(get_db)):
    pack = db.query(FoodPack).filter(FoodPack.id == pack_id).first()
    if not pack:
        raise HTTPException(status_code=404, detail="Food pack not found")
    return pack

@router.post("", response_model=FoodPackResponse)
def create_pack(pack: FoodPackCreate, db: Session = Depends(get_db)):
    db_pack = FoodPack(**pack.dict())
    db.add(db_pack)
    db.commit()
    db.refresh(db_pack)
    return db_pack

@router.delete("/{pack_id}")
def delete_pack(pack_id: int, db: Session = Depends(get_db)):
    db_pack = db.query(FoodPack).filter(FoodPack.id == pack_id).first()
    if not db_pack:
        raise HTTPException(status_code=404, detail="Food pack not found")

    db.delete(db_pack)
    db.commit()
    return {"message": "Food pack deleted"}
