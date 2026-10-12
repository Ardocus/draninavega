import {
  scrypt as scryptCb, randomBytes, createHash, createHmac, timingSafeEqual,
  createCipheriv, createDecipheriv, randomInt, hkdfSync,
} from 'node:crypto';
import { env } from './env.mts';

// scrypt at the OWASP Password Storage minimum: N=2^17, r=8, p=1 (~128 MiB per hash).
const N = 2 ** 17, R = 8, P = 1, KEYLEN = 32, MAXMEM = 256 * 1024 * 1024;

const scrypt = (pw: string, salt: Buffer, n = N, r = R, p = P) =>
  new Promise<Buffer>((resolve, reject) =>
    scryptCb(pw.normalize('NFKC'), salt, KEYLEN, { N: n, r, p, maxmem: MAXMEM }, (e, k) => (e ? reject(e) : resolve(k))),
  );

export async function hashPassword(pw: string) {
  const salt = randomBytes(16);
  const hash = await scrypt(pw, salt);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(pw: string, stored: string) {
  const [alg, n, r, p, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(pw, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Burn the same time as a real check when the username doesn't exist. */
let dummy: string | undefined;
export async function burnPasswordCheck(pw: string) {
  dummy ??= await hashPassword(randomBytes(16).toString('hex'));
  await verifyPassword(pw, dummy);
}

export const token = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** Constant-time string comparison (hashing first equalizes lengths). */
export function safeEqual(a: string, b: string) {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}

/** Recovery codes: 10 × "XXXX-XXXX", unambiguous alphabet, ~40 bits each. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function recoveryCodes(count = 10) {
  return Array.from({ length: count }, () => {
    let s = '';
    for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}
export const normalizeRecovery = (c: string) => c.toUpperCase().replace(/[^A-Z0-9]/g, '');

// ── Keys derived from SESSION_SECRET (HKDF, one key per purpose) ─────────
const derive = (purpose: string) => Buffer.from(hkdfSync('sha256', env.sessionSecret, 'draninavega-admin', purpose, 32));

/** Keyed hash for recovery codes: a copy of the store alone can't brute-force them offline. */
export const keyedHash = (s: string) => createHmac('sha256', derive('recovery-v1')).update(s).digest('hex');

// AES-256-GCM for authenticator secrets at rest. A leak of the Blobs store
// alone doesn't let anyone generate login codes.
export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', derive('totp-v1'), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.');
}

export function decrypt(box: string) {
  const [v, iv, tag, ct] = box.split('.');
  if (v !== 'v1') throw new Error('bad ciphertext version');
  const d = createDecipheriv('aes-256-gcm', derive('totp-v1'), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
}

// ── Signed session cookie value: "<sid>.<exp>.<sig>" ─────────────────────
// The edge gate (netlify/edge-functions/gate.js) verifies the same HMAC
// before serving anything private; the API then also checks the session
// record in the store (idle timeout, sign-out, epoch).
const cookieSig = (sid: string, exp: number) =>
  createHmac('sha256', env.sessionSecret).update(`nv-session:${sid}:${exp}`).digest('base64url');

export const signSession = (sid: string, exp: number) => `${sid}.${exp}.${cookieSig(sid, exp)}`;

/** Returns the session id if the signature and expiry are valid, else null. */
export function verifySessionCookie(value: string): string | null {
  const [sid, expStr, sig] = (value || '').split('.');
  const exp = Number(expStr);
  if (!sid || !sig || !Number.isFinite(exp) || exp < Date.now() / 1000) return null;
  return safeEqual(sig, cookieSig(sid, exp)) ? sid : null;
}
