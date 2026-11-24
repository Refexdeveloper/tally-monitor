# Phase 1 – Foundation: delivery notes

## Delivered

**Backend (`backend/`)**

- Express 5 API with Helmet, CORS allow-list, request IDs, structured redacting logs (Cloud Logging severity in production), consistent error envelope and graceful shutdown. The API keeps running when MySQL is down so health endpoints can report it.
- Environment validation with Zod; the process refuses to start with weak or missing secrets.
- Complete MySQL schema: 28 tables in six sequelize-cli migrations, with foreign keys, unique constraints for idempotency, generated scope keys, DECIMAL money, UTC `DATETIME(3)` and append-only audit triggers.
- Sequelize models and associations for every table.
- RBAC catalog (27 permissions, 6 roles) seeded idempotently, plus default queue/posting settings and an optional internal Tally server record.
- Authentication: bcrypt, 15-minute access JWT, rotating refresh tokens with reuse detection, HTTP-only cookies, double-submit CSRF, account lockout, login rate limiting, forgot/reset password with single-use hashed tokens, full audit of auth events.
- Company-scoped dashboard APIs (overview, analytics, activity, health) computed from live data.
- Job state machine, AES-256-GCM secret encryption and HMAC helpers with 16 unit tests.
- Development-only demo seeder (fictional companies, applications, ~460 expenses, jobs, attempts, verified vouchers, master requests) that refuses to run in production.

**Frontend (`frontend/`)**

- Theme system: light, dark and system modes; Poppins headings and Inter body text; indigo, purple and orange palette; glass surfaces; reduced-motion support.
- Split-screen animated login with validation, show/hide password, remember me, inline errors and a shake on failure; forgot- and reset-password pages with a strength meter.
- In-memory access token, silent refresh on startup, a single shared refresh call on 401s, and handling of multi-tab refresh races.
- App shell: collapsible sidebar (compact icon mode or expanded with sections), mobile drawer, glass top bar, Ctrl/Cmd+K command palette, live notification counts, account menu with theme switcher and sign-out.
- Dashboard: animated welcome banner with mascot, integration health widget, eight metric cards (sparklines, trends, progress indicators), six interactive charts with a 7/30/90-day range, and recent-activity tabs plus application and company activity. Every widget has loading, error and empty states.
- Navigation for all twelve modules is permission-aware. Modules scheduled for later phases show an honest roadmap page instead of mock data.

## How to verify

1. Follow the setup in the root `README.md` (configure `backend/.env`, then run `npm run db:setup`).
2. `npm test` runs the unit tests for the state machine, encryption, HMAC, password policy and company scope.
3. `npm run dev`, then open http://localhost:5173 and sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`.
4. Without demo data the dashboard shows empty states. Health reports the API and database as online, and the agent and Tally as *Not configured* (or *Unknown* when a Tally server was seeded but no agent has checked it yet).
5. `npm run db:seed:demo` (development only), then refresh to see populated charts.
6. Lockout check: enter a wrong password `AUTH_MAX_FAILED_ATTEMPTS` times. The next attempt returns *locked*, and `audit_logs` contains `ACCOUNT_LOCKED`.
7. Session check: sign in, then sign out. Replaying the old refresh cookie returns 401 and revokes the session family.

## Known limitations / carried forward

- Verified against the local MySQL 8 instance: all 6 migrations applied, the append-only audit triggers reject `UPDATE` and `DELETE`, and login, refresh rotation, replay handling, logout revocation and all four dashboard endpoints return live data.
- Password-reset email requires SMTP settings; without them, development logs the link and production logs only a warning.
- The demo seeder cannot be undone, because `audit_logs` is append-only. Recreate the development database to reset it.
- Docker, Cloud Build and Cloud Run assets are scheduled for Phase 8.
