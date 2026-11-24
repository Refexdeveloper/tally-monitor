# Tally Monitor Bridge Agent

A small Windows program that sits next to TallyPrime on your internal network. It connects **out** to Tally Monitor over HTTPS and talks to TallyPrime on `localhost:9000` (or a LAN address). Nothing connects in to it, and port 9000 is never exposed to the internet.

What it does:

| Job | When | Writes to Tally? |
|---|---|---|
| Health + company discovery (which companies are open in TallyPrime) | every 30 s | No |
| Ledger sync (all ledgers of each assigned, open company) | every 30 min | No |
| Post Finance-approved vouchers | when `POSTING_ENABLED=true` | Yes |
| Create Finance-approved ledgers | when `MASTER_CREATION_ENABLED=true` | Yes |

Safety rules built in:

- It only posts jobs Tally Monitor hands out, and those are always Finance-approved (approval is bound to the exact voucher).
- Every request names the company explicitly (`SVCURRENTCOMPANY`), so whichever company is on screen in Tally does not matter.
- Before importing, it checks that the company is open and that no voucher with the same reference already exists. If one exists, it reports that voucher instead of posting twice.
- A voucher counts as posted only after the agent reads it back by reference and Tally Monitor matches date, type, ledgers and amounts. If the outcome is uncertain (timeout, dropped connection, duplicates), the job goes to **reconciliation** and is never retried blindly.
- Results are saved to `state\outbox.json` before they are sent. A crash or network loss right after posting can't lose the fact that Tally was updated.
- `ALLOWED_COMPANIES` limits which companies it may write to, which is useful for the first tests.
- Secrets never appear in logs. `.env` is locked down by the installer.

---

## 1. Requirements on the Tally machine

- Windows 10/11 or Windows Server 2016+.
- **Node.js 20 LTS or newer (x64)** from https://nodejs.org. Check with `node -v` in a new PowerShell window.
- TallyPrime 7.1 running, with the company you will test open.
- Outbound access from this machine to the Tally Monitor URL. No inbound rules are needed.

## 2. Enable TallyPrime's XML server

In TallyPrime: **F1 (Help) → Settings → Connectivity → Client/Server configuration**

- *TallyPrime is acting as*: **Both** (or Server)
- *Port*: **9000**

Save and restart TallyPrime. Check by opening `http://localhost:9000` in a browser on the Tally machine. It should say *TallyPrime Server is Running*.

> Keep TallyPrime logged in with the companies open. The agent can only work with companies that are loaded.

## 3. Set things up in Tally Monitor (web app)

1. **Tally Connections → Bridge Agents → Register agent.** Copy the **agent key** and **secret**. The secret is shown only once.
2. **Tally Connections → Add connection.**
   - Host: the Tally machine's IP. If the agent runs on the Tally machine itself, use `127.0.0.1`, or keep the LAN IP and set `TALLY_HOST_OVERRIDE=127.0.0.1` in `.env`.
   - Port `9000`; Bridge agent: the agent you registered.
3. **Companies → (company) → Tally configuration.** Choose this server and enter the **exact** company name as TallyPrime shows it.
4. For the first test, use a **test company** in Tally (a copy, or a new company with a few ledgers).

## 4. Copy and install the agent

Copy this whole `bridge-agent` folder to the Tally machine, for example `C:\TallyMonitor\bridge-agent`. Then in PowerShell:

```powershell
cd C:\TallyMonitor\bridge-agent
npm install --omit=dev          # needs internet once; or copy node_modules along with the folder
copy .env.example .env
notepad .env
```

Fill in `.env`:

```ini
TM_API_URL=https://your-tally-monitor-url      # see "LAN test" below if the API runs on a PC
TM_AGENT_KEY=agt_...
TM_AGENT_SECRET=...
POSTING_ENABLED=false                          # keep OFF for the first run
MASTER_CREATION_ENABLED=false
ALLOWED_COMPANIES=Your Test Company Name       # exact Tally name(s), comma separated
```

### LAN test (API running on a developer PC)

Until Phase 8 deploys Tally Monitor to the cloud, the API can run on a PC on the same network:

- On the **PC running the API**, allow port 4000 inbound (admin PowerShell):
  `New-NetFirewallRule -DisplayName "Tally Monitor dev API" -Direction Inbound -LocalPort 4000 -Protocol TCP -Action Allow -Profile Private`
- In the agent's `.env`: `TM_API_URL=http://<PC-IP>:4000` and `ALLOW_INSECURE_HTTP=true`. Plain HTTP is for a LAN test only. Production must use HTTPS.
- Check from the Tally machine: `curl.exe http://<PC-IP>:4000/api/v1/health` should return JSON.

## 5. Read-only checks (safe, nothing is written)

```powershell
node src\cli.js companies                                   # companies open in TallyPrime
node src\cli.js ledgers --company "Your Test Company Name"  # ledgers Tally returns
npm run diagnose                                            # full check: config, API, Tally, every assigned company
```

`diagnose` prints `[ OK ]` or `[FAIL]` for each check and ends with **All checks passed** when ready. Use `--host` and `--port` with `companies`/`ledgers` to point at another Tally.

## 6. First run, posting OFF

```powershell
.\run.cmd          # runs in this window; Ctrl+C to stop
```

In Tally Monitor you should see:

- **Tally Connections:** the server is **ONLINE**, and each mapped company has a green tick (open in TallyPrime) or an orange warning (name mismatch or not open).
- **Ledgers** (for that company): source **Tally sync** with Tally GUID/MasterID. Ledgers that exist only in Tally Monitor become inactive, and ledgers created in Tally appear.
- **Company → Tally tab:** "Open in TallyPrime: Yes" and "Ledgers synced from Tally".

## 7. First posting test

1. Stop the agent (Ctrl+C) and set `POSTING_ENABLED=true` (keep `ALLOWED_COMPANIES` on the test company). Start `run.cmd` again.
2. In Tally Monitor, bring in a small expense for the test company, using Kissflow or **Applications → (app) → Manual import**. It validates automatically and then waits for approval.
3. A **different** user with the Finance Approver role approves it in **Processing Queue**.
4. Within about 10 seconds the agent logs `Voucher verified in Tally` and the job turns **POSTED**, with the Tally voucher number and MasterID.
5. Check TallyPrime's **Day Book** for that date. To check from the command line:
   `node src\cli.js find-voucher --company "Your Test Company Name" --reference "<voucher reference>" --date 2026-10-31`

## 8. Ledger creation test (optional)

Set `MASTER_CREATION_ENABLED=true`. When an expense needs a ledger that doesn't exist, Tally Monitor raises a **master request**. After a Finance approver approves it (Ledgers → Master requests), the agent:

1. checks whether the ledger already exists;
2. creates it under the approved group;
3. reads it back and marks it **Verified**.

Blocked expenses then continue automatically. If Tally refuses (for example, the group doesn't exist), the request shows **Failed** with Tally's message. Fix the cause, then use **Retry creation**.

## 9. Install as a Windows service

Download NSSM (https://nssm.cc/download) and copy `win64\nssm.exe` to `bridge-agent\tools\nssm.exe`. Then, in an **Administrator** PowerShell:

```powershell
cd C:\TallyMonitor\bridge-agent
powershell -ExecutionPolicy Bypass -File .\scripts\install-service.ps1
# recommended: a dedicated local account
# powershell -ExecutionPolicy Bypass -File .\scripts\install-service.ps1 -ServiceAccount ".\tallybridge" -ServicePassword "..."
```

The script:

- runs `diagnose`;
- installs the **TallyMonitorBridge** service (delayed auto-start, restart on failure, graceful stop);
- restricts `.env` to SYSTEM, Administrators and the service account;
- starts the service.

To remove it: `.\scripts\uninstall-service.ps1`.

To update the agent: stop the service, replace the `src` folder (and `package.json`), run `npm install --omit=dev`, then start the service. Keep `.env` and `state\`.

## Files

| Path | What |
|---|---|
| `.env` | Configuration and secret (never share it) |
| `logs\agent-YYYY-MM-DD.log` | JSON log lines, kept `LOG_RETENTION_DAYS` days |
| `state\outbox.json` | Results not yet confirmed by Tally Monitor. Do not delete while non-empty |
| `state\rejected-results.jsonl` | Results Tally Monitor refused (e.g. the job had already been recovered). Reconcile these jobs in the web app |

## Troubleshooting

| Symptom / code | Meaning | What to do |
|---|---|---|
| `TALLY_UNREACHABLE`, server OFFLINE | Nothing listening on host:port | TallyPrime running? Connectivity set to Server/Both, port 9000? Correct host (or `TALLY_HOST_OVERRIDE=127.0.0.1`)? |
| `COMPANY_NOT_LOADED`, orange chip | The exact company name is not open in TallyPrime | Open the company, or fix the Tally company name in Tally Monitor (compare with `node src\cli.js companies`) |
| `Could not set 'SVCurrentCompany'` | Same as above | Same as above |
| `AGENT_AUTH_INVALID` / `AGENT_REVOKED` | Wrong key or secret, or the agent was revoked | Re-copy the key, or rotate the secret in Tally Connections |
| Job **FAILED**: `Ledger 'X' does not exist!` | Tally refused the voucher | Create or map the ledger. The next ledger sync updates Tally Monitor; then Retry |
| `Voucher Type 'X' does not exist!` | Voucher configuration names a type that isn't in that company | Fix the voucher configuration's Tally voucher type |
| Dates refused, or only the 1st/2nd/31st work | TallyPrime in **Educational mode** only accepts those days | Use a licensed Tally, or test with those dates |
| Job **RECONCILIATION_REQUIRED** | The agent could not prove whether Tally saved the voucher | Search the Day Book for the reference. Then in the job, use **Reconcile**: *Found* (enter the voucher no.) or *Not found* (safe retry) |
| `DUPLICATE_REFERENCE_IN_TALLY` | More than one voucher already has this reference | Delete or cancel the extra voucher in Tally, then reconcile |

When something doesn't match, please send:

- the output of `npm run diagnose`;
- the relevant lines from `logs\agent-*.log`;
- the **Tally responses** section from the job detail page.

None of these contain the secret.

## About the Tally XML format

The agent uses TallyPrime's long-standing XML interface:

- inline-TDL collection exports to read companies, ledgers and vouchers;
- the classic *Import Data* envelope for vouchers and ledgers.

It was tested end to end against a simulator of that interface, including:

- posting;
- lost responses and dropped connections;
- rejections;
- duplicate references;
- UTF-16 responses;
- ledger creation.

The first run against your TallyPrime 7.1 is the real proof. `diagnose`, `ledgers` and `find-voucher` show exactly what your Tally returns, so start with them and send the output if anything looks wrong.

## Development

```powershell
npm test                                             # unit tests (XML, posting decisions, masters) against the fake Tally
node test\fakeTally.js --port 9000 --company "Demo Company"   # a local TallyPrime stand-in for dry runs
```
