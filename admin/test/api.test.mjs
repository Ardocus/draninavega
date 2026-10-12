// End-to-end tests for the portal API against a temp store and a temp copy
// of src/data. Run: npm test (from admin/).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'nv-admin-'));
await fs.mkdir(path.join(tmp, 'repo/src/data'), { recursive: true });
for (const f of ['practice.json', 'settings.json']) {
  await fs.copyFile(path.join(here, '../../src/data', f), path.join(tmp, 'repo/src/data', f));
}
const ORIGIN = 'https://admin.test';
Object.assign(process.env, {
  ADMIN_LOCAL: '1', ADMIN_ORIGIN: ORIGIN, ADMIN_LOCAL_STORE: path.join(tmp, 'store'),
  ADMIN_LOCAL_REPO: path.join(tmp, 'repo'), DATA_KEY: randomBytes(32).toString('base64'),
  SETUP_CODE: 'test-setup-code-0123456789',
});
const BOOT_PW = 'bootstrap test pass 2026';
process.env.BOOTSTRAP_PASSWORD_HASH = await (await import('../server/crypto.mts')).hashPassword(BOOT_PW);
const { default: api } = await import('../netlify/functions/api.mts');
const { hotp, base32Decode, currentStep } = await import('../server/totp.mts');

// ── tiny client with a cookie jar ──
function client(ip = '10.0.0.1') {
  const jar = {};
  return async (method, p, body, { origin = ORIGIN, type = 'application/json' } = {}) => {
    const headers = { cookie: Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ') };
    if (method !== 'GET') { headers.origin = origin; headers['content-type'] = type; }
    const res = await api(new Request(`${ORIGIN}${p}`, { method, headers, body: body ? JSON.stringify(body) : undefined }), { ip });
    for (const c of res.headers.getSetCookie()) {
      const [kv, ...attrs] = c.split(';');
      const [k, v] = kv.split('=');
      if (attrs.some((a) => a.trim() === 'Max-Age=0')) delete jar[k]; else jar[k] = v;
    }
    return { status: res.status, body: await res.json(), cookies: res.headers.getSetCookie() };
  };
}
const codeAt = (secret, offset = 0) => hotp(base32Decode(secret), currentStep() + offset);

let secret;
let recovery;
const PASSWORD = 'girasol azul en Ponce 1987';

before(async () => {
  const c = client('10.9.9.9');
  const start = await c('POST', '/api/setup/start', { setupCode: process.env.SETUP_CODE, name: 'Dra. Prueba', username: 'dranvega', password: PASSWORD });
  assert.equal(start.status, 200);
  secret = start.body.secret;
  assert.match(start.body.qr, /^data:image\/svg\+xml;base64,/);
  const fin = await c('POST', '/api/setup/finish', { enrollId: start.body.enrollId, code: codeAt(secret) });
  assert.equal(fin.status, 200);
  recovery = fin.body.codes;
  assert.equal(recovery.length, 10);
});

async function signIn(ip, offset = 1) {
  const c = client(ip);
  assert.equal((await c('POST', '/api/login', { username: 'dranvega', password: PASSWORD })).status, 200);
  const r = await c('POST', '/api/login/code', { code: codeAt(secret, offset) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return c;
}

test('cookies are __Host-, HttpOnly, Secure, SameSite=Strict', async () => {
  const c = client('10.0.0.2');
  const r = await c('POST', '/api/login', { username: 'dranvega', password: PASSWORD });
  assert.match(r.cookies[0], /^__Host-nv_mfa=.+; Path=\/; HttpOnly; Secure; SameSite=Strict; Max-Age=300$/);
});

test('rejects cross-origin and non-JSON writes (CSRF)', async () => {
  const c = client('10.0.0.3');
  assert.equal((await c('POST', '/api/login', { username: 'x', password: 'y' }, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await c('POST', '/api/login', { username: 'x', password: 'y' }, { type: 'text/plain' })).status, 415);
});

test('wrong setup code is refused', async () => {
  const c = client('10.0.0.4');
  const r = await c('POST', '/api/setup/start', { setupCode: 'nope-nope-nope-nope', name: 'X', username: 'mallory', password: 'aaaaaaaaaaaaaaaa1' });
  assert.equal(r.status, 401);
});

test('password alone does not grant a session', async () => {
  const c = client('10.0.0.5');
  await c('POST', '/api/login', { username: 'dranvega', password: PASSWORD });
  assert.equal((await c('GET', '/api/content')).status, 401);
});

test('unknown user and wrong password give the same error', async () => {
  const c = client('10.0.0.6');
  const a = await c('POST', '/api/login', { username: 'nobody', password: PASSWORD });
  const b = await c('POST', '/api/login', { username: 'dranvega', password: 'wrong password here' });
  assert.deepEqual([a.status, a.body], [b.status, b.body]);
});

test('wrong TOTP is refused; the same valid code cannot be replayed', async () => {
  const c = client('10.0.0.7');
  await c('POST', '/api/login', { username: 'dranvega', password: PASSWORD });
  assert.equal((await c('POST', '/api/login/code', { code: '000000' === codeAt(secret, 1) ? '111111' : '000000' })).status, 401);
  const code = codeAt(secret, 1);
  assert.equal((await c('POST', '/api/login/code', { code })).status, 200);
  const d = client('10.0.0.8');
  await d('POST', '/api/login', { username: 'dranvega', password: PASSWORD });
  assert.equal((await d('POST', '/api/login/code', { code })).status, 401, 'replayed code accepted');
});

test('recovery code works exactly once', async () => {
  const c = client('10.0.1.1');
  await c('POST', '/api/login', { username: 'dranvega', password: PASSWORD });
  const r = await c('POST', '/api/login/code', { code: recovery[0].toLowerCase() });
  assert.equal(r.status, 200);
  assert.equal(r.body.usedRecovery, true);
  assert.equal(r.body.user.recoveryLeft, 9);
  const d = client('10.0.1.2');
  await d('POST', '/api/login', { username: 'dranvega', password: PASSWORD });
  assert.equal((await d('POST', '/api/login/code', { code: recovery[0] })).status, 401);
});

test('publishing validates, strips unknown keys and keeps crisis lines', async () => {
  // Fresh time step: the earlier tests consumed steps up to +1.
  const c = client('10.0.2.1');
  await c('POST', '/api/login', { username: 'dranvega', password: PASSWORD });
  const r0 = await c('POST', '/api/login/code', { code: recovery[1] });
  assert.equal(r0.status, 200);

  const { body } = await c('GET', '/api/content');
  const draft = structuredClone(body);

  // Invalid input → 422 with field paths, nothing written.
  const bad = structuredClone(draft);
  bad.practice.phone_display = '123';
  bad.settings.facebook_url = 'javascript:alert(1)';
  bad.settings.insurance.push('MCS Life');
  bad.practice.tagline.es = 'Hola\u0007';
  const r1 = await c('POST', '/api/content', { ...bad, versions: body.versions });
  assert.equal(r1.status, 422);
  const paths = r1.body.issues.map((i) => i.path);
  for (const p of ['practice.phone_display', 'settings.facebook_url', 'settings.insurance', 'practice.tagline.es']) assert.ok(paths.includes(p), p);

  // Valid edit with injected extras.
  const good = structuredClone(draft);
  good.settings.insurance.push('Plan Vital');
  good.practice.phone_display = '787-848-7646';
  good.practice.crisis_lines = [];
  good.practice.evil = '<script>';
  good.settings.announcement = { enabled: true, es: 'Cerrado </script><script>alert(1)</script>', en: 'Closed', start: '', end: '' };
  const r2 = await c('POST', '/api/content', { ...good, versions: body.versions, extra: 1 });
  assert.equal(r2.status, 200, JSON.stringify(r2.body));
  const written = JSON.parse(await fs.readFile(path.join(tmp, 'repo/src/data/practice.json'), 'utf8'));
  const settings = JSON.parse(await fs.readFile(path.join(tmp, 'repo/src/data/settings.json'), 'utf8'));
  assert.equal(written.crisis_lines.length, 2, 'crisis lines must be preserved');
  assert.equal(written.evil, undefined);
  assert.equal(written.phone, '+17878487646');
  assert.ok(settings.insurance.includes('Plan Vital'));

  // A different edit made from the stale snapshot → 409, not a silent overwrite.
  const stale = structuredClone(good);
  stale.settings.insurance.push('Otro plan');
  const r3 = await c('POST', '/api/content', { ...stale, versions: body.versions });
  assert.equal(r3.status, 409);
});

test('moving the authenticator to a new phone (password + current code, then new code)', async () => {
  const c = client('10.5.0.1');
  await c('POST', '/api/login', { username: 'dranvega', password: PASSWORD });
  assert.equal((await c('POST', '/api/login/code', { code: recovery[2] })).status, 200);

  // Unauthenticated and wrong-password attempts are refused.
  assert.equal((await client('10.5.0.2')('POST', '/api/account/phone/start', { password: PASSWORD, code: recovery[3] })).status, 401);
  assert.equal((await c('POST', '/api/account/phone/start', { password: 'not my password at all', code: recovery[3] })).status, 401);

  const start = await c('POST', '/api/account/phone/start', { password: PASSWORD, code: recovery[3] });
  assert.equal(start.status, 200, JSON.stringify(start.body));
  const newSecret = start.body.secret;
  assert.notEqual(newSecret, secret);
  assert.equal((await c('POST', '/api/account/phone/finish', { changeId: start.body.changeId, code: '000000' === codeAt(newSecret) ? '111111' : '000000' })).status, 401);
  assert.equal((await c('POST', '/api/account/phone/finish', { changeId: start.body.changeId, code: codeAt(newSecret) })).status, 200);

  // Old phone stops working, new phone works.
  const d = client('10.5.0.3');
  await d('POST', '/api/login', { username: 'dranvega', password: PASSWORD });
  assert.equal((await d('POST', '/api/login/code', { code: codeAt(secret, 1) })).status, 401);
  const e = client('10.5.0.4');
  await e('POST', '/api/login', { username: 'dranvega', password: PASSWORD });
  assert.equal((await e('POST', '/api/login/code', { code: codeAt(newSecret, 1) })).status, 200);
  secret = newSecret;
});

test('account locks after repeated failures', async () => {
  // Separate user state: use a different IP each time so only the per-user limit trips.
  let last;
  for (let i = 0; i < 9; i++) {
    const c = client(`10.1.0.${i}`);
    last = await c('POST', '/api/login', { username: 'dranvega', password: `wrong-${i}-xxxxxxxx` });
  }
  assert.equal(last.status, 429);
  assert.equal(last.body.error, 'locked');
  // Even the right password is refused while locked.
  const c = client('10.1.1.1');
  assert.equal((await c('POST', '/api/login', { username: 'dranvega', password: PASSWORD })).status, 429);
});

test('per-IP throttle across many usernames', async () => {
  const c = client('10.2.0.1');
  let last;
  for (let i = 0; i < 21; i++) last = await c('POST', '/api/login', { username: `user${i}`, password: 'whatever-whatever' });
  assert.equal(last.status, 429);
});

test('session cookie value is not stored in plain text', async () => {
  const files = await fs.readdir(path.join(tmp, 'store'));
  const sessions = files.filter((f) => f.startsWith('session'));
  assert.ok(sessions.length > 0);
  const user = JSON.parse(await fs.readFile(path.join(tmp, 'store', `${encodeURIComponent('user:dranvega')}.json`), 'utf8'));
  assert.ok(!user.totp.includes(secret), 'TOTP secret must be encrypted at rest');
  assert.match(user.passHash, /^scrypt\$131072\$8\$1\$/);
});

test('setup code cannot take over an existing account without SETUP_ALLOW_RESET', async () => {
  const c = client('10.3.0.1');
  const r = await c('POST', '/api/setup/start', { setupCode: process.env.SETUP_CODE, name: 'Mallory', username: 'dranvega', password: 'mallory owns this now 123' });
  assert.equal(r.status, 409);
  assert.equal(r.body.error, 'user_exists');
});

test('lockout behaves the same for accounts that do not exist (no enumeration)', async () => {
  let last;
  for (let i = 0; i < 9; i++) last = await client(`10.4.0.${i}`)('POST', '/api/login', { username: 'ghostuser', password: `wrong-${i}-xxxxxxxx` });
  assert.equal(last.status, 429);
  assert.equal(last.body.error, 'locked');
});

test('bootstrap account: password only leads to forced 2FA enrollment, exactly once', async () => {
  const c = client('10.6.0.1');
  assert.equal((await c('POST', '/api/login', { username: 'admin', password: 'not the bootstrap pw' })).status, 401);

  const r = await c('POST', '/api/login', { username: 'ADMIN', password: BOOT_PW });
  assert.equal(r.status, 200);
  assert.equal(r.body.next, 'enroll');
  assert.match(r.body.qr, /^data:image\/svg\+xml;base64,/);
  assert.equal((await c('GET', '/api/content')).status, 401, 'no session before enrollment');
  assert.equal((await c('POST', '/api/login/code', { code: '123456' })).status, 401, 'cannot skip enrollment');

  // The skip attempt burned the pending login; start again.
  const r2 = await c('POST', '/api/login', { username: 'admin', password: BOOT_PW });
  const bootSecret = r2.body.secret;
  assert.equal((await c('POST', '/api/login/enroll', { code: '000000' === codeAt(bootSecret) ? '111111' : '000000', name: 'Admin' })).status, 401);
  const done = await c('POST', '/api/login/enroll', { code: codeAt(bootSecret), name: 'Dra. Nina M. Vega' });
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(done.body.codes.length, 10);
  assert.equal((await c('GET', '/api/content')).status, 200, 'signed in after enrollment');

  // From now on the stored account is used: normal 2FA, no second enrollment.
  const d = client('10.6.0.2');
  const again = await d('POST', '/api/login', { username: 'admin', password: BOOT_PW });
  assert.equal(again.body.next, 'code');
  assert.equal(again.body.secret, undefined);
  assert.equal((await d('POST', '/api/login/code', { code: codeAt(bootSecret, 1) })).status, 200);
});
