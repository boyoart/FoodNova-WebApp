from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from models import Order, OrderItem, Product, OrderStatus
from schemas import OrderCreate, OrderResponse, OrderUpdate
from auth import get_current_user
from database import get_db
import os
from config import settings

router = APIRouter(prefix="/orders", tags=["orders"])

# Ensure upload directory exists
os.makedirs(settings.upload_directory, exist_ok=True)

@router.post("", response_model=OrderResponse)
def create_order(order_data: OrderCreate, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    # Create order
    db_order = Order(
        customer_id=user["user_id"],
        customer_name=order_data.customer_name,
        customer_email=order_data.customer_email,
        customer_phone=order_data.customer_phone,
        delivery_address=order_data.delivery_address,
        total_amount=order_data.total_amount,
        payment_method=order_data.payment_method,
        status=OrderStatus.pending_payment
    )
    db.add(db_order)
    db.flush()
    
    # Add order items
    for item in order_data.items:
        product = db.query(Product).filter(Product.id == item.product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")
        
        order_item = OrderItem(
            order_id=db_order.id,
            product_id=item.product_id,
            product_name=product.name,
            quantity=item.quantity,
            price=product.price
        )
        db.add(order_item)
    
    db.commit()
    db.refresh(db_order)
    return OrderResponse.from_orm(db_order)

@router.get("/customer", response_model=list[OrderResponse])
def get_customer_orders(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    orders = db.query(Order).filter(Order.customer_id == user["user_id"]).all()
    return orders

@router.get("/{order_id}", response_model=OrderResponse)
def get_order(order_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if order.customer_id != user["user_id"] and not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Access denied")
    
    return OrderResponse.from_orm(order)

@router.post("/{order_id}/receipt")
async def upload_receipt(
    order_id: int,
    receipt: UploadFile = File(...),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if order.customer_id != user["user_id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Save file
    file_extension = receipt.filename.split(".")[-1]
    file_path = f"{settings.upload_directory}/receipt_{order_id}.{file_extension}"
    
    with open(file_path, "wb") as f:
        f.write(await receipt.read())
    
    order.receipt_url = file_path
    db.commit()
    
    return {"message": "Receipt uploaded successfully"}
