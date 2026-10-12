// Portal administrativo · entry point: session check, router, keep-alive.
// The editor itself (/app/portal.js) is only fetched after sign-in; the edge
// gate refuses to serve it without a valid signed session cookie.
import { api, state, dirty, hooks, route } from './core.js';
import { renderLogin, renderSetup } from './auth.js';

let portal = null;

async function render() {
  const r = route();
  if (!state.user) {
    if (r === 'configurar' && state.setup) return renderSetup();
    return renderLogin();
  }
  try {
    portal ??= await import('/app/portal.js');
  } catch {
    state.user = null;
    state.authNotice = 'signed_out';
    return renderLogin();
  }
  if (r === 'seguridad') return portal.renderShell('seguridad', portal.renderSecurity);
  if (r === 'actividad') return portal.renderShell('actividad', portal.renderActivity);
  return portal.renderShell('contenido', portal.renderEditor);
}
hooks.render = render;

window.addEventListener('hashchange', render);
window.addEventListener('beforeunload', (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });

// Keep the session alive while she's actively typing (server idle timeout is 30 min).
let lastActivity = Date.now();
['keydown', 'input', 'pointerdown'].forEach((t) => document.addEventListener(t, () => { lastActivity = Date.now(); }, { passive: true }));
setInterval(() => {
  if (state.user && Date.now() - lastActivity < 5 * 60_000) api('GET', '/api/session').catch(() => {});
}, 5 * 60_000);

async function boot() {
  try {
    const s = await api('GET', '/api/session');
    state.user = s.signedIn ? s.user : null;
    state.setup = !!s.setup;
  } catch { state.user = null; }
  render();
}
boot();
