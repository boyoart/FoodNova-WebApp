# FoodNova - Fresh Food Delivery Platform

A mobile-first responsive web application for fresh food delivery with customer ordering, admin management, and secure bank transfer payments.

## 🚀 Features

### Customer Features
- 🔐 User registration and login
- 🛍️ Browse products and food packs
- 🛒 Shopping cart management
- 💳 Checkout with delivery address
- 🏦 Manual bank transfer payment flow
- 📸 Receipt upload for payment verification
- 📦 Order history and tracking
- 📱 Mobile-first responsive design
- ⚡ PWA-ready (installable on mobile)

### Admin Features
- 👨‍💼 Admin login portal
- 📊 Dashboard with key metrics
- 📋 Order management and status updates
- 🛑 Stock/inventory management
- 💰 Payment approval and rejection
- 📸 Receipt review for payments
- 📈 Revenue and sales analytics

### Additional Pages
- 📝 Privacy Policy
- 📋 Terms of Service
- 📞 Contact Us

## 🛠️ Tech Stack

### Frontend
- **Framework**: React 18
- **Build Tool**: Vite
- **Routing**: React Router
- **State Management**: Zustand
- **HTTP Client**: Axios
- **UI Icons**: Lucide React
- **Notifications**: React Hot Toast
- **PWA**: Service Worker + Web Manifest

### Backend
- **Framework**: FastAPI
- **Server**: Uvicorn
- **Database ORM**: SQLAlchemy
- **Database (Dev)**: SQLite
- **Database (Prod)**: PostgreSQL
- **Authentication**: JWT (Python-Jose)
- **Password Hashing**: Bcrypt

## 📋 Prerequisites

- Node.js 16+ (for frontend)
- Python 3.10+ (for backend)
- PostgreSQL 12+ (for production)
- npm or yarn (for frontend package management)

## 🏁 Local Setup

### 1. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# On Windows
venv\Scripts\activate
# On macOS/Linux
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy environment file and customize
cp .env.example .env

# Run the backend server
python main.py
```

Backend runs on: **http://localhost:8000**
API docs available at: **http://localhost:8000/docs**

### 2. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Run development server
npm run dev
```

Frontend runs on: **http://localhost:5173**

### 3. Database Setup (Local Development)

- **SQLite**: Automatically created on first run at `foodnova.db`
- No additional setup needed for local development

### 4. Create Sample Admin Account

```bash
# Access Python shell in backend venv
python

# Run these commands
from models import Admin, Base
from database import engine
from auth import hash_password

# Create tables
Base.metadata.create_all(bind=engine)

# Create admin user
admin = Admin(
    name="Admin User",
    email="admin@foodnova.com",
    password_hash=hash_password("admin123")
)

# Add to database
from database import SessionLocal
db = SessionLocal()
db.add(admin)
db.commit()
print("Admin created successfully!")
exit()
```

Then login at: **http://localhost:5173/admin/login**
- Email: `admin@foodnova.com`
- Password: `admin123`

## 📦 Project Structure

```
FoodNova-WebApp/
├── frontend/                 # React + Vite app
│   ├── src/
│   │   ├── pages/           # All pages (Home, Products, Cart, etc.)
│   │   ├── components/      # Navbar, Footer
│   │   ├── services/        # API calls
│   │   ├── store/           # Zustand stores (Auth, Cart)
│   │   ├── App.jsx          # Main routing
│   │   └── index.css        # Global styles
│   ├── public/
│   │   ├── manifest.json    # PWA manifest
│   │   └── sw.js            # Service Worker
│   ├── vite.config.js
│   ├── package.json
│   └── index.html
│
└── backend/                  # FastAPI app
    ├── routes/
    │   ├── auth.py          # Authentication endpoints
    │   ├── products.py      # Product endpoints
    │   ├── packs.py         # Food pack endpoints
    │   ├── orders.py        # Order endpoints
    │   └── admin.py         # Admin endpoints
    ├── models.py            # Database models
    ├── schemas.py           # Pydantic schemas
    ├── auth.py              # JWT & password utilities
    ├── config.py            # Configuration
    ├── database.py          # Database connection
    ├── main.py              # FastAPI app entry point
    ├── requirements.txt
    └── .env.example
```

## 🌍 Environment Variables

### Frontend (.env)
```env
VITE_API_URL=http://localhost:8000
VITE_APP_NAME=FoodNova
VITE_APP_VERSION=0.1.0
```

### Backend (.env)
```env
# Database
DATABASE_URL=sqlite:///./foodnova.db
# For PostgreSQL: postgresql://user:password@host:port/dbname

# Security
SECRET_KEY=your-secret-key-change-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# CORS
CORS_ORIGINS=["http://localhost:5173","http://localhost:3000","http://localhost:8000"]

# Upload
MAX_UPLOAD_SIZE=5242880
UPLOAD_DIRECTORY=uploads

# Debug
SQLALCHEMY_ECHO=False
```

## 🚀 Deployment

### Backend Deployment (Render)

1. **Push code to GitHub**
   ```bash
   git add .
   git commit -m "Initial commit"
   git push origin main
   ```

2. **Create Render Account**
   - Go to [render.com](https://render.com)
   - Sign up and create new account

3. **Create Web Service**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - **Environment**: Python 3
     - **Build Command**: `pip install -r backend/requirements.txt`
     - **Start Command**: `cd backend && uvicorn main:app --host 0.0.0.0`
     - **Python Version**: 3.10

4. **Add Environment Variables**
   - Go to Environment in Render dashboard
   - Add all variables from `.env.example`
   - Set `DATABASE_URL` to PostgreSQL connection string:
     ```
     postgresql://user:password@localhost:5432/foodnova
     ```

5. **Deploy PostgreSQL Database**
   - Create PostgreSQL database on Render
   - Copy connection string to `DATABASE_URL`

6. **Deploy**
   - Click "Create Web Service"
   - Render will automatically deploy when you push to GitHub

### Frontend Deployment (Vercel)

1. **Push code to GitHub** (if not already done)

2. **Create Vercel Account**
   - Go to [vercel.com](https://vercel.com)
   - Sign up and connect GitHub

3. **Import Project**
   - Click "Import Project"
   - Select your repository
   - Configure:
     - **Framework**: Vite
     - **Root Directory**: `frontend`
     - **Build Command**: `npm run build`
     - **Output Directory**: `dist`

4. **Add Environment Variables**
   - Go to Settings → Environment Variables
   - Add:
     ```
     VITE_API_URL=https://your-render-backend-url.com
     ```

5. **Deploy**
   - Click "Deploy"
   - Vercel will automatically deploy when you push to GitHub

### Production Database Migration (SQLite to PostgreSQL)

```python
# Create migration script
from sqlalchemy import create_engine, text
import os

# Source (local SQLite)
sqlite_db = create_engine('sqlite:///foodnova.db')

# Destination (Production PostgreSQL)
pg_db = create_engine(os.getenv('DATABASE_URL'))

# Create all tables
from models import Base
Base.metadata.create_all(bind=pg_db)

# Copy data
# (Use migration tools or manual scripts for large databases)
```

## 🔒 Security Checklist

- [ ] Change `SECRET_KEY` in production
- [ ] Set `DATABASE_URL` to secure PostgreSQL instance
- [ ] Enable HTTPS on frontend and backend
- [ ] Set appropriate CORS origins (not "*")
- [ ] Use environment variables for all secrets
- [ ] Enable rate limiting on API
- [ ] Set up backup for PostgreSQL database
- [ ] Use strong admin credentials

## 📱 PWA Setup

The app is PWA-ready with:
- ✅ Service Worker (`public/sw.js`)
- ✅ Web App Manifest (`public/manifest.json`)
- ✅ Offline support with caching
- ✅ Installable on iOS and Android

### Convert to Android App

Use [PWABuilder](https://www.pwabuilder.com/):
1. Go to PWABuilder.com
2. Enter your Vercel frontend URL
3. PWABuilder analyzes and scores your PWA
4. Generate Android APK for Google Play Store
5. Generate iOS app for Apple App Store

## 🧪 Testing

### Backend API Testing
```bash
# Using Swagger UI
http://localhost:8000/docs

# Using ReDoc
http://localhost:8000/redoc

# Using cURL
curl -X GET "http://localhost:8000/products"
```

### Frontend Testing
```bash
# Run linter
npm run lint

# Build for production
npm run build

# Preview build
npm run preview
```

## 📊 API Endpoints

### Authentication
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login user
- `POST /auth/admin-login` - Admin login
- `GET /auth/me` - Get current user info

### Products
- `GET /products` - Get all products
- `GET /products/{id}` - Get product details
- `POST /products` - Create product (admin)
- `PUT /products/{id}` - Update product (admin)
- `DELETE /products/{id}` - Delete product (admin)

### Food Packs
- `GET /packs` - Get all food packs
- `GET /packs/{id}` - Get pack details
- `POST /packs` - Create pack (admin)

### Orders
- `POST /orders` - Create order
- `GET /orders/customer` - Get customer orders
- `GET /orders/{id}` - Get order details
- `POST /orders/{id}/receipt` - Upload payment receipt

### Admin
- `GET /admin/orders` - Get all orders
- `PUT /admin/orders/{id}` - Update order status
- `POST /admin/orders/{id}/approve-payment` - Approve payment
- `POST /admin/orders/{id}/reject-payment` - Reject payment
- `GET /admin/stock` - Get stock levels
- `PUT /admin/stock/{id}` - Update stock
- `GET /admin/payments/pending` - Get pending payments
- `GET /admin/stats` - Get dashboard statistics

## 🐛 Troubleshooting

### Backend Issues

**Port 8000 already in use**
```bash
# Kill process using port 8000
# On Windows
netstat -ano | findstr :8000
taskkill /PID <PID> /F

# On macOS/Linux
lsof -i :8000
kill -9 <PID>
```

**Database connection error**
- Ensure `.env` has correct `DATABASE_URL`
- For PostgreSQL: Check server is running
- For SQLite: Ensure directory is writable

**JWT token errors**
- Clear browser storage: `localStorage.clear()`
- Re-login to get new token

### Frontend Issues

**CORS errors**
- Check backend CORS_ORIGINS in `.env`
- Ensure frontend URL is included in CORS list

**API 404 errors**
- Verify backend is running
- Check `VITE_API_URL` in frontend `.env`

**Service Worker issues**
- Clear browser cache: DevTools → Application → Clear storage
- Hard refresh: Ctrl+Shift+R (or Cmd+Shift+R on Mac)

## 📞 Support

For issues or questions:
1. Check API documentation: http://localhost:8000/docs
2. Review error messages in browser console
3. Check backend logs in terminal

## 📄 License

This project is built for FoodNova. All rights reserved.

## 📝 Notes

- This is a fully functional template ready for customization
- Add real payment gateway integration for production
- Implement email notifications for orders
- Add SMS notifications via Twilio
- Set up automated backups for PostgreSQL
- Configure CDN for static assets
- Implement image optimization for product photos
- Deployment heartbeat: 2026-05-05 stock/order modal refresh
- Deployment heartbeat: 2026-05-05 Vercel root-directory settings refresh

---

**Ready to deploy? Follow the deployment steps above!**
