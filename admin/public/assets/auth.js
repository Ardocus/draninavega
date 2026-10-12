import { app, h, svg, MOTIF, api, msg, state, errorBox, busy, button, field, hooks } from './core.js';

// ── Login (bilingual: ES / EN toggle) ───────────────────────────────────
const AUTH = {
  es: {
    switchTo: 'English', switchLabel: 'Switch to English',
    portal: 'Portal administrativo',
    intro: 'Entre para actualizar la información de su página.',
    user: 'Usuario', password: 'Contraseña', continue: 'Continuar', verifying: 'Verificando…', preparing: 'Preparando…',
    newAccount: 'Configurar una cuenta nueva',
    twoStep: 'Verificación en dos pasos', confirmTitle: 'Confirme que es usted',
    code6: 'Código de 6 dígitos',
    codeHint: 'Abra su aplicación de autenticación (por ejemplo, Google Authenticator) y escriba el código de «draninavega.com».',
    enter: 'Entrar', useRecovery: 'Usar un código de recuperación', useApp: 'Usar el código de la aplicación',
    recoveryLabel: 'Código de recuperación',
    recoveryHint: 'Use uno de los códigos que guardó al configurar la cuenta (formato XXXX-XXXX). Cada uno sirve una sola vez.',
    back: '← Volver',
    usedRecovery: (n) => `Usó un código de recuperación. Le quedan ${n}. Puede crear códigos nuevos en Seguridad.`,
    setupStep: (n) => `Configuración · Paso ${n} de 3`,
    createTitle: 'Cree su cuenta',
    setupIntro: 'Necesitará el código de configuración que le dio Angel y su teléfono con una aplicación de autenticación.',
    setupCode: 'Código de configuración', yourName: 'Su nombre', nameHint: 'Aparece en el registro de actividad.',
    usernameHint: 'Minúsculas, sin espacios. Por ejemplo: dranvega',
    passHint: 'Mínimo 12 caracteres. Una frase es más fácil de recordar: «girasol azul en Ponce 1987».',
    repeatPass: 'Repita la contraseña', mismatch: 'Las contraseñas no coinciden.', cancel: 'Cancelar',
    connectTitle: 'Conecte su teléfono',
    install: 'Instale una aplicación de autenticación: Google Authenticator, Microsoft Authenticator o la de su preferencia.',
    scan: 'En la aplicación, toque «+» y escanee este código:',
    qrAlt: 'Código QR para la aplicación de autenticación',
    cantScan: '¿No puede escanear? Escriba esta clave',
    typeCode: 'Escriba el código de 6 dígitos que muestra la aplicación.',
    verify: 'Verificar',
    firstLogin: 'Primer acceso · Paso 1 de 2',
    firstIntro: 'Antes de entrar, conecte su teléfono. Desde ahora, cada entrada pedirá su contraseña y un código del teléfono.',
    saveStep: 'Primer acceso · Paso 2 de 2',
    saveTitle: 'Guarde estos códigos',
    saveIntro: 'Si pierde o cambia su teléfono, cada uno de estos códigos le permite entrar una vez. No los volverá a ver.',
    download: 'Descargar', print: 'Imprimir', saved: 'Los guardé en un lugar seguro.', finish: 'Terminar', security: 'Seguridad',
    file: ['draninavega.com · Portal administrativo', 'Códigos de recuperación para:', 'Creados:',
      'Cada código sirve UNA vez si pierde su teléfono.', 'Guárdelos en un lugar seguro, lejos del teléfono.'],
    fileName: 'codigos-recuperacion-draninavega.txt', locale: 'es-PR',
  },
  en: {
    switchTo: 'Español', switchLabel: 'Cambiar a español',
    portal: 'Admin portal',
    intro: 'Sign in to update the information on your website.',
    user: 'Username', password: 'Password', continue: 'Continue', verifying: 'Checking…', preparing: 'Preparing…',
    newAccount: 'Set up a new account',
    twoStep: 'Two-step verification', confirmTitle: "Confirm it's you",
    code6: '6-digit code',
    codeHint: 'Open your authenticator app (for example, Google Authenticator) and enter the code for "draninavega.com".',
    enter: 'Sign in', useRecovery: 'Use a recovery code', useApp: 'Use the code from the app',
    recoveryLabel: 'Recovery code',
    recoveryHint: 'Use one of the codes you saved when setting up the account (format XXXX-XXXX). Each one works only once.',
    back: '← Back',
    usedRecovery: (n) => `You used a recovery code. ${n} left. You can create new codes under Seguridad.`,
    setupStep: (n) => `Setup · Step ${n} of 3`,
    createTitle: 'Create your account',
    setupIntro: "You'll need the setup code from Angel and your phone with an authenticator app.",
    setupCode: 'Setup code', yourName: 'Your name', nameHint: 'Shown in the activity log.',
    usernameHint: 'Lowercase, no spaces. For example: dranvega',
    passHint: 'At least 12 characters. A phrase is easier to remember: "blue sunflower in Ponce 1987".',
    repeatPass: 'Repeat the password', mismatch: "The passwords don't match.", cancel: 'Cancel',
    connectTitle: 'Connect your phone',
    install: 'Install an authenticator app: Google Authenticator, Microsoft Authenticator or one you prefer.',
    scan: 'In the app, tap "+" and scan this code:',
    qrAlt: 'QR code for the authenticator app',
    cantScan: "Can't scan? Type this key instead",
    typeCode: 'Enter the 6-digit code the app shows.',
    verify: 'Verify',
    firstLogin: 'First sign-in · Step 1 of 2',
    firstIntro: 'Before you continue, connect your phone. From now on, every sign-in asks for your password and a code from the phone.',
    saveStep: 'First sign-in · Step 2 of 2',
    saveTitle: 'Save these codes',
    saveIntro: "If you lose or replace your phone, each of these codes lets you sign in once. You won't see them again.",
    download: 'Download', print: 'Print', saved: 'I saved them somewhere safe.', finish: 'Finish', security: 'Security',
    file: ['draninavega.com · Admin portal', 'Recovery codes for:', 'Created:',
      'Each code works ONCE if you lose your phone.', 'Keep them somewhere safe, away from the phone.'],
    fileName: 'recovery-codes-draninavega.txt', locale: 'en-US',
  },
};

let authLang = (() => {
  try { return localStorage.getItem('nv-lang') === 'en' ? 'en' : 'es'; } catch { return 'es'; }
})();
const T = () => AUTH[authLang];
let currentAuthScreen = null;   // re-renders the visible auth screen after a language switch

function authLayout(rerender, ...content) {
  currentAuthScreen = rerender;
  document.documentElement.lang = authLang;
  const toggle = h('button', {
    class: 'btn btn--line lang-toggle', type: 'button', lang: authLang === 'es' ? 'en' : 'es', 'aria-label': T().switchLabel,
    onclick: () => {
      authLang = authLang === 'es' ? 'en' : 'es';
      try { localStorage.setItem('nv-lang', authLang); } catch { /* private mode */ }
      currentAuthScreen?.();
      document.querySelector('.lang-toggle')?.focus();
    },
  }, T().switchTo);
  app.replaceChildren(h('main', { class: 'auth' },
    h('div', { class: 'auth__art', 'aria-hidden': 'true' }, h('div', { class: 'auth__arch' }, svg(MOTIF))),
    h('div', { class: 'auth__main' }, toggle, h('div', { class: 'auth__card' }, ...content))));
}

function renderLogin(step = 'password') {
  const t = T();
  const err = h('div', { 'aria-live': 'assertive' });
  if (state.authNotice) { err.append(errorBox(msg(state.authNotice, authLang))); state.authNotice = null; }

  if (step === 'password') {
    const user = h('input', { class: 'input', name: 'username', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true });
    const pass = h('input', { class: 'input', type: 'password', name: 'password', autocomplete: 'current-password', required: true });
    const go = button('btn--mar', t.continue, null, { type: 'submit' });
    authLayout(() => renderLogin(),
      h('p', { class: 'eyebrow' }, t.portal),
      h('h1', {}, 'Dra. Nina M. Vega'),
      h('div', { class: 'gold-rule', 'aria-hidden': 'true' }),
      h('p', { class: 'muted' }, t.intro),
      err,
      h('form', {
        onsubmit: async (e) => {
          e.preventDefault();
          err.replaceChildren();
          busy(go, true, t.verifying);
          try {
            const r = await api('POST', '/api/login', { username: user.value, password: pass.value });
            if (r.next === 'enroll') renderBootstrap(r); else renderLogin('code');
          } catch (ex) { err.replaceChildren(errorBox(msg(ex, authLang))); pass.value = ''; pass.focus(); }
          finally { busy(go, false, true); }
        },
      },
      field({ label: t.user, input: user }),
      field({ label: t.password, input: pass }),
      h('div', { class: 'btns' }, go)),
      state.setup && h('p', { class: 'small muted' }, h('br'), h('a', { href: '#configurar' }, t.newAccount)),
    );
    user.focus();
    return;
  }

  // Step 2: authenticator or recovery code
  let recovery = false;
  const code = h('input', { class: 'input input--code', id: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', pattern: '[0-9]*', required: true });
  const lbl = h('label', { class: 'label', for: 'code' }, t.code6);
  const hint = h('p', { class: 'hint' }, t.codeHint);
  const go = button('btn--mar', t.enter, null, { type: 'submit' });
  const swap = button('btn--quiet', t.useRecovery, () => {
    recovery = !recovery;
    code.value = '';
    code.className = recovery ? 'input' : 'input input--code';
    code.inputMode = recovery ? 'text' : 'numeric';
    code.maxLength = recovery ? 9 : 6;
    code.autocomplete = recovery ? 'off' : 'one-time-code';
    code.toggleAttribute('pattern', !recovery);
    lbl.textContent = recovery ? t.recoveryLabel : t.code6;
    hint.textContent = recovery ? t.recoveryHint : t.codeHint;
    swap.textContent = recovery ? t.useApp : t.useRecovery;
    code.focus();
  });
  authLayout(() => renderLogin('code'),
    h('p', { class: 'eyebrow' }, t.twoStep),
    h('h1', {}, t.confirmTitle),
    h('div', { class: 'gold-rule', 'aria-hidden': 'true' }),
    err,
    h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        err.replaceChildren();
        busy(go, true, t.verifying);
        try {
          const r = await api('POST', '/api/login/code', { code: code.value });
          state.user = r.user;
          if (r.usedRecovery) state.notice = AUTH.es.usedRecovery(r.user.recoveryLeft);
          hooks.render();
        } catch (ex) {
          if (ex.data.error === 'mfa_expired') { state.authNotice = 'mfa_expired'; return renderLogin(); }
          err.replaceChildren(errorBox(msg(ex, authLang)));
          code.value = ''; code.focus();
        } finally { busy(go, false, true); }
      },
    },
    h('div', { class: 'field' }, lbl, hint, code),
    h('div', { class: 'btns' }, go, swap)),
    h('p', { class: 'small' }, h('br'), h('a', { href: '#', onclick: (e) => { e.preventDefault(); renderLogin(); } }, t.back)),
  );
  code.focus();
}

/** QR + key + "enter the code" block shared by setup and the first (bootstrap) sign-in. */
function enrollBlock(r) {
  const t = T();
  return [
    h('ol', { class: 'steps' }, h('li', {}, t.install), h('li', {}, t.scan)),
    h('img', { class: 'qr', src: r.qr, alt: t.qrAlt, width: '220', height: '220' }),
    h('details', {}, h('summary', { class: 'small' }, t.cantScan), h('p', { class: 'secret' }, r.secret.replace(/(.{4})/g, '$1 ').trim())),
    h('ol', { class: 'steps steps--from-3', start: '3' }, h('li', {}, t.typeCode)),
  ];
}

// First sign-in with the bootstrap account: enroll the authenticator before anything else.
function renderBootstrap(r) {
  const t = T();
  const err = h('div', { 'aria-live': 'assertive' });
  const name = h('input', { class: 'input', autocomplete: 'name', required: true, value: 'Dra. Nina M. Vega' });
  const code = h('input', { class: 'input input--code', id: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', pattern: '[0-9]*', required: true });
  const go = button('btn--mar', t.verify, null, { type: 'submit' });
  authLayout(() => renderBootstrap(r),
    h('p', { class: 'eyebrow' }, t.firstLogin),
    h('h1', {}, t.connectTitle),
    h('div', { class: 'gold-rule', 'aria-hidden': 'true' }),
    h('p', { class: 'muted' }, t.firstIntro),
    ...enrollBlock(r),
    err,
    h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        err.replaceChildren();
        busy(go, true, t.verifying);
        try {
          const done = await api('POST', '/api/login/enroll', { code: code.value, name: name.value });
          renderRecoveryCodes(done.codes, done.user.username, () => {
            state.user = done.user;
            location.hash = 'contenido';
            hooks.render();
          }, T().saveStep);
        } catch (ex) {
          if (ex.data.error === 'mfa_expired') { state.authNotice = 'mfa_expired'; return renderLogin(); }
          err.append(errorBox(msg(ex, authLang))); code.value = ''; code.focus();
        } finally { busy(go, false, true); }
      },
    },
    field({ label: t.yourName, hint: t.nameHint, input: name }),
    h('div', { class: 'field' }, h('label', { class: 'label', for: 'code' }, t.code6), code),
    h('div', { class: 'btns' }, go)),
  );
}

// ── First-time setup (only while SETUP_CODE is set) ─────────────────────
function renderSetup() {
  const t = T();
  const err = h('div', { 'aria-live': 'assertive' });
  const setupCode = h('input', { class: 'input', autocomplete: 'off', required: true });
  const name = h('input', { class: 'input', autocomplete: 'name', required: true, value: 'Dra. Nina M. Vega' });
  const username = h('input', { class: 'input', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', required: true });
  const pass = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', minlength: '12', required: true });
  const pass2 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', required: true });
  const go = button('btn--mar', t.continue, null, { type: 'submit' });

  authLayout(() => renderSetup(),
    h('p', { class: 'eyebrow' }, t.setupStep(1)),
    h('h1', {}, t.createTitle),
    h('div', { class: 'gold-rule', 'aria-hidden': 'true' }),
    h('p', { class: 'muted' }, t.setupIntro),
    err,
    h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        err.replaceChildren();
        if (pass.value !== pass2.value) { err.append(errorBox(t.mismatch)); return; }
        busy(go, true, t.preparing);
        try {
          const r = await api('POST', '/api/setup/start', { setupCode: setupCode.value, name: name.value, username: username.value, password: pass.value });
          renderSetupQr(r, username.value.trim().toLowerCase());
        } catch (ex) { err.append(errorBox(msg(ex, authLang))); }
        finally { busy(go, false, true); }
      },
    },
    field({ label: t.setupCode, input: setupCode }),
    field({ label: t.yourName, hint: t.nameHint, input: name }),
    field({ label: t.user, hint: t.usernameHint, input: username }),
    field({ label: t.password, hint: t.passHint, input: pass }),
    field({ label: t.repeatPass, input: pass2 }),
    h('div', { class: 'btns' }, go, h('a', { href: '#', class: 'btn btn--quiet' }, t.cancel))),
  );
  setupCode.focus();
}

function renderSetupQr(r, username) {
  const t = T();
  const err = h('div', { 'aria-live': 'assertive' });
  const code = h('input', { class: 'input input--code', id: 'code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', pattern: '[0-9]*', required: true });
  const go = button('btn--mar', t.verify, null, { type: 'submit' });
  authLayout(() => renderSetupQr(r, username),
    h('p', { class: 'eyebrow' }, t.setupStep(2)),
    h('h1', {}, t.connectTitle),
    h('div', { class: 'gold-rule', 'aria-hidden': 'true' }),
    ...enrollBlock(r),
    err,
    h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        err.replaceChildren();
        busy(go, true, t.verifying);
        try {
          const done = await api('POST', '/api/setup/finish', { enrollId: r.enrollId, code: code.value });
          renderRecoveryCodes(done.codes, username, () => { location.hash = ''; renderLogin(); }, T().setupStep(3));
        } catch (ex) { err.append(errorBox(msg(ex, authLang))); code.value = ''; code.focus(); }
        finally { busy(go, false, true); }
      },
    },
    h('div', { class: 'field' }, h('label', { class: 'label', for: 'code' }, t.code6), code),
    h('div', { class: 'btns' }, go)),
  );
}

function downloadCodes(codes, username) {
  const t = T();
  const [title, forLabel, created, l1, l2] = t.file;
  const text = [title, `${forLabel} ${username}`, `${created} ${new Date().toLocaleString(t.locale)}`, '', l1, l2, '', ...codes, ''].join('\r\n');
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: 'text/plain' })), download: t.fileName });
  document.body.append(a); a.click(); a.remove();
}

function renderRecoveryCodes(codes, username, onDone, eyebrow) {
  const t = T();
  const ok = h('input', { type: 'checkbox', id: 'saved' });
  const go = button('btn--mar', t.finish, onDone, { disabled: true });
  ok.addEventListener('change', () => { go.disabled = !ok.checked; });
  authLayout(() => renderRecoveryCodes(codes, username, onDone, eyebrow),
    h('p', { class: 'eyebrow' }, eyebrow || t.security),
    h('h1', {}, t.saveTitle),
    h('div', { class: 'gold-rule', 'aria-hidden': 'true' }),
    h('p', {}, t.saveIntro),
    h('ul', { class: 'codes' }, codes.map((c) => h('li', {}, c))),
    h('div', { class: 'btns' },
      button('btn--line', t.download, () => downloadCodes(codes, username)),
      button('btn--line', t.print, () => window.print())),
    h('p', { class: 'toggle' }, ok, h('label', { for: 'saved' }, t.saved)),
    h('div', { class: 'btns' }, go),
  );
}

export { renderLogin, renderSetup, renderRecoveryCodes };
