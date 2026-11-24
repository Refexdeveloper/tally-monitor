# Connecting a Kissflow application to Tally Monitor

This guide wires the Kissflow **Expense Management** integration ("When an item is completed") to Tally Monitor. The same steps apply to any other Kissflow process.

```
Kissflow trigger (item completed) ─► Run JavaScript (build payload) ─► HTTP POST ─► Tally Monitor webhook
```

Tally Monitor stores the transaction, creates a processing job and replies at once. It never posts to Tally during the webhook call; validation, Finance approval and posting happen later in the queue.

## 1. Prepare Tally Monitor

1. **Companies**: create each group company with its exact TallyPrime company name.
2. **Applications → Add application**:
   - Mode: **Webhook**.
   - Authentication: **Bearer token** (simplest from Kissflow) or **HMAC-SHA256** (if your Run Script can compute HMACs).
   - Connect each company and set its **source company key**: the exact value Kissflow sends in the company field (for example the value of `Req_Entity`, such as `VENWIND REFEX POWER LIMITED`). Matching ignores case.
   - Copy the **webhook URL** and **token/secret**. The secret is shown once; use *Integration Configuration → Regenerate secret* if it is lost.
3. **Field Mapping** tab: choose **Apply template → Tally Monitor canonical payload (recommended)**, then **Save mapping**.
4. Paste a payload produced by the Run Script into **Test with a sample payload → Run preview**. It must show *This payload would be accepted* and route to the right company.
5. **Activate** the application.

Set `PUBLIC_API_URL` in `backend/.env` (and in Cloud Run) to the public HTTPS address of the API so the displayed webhook URL is correct.

## 2. Kissflow Run JavaScript step

Add a **Run JavaScript** step after the trigger. It turns the large Kissflow item into a small, explicit payload. Adjust the `CONFIG` block with Finance:

- which field identifies the company;
- which amount field is the *approved/claimable* amount for each category;
- which categories exist.

The script receives the trigger output as `item`. If your Kissflow step exposes it under a different name (for example an input variable you map from the trigger output), assign it to `item` at the top.

```javascript
// ---- Tally Monitor payload builder (schema tally-monitor.expense.v1) ----
const CONFIG = {
  companyKeyField: 'Req_Entity',            // value must equal the "source company key" in Tally Monitor
  requestNumberField: 'Expense_ID',
  expenseDateFields: ['Expense_Date', 'Request_Date', 'Completed_at_date'],
  costCentreField: 'Department',
  descriptionField: 'Expense_Purpose',
  // One line per category that has a positive approved amount. First non-empty field wins.
  // Finance must confirm these fields before going live.
  lines: [
    { category: 'Food Claim', amountFields: ['Total_Food_Bill_Amount', 'Food_Bill_Amount', 'Bill_Amount'] },
    { category: 'Local Conveyance', amountFields: ['Total_Local_Conveyance_Amount', 'Local_Conveyance_Claim_Amount'] },
  ],
  // Used when none of the configured lines has an amount (single-category claims).
  fallback: { categoryField: 'Expense_Category', amountFields: ['Total_Claimable_Amount', 'Expense_Amount'] },
  documentFields: ['Attach_Receipts', 'Attach_Bill', 'Upload_Bill', 'Bill_Attachment_1'],
};

// Kissflow amounts arrive as numbers or strings like "776 INR".
function toPaise(value) {
  if (value === null || value === undefined || value === '') return 0;
  const m = String(value).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  if (!m) return 0;
  return Math.round(parseFloat(m[0]) * 100);
}
function currencyOf(value) {
  const m = String(value || '').match(/\b([A-Z]{3})\b/);
  return m ? m[1] : null;
}
function first(obj, fields) {
  for (const f of fields) {
    const v = obj[f];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
}

const lines = [];
let currency = null;
for (const rule of CONFIG.lines) {
  const raw = first(item, rule.amountFields);
  const paise = toPaise(raw);
  if (paise > 0) {
    lines.push({ category: rule.category, amount: paise / 100, date: first(item, CONFIG.expenseDateFields) });
    currency = currency || currencyOf(raw);
  }
}
if (lines.length === 0) {
  const raw = first(item, CONFIG.fallback.amountFields);
  lines.push({ category: item[CONFIG.fallback.categoryField] || 'Uncategorised', amount: toPaise(raw) / 100, date: first(item, CONFIG.expenseDateFields) });
  currency = currencyOf(raw);
}

const totalPaise = lines.reduce((sum, l) => sum + Math.round(l.amount * 100), 0);
const documents = [];
for (const f of CONFIG.documentFields) {
  for (const a of item[f] || []) documents.push({ name: a.name, key: a.key, id: a.id, fileExtension: a.fileExtension });
}

const payload = {
  schema: 'tally-monitor.expense.v1',
  source_transaction_id: item._id,                       // immutable; drives duplicate protection
  request_number: item[CONFIG.requestNumberField] || String(item._request_number || ''),
  company_key: item[CONFIG.companyKeyField],
  expense_date: first(item, CONFIG.expenseDateFields),
  employee: {
    code: item._created_by && item._created_by._id,
    name: item._created_by && item._created_by.Name,
    email: item.Requester_Email || item.Created_by_Email || null,
  },
  category: lines.length === 1 ? lines[0].category : 'Multiple',
  description: item[CONFIG.descriptionField] || null,
  amount: totalPaise / 100,
  tax_amount: 0,
  currency: currency || 'INR',
  cost_centre: item[CONFIG.costCentreField] || null,
  approval_status: item._status,                          // "Completed" is treated as approved
  approved_at: item._completed_at || null,
  documents,
  lines,
};

return payload; // use the returned value as the HTTP step body
```

Tally Monitor recomputes and checks everything: the lines must add up to `amount`, the company key must be connected, and the item must be approved. A payload that fails is rejected with the reason, and nothing is stored as an expense.

> **Why not send the whole item?** The raw item is large, contains bank and contact details, and has many template fields. The Run Script keeps the contract explicit. Tally Monitor masks banking and contact fields before storage either way, and also offers a **Kissflow Expense Management (raw item)** mapping template if you prefer to send the item unchanged.

## 3. Kissflow HTTP step

| Setting | Value |
|---|---|
| Method | `POST` |
| URL | the webhook URL from Tally Monitor, for example `https://<your-domain>/api/v1/webhooks/EMS` |
| Header | `Content-Type: application/json` |
| Header (bearer mode) | `Authorization: Bearer <webhook token>` |
| Header (HMAC mode) | `X-Signature: <hex HMAC-SHA256 of the exact body using the signing secret>`; optional `X-Timestamp: <unix seconds>` and sign `"<timestamp>.<body>"` for replay protection (5-minute window) |
| Body | the Run JavaScript output |

Store the token in Kissflow's secure connection or credential settings, not in the script.

## 4. Responses

| HTTP | Meaning | Kissflow action |
|---|---|---|
| `202` | Accepted; expense and job created | none |
| `200` | Duplicate: the same item with the same content was already received | none |
| `400` | Body is not valid JSON | fix the Run Script |
| `401` | Missing or wrong token or signature | fix the credentials |
| `403` | Application inactive | activate it in Tally Monitor |
| `409` | Same item already received with **different** content | handle the correction in Tally Monitor; do not resend |
| `422` | Mapping, approval or company problem; `error.message` says exactly which | fix the data or mapping |
| `429` | Rate limited | retry later |
| `5xx` | Temporary failure; nothing was stored | safe to retry |

Every request (accepted or not) is visible under **Applications → (app) → API Logs**, with the reason, the masked payload and the normalized result.

## 5. Testing without Kissflow

From PowerShell (bearer mode):

```powershell
$body = Get-Content .\sample-expense.json -Raw
Invoke-RestMethod -Method Post -Uri "http://localhost:5173/api/v1/webhooks/EMS" `
  -Headers @{ Authorization = "Bearer <webhook token>" } -ContentType "application/json" -Body $body
```

Or use **Field Mapping → Import as real transaction** after a successful preview.
