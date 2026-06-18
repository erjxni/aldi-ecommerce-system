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
