// Portal administrativo · shared core: DOM helper, API client, messages, state.
// Plain ES modules, no dependencies. All DOM is built with h(); user data is
// only ever set as text, never as HTML.

const SITE = 'https://draninavega.com';
const app = document.getElementById('app');

// ── DOM helper ──────────────────────────────────────────────────────────
function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}
const svg = (markup) => {
  // Static, developer-authored SVG only (never data).
  const t = document.createElement('template');
  t.innerHTML = markup;
  return t.content.firstElementChild;
};
const MOTIF = '<svg aria-hidden="true" viewBox="0 0 120 160"><g fill="none" stroke="#5E7A3C" stroke-width="1.4" stroke-linecap="round"><path d="M60 156V70"/><path d="M60 114c-20-6-30-18-32-32 16 2 28 14 32 32z"/><path d="M60 98c18-6 30-18 32-32-16 2-28 14-32 32z"/></g><g fill="none" stroke="#16332F" stroke-width="1.4" stroke-linecap="round"><circle cx="60" cy="50" r="11"/><path d="M60 27v-9M60 82v-9M37 50h-9M92 50h-9M44 34l-6-6M82 72l-6-6M76 34l6-6M38 72l6-6"/></g></svg>';

// ── API ─────────────────────────────────────────────────────────────────
class ApiError extends Error {
  constructor(status, data) { super(data?.error || 'error'); this.status = status; this.data = data || {}; }
}
async function api(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body ? { 'content-type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, { error: 'network' });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && data.error === 'signed_out' && state.user) { signedOut(); }
    throw new ApiError(res.status, data);
  }
  return data;
}

const MESSAGES = {
  es: {
    network: 'No hay conexión. Verifique el internet e intente de nuevo.',
    invalid_credentials: 'Usuario o contraseña incorrectos.',
    invalid_code: 'Código incorrecto. Use el código que aparece ahora en su aplicación.',
    mfa_expired: 'Pasó demasiado tiempo. Escriba su usuario y contraseña de nuevo.',
    too_many: 'Demasiados intentos. Espere unos minutos e intente de nuevo.',
    locked: 'Por seguridad, la cuenta está bloqueada temporalmente. Intente más tarde.',
    signed_out: 'Su sesión terminó. Entre de nuevo.',
    signed_out_all: 'Se cerraron todas las sesiones.',
    conflict: 'El contenido cambió desde que abrió esta página (quizás en otra pestaña). Recargue para ver la versión más reciente.',
    invalid_content: 'Revise los campos marcados.',
    password_short: 'La contraseña debe tener al menos 12 caracteres.',
    password_long: 'La contraseña es demasiado larga.',
    password_weak: 'Esa contraseña es muy fácil de adivinar. Use una frase más larga.',
    invalid_setup_code: 'Código de configuración incorrecto.',
    setup_expired: 'La configuración expiró. Empiece de nuevo.',
    setup_disabled: 'La configuración no está disponible.',
    bad_username: 'Usuario: 3–32 letras minúsculas, números, punto, guion o guion bajo.',
    bad_name: 'Escriba su nombre.',
    user_exists: 'Ese usuario ya existe. Para restablecerlo, Angel debe activar el restablecimiento en Netlify.',
    github_error: 'No se pudo publicar en este momento. Intente de nuevo en unos minutos.',
    server_error: 'Ocurrió un error. Intente de nuevo.',
    tries_left: 'Intentos restantes:',
  },
  en: {
    network: 'No connection. Check your internet and try again.',
    invalid_credentials: 'Incorrect username or password.',
    invalid_code: 'Incorrect code. Use the code your app is showing right now.',
    mfa_expired: 'That took too long. Enter your username and password again.',
    too_many: 'Too many attempts. Wait a few minutes and try again.',
    locked: 'For your security, the account is temporarily locked. Try again later.',
    signed_out: 'Your session ended. Please sign in again.',
    signed_out_all: 'All sessions were signed out.',
    conflict: 'The content changed since you opened this page (maybe in another tab). Reload to see the latest version.',
    invalid_content: 'Check the highlighted fields.',
    password_short: 'The password must be at least 12 characters.',
    password_long: 'The password is too long.',
    password_weak: 'That password is too easy to guess. Use a longer phrase.',
    invalid_setup_code: 'Incorrect setup code.',
    setup_expired: 'Setup expired. Please start again.',
    setup_disabled: 'Setup is not available.',
    bad_username: 'Username: 3–32 lowercase letters, numbers, dot, dash or underscore.',
    bad_name: 'Enter your name.',
    user_exists: 'That user already exists. To reset it, Angel must enable resets in Netlify.',
    github_error: "Couldn't publish right now. Try again in a few minutes.",
    server_error: 'Something went wrong. Please try again.',
    tries_left: 'Attempts left:',
  },
};
const msg = (e, lang = 'es') => {
  const M = MESSAGES[lang];
  const code = typeof e === 'string' ? e : e?.data?.error || e?.message;
  let m = M[code] || M.server_error;
  if ((code === 'too_many' || code === 'locked') && e?.data?.retryAfter) m += ` (≈ ${Math.ceil(e.data.retryAfter / 60)} min)`;
  if (code === 'invalid_code' && e?.data?.triesLeft != null) m += ` ${M.tries_left} ${e.data.triesLeft}.`;
  return m;
};

// ── State ───────────────────────────────────────────────────────────────
const state = {
  user: null,
  setup: false,
  original: null,   // content as loaded
  draft: null,      // content being edited
  version: null,    // content version the draft is based on
  lastPublish: null,
  publishing: false,
  notice: null,
  authNotice: null, // message key shown on the login screen
};
const clone = (o) => JSON.parse(JSON.stringify(o));
const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
function setPath(o, p, v) {
  const ks = p.split('.');
  const last = ks.pop();
  ks.reduce((a, k) => a[k], o)[last] = v;
}
const dirty = () => state.draft && JSON.stringify(state.draft) !== JSON.stringify(state.original);

function signedOut() {
  // Keep any unpublished draft in memory so signing back in doesn't lose it.
  state.user = null;
  state.authNotice = 'signed_out';
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  hooks.render();
}


// ── Shared bits ─────────────────────────────────────────────────────────
function errorBox(text) { return h('div', { class: 'alert', role: 'alert' }, text); }
function busy(btn, on, label) {
  btn.disabled = on;
  if (label) btn.textContent = on ? label : btn.dataset.label;
}
function button(cls, label, onclick, attrs = {}) {
  return h('button', { class: `btn ${cls}`, type: attrs.type || 'button', onclick, 'data-label': label, ...attrs }, label);
}
function field({ label, hint, input, error }) {
  const id = input.id || (input.id = `f${Math.random().toString(36).slice(2, 9)}`);
  const hintId = hint ? `${id}-h` : null;
  if (hintId) input.setAttribute('aria-describedby', hintId);
  return h('div', { class: 'field' },
    h('label', { class: 'label', for: id }, label),
    hint && h('p', { class: 'hint', id: hintId }, hint),
    input,
    error);
}


/** Filled in by main.js; lets every module re-render without import cycles. */
const hooks = { render: () => {} };
const route = () => (location.hash.replace(/^#\/?/, '') || 'contenido').split('?')[0];

export {
  SITE, app, h, svg, MOTIF, ApiError, api, MESSAGES, msg, state, clone, getPath, setPath, dirty,
  signedOut, errorBox, busy, button, field, hooks, route,
};
