# GlobeTrotter

A responsive React application for exploring Yaounde, saving places, planning visits, and sharing reviews.

## Supported Application

- `globetrotter-monolith/frontend/`: React 19 and Vite, the only user interface.
- `globetrotter-monolith/backend/`: Flask JSON API and SQLAlchemy persistence.
- `globetrotter-monolith/nginx/`: production web server and API proxy.
- `globetrotter-monolith/scripts/`: database backup and restore.
- `.github/workflows/`: frontend/backend tests and deployment.

React runs in the browser. Flask remains necessary for authentication, private account data, and database access. Database credentials must never be moved into React code. The existing application directory name is retained to avoid breaking VPS paths.

## Local Development

Use Node.js 22+ and Python 3.11+. From the repository root, in separate terminals:

```powershell
Set-Location globetrotter-monolith/backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe seed_destinations.py
.\.venv\Scripts\python.exe app.py
```

```powershell
Set-Location globetrotter-monolith/frontend
npm ci
npm run dev
```

Open http://localhost:5173. React sends `/api/` requests through Vite to Flask on port 5000. On macOS/Linux use `.venv/bin/python` instead.

## Verification

```powershell
globetrotter-monolith/backend/.venv/Scripts/python.exe -m pytest globetrotter-monolith/backend/tests -q
npm --prefix globetrotter-monolith/frontend test
npm --prefix globetrotter-monolith/frontend run test:e2e
npm --prefix globetrotter-monolith/frontend run build
```

## Configuration and Deployment

The backend uses SQLite locally and PostgreSQL in production. Keep the existing database, backend virtual environment, and any private `.env` files. The `.env.example` templates document required settings without containing deployment secrets. `VITE_API_BASE_URL` is optional public frontend configuration, never a place for credentials.

Production commands run from `globetrotter-monolith/`, using its Docker Compose file. Nginx serves the React build and proxies `/api/` to Flask. Configure your domain, TLS certificates, and production environment before running:

```sh
docker compose build
docker compose run --rm backend alembic upgrade head
docker compose run --rm backend python seed_destinations.py
docker compose up -d
```

See [frontend instructions](globetrotter-monolith/frontend/README.md), [deployment](globetrotter-monolith/docs/DEPLOYMENT.md), [security](globetrotter-monolith/docs/SECURITY.md), and [backups](globetrotter-monolith/docs/BACKUPS.md).

The pre-React pages, root API prototype, JSON microservices, and obsolete deployment scripts have been removed. Existing `.html` bookmarks continue to redirect inside React.