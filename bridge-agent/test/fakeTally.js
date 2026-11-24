/**
 * A small stand-in for TallyPrime's XML HTTP server, for tests and dry runs.
 * It understands exactly the requests this agent sends. It is NOT a substitute for
 * proving the integration against real TallyPrime with `npm run diagnose`.
 *
 *   node test/fakeTally.js --port 9000 --company "Demo Company"
 */
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { XMLParser } from 'fast-xml-parser';

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  trimValues: true,
  isArray: (n) => ['VOUCHER', 'LEDGER', 'ALLLEDGERENTRIES.LIST', 'BILLALLOCATIONS.LIST', 'CATEGORYALLOCATIONS.LIST', 'COSTCENTREALLOCATIONS.LIST'].includes(n),
});
const txt = (v) => (v && typeof v === 'object' ? String(v['#text'] ?? '') : String(v ?? '')).trim();
const eq = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
const cents = (s) => {
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(s).trim());
  if (!m) throw new Error(`bad amount ${s}`);
  const v = BigInt(m[2]) * 100n + BigInt((m[3] ?? '').padEnd(2, '0') || '0');
  return m[1] ? -v : v;
};

const DEFAULT_GROUPS = ['Current Liabilities', 'Current Assets', 'Indirect Expenses', 'Direct Expenses', 'Sundry Creditors', 'Sundry Debtors', 'Bank Accounts', 'Cash-in-Hand', 'Duties & Taxes', 'Loans & Advances (Asset)', 'Provisions'];

export function createFakeTally(initial = {}) {
  const state = {
    companies: new Map(),
    nextMasterId: 1000,
    behaviour: { dropNextImportResponse: false, failNextImport: null, encoding: 'utf8' },
    requests: [],
  };
  for (const [name, c] of Object.entries(initial.companies ?? {})) {
    state.companies.set(name, {
      name,
      groups: c.groups ?? DEFAULT_GROUPS,
      voucherTypes: c.voucherTypes ?? ['Journal', 'Payment', 'Purchase', 'Receipt', 'Contra'],
      ledgers: (c.ledgers ?? []).map((l) => ({ name: l.name, parent: l.parent, guid: `guid-l-${state.nextMasterId}`, masterId: state.nextMasterId++, alterId: 1 })),
      vouchers: [],
    });
  }

  const company = (name) => [...state.companies.values()].find((c) => eq(c.name, name));
  const envelope = (data) => `<ENVELOPE><HEADER><VERSION>1</VERSION><STATUS>1</STATUS></HEADER><BODY><DESC></DESC><DATA><COLLECTION>${data}</COLLECTION></DATA></BODY></ENVELOPE>`;
  const lineError = (msg) => `<ENVELOPE><HEADER><VERSION>1</VERSION><STATUS>0</STATUS></HEADER><BODY><DATA><LINEERROR>${esc(msg)}</LINEERROR></DATA></BODY></ENVELOPE>`;
  const importResponse = ({ created = 0, errors = 0, line = null, lastId = 0 }) =>
    `<RESPONSE>${line ? `<LINEERROR>${esc(line)}</LINEERROR>` : ''}<CREATED>${created}</CREATED><ALTERED>0</ALTERED><DELETED>0</DELETED><LASTVCHID>${lastId}</LASTVCHID><LASTMID>0</LASTMID><COMBINED>0</COMBINED><IGNORED>0</IGNORED><ERRORS>${errors}</ERRORS><CANCELLED>0</CANCELLED></RESPONSE>`;
  const formulaValue = (doc) => {
    const sys = doc.ENVELOPE?.BODY?.DESC?.TDL?.TDLMESSAGE?.SYSTEM;
    const m = /"\s*(.*?)\s*"/.exec(txt(sys));
    return m ? m[1] : null;
  };
  const ledgerXml = (l) =>
    `<LEDGER NAME="${esc(l.name)}" RESERVEDNAME=""><PARENT TYPE="String">${esc(l.parent)}</PARENT><GUID TYPE="String">${esc(l.guid)}</GUID><MASTERID TYPE="Number"> ${l.masterId}</MASTERID><ALTERID TYPE="Number"> ${l.alterId}</ALTERID></LEDGER>`;
  const voucherXml = (v) =>
    `<VOUCHER REMOTEID="${v.guid}" VCHTYPE="${esc(v.voucherType)}" ACTION="Create" OBJVIEW="Accounting Voucher View"><DATE TYPE="Date">${v.date}</DATE><GUID TYPE="String">${v.guid}</GUID>` +
    `<VOUCHERTYPENAME TYPE="String">${esc(v.voucherType)}</VOUCHERTYPENAME><VOUCHERNUMBER TYPE="String">${esc(v.voucherNumber)}</VOUCHERNUMBER><REFERENCE TYPE="String">${esc(v.reference)}</REFERENCE>` +
    `<ISCANCELLED TYPE="Logical">No</ISCANCELLED><MASTERID TYPE="Number"> ${v.masterId}</MASTERID><ALTERID TYPE="Number"> ${v.alterId}</ALTERID>` +
    v.entries.map((e) => `<ALLLEDGERENTRIES.LIST><LEDGERNAME TYPE="String">${esc(e.ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE TYPE="Logical">${e.amount.startsWith('-') ? 'Yes' : 'No'}</ISDEEMEDPOSITIVE><AMOUNT TYPE="Amount">${e.amount}</AMOUNT></ALLLEDGERENTRIES.LIST>`).join('') +
    '</VOUCHER>';

  function handle(xml) {
    const doc = parser.parse(xml);
    const header = doc.ENVELOPE?.HEADER ?? {};
    const request = txt(header.TALLYREQUEST);

    if (request === 'Export') {
      const id = txt(header.ID);
      const vars = doc.ENVELOPE?.BODY?.DESC?.STATICVARIABLES ?? {};
      state.requests.push({ type: 'export', id, company: txt(vars.SVCURRENTCOMPANY) });
      if (id === 'TMCompanyList') return envelope([...state.companies.values()].map((c) => `<COMPANY NAME="${esc(c.name)}" RESERVEDNAME=""><NAME TYPE="String">${esc(c.name)}</NAME></COMPANY>`).join(''));
      const c = company(txt(vars.SVCURRENTCOMPANY));
      if (!c) return lineError(`Could not set 'SVCurrentCompany' to '${txt(vars.SVCURRENTCOMPANY)}'`);
      if (id === 'TMLedgers') return envelope(c.ledgers.map(ledgerXml).join(''));
      if (id === 'TMLedgerByName') {
        const name = formulaValue(doc);
        return envelope(c.ledgers.filter((l) => eq(l.name, name)).map(ledgerXml).join(''));
      }
      if (id === 'TMVoucherByRef') {
        const ref = formulaValue(doc);
        const from = txt(vars.SVFROMDATE);
        const to = txt(vars.SVTODATE);
        return envelope(c.vouchers.filter((v) => eq(v.reference, ref) && v.date >= from && v.date <= to).map(voucherXml).join(''));
      }
      return lineError(`Unknown collection ${id}`);
    }

    if (request === 'Import Data') {
      const desc = doc.ENVELOPE.BODY.IMPORTDATA.REQUESTDESC;
      const report = txt(desc.REPORTNAME);
      const c = company(txt(desc.STATICVARIABLES?.SVCURRENTCOMPANY));
      const msg = doc.ENVELOPE.BODY.IMPORTDATA.REQUESTDATA.TALLYMESSAGE;
      state.requests.push({ type: 'import', report, company: c?.name });
      if (!c) return importResponse({ errors: 1, line: `Could not set 'SVCurrentCompany' to '${txt(desc.STATICVARIABLES?.SVCURRENTCOMPANY)}'` });

      if (report === 'Vouchers') {
        const v = msg.VOUCHER[0];
        const type = txt(v.VOUCHERTYPENAME);
        if (!c.voucherTypes.some((t) => eq(t, type))) return importResponse({ errors: 1, line: `Voucher Type '${type}' does not exist!` });
        const entries = (v['ALLLEDGERENTRIES.LIST'] ?? []).map((e) => ({ ledger: txt(e.LEDGERNAME), amount: txt(e.AMOUNT) }));
        const missing = entries.find((e) => !c.ledgers.some((l) => eq(l.name, e.ledger)));
        if (missing) return importResponse({ errors: 1, line: `Ledger '${missing.ledger}' does not exist!` });
        if (entries.reduce((s, e) => s + cents(e.amount), 0n) !== 0n) return importResponse({ errors: 1, line: 'Voucher totals do not match!' });
        const masterId = state.nextMasterId++;
        const sameType = c.vouchers.filter((x) => eq(x.voucherType, type)).length;
        c.vouchers.push({
          masterId,
          alterId: 1,
          guid: `guid-v-${masterId}`,
          date: txt(v.DATE),
          voucherType: type,
          voucherNumber: txt(v.VOUCHERNUMBER) || String(sameType + 1),
          reference: txt(v.REFERENCE),
          narration: txt(v.NARRATION),
          entries: entries.map((e) => ({ ledger: c.ledgers.find((l) => eq(l.name, e.ledger)).name, amount: e.amount })),
          raw: xml,
        });
        return importResponse({ created: 1, lastId: masterId });
      }
      if (report === 'All Masters') {
        const l = msg.LEDGER[0];
        const name = txt(l['@_NAME']);
        const parent = txt(l.PARENT);
        if (c.ledgers.some((x) => eq(x.name, name))) return importResponse({ errors: 1, line: `Ledger '${name}' already exists` });
        if (!c.groups.some((g) => eq(g, parent))) return importResponse({ errors: 1, line: `Group '${parent}' does not exist!` });
        const masterId = state.nextMasterId++;
        c.ledgers.push({ name, parent, guid: `guid-l-${masterId}`, masterId, alterId: 1 });
        return importResponse({ created: 1 });
      }
    }
    return '<RESPONSE>Unknown Request, cannot be processed</RESPONSE>';
  }

  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const xml = Buffer.concat(chunks).toString('utf8');
      const isImport = xml.includes('<TALLYREQUEST>Import Data</TALLYREQUEST>');
      if (isImport && state.behaviour.failNextImport === 'reset') {
        state.behaviour.failNextImport = null;
        req.socket.destroy();
        return;
      }
      let out;
      try {
        out = handle(xml);
      } catch (err) {
        out = `<RESPONSE>${esc(err.message)}</RESPONSE>`;
      }
      if (isImport && state.behaviour.dropNextImportResponse) {
        // Processed, but the answer never reaches the agent: the classic ambiguous case.
        state.behaviour.dropNextImportResponse = false;
        req.socket.destroy();
        return;
      }
      const body = state.behaviour.encoding === 'utf16' ? Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(out, 'utf16le')]) : Buffer.from(out, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/xml', 'Content-Length': body.length });
      res.end(body);
    });
  });

  return {
    state,
    company,
    listen: (port = 0, host = '127.0.0.1') => new Promise((resolve) => server.listen(port, host, () => resolve(server.address().port))),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const arg = (k, d) => {
    const i = process.argv.indexOf(`--${k}`);
    return i > 0 ? process.argv[i + 1] : d;
  };
  const name = arg('company', 'Demo Company');
  const fake = createFakeTally({
    companies: {
      [name]: {
        ledgers: [
          { name: 'Cash', parent: 'Cash-in-Hand' },
          { name: 'Travelling Expenses', parent: 'Indirect Expenses' },
          { name: 'Food & Refreshment', parent: 'Indirect Expenses' },
          { name: 'Employee Reimbursements Payable', parent: 'Current Liabilities' },
        ],
      },
    },
  });
  const port = await fake.listen(Number(arg('port', 9000)), arg('host', '127.0.0.1'));
  console.log(`Fake TallyPrime listening on 127.0.0.1:${port} with company "${name}" (Ctrl+C to stop)`);
}
