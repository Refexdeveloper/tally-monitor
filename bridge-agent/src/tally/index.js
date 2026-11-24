import { postXml, sha256 } from './client.js';
import * as x from './xml.js';

/** High-level TallyPrime operations used by the agent and the CLI. */
export function createTally(cfg) {
  const read = (server, xml, timeoutMs = cfg.tallyTimeoutMs) => postXml(server, xml, { timeoutMs }).then((r) => r.body);

  return {
    listCompanies: async (server, { timeoutMs = cfg.tallyHealthTimeoutMs } = {}) => x.parseCompanies(await read(server, x.companiesRequest(), timeoutMs)),
    listLedgers: async (server, company) => x.parseLedgers(await read(server, x.ledgersRequest(company))),
    findLedger: async (server, company, name) => {
      const wanted = name.trim().toLowerCase();
      return x.parseLedgers(await read(server, x.ledgerByNameRequest(company, name))).find((l) => l.name.trim().toLowerCase() === wanted) ?? null;
    },
    /** Exact (trimmed) reference matches only; Tally's string compare is case-insensitive. */
    findVouchers: async (server, company, reference, isoDate) =>
      x.parseVouchers(await read(server, x.voucherByReferenceRequest(company, reference, isoDate))).filter((v) => v.reference.trim() === reference.trim()),

    async importVoucher(server, company, voucher) {
      const xml = x.voucherImportRequest(company, voucher, { costCategory: cfg.costCategory });
      const res = await postXml(server, xml, { timeoutMs: cfg.tallyTimeoutMs });
      return { requestHash: sha256(xml), httpStatus: res.httpStatus, body: res.body, result: x.parseImportResponse(res.body) };
    },
    async createLedger(server, company, master) {
      const xml = x.ledgerCreateRequest(company, master);
      const res = await postXml(server, xml, { timeoutMs: cfg.tallyTimeoutMs });
      return { requestHash: sha256(xml), httpStatus: res.httpStatus, body: res.body, result: x.parseImportResponse(res.body) };
    },
  };
}

export const sameName = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

/** Server connection for a job/company, honouring TALLY_HOST_OVERRIDE for agents installed on the Tally machine. */
export const serverTarget = (cfg, s) => ({ host: cfg.tallyHostOverride ?? s.host, port: Number(s.port), protocol: s.protocol === 'https' ? 'https' : 'http' });
