# Phase 7 – Reporting

Ten operational and accounting reports with company / application / date filters, interactive charts, and server-side CSV, Excel and PDF export.

## Delivered

### API

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/reports` | `reports.view` | Catalog of the ten reports |
| GET | `/reports/:key` | `reports.view` | Run a report: summary, optional chart, columns, paged rows |
| GET | `/reports/:key/export?format=csv\|xlsx\|pdf` | `reports.export` | File download; audited as `REPORT_EXPORTED` |

Common query filters: `dateFrom`, `dateTo`, `companyId`, `applicationId`, `page`, `pageSize` (max 100 for UI). Exports refuse more than **50,000** rows (`422 EXPORT_TOO_LARGE`). Company scope is always applied.

### The ten reports

1. `company-expenses` – amount and count by company  
2. `application-expenses` – amount and count by application  
3. `payment-vouchers` – posted vouchers (type, number, reference, verification)  
4. `posting-success` – jobs in `POSTED` with Tally MasterID  
5. `failed-transactions` – `FAILED` / dead-letter jobs  
6. `pending-queue` – open queue statuses  
7. `missing-ledgers` – mapped/configured ledgers absent from active masters  
8. `ledger-mappings` – category → Tally ledger mappings  
9. `monthly-expenses` – month buckets for trend charts  
10. `integration-audit` – integration-related audit actions  

### UI

- **Reports & Analytics** (`CURRENT_PHASE = 7`): catalog cards, filter bar, summary chips, Recharts panel, table, CSV / Excel / PDF buttons (export gated on `reports.export`).
- **Company → Reports** tab: same viewer locked to that company.

### Libraries

Backend: `exceljs` (xlsx), `pdfkit` (pdf). CSV is built in-process. Frontend charts use existing `recharts`.

## Verification

Against the live `tally_monitor` database:

- Catalog returns 10 reports.
- Each report runs with columns and meta.
- CSV / XLSX / PDF exports return the expected content types.
- Unauthenticated → 401; viewer without `reports.export` → 403 on export.
- Company filter is accepted and reflected in the response.
- Backend unit tests: 46 passing; frontend typecheck and production build succeed.

## Next

Phase 8 – Deployment: Dockerfiles, Cloud Build, Cloud Run, Cloud SQL, Secret Manager, Windows agent installer packaging.
