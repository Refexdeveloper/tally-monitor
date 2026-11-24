import net from 'node:net';
import axios from 'axios';
import { Op } from 'sequelize';
import { env } from '../config/env';
import { ApplicationCredential, type Application } from '../models';
import { decryptSecret } from '../utils/crypto';
import { ApiError } from '../utils/http';

/** SSRF guard: only HTTPS to configured Kissflow host suffixes, never IP literals. */
export function assertAllowedKissflowUrl(raw: string) {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  const allowed = url.protocol === 'https:' && !net.isIP(host) && env.kissflowAllowedHosts.some((s) => host === s || host.endsWith(`.${s}`));
  if (!allowed) throw new ApiError(422, 'HOST_NOT_ALLOWED', `Host ${host} is not in the allowed Kissflow hosts (${env.kissflowAllowedHosts.join(', ')})`);
  return url;
}

export async function kissflowAuthHeaders(app: Application): Promise<Record<string, string>> {
  const cred = await ApplicationCredential.unscoped().findOne({
    where: { applicationId: app.id, isActive: true, credentialType: { [Op.in]: ['API_KEY', 'BEARER_TOKEN'] } },
    order: [['createdAt', 'DESC']],
  });
  if (!cred) throw ApiError.badRequest('No API credentials stored for this application');
  const secret = decryptSecret(cred.encryptedValue, env.encryptionKey);
  if (cred.credentialType === 'API_KEY') {
    const { keyId, keySecret } = JSON.parse(secret) as { keyId: string; keySecret: string };
    return { 'X-Access-Key-Id': keyId, 'X-Access-Key-Secret': keySecret };
  }
  return { Authorization: `Bearer ${secret}` };
}

export async function kissflowGet(app: Application, url: string) {
  assertAllowedKissflowUrl(url);
  const headers = await kissflowAuthHeaders(app);
  return axios.get(url, { headers, timeout: 15_000, maxRedirects: 0, validateStatus: () => true, maxContentLength: 20 * 1024 * 1024 });
}
