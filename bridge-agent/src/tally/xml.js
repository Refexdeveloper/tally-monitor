/**
 * TallyPrime XML request builders and response parsers.
 *
 * Exports use inline-TDL collections (TALLYREQUEST Export / TYPE Collection);
 * imports use the classic "Import Data" envelope with an explicit SVCURRENTCOMPANY,
 * so nothing ever lands in whichever company happens to be active on screen.
 */
import { XMLParser } from 'fast-xml-parser';
import { TallyError } from './client.js';

export const esc = (v) =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/** Values placed inside TDL formulae ("...") cannot contain a double quote. */
export function assertFormulaSafe(label, value) {
  if (/["\r\n]/.test(String(value))) throw new TallyError(`${label} contains characters Tally filters cannot match safely: ${value}`, { code: 'UNSAFE_FILTER_VALUE', requestSent: false });
}

export const toTallyDate = (iso) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new TallyError(`Invalid voucher date ${iso}`, { code: 'INVALID_DATE', requestSent: false });
  return iso.replace(/-/g, '');
};

const MONTHS = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
export function fromTallyDate(v) {
  const s = String(v ?? '').trim();
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/.exec(s);
  if (m && MONTHS[m[2].toLowerCase()]) {
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${year}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, '0')}`;
  }
  return s;
}

/** "500.00" -> "-500.00"; works on strings to avoid floating point. */
const negate = (amount) => (String(amount).startsWith('-') ? String(amount).slice(1) : `-${amount}`);
const isPositive = (v) => v !== null && v !== undefined && v !== '' && !/^-?0+(\.0+)?$/.test(String(v));

// --------------------------------------------------------------------------- requests

function collectionExport({ id, company, collection, formula, staticVars = {} }) {
  const vars = { SVEXPORTFORMAT: '$$SysName:XML', ...(company ? { SVCURRENTCOMPANY: company } : {}), ...staticVars };
  const varXml = Object.entries(vars)
    .map(([k, v]) => `<${k}>${k === 'SVEXPORTFORMAT' ? v : esc(v)}</${k}>`)
    .join('');
  return (
    `<ENVELOPE><HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>${id}</ID></HEADER>` +
    `<BODY><DESC><STATICVARIABLES>${varXml}</STATICVARIABLES><TDL><TDLMESSAGE>` +
    `<COLLECTION NAME="${id}" ISMODIFY="No">${collection}</COLLECTION>` +
    (formula ? `<SYSTEM TYPE="Formulae" NAME="${id}Filter">${formula}</SYSTEM>` : '') +
    `</TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`
  );
}

/** Companies currently loaded (open) in TallyPrime. */
export const companiesRequest = () => collectionExport({ id: 'TMCompanyList', collection: '<TYPE>Company</TYPE><FETCH>Name, GUID, StartingFrom, BooksFrom</FETCH>' });

export const ledgersRequest = (company) =>
  collectionExport({ id: 'TMLedgers', company, collection: '<TYPE>Ledger</TYPE><FETCH>Name, Parent, GUID, MasterId, AlterId</FETCH>' });

export function ledgerByNameRequest(company, name) {
  assertFormulaSafe('Ledger name', name);
  return collectionExport({
    id: 'TMLedgerByName',
    company,
    collection: '<TYPE>Ledger</TYPE><FETCH>Name, Parent, GUID, MasterId, AlterId</FETCH><FILTERS>TMLedgerByNameFilter</FILTERS>',
    formula: `$Name = "${esc(name)}"`,
  });
}

/** Vouchers with this reference on the given date (period variables bound to that day). */
export function voucherByReferenceRequest(company, reference, isoDate) {
  assertFormulaSafe('Reference', reference);
  const d = toTallyDate(isoDate);
  return collectionExport({
    id: 'TMVoucherByRef',
    company,
    staticVars: { SVFROMDATE: d, SVTODATE: d },
    collection:
      '<TYPE>Voucher</TYPE><FETCH>Date, VoucherTypeName, VoucherNumber, Reference, MasterId, AlterId, GUID, Narration, IsCancelled, AllLedgerEntries</FETCH>' +
      '<FILTERS>TMVoucherByRefFilter</FILTERS>',
    formula: `$Reference = "${esc(reference)}"`,
  });
}

function importEnvelope(reportName, company, body) {
  return (
    `<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC>` +
    `<REPORTNAME>${reportName}</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${esc(company)}</SVCURRENTCOMPANY></STATICVARIABLES>` +
    `</REQUESTDESC><REQUESTDATA><TALLYMESSAGE xmlns:UDF="TallyUDF">${body}</TALLYMESSAGE></REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`
  );
}

/**
 * Accounting voucher import. Tally sign convention: debit = negative amount with ISDEEMEDPOSITIVE Yes,
 * credit = positive amount with ISDEEMEDPOSITIVE No.
 */
export function voucherImportRequest(company, v, { costCategory = 'Primary Cost Category' } = {}) {
  if (!v?.entries?.length) throw new TallyError('Voucher has no ledger entries', { code: 'INVALID_VOUCHER', requestSent: false });
  const date = toTallyDate(v.voucherDate);
  const entries = v.entries
    .map((e) => {
      const debit = isPositive(e.debit);
      const credit = isPositive(e.credit);
      if (debit === credit) throw new TallyError(`Entry for ${e.ledger} must have exactly one of debit/credit`, { code: 'INVALID_VOUCHER', requestSent: false });
      const amount = debit ? negate(e.debit) : String(e.credit);
      const deemed = debit ? 'Yes' : 'No';
      const isParty = v.partyLedger && e.ledger.trim().toLowerCase() === String(v.partyLedger).trim().toLowerCase();
      let xml = `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${esc(e.ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${deemed}</ISDEEMEDPOSITIVE>`;
      if (isParty) xml += '<ISPARTYLEDGER>Yes</ISPARTYLEDGER>';
      xml += `<AMOUNT>${amount}</AMOUNT>`;
      if (e.costCentre) {
        xml +=
          `<CATEGORYALLOCATIONS.LIST><CATEGORY>${esc(costCategory)}</CATEGORY><ISDEEMEDPOSITIVE>${deemed}</ISDEEMEDPOSITIVE>` +
          `<COSTCENTREALLOCATIONS.LIST><NAME>${esc(e.costCentre)}</NAME><AMOUNT>${amount}</AMOUNT></COSTCENTREALLOCATIONS.LIST></CATEGORYALLOCATIONS.LIST>`;
      }
      if (e.billReference) {
        xml += `<BILLALLOCATIONS.LIST><NAME>${esc(e.billReference)}</NAME><BILLTYPE>New Ref</BILLTYPE><AMOUNT>${amount}</AMOUNT></BILLALLOCATIONS.LIST>`;
      }
      return `${xml}</ALLLEDGERENTRIES.LIST>`;
    })
    .join('');

  const voucher =
    `<VOUCHER VCHTYPE="${esc(v.voucherType)}" ACTION="Create" OBJVIEW="Accounting Voucher View">` +
    `<DATE>${date}</DATE><EFFECTIVEDATE>${date}</EFFECTIVEDATE><VOUCHERTYPENAME>${esc(v.voucherType)}</VOUCHERTYPENAME>` +
    (v.voucherNumber ? `<VOUCHERNUMBER>${esc(v.voucherNumber)}</VOUCHERNUMBER>` : '') +
    `<REFERENCE>${esc(v.reference)}</REFERENCE>` +
    (v.narration ? `<NARRATION>${esc(v.narration)}</NARRATION>` : '') +
    (v.partyLedger ? `<PARTYLEDGERNAME>${esc(v.partyLedger)}</PARTYLEDGERNAME>` : '') +
    `<PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW><ISINVOICE>No</ISINVOICE>${entries}</VOUCHER>`;
  return importEnvelope('Vouchers', company, voucher);
}

export function ledgerCreateRequest(company, { name, parent, billWise = false }) {
  if (!name || !parent) throw new TallyError('Ledger name and parent group are required', { code: 'INVALID_MASTER', requestSent: false });
  const body =
    `<LEDGER NAME="${esc(name)}" ACTION="Create"><NAME.LIST><NAME>${esc(name)}</NAME></NAME.LIST>` +
    `<PARENT>${esc(parent)}</PARENT><ISBILLWISEON>${billWise ? 'Yes' : 'No'}</ISBILLWISEON><AFFECTSSTOCK>No</AFFECTSSTOCK></LEDGER>`;
  return importEnvelope('All Masters', company, body);
}

// --------------------------------------------------------------------------- parsing

const ARRAY_TAGS = new Set(['COMPANY', 'LEDGER', 'VOUCHER', 'ALLLEDGERENTRIES.LIST', 'LEDGERENTRIES.LIST', 'LINEERROR', 'NAME']);
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => ARRAY_TAGS.has(name),
});

/** Tally sometimes emits control-character references (e.g. &#4;) that are not legal XML. */
const sanitize = (xml) => xml.replace(/&#(?:x0*(?:[0-8bcef]|1[0-9a-f])|0*(?:[0-8]|1[124-9]|2\d|3[01]));/gi, '');

export function parseXml(xml) {
  try {
    return parser.parse(sanitize(xml));
  } catch (err) {
    throw new TallyError(`Unreadable response from Tally: ${err.message}`, { code: 'TALLY_BAD_RESPONSE', body: xml });
  }
}

export const text = (v) => {
  if (v === undefined || v === null) return '';
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === 'object') return String(v['#text'] ?? '').trim();
  return String(v).trim();
};

/** Depth-first collection of every element with the given tag. */
export function findAll(node, tag, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const n of node) findAll(n, tag, out);
    return out;
  }
  for (const [k, v] of Object.entries(node)) {
    if (k === tag) (Array.isArray(v) ? v : [v]).forEach((x) => out.push(x));
    else if (typeof v === 'object') findAll(v, tag, out);
  }
  return out;
}

const first = (node, tag) => findAll(node, tag)[0];

/** Raises when an export answered with an error instead of data (e.g. unknown company). */
function assertExportOk(doc, body) {
  const errs = findAll(doc, 'LINEERROR').map(text).filter(Boolean);
  if (errs.length) throw new TallyError(errs.join('; '), { code: 'TALLY_EXPORT_ERROR', body });
  const status = text(first(doc, 'STATUS'));
  if (status === '0') throw new TallyError(text(first(doc, 'DATA')) || 'Tally reported STATUS 0 (request failed)', { code: 'TALLY_EXPORT_ERROR', body });
  if (doc.RESPONSE !== undefined && typeof doc.RESPONSE !== 'object') {
    throw new TallyError(String(doc.RESPONSE), { code: 'TALLY_EXPORT_ERROR', body });
  }
}

const objectName = (o) => text(o?.['@_NAME']) || text(first(o?.['NAME.LIST'], 'NAME')) || text(o?.NAME);
const num = (v) => {
  const s = text(v);
  return /^\d+$/.test(s) ? s : null;
};

export function parseCompanies(body) {
  const doc = parseXml(body);
  assertExportOk(doc, body);
  return [...new Set(findAll(doc, 'COMPANY').map(objectName).filter(Boolean))];
}

export function parseLedgers(body) {
  const doc = parseXml(body);
  assertExportOk(doc, body);
  return findAll(doc, 'LEDGER')
    .map((l) => ({ name: objectName(l), parent: text(l.PARENT) || null, guid: text(l.GUID) || null, masterId: num(l.MASTERID), alterId: num(l.ALTERID) }))
    .filter((l) => l.name);
}

/** Tally amount (e.g. "-500.00", " 1,250.50") -> { debit, credit } as positive decimal strings. */
export function splitAmount(raw) {
  const s = text(raw).replace(/[,\s]/g, '');
  const m = /^(-?)(\d+(?:\.\d+)?)$/.exec(s);
  if (!m) throw new TallyError(`Unrecognised amount "${text(raw)}" in Tally voucher`, { code: 'TALLY_BAD_AMOUNT' });
  const [int, frac = ''] = m[2].split('.');
  const value = `${int.replace(/^0+(?=\d)/, '')}.${(frac + '00').slice(0, 2)}`;
  return m[1] === '-' ? { debit: value, credit: null } : { debit: null, credit: value };
}

export function parseVouchers(body) {
  const doc = parseXml(body);
  assertExportOk(doc, body);
  return findAll(doc, 'VOUCHER').map((v) => {
    const all = Array.isArray(v['ALLLEDGERENTRIES.LIST']) ? v['ALLLEDGERENTRIES.LIST'] : [];
    const plain = Array.isArray(v['LEDGERENTRIES.LIST']) ? v['LEDGERENTRIES.LIST'] : [];
    const lines = all.length ? all : plain;
    return {
      reference: text(v.REFERENCE),
      voucherDate: fromTallyDate(text(v.DATE)),
      voucherType: text(v.VOUCHERTYPENAME) || text(v['@_VCHTYPE']),
      voucherNumber: text(v.VOUCHERNUMBER) || null,
      masterId: num(v.MASTERID),
      alterId: num(v.ALTERID),
      guid: text(v.GUID) || null,
      cancelled: text(v.ISCANCELLED).toLowerCase() === 'yes',
      entries: lines
        .map((e) => ({ ledger: text(e.LEDGERNAME), ...splitAmount(e.AMOUNT) }))
        .filter((e) => e.ledger),
    };
  });
}

/** Import result counters. Works for both the classic <RESPONSE> and the v1 <IMPORTRESULT> shapes. */
export function parseImportResponse(body) {
  const doc = parseXml(body);
  const n = (tag) => {
    const s = text(first(doc, tag));
    return /^\d+$/.test(s) ? Number(s) : 0;
  };
  const lineErrors = findAll(doc, 'LINEERROR').map(text).filter(Boolean);
  const rawResponse = typeof doc.RESPONSE === 'string' ? doc.RESPONSE.trim() : '';
  return {
    created: n('CREATED'),
    altered: n('ALTERED'),
    ignored: n('IGNORED'),
    combined: n('COMBINED'),
    errors: n('ERRORS') + (rawResponse && !lineErrors.length ? 1 : 0),
    exceptions: n('EXCEPTIONS'),
    lastVchId: text(first(doc, 'LASTVCHID')) || null,
    lineError: lineErrors.join('; ') || rawResponse || null,
  };
}
