"""
Database setup using SQLAlchemy.

In production (Render): reads DATABASE_URL env var pointing to PostgreSQL.
Locally: falls back to SQLite for zero-setup dev experience.
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./data.db")

# Render's Postgres URLs start with "postgres://" but SQLAlchemy 2.x needs "postgresql://"
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {}
if DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False

engine = create_engine(DATABASE_URL, connect_args=connect_args)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI dependency that provides a DB session per request, then closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
