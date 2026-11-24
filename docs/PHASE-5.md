# Phase 5 – Queue Engine: delivery notes

## Delivered

### Persistent queue (MySQL)
- **Controlled transitions:** every transition goes through the state machine under a row lock and is mirrored on the expense and audited.
- **Finance approval:**
  - Only for validated, balanced drafts.
  - Bound to the SHA-256 of the exact draft. A changed draft is never posted on an old approval: it goes back for approval, even if the database was edited directly.
  - Users can't approve transactions they imported themselves.
  - Bulk approve is available.
- **Other actions:** reject (reason required), cancel (reason required; refused once the job may be in Tally), pause/resume, revalidate, and retry. Retry works only from Failed or Retry Pending and grants one extra attempt.
- **Reconciliation:** required for anything that may already exist in Tally. "Found" records a manually verified posted voucher; "confirmed absent" makes the job safely retryable. Evidence is mandatory and no automatic retry ever happens.
- **Claiming:**
  - Persistent locks with lease expiry and heartbeat.
  - Per-agent concurrency, with `SELECT … FOR UPDATE SKIP LOCKED`.
  - Per-company serialization with a company row lock.
- **Retries and limits:** exponential backoff with jitter, a maximum attempt count, then dead letter.
- **Idempotency:** a unique job key per company, application and source. Duplicate and changed deliveries were already handled at intake (Phase 3).

### Worker
- **One active instance:** coordinated by a DB lease, so it is safe with several Cloud Run instances.
- **Auto-validation:** received jobs are validated automatically (setting `queue.auto_validate`).
- **Stale-lock recovery:**
  - never submitted → backoff retry or dead letter;
  - submitted, or no claim record → reconciliation.
- **Heartbeat:** records its own heartbeat and stats, shown on the Processing Queue page.

### Bridge Agent contract (server side)
- Agent authentication by key plus secret hash, with revocation.
- `register`, `heartbeat` (updates agent and Tally server health), `claim`, `submitting` (recorded before any Tally import), job heartbeat, and `result`. The result's Tally read-back is verified on the server.
- These are the exact endpoints the Phase 6 Windows agent will call.

### UI
- **Processing Queue:**
  - Live worker and agent status bar.
  - Clickable status counts: Open, Needs attention, each status, Dead letter, Paused.
  - The specified columns, company and application filters, and search.
  - Per-row actions and bulk approval with checkboxes.
- **Job detail:**
  - Status timeline and reconciliation guidance.
  - The voucher to post (Ledger | Debit | Credit).
  - Approval state, including whether it still matches the draft, and lock state (agent, lease, submitted or not).
  - Execution history, Tally responses with bodies, activity, and the draft, normalized and original payloads.
  - Actions that adapt to the job's state and your permissions.
- **Audit Logs:** filters for action, actor, company, application, date range and search, with a detail view (metadata JSON and entity links).
- Expense detail and record tables link to the job page.

### Data
- Migration `20261102000002-queue-engine.js`:
  - job approval hash and notes, cancellation and pause metadata, and lock indexes;
  - the `queue_worker_leases` table;
  - the `queue.auto_validate` setting.
- Already applied to the development database.

## Verification performed

- **46 unit tests**, including read-back verification and the approval hash.
- **An end-to-end suite** of about 70 checks on a throwaway MySQL database with a simulated Bridge Agent, dropped afterwards:
  - worker auto-validation and status; agent authentication, register and heartbeat; dashboard health turning UP;
  - self-approval blocked; approval bound to the hash; claim; per-company serialization; `/submitting` required;
  - verified posting with MasterID; transient failure → backoff → manual retry;
  - "not submitted" after submitting → reconciliation; retry and cancel refused during reconciliation; reconcile absent → re-post; read-back mismatch → reconciliation; reconcile found → posted;
  - Tally rejection → failed; pause and resume; dead letter after exhausted attempts;
  - stale locks before and after submission; a late agent result refused; a tampered draft not claimed and sent back for approval;
  - reject, bulk approve, cancel, permission denials, revoked agent and the audit trail.
- **On your dev database:** the worker validated 4 waiting demo jobs and moved 4 orphaned demo "Processing" jobs (no lock) to reconciliation.

## What you need to do

Nothing is blocking. To try it:

1. Open **Processing Queue**, then pick a job in **Awaiting approval** → **Approve for posting**. Sign in as a different user than the one who imported it.
2. Approved jobs wait in **Ready to post** until a Bridge Agent connects (Phase 6).
3. Review the 5 demo jobs in **Reconciliation** and use **Reconcile with Tally** to see the flow. These are demo data, so either answer is fine.
