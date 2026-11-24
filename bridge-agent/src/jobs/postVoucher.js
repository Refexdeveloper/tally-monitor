/**
 * Posts one approved voucher into TallyPrime.
 *
 * Safety rules:
 *  - Every check that can fail happens BEFORE /submitting; failures there are NOT_SUBMITTED (safe to retry).
 *  - Once /submitting is declared, the only proof of posting is a read-back by reference.
 *  - A rejection is reported only when Tally returned errors AND the voucher is confirmed absent.
 *  - Anything uncertain (timeouts, lost connections, duplicates, unreadable answers) is AMBIGUOUS,
 *    which sends the job to reconciliation instead of a blind retry.
 */
import { isCompanyAllowed } from '../config.js';
import { ApiError } from '../api.js';
import { TallyError } from '../tally/client.js';
import { sameName, serverTarget } from '../tally/index.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clip = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Read-back with a short retry: Tally can lag a moment behind its own import response. */
async function readBack(tally, server, company, v, tries = 3) {
  let last;
  for (let i = 0; i < tries; i += 1) {
    try {
      const found = await tally.findVouchers(server, company, v.reference, v.voucherDate);
      if (found.length || i === tries - 1) return { found };
    } catch (err) {
      last = err;
    }
    await sleep(1500);
  }
  return { error: last };
}

const asReadback = (r) => ({
  reference: r.reference,
  voucherDate: r.voucherDate,
  voucherType: r.voucherType,
  voucherNumber: r.voucherNumber,
  masterId: r.masterId,
  alterId: r.alterId,
  guid: r.guid,
  entries: r.entries,
});

export async function postVoucher(job, { cfg, api, tally, outbox, log }) {
  const company = job.company.tallyCompanyName;
  const v = job.voucher;
  const server = serverTarget(cfg, job.server);
  const tag = { jobId: job.jobId, attempt: job.attemptNo, company, reference: v.reference };
  const report = (outcome, extra = {}) => outbox.add({ kind: 'job', id: job.jobId, body: { attemptId: job.attemptId, outcome, ...extra } });
  const tallyInfo = (imp) => ({
    httpStatus: imp.httpStatus,
    created: imp.result.created,
    altered: imp.result.altered,
    errors: imp.result.errors,
    lineError: clip(imp.result.lineError, 2000),
    requestHash: imp.requestHash,
    responseBody: clip(imp.body, 200_000),
  });

  log.info('Job claimed', tag);

  // ---- 1. Pre-flight checks (nothing has been sent to Tally yet) --------------------------
  if (!isCompanyAllowed(cfg, company)) {
    log.warn('Company not in ALLOWED_COMPANIES, handing job back', tag);
    return report('NOT_SUBMITTED', { errorCode: 'COMPANY_NOT_ALLOWED', errorMessage: `"${company}" is not in this agent's ALLOWED_COMPANIES` });
  }
  if (!v.reference || /["\r\n]/.test(v.reference)) {
    return report('NOT_SUBMITTED', { errorCode: 'UNSAFE_REFERENCE', errorMessage: 'Voucher reference is empty or contains characters that cannot be verified in Tally' });
  }
  let existing;
  try {
    const loaded = await tally.listCompanies(server);
    if (!loaded.some((c) => sameName(c, company))) {
      log.warn('Company is not loaded in TallyPrime', { ...tag, loaded });
      return report('NOT_SUBMITTED', { errorCode: 'COMPANY_NOT_LOADED', errorMessage: `Company "${company}" is not open in TallyPrime on ${server.host}:${server.port}` });
    }
    existing = await tally.findVouchers(server, company, v.reference, v.voucherDate);
  } catch (err) {
    log.warn('Pre-flight check against Tally failed', { ...tag, error: err.message });
    return report('NOT_SUBMITTED', { errorCode: err.code ?? 'TALLY_UNREACHABLE', errorMessage: clip(err.message, 2000) });
  }
  if (existing.length > 1) {
    log.error('Several vouchers already carry this reference; needs reconciliation', tag);
    return report('AMBIGUOUS', { errorCode: 'DUPLICATE_REFERENCE_IN_TALLY', errorMessage: `${existing.length} vouchers with reference ${v.reference} exist in Tally` });
  }

  // ---- 2. Declare submission -------------------------------------------------------------
  try {
    await api.submitting(job.jobId, job.attemptId);
  } catch (err) {
    if (!(err instanceof ApiError && err.code === 'ALREADY_SUBMITTING')) {
      log.error('Could not declare submission; not importing', { ...tag, error: err.message });
      // The server may or may not have recorded it; NOT_SUBMITTED after a recorded submission is treated as ambiguous server-side.
      return report('NOT_SUBMITTED', { errorCode: 'SUBMITTING_FAILED', errorMessage: clip(err.message, 2000) });
    }
  }

  if (existing.length === 1) {
    // An earlier attempt reached Tally even though its result was lost. Never import twice.
    log.warn('Voucher already in Tally; reporting it for verification instead of importing again', tag);
    return report('POSTED', { readback: asReadback(existing[0]), errorCode: 'ALREADY_IN_TALLY' });
  }

  // ---- 3. Import ---------------------------------------------------------------------------
  let imp;
  try {
    imp = await tally.importVoucher(server, company, v);
  } catch (err) {
    const neverSent = err instanceof TallyError && err.requestSent === false;
    log.error('Import request failed', { ...tag, error: err.message, neverSent });
    if (neverSent) return report('NOT_SUBMITTED', { errorCode: err.code, errorMessage: clip(err.message, 2000) });
    const rb = await readBack(tally, server, company, v);
    if (rb.found?.length === 1) return report('POSTED', { readback: asReadback(rb.found[0]), errorCode: 'POSTED_AFTER_ERROR' });
    return report('AMBIGUOUS', { errorCode: err.code ?? 'TALLY_NO_RESPONSE', errorMessage: clip(`${err.message}. Voucher could not be confirmed in Tally.`, 2000) });
  }

  const r = imp.result;
  log.info('Tally import response', { ...tag, created: r.created, altered: r.altered, errors: r.errors, exceptions: r.exceptions, lineError: r.lineError });

  // ---- 4. Verify by reading back -------------------------------------------------------
  const rb = await readBack(tally, server, company, v);
  if (rb.error) {
    return report('AMBIGUOUS', { tally: tallyInfo(imp), errorCode: 'READBACK_FAILED', errorMessage: clip(`Import answered created=${r.created} errors=${r.errors}, but read-back failed: ${rb.error.message}`, 2000) });
  }
  if (rb.found.length > 1) {
    return report('AMBIGUOUS', { tally: tallyInfo(imp), errorCode: 'DUPLICATE_REFERENCE_IN_TALLY', errorMessage: `${rb.found.length} vouchers with reference ${v.reference} found after import` });
  }
  if (rb.found.length === 1) {
    log.info('Voucher verified in Tally', { ...tag, masterId: rb.found[0].masterId, voucherNumber: rb.found[0].voucherNumber });
    return report('POSTED', { tally: tallyInfo(imp), readback: asReadback(rb.found[0]) });
  }
  if (r.errors > 0 || r.exceptions > 0) {
    log.warn('Tally rejected the voucher', { ...tag, lineError: r.lineError });
    return report('REJECTED', { tally: tallyInfo(imp), errorCode: 'TALLY_REJECTED', errorMessage: clip(r.lineError ?? 'Tally reported import errors', 2000) });
  }
  return report('AMBIGUOUS', {
    tally: tallyInfo(imp),
    errorCode: r.created > 0 ? 'CREATED_BUT_NOT_FOUND' : 'NOTHING_IMPORTED',
    errorMessage: `Tally answered created=${r.created} altered=${r.altered} ignored=${r.ignored} but no voucher with reference ${v.reference} was found`,
  });
}
