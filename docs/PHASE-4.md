# Phase 4 – Accounting Engine: delivery notes

## Delivered

### Voucher engine (`backend/src/domain/voucherEngine.ts`)
- A pure, deterministic engine; all money is handled in integer paise. It turns an expense and its lines into a Tally voucher draft:
  - **Debits:** one debit per mapped category ledger. Lines that map to the same ledger and cost centre are merged, and application-scoped mappings win over company-wide ones.
  - **Tax:** optionally split into a tax ledger.
  - **Credit:** a fixed ledger (bank, payable or suspense), or an employee or vendor party ledger built from a name template.
  - **Other fields:** party ledger, cost centres and bill references (when enabled), and narration, reference and number templates.
- Balance is enforced: debit = credit = the expense amount.
- Approval: `ALWAYS`, or `ABOVE_THRESHOLD`. Any other value is treated as "approval required"; Finance approval cannot be switched off.
- Each expense gets one outcome: `OK`, `MAPPING_REQUIRED`, `MASTER_CREATION_REQUIRED` (with proposed masters and groups) or `VALIDATION_FAILED` (missing or inactive configuration, unsupported voucher kind, foreign currency, unbalanced, zero amount, tax above line).

### Ledger Management (`/ledgers`)
- **Company picker:** data never mixes across companies, and the selection is kept in the URL.
- **Category mappings:** application-scoped or company-wide, with ledger autocomplete and a warning when the ledger isn't in the company's Tally list.
- **Unmapped categories:** found on unposted expenses, with counts, amounts and a one-click **Map**.
- **Missing ledgers:** ledgers referenced by mappings or by credit/tax rules that don't exist, with **Request creation**.
- **Master requests:**
  - Pending requests can be edited.
  - Approve and reject require a reason to reject; the requester can never review their own request.
  - **Mark created** is only allowed after approval. It registers the ledger as unverified until the Bridge Agent reads it back.
  - Validation raises requests automatically and deduplicates them.
- **Tally ledgers:** import by pasting from Tally (tab or comma separated, header-aware, upsert by name), with source and verification shown, and deactivate.
- **Revalidate blocked expenses** after changing mappings or ledgers.

### Voucher Management (`/vouchers`)
- **Configuration cards:** debit/credit/party/tax rules, numbering, approval policy and usage.
- **Configuration editor:** includes a live sample voucher.
- **Routing rules:** application plus an optional category, mapped to a configuration, with priority.
- **Posted-voucher register:** voucher number, date, reference, MasterID/AlterID and verification status.

### Expenses
- The expense detail page has a **Voucher preview** (Ledger | Debit | Credit, a "Debit = Credit" badge, voucher date and type, party, narration, reference). It shows the issues found, with shortcuts to map categories or open master requests.
- **Validate & save** locks the draft into the job and moves its status. Revalidating always clears an earlier approval.

### Companies
- The Ledger Mapping and Voucher Mapping tabs now embed the live panels for that company.

### Data
- Migration `20261102000001-ledger-provenance.js` adds ledger `source`, `last_verified_at`, `created_by`, and `master_creation_requests.ledger_master_id`. It is already applied to the development database.

## Verification performed

- **42 unit tests**, including 12 for the engine. One test reproduces the proven pilot voucher shape (Food 500 + Conveyance 100 against Suspense 600). Others cover merging, scope precedence, missing mappings and ledgers, tax split, the employee party ledger, cost centres, bill references, thresholds, the "no approval" guard, numbering and unbalanced vouchers.
- **A 71-check end-to-end suite** on a throwaway MySQL database, dropped afterwards:
  - ledger import, mapping CRUD and conflicts;
  - the full status chain, RECEIVED → MAPPING_REQUIRED → MASTER_CREATION_REQUIRED → AWAITING_APPROVAL → READY_TO_POST, plus approval reset on a policy change;
  - auto-raised and deduplicated master requests, approve and reject, separation of duties, mark-created;
  - configuration validation (no "no approval" policy, no sales vouchers, required templates and thresholds);
  - category routing, refusal to revalidate posted jobs, company scoping, permission denials and the audit trail.

## How to set it up for a company

1. **Ledger Management → Tally ledgers → Import:** in TallyPrime, open the List of Ledgers, export or copy it, and paste.
2. **Voucher Management → Configurations:** for example "Journal" with credit *Employee Reimbursements Payable* (or the employee party ledger) and approval *Always*.
3. **Applications:** set the application's default voucher type, or add **Routing rules** per category.
4. **Category mappings:** map each Kissflow category (Food Claim, Local Conveyance, …) to its Tally ledger. Use **Unmapped categories** to find what's needed.
5. Open an expense → **Voucher preview** → **Validate & save**, or use **Revalidate blocked expenses** for the whole company.
6. Validated expenses wait in **Awaiting approval** (or **Ready to post** below a threshold). Finance approval and posting arrive in Phase 5 (queue) and Phase 6 (Bridge Agent).
