"""
Pydantic schemas — these define the shape of API request/response JSON.

FastAPI uses these for:
  1. Request validation (rejects bad input automatically)
  2. Response serialization (converts Python objects to JSON)
  3. Auto-generated API docs (try /docs when the server runs)
"""

from pydantic import BaseModel, Field
from datetime import date
from typing import Optional


# ── Habit schemas ─────────────────────────────────────────────

class HabitCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    frequency: int = Field(..., ge=1, le=7, description="Target days per week")
    start_date: date
    end_date: Optional[date] = None


class HabitUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    frequency: Optional[int] = Field(None, ge=1, le=7)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: Optional[str] = Field(None, pattern="^(active|paused|stopped)$")
    is_active: Optional[bool] = None


class HabitResponse(BaseModel):
    id: int
    name: str
    frequency: int
    start_date: date
    end_date: Optional[date]
    status: str
    is_active: bool

    class Config:
        from_attributes = True


# ── Log schemas ───────────────────────────────────────────────

class LogToggle(BaseModel):
    date: date


class HabitLifecycleAction(BaseModel):
    action: str = Field(..., pattern="^(pause|resume|stop)$")


# ── Stats schemas ─────────────────────────────────────────────

class HabitStat(BaseModel):
    id: int
    name: str
    frequency: int
    completed: int          # days completed in the period
    expected: int           # days expected based on frequency
    percentage: float       # completed / expected, capped at 1.0
    weekly_pct: float       # current week's completion (0-1)
    streak_weeks: int       # consecutive weeks target was met
    streak_label: str       # human-readable: "3 weeks" or "5 days"


class DailyRate(BaseModel):
    date: date
    rate: float             # 0.0 to 1.0


class WeekAvg(BaseModel):
    label: str              # "W1", "W2", ...
    avg: float              # 0.0 to 1.0


class MonthlyStats(BaseModel):
    month: int
    year: int
    overall_weekly: float   # current week's consistency (0-1)
    overall_monthly: float  # full month consistency (0-1)
    daily_rates: list[DailyRate]
    habits: list[HabitStat]
    week_averages: list[WeekAvg]  # per-week average consistency


class QuoteResponse(BaseModel):
    text: str
    author: str
