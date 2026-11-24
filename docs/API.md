# Tally Monitor API (v1)

Base path: `/api/v1`. All bodies are JSON.

## Conventions

Success:

```json
{ "success": true, "data": { }, "meta": { "page": 1, "pageSize": 25, "total": 120, "totalPages": 5 } }
```

Error:

```json
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Request validation failed", "details": [] }, "requestId": "…" }
```

| HTTP | Typical codes |
|---|---|
| 400 | `BAD_REQUEST`, `RESET_TOKEN_INVALID` |
| 401 | `UNAUTHORIZED`, `INVALID_CREDENTIALS`, `TOKEN_EXPIRED`, `TOKEN_INVALID`, `SESSION_INVALID`, `SESSION_EXPIRED` |
| 403 | `FORBIDDEN`, `CSRF_FAILED`, `ACCOUNT_DISABLED` |
| 404 | `NOT_FOUND` |
| 409 | `CONFLICT`, `DUPLICATE`, `INVALID_STATUS_TRANSITION`, `REFRESH_RACE` |
| 422 | `VALIDATION_ERROR` |
| 423 | `ACCOUNT_LOCKED` |
| 429 | `RATE_LIMITED` |
| 503 | `DATABASE_UNAVAILABLE` |

Every response carries `X-Request-Id` (an incoming `X-Request-Id` is honoured when well-formed).

Authentication: `Authorization: Bearer <accessToken>`. Cookie-authenticated endpoints (`/auth/refresh`, `/auth/logout`) also require `X-CSRF-Token` equal to the `tm_csrf` cookie.

## Health (public)

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness: `{ "status": "ok" }` |
| GET | `/health/ready` | Readiness: 200 when MySQL answers, otherwise 503 |

## Authentication

### `POST /auth/login`

Rate limited to 20 attempts / 15 min per IP + email.

```json
{ "email": "admin@example.com", "password": "…", "rememberMe": true }
```

Response `200`:

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ…",
    "expiresIn": 900,
    "user": {
      "uuid": "…", "email": "admin@example.com", "fullName": "Platform Administrator", "avatarUrl": null,
      "roles": [{ "code": "SUPER_ADMIN", "name": "Super Admin" }],
      "permissions": ["applications.manage", "…"],
      "companyScope": "ALL",
      "companies": null
    }
  }
}
```

Sets `tm_rt` (HTTP-only refresh cookie, path `/api/v1/auth`) and `tm_csrf`. Cookies persist for `REFRESH_REMEMBER_TTL_DAYS` with "remember me", otherwise they are browser-session cookies with a `REFRESH_TTL_HOURS` server-side lifetime.

Failures: `401 INVALID_CREDENTIALS`, `423 ACCOUNT_LOCKED` (after `AUTH_MAX_FAILED_ATTEMPTS`), `403 ACCOUNT_DISABLED`.

### `POST /auth/refresh`

Requires the refresh cookie and `X-CSRF-Token`. Rotates the refresh token and returns the same payload as login. Replaying an already-rotated token revokes the whole session family. `409 REFRESH_RACE` means a parallel request already rotated it; retry once.

### `POST /auth/logout`

Requires `X-CSRF-Token`. Revokes the session family and clears cookies.

### `GET /auth/me`

Returns the current user profile.

### `POST /auth/forgot-password`

`{ "email": "…" }` → always `202` with a generic message. Sends a reset link via SMTP when configured (in development without SMTP the link is logged to the console).

### `POST /auth/reset-password`

`{ "token": "…", "password": "NewStrong#Pass1" }` → resets the password, clears lockout and revokes every session.

## Dashboard (permission `dashboard.view`)

All dashboard data is computed live from MySQL and restricted to the caller's companies.

| Method | Path | Query | Description |
|---|---|---|---|
| GET | `/dashboard/overview` | `tzOffset` (minutes east of UTC, default 0) | Metric card values, 14-day daily series and 7-vs-7-day trends |
| GET | `/dashboard/analytics` | `days` (7–365, default 30), `tzOffset` | Expenses by company/application, daily transactions, posting outcome, queue distribution, 12-month trends |
| GET | `/dashboard/activity` | – | Latest expenses, verified vouchers, failed jobs, new applications, company audit activity |
| GET | `/dashboard/health` | – | API, database, Bridge Agent (heartbeat age), Tally (last agent-reported check, stale → `UNKNOWN`), last sync, last failed job |

Component statuses: `UP`, `DOWN`, `DEGRADED`, `UNKNOWN`, `NOT_CONFIGURED`. The API never invents a status: with no registered agent the agent status is `NOT_CONFIGURED`.

## Lists

All list endpoints accept `page` (default 1), `pageSize` (1–100, default 25), `search`, `sort` (whitelisted per endpoint) and `order` (`asc`/`desc`), and return `meta` with `page`, `pageSize`, `total`, `totalPages`. Every list is restricted to the caller's companies; records in other companies return `404`, not `403`.

## Companies (Phase 2)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/companies` | `companies.view` | `status=active\|inactive\|all`; sort `name`, `code`, `createdAt`, `expenses`, `openJobs`. Includes Tally server, agent, derived `integrationStatus` (`CONNECTED`, `AGENT_OFFLINE`, `NO_AGENT`, `NOT_CONFIGURED`, `INACTIVE`) and live stats |
| POST | `/companies` | `companies.manage` + all-company scope | `name`, `code` (uppercased), `gstin` (validated), `tallyCompanyName` (exact), `tallyServerId`, `integrationAgentId` (override), `defaultCurrency`, `financialYearStart`, `isActive` |
| GET | `/companies/:id` | `companies.view` | |
| PUT | `/companies/:id` | `companies.manage` | Partial update. Changing `tallyCompanyName` is refused (`409 COMPANY_BUSY`) while jobs are `PROCESSING` or `RECONCILIATION_REQUIRED` |
| GET | `/companies/:id/applications` | `companies.view` | Connected applications with source company key and activity |

## Applications (Phase 2)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/applications` | `applications.view` | `status`, `mode` filters; sort `name`, `createdAt`, `expenses`, `lastRequestAt` |
| POST | `/applications` | `applications.manage` | Wizard payload incl. `integrationMode` (`WEBHOOK`, `API`, `MANUAL`), `authMethod`, `apiEndpoint` (HTTPS), `credentials`, `companies[]`. Returns `{ application, webhookSecret }`; the secret is returned **only once** |
| GET | `/applications/:id` | `applications.view` | Includes `webhookUrl` and credential metadata (type, label, masked hint), never secret values |
| PUT | `/applications/:id` | `applications.manage` | Partial update; new `credentials` replace stored ones. Activation requires an active company link and credentials |
| DELETE | `/applications/:id` | `applications.manage` | Soft delete; `409 APPLICATION_BUSY` while jobs are open; credentials are revoked |
| POST | `/applications/:id/regenerate-secret` | `applications.manage` | Rotates the webhook secret immediately; returns the new secret once |
| POST | `/applications/:id/test-connection` | `applications.manage` | Returns `{ ok, checks[] }`. API mode performs a real HTTPS request only to hosts in `KISSFLOW_ALLOWED_HOSTS` (no IP literals, no redirects) |
| GET | `/applications/:id/companies` | `applications.view` | |
| POST | `/applications/:id/companies` | `applications.manage` | `{ companyId, sourceCompanyKey }`; key unique per application |
| PUT | `/applications/:id/companies/:companyId` | `applications.manage` | `{ sourceCompanyKey?, isActive? }` |
| DELETE | `/applications/:id/companies/:companyId` | `applications.manage` | Returns `mode: REMOVED`, or `DEACTIVATED` when transactions exist for the pair |

Webhook authentication contract (enforced by the Phase 3 receiver): HMAC-SHA256 of the raw request body with the signing secret, hex-encoded in `X-Signature`; or `Authorization: Bearer <token>` for token mode.

## Tally connections & agents (Phase 2)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/tally/connections` | `tally.view` | `effectiveStatus` is the agent's last report if fresh (`TALLY_HEALTH_STALE_SECONDS`), else `UNKNOWN` |
| POST | `/tally/connections` | `tally.manage` | `name`, `host`, `port`, `protocol`, `tallyRelease`, `integrationAgentId`, `isActive` |
| PUT | `/tally/connections/:id` | `tally.manage` | Changing host/port resets status to `UNKNOWN`; blocked while jobs are in flight |
| POST | `/tally/connections/:id/test` | `tally.manage` | Checks agent assignment, heartbeat freshness and the latest agent-reported Tally status |
| GET | `/tally/health` | `tally.view` | Agent and Tally health rollup |
| GET | `/tally/agents` | `tally.view` | |
| POST | `/tally/agents` | `agents.manage` | Returns `{ agent, agentSecret }` once; only the SHA-256 hash is stored |
| POST | `/tally/agents/:id/rotate-secret` | `agents.manage` | |
| POST | `/tally/agents/:id/revoke` | `agents.manage` | Permanent |

## Users, roles & settings (Phase 2)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/users` | `users.view` | `status=active\|inactive\|locked\|all`, `role` |
| POST | `/users` | `users.manage` | `email`, `fullName`, `password` (policy), `roles[]`, `companyScope` (`ALL`/`ASSIGNED`), `companyIds[]` |
| PUT | `/users/:id` | `users.manage` | Deactivation revokes sessions. Guards: no self-deactivation, no removing your own Super Admin role, only Super Admins grant or edit Super Admin, at least one active Super Admin |
| POST | `/users/:id/unlock` | `users.manage` | Clears lockout |
| POST | `/users/:id/password` | `users.manage` | Sets a new password and revokes all sessions |
| GET | `/roles` | `users.view` | Roles with permission codes and user counts |
| GET | `/roles/permissions` | `users.view` | Permission catalog |
| POST | `/roles` | `users.manage` | Custom role |
| PUT | `/roles/:id` | `users.manage` | Replace permissions; the Super Admin role is immutable |
| DELETE | `/roles/:id` | `users.manage` | Custom roles only, when unassigned |
| GET | `/settings` | `settings.view` | Validated settings plus read-only environment security policy |
| PUT | `/settings/:key` | `settings.manage` | `{ value }`, validated per key. `posting.require_finance_approval` and `masters.allow_auto_creation` are locked |

## Read-only records (Phase 2, full modules in Phases 3 and 5)

| Method | Path | Permission | Filters |
|---|---|---|---|
| GET | `/expenses` | `expenses.view` | `companyId`, `applicationId`, `status`, `search`; sort `receivedAt`, `expenseDate`, `amount` |
| GET | `/jobs` | `jobs.view` | `companyId`, `applicationId`, `status`, `search`; sort `createdAt`, `updatedAt`, `priority`, `attempts` |
| GET | `/audit-logs` | `audit.view` | `companyId`, `applicationId`, `entityType`, `entityId`, `action`, `search` |

## Webhook intake (Phase 3, public)

`POST /api/v1/webhooks/:applicationCode`. Authenticated by the application's secret, never by a user session. Rate limited to 600 requests/minute per application. Body limit 2 MB, one JSON object per request.

| Auth mode | Required headers |
|---|---|
| Bearer token | `Authorization: Bearer <token>` (or `X-Webhook-Token: <token>`) |
| HMAC-SHA256 | `X-Signature: <hex>` (optional `sha256=` prefix) = HMAC of the raw body; with `X-Timestamp: <unix seconds>`, sign `"<timestamp>.<body>"` (5-minute window) |

Responses: `202` accepted `{ status, receiptId, expenseId, jobId, warnings }` · `200` duplicate · `400` invalid JSON · `401` auth · `403` application inactive · `404` unknown application (not logged) · `409` same source id with different content (`PAYLOAD_CONFLICT`) or wrong integration mode · `422` `MAPPING_NOT_CONFIGURED`, `NORMALIZATION_FAILED` (with `details.errors`), `NOT_APPROVED`, `COMPANY_NOT_MAPPED`, `COMPANY_LINK_INACTIVE`, `COMPANY_INACTIVE`, `INVALID_BODY` · `5xx` nothing stored, safe to retry.

Duplicate detection uses `<APPLICATION_CODE>:<sourceTransactionId>` and a key-order-independent SHA-256 of the payload. Payloads are stored with banking and contact fields masked; unauthenticated requests are logged without payload. See [KISSFLOW-SETUP.md](KISSFLOW-SETUP.md).

## Field mapping & intake (Phase 3)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/applications/mapping-catalog` | `applications.view` | Target fields, transforms and templates (`tally-monitor-v1`, `kissflow-expense-raw`) |
| GET | `/applications/:id/mappings` | `applications.view` | |
| PUT | `/applications/:id/mappings` | `applications.manage` | `{ mappings: [{ targetField, sourcePath, transform?, defaultValue?, isRequired? }] }`; validated (required fields, paths, line-item rules); replaces the set; audited |
| POST | `/applications/:id/mappings/preview` | `applications.view` | `{ payload, mappings? }`: dry run with normalized output, per-field trace, errors and approval, company and duplicate checks; writes nothing |
| POST | `/applications/:id/import` | `applications.manage` | `{ payload }`: manual import through the same pipeline; returns the intake outcome |
| POST | `/applications/:id/sync` | `applications.manage` | API mode: fetches the endpoint (array or `Data`/`data`/`items`, max 200) and ingests each item |
| GET | `/applications/:id/receipts` | `applications.view` | Intake log; `status`, `source`, `search` |
| GET | `/applications/:id/receipts/:receiptId` | `applications.view` | Includes masked payload, normalized result, kept headers and error details |

Source paths: dot and `[index]` notation, `["key with.dots"]`, and `a|b` fallbacks. Transforms: `text`, `number`, `money` (`"776 INR"`, `1,234.50`), `date`, `datetime` (Kissflow `…-08:00 America/Los_Angeles`), `upper`, `lower`, `user_name`, `user_id`, `approval` (Completed/Approved → APPROVED), `attachments`, `boolean`, `array`.

## Expenses (Phase 3)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/expenses` | `expenses.view` | Filters: `companyId`, `applicationId`, `status`, `approvalStatus`, `voucherKind`, `category`, `dateFrom`, `dateTo` (expense date), `amountMin`, `amountMax`, `search` |
| GET | `/expenses/categories` | `expenses.view` | Distinct categories for filters |
| GET | `/expenses/:id` | `expenses.view` | Normalized data, line items with ledger-mapping status, documents, intake validation, jobs + attempts, Tally responses, posted vouchers, receipts, audit timeline, original and normalized payloads |

## Ledgers & masters (Phase 4)

All are company-specific: pass `companyId`; other companies' records return `404`.

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/ledgers` | `ledgers.view` | `companyId` (required), `status`, `source` (`TALLY_SYNC`, `MANUAL_IMPORT`, `MASTER_REQUEST`), `search`, paging |
| POST | `/ledgers/import` | `ledgers.manage` | `{ companyId, text }`: one ledger per line, `Name<TAB or comma>Parent group`; upserts by name; header and duplicates skipped |
| PUT | `/ledgers/:id` | `ledgers.manage` | `{ isActive?, parentGroup? }` |
| GET | `/ledgers/unmapped` | `ledgers.view` | Categories on unposted expenses without an active mapping, with counts and amounts |
| GET | `/ledgers/missing` | `ledgers.view` | Ledgers referenced by mappings or voucher rules that are not active masters, with any open request |
| GET | `/ledger-mappings` | `ledgers.view` | `companyId`, optional `applicationId`, `search` |
| POST | `/ledger-mappings` | `ledgers.manage` | `{ companyId, applicationId?, sourceCategory, tallyLedgerName, costCentre?, isActive? }`; unique per company, application scope and category. Application-scoped mappings override company-wide ones |
| PUT / DELETE | `/ledger-mappings/:id` | `ledgers.manage` | Audited with before/after |
| GET | `/master-requests` | `ledgers.view` | `companyId?`, `status` (`open` default, or a specific status, or `all`) |
| POST | `/master-requests` | `masters.request` | `{ companyId, masterType, proposedName, proposedParent, notes? }`; refused if the ledger exists or an open request exists |
| PUT | `/master-requests/:id` | `masters.request` | Edit name/group while `PENDING_REVIEW` |
| POST | `/master-requests/:id/approve` | `masters.approve` | Requester cannot approve their own request |
| POST | `/master-requests/:id/reject` | `masters.approve` | `{ notes }` required |
| POST | `/master-requests/:id/mark-created` | `masters.approve` | Only from `APPROVED`. Registers the ledger (`source: MASTER_REQUEST`, unverified until the Bridge Agent reads it back) |

## Vouchers (Phase 4)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/voucher-configurations` | `vouchers.view` | `companyId`; includes usage and which applications default to it |
| POST | `/voucher-configurations` | `vouchers.manage` | Kind (`PAYMENT`, `JOURNAL`, `RECEIPT`, `CONTRA`, `PURCHASE`), Tally voucher type name, numbering (`TALLY_AUTO`, `SOURCE_REFERENCE`, `TEMPLATE`), debit rule (`LEDGER_MAPPING`/`FIXED`), credit rule (`FIXED`/`EMPLOYEE_LEDGER`/`VENDOR_LEDGER`), party rule, tax rule, narration and reference templates, cost centre and bill allocation flags, approval policy (`ALWAYS` or `ABOVE_THRESHOLD` + amount; "no approval" is refused) |
| PUT | `/voucher-configurations/:id` | `vouchers.manage` | Partial update |
| GET | `/voucher-mappings` | `vouchers.view` | Routing rules: application (+ optional category) → configuration |
| POST / PUT / DELETE | `/voucher-mappings[/:id]` | `vouchers.manage` | `{ companyId, applicationId, expenseCategory?, voucherConfigurationId, priority, isActive }` |
| GET | `/vouchers` | `vouchers.view` | Posted voucher register; `companyId`, `verificationStatus`, `dateFrom`, `dateTo`, `search` |

Configuration resolution for an expense: category rule → application-wide rule → the company's active configuration for the application's default voucher kind.

## Accounting validation (Phase 4)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/expenses/:id/voucher-preview` | `expenses.view` | Dry run: entries (ledger/debit/credit, cost centre, bill reference), totals, `balanced`, narration, reference, party, voucher number, `approvalRequired`, issues, required masters, `outcome`, configuration source |
| POST | `/expenses/:id/validate` | `jobs.manage` | Runs the engine under a row lock and moves the job through the state machine: `MAPPING_REQUIRED`, `MASTER_CREATION_REQUIRED` (auto-raises deduplicated master requests), `VALIDATION_FAILED`, `AWAITING_APPROVAL` or `READY_TO_POST`. Stores the voucher draft and resolved ledgers, resets any earlier approval, audits `EXPENSE_VALIDATED`. Refused (`409`) for processing, posted, cancelled or reconciliation jobs |
| POST | `/companies/:id/revalidate` | `jobs.manage` | Revalidates up to 500 blocked jobs (received, validation failed, mapping or master required) and returns counts by outcome |

The product brief's `POST /vouchers/:id/validate` corresponds to `POST /expenses/:id/validate` (a voucher does not exist until it is posted). Posting (`/vouchers/:id/post`) arrives with the queue engine and Bridge Agent.

## Processing queue (Phase 5)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/jobs` | `jobs.view` | Filters: `companyId`, `applicationId`, `status`, `statusGroup` (`open`, `attention`, `all`), `paused`, `deadLetter`, `search`; sort `createdAt`, `updatedAt`, `priority`, `attempts` |
| GET | `/jobs/summary` | `jobs.view` | Counts by status, paused, dead letter |
| GET | `/jobs/worker-status` | `jobs.view` | Worker lease owner, heartbeat, last-tick stats and queue settings |
| GET | `/jobs/:id` | `jobs.view` | Voucher draft, approval (incl. whether its hash still matches), lock, attempts, Tally responses, audit timeline, payloads |
| POST | `/jobs/:id/approve` | `jobs.approve` | Only `AWAITING_APPROVAL` with a balanced draft; stores the draft's SHA-256. Users cannot approve transactions they imported manually |
| POST | `/jobs/bulk-approve` | `jobs.approve` | `{ jobIds[], notes? }`; per-job results |
| POST | `/jobs/:id/reject` | `jobs.approve` | `{ reason }` → `CANCELLED` |
| POST | `/jobs/:id/cancel` | `jobs.manage` | `{ reason }`; refused for `PROCESSING` and `RECONCILIATION_REQUIRED` |
| POST | `/jobs/:id/retry` | `jobs.manage` | `FAILED` → `RETRY_PENDING` now (grants one extra attempt); `RETRY_PENDING` → due now. Refused for reconciliation |
| POST | `/jobs/:id/pause`, `/resume` | `jobs.manage` | Paused jobs are never claimed or auto-validated |
| POST | `/jobs/:id/revalidate` | `jobs.manage` | Same as `POST /expenses/:id/validate` |
| POST | `/jobs/:id/reconcile` | `vouchers.post` | `{ resolution: 'FOUND', notes, voucherNumber, voucherDate, tallyMasterId? }` → `POSTED` (manually verified voucher), or `{ resolution: 'NOT_FOUND', notes }` → `RETRY_PENDING` |

### Worker

A background worker runs inside the API (`QUEUE_WORKER_ENABLED`, `QUEUE_WORKER_INTERVAL_SECONDS`). A row in `queue_worker_leases` ensures only one instance runs at a time. Each tick:

- **Auto-validation:** validates `RECEIVED` jobs when `queue.auto_validate` is on.
- **Stale-lock recovery:** handles `PROCESSING` jobs whose lease expired.
  - Not submitted → `RETRY_PENDING` with exponential backoff, or `FAILED` + dead letter once attempts are exhausted.
  - Submitted, or provenance unknown → `RECONCILIATION_REQUIRED`.
- **Heartbeat:** records its own heartbeat and stats.

## Bridge Agent contract (Phases 5–6; agent program in `bridge-agent/`)

Every call carries `X-Agent-Key: <agent key>` and `Authorization: Bearer <agent secret>`. Only the secret's hash is stored, and revoked agents get `403`.

| Method | Path | Body | Behaviour |
|---|---|---|---|
| POST | `/agents/register` | `{ hostname?, osInfo?, agentVersion? }` | Marks the agent online; returns its servers, companies (exact Tally names) and polling configuration |
| POST | `/agents/heartbeat` | `{ …, servers?: [{ serverId, status: ONLINE/OFFLINE/ERROR, error?, companies?: string[] }] }` | Updates agent and Tally server health (this drives the dashboard). `companies` = companies open in TallyPrime; stored as the server's discovered companies and shown per company as "open in TallyPrime" |
| GET | `/agents/jobs?limit=n&companies=uuid,…` | – | `companies` (optional) restricts claiming to those companies (the agent's `ALLOWED_COMPANIES`). Claims up to `n` jobs, within the agent's `max_concurrency`: `READY_TO_POST` and due `RETRY_PENDING`, not paused. Uses `FOR UPDATE SKIP LOCKED`; with `queue.serialize_per_company`, at most one `PROCESSING` job per company. Drafts whose approval hash no longer matches are sent back for revalidation and approval instead of being claimed. Returns the job, attempt id, lock expiry, company, server and voucher |
| POST | `/agents/jobs/:id/submitting` | `{ attemptId }` | **Must** be called immediately before sending the import to Tally |
| POST | `/agents/jobs/:id/heartbeat` | `{ attemptId }` | Extends the lease |
| POST | `/agents/jobs/:id/result` | `{ attemptId, outcome, errorCode?, errorMessage?, tally?, readback? }` | `POSTED` + `readback` is verified server-side (reference, date, voucher type, every ledger and amount): match → `POSTED` with a verified posted voucher; mismatch → `RECONCILIATION_REQUIRED`. `REJECTED` → `FAILED`. `NOT_SUBMITTED` → backoff retry or dead letter (treated as `AMBIGUOUS` if `/submitting` was called). `AMBIGUOUS` → `RECONCILIATION_REQUIRED` |
| POST | `/agents/ledgers/sync` | `{ companyId, ledgers: [{ name, parent?, guid?, masterId?, alterId? }] }` (up to 15 MB) | Full ledger list of one assigned company read from Tally. Upserts by name as `TALLY_SYNC` (verified now), deactivates ledgers no longer in Tally, re-links mappings, marks matching `CREATING`/`CREATED` master requests `VERIFIED`, stamps `companies.ledgers_synced_at`, then revalidates jobs waiting for masters. Audited `LEDGERS_SYNCED` |
| GET | `/agents/master-requests?companies=…` | – | Claims up to 5 `APPROVED` ledger requests (`LEDGER`, `PARTY_LEDGER`, `BANK_LEDGER`), or `CREATING` ones stale for 10 minutes, and marks them `CREATING`. Returns company, exact Tally name, ledger name, parent group and bill-wise flag |
| POST | `/agents/master-requests/:id/result` | `{ outcome: CREATED/EXISTS/FAILED, error?, readback?: { name, parent, guid, masterId, alterId }, tally? }` | `CREATED`/`EXISTS` need a read-back whose name and parent match the approved request → `VERIFIED`, ledger registered with Tally ids, blocked jobs revalidated. Otherwise → `FAILED` with the reason in `details.error` |

`POST /master-requests/:id/retry-creation` (`masters.approve`): `FAILED` → `APPROVED`, so the Bridge Agent tries again after Finance fixed the cause.

## Audit logs (Phase 5)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/audit-logs` | `audit.view` | Filters: `companyId`, `applicationId`, `entityType`, `entityId`, `action`, `actorType`, `dateFrom`, `dateTo`, `search` |
| GET | `/audit-logs/actions` | `audit.view` | Distinct actions for filters |

## Upcoming endpoints

## Reports (Phase 7)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/reports` | `reports.view` | Catalog: key, title, description, whether application filter applies, date field label |
| GET | `/reports/:key` | `reports.view` | Run report. Query: `dateFrom`, `dateTo`, `companyId`, `applicationId`, `page`, `pageSize` (≤100). Response: `{ report, filters, summary[], chart?, columns[], rows[], meta }`. Keys: `company-expenses`, `application-expenses`, `payment-vouchers`, `posting-success`, `failed-transactions`, `pending-queue`, `missing-ledgers`, `ledger-mappings`, `monthly-expenses`, `integration-audit` |
| GET | `/reports/:key/export` | `reports.export` | `format=csv\|xlsx\|pdf` plus the same filters. Attachment download. Refused above 50,000 rows (`422 EXPORT_TOO_LARGE`). Audited `REPORT_EXPORTED` |

## Upcoming endpoints

GCP deployment automation (Phase 8).
