import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as x from '../src/tally/xml.js';
import { decodeBody } from '../src/tally/client.js';

const voucher = {
  voucherType: 'Journal',
  voucherDate: '2026-10-31',
  voucherNumber: null,
  reference: 'KF-EXP-1',
  narration: 'Food & travel <test>',
  partyLedger: 'Employee Reimbursements Payable',
  entries: [
    { ledger: 'Food & Refreshment', debit: '500.00', credit: null, costCentre: 'Chennai' },
    { ledger: 'Travelling Expenses', debit: '100.00', credit: null },
    { ledger: 'Employee Reimbursements Payable', debit: null, credit: '600.00', billReference: 'KF-EXP-1' },
  ],
};

test('voucher import uses explicit company, Tally sign convention and escaping', () => {
  const xml = x.voucherImportRequest('Venwind & Co', voucher);
  assert.match(xml, /<SVCURRENTCOMPANY>Venwind &amp; Co<\/SVCURRENTCOMPANY>/);
  assert.match(xml, /<REPORTNAME>Vouchers<\/REPORTNAME>/);
  assert.match(xml, /<DATE>20261031<\/DATE>/);
  assert.match(xml, /<LEDGERNAME>Food &amp; Refreshment<\/LEDGERNAME><ISDEEMEDPOSITIVE>Yes<\/ISDEEMEDPOSITIVE><AMOUNT>-500.00<\/AMOUNT>/);
  assert.match(xml, /<LEDGERNAME>Employee Reimbursements Payable<\/LEDGERNAME><ISDEEMEDPOSITIVE>No<\/ISDEEMEDPOSITIVE><ISPARTYLEDGER>Yes<\/ISPARTYLEDGER><AMOUNT>600.00<\/AMOUNT>/);
  assert.match(xml, /<CATEGORY>Primary Cost Category<\/CATEGORY>.*<NAME>Chennai<\/NAME><AMOUNT>-500.00<\/AMOUNT>/);
  assert.match(xml, /<BILLALLOCATIONS.LIST><NAME>KF-EXP-1<\/NAME><BILLTYPE>New Ref<\/BILLTYPE><AMOUNT>600.00<\/AMOUNT>/);
  assert.match(xml, /<NARRATION>Food &amp; travel &lt;test&gt;<\/NARRATION>/);
  assert.doesNotMatch(xml, /<VOUCHERNUMBER>/);
});

test('voucher import rejects entries with both or neither side', () => {
  assert.throws(() => x.voucherImportRequest('C', { ...voucher, entries: [{ ledger: 'A', debit: '1.00', credit: '1.00' }] }), /exactly one/);
  assert.throws(() => x.voucherImportRequest('C', { ...voucher, entries: [{ ledger: 'A', debit: '0.00', credit: null }] }), /exactly one/);
  assert.throws(() => x.voucherImportRequest('C', { ...voucher, voucherDate: '31-10-2026' }), /Invalid voucher date/);
});

test('filters refuse values with double quotes', () => {
  assert.throws(() => x.voucherByReferenceRequest('C', 'A"B', '2026-10-31'), /cannot match safely/);
  assert.throws(() => x.ledgerByNameRequest('C', 'Bad "name"'), /cannot match safely/);
  const xml = x.voucherByReferenceRequest('C', 'KF-1', '2026-10-31');
  assert.match(xml, /<SVFROMDATE>20261031<\/SVFROMDATE><SVTODATE>20261031<\/SVTODATE>/);
  assert.match(xml, /\$Reference = "KF-1"/);
});

test('parses companies, ledgers and vouchers from Tally collection exports', () => {
  const companies = x.parseCompanies(
    '<ENVELOPE><HEADER><VERSION>1</VERSION><STATUS>1</STATUS></HEADER><BODY><DATA><COLLECTION><COMPANY NAME="Alpha Ltd" RESERVEDNAME=""><NAME TYPE="String">Alpha Ltd</NAME></COMPANY><COMPANY NAME="Beta &amp; Sons"></COMPANY></COLLECTION></DATA></BODY></ENVELOPE>',
  );
  assert.deepEqual(companies, ['Alpha Ltd', 'Beta & Sons']);

  const ledgers = x.parseLedgers(
    '<ENVELOPE><BODY><DATA><COLLECTION><LEDGER NAME="Cash" RESERVEDNAME=""><PARENT TYPE="String">Cash-in-Hand</PARENT><GUID TYPE="String">g1</GUID><MASTERID TYPE="Number"> 27</MASTERID><ALTERID TYPE="Number"> 3</ALTERID></LEDGER>' +
      '<LEDGER><NAME.LIST TYPE="String"><NAME>Travel</NAME><NAME>Trv</NAME></NAME.LIST><PARENT>Indirect Expenses</PARENT></LEDGER></COLLECTION></DATA></BODY></ENVELOPE>',
  );
  assert.deepEqual(ledgers[0], { name: 'Cash', parent: 'Cash-in-Hand', guid: 'g1', masterId: '27', alterId: '3' });
  assert.equal(ledgers[1].name, 'Travel');

  const [v] = x.parseVouchers(
    '<ENVELOPE><BODY><DATA><COLLECTION><VOUCHER VCHTYPE="Journal"><DATE TYPE="Date">20261031</DATE><VOUCHERTYPENAME>Journal</VOUCHERTYPENAME><VOUCHERNUMBER>12</VOUCHERNUMBER><REFERENCE>KF-1</REFERENCE><MASTERID> 99</MASTERID><GUID>gv</GUID>' +
      '<ALLLEDGERENTRIES.LIST><LEDGERNAME>Food</LEDGERNAME><AMOUNT>-1,500.5</AMOUNT></ALLLEDGERENTRIES.LIST><ALLLEDGERENTRIES.LIST><LEDGERNAME>Payable</LEDGERNAME><AMOUNT>1500.50</AMOUNT></ALLLEDGERENTRIES.LIST></VOUCHER></COLLECTION></DATA></BODY></ENVELOPE>',
  );
  assert.equal(v.voucherDate, '2026-10-31');
  assert.equal(v.masterId, '99');
  assert.deepEqual(v.entries, [
    { ledger: 'Food', debit: '1500.50', credit: null },
    { ledger: 'Payable', debit: null, credit: '1500.50' },
  ]);
});

test('export errors surface as TallyError', () => {
  assert.throws(() => x.parseLedgers("<ENVELOPE><HEADER><STATUS>0</STATUS></HEADER><BODY><DATA><LINEERROR>Could not set 'SVCurrentCompany' to 'X'</LINEERROR></DATA></BODY></ENVELOPE>"), /SVCurrentCompany/);
  assert.throws(() => x.parseCompanies('<RESPONSE>Unknown Request, cannot be processed</RESPONSE>'), /Unknown Request/);
});

test('import response counters (classic and v1) and line errors', () => {
  assert.deepEqual(
    x.parseImportResponse('<RESPONSE><CREATED>1</CREATED><ALTERED>0</ALTERED><LASTVCHID>55</LASTVCHID><ERRORS>0</ERRORS></RESPONSE>'),
    { created: 1, altered: 0, ignored: 0, combined: 0, errors: 0, exceptions: 0, lastVchId: '55', lineError: null },
  );
  const bad = x.parseImportResponse("<RESPONSE><LINEERROR>Ledger 'X' does not exist!</LINEERROR><CREATED>0</CREATED><ERRORS>1</ERRORS></RESPONSE>");
  assert.equal(bad.errors, 1);
  assert.equal(bad.lineError, "Ledger 'X' does not exist!");
  const v1 = x.parseImportResponse('<ENVELOPE><HEADER><STATUS>1</STATUS></HEADER><BODY><DATA><IMPORTRESULT><CREATED>1</CREATED><ERRORS>0</ERRORS></IMPORTRESULT></DATA></BODY></ENVELOPE>');
  assert.equal(v1.created, 1);
  assert.equal(x.parseImportResponse('<RESPONSE>Unknown Request</RESPONSE>').errors, 1);
});

test('decodes UTF-16 responses and strips illegal control references', () => {
  const xml = '<ENVELOPE><BODY><DATA><COLLECTION><COMPANY NAME="Ünïcode Co&#4;"/></COLLECTION></DATA></BODY></ENVELOPE>';
  const buf = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(xml, 'utf16le')]);
  assert.deepEqual(x.parseCompanies(decodeBody(buf)), ['Ünïcode Co']);
});

test('date helpers', () => {
  assert.equal(x.fromTallyDate('20260401'), '2026-04-01');
  assert.equal(x.fromTallyDate('1-Apr-2026'), '2026-04-01');
  assert.deepEqual(x.splitAmount('-0.5'), { debit: '0.50', credit: null });
});
