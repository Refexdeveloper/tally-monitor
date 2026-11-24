import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeTally } from './fakeTally.js';
import { createTally } from '../src/tally/index.js';
import { postVoucher } from '../src/jobs/postVoucher.js';
import { createMaster } from '../src/jobs/masters.js';
import { ApiError } from '../src/api.js';

const COMPANY = 'Test Co & Sons';
let fake;
let port;
let ctx;
let calls;

const cfg = (over = {}) => ({ allowedCompanies: [], tallyHostOverride: null, tallyTimeoutMs: 5000, tallyHealthTimeoutMs: 2000, costCategory: 'Primary Cost Category', ...over });
const log = { info() {}, warn() {}, error() {}, debug() {} };

function job(over = {}) {
  return {
    jobId: 'job-1',
    attemptId: 'att-1',
    attemptNo: 1,
    company: { id: 'c1', tallyCompanyName: COMPANY },
    server: { id: 's1', host: '127.0.0.1', port, protocol: 'http' },
    voucher: {
      kind: 'EMPLOYEE_REIMBURSEMENT',
      voucherType: 'Journal',
      voucherDate: '2026-10-31',
      voucherNumber: null,
      reference: 'KF-EXP-1',
      narration: 'Test',
      partyLedger: 'Payable',
      entries: [
        { ledger: 'Food', debit: '500.00', credit: null },
        { ledger: 'Payable', debit: null, credit: '500.00' },
      ],
      ...over,
    },
  };
}

beforeEach(async () => {
  fake = createFakeTally({ companies: { [COMPANY]: { ledgers: [{ name: 'Food', parent: 'Indirect Expenses' }, { name: 'Payable', parent: 'Current Liabilities' }] } } });
  port = await fake.listen(0);
  calls = [];
  const c = cfg();
  ctx = {
    cfg: c,
    log,
    tally: createTally(c),
    api: { submitting: async (id) => calls.push(['submitting', id]) },
    outbox: {
      add: async (item) => {
        calls.push(['result', item.body]);
        return item.body.outcome;
      },
    },
  };
});
afterEach(() => fake.close());

const result = () => calls.find((c) => c[0] === 'result')[1];
const submitted = () => calls.some((c) => c[0] === 'submitting');

test('posts, then reports POSTED with a read-back that matches Tally', async () => {
  assert.equal(await postVoucher(job(), ctx), 'POSTED');
  assert.ok(submitted());
  const r = result();
  assert.equal(r.readback.reference, 'KF-EXP-1');
  assert.equal(r.readback.voucherDate, '2026-10-31');
  assert.deepEqual(r.readback.entries, [
    { ledger: 'Food', debit: '500.00', credit: null },
    { ledger: 'Payable', debit: null, credit: '500.00' },
  ]);
  assert.equal(r.tally.created, 1);
  assert.match(r.tally.requestHash, /^[a-f0-9]{64}$/);
  assert.equal(fake.company(COMPANY).vouchers.length, 1);
});

test('never imports twice: an existing voucher with the reference is reported, not re-posted', async () => {
  await postVoucher(job(), ctx);
  calls = [];
  assert.equal(await postVoucher(job(), ctx), 'POSTED');
  assert.equal(result().errorCode, 'ALREADY_IN_TALLY');
  assert.equal(fake.company(COMPANY).vouchers.length, 1);
});

test('Tally rejection with voucher absent => REJECTED with the line error', async () => {
  assert.equal(await postVoucher(job({ entries: [{ ledger: 'Missing Ledger', debit: '5.00', credit: null }, { ledger: 'Payable', debit: null, credit: '5.00' }] }), ctx), 'REJECTED');
  assert.match(result().errorMessage, /Missing Ledger' does not exist/);
  assert.ok(submitted());
});

test('company not loaded => NOT_SUBMITTED without declaring submission', async () => {
  assert.equal(await postVoucher({ ...job(), company: { id: 'c1', tallyCompanyName: 'Other Co' } }, ctx), 'NOT_SUBMITTED');
  assert.equal(result().errorCode, 'COMPANY_NOT_LOADED');
  assert.ok(!submitted());
});

test('company outside ALLOWED_COMPANIES => NOT_SUBMITTED, nothing sent to Tally', async () => {
  ctx.cfg = cfg({ allowedCompanies: ['Sandbox'] });
  assert.equal(await postVoucher(job(), ctx), 'NOT_SUBMITTED');
  assert.equal(result().errorCode, 'COMPANY_NOT_ALLOWED');
  assert.equal(fake.state.requests.length, 0);
});

test('Tally unreachable => NOT_SUBMITTED (safe retry)', async () => {
  await fake.close();
  assert.equal(await postVoucher(job(), ctx), 'NOT_SUBMITTED');
  assert.ok(!submitted());
});

test('response lost after Tally processed the import => read-back proves POSTED', async () => {
  fake.state.behaviour.dropNextImportResponse = true;
  assert.equal(await postVoucher(job(), ctx), 'POSTED');
  assert.equal(result().errorCode, 'POSTED_AFTER_ERROR');
  assert.equal(fake.company(COMPANY).vouchers.length, 1);
});

test('connection dropped and voucher not found => AMBIGUOUS (reconciliation, no blind retry)', async () => {
  fake.state.behaviour.failNextImport = 'reset';
  assert.equal(await postVoucher(job(), ctx), 'AMBIGUOUS');
  assert.equal(fake.company(COMPANY).vouchers.length, 0);
});

test('two vouchers already carrying the reference => AMBIGUOUS before any import', async () => {
  await postVoucher(job(), ctx);
  fake.company(COMPANY).vouchers.push({ ...fake.company(COMPANY).vouchers[0], masterId: 7777 });
  calls = [];
  assert.equal(await postVoucher(job(), ctx), 'AMBIGUOUS');
  assert.equal(result().errorCode, 'DUPLICATE_REFERENCE_IN_TALLY');
  assert.ok(!submitted());
});

test('submitting refused by server => no import', async () => {
  ctx.api.submitting = async () => {
    throw new ApiError('lock lost', { status: 404, code: 'NOT_FOUND' });
  };
  assert.equal(await postVoucher(job(), ctx), 'NOT_SUBMITTED');
  assert.equal(fake.company(COMPANY).vouchers.length, 0);
});

test('UTF-16 Tally responses are handled', async () => {
  fake.state.behaviour.encoding = 'utf16';
  assert.equal(await postVoucher(job(), ctx), 'POSTED');
});

test('master creation: creates, detects existing, reports failures', async () => {
  const assignment = { servers: [{ id: 's1', host: '127.0.0.1', port, protocol: 'http' }], companies: [{ id: 'c1', tallyCompanyName: COMPANY, serverId: 's1' }] };
  const mctx = { ...ctx, assignment };
  const req = { id: 'm1', companyId: 'c1', tallyCompanyName: COMPANY, masterType: 'LEDGER', name: 'Courier Charges', parent: 'Indirect Expenses', billWise: false };
  assert.equal(await createMaster(req, mctx), 'CREATED');
  assert.equal(result().readback.parent, 'Indirect Expenses');
  calls = [];
  assert.equal(await createMaster(req, mctx), 'EXISTS');
  calls = [];
  assert.equal(await createMaster({ ...req, name: 'Other', parent: 'No Such Group' }, mctx), 'FAILED');
  assert.match(result().error, /Group 'No Such Group' does not exist/);
});
