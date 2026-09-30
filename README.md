# Local Food Waste → Donation Matcher

> An end-to-end, real-time geospatial food rescue and donation matching platform connecting food businesses, recipient organizations, and volunteer dispatchers.

---

## 1. System Architecture & Tech Stack

```
+-------------------------------------------------------------------------+
|                              CLIENT TIER                                |
|   Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS        |
|   - Leaflet / OpenStreetMap (Interactive Geospatial Maps)               |
|   - TanStack Query v5 + React Hook Form + Zod Validation                |
|   - Native WebSocket Client with Automatic Reconnection                 |
+------------------------------------+------------------------------------+
                                     | HTTPS / WSS
                                     v
+------------------------------------+------------------------------------+
|                             GATEWAY / API                               |
|   FastAPI + Uvicorn (Asynchronous REST API + WebSocket Server)          |
|   - JWT Authentication (Access + Refresh Tokens) & Role-Based RBAC      |
|   - Strict CORS Middleware & Security Headers Middleware                |
|   - Liveness (/health) and Readiness (/health/ready) Probes             |
+------------------------------------+------------------------------------+
                                     |
         +---------------------------+---------------------------+
         |                                                       |
         v                                                       v
+--------+----------------------------+   +----------------------+--------+
|       DATA & PERSISTENCE            |   |     EVENT SUBSYSTEM           |
|  PostgreSQL 16 + PostGIS 3.4        |   |  In-Memory Notification Hub   |
|  - GEOGRAPHY(Point, 4326)           |   |  - Role-targeted broadcasts   |
|  - ST_DWithin / ST_Distance queries |   |  - Ephemeral client channels  |
|  - Alembic async database migrations|   |  - Best-effort push delivery  |
+-------------------------------------+   +-------------------------------+
```

### Technology Matrix
- **Frontend**: Next.js 16.0+, React 19, TypeScript 5.7+, Tailwind CSS 3.4+, TanStack Query v5, Lucide Icons, Leaflet / React-Leaflet, Vitest + React Testing Library.
- **Backend**: Python 3.12+, FastAPI 0.115+, SQLAlchemy 2.0+ (Asyncpg + Psycopg2), Pydantic v2, Alembic, Pytest + Pytest-Asyncio.
- **Database & Spatial**: PostgreSQL 16+ with PostGIS 3.4+ (`GEOGRAPHY(Point, 4326)`).
- **Containerization**: Multi-stage, non-root Docker builds (Alpine & Debian Slim), Docker Compose.

---

## 2. Environment Variables Inventory

### Backend Configuration (`backend/.env`)

| Variable Name | Required | Default | Classification | Description |
| :--- | :---: | :---: | :---: | :--- |
| `ENVIRONMENT` | Yes | `production` | Public/Config | Runtime mode (`development`, `staging`, `production`). |
| `DOCS_ENABLED` | No | `false` | Public/Config | Disables Swagger UI (`/docs`) and ReDoc (`/redoc`) in prod. |
| `CORS_ORIGINS` | Yes | - | Secret/Config | Comma-separated list of allowed frontend origins (e.g. `https://app.foodrescue.org`). |
| `DATABASE_URL` | Yes | - | **Critical Secret** | Async PostgreSQL connection string (`postgresql+asyncpg://...`). |
| `SYNC_DATABASE_URL` | No | Derived | **Critical Secret** | Synchronous connection string for Alembic migrations. |
| `JWT_SECRET_KEY` | Yes | - | **Critical Secret** | Minimum 32-character high-entropy cryptographic key. |
| `JWT_ALGORITHM` | No | `HS256` | Config | Symmetric signature algorithm. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | `30` | Config | Lifetime of short-lived JWT access tokens. |
| `REFRESH_TOKEN_EXPIRE_DAYS` | No | `7` | Config | Lifetime of rotating refresh tokens. |

### Frontend Configuration (`frontend/.env.local` / Build Args)

| Variable Name | Required | Default | Classification | Description |
| :--- | :---: | :---: | :---: | :--- |
| `NEXT_PUBLIC_API_URL` | Yes | `http://localhost:8000/api/v1` | Public/Config | Base URL for FastAPI REST endpoints. |
| `NEXT_PUBLIC_WS_URL` | No | Derived | Public/Config | Base URL for WebSocket notifications (`ws://` or `wss://`). |
| `PORT` | No | `3000` | Config | Next.js server port. |

---

## 3. Database & PostGIS Setup

### 1. Provision PostgreSQL with PostGIS
Ensure your PostgreSQL instance has the PostGIS extension package installed.
```sql
CREATE DATABASE food_matcher;
\c food_matcher;
CREATE EXTENSION IF NOT EXISTS postgis;
```

### 2. Run Database Migrations
Migrations are managed via Alembic and executed against the database:
```bash
cd backend
# With virtual environment activated:
alembic upgrade head
```

---

## 4. Local Development Quickstart

### Option A: Docker Compose (All-in-One)
```bash
# Clone and run
docker-compose up --build
```
- Frontend UI: `http://localhost:3000`
- Backend API: `http://localhost:8000`
- Swagger Docs (dev mode): `http://localhost:8000/docs`

### Option B: Bare-Metal Setup

#### Backend:
```bash
cd backend
python -m venv venv
# On Windows:
.\venv\Scripts\Activate.ps1
# On Linux/macOS:
source venv/bin/activate

pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### Frontend:
```bash
cd frontend
npm install
npm run dev
```

---

## 5. Production Docker Deployment

Use the hardened `docker-compose.prod.yml` specification:

```bash
# Set your environment variables in a .env file or host environment
export POSTGRES_USER=foodrescue_admin
export POSTGRES_PASSWORD=$(openssl rand -hex 16)
export POSTGRES_DB=food_matcher
export SECRET_KEY=$(openssl rand -hex 32)
export CORS_ORIGINS="https://app.foodrescue.org"
export NEXT_PUBLIC_API_URL="https://api.foodrescue.org/api/v1"
export NEXT_PUBLIC_WS_URL="wss://api.foodrescue.org/api/v1/notifications/ws"

docker-compose -f docker-compose.prod.yml up -d --build
```

---

## 6. Cloud Deployment Playbooks

### Deployment Pattern: Decoupled Cloud Architecture
- **Frontend**: Vercel or Cloudflare Pages (Edge / Node SSR).
- **Backend**: Render, Railway, Fly.io, or AWS ECS/App Runner (Dockerized FastAPI container).
- **Database**: Supabase, AWS RDS PostgreSQL, or Neon (with PostGIS extension enabled).

### 1. Database Provisioning (Supabase / RDS / Neon)
1. Create a PostgreSQL 15+ database instance.
2. In the SQL Editor, verify PostGIS is active:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;
   SELECT PostGIS_Full_Version();
   ```
3. Copy the pooled or direct connection string (`postgresql://...`).

### 2. Backend Deployment (Render / Railway / Fly.io)
1. Point your service to the `backend/` directory or provide `backend/Dockerfile`.
2. Configure Environment Variables:
   - `ENVIRONMENT=production`
   - `DOCS_ENABLED=false`
   - `DATABASE_URL=postgresql+asyncpg://<USER>:<PASS>@<HOST>:<PORT>/<DB>`
   - `SYNC_DATABASE_URL=postgresql+psycopg2://<USER>:<PASS>@<HOST>:<PORT>/<DB>`
   - `JWT_SECRET_KEY=<SECURE_64_CHAR_HEX>`
   - `CORS_ORIGINS=https://your-frontend.vercel.app`
3. Set Health Check Path: `/health/ready`.
4. Run migrations in release phase or pre-deploy step: `alembic upgrade head`.

### 3. Frontend Deployment (Vercel)
1. Import repository and set Root Directory to `frontend`.
2. Add Build Environment Variables:
   - `NEXT_PUBLIC_API_URL=https://your-backend.onrender.com/api/v1`
   - `NEXT_PUBLIC_WS_URL=wss://your-backend.onrender.com/api/v1/notifications/ws`
3. Deploy.

---

## 7. Health Probes & Monitoring

The backend exposes standard Kubernetes / Cloud liveness and readiness endpoints:

- **Liveness Probe** (`GET /health`):
  - Returns `200 OK` with `{"status": "healthy", "environment": "production"}`.
  - Used by load balancers to detect process responsiveness.
- **Readiness Probe** (`GET /health/ready`):
  - Executes `SELECT 1` on the PostgreSQL connection pool.
  - Returns `200 OK` with `{"status": "ready", "database": "connected"}` if healthy.
  - Returns `503 Service Unavailable` if database connectivity fails.

---

## 8. Verification & Quality Gates

Run all automated test suites and build gates:

### Backend Quality Suite
```bash
cd backend
pytest -v tests
```
*Expected: 123+ passed tests (100% pass rate).*

### Frontend Quality Suite
```bash
cd frontend
# Unit & Integration Tests
npm run test
# TypeScript Type Check
npx tsc --noEmit
# Production Build & Route Compilation
npm run build
```
*Expected: 78+ passed tests, 0 TypeScript errors, 23/23 routes compiled.*

---

## 9. Pre-Deployment & Post-Deployment Smoke Test Checklist

### Pre-Deployment Checklist
- [ ] Database credentials rotated and distinct from development.
- [ ] PostGIS extension active in target database.
- [ ] Alembic migration head matches codebase schema.
- [ ] `JWT_SECRET_KEY` generated with high-entropy cryptographic randomness ($\ge 32$ bytes).
- [ ] `CORS_ORIGINS` explicitly configured for production domain (no `*` wildcard).
- [ ] `DOCS_ENABLED` set to `false`.

### Post-Deployment Smoke Test
1. **Liveness Probe**: `curl -f https://api.yourdomain.org/health` $\rightarrow$ `status: healthy`.
2. **Readiness Probe**: `curl -f https://api.yourdomain.org/health/ready` $\rightarrow$ `database: connected`.
3. **Authentication**: Register a new food business, log in, and verify JWT token receipt and storage.
4. **Donation Creation**: Create a donation with coordinate metadata; verify PostGIS spatial indexing.
5. **Matching Engine**: Verify geospatial query execution (`ST_DWithin`) against recipient organizations.
6. **WebSocket Live Feed**: Establish WSS connection and trigger a status change; verify instant notification delivery.

---

## 10. Rollback & Disaster Recovery Procedures

1. **Immediate Frontend Rollback**: In Vercel / Cloudflare dashboard, instantaneously promote the previous deployment hash.
2. **Backend Image Rollback**: Re-deploy previous container image tag or revert git commit and trigger build.
3. **Database Migration Rollback**:
   ```bash
   # Revert one migration revision
   alembic downgrade -1
   # Or revert to a specific revision
   alembic downgrade <revision_id>
   ```
4. **Data Restoration**: Restore Point-in-Time (PITR) backup from RDS/Supabase snapshot in case of catastrophic corruption.

---

## 11. Operational Scaling Boundaries & Cost Audit

- **Single-Node WebSocket Boundary**: In-memory `NotificationConnectionManager` manages active WebSocket connections within a single backend instance. When horizontally scaling across multiple container instances, attach a Redis Pub/Sub backplane.
- **Estimated Baseline Operational Cost**:
  - Frontend: Vercel Hobby/Pro ($0–$20/mo)
  - Backend: Render / Fly.io 1GB RAM ($7–$15/mo)
  - Database: Supabase / Neon / RDS Postgres+PostGIS ($0–$25/mo)
  - Total: **$7 – $60/month** for full production capacity.
