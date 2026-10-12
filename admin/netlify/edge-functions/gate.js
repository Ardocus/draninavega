// The gate. Runs at Netlify's edge in front of EVERY request to the admin portal,
// before any file or API call is served.
//
// Open: the sign-in page and its assets, and the sign-in / setup / export APIs
// (each protects itself). Everything else needs a session cookie whose HMAC
// signature (SESSION_SECRET) and expiry are valid — otherwise pages redirect to
// the sign-in page and API calls get 401. The API still checks the session record
// in the store (idle timeout, sign-out), so the gate is a first wall, not the only one.
// Signature format mirrors server/crypto.mts → signSession().

const OPEN = new Set([
  '/',
  '/index.html',
  '/favicon.svg',
  '/robots.txt',
  '/assets/app.css',
  '/assets/core.js',
  '/assets/auth.js',
  '/assets/main.js',
  '/api/session',
  '/api/login',
  '/api/login/code',
  '/api/login/enroll',
  '/api/setup/start',
  '/api/setup/finish',
  '/api/export', // Bearer EXPORT_TOKEN, checked inside the function
]);
const OPEN_PREFIXES = ['/fonts/'];
const COOKIE = '__Host-nv_session';
const encoder = new TextEncoder();

function readCookie(header, name) {
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

function base64url(bytes) {
  let bin = '';
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sameString(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function validSession(value, secret) {
  const [sid, expStr, sig] = (value || '').slice(0, 200).split('.');
  const exp = Number(expStr);
  if (!sid || !sig || !Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`nv-session:${sid}:${exp}`));
  return sameString(sig, base64url(mac));
}

const deny = (path) =>
  path.startsWith('/api/')
    ? new Response(JSON.stringify({ error: 'signed_out' }), {
      status: 401,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    })
    : new Response(null, { status: 302, headers: { location: '/', 'cache-control': 'no-store' } });

export default async (request, context) => {
  const path = new URL(request.url).pathname;
  if (OPEN.has(path) || OPEN_PREFIXES.some((p) => path.startsWith(p))) return context.next();

  const secret = (globalThis.Netlify?.env.get('SESSION_SECRET') || '').trim();
  if (secret.length < 32) return deny(path); // fail closed when misconfigured
  if (await validSession(readCookie(request.headers.get('cookie'), COOKIE), secret)) return context.next();
  return deny(path);
};

export const config = { path: '/*' };
