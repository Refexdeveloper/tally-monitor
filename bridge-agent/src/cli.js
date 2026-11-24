#!/usr/bin/env node
/**
 * Read-only diagnostics. Nothing here writes to Tally or changes data in Tally Monitor
 * (diagnose only registers/authenticates, which updates the agent's "last seen").
 *
 *   node src/cli.js diagnose
 *   node src/cli.js companies   [--host 127.0.0.1] [--port 9000]
 *   node src/cli.js ledgers      --company "Name" [--host] [--port] [--json]
 *   node src/cli.js find-voucher --company "Name" --reference "EXP-1" --date 2026-10-31
 *   node src/cli.js preview-xml  --file voucher.json --company "Name"
 */
import fs from 'node:fs';
import { loadConfig, describeConfig, isCompanyAllowed, VERSION } from './config.js';
import { createApi } from './api.js';
import { createTally, sameName, serverTarget } from './tally/index.js';
import { voucherImportRequest } from './tally/xml.js';

const [, , command, ...rest] = process.argv;
const args = {};
for (let i = 0; i < rest.length; i += 1) {
  if (!rest[i].startsWith('--')) continue;
  const key = rest[i].slice(2);
  const next = rest[i + 1];
  args[key] = next && !next.startsWith('--') ? (i++, next) : true;
}

const OK = '[ OK ]';
const BAD = '[FAIL]';
const WARN = '[WARN]';
const silentLog = { info() {}, warn() {}, error() {}, debug() {} };

function localServer(cfg) {
  return { host: args.host ?? cfg.tallyHostOverride ?? '127.0.0.1', port: Number(args.port ?? 9000), protocol: 'http' };
}

function need(...names) {
  const missing = names.filter((n) => !args[n] || args[n] === true);
  if (missing.length) {
    console.error(`Missing: ${missing.map((m) => `--${m}`).join(' ')}`);
    process.exit(2);
  }
}

async function diagnose() {
  let failures = 0;
  const fail = (msg) => {
    failures += 1;
    console.log(`${BAD} ${msg}`);
  };
  console.log(`Tally Monitor Bridge Agent ${VERSION} - diagnostics\n`);

  let cfg;
  try {
    cfg = loadConfig();
    console.log(`${OK} Configuration loaded`);
  } catch (err) {
    console.log(`${BAD} ${err.message}`);
    process.exit(1);
  }
  const shown = describeConfig(cfg);
  console.log(`       API: ${shown.apiUrl}   key: ${shown.agentKey}   secret: ${shown.agentSecret}`);
  console.log(`       POSTING_ENABLED=${cfg.postingEnabled}  MASTER_CREATION_ENABLED=${cfg.masterCreationEnabled}  LEDGER_SYNC_ENABLED=${cfg.ledgerSyncEnabled}`);
  console.log(`       ALLOWED_COMPANIES=${cfg.allowedCompanies.length ? cfg.allowedCompanies.join(' | ') : '(all assigned companies)'}\n`);

  const api = createApi(cfg, silentLog);
  const tally = createTally(cfg);
  let reg;
  try {
    reg = await api.register({ agentVersion: VERSION });
    console.log(`${OK} Connected to Tally Monitor as agent "${reg.agent.name}"`);
  } catch (err) {
    fail(`Tally Monitor API: ${err.message} (${err.code})`);
    console.log('\nFix the API connection first (TM_API_URL, TM_AGENT_KEY, TM_AGENT_SECRET, firewall/proxy for outbound HTTPS).');
    process.exit(1);
  }
  if (!reg.servers.length) fail('No Tally server is assigned to this agent in Tally Monitor (Tally Connections > edit server > Bridge agent)');
  if (!reg.companies.length) fail('No company is linked to those Tally servers');

  for (const s of reg.servers) {
    const target = serverTarget(cfg, s);
    console.log(`\nTally server "${s.name}" -> ${target.host}:${target.port}${cfg.tallyHostOverride ? ' (TALLY_HOST_OVERRIDE)' : ''}`);
    let loaded;
    try {
      const t0 = Date.now();
      loaded = await tally.listCompanies(target);
      console.log(`${OK} TallyPrime responded in ${Date.now() - t0} ms; ${loaded.length} compan${loaded.length === 1 ? 'y' : 'ies'} loaded`);
      loaded.forEach((n) => console.log(`         - ${n}`));
    } catch (err) {
      fail(`TallyPrime not reachable: ${err.message}`);
      console.log('       Check: TallyPrime is running, F1 Help > Settings > Connectivity: "TallyPrime acts as" = Server/Both, port matches, Windows firewall allows this machine.');
      continue;
    }
    for (const c of reg.companies.filter((x) => x.serverId === s.id)) {
      const isLoaded = loaded.some((n) => sameName(n, c.tallyCompanyName));
      const allowed = isCompanyAllowed(cfg, c.tallyCompanyName);
      if (!isLoaded) {
        fail(`Company "${c.tallyCompanyName}" (${c.code}) is NOT loaded in TallyPrime - open it, or fix the Tally company name in Tally Monitor`);
        continue;
      }
      try {
        const ledgers = await tally.listLedgers(target, c.tallyCompanyName);
        console.log(`${OK} "${c.tallyCompanyName}" (${c.code}) loaded; ${ledgers.length} ledgers readable${allowed ? '' : '  [not in ALLOWED_COMPANIES: no posting]'}`);
      } catch (err) {
        fail(`"${c.tallyCompanyName}": ledger export failed: ${err.message}`);
      }
    }
  }
  console.log(failures ? `\n${failures} problem(s) found.` : `\nAll checks passed.${cfg.postingEnabled ? '' : ' Posting is OFF; set POSTING_ENABLED=true when ready.'}`);
  process.exit(failures ? 1 : 0);
}

async function main() {
  const cfg = loadConfig({ requireApi: false });
  const tally = createTally(cfg);
  switch (command) {
    case 'diagnose':
      return diagnose();
    case 'companies': {
      const list = await tally.listCompanies(localServer(cfg), { timeoutMs: cfg.tallyTimeoutMs });
      console.log(list.length ? list.join('\n') : '(no company loaded)');
      return;
    }
    case 'ledgers': {
      need('company');
      const list = await tally.listLedgers(localServer(cfg), args.company);
      if (args.json) console.log(JSON.stringify(list, null, 2));
      else {
        list.forEach((l) => console.log(`${l.name.padEnd(50)} ${l.parent ?? ''}`));
        console.log(`\n${list.length} ledgers`);
      }
      return;
    }
    case 'find-voucher': {
      need('company', 'reference', 'date');
      console.log(JSON.stringify(await tally.findVouchers(localServer(cfg), args.company, args.reference, args.date), null, 2));
      return;
    }
    case 'preview-xml': {
      need('file', 'company');
      const raw = JSON.parse(fs.readFileSync(args.file, 'utf8'));
      console.log(voucherImportRequest(args.company, raw.voucher ?? raw, { costCategory: cfg.costCategory }));
      return;
    }
    default:
      console.log('Commands: diagnose | companies | ledgers --company X | find-voucher --company X --reference R --date YYYY-MM-DD | preview-xml --file F --company X');
      console.log('Options: --host 127.0.0.1 --port 9000');
      process.exit(command ? 2 : 0);
  }
}

main().catch((err) => {
  console.error(`${BAD} ${err.message}`);
  process.exit(1);
});
