// Admin portal API. One function, routed by path.
import { assertConfigured } from '../../server/env.mts';
import {
  HttpError, json, readJson, assertSameOrigin, str, cookie, clearCookie, SESSION_COOKIE, PENDING_COOKIE,
} from '../../server/http.mts';
import {
  startLogin, finishLogin, finishBootstrap, requireUser, endSession, sessionMaxAge, changePassword, regenerateRecovery,
  signOutEverywhere, startPhoneChange, finishPhoneChange, setupEnabled, startSetup, finishSetup, audit, readAudit,
} from '../../server/auth.mts';
import { validate, toClient, changedPaths, serialize } from '../../server/content.mts';
import { load, publish, isLive } from '../../server/repo.mts';
import { store } from '../../server/store.mts';
import { qrSvg } from '../../server/qr.mts';

interface Ctx { ip?: string }
type Handler = (req: Request, ip: string, ua: string) => Promise<Response>;

const routes: Record<string, Handler> = {
  'GET /api/session': async (req) => {
    try {
      const { user } = await requireUser(req);
      return json({ signedIn: true, user: { username: user.username, name: user.name, recoveryLeft: user.recovery.length } });
    } catch {
      return json({ signedIn: false, setup: setupEnabled() });
    }
  },

  'POST /api/login': async (req, ip) => {
    const b = await readJson(req);
    const { pendingId, maxAge, enroll } = await startLogin(str(b.username, 64), str(b.password, 256), ip);
    const next = enroll
      ? { next: 'enroll', secret: enroll.secret, qr: `data:image/svg+xml;base64,${Buffer.from(qrSvg(enroll.uri)).toString('base64')}` }
      : { next: 'code' };
    return json(next, 200, [cookie(PENDING_COOKIE, pendingId, maxAge)]);
  },

  'POST /api/login/code': async (req, ip, ua) => {
    const b = await readJson(req);
    const { sid, user, usedRecovery } = await finishLogin(req, str(b.code, 20), ip, ua);
    return json(
      { signedIn: true, usedRecovery, user: { username: user.username, name: user.name, recoveryLeft: user.recovery.length } },
      200,
      [clearCookie(PENDING_COOKIE), cookie(SESSION_COOKIE, sid, sessionMaxAge())],
    );
  },

  'POST /api/login/enroll': async (req, ip, ua) => {
    const b = await readJson(req);
    const { sid, user, codes } = await finishBootstrap(req, str(b.code, 20), str(b.name, 100), ip, ua);
    return json(
      { signedIn: true, codes, user: { username: user.username, name: user.name, recoveryLeft: user.recovery.length } },
      200,
      [clearCookie(PENDING_COOKIE), cookie(SESSION_COOKIE, sid, sessionMaxAge())],
    );
  },

  'POST /api/logout': async (req, ip) => {
    try { const { user } = await requireUser(req); await audit('logout', user.username, ip); } catch { /* already out */ }
    await endSession(req);
    return json({ ok: true }, 200, [clearCookie(SESSION_COOKIE)]);
  },

  'GET /api/content': async (req) => {
    await requireUser(req);
    const snap = await load();
    const last = await (await store()).get<{ sha: string; at: string; by: string }>('lastPublish');
    return json({ ...toClient(snap.practice, snap.settings), versions: snap.versions, lastPublish: last });
  },

  'POST /api/content': async (req, ip) => {
    const { user } = await requireUser(req);
    const b = await readJson(req);
    const versions = (b.versions || {}) as Record<'practice' | 'settings', string>;
    const current = await load();
    const next = validate(b, current);

    const files: { practice?: string; settings?: string } = {};
    const changed = [
      ...changedPaths(current.practice, next.practice, 'practice'),
      ...changedPaths(current.settings, next.settings, 'settings'),
    ];
    if (changed.some((p) => p.startsWith('practice'))) files.practice = serialize(next.practice);
    if (changed.some((p) => p.startsWith('settings'))) files.settings = serialize(next.settings);
    if (!changed.length) return json({ ok: true, changed: [] });

    const summary = changed.slice(0, 12).join(', ') + (changed.length > 12 ? ` (+${changed.length - 12})` : '');
    const sha = await publish(files, versions, `Portal: actualizar contenido (${user.name})\n\nCampos: ${summary}`);
    const record = { sha, at: new Date().toISOString(), by: user.name };
    await (await store()).set('lastPublish', record);
    await audit('published', user.username, ip, summary);
    return json({ ok: true, changed, lastPublish: record });
  },

  'GET /api/status': async (req) => {
    await requireUser(req);
    const last = await (await store()).get<{ sha: string }>('lastPublish');
    return json({ live: last ? await isLive(last.sha) : true });
  },

  'GET /api/activity': async (req) => {
    await requireUser(req);
    return json({ entries: (await readAudit()).slice(0, 100) });
  },

  'POST /api/account/password': async (req, ip, ua) => {
    const { user } = await requireUser(req);
    const b = await readJson(req);
    const sid = await changePassword(user, str(b.current, 256), str(b.next, 256), str(b.code, 20), ip, ua);
    return json({ ok: true }, 200, [cookie(SESSION_COOKIE, sid, sessionMaxAge())]);
  },

  'POST /api/account/recovery': async (req, ip) => {
    const { user } = await requireUser(req);
    const b = await readJson(req);
    return json({ codes: await regenerateRecovery(user, str(b.code, 20), ip) });
  },

  'POST /api/account/phone/start': async (req, ip) => {
    const { user } = await requireUser(req);
    const b = await readJson(req);
    const r = await startPhoneChange(user, str(b.password, 256), str(b.code, 20), ip);
    return json({ changeId: r.changeId, secret: r.secret, qr: `data:image/svg+xml;base64,${Buffer.from(qrSvg(r.uri)).toString('base64')}` });
  },

  'POST /api/account/phone/finish': async (req, ip) => {
    const { user } = await requireUser(req);
    const b = await readJson(req);
    await finishPhoneChange(user, str(b.changeId, 100), str(b.code, 20), ip);
    return json({ ok: true });
  },

  'POST /api/account/signout-all': async (req, ip) => {
    const { user } = await requireUser(req);
    await signOutEverywhere(user, ip);
    return json({ ok: true }, 200, [clearCookie(SESSION_COOKIE)]);
  },

  'POST /api/setup/start': async (req, ip) => {
    const b = await readJson(req);
    const r = await startSetup(
      { setupCode: str(b.setupCode, 200), username: str(b.username, 64), name: str(b.name, 100), password: str(b.password, 256) },
      ip,
    );
    return json({ enrollId: r.enrollId, secret: r.secret, qr: `data:image/svg+xml;base64,${Buffer.from(qrSvg(r.uri)).toString('base64')}` });
  },

  'POST /api/setup/finish': async (req, ip) => {
    const b = await readJson(req);
    return json(await finishSetup(str(b.enrollId, 100), str(b.code, 20), ip));
  },
};

export default async (req: Request, context: Ctx) => {
  const ip = context?.ip || req.headers.get('x-nf-client-connection-ip') || 'unknown';
  const ua = req.headers.get('user-agent') || '';
  try {
    assertConfigured();
    assertSameOrigin(req);
    const route = routes[`${req.method} ${new URL(req.url).pathname.replace(/\/+$/, '')}`];
    if (!route) throw new HttpError(404, 'not_found');
    return await route(req, ip, ua);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.code, ...e.extra }, e.status);
    console.error('admin api error:', e instanceof Error ? e.message : 'unknown');
    return json({ error: 'server_error' }, 500);
  }
};

export const config = { path: '/api/*' };

