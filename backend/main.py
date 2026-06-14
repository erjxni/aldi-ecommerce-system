from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import bcrypt
import os
from dotenv import load_dotenv
from backend import models
from backend import schemas
from backend.database import engine, get_db, SessionLocal

# Load environment configuration
load_dotenv()

# Create all tables in the database securely on startup
models.Base.metadata.create_all(bind=engine)

app = FastAPI(title="ALDI E-Commerce API")

# Setup CORS to allow the frontend to communicate with the backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this to trusted domains
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Startup Seeding Event
@app.on_event("startup")
def startup_event():
    db = SessionLocal()
    try:
        # 1. Seed Products if empty
        product_count = db.query(models.Product).count()
        if product_count == 0:
            print("Seeding database with default ALDI products...")
            seed_products = [
                models.Product(
                    name="Specially Selected Aged Cheddar",
                    price=6.50,
                    category="grocery",
                    emoji="🧀",
                    rating=4.8,
                    description="Aged for 24 months for a sharp, robust flavour. Crafted locally using grass-fed dairy."
                ),
                models.Product(
                    name="Organic Artisan Sourdough",
                    price=4.90,
                    category="bakery",
                    emoji="🍞",
                    rating=4.6,
                    description="Freshly baked daily with natural wild yeast starter. Crispy crust with a soft, chewy interior."
                ),
                models.Product(
                    name="Fairtrade Belgian Dark Chocolate",
                    price=3.50,
                    category="bakery",
                    emoji="🍫",
                    rating=4.9,
                    description="70% cocoa solids premium Belgian recipe. Perfectly balanced rich dark chocolate with subtle vanilla hints."
                ),
                models.Product(
                    name="Specially Selected Coffee Beans",
                    price=8.95,
                    category="beverages",
                    emoji="☕",
                    rating=4.7,
                    description="Single origin beans sourced from Colombian highlands. Medium body with notes of caramel and hazelnut."
                ),
                models.Product(
                    name="Organic Grass-Fed Milk (2L)",
                    price=3.20,
                    category="beverages",
                    emoji="🥛",
                    rating=4.5,
                    description="Full cream milk from local free-range dairy farms. Nutritious, pasteurized, and pure."
                ),
                models.Product(
                    name="Grass-Fed Angus Ribeye Steak",
                    price=18.00,
                    category="grocery",
                    emoji="🥩",
                    rating=4.9,
                    description="Premium cut Australian beef, exceptionally tender. Grass-fed, hand-selected, and perfectly marbled."
                ),
                models.Product(
                    name="Specially Selected Barossa Shiraz",
                    price=12.50,
                    category="beverages",
                    emoji="🍷",
                    rating=4.7,
                    description="Rich Australian red wine with French oak accents. Bold flavors of plum, blackberry, and spice."
                ),
                models.Product(
                    name="Organic Royal Gala Apples (1kg)",
                    price=5.50,
                    category="grocery",
                    emoji="🍎",
                    rating=4.4,
                    description="Sweet, crisp and locally grown fresh apples. Perfect for healthy snacking or baking."
                )
            ]
            db.bulk_save_objects(seed_products)
            db.commit()
            print("Successfully seeded 8 ALDI products.")
        
        # 2. Seed Administrator Account if empty
        admin_email = "saidgalimjanov24@gmail.com"
        admin_user = db.query(models.User).filter(models.User.email == admin_email).first()
        if not admin_user:
            print("Seeding administrator account...")
            hashed_pw = get_password_hash("Saidbek0023246")
            new_admin = models.User(
                email=admin_email,
                password_hash=hashed_pw,
                name="Saidbek Galimjanov",
                phone="+61 400 000 000"
            )
            db.add(new_admin)
            db.commit()
            print("Successfully seeded administrator account.")
            
    except Exception as e:
        print(f"Error seeding database: {e}")
    finally:
        db.close()
def get_password_hash(password: str) -> str:
    pwd_bytes = password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(pwd_bytes, salt)
    return hashed.decode('utf-8')

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))

@app.post("/api/register", response_model=schemas.UserResponse, status_code=status.HTTP_201_CREATED)
def register_user(user: schemas.UserCreate, db: Session = Depends(get_db)):
    # 1. Backend validation: Ensure password and confirm password match
    if user.password != user.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passwords do not match."
        )
    
    # 2. Database check: Ensure email is not already in use
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email is already registered."
        )
    
    # 3. Create user securely
    hashed_password = get_password_hash(user.password)
    new_user = models.User(email=user.email, password_hash=hashed_password)
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return new_user

@app.post("/api/login")
def login_user(credentials: schemas.UserLogin, db: Session = Depends(get_db)):
    # 1. Fetch user by email
    db_user = db.query(models.User).filter(models.User.email == credentials.email).first()
    if not db_user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )
    
    # 2. Verify password hash
    if not db_user.password_hash or not verify_password(credentials.password, db_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )
    
    # Check if the user is the administrator
    role = "admin" if db_user.email == "saidgalimjanov24@gmail.com" else "user"
    
    # 3. Return user session
    return {
        "id": db_user.id,
        "email": db_user.email,
        "token": f"mock-token-{db_user.email}",
        "role": role
    }

# --- Products API Endpoints ---
@app.get("/api/products")
def get_products(db: Session = Depends(get_db)):
    return db.query(models.Product).all()

@app.get("/api/products/{id}")
def get_product(id: int, db: Session = Depends(get_db)):
    product = db.query(models.Product).filter(models.Product.id == id).first()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found."
        )
    return product

# --- Administrator API Endpoints ---
@app.get("/api/admin/customers")
def get_admin_customers(search: str = "", limit: int = 150, db: Session = Depends(get_db)):
    # Exclude the administrator from the customer database list
    query = db.query(models.User).filter(models.User.email != "saidgalimjanov24@gmail.com")
    if search:
        query = query.filter(
            (models.User.email.contains(search)) | 
            (models.User.name.contains(search))
        )
    # Sort users by ID ascending
    return query.order_by(models.User.id.asc()).limit(limit).all()

@app.get("/api/admin/sales-losses")
def get_admin_sales_losses():
    return {
        "total_loss": 14250.75,
        "categories": [
            {"name": "Cart Abandonment", "amount": 6240.50, "loss_percentage": 43.8},
            {"name": "Out of Stock Items", "amount": 4820.25, "loss_percentage": 33.8},
            {"name": "Expired Inventory", "amount": 2180.00, "loss_percentage": 15.3},
            {"name": "Delivery Failures", "amount": 1010.00, "loss_percentage": 7.1}
        ],
        "daily_trend": [
            {"day": "Mon", "loss": 1840.50, "carts": 14},
            {"day": "Tue", "loss": 2620.00, "carts": 21},
            {"day": "Wed", "loss": 1950.25, "carts": 16},
            {"day": "Thu", "loss": 3840.80, "carts": 29},
            {"day": "Fri", "loss": 3999.20, "carts": 32}
        ]
    }
