"""
SQLAlchemy ORM models — these map directly to database tables.

Tables:
  users              → registered users with unique PINs
  auth_tokens        → session tokens per user (DB-backed, survives restarts)
  habits             → what you're tracking (name, frequency, date range)
  habit_logs         → one row per completion (habit_id + date)
  habit_pause_periods → pause windows for habits
"""

from sqlalchemy import Column, Integer, String, Boolean, Date, DateTime, UniqueConstraint
from sqlalchemy import func
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    pin_hash = Column(String, nullable=False, unique=True, index=True)
    created_at = Column(DateTime, server_default=func.now())


class AuthToken(Base):
    __tablename__ = "auth_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=False, index=True)
    token = Column(String, nullable=False, unique=True, index=True)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, server_default=func.now())


class Habit(Base):
    __tablename__ = "habits"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    name = Column(String, nullable=False)
    frequency = Column(Integer, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)
    status = Column(String, nullable=False, default="active")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, server_default=func.now())


class HabitLog(Base):
    __tablename__ = "habit_logs"

    id = Column(Integer, primary_key=True, index=True)
    habit_id = Column(Integer, nullable=False, index=True)
    date = Column(Date, nullable=False)

    __table_args__ = (
        UniqueConstraint("habit_id", "date", name="uq_habit_date"),
    )


class HabitPausePeriod(Base):
    """
    Pause windows for habits.
    start_date is inclusive.
    end_date is inclusive when set. None = currently paused.
    """

    __tablename__ = "habit_pause_periods"

    id = Column(Integer, primary_key=True, index=True)
    habit_id = Column(Integer, nullable=False, index=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)
