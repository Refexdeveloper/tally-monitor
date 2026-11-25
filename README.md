# Tally Monitor

AI-powered multi-company expense integration and TallyPrime management platform. Tally Monitor receives approved transactions from Kissflow applications, validates them against company-specific accounting masters, routes them through Finance approval, and posts verified vouchers into the correct TallyPrime company through a secure Bridge Agent.

- Architecture & phase plan: [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md)
- API reference: [`docs/API.md`](docs/API.md)
- Phase 1 delivery notes: [`docs/PHASE-1.md`](docs/PHASE-1.md)
- Phase 2 delivery notes: [`docs/PHASE-2.md`](docs/PHASE-2.md)
- Phase 3 delivery notes: [`docs/PHASE-3.md`](docs/PHASE-3.md)
- Phase 4 delivery notes: [`docs/PHASE-4.md`](docs/PHASE-4.md)
- Phase 5 delivery notes: [`docs/PHASE-5.md`](docs/PHASE-5.md)
- Phase 6 delivery notes: [`docs/PHASE-6.md`](docs/PHASE-6.md) · Bridge Agent install guide: [`bridge-agent/README.md`](bridge-agent/README.md)
- Phase 7 delivery notes: [`docs/PHASE-7.md`](docs/PHASE-7.md)
- Connecting Kissflow: [`docs/KISSFLOW-SETUP.md`](docs/KISSFLOW-SETUP.md)

## Repository layout

```
tally-monitor/
  backend/    Express 5 + Sequelize + MySQL 8. Serves the built web app.
  frontend/   React 19 + Vite + MUI 9. Built into backend/public.
  docs/       architecture, API and phase documentation
```

## Prerequisites

- Node.js 20.19+ (tested on 24)
- MySQL 8.0 (local service `MySQL80` on Windows is fine)

## Setup (Windows PowerShell)

### 1. Install backend dependencies

```powershell
cd D:\RefexGroupApps\tally-monitor\backend
npm install
```

### 2. Create a database user

Run in MySQL Workbench or `mysql -u root -p`:

```sql
CREATE DATABASE IF NOT EXISTS tally_monitor CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER IF NOT EXISTS 'tally_monitor'@'localhost' IDENTIFIED BY 'choose-a-strong-password';
GRANT ALL PRIVILEGES ON tally_monitor.* TO 'tally_monitor'@'localhost';
-- Needed because the audit log is protected by triggers and MySQL 8 has binary logging on by default:
SET PERSIST log_bin_trust_function_creators = 1;
```

(Alternatively run the migrations with the root account.)

### 3. Configure the backend

```powershell
Copy-Item backend\.env.example backend\.env
# generate secrets:
node -e "console.log('JWT_ACCESS_SECRET=' + require('crypto').randomBytes(48).toString('base64url'))"
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('base64'))"
```

Edit `backend/.env` and set `DB_USER`, `DB_PASSWORD`, `JWT_ACCESS_SECRET`, `ENCRYPTION_KEY`, `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` (at least 12 characters, with upper and lower case letters, a digit and a symbol). Optionally set `SEED_TALLY_HOST=192.168.1.127` to register your internal Tally server. This is stored in the database only and is never placed in frontend or public configuration.

### 4. Create the schema and seed

Run these from the `backend` folder:

```powershell
npm run db:setup        # db:create + db:migrate + db:seed (roles, permissions, admin, settings)
npm run db:seed:demo    # optional, development only: realistic fictional demo data
```

### 5. Build the web app into the backend, then run the backend

```powershell
cd D:\RefexGroupApps\tally-monitor\backend
npm run build:ui
npm run dev
```

`build:ui` installs frontend dependencies if they are missing, builds `frontend`, and copies the result to `backend/public`. The backend serves that folder, so only one process is required.

- App: http://localhost:4000
- API: http://localhost:4000/api/v1/health

## Scripts

Run these from `backend/`:

| Command | Description |
|---|---|
| `npm run build:ui` | Build the frontend and copy it to `backend/public` |
| `npm run dev` | Backend with reload. Serves `backend/public` |
| `npm run build` | Compile the backend TypeScript |
| `npm start` | Run the compiled backend |
| `npm run typecheck` | Backend TypeScript check |
| `npm test` | Backend unit tests (vitest) |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Seed/refresh roles, permissions, admin and default settings (idempotent) |
| `npm run db:seed:demo` | Development-only demo data |

## Security notes

- Never commit `backend/.env`. In GCP, supply secrets from Secret Manager.
- TallyPrime's port 9000 must never be exposed publicly. Only the Bridge Agent (`bridge-agent/`) talks to it, over the internal network.
- Sessions use an in-memory access token plus an HTTP-only, `SameSite=Strict` refresh cookie. Over HTTPS set `COOKIE_SECURE=true`; production does this automatically.
