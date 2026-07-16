from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from models import Order, Product, OrderStatus
from schemas import OrderResponse, OrderUpdate
from auth import get_current_admin
from database import get_db

router = APIRouter(prefix="/admin", tags=["admin"])

@router.get("/orders", response_model=list[OrderResponse])
def get_admin_orders(
    status: str = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    user: dict = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    query = db.query(Order)
    
    if status:
        query = query.filter(Order.status == status)
    
    orders = query.offset(skip).limit(limit).all()
    return orders

@router.get("/orders/{order_id}", response_model=OrderResponse)
def get_admin_order(order_id: int, user: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order

@router.put("/orders/{order_id}", response_model=OrderResponse)
def update_admin_order(
    order_id: int,
    order_update: OrderUpdate,
    user: dict = Depends(get_current_admin),
    db: Session = Depends(get_db)
):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if order_update.status:
        order.status = order_update.status
    if order_update.notes:
        order.notes = order_update.notes
    
    db.commit()
    db.refresh(order)
    return order

@router.post("/orders/{order_id}/approve-payment")
def approve_payment(order_id: int, user: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    order.status = OrderStatus.processing
    db.commit()
    
    return {"message": "Payment approved, order is now processing"}

@router.post("/orders/{order_id}/reject-payment")
def reject_payment(order_id: int, reason: str = None, user: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    order.status = OrderStatus.cancelled
    order.notes = f"Rejected: {reason}" if reason else "Rejected"
    db.commit()
    
    return {"message": "Payment rejected"}

@router.get("/stock")
def get_stock(user: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    products = db.query(Product).all()
    return products

@router.put("/stock/{product_id}")
def update_stock(product_id: int, stock: int, user: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    product.stock = stock
    db.commit()
    db.refresh(product)
    
    return {"message": "Stock updated", "product": product}

@router.get("/payments/pending")
def get_pending_payments(user: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    orders = db.query(Order).filter(Order.status == OrderStatus.pending_payment).all()
    return orders

@router.get("/stats")
def get_dashboard_stats(user: dict = Depends(get_current_admin), db: Session = Depends(get_db)):
    total_orders = db.query(Order).count()
    total_revenue = sum(order.total_amount for order in db.query(Order).all())
    total_products = db.query(Product).count()
    pending_payments = db.query(Order).filter(Order.status == OrderStatus.pending_payment).count()
    
    return {
        "total_orders": total_orders,
        "total_revenue": total_revenue,
        "total_products": total_products,
        "pending_payments": pending_payments
    }
