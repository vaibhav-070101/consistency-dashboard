"""
FastAPI backend for the Consistency Dashboard.

Run with: uvicorn main:app --reload --port 8000

API docs auto-generated at: http://localhost:8000/docs
"""

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import and_, text
from datetime import date, timedelta
from collections import defaultdict
import math

from database import engine, Base, get_db
from models import Habit, HabitLog, HabitPausePeriod
from schemas import (
    HabitCreate, HabitUpdate, HabitResponse, LogToggle, HabitLifecycleAction,
    MonthlyStats, HabitStat, DailyRate, QuoteResponse,
)
from quotes import get_random_quote

# Create tables on startup (SQLite creates the file if it doesn't exist)
Base.metadata.create_all(bind=engine)


def _run_lightweight_migrations():
    """
    Lightweight migrations — safe to run on each startup.
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
        conn.commit()


_run_lightweight_migrations()

app = FastAPI(title="Consistency Dashboard API")

# Allow the React dev server (port 5173) to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


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


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# HABITS CRUD
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/habits", response_model=list[HabitResponse])
def list_habits(db: Session = Depends(get_db)):
    return db.query(Habit).filter(Habit.is_active == True).order_by(Habit.created_at).all()


@app.post("/api/habits", response_model=HabitResponse, status_code=201)
def create_habit(body: HabitCreate, db: Session = Depends(get_db)):
    habit = Habit(
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
def update_habit(habit_id: int, body: HabitUpdate, db: Session = Depends(get_db)):
    habit = db.query(Habit).get(habit_id)
    if not habit:
        raise HTTPException(404, "Habit not found")
    for field, value in body.dict(exclude_unset=True).items():
        setattr(habit, field, value)
    db.commit()
    db.refresh(habit)
    return habit


@app.post("/api/habits/{habit_id}/lifecycle", response_model=HabitResponse)
def habit_lifecycle(habit_id: int, body: HabitLifecycleAction, db: Session = Depends(get_db)):
    """
    Pause/Resume/Stop lifecycle actions.
      - pause: opens a pause interval from today
      - resume: closes active pause interval at today
      - stop: marks habit stopped and sets end_date=today
    """
    habit = db.query(Habit).get(habit_id)
    if not habit:
        raise HTTPException(404, "Habit not found")

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
                    # Paused and resumed same day — just delete the period
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
def delete_habit(habit_id: int, db: Session = Depends(get_db)):
    habit = db.query(Habit).get(habit_id)
    if not habit:
        raise HTTPException(404, "Habit not found")
    # Soft delete: mark inactive + delete logs
    habit.is_active = False
    db.query(HabitLog).filter(HabitLog.habit_id == habit_id).delete()
    db.commit()


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# HABIT LOGGING (toggle: tap once = done, tap again = undo)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.post("/api/habits/{habit_id}/toggle")
def toggle_log(habit_id: int, body: LogToggle, db: Session = Depends(get_db)):
    """Toggle a habit completion for a given date. Idempotent."""
    habit = db.query(Habit).get(habit_id)
    if not habit:
        raise HTTPException(404, "Habit not found")

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
# MONTHLY STATS — the big endpoint that powers the dashboard
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/stats/monthly", response_model=MonthlyStats)
def get_monthly_stats(month: int, year: int, db: Session = Depends(get_db)):
    """
    Returns everything the dashboard needs for a given month:
      - Per-habit: completed, expected, percentage, streak
      - Daily consistency rates (for the line chart)
      - Overall weekly and monthly aggregates
    """
    import calendar
    num_days = calendar.monthrange(year, month)[1]
    month_start = date(year, month, 1)
    month_end = date(year, month, num_days)

    habits = db.query(Habit).filter(Habit.is_active == True).all()
    pause_periods = db.query(HabitPausePeriod).all()
    pause_map = defaultdict(list)
    for p in pause_periods:
        pause_map[p.habit_id].append(p)

    # Fetch all logs for this month in one query (efficient)
    all_logs = db.query(HabitLog).filter(
        and_(HabitLog.date >= month_start, HabitLog.date <= month_end)
    ).all()

    # Index logs: {habit_id: set of dates}
    logs_by_habit = defaultdict(set)
    for log in all_logs:
        logs_by_habit[log.habit_id].add(log.date)

    # Also fetch logs before this month (for streak calculation)
    earliest_start = min((h.start_date for h in habits), default=month_start)
    all_historical_logs = db.query(HabitLog).filter(
        HabitLog.date >= earliest_start
    ).all()
    historical_by_habit = defaultdict(set)
    for log in all_historical_logs:
        historical_by_habit[log.habit_id].add(log.date)

    today = date.today()

    # ── Per-habit stats ──────────────────────────────────────
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

        # Trackable days in month (excludes paused days)
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

        # Expected = sum of adjusted weekly targets based on trackable days/week
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

        # Current week completion for this habit
        wk_start = today - timedelta(days=today.weekday())
        trackable_current_week = [
            d for d in (wk_start + timedelta(days=i) for i in range((today - wk_start).days + 1))
            if _is_trackable_on(h, d, pause_map)
        ]
        wk_days_done = len([d for d in logs_by_habit.get(h.id, set()) if d in set(trackable_current_week)])
        wk_expected = 0 if not trackable_current_week else max(1, round(h.frequency * len(trackable_current_week) / 7))
        weekly_pct = round(min(wk_days_done / wk_expected, 1.0), 3) if wk_expected else 0.0

        habit_stats.append(HabitStat(
            id=h.id, name=h.name, frequency=h.frequency,
            completed=completed, expected=expected,
            percentage=round(percentage, 3), weekly_pct=weekly_pct,
            streak_weeks=streak, streak_label=streak_label,
        ))

    # ── Daily consistency rates (for the line chart) ─────────
    daily_rates = []
    for day_num in range(1, num_days + 1):
        d = date(year, month, day_num)
        if d > today:
            break

        active_today = [h for h in habits if _is_trackable_on(h, d, pause_map)]
        if not active_today:
            daily_rates.append(DailyRate(date=d, rate=0))
            continue

        # For each habit, compute frequency-aware score for the day.
        # Clamp week window to month start so day 1 isn't penalized
        # for missing days in the previous month.
        raw_week_start = d - timedelta(days=d.weekday())  # Monday of this week
        week_start = max(raw_week_start, month_start)
        days_elapsed = (d - week_start).days + 1  # days into this (possibly partial) week

        scores = []
        for h in active_today:
            eff_start = week_start
            days_done = len([
                dd for dd in logs_by_habit.get(h.id, set())
                if eff_start <= dd <= d and _is_trackable_on(h, dd, pause_map)
            ])
            # Scale target proportionally: in N days of a 7-day week,
            # expect round(freq * N / 7) completions
            trackable_elapsed = sum(
                1 for i in range(days_elapsed)
                if _is_trackable_on(h, week_start + timedelta(days=i), pause_map)
            )
            if trackable_elapsed == 0:
                continue
            expected_by_now = max(1, round(h.frequency * trackable_elapsed / 7))
            score = min(days_done / expected_by_now, 1.0)
            scores.append(score)

        daily_rates.append(DailyRate(date=d, rate=round(sum(scores) / len(scores), 3)))

    # ── Overall weekly consistency ───────────────────────────
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
            d for d in logs_by_habit.get(h.id, set())
            if d in set(trackable_week_days)
        ])
        wk_expected = max(1, round(h.frequency * len(trackable_week_days) / 7))
        week_scores.append(min(days_done / wk_expected, 1.0))
    overall_weekly = round(sum(week_scores) / len(week_scores), 3) if week_scores else 0.0

    # ── Overall monthly consistency ──────────────────────────
    month_scores = [hs.percentage for hs in habit_stats if hs.expected > 0]
    overall_monthly = round(sum(month_scores) / len(month_scores), 3) if month_scores else 0.0

    # ── Per-week average consistency (for bar chart) ─────────
    from schemas import WeekAvg
    week_averages = []
    w_start = month_start
    w_num = 1
    while w_start <= month_end:
        # End of current Monday-Sunday block
        days_until_sunday = 6 - w_start.weekday()
        w_end = min(w_start + timedelta(days=days_until_sunday), month_end, today)

        if w_start > today:
            break

        scores = []
        for h in habits:
            trackable_chunk_days = [
                w_start + timedelta(days=i)
                for i in range((w_end - w_start).days + 1)
                if _is_trackable_on(h, w_start + timedelta(days=i), pause_map)
            ]
            if not trackable_chunk_days:
                continue
            days_done = len([
                d for d in logs_by_habit.get(h.id, set())
                if d in set(trackable_chunk_days)
            ])
            chunk_days = len(trackable_chunk_days)
            adj_target = max(1, round(h.frequency * chunk_days / 7))
            scores.append(min(days_done / adj_target, 1.0))

        avg = round(sum(scores) / len(scores), 3) if scores else 0.0
        week_averages.append(WeekAvg(label=f"W{w_num}", avg=avg))

        w_start = w_end + timedelta(days=1)
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
    """
    Calculate streak for a habit.

    For DAILY habits (freq=7):
      Walk backwards from today counting consecutive days completed.
      Returns number of days. Miss one day → streak resets.

    For WEEKLY habits (freq<7):
      Walk backwards week by week counting consecutive weeks where target was met.
      Returns number of weeks.
      Current week: counts only if target already met. If still reachable,
      we skip it (don't count, but don't break either). If impossible, break.
    """
    if not log_dates:
        return 0

    # ── Daily habits: count consecutive days ─────────────────
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

    # ── Weekly habits: count consecutive successful weeks ────
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
                streak += 1  # already hit target this week
            else:
                remaining_trackable = sum(1 for d in trackable_days if d > reference_day)
                if days_done + remaining_trackable < adj_target:
                    break  # impossible to reach → streak is broken
                # else: still reachable, skip (don't count, don't break)
        else:
            if days_done >= adj_target:
                streak += 1
            else:
                break

    return streak


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# LOGS FOR A MONTH (used by the habit tracker grid)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/logs")
def get_logs(month: int, year: int, db: Session = Depends(get_db)):
    """Returns all habit logs for a month as {habit_id: [date_strings]}."""
    import calendar
    num_days = calendar.monthrange(year, month)[1]
    start = date(year, month, 1)
    end = date(year, month, num_days)

    logs = db.query(HabitLog).filter(
        and_(HabitLog.date >= start, HabitLog.date <= end)
    ).all()

    result = defaultdict(list)
    for log in logs:
        result[log.habit_id].append(str(log.date))
    return dict(result)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# QUOTE
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

@app.get("/api/quote", response_model=QuoteResponse)
def random_quote():
    return get_random_quote()


# ── Run directly ─────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
