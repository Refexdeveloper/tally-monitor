/**
 * Creates Finance-approved ledgers in TallyPrime. Always checks for an existing ledger first
 * and only reports CREATED/EXISTS with a read-back of the ledger from Tally.
 */
import { isCompanyAllowed } from '../config.js';
import { sameName, serverTarget } from '../tally/index.js';

const clip = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s);
const asReadback = (l) => ({ name: l.name, parent: l.parent, guid: l.guid, masterId: l.masterId, alterId: l.alterId });

export async function createMaster(request, { cfg, tally, outbox, log, assignment }) {
  const company = assignment.companies.find((c) => c.id === request.companyId);
  const serverInfo = company && assignment.servers.find((s) => s.id === company.serverId);
  const report = (outcome, extra = {}) => outbox.add({ kind: 'master', id: request.id, body: { outcome, ...extra } });
  const tag = { requestId: request.id, company: request.tallyCompanyName, ledger: request.name };

  if (!serverInfo) return report('FAILED', { error: 'The company is not on a Tally server assigned to this agent' });
  if (!isCompanyAllowed(cfg, request.tallyCompanyName)) return report('FAILED', { error: `"${request.tallyCompanyName}" is not in this agent's ALLOWED_COMPANIES` });
  if (!request.parent) return report('FAILED', { error: 'No parent group was approved for this ledger' });
  const server = serverTarget(cfg, serverInfo);

  try {
    const loaded = await tally.listCompanies(server);
    if (!loaded.some((c) => sameName(c, request.tallyCompanyName))) return report('FAILED', { error: `Company "${request.tallyCompanyName}" is not open in TallyPrime` });

    const existing = await tally.findLedger(server, request.tallyCompanyName, request.name);
    if (existing) {
      log.info('Ledger already exists in Tally', { ...tag, parent: existing.parent });
      return report('EXISTS', { readback: asReadback(existing) });
    }

    const imp = await tally.createLedger(server, request.tallyCompanyName, { name: request.name, parent: request.parent, billWise: request.billWise });
    const tallyInfo = { httpStatus: imp.httpStatus, created: imp.result.created, altered: imp.result.altered, errors: imp.result.errors, lineError: clip(imp.result.lineError, 2000), responseBody: clip(imp.body, 200_000) };
    const created = await tally.findLedger(server, request.tallyCompanyName, request.name);
    if (created) {
      log.info('Ledger created in Tally', { ...tag, masterId: created.masterId });
      return report('CREATED', { readback: asReadback(created), tally: tallyInfo });
    }
    log.warn('Ledger creation failed', { ...tag, lineError: imp.result.lineError });
    return report('FAILED', { error: clip(imp.result.lineError ?? 'Tally did not create the ledger', 1000), tally: tallyInfo });
  } catch (err) {
    log.warn('Ledger creation could not complete', { ...tag, error: err.message });
    return report('FAILED', { error: clip(`${err.code ?? 'ERROR'}: ${err.message}`, 1000) });
  }
}
