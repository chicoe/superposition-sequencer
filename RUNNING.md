# Running the dev servers

The app is two tiers that run side by side: a **FastAPI backend** (`:8000`) and a
**SvelteKit frontend** (`:5173`). The frontend proxies `/api/*` to the backend, so
both must be up for end-to-end use. Run each in its own terminal.

## Backend (`backend/`, port 8000)

Python 3.11+ with Qiskit. First time only:

```sh
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

Run the dev server (auto-reloads on edits):

```sh
cd backend
.venv/bin/python -m uvicorn app.main:app --reload --host :: --port 8000
```

`--host ::` binds IPv6 as well as IPv4. This matters because Vite resolves
`localhost` to IPv6 (`[::1]`); without it the `/api` proxy gets connection
refused. The API is then reachable at `http://localhost:8000`.

Run the tests:

```sh
cd backend
.venv/bin/python -m pytest -q                 # all
.venv/bin/python -m pytest tests/test_quantum.py   # one file
```

## Frontend (`frontend/`, port 5173)

First time only:

```sh
cd frontend
npm install
```

Run the dev server:

```sh
cd frontend
npm run dev
```

Open **http://localhost:5173** (not `127.0.0.1` — Vite binds IPv6 `[::1]` only,
and the same address must be used so the `/api` proxy resolves to the backend).

## Quick reference

| | Backend | Frontend |
|---|---|---|
| Dir | `backend/` | `frontend/` |
| Install | `.venv/bin/pip install -r requirements.txt` | `npm install` |
| Run | `.venv/bin/python -m uvicorn app.main:app --reload --host :: --port 8000` | `npm run dev` |
| URL | http://localhost:8000 | http://localhost:5173 |

## Troubleshooting

- **`/api` proxy errors / `ECONNREFUSED`** — the backend isn't running, or was
  started without `--host ::`. Restart it with the flag above.
- **`curl` returns `000` or refuses** — use `localhost`, not `127.0.0.1`; the dev
  servers bind IPv6.
- **Port already in use** — a previous server is still running. Find and stop it:
  `lsof -ti:8000 | xargs kill` (or `:5173`).
