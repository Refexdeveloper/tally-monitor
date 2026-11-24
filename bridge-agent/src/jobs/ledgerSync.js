/** Read-only: pushes each assigned company's ledger list from TallyPrime to Tally Monitor. */
import { sameName, serverTarget } from '../tally/index.js';

export async function syncAllLedgers({ cfg, api, tally, log, assignment, loadedByServer }) {
  const summary = [];
  for (const company of assignment.companies) {
    const serverInfo = assignment.servers.find((s) => s.id === company.serverId);
    if (!serverInfo) continue;
    const loaded = loadedByServer.get(serverInfo.id);
    if (!loaded?.some((n) => sameName(n, company.tallyCompanyName))) {
      log.debug('Skipping ledger sync: company not loaded in Tally', { company: company.tallyCompanyName });
      continue;
    }
    try {
      const ledgers = await tally.listLedgers(serverTarget(cfg, serverInfo), company.tallyCompanyName);
      const res = await api.syncLedgers({ companyId: company.id, ledgers });
      log.info('Ledgers synced', { company: company.tallyCompanyName, count: ledgers.length, ...res });
      summary.push({ company: company.tallyCompanyName, count: ledgers.length });
    } catch (err) {
      log.warn('Ledger sync failed', { company: company.tallyCompanyName, error: err.message });
    }
  }
  return summary;
}
