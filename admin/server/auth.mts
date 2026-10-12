import { store } from './store.mts';
import { env } from './env.mts';
import { HttpError, readCookies, SESSION_COOKIE, PENDING_COOKIE } from './http.mts';
import {
  hashPassword, verifyPassword, burnPasswordCheck, token, sha256, safeEqual,
  recoveryCodes, normalizeRecovery, keyedHash, encrypt, decrypt, signSession, verifySessionCookie,
} from './crypto.mts';
import { verifyTotp, newSecret, otpauthUri, currentStep } from './totp.mts';

// ── Policy ────────────────────────────────────────────────────────────────
export const SESSION_IDLE_MS = 30 * 60_000;      // signed out after 30 min idle
export const SESSION_MAX_MS = 8 * 3600_000;      // and after 8 h regardless
const PENDING_TTL_MS = 5 * 60_000;               // password OK → 5 min to enter the code
const PENDING_MAX_TRIES = 5;
const ENROLL_TTL_MS = 15 * 60_000;
const USER_MAX_FAILS = 8;                        // then lock the account…
const USER_LOCK_MS = 15 * 60_000;                // …for 15 min, doubling each time (max 4 h)
const IP_MAX_FAILS = 20;                         // per IP per 15 min, across all accounts
const IP_WINDOW_MS = 15 * 60_000;
const TOUCH_EVERY_MS = 60_000;

// ── Types ─────────────────────────────────────────────────────────────────
export interface User {
  username: string;
  name: string;
  passHash: string;
  totp: string;              // AES-GCM encrypted base32 secret
  lastStep: number;          // last accepted TOTP step (replay protection)
  recovery: string[];        // sha256 of normalized codes
  epoch: number;             // bumping it signs out every session
  createdAt: string;
  passwordChangedAt: string;
}
interface Session { username: string; epoch: number; created: number; seen: number; ip: string; ua: string }
interface Pending { username: string; expires: number; tries: number; enroll?: string; passHash?: string }
interface Enroll { username: string; name: string; passHash: string; secret: string; expires: number }
interface Limit { fails: number; since: number; lockedUntil: number; locks: number }

export const validUsername = (u: string) => /^[a-z0-9._-]{3,32}$/.test(u);
const userKey = (u: string) => `user:${u}`;
const now = () => Date.now();
const iso = () => new Date().toISOString();

// ── Activity log ─────────────────────────────────────────────────────────
export interface AuditEntry { at: string; user: string; event: string; ip: string; detail?: string }

export async function audit(event: string, user: string, ip: string, detail?: string) {
  const kv = await store();
  const log = (await kv.get<AuditEntry[]>('audit')) || [];
  log.unshift({ at: iso(), user, event, ip, ...(detail ? { detail: detail.slice(0, 500) } : {}) });
  await kv.set('audit', log.slice(0, 300));
}
export async function readAudit() {
  return (await (await store()).get<AuditEntry[]>('audit')) || [];
}

// ── Rate limiting ────────────────────────────────────────────────────────
async function getLimit(key: string): Promise<Limit> {
  return (await (await store()).get<Limit>(key)) || { fails: 0, since: now(), lockedUntil: 0, locks: 0 };
}

async function assertNotLimited(ip: string, username?: string) {
  const ipL = await getLimit(`rl:ip:${sha256(ip)}`);
  if (ipL.lockedUntil > now()) throw new HttpError(429, 'too_many', { retryAfter: Math.ceil((ipL.lockedUntil - now()) / 1000) });
  if (username) {
    const uL = await getLimit(`rl:user:${username}`);
    if (uL.lockedUntil > now()) throw new HttpError(429, 'locked', { retryAfter: Math.ceil((uL.lockedUntil - now()) / 1000) });
  }
}

async function recordFailure(ip: string, username?: string) {
  const kv = await store();
  const ipKey = `rl:ip:${sha256(ip)}`;
  const ipL = await getLimit(ipKey);
  if (now() - ipL.since > IP_WINDOW_MS) { ipL.fails = 0; ipL.since = now(); }
  ipL.fails++;
  if (ipL.fails >= IP_MAX_FAILS) { ipL.lockedUntil = now() + IP_WINDOW_MS; ipL.fails = 0; ipL.since = now(); }
  await kv.set(ipKey, ipL);

  if (username) {
    const uKey = `rl:user:${username}`;
    const uL = await getLimit(uKey);
    uL.fails++;
    if (uL.fails >= USER_MAX_FAILS) {
      uL.lockedUntil = now() + Math.min(USER_LOCK_MS * 2 ** uL.locks, 4 * 3600_000);
      uL.locks++;
      uL.fails = 0;
      await audit('account_locked', username, ip);
    }
    await kv.set(uKey, uL);
  }
}

async function clearUserFailures(username: string) {
  const kv = await store();
  const uL = await getLimit(`rl:user:${username}`);
  if (uL.fails || uL.locks) await kv.set(`rl:user:${username}`, { ...uL, fails: 0, locks: 0 });
}

// ── Users ────────────────────────────────────────────────────────────────
export async function getUser(username: string) {
  return validUsername(username) ? (await store()).get<User>(userKey(username)) : null;
}
const saveUser = async (u: User) => (await store()).set(userKey(u.username), u);

export function checkPasswordPolicy(pw: string, username: string) {
  if (pw.length < 12) throw new HttpError(400, 'password_short');
  if (pw.length > 200) throw new HttpError(400, 'password_long');
  const lower = pw.toLowerCase();
  if (lower.includes(username) || /^(.)\1+$/.test(pw) || ['passwordpassword', 'contraseña1234', '123456789012'].includes(lower)) {
    throw new HttpError(400, 'password_weak');
  }
}

/** Second factor: a TOTP code, or a one-time recovery code. Mutates and saves the user on success. */
async function checkSecondFactor(user: User, code: string): Promise<'totp' | 'recovery' | null> {
  const c = code.replace(/\s/g, '');
  if (/^\d{6}$/.test(c)) {
    const step = verifyTotp(decrypt(user.totp), c, user.lastStep);
    if (step === null) return null;
    user.lastStep = step;
    await saveUser(user);
    return 'totp';
  }
  const norm = normalizeRecovery(c);
  if (norm.length !== 8) return null;
  const h = keyedHash(norm);
  const i = user.recovery.findIndex((r) => safeEqual(r, h));
  if (i < 0) return null;
  user.recovery.splice(i, 1);
  await saveUser(user);
  return 'recovery';
}

// ── Login ────────────────────────────────────────────────────────────────
// ── Bootstrap account ────────────────────────────────────────────────────
// First-ever sign-in with BOOTSTRAP_USER + BOOTSTRAP_PASSWORD (env vars, never
// the repo). It doesn't create a session: it forces authenticator enrollment
// first, then stores a scrypt hash of the password. Once that account exists
// in the store, the env password is ignored for good; delete it afterwards.
const bootstrapPasswordOk = (pw: string) => {
  const boot = env.bootstrapPassword;
  return boot.length >= 12 && safeEqual(pw, boot);
};

export async function startLogin(usernameIn: string, password: string, ip: string) {
  const username = usernameIn.trim().toLowerCase();
  await assertNotLimited(ip, validUsername(username) ? username : undefined);
  const user = await getUser(username);
  const isBootstrap = !user && username === env.bootstrapUser && env.bootstrapPassword.length >= 12;
  const ok = user
    ? await verifyPassword(password, user.passHash)
    : isBootstrap
      ? (await burnPasswordCheck(password), bootstrapPasswordOk(password))
      : (await burnPasswordCheck(password), false);
  if (!ok) {
    // Count failures for any well-formed username, so lockouts don't reveal which accounts exist.
    await recordFailure(ip, validUsername(username) ? username : undefined);
    if (user || isBootstrap) await audit('login_failed', username, ip, 'password');
    throw new HttpError(401, 'invalid_credentials');
  }
  const pendingId = token();
  const pending: Pending = { username, expires: now() + (isBootstrap ? ENROLL_TTL_MS : PENDING_TTL_MS), tries: 0 };
  let enroll: { secret: string; uri: string } | undefined;
  if (isBootstrap) {
    const secret = newSecret();
    pending.enroll = encrypt(secret);
    pending.passHash = await hashPassword(password);
    enroll = { secret, uri: otpauthUri(secret, username) };
    await audit('bootstrap_login', username, ip);
  }
  await (await store()).set(`pending:${sha256(pendingId)}`, pending);
  return { pendingId, maxAge: (isBootstrap ? ENROLL_TTL_MS : PENDING_TTL_MS) / 1000, enroll };
}

/** Completes the bootstrap: verifies the first code from the new authenticator and creates the account. */
export async function finishBootstrap(req: Request, code: string, nameIn: string, ip: string, ua: string) {
  const pendingId = readCookies(req)[PENDING_COOKIE];
  if (!pendingId) throw new HttpError(401, 'mfa_expired');
  const kv = await store();
  const pKey = `pending:${sha256(pendingId)}`;
  const pending = await kv.get<Pending>(pKey);
  if (!pending?.enroll || !pending.passHash || pending.expires < now() || pending.tries >= PENDING_MAX_TRIES) {
    await kv.del(pKey);
    throw new HttpError(401, 'mfa_expired');
  }
  await assertNotLimited(ip, pending.username);
  if (await getUser(pending.username)) { await kv.del(pKey); throw new HttpError(409, 'user_exists'); }
  const name = nameIn.trim().slice(0, 80);
  if (name.length < 2) throw new HttpError(400, 'bad_name');

  const step = verifyTotp(decrypt(pending.enroll), code.replace(/\s/g, ''));
  if (step === null) {
    pending.tries++;
    await kv.set(pKey, pending);
    await recordFailure(ip, pending.username);
    throw new HttpError(401, 'invalid_code', { triesLeft: PENDING_MAX_TRIES - pending.tries });
  }
  const codes = recoveryCodes();
  const user: User = {
    username: pending.username,
    name,
    passHash: pending.passHash,
    totp: pending.enroll,
    lastStep: step,
    recovery: codes.map((c) => keyedHash(normalizeRecovery(c))),
    epoch: 1,
    createdAt: iso(),
    passwordChangedAt: iso(),
  };
  await saveUser(user);
  await kv.del(pKey);
  await clearUserFailures(user.username);
  await audit('account_created', user.username, ip, 'bootstrap');
  const sid = await createSession(user, ip, ua);
  return { sid, user, codes };
}

export async function finishLogin(req: Request, code: string, ip: string, ua: string) {
  const pendingId = readCookies(req)[PENDING_COOKIE];
  if (!pendingId) throw new HttpError(401, 'mfa_expired');
  const kv = await store();
  const pKey = `pending:${sha256(pendingId)}`;
  const pending = await kv.get<Pending>(pKey);
  if (!pending || pending.enroll || pending.expires < now() || pending.tries >= PENDING_MAX_TRIES) {
    await kv.del(pKey);
    throw new HttpError(401, 'mfa_expired');
  }
  await assertNotLimited(ip, pending.username);
  const user = await getUser(pending.username);
  if (!user) throw new HttpError(401, 'mfa_expired');

  const method = await checkSecondFactor(user, code);
  if (!method) {
    pending.tries++;
    await kv.set(pKey, pending);
    await recordFailure(ip, user.username);
    await audit('login_failed', user.username, ip, 'code');
    throw new HttpError(401, 'invalid_code', { triesLeft: PENDING_MAX_TRIES - pending.tries });
  }

  await kv.del(pKey);
  await clearUserFailures(user.username);
  const sid = await createSession(user, ip, ua);
  await audit('login', user.username, ip, method === 'recovery' ? `recovery code (${user.recovery.length} left)` : undefined);
  return { sid, user, usedRecovery: method === 'recovery' };
}

// ── Sessions ─────────────────────────────────────────────────────────────
async function createSession(user: User, ip: string, ua: string) {
  const sid = token();
  const t = now();
  await (await store()).set(`session:${sha256(sid)}`, {
    username: user.username, epoch: user.epoch, created: t, seen: t, ip, ua: ua.slice(0, 160),
  } satisfies Session);
  return signSession(sid, Math.floor((t + SESSION_MAX_MS) / 1000));   // cookie value
}
export const sessionMaxAge = () => SESSION_MAX_MS / 1000;

/** Returns the signed-in user, or throws 401. Server-side sessions, so sign-out is immediate. */
export async function requireUser(req: Request) {
  const sid = verifySessionCookie((readCookies(req)[SESSION_COOKIE] || '').slice(0, 200));
  if (!sid) throw new HttpError(401, 'signed_out');
  const kv = await store();
  const key = `session:${sha256(sid)}`;
  const s = await kv.get<Session>(key);
  const t = now();
  if (!s || t - s.seen > SESSION_IDLE_MS || t - s.created > SESSION_MAX_MS) {
    if (s) await kv.del(key);
    throw new HttpError(401, 'signed_out');
  }
  const user = await getUser(s.username);
  if (!user || user.epoch !== s.epoch) {
    await kv.del(key);
    throw new HttpError(401, 'signed_out');
  }
  if (t - s.seen > TOUCH_EVERY_MS) await kv.set(key, { ...s, seen: t });
  return { user, sid };
}

export async function endSession(req: Request) {
  const sid = verifySessionCookie((readCookies(req)[SESSION_COOKIE] || '').slice(0, 200));
  if (sid) await (await store()).del(`session:${sha256(sid)}`);
}

// ── Account management (step-up: always needs a fresh code) ─────────────
async function stepUp(user: User, code: string, ip: string) {
  await assertNotLimited(ip, user.username);
  if (!(await checkSecondFactor(user, code))) {
    await recordFailure(ip, user.username);
    throw new HttpError(401, 'invalid_code');
  }
}

export async function changePassword(user: User, current: string, next: string, code: string, ip: string, ua: string) {
  await assertNotLimited(ip, user.username);
  if (!(await verifyPassword(current, user.passHash))) {
    await recordFailure(ip, user.username);
    throw new HttpError(401, 'invalid_credentials');
  }
  checkPasswordPolicy(next, user.username);
  await stepUp(user, code, ip);
  user.passHash = await hashPassword(next);
  user.passwordChangedAt = iso();
  user.epoch++;                          // sign out everywhere else
  await saveUser(user);
  await audit('password_changed', user.username, ip);
  return createSession(user, ip, ua);    // keep this browser signed in
}

export async function regenerateRecovery(user: User, code: string, ip: string) {
  await stepUp(user, code, ip);
  const codes = recoveryCodes();
  user.recovery = codes.map((c) => keyedHash(normalizeRecovery(c)));
  await saveUser(user);
  await audit('recovery_regenerated', user.username, ip);
  return codes;
}

export async function signOutEverywhere(user: User, ip: string) {
  user.epoch++;
  await saveUser(user);
  await audit('signed_out_everywhere', user.username, ip);
}

// ── New phone: move the authenticator (password + current code required) ─
// Stored under its own "phone:" prefix so the setup flow can never consume it.
interface PhoneChange { username: string; secret: string; expires: number }

export async function startPhoneChange(user: User, password: string, code: string, ip: string) {
  await assertNotLimited(ip, user.username);
  if (!(await verifyPassword(password, user.passHash))) {
    await recordFailure(ip, user.username);
    throw new HttpError(401, 'invalid_credentials');
  }
  await stepUp(user, code, ip);
  const secret = newSecret();
  const changeId = token();
  await (await store()).set(`phone:${sha256(changeId)}`, {
    username: user.username, secret: encrypt(secret), expires: now() + ENROLL_TTL_MS,
  } satisfies PhoneChange);
  return { changeId, secret, uri: otpauthUri(secret, user.username) };
}

export async function finishPhoneChange(user: User, changeId: string, code: string, ip: string) {
  await assertNotLimited(ip, user.username);
  const kv = await store();
  const key = `phone:${sha256(changeId)}`;
  const c = await kv.get<PhoneChange>(key);
  if (!c || c.expires < now() || c.username !== user.username) throw new HttpError(401, 'setup_expired');
  const step = verifyTotp(decrypt(c.secret), code.replace(/\s/g, ''));
  if (step === null) { await recordFailure(ip, user.username); throw new HttpError(401, 'invalid_code'); }
  user.totp = c.secret;
  user.lastStep = step;
  await saveUser(user);
  await kv.del(key);
  await audit('authenticator_changed', user.username, ip);
}

// ── First-time setup / reset (only while SETUP_CODE is set) ─────────────
export const setupEnabled = () => env.setupCode.length >= 16;

export async function startSetup(body: { setupCode: string; username: string; name: string; password: string }, ip: string) {
  if (!setupEnabled()) throw new HttpError(404, 'setup_disabled');
  await assertNotLimited(ip);
  if (!safeEqual(body.setupCode, env.setupCode)) {
    await recordFailure(ip);
    await audit('setup_failed', '-', ip);
    throw new HttpError(401, 'invalid_setup_code');
  }
  const username = body.username.trim().toLowerCase();
  if (!validUsername(username)) throw new HttpError(400, 'bad_username');
  // Resetting an existing account needs an extra, explicit switch (see admin/README.md).
  if ((await getUser(username)) && process.env.SETUP_ALLOW_RESET !== '1') throw new HttpError(409, 'user_exists');
  const name = body.name.trim().slice(0, 80);
  if (name.length < 2) throw new HttpError(400, 'bad_name');
  checkPasswordPolicy(body.password, username);

  const secret = newSecret();
  const enrollId = token();
  await (await store()).set(`enroll:${sha256(enrollId)}`, {
    username, name, passHash: await hashPassword(body.password), secret: encrypt(secret), expires: now() + ENROLL_TTL_MS,
  } satisfies Enroll);
  return { enrollId, secret, uri: otpauthUri(secret, username) };
}

export async function finishSetup(enrollId: string, code: string, ip: string) {
  if (!setupEnabled()) throw new HttpError(404, 'setup_disabled');
  await assertNotLimited(ip);
  const kv = await store();
  const key = `enroll:${sha256(enrollId)}`;
  const e = await kv.get<Enroll>(key);
  if (!e || e.expires < now()) throw new HttpError(401, 'setup_expired');
  const step = verifyTotp(decrypt(e.secret), code.replace(/\s/g, ''));
  if (step === null) { await recordFailure(ip); throw new HttpError(401, 'invalid_code'); }

  const existing = await getUser(e.username);
  if (existing && process.env.SETUP_ALLOW_RESET !== '1') throw new HttpError(409, 'user_exists');
  const codes = recoveryCodes();
  await saveUser({
    username: e.username,
    name: e.name,
    passHash: e.passHash,
    totp: e.secret,
    lastStep: Math.max(step, currentStep() - 1),
    recovery: codes.map((c) => keyedHash(normalizeRecovery(c))),
    epoch: (existing?.epoch ?? 0) + 1,      // a reset signs out the old account's sessions
    createdAt: existing?.createdAt ?? iso(),
    passwordChangedAt: iso(),
  });
  await kv.del(key);
  await clearUserFailures(e.username);
  await audit(existing ? 'account_reset' : 'account_created', e.username, ip);
  return { codes, username: e.username };
}
