"""
FastAPI backend for the Consistency Dashboard.

Run with: uvicorn main:app --reload --port 8000

API docs auto-generated at: http://localhost:8000/docs
"""

from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import and_, text
from datetime import date, datetime, timedelta
from collections import defaultdict
import math
import os
import hashlib
import secrets

from database import engine, Base, get_db
from models import User, AuthToken, Habit, HabitLog, HabitPausePeriod
from schemas import (
    SignUpRequest, SignInRequest, UserResponse, AuthResponse,
    HabitCreate, HabitUpdate, HabitResponse, LogToggle, HabitLifecycleAction,
    MonthlyStats, HabitStat, DailyRate, QuoteResponse,
)
from quotes import get_random_quote

Base.metadata.create_all(bind=engine)


def _run_lightweight_migrations():
    """
    Safe to run on each startup.
    Handles both SQLite (local dev) and PostgreSQL (production).
    """
    from database import DATABASE_URL
    is_sqlite = DATABASE_URL.startswith("sqlite")

    with engine.connect() as conn:
        if is_sqlite:
            cols = conn.execute(text("PRAGMA table_info(habits)")).fetchall()
            col_names = {c[1] for c in cols}
        else:
            result = conn.execute(text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = 'habits'"
            )).fetchall()
            col_names = {r[0] for r in result}

        if col_names and "status" not in col_names:
            conn.execute(text("ALTER TABLE habits ADD COLUMN status TEXT NOT NULL DEFAULT 'active'"))
        if col_names and "user_id" not in col_names:
            conn.execute(text("ALTER TABLE habits ADD COLUMN user_id INTEGER"))
        conn.commit()


_run_lightweight_migrations()

app = FastAPI(title="Consistency Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://consistency-dashboard.vercel.app",
        "https://consistency-dashboard-vaibhav-070101s-projects.vercel.app",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# AUTH — PIN hashing, signup, signin, token management
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PIN_SALT = os.environ.get("APP_PIN_SALT", "consistency-dashboard-salt-2026")


def _hash_pin(pin: str) -> str:
    return hashlib.sha256((PIN_SALT + pin).encode()).hexdigest()


def _create_token(db: Session, user_id: int, stay_signed_in: bool = True) -> str:
    token = secrets.token_hex(32)
    expires = datetime.utcnow() + timedelta(days=30 if stay_signed_in else 1)
    db.add(AuthToken(user_id=user_id, token=token, expires_at=expires))
    db.commit()
    return token


def get_current_user(
    authorization: str = Header(None),
    db: Session = Depends(get_db),
) -> User:
    """FastAPI dependency — extracts and validates the Bearer token."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Not authenticated")
    token_str = authorization[7:]
    token = db.query(AuthToken).filter(AuthToken.token == token_str).first()
    if not token or token.expires_at < datetime.utcnow():
        raise HTTPException(401, "Token expired or invalid")
    user = db.query(User).get(token.user_id)
    if not user:
        raise HTTPException(401, "User not found")
    return user


@app.post("/api/auth/signup", response_model=AuthResponse, status_code=201)
def signup(body: SignUpRequest, db: Session = Depends(get_db)):
    pin_hash = _hash_pin(body.pin)
    existing = db.query(User).filter(User.pin_hash == pin_hash).first()
    if existing:
        raise HTTPException(409, "This PIN is already taken — choose a different one")
    user = User(name=body.name, pin_hash=pin_hash)
    db.add(user)
    db.commit()
    db.refresh(user)
    token = _create_token(db, user.id, stay_signed_in=True)
    return AuthResponse(token=token, user=UserResponse.from_orm(user))


@app.post("/api/auth/signin", response_model=AuthResponse)
def signin(body: SignInRequest, db: Session = Depends(get_db)):
    pin_hash = _hash_pin(body.pin)
    user = db.query(User).filter(User.pin_hash == pin_hash).first()
    if not user:
        raise HTTPException(401, "Wrong PIN")
    token = _create_token(db, user.id, body.stay_signed_in)
    return AuthResponse(token=token, user=UserResponse.from_orm(user))


@app.get("/api/auth/me", response_model=UserResponse)
def get_me(user: User = Depends(get_current_user)):
    return user


@app.post("/api/auth/logout", status_code=204)
def logout(authorization: str = Header(None), db: Session = Depends(get_db)):
    if authorization and authorization.startswith("Bearer "):
        db.query(AuthToken).filter(AuthToken.token == authorization[7:]).delete()
        db.commit()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# HELPER FUNCTIONS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

def _is_paused_on(day: date, periods: list[HabitPausePeriod]) -> bool:
    for p in periods:
        if p.start_date <= day and (p.end_date is None or day <= p.end_date):
            return True
    return False


def _is_trackable_on(h: Habit, day: date, pause_map: dict[int, list[HabitPausePeriod]]) -> bool:
    if day < h.start_date:
        return False
    if h.end_date and day > h.end_date:
        return False
    if _is_paused_on(day, pause_map.get(h.id, [])):
        return False
    return True


def _user_habits(db: Session, user_id: int, month: int = None, year: int = None):
    """
    Returns user's active habits, filtered for the given month/year context.
    Stopped habits are excluded from months after their end_date's month.
    """
    habits = db.query(Habit).filter(
        Habit.is_active == True,
        Habit.user_id == user_id,
    ).order_by(Habit.created_at).all()

    if month is not None and year is not None:
        filtered = []
        for h in habits:
            if h.status == "stopped" and h.end_date:
                # Show stopped habits only up to the month they were stopped
                if (year, month) > (h.end_date.year, h.end_date.month):
                    continue
            filtered.append(h)
        return filtered

    return habits


def _verify_habit_ownership(db: Session, habit_id: int, user_id: int) -> Habit:
    habit = db.query(Habit).get(habit_id)
    if not habit or habit.user_id != user_id:
        raise HTTPException(404, "Habit not found")
    return habit


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# HABITS CRUD — all scoped to authenticated user
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/habits", response_model=list[HabitResponse])
def list_habits(month: int = None, year: int = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return _user_habits(db, user.id, month, year)


@app.post("/api/habits", response_model=HabitResponse, status_code=201)
def create_habit(body: HabitCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    habit = Habit(
        user_id=user.id,
        name=body.name,
        frequency=body.frequency,
        start_date=body.start_date,
        end_date=body.end_date,
    )
    db.add(habit)
    db.commit()
    db.refresh(habit)
    return habit


@app.patch("/api/habits/{habit_id}", response_model=HabitResponse)
def update_habit(habit_id: int, body: HabitUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    habit = _verify_habit_ownership(db, habit_id, user.id)
    for field, value in body.dict(exclude_unset=True).items():
        setattr(habit, field, value)
    db.commit()
    db.refresh(habit)
    return habit


@app.post("/api/habits/{habit_id}/lifecycle", response_model=HabitResponse)
def habit_lifecycle(habit_id: int, body: HabitLifecycleAction, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    habit = _verify_habit_ownership(db, habit_id, user.id)
    today = date.today()

    if body.action == "pause":
        if habit.status == "stopped":
            raise HTTPException(400, "Stopped habit cannot be paused")
        if habit.status != "paused":
            habit.status = "paused"
            db.add(HabitPausePeriod(habit_id=habit.id, start_date=today, end_date=None))

    elif body.action == "resume":
        if habit.status == "paused":
            habit.status = "active"
            open_pause = db.query(HabitPausePeriod).filter(
                HabitPausePeriod.habit_id == habit.id,
                HabitPausePeriod.end_date.is_(None),
            ).order_by(HabitPausePeriod.start_date.desc()).first()
            if open_pause:
                yesterday = today - timedelta(days=1)
                if open_pause.start_date >= today:
                    db.delete(open_pause)
                else:
                    open_pause.end_date = yesterday

    elif body.action == "stop":
        habit.status = "stopped"
        if habit.end_date is None or habit.end_date > today:
            habit.end_date = today
        open_pause = db.query(HabitPausePeriod).filter(
            HabitPausePeriod.habit_id == habit.id,
            HabitPausePeriod.end_date.is_(None),
        ).all()
        for p in open_pause:
            p.end_date = today

    db.commit()
    db.refresh(habit)
    return habit


@app.delete("/api/habits/{habit_id}", status_code=204)
def delete_habit(habit_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    habit = _verify_habit_ownership(db, habit_id, user.id)
    habit.is_active = False
    db.query(HabitLog).filter(HabitLog.habit_id == habit_id).delete()
    db.commit()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# HABIT LOGGING
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.post("/api/habits/{habit_id}/toggle")
def toggle_log(habit_id: int, body: LogToggle, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    habit = _verify_habit_ownership(db, habit_id, user.id)

    pause_periods = db.query(HabitPausePeriod).filter(
        HabitPausePeriod.habit_id == habit.id
    ).all()
    pause_map = {habit.id: pause_periods}
    if not _is_trackable_on(habit, body.date, pause_map):
        raise HTTPException(400, "Habit is not trackable on this date")

    existing = db.query(HabitLog).filter(
        and_(HabitLog.habit_id == habit_id, HabitLog.date == body.date)
    ).first()

    if existing:
        db.delete(existing)
        db.commit()
        return {"date": str(body.date), "completed": False}
    else:
        log = HabitLog(habit_id=habit_id, date=body.date)
        db.add(log)
        db.commit()
        return {"date": str(body.date), "completed": True}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# MONTHLY STATS
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/stats/monthly", response_model=MonthlyStats)
def get_monthly_stats(month: int, year: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    import calendar
    num_days = calendar.monthrange(year, month)[1]
    month_start = date(year, month, 1)
    month_end = date(year, month, num_days)

    habits = _user_habits(db, user.id, month, year)
    habit_ids = [h.id for h in habits]

    pause_periods = db.query(HabitPausePeriod).filter(
        HabitPausePeriod.habit_id.in_(habit_ids)
    ).all() if habit_ids else []
    pause_map = defaultdict(list)
    for p in pause_periods:
        pause_map[p.habit_id].append(p)

    all_logs = db.query(HabitLog).filter(
        HabitLog.habit_id.in_(habit_ids),
        HabitLog.date >= month_start,
        HabitLog.date <= month_end,
    ).all() if habit_ids else []

    logs_by_habit = defaultdict(set)
    for log in all_logs:
        logs_by_habit[log.habit_id].add(log.date)

    earliest_start = min((h.start_date for h in habits), default=month_start)
    all_historical_logs = db.query(HabitLog).filter(
        HabitLog.habit_id.in_(habit_ids),
        HabitLog.date >= earliest_start,
    ).all() if habit_ids else []
    historical_by_habit = defaultdict(set)
    for log in all_historical_logs:
        historical_by_habit[log.habit_id].add(log.date)

    today = date.today()

    habit_stats = []
    for h in habits:
        effective_start = max(h.start_date, month_start)
        effective_end = min(h.end_date or month_end, month_end, today)

        if effective_start > effective_end:
            habit_stats.append(HabitStat(
                id=h.id, name=h.name, frequency=h.frequency,
                completed=0, expected=0, percentage=0, weekly_pct=0,
                streak_weeks=0, streak_label="—",
            ))
            continue

        trackable_days = []
        d = effective_start
        while d <= effective_end:
            if _is_trackable_on(h, d, pause_map):
                trackable_days.append(d)
            d += timedelta(days=1)

        trackable_set = set(trackable_days)
        completed = len([
            d for d in logs_by_habit.get(h.id, set())
            if d in trackable_set
        ])

        expected = 0
        wk_start = effective_start - timedelta(days=effective_start.weekday())
        while wk_start <= effective_end:
            wk_end = wk_start + timedelta(days=6)
            n = sum(1 for td in trackable_days if wk_start <= td <= wk_end)
            if n > 0:
                expected += max(1, round(h.frequency * n / 7))
            wk_start += timedelta(days=7)

        percentage = min(completed / expected, 1.0) if expected > 0 else 0.0
        streak = _calculate_streak(h, historical_by_habit.get(h.id, set()), today, pause_map)

        if h.frequency == 7:
            streak_label = f"{streak} {'day' if streak == 1 else 'days'}" if streak > 0 else "—"
        else:
            streak_label = f"{streak} {'week' if streak == 1 else 'weeks'}" if streak > 0 else "—"

        wk_start = today - timedelta(days=today.weekday())
        trackable_current_week = [
            d for d in (wk_start + timedelta(days=i) for i in range((today - wk_start).days + 1))
            if _is_trackable_on(h, d, pause_map)
        ]
        wk_days_done = len([d for d in historical_by_habit.get(h.id, set()) if d in set(trackable_current_week)])
        wk_expected = 0 if not trackable_current_week else max(1, round(h.frequency * len(trackable_current_week) / 7))
        weekly_pct = round(min(wk_days_done / wk_expected, 1.0), 3) if wk_expected else 0.0

        habit_stats.append(HabitStat(
            id=h.id, name=h.name, frequency=h.frequency,
            completed=completed, expected=expected,
            percentage=round(percentage, 3), weekly_pct=weekly_pct,
            streak_weeks=streak, streak_label=streak_label,
        ))

    daily_rates = []
    for day_num in range(1, num_days + 1):
        d = date(year, month, day_num)
        if d > today:
            break

        active_today = [h for h in habits if _is_trackable_on(h, d, pause_map)]
        if not active_today:
            daily_rates.append(DailyRate(date=d, rate=0))
            continue

        raw_week_start = d - timedelta(days=d.weekday())
        week_start = max(raw_week_start, month_start)
        days_elapsed = (d - week_start).days + 1

        scores = []
        for h in active_today:
            eff_start = week_start
            days_done = len([
                dd for dd in logs_by_habit.get(h.id, set())
                if eff_start <= dd <= d and _is_trackable_on(h, dd, pause_map)
            ])
            trackable_elapsed = sum(
                1 for i in range(days_elapsed)
                if _is_trackable_on(h, week_start + timedelta(days=i), pause_map)
            )
            if trackable_elapsed == 0:
                continue
            expected_by_now = max(1, round(h.frequency * trackable_elapsed / 7))
            score = min(days_done / expected_by_now, 1.0)
            scores.append(score)

        daily_rates.append(DailyRate(date=d, rate=round(sum(scores) / len(scores), 3) if scores else 0))

    week_start = today - timedelta(days=today.weekday())
    week_scores = []
    for h in habits:
        trackable_week_days = [
            week_start + timedelta(days=i)
            for i in range((today - week_start).days + 1)
            if _is_trackable_on(h, week_start + timedelta(days=i), pause_map)
        ]
        if not trackable_week_days:
            continue
        days_done = len([
            d for d in historical_by_habit.get(h.id, set())
            if d in set(trackable_week_days)
        ])
        wk_expected = max(1, round(h.frequency * len(trackable_week_days) / 7))
        week_scores.append(min(days_done / wk_expected, 1.0))
    overall_weekly = round(sum(week_scores) / len(week_scores), 3) if week_scores else 0.0

    month_scores = [hs.percentage for hs in habit_stats if hs.expected > 0]
    overall_monthly = round(sum(month_scores) / len(month_scores), 3) if month_scores else 0.0

    from schemas import WeekAvg
    week_averages = []

    # Use full Mon-Sun calendar weeks that overlap with this month.
    # W1 starts from the Monday of the week containing the 1st.
    # Weeks can extend into adjacent months.
    first_monday = month_start - timedelta(days=month_start.weekday())
    w_num = 1
    w_monday = first_monday

    while True:
        w_sunday = w_monday + timedelta(days=6)

        # Stop if this week has no overlap with the month
        if w_monday > month_end:
            break
        # Skip weeks entirely before the month
        if w_sunday < month_start:
            w_monday += timedelta(days=7)
            continue
        if w_monday > today:
            break

        w_effective_end = min(w_sunday, today)

        scores = []
        for h in habits:
            # Respect habit start_date within the week
            h_week_start = max(w_monday, h.start_date)
            h_week_end = min(w_effective_end, h.end_date) if h.end_date else w_effective_end
            if h_week_start > h_week_end:
                continue

            trackable_chunk_days = [
                h_week_start + timedelta(days=i)
                for i in range((h_week_end - h_week_start).days + 1)
                if _is_trackable_on(h, h_week_start + timedelta(days=i), pause_map)
            ]
            if not trackable_chunk_days:
                continue

            # Use historical logs (spans all months) for cross-month accuracy
            days_done = len([
                d for d in historical_by_habit.get(h.id, set())
                if d in set(trackable_chunk_days)
            ])
            chunk_days = len(trackable_chunk_days)
            adj_target = max(1, round(h.frequency * chunk_days / 7))
            scores.append(min(days_done / adj_target, 1.0))

        avg = round(sum(scores) / len(scores), 3) if scores else 0.0
        week_averages.append(WeekAvg(label=f"W{w_num}", avg=avg))

        w_monday += timedelta(days=7)
        w_num += 1

    return MonthlyStats(
        month=month, year=year,
        overall_weekly=overall_weekly,
        overall_monthly=overall_monthly,
        daily_rates=daily_rates,
        habits=habit_stats,
        week_averages=week_averages,
    )


def _calculate_streak(
    habit: Habit,
    log_dates: set,
    today: date,
    pause_map: dict[int, list[HabitPausePeriod]],
) -> int:
    if not log_dates:
        return 0

    reference_day = min(today, habit.end_date) if habit.end_date else today

    if habit.frequency == 7:
        streak = 0
        d = reference_day
        while d >= habit.start_date:
            if not _is_trackable_on(habit, d, pause_map):
                d -= timedelta(days=1)
                continue
            if d in log_dates:
                streak += 1
                d -= timedelta(days=1)
            else:
                break
        return streak

    current_monday = reference_day - timedelta(days=reference_day.weekday())
    streak = 0

    for weeks_ago in range(52):
        week_start = current_monday - timedelta(weeks=weeks_ago)
        week_end = week_start + timedelta(days=6)

        if week_end < habit.start_date:
            break
        if habit.end_date and week_start > habit.end_date:
            continue

        trackable_days = [
            week_start + timedelta(days=i)
            for i in range(7)
            if _is_trackable_on(habit, week_start + timedelta(days=i), pause_map)
        ]
        if not trackable_days:
            continue

        adj_target = max(1, round(habit.frequency * len(trackable_days) / 7))
        days_done = sum(1 for d in log_dates if d in set(trackable_days))

        if weeks_ago == 0:
            if days_done >= adj_target:
                streak += 1
            else:
                remaining_trackable = sum(1 for d in trackable_days if d > reference_day)
                if days_done + remaining_trackable < adj_target:
                    break
        else:
            if days_done >= adj_target:
                streak += 1
            else:
                break

    return streak


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# LOGS FOR A MONTH
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/logs")
def get_logs(month: int, year: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    import calendar
    num_days = calendar.monthrange(year, month)[1]
    start = date(year, month, 1)
    end = date(year, month, num_days)

    habit_ids = [h.id for h in _user_habits(db, user.id, month, year)]
    logs = db.query(HabitLog).filter(
        HabitLog.habit_id.in_(habit_ids),
        HabitLog.date >= start,
        HabitLog.date <= end,
    ).all() if habit_ids else []

    result = defaultdict(list)
    for log in logs:
        result[log.habit_id].append(str(log.date))
    return dict(result)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# QUOTE (no auth needed)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/quote", response_model=QuoteResponse)
def random_quote():
    return get_random_quote()


# ── Run directly ─────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
