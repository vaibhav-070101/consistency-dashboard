"""
SQLAlchemy ORM models — these map directly to database tables.

Two tables:
  habits     → defines what you're tracking (name, frequency, date range)
  habit_logs → one row per completion (habit_id + date = "I did this on that day")
"""

from sqlalchemy import Column, Integer, String, Boolean, Date, DateTime, UniqueConstraint
from sqlalchemy import func
from database import Base


class Habit(Base):
    __tablename__ = "habits"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    frequency = Column(Integer, nullable=False)  # target days per week (1-7)
    start_date = Column(Date, nullable=False)     # when tracking begins
    end_date = Column(Date, nullable=True)        # optional end date
    status = Column(String, nullable=False, default="active")  # active | paused | stopped
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
