import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';

export class TallyError extends Error {
  /**
   * @param {string} message
   * @param {{ code?: string, requestSent?: boolean, httpStatus?: number|null, body?: string }} opts
   * requestSent=false means Tally never received the request (connection refused, DNS, connect timeout),
   * so it cannot have changed any data.
   */
  constructor(message, { code = 'TALLY_ERROR', requestSent = true, httpStatus = null, body } = {}) {
    super(message);
    this.code = code;
    this.requestSent = requestSent;
    this.httpStatus = httpStatus;
    this.body = body;
  }
}

/** Tally answers in UTF-8 or UTF-16LE (with or without BOM) depending on release and settings. */
export function decodeBody(buf) {
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString('utf8');
  if (buf.length >= 4 && buf[0] === 0x3c && buf[1] === 0x00) return buf.toString('utf16le');
  return buf.toString('utf8');
}

export const sha256 = (s) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

/**
 * One request at a time per Tally server: TallyPrime processes XML requests serially and
 * concurrent imports into the same company are exactly what we must avoid.
 */
const queues = new Map();
function serialize(key, fn) {
  const prev = queues.get(key) ?? Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  queues.set(
    key,
    next.catch(() => {}),
  );
  return next;
}

/** POSTs an XML envelope to TallyPrime's HTTP server and returns the decoded response text. */
export function postXml(server, xml, { timeoutMs = 60_000 } = {}) {
  const key = `${server.host}:${server.port}`;
  return serialize(key, () => send(server, xml, timeoutMs));
}

function send(server, xml, timeoutMs) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(xml, 'utf8');
    const lib = server.protocol === 'https' ? https : http;
    let connected = false;
    let sent = false;
    let settled = false;
    const done = (fn, v) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(v);
    };

    const req = lib.request(
      { host: server.host, port: server.port, method: 'POST', path: '/', headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Content-Length': payload.length } },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = decodeBody(Buffer.concat(chunks));
          if (res.statusCode && res.statusCode >= 400) {
            done(reject, new TallyError(`Tally HTTP ${res.statusCode}`, { code: 'TALLY_HTTP_ERROR', httpStatus: res.statusCode, body }));
          } else done(resolve, { httpStatus: res.statusCode ?? 200, body });
        });
        res.on('error', (err) => done(reject, new TallyError(`Tally response error: ${err.message}`, { code: 'TALLY_RESPONSE_ERROR' })));
      },
    );
    const timer = setTimeout(() => {
      req.destroy();
      done(
        reject,
        new TallyError(connected ? `No response from Tally within ${timeoutMs / 1000}s` : `Could not connect to Tally at ${server.host}:${server.port}`, {
          code: connected ? 'TALLY_TIMEOUT' : 'TALLY_CONNECT_TIMEOUT',
          requestSent: sent,
        }),
      );
    }, timeoutMs);
    req.on('socket', (socket) => {
      if (!socket.connecting) connected = true;
      else socket.once('connect', () => (connected = true));
    });
    req.on('finish', () => (sent = true));
    req.on('error', (err) => {
      // Until the full body is flushed Tally cannot act on it (it waits for Content-Length bytes).
      const neverSent = !sent;
      done(
        reject,
        new TallyError(
          neverSent ? `Tally not reachable at ${server.host}:${server.port} (${err.code ?? err.message})` : `Connection to Tally failed: ${err.code ?? err.message}`,
          { code: neverSent ? 'TALLY_UNREACHABLE' : 'TALLY_CONNECTION_LOST', requestSent: !neverSent },
        ),
      );
    });
    req.end(payload);
  });
}
