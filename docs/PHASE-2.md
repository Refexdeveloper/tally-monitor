# Phase 2 – Configuration: delivery notes

## Delivered

### Companies
- Searchable, sortable, paginated listing: GSTIN, exact Tally company name, Tally server, connected applications, expense count and value, posted vouchers, pending jobs, and a derived integration status. That status comes from real agent heartbeats; it is never assumed.
- Add and edit dialog with GSTIN and code validation, Tally server assignment, optional agent override, currency, financial year and active flag.
- Detail page with nine tabs:
  - Live: Overview, Connected Applications, Expenses, Tally Configuration, Processing Queue and Audit History.
  - Explained as later-phase features: Ledger Mapping and Voucher Mapping (Phase 4), Reports (Phase 7).
- Guard: the Tally company name cannot change while postings are in flight or awaiting reconciliation.

### Applications
- Card listing with live stats; filters by status and mode.
- Five-step Add Application wizard: basics (icon and colour), Kissflow identifiers, integration mode and authentication, company connections with source company keys, and review with optional activation.
- Integration secrets:
  - The HMAC signing secret or webhook token is generated server-side, encrypted with AES-256-GCM and shown exactly once.
  - API credentials are encrypted at rest; only a masked hint derived from the key ID is ever displayed.
- Detail page with eight tabs: Overview, Connected Companies (add, edit, deactivate or remove), Expense Transactions, Processing Jobs, Field Mapping (Phase 3), Integration Configuration (webhook URL, secret rotation, credential replacement), API Logs (integration history) and Settings (activate, deactivate or delete).
- Test connection runs real checks. API mode makes an HTTPS call restricted to `KISSFLOW_ALLOWED_HOSTS`, which guards against server-side request forgery.
- Business rules:
  - Activation needs an active company and valid credentials.
  - Deletion is blocked while jobs are open.
  - Removing a company link that has history deactivates it instead of deleting it.

### Tally connections
- Server cards showing the endpoint, release, assigned agent, last health check, last success, errors and mapped companies.
- Add and edit servers. Changing the endpoint resets the status to `UNKNOWN`.
- Bridge Agent registry:
  - Registering an agent issues a unique key plus a one-time secret, stored only as a hash.
  - Secrets can be rotated; revocation is permanent.
- Connection test explains exactly what is and isn't known. The cloud never probes internal IPs itself; live probes come from the agent in Phase 6.

### Users and roles
- User listing with search, status (including locked) and role filters.
- Create and edit users, assign roles and company access (all companies or selected ones), unlock accounts, set a new password (revokes sessions), and activate or deactivate (revokes sessions).
- Roles: a permission-matrix editor for built-in and custom roles; custom roles can be created and deleted.
- Safeguards:
  - Users can't deactivate themselves or remove their own Super Admin role.
  - Only Super Admins can grant or modify Super Admin, and at least one active Super Admin must remain.
  - The Super Admin role is immutable.

### Settings
- Queue settings are validated: retry base and maximum delays, attempts, lock lease and per-company serialization.
- `posting.require_finance_approval` and `masters.allow_auto_creation` are locked safety rails, shown with their reason.
- The environment security policy is displayed read-only.

### Shared
- Company-scoped read APIs for expenses, jobs and audit logs.
- Reusable data table with server-side pagination and sorting, a debounced search toolbar, confirm, secret and test-result dialogs, and a mutation helper with toasts.
- Every change is audited, for example `COMPANY_UPDATED`, `APPLICATION_SECRET_REGENERATED`, `AGENT_REVOKED`, `ROLE_PERMISSIONS_CHANGED` and `SETTING_CHANGED`.

## Verification performed

- Type-checks and production builds for both workspaces; 16 unit tests pass.
- A 67-check end-to-end API suite was run against a throwaway, freshly migrated and seeded MySQL database, which was then dropped. It covered:
  - validation (422), duplicates (409) and business guards (400/409);
  - company scoping: a scoped Viewer sees only its company, other companies return 404, and the dashboard is scoped;
  - permission denials (403);
  - secret issuance and rotation, the SSRF host guard, and credential hints that reveal no secret material;
  - session revocation on deactivation, role and permission edits, the settings range and lock rules, and agent revocation.
- The same suite found and led to a fix for a credential-hint leak: the hint is now derived from the key ID, not the secret.

## Notes

- Webhook URLs use `PUBLIC_API_URL` (falling back to `APP_PUBLIC_URL`). Set it to the public HTTPS address of the API in each environment.
- The webhook receiver that enforces the `X-Signature` HMAC contract ships in Phase 3, so a "Last request" warning on the connection test is expected until then.
