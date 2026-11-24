import crypto from 'node:crypto';

export function sha256(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 48): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function timingSafeEqualStr(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb) && a.length === b.length;
}

/** AES-256-GCM. Output format: v1.<iv>.<tag>.<ciphertext> (base64url parts). */
export function encryptSecret(plaintext: string, key: Buffer): string {
  if (key.length !== 32) throw new Error('Encryption key must be 32 bytes');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptSecret(payload: string, key: Buffer): string {
  const [version, iv, tag, data] = payload.split('.');
  if (version !== 'v1' || !iv || !tag || data === undefined) throw new Error('Unsupported secret format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

/** HMAC-SHA256 signature used for webhook verification. */
export function hmacSha256(secret: string, body: string | Buffer): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}
