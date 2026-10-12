// Admin portal API. One function, routed by path.
import { assertConfigured, env } from '../../server/env.mts';
import {
  HttpError, json, readJson, assertSameOrigin, str, cookie, clearCookie, SESSION_COOKIE, PENDING_COOKIE,
} from '../../server/http.mts';
import {
  startLogin, finishLogin, finishBootstrap, requireUser, endSession, sessionMaxAge, changePassword, regenerateRecovery,
  signOutEverywhere, startPhoneChange, finishPhoneChange, setupEnabled, startSetup, finishSetup, audit, readAudit,
} from '../../server/auth.mts';
import { validate, toClient, changedPaths } from '../../server/content.mts';
import { loadContent, saveContent, requestPublicBuild, deployedVersion, type Content } from '../../server/content-store.mts';
import { safeEqual } from '../../server/crypto.mts';
import { qrSvg } from '../../server/qr.mts';

interface Ctx { ip?: string }
type Handler = (req: Request, ip: string, ua: string) => Promise<Response>;

const lastPublish = (c: Content) => (c.updatedAt ? { at: c.updatedAt, by: c.updatedBy } : null);

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
    const c = await loadContent();
    return json({ ...toClient(c.practice, c.settings), version: c.version, lastPublish: lastPublish(c) });
  },

  'POST /api/content': async (req, ip) => {
    const { user } = await requireUser(req);
    const b = await readJson(req);
    const current = await loadContent();
    const next = validate(b, current);
    const changed = [
      ...changedPaths(current.practice, next.practice, 'practice'),
      ...changedPaths(current.settings, next.settings, 'settings'),
    ];
    if (!changed.length) return json({ ok: true, changed: [] });

    const saved = await saveContent(next, Number(b.version), user.name);
    const buildRequested = await requestPublicBuild();
    const summary = changed.slice(0, 12).join(', ') + (changed.length > 12 ? ` (+${changed.length - 12})` : '');
    await audit('published', user.username, ip, summary);
    return json({ ok: true, changed, version: saved.version, lastPublish: lastPublish(saved), buildRequested });
  },

  'GET /api/status': async (req) => {
    await requireUser(req);
    const c = await loadContent();
    const deployed = await deployedVersion();
    // deployed: the content version the public site was built with (0 = built from the repo, not the portal).
    return json({
      live: env.local ? true : deployed === null ? null : deployed >= c.version,
      hook: env.local || !!env.buildHook,
      deployed: env.local ? c.version : deployed,
      version: c.version,
    });
  },

  // Read by the public site's build only. Everything returned here is public anyway.
  'GET /api/export': async (req) => {
    const want = env.exportToken;
    const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (want.length < 32) throw new HttpError(503, 'export_not_configured');
    if (!safeEqual(got, want)) throw new HttpError(401, 'unauthorized');
    const c = await loadContent();
    return json({ practice: c.practice, settings: c.settings, version: c.version, updatedAt: c.updatedAt });
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
    console.error('admin api error:', e instanceof Error ? `${e.name}: ${e.message}\n${e.stack}` : 'unknown');
    // Only the error's class/code (e.g. BlobsInternalError), never its message or data,
    // so problems can be diagnosed from outside without leaking anything.
    const err = e as { name?: string; code?: string };
    const kind = [err?.name, err?.code].filter((x) => typeof x === 'string' && /^[\w.-]{1,60}$/.test(x)).join('/');
    return json({ error: 'server_error', kind: kind || 'unknown' }, 500);
  }
};

export const config = { path: '/api/*' };

