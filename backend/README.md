# Backend Directory

This directory contains the FastAPI backend for the ALDI E-Commerce System.

## Files
- `main.py`: The main FastAPI application file. Contains the API routing, endpoints, and the lifespan event for database seeding.
- `models.py`: SQLAlchemy ORM database models (`User`, `Product`) mapping python objects to database tables.
- `schemas.py`: Pydantic models used for data validation and serialization of API requests and responses.
- `database.py`: SQLAlchemy connection setup, engine configuration, and session management functions.
- `db_queries.sql`: A collection of raw SQL queries and scripts used for reference or manual database operations.
- `ecommerce.db`: The active SQLite database file storing all application data (users, products, etc.).
- `requirements.txt`: The list of Python dependencies required to run the FastAPI backend (e.g., fastapi, sqlalchemy, passlib).
- `.venv/`: The isolated Python virtual environment containing the installed backend dependencies.
- `__pycache__/`: Auto-generated compiled Python files for faster execution.

```
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyD91_SijfkVYhqTO9xpew8O1fag8jISrPs",
  authDomain: "aldi-ecommerce-managemen-b40e8.firebaseapp.com",
  projectId: "aldi-ecommerce-managemen-b40e8",
  storageBucket: "aldi-ecommerce-managemen-b40e8.firebasestorage.app",
  messagingSenderId: "921043652737",
  appId: "1:921043652737:web:3e0e20841fdf4c36f77d80",
  measurementId: "G-QMYJFHQV15"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
```