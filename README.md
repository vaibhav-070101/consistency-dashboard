# Consistency Dashboard

A habit tracker with smart frequency-aware streaks, built with **FastAPI** + **React**.

## Architecture

```
┌──────────────┐     HTTP/JSON      ┌──────────────┐     SQL      ┌──────────┐
│   React App  │  ←──────────────→  │  FastAPI      │  ←────────→  │  SQLite  │
│  (Browser)   │   REST API calls   │  (Python)     │  SQLAlchemy  │  (File)  │
└──────────────┘                    └──────────────┘              └──────────┘
   Port 5173                          Port 8000                    data.db
```

**Frontend** → `frontend/` — React (via Vite). Renders the dashboard, handles user interactions.
Talks to the backend via `fetch()` calls in `src/api.js`. Vite proxies `/api/*` to port 8000 during dev.

**Backend** → `backend/` — FastAPI (Python). Handles all business logic: CRUD, stats computation,
streak calculation. Auto-generates API docs at `/docs`.

**Database** → SQLite file (`backend/data.db`). Zero setup. Two tables: `habits` and `habit_logs`.

## Quick Start

```bash
# Terminal 1: Backend
cd backend
pip install -r requirements.txt
python main.py
# → http://localhost:8000 (API docs at /docs)

# Terminal 2: Frontend
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

## Project Structure

```
consistency-dashboard/
├── backend/
│   ├── main.py          # FastAPI app: routes, streak logic, stats
│   ├── models.py        # SQLAlchemy ORM models (Habit, HabitLog tables)
│   ├── schemas.py       # Pydantic schemas (request/response validation)
│   ├── database.py      # DB engine + session factory
│   ├── quotes.py        # Motivational quotes list
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Root component, holds all state
│   │   ├── api.js               # API client (all fetch calls)
│   │   ├── index.css            # Global styles (dark theme)
│   │   └── components/
│   │       ├── Header.jsx       # Month/year navigation
│   │       ├── StatsCards.jsx   # Weekly/monthly progress cards
│   │       ├── ConsistencyChart.jsx  # Line chart (recharts)
│   │       ├── HabitTracker.jsx # Checkbox grid + add form
│   │       └── QuoteWidget.jsx  # Random quote with refresh
│   ├── vite.config.js   # Dev server + API proxy config
│   └── package.json
└── README.md
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/habits` | List active habits |
| POST | `/api/habits` | Create habit `{name, frequency, start_date}` |
| PATCH | `/api/habits/:id` | Update habit |
| DELETE | `/api/habits/:id` | Soft-delete habit |
| POST | `/api/habits/:id/toggle` | Toggle completion `{date}` |
| GET | `/api/logs?month=3&year=2026` | All logs for a month |
| GET | `/api/stats/monthly?month=3&year=2026` | Full stats + streaks |
| GET | `/api/quote` | Random motivational quote |

## How the Streak Algorithm Works

For a habit like **Gym (5/week)**, rest days don't break your streak.

The algorithm walks backwards from the current week:

1. **Current week**: streak is maintained if you've already hit target OR it's still reachable
   (e.g., it's Wednesday, you've done 3, target is 5, 4 days left → still reachable → streak holds)
2. **Past weeks**: streak is maintained if you hit ≥ target days that week
3. **Streak breaks**: the moment a week didn't meet the target

Result: "3 weeks" means you've hit your target for 3 consecutive weeks.

For daily habits (7/week), streak is shown in days.

## How Consistency % Works

**Monthly %** per habit:
```
completed_days / expected_days (capped at 100%)
expected_days = full_weeks × frequency + partial_week_adjustment
```

**Daily consistency** (line chart):
For each day, checks if you're "on pace" within the current week for each habit.
Average across all habits gives the daily score.

**Overall weekly/monthly**: average of all habit percentages.
