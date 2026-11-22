// Inbox for contact messages; CONTACT_RECIPIENT overrides the public address in the deployment's environment.
const DEFAULT_RECIPIENT = 'info@sentrapedia.com';
const MAX_BODY_BYTES = 4096;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function json(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(body));
}

function trimField(value, maxLength) {
  return typeof value === 'string' && value.length <= maxLength ? value.trim() : null;
}

export function validateContact(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const name = trimField(body.name, 120);
  const email = trimField(body.email, 254);
  const company = trimField(body.company, 160);
  const phone = trimField(body.phone, 40);
  const message = trimField(body.message, 1000);
  const website = trimField(body.website, 100);
  if (!name || !email || company === null || phone === null || !message || website === null || website || body.consent !== true) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (/[\r\n]/.test(name + email + company + phone)) return null;
  if (/\b\d{10,16}\b|\b(?:nik|no\.?\s*rm|rekam medis|tanggal lahir)\s*[:#]/i.test(message)) return null;
  return { name, email, company, phone, message };
}

export async function sendContactViaResend(contact, { apiKey, from, recipient = DEFAULT_RECIPIENT, fetchEmail = fetch } = {}) {
  if (!apiKey || !from || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) return null;
  const body = [
    `Nama: ${contact.name}`,
    `Email: ${contact.email}`,
    `Institusi: ${contact.company || '—'}`,
    `Telepon: ${contact.phone || '—'}`,
    '',
    contact.message
  ].join('\n');
  const response = await fetchEmail('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: `Sentrapedia <${from}>`,
      to: [recipient],
      subject: 'Pertanyaan umum Sentrapedia',
      text: body
    }),
    signal: AbortSignal.timeout(8000)
  });
  // The status code is the only provider detail kept for the operator; the provider's error body is never logged.
  if (!response.ok) throw new Error(`resend-http-${response.status}`);
  const result = await response.json();
  if (typeof result.id !== 'string' || !result.id) throw new Error('resend-no-id');
  return result.id;
}

// One JSON line per delivery failure, written to stderr so Vercel records it at error level. It names the reason only:
// no visitor field, address, IP or message text is ever passed here.
function logDeliveryFailure(log, reason) {
  log(JSON.stringify({ event: 'contact_delivery_failed', reason }));
}

// The browser's Origin must match the site's own origin. CONTACT_PUBLIC_ORIGIN pins it (normalised, so a trailing slash
// or path is harmless); otherwise it is derived from the request. Vercel terminates TLS and sets x-forwarded-proto to
// the visitor's scheme (vercel.com/docs/headers/request-headers), so an HTTPS page posts with an https:// Origin; the
// local server has no proxy and stays on http.
export function expectedOrigin(req, publicOrigin) {
  if (publicOrigin) {
    try { return new URL(publicOrigin.trim()).origin; }
    catch { return null; }
  }
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  const scheme = proto === 'https' ? 'https' : 'http';
  return req.headers.host ? `${scheme}://${req.headers.host}` : null;
}

export function createContactHandler({
  apiKey = process.env.RESEND_API_KEY,
  from = process.env.RESEND_FROM_EMAIL,
  publicOrigin = process.env.CONTACT_PUBLIC_ORIGIN,
  recipient = process.env.CONTACT_RECIPIENT || DEFAULT_RECIPIENT,
  fetchEmail = fetch,
  now = Date.now,
  log = console.error
} = {}) {
  const attempts = new Map();
  return async (req, res) => {
    const origin = req.headers.origin;
    if (origin && origin !== expectedOrigin(req, publicOrigin)) {
      json(res, 403, { status: 'rejected', message: 'Origin tidak diizinkan.' });
      return;
    }
    if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
      json(res, 415, { status: 'invalid', message: 'Format formulir tidak didukung.' });
      return;
    }
    // Best-effort burst guard only: the map lives in one function instance, so on Vercel each cold or parallel instance
    // has its own count. The real per-IP limit belongs in a Vercel Firewall rate-limit rule (docs/data.md).
    // Behind a proxy (Vercel) the socket is the proxy; the first forwarded address is the visitor. Vercel overwrites
    // x-forwarded-for, so a visitor cannot set it (vercel.com/docs/headers/request-headers, checked 2026-10-19); the
    // local server listens on loopback only and takes the header as sent.
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    const recent = (attempts.get(ip) || []).filter(time => now() - time < WINDOW_MS);
    if (recent.length >= MAX_ATTEMPTS) {
      json(res, 429, { status: 'limited', message: 'Terlalu banyak percobaan. Coba lagi nanti.' });
      return;
    }
    recent.push(now());
    attempts.set(ip, recent);

    let raw = '';
    let tooLarge = false;
    for await (const chunk of req) {
      raw += chunk;
      if (Buffer.byteLength(raw) > MAX_BODY_BYTES) {
        tooLarge = true;
        break;
      }
    }
    if (tooLarge) {
      json(res, 413, { status: 'invalid', message: 'Pesan terlalu panjang.' });
      return;
    }
    let input;
    try { input = JSON.parse(raw); }
    catch { json(res, 400, { status: 'invalid', message: 'Formulir tidak valid.' }); return; }
    const contact = validateContact(input);
    if (!contact) {
      json(res, 400, { status: 'invalid', message: 'Periksa isian. Jangan cantumkan identitas atau informasi pasien.' });
      return;
    }
    if (!apiKey || !from) {
      logDeliveryFailure(log, 'not-configured');
      json(res, 503, { status: 'unavailable', message: 'Layanan pengiriman belum tersedia.' });
      return;
    }
    try {
      const id = await sendContactViaResend(contact, { apiKey, from, recipient, fetchEmail });
      if (!id) throw new Error('invalid-sender');
      json(res, 202, { status: 'accepted' });
    } catch (error) {
      // TimeoutError: no answer within 8 s; TypeError: network failure; resend-*: the provider refused the message.
      logDeliveryFailure(log, error?.name === 'Error' ? error.message : String(error?.name || 'unknown'));
      json(res, 502, { status: 'unavailable', message: 'Layanan pengiriman gagal menerima pesan.' });
    }
  };
}
