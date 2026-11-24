# Phase 6 – Tally Bridge

Phase 6 delivers the Windows Bridge Agent as a standalone folder, [`bridge-agent/`](../bridge-agent/README.md). It is deliberately outside the npm workspaces so it can be copied to the Tally machine on its own. The phase also adds the server endpoints the agent needs.

## What was built

### Bridge Agent (`bridge-agent/`)

Plain Node.js 20+ (ES modules), with no build step and one dependency (`fast-xml-parser`).

| Module | Responsibility |
|---|---|
| `src/config.js` | `.env` loading, validation, safety switches (`POSTING_ENABLED`, `MASTER_CREATION_ENABLED`, `LEDGER_SYNC_ENABLED`, `ALLOWED_COMPANIES`), HTTPS enforcement |
| `src/api.js` | Outbound client for `/api/v1/agents/*`, with retry on network errors, 5xx and 429 |
| `src/tally/client.js` | HTTP POST of XML to TallyPrime; UTF-8/UTF-16 decoding; timeouts; one request at a time per Tally server; tells "never sent" apart from "sent, outcome unknown" |
| `src/tally/xml.js` | Request builders (companies, ledgers, ledger by name, voucher by reference, voucher import, ledger create) and tolerant response parsers |
| `src/jobs/postVoucher.js` | The posting decision procedure (below) |
| `src/jobs/masters.js` | Approved ledger creation: existence check → create → read back |
| `src/jobs/ledgerSync.js` | Read-only ledger sync for every assigned company that is open in TallyPrime |
| `src/outbox.js` | Durable result outbox (`state/outbox.json`), written before sending |
| `src/agent.js` | Register, heartbeat with discovery, sync, poll loops, job lease heartbeats, graceful stop |
| `src/cli.js` | Read-only `diagnose`, `companies`, `ledgers`, `find-voucher` and `preview-xml` commands |
| `scripts/*.ps1` | NSSM service install and uninstall, with an ACL lock-down of `.env` |
| `test/fakeTally.js` | TallyPrime XML simulator for tests and dry runs |

### Posting procedure

1. **Pre-flight.** Nothing has been sent to Tally yet, so every failure here is `NOT_SUBMITTED` and safe to retry.
   - The company is in `ALLOWED_COMPANIES`.
   - The reference is safe to filter on.
   - The company is open in TallyPrime.
   - No voucher with this reference exists on that date. If more than one exists → `AMBIGUOUS`.
2. **Declare.** `POST /agents/jobs/:id/submitting`.
3. If exactly one voucher with the reference already exists (an earlier attempt whose result was lost), report it as `POSTED` with its read-back. **It is never imported twice.**
4. **Import** with an explicit `SVCURRENTCOMPANY`. Debits are negative with `ISDEEMEDPOSITIVE=Yes`. Cost centres go under the configured cost category; bill allocations are *New Ref*.
5. **Read back** by reference and date, then report:

| Read-back finds | Report |
|---|---|
| One voucher | `POSTED` + read-back; the server verifies every field and amount |
| None, and Tally returned errors | `REJECTED`, with Tally's line error |
| Several vouchers, nothing despite created=1, read-back failure, or timeout / dropped connection after sending | `AMBIGUOUS` → reconciliation |

### Server additions

- Endpoints:
  - `POST /agents/ledgers/sync` (15 MB body limit on this route only);
  - `GET /agents/master-requests`;
  - `POST /agents/master-requests/:id/result`;
  - `POST /master-requests/:id/retry-creation`.
- Heartbeats carry the companies open in TallyPrime. They are stored as `tally_servers.discovered_companies`/`discovered_at`. The API exposes them as `loadedInTally` per company (Tally Connections) and `companyLoaded` (company detail).
- `companies.ledgers_synced_at`.
- Ledger sync:
  - upserts as `TALLY_SYNC` with GUID, MasterID and AlterID;
  - deactivates ledgers that are no longer in Tally;
  - marks matching master requests `VERIFIED`;
  - revalidates jobs waiting for masters.
- Agent claim filter: `?companies=uuid,…` on both job and master-request claims. With it, `ALLOWED_COMPANIES` never takes jobs it would only hand back.
- Migration `20261102000003-agent-discovery`.

### UI

- Tally Connections:
  - company chips turn green when the company is open in TallyPrime and orange when it is not;
  - a warning appears for companies that aren't open;
  - a list shows the open companies, flagging unmapped ones.
- Company → Tally tab: "Open in TallyPrime", "Ledgers synced from Tally", and a mismatch warning.
- Master requests: Tally's error is shown on failed requests, with a **Retry creation** action.

## Verification

- **Agent unit tests** (`npm test` in `bridge-agent/`): 20 passing. They cover:
  - XML building and escaping, and the sign convention;
  - parsing of classic and v1 responses, and of UTF-16 responses and illegal control characters;
  - every posting branch: success, existing voucher, rejection, company not loaded, not allowed, Tally down, lost response, dropped connection, duplicates, refused `/submitting`;
  - master creation: created, exists, failed.
- **End-to-end** on a throwaway database (`tally_monitor_p6verify`, since dropped): 42 checks passing. It used the real API, the real agent process and the fake Tally, and covered:
  - discovery and health;
  - ledger sync, including deactivation;
  - missing ledger → master request → approval → agent creates it → job unblocked;
  - approval → posted and verified, with the simulator's MasterID;
  - lost response → posted with no duplicate;
  - dropped connection → reconciliation;
  - Tally rejection → failed, with the line error;
  - failed master creation → retry;
  - JSON logs with no secret, outbox drained, audit trail, and writes to the allowed company only.
- Backend unit tests: 46 passing. Backend and frontend type-check, and the frontend builds.

## Live pilot (read path)

Proven on the customer's TallyPrime machine: agent registered, company discovered (`VENWIND REFEX POWER LIMITED`), and **1208** ledgers synced. Remaining ops step (not blocking Phase 7): enable `POSTING_ENABLED` and post one Finance-approved voucher, then confirm Day Book.

## Next

Phase 7, reporting: ten reports with filters, plus Excel/CSV/PDF export.
