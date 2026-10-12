// RFC 6238 TOTP (SHA-1, 6 digits, 30 s): what Google Authenticator,
// Microsoft Authenticator, 1Password, Authy etc. expect.
import { createHmac, randomBytes } from 'node:crypto';
import { safeEqual } from './crypto.mts';

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_MS = 30_000;

export function base32Encode(buf: Buffer) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string) {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export function hotp(key: Buffer, counter: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', key).update(msg).digest();
  const o = h[h.length - 1] & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

export const newSecret = () => base32Encode(randomBytes(20));
export const currentStep = (now = Date.now()) => Math.floor(now / STEP_MS);

/**
 * Accepts the current code and one step either side (clock drift).
 * Returns the matched time step, or null. Steps at or below `lastStep`
 * are rejected so a code can't be replayed.
 */
export function verifyTotp(secret: string, code: string, lastStep = 0, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const key = base32Decode(secret);
  const step = currentStep(now);
  let match: number | null = null;
  for (const s of [step - 1, step, step + 1]) {
    // Compare every candidate so timing doesn't reveal which one matched.
    if (safeEqual(hotp(key, s), code) && s > lastStep && match === null) match = s;
  }
  return match;
}

export function otpauthUri(secret: string, account: string) {
  const issuer = 'draninavega.com';
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
