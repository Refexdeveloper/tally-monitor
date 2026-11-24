# Phase 3 – Expense Integration: delivery notes

## Delivered

### Webhook receiver (`POST /api/v1/webhooks/:applicationCode`)
- **Authentication** runs on the raw request bytes before parsing:
  - a bearer token, or an HMAC-SHA256 `X-Signature` with optional `X-Timestamp` replay protection;
  - all comparisons are constant-time.
- **Logging:**
  - Unknown application codes are refused and not logged, so the endpoint can't be used to flood the database.
  - Unauthenticated requests are logged without their payload.
- **Response:** the transaction and its processing job (`RECEIVED`) are persisted in one database transaction with an `EXPENSE_RECEIVED` audit record, and the endpoint replies `202` immediately. It never contacts Tally.
- **Idempotency:** the same item resent gives `200 DUPLICATE`, even if its key order changes. The same item resent with different content gives `409 PAYLOAD_CONFLICT`, so corrections can't silently overwrite. Concurrent duplicate deliveries are handled by unique constraints.
- **Intake rules:** only approved items are accepted, the company key must match an active connection to an active company, amounts must be positive, and line items must add up to the total.
- **Storage:** banking and contact fields (IFSC, account, bank name, mobile, phone, WhatsApp, tokens) are masked before payloads are stored.

### Source adapter framework
- A pure mapping engine (`backend/src/domain/mapping.ts`):
  - JSON paths with indexes, quoted keys and `a|b` fallbacks;
  - 13 transforms, including decimal-safe money parsing of `"776 INR"` and Kissflow timestamp parsing;
  - line items with sub-field mapping, and validation rules.
- Two templates:
  - **Tally Monitor canonical payload** (recommended): produced by the Run Script in `docs/KISSFLOW-SETUP.md`.
  - **Kissflow Expense Management (raw item)**: maps your default integration output directly.
- One pipeline serves webhooks, **API sync** (pull from Kissflow, SSRF-guarded) and **manual import**.

### Applications
- **Field Mapping** tab:
  - Per-field editor with path, transform, default and required.
  - Templates.
  - Live **Run preview** against a pasted payload, using unsaved changes: normalized result, line items, approval, company routing and duplicate checks. It writes nothing.
  - **Import as real transaction** after a passing preview.
- **API Logs** tab: every intake request with outcome, HTTP status, auth result, reason and timing. A detail view shows the masked payload, normalized result, kept headers and error details, alongside the integration history.
- **Integration Configuration**: Kissflow setup instructions; **Sync now** for API mode.
- **Test connection** now also checks the field mapping and the last received request.

### Expense Transactions module
- Listing with the specified columns and filters: company, application, expense date range, amount range, category, approval status, processing status and voucher type, plus search.
- Detail page:
  - an animated status timeline (Received → Validated → Awaiting Approval → Queued → Processing → Posted), with alternate states shown at the stage where they occur;
  - expense information and routing;
  - line items with a ledger-mapping preview (resolved, mapped, ledger missing in Tally, or not mapped);
  - intake validation, processing jobs with attempts, Tally responses, the posted voucher with MasterID and AlterID, supporting documents, activity and intake requests;
  - both payloads (original masked, and normalized) in a JSON viewer.

### Data
- Migration `20261101000001-create-webhook-receipts.js` adds the `webhook_receipts` intake log. It is already applied to the development database.

## Verification performed

- 30 unit tests pass, including 14 for the mapping engine. They cover money rounding, Kissflow formats, paths and fallbacks, line-total mismatches, templates, hashing and masking.
- A 52-check end-to-end suite was run on a freshly migrated, throwaway MySQL database, which was then dropped. It covered:
  - draft and inactive applications, mapping validation, preview;
  - bearer and HMAC auth, including wrong and missing credentials, a stale timestamp replay and a fresh timestamp;
  - duplicates (including reordered keys) and changed-content conflicts;
  - unknown company keys, unapproved items, line mismatches, malformed JSON, array bodies and unknown codes;
  - your raw Kissflow item shape through the raw template;
  - payload masking, receipts, expense detail and filters, manual import (accepted, duplicate, rejected) and application stats.

## Your next steps

1. Follow `docs/KISSFLOW-SETUP.md`:
   - In Kissflow, add the Run JavaScript step, then an HTTP step. Confirm the `CONFIG` amount fields with Finance.
   - Set `PUBLIC_API_URL` so the webhook URL is reachable from Kissflow. In development this needs a tunnel; in production, the Cloud Run URL.
2. In Tally Monitor:
   - Apply the canonical template, set each company's source company key (for example the `Req_Entity` value), preview one real payload, then activate.
3. Accepted expenses wait as `RECEIVED` jobs. Accounting validation, ledger mapping and Finance approval arrive in Phases 4–5.
