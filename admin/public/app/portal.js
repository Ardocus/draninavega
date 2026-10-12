// Signed-in portal. Served only to a valid session (edge gate: netlify/edge-functions/gate.js).
import {
  SITE, app, h, api, msg, MESSAGES, state, clone, getPath, setPath, dirty, errorBox, busy, button, field, hooks, route,
} from '/assets/core.js';
import { renderLogin, renderRecoveryCodes } from '/assets/auth.js';

// ── Signed-in shell ─────────────────────────────────────────────────────
function renderShell(tab, body) {
  const tabs = [['contenido', 'Contenido'], ['seguridad', 'Seguridad'], ['actividad', 'Actividad']];
  const main = h('main', { id: 'main' });
  document.documentElement.lang = 'es';   // the signed-in portal is Spanish
  app.replaceChildren(
    h('header', { class: 'topbar' }, h('div', { class: 'wrap' },
      h('a', { class: 'brand', href: '#contenido' }, h('b', {}, 'Dra. Nina M. Vega'), h('span', {}, 'Portal')),
      h('nav', { class: 'tabs', 'aria-label': 'Secciones del portal' },
        tabs.map(([id, label]) => h('a', { href: `#${id}`, 'aria-current': tab === id ? 'page' : null }, label))),
      h('div', { class: 'who' },
        h('span', { class: 'name muted' }, state.user.name),
        h('a', { href: SITE, target: '_blank', rel: 'noopener noreferrer' }, 'Ver la página ↗'),
        button('btn--line', 'Salir', async () => {
          if (dirty() && !confirm('Tiene cambios sin publicar. ¿Salir de todos modos?')) return;
          await api('POST', '/api/logout', {}).catch(() => {});
          state.user = null; state.draft = state.original = null;
          renderLogin();
        })),
    )),
    main,
  );
  body(main);
}

// ── Editor ──────────────────────────────────────────────────────────────
const LABELS = {
  'practice.name.es_short': 'Nombre corto (español)',
  'practice.name.es_full': 'Nombre completo (español)',
  'practice.name.en_short': 'Nombre corto (inglés)',
  'practice.name.en_full': 'Nombre completo (inglés)',
  'practice.tagline.es': 'Lema (español)',
  'practice.tagline.en': 'Lema (inglés)',
  'practice.summary.es': 'Resumen (español)',
  'practice.summary.en': 'Resumen (inglés)',
  'practice.specialties': 'Especialidades',
  'practice.certifications': 'Certificaciones',
  'practice.address.street': 'Calle',
  'practice.address.building': 'Edificio y suite',
  'practice.address.city': 'Ciudad',
  'practice.address.region': 'Estado',
  'practice.address.postal': 'Código postal',
  'practice.phone_display': 'Teléfono',
  'practice.email': 'Correo electrónico',
  'practice.hours.es': 'Horario (español)',
  'practice.hours.en': 'Horario (inglés)',
  'practice.serves_english': 'Atiende pacientes en inglés',
  'settings.accepting_new_patients': 'Aceptando pacientes nuevos',
  'settings.insurance': 'Planes médicos',
  'settings.whatsapp_enabled': 'Mostrar WhatsApp',
  'settings.whatsapp_number': 'Número de WhatsApp',
  'settings.facebook_url': 'Enlace de Facebook',
  'settings.announcement.enabled': 'Aviso activado',
  'settings.announcement.es': 'Aviso (español)',
  'settings.announcement.en': 'Aviso (inglés)',
  'settings.announcement.start': 'Aviso desde',
  'settings.announcement.end': 'Aviso hasta',
};
const labelFor = (path) => {
  let p = path;
  while (p) { if (LABELS[p]) return LABELS[p]; p = p.includes('.') ? p.slice(0, p.lastIndexOf('.')) : ''; }
  return path;
};
const pretty = (v) => {
  if (v === true) return 'Sí';
  if (v === false) return 'No';
  if (Array.isArray(v)) return v.length ? v.join(' · ') : '(vacío)';
  if (v === '' || v == null) return '(vacío)';
  return String(v);
};

// Whatsapp is stored as "17878487646"; show it as a phone number.
const waDisplay = (n) => {
  const d = String(n || '').replace(/[^0-9]/g, '').replace(/^1(?=[0-9]{10}$)/, '');
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : n || '';
};

/** Draft → the paths that matter to a human, grouped at list level. */
function diff() {
  const out = [];
  const walk = (a, b, path) => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (LABELS[path] || Array.isArray(a) || Array.isArray(b) || typeof a !== 'object' || typeof b !== 'object' || !a || !b) {
      out.push({ path, from: a, to: b });
      return;
    }
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], `${path}.${k}`);
  };
  walk(state.original.practice, state.draft.practice, 'practice');
  walk(state.original.settings, state.draft.settings, 'settings');
  return out.map((d) => {
    if (d.path === 'practice.specialties') {
      return { ...d, from: d.from.es.map((s, i) => `${s} / ${d.from.en[i] ?? ''}`), to: d.to.es.map((s, i) => `${s} / ${d.to.en[i] ?? ''}`) };
    }
    if (d.path === 'settings.whatsapp_number') return { ...d, from: waDisplay(d.from), to: waDisplay(d.to) };
    return d;
  });
}

let errorsByPath = {};

async function renderEditor(main) {
  if (!state.draft) {
    main.append(h('p', { class: 'loading' }, 'Cargando contenido…'));
    try {
      const r = await api('GET', '/api/content');
      state.original = { practice: r.practice, settings: r.settings };
      state.original.settings.whatsapp_number = waDisplay(state.original.settings.whatsapp_number);
      state.draft = clone(state.original);
      state.version = r.version;
      state.lastPublish = r.lastPublish;
    } catch (ex) {
      main.replaceChildren(h('div', { class: 'wrap' }, errorBox(msg(ex)), button('btn--line', 'Reintentar', () => hooks.render())));
      return;
    }
  }
  const D = state.draft;

  // Field builders bound to the draft
  const err = (path) => errorsByPath[path] && h('p', { class: 'err' }, errorsByPath[path]);
  const onChange = () => updateSaveBar();
  const text = (label, path, { hint, max = 120, lang, type = 'text', placeholder, inputmode, autocomplete = 'off' } = {}) => {
    const input = h('input', {
      class: 'input', type, value: getPath(D, path) ?? '', maxlength: String(max), lang, placeholder, inputmode, autocomplete,
      'data-path': path, 'aria-invalid': errorsByPath[path] ? 'true' : null,
      oninput: (e) => { setPath(D, path, e.target.value); onChange(); },
    });
    return field({ label, hint, input, error: err(path) });
  };
  const area = (label, path, { hint, max = 240, lang } = {}) => {
    const input = h('textarea', {
      class: 'input', rows: '3', maxlength: String(max), lang, 'data-path': path,
      'aria-invalid': errorsByPath[path] ? 'true' : null,
      oninput: (e) => { setPath(D, path, e.target.value.replace(/\s*\n\s*/g, ' ')); onChange(); },
    });
    input.value = getPath(D, path) ?? '';
    return field({ label, hint, input, error: err(path) });
  };
  const pair = (label, pathEs, pathEn, opts = {}) => {
    const mk = opts.area ? area : text;
    return h('fieldset', { class: 'group' },
      h('legend', { class: 'label' }, label),
      opts.hint && h('p', { class: 'hint' }, opts.hint),
      h('div', { class: 'pair' },
        mk(h('span', {}, h('span', { class: 'lang-tag', 'aria-hidden': 'true' }, 'ES'), 'Español'), pathEs, { ...opts, hint: null, lang: 'es' }),
        mk(h('span', {}, h('span', { class: 'lang-tag', 'aria-hidden': 'true' }, 'EN'), 'English'), pathEn, { ...opts, hint: null, lang: 'en' })));
  };
  const toggle = (label, path, hint, onToggle) => {
    const state_ = h('span', { class: 'state' }, getPath(D, path) ? 'Sí' : 'No');
    const input = h('input', {
      type: 'checkbox', role: 'switch', checked: !!getPath(D, path), 'data-path': path,
      onchange: (e) => { setPath(D, path, e.target.checked); state_.textContent = e.target.checked ? 'Sí' : 'No'; onToggle?.(e.target.checked); onChange(); },
    });
    const id = input.id = `t${path.replace(/[^a-z0-9]/gi, '')}`;
    return h('div', { class: 'toggle' }, input,
      h('div', {}, h('label', { class: 'label', for: id }, label, ' ', state_), hint && h('p', { class: 'hint' }, hint), err(path)));
  };
  const date = (label, path) => {
    const input = h('input', {
      class: 'input', type: 'date', value: getPath(D, path) || '', 'data-path': path, 'aria-invalid': errorsByPath[path] ? 'true' : null,
      oninput: (e) => { setPath(D, path, e.target.value); onChange(); },
    });
    return field({ label, input, error: err(path) });
  };

  /** Editable list of strings (or parallel ES/EN lists when `enPath` is set). */
  const list = (label, path, { hint, max = 20, placeholder, enPath, addLabel = 'Añadir' } = {}) => {
    const wrap = h('div', { class: 'field' });
    const draw = () => {
      const items = getPath(D, path);
      const en = enPath ? getPath(D, enPath) : null;
      const move = (i, j) => {
        [items[i], items[j]] = [items[j], items[i]];
        if (en) [en[i], en[j]] = [en[j], en[i]];
        draw(); onChange();
      };
      const row = (v, i) => {
        const inp = (arr, idx, lang, ph) => h('input', {
          class: 'input', value: arr[idx] ?? '', lang, placeholder: ph, maxlength: '160', 'aria-label': `${label} ${i + 1}${lang ? ` (${lang === 'es' ? 'español' : 'inglés'})` : ''}`,
          'data-path': `${lang === 'en' ? enPath : path}.${idx}`, 'aria-invalid': errorsByPath[`${lang === 'en' ? enPath : path}.${idx}`] ? 'true' : null,
          oninput: (e) => { arr[idx] = e.target.value; onChange(); },
        });
        return h('li', {},
          en ? h('div', { class: 'pair' }, inp(items, i, 'es', 'Español'), inp(en, i, 'en', 'English')) : inp(items, i),
          button('btn--icon', '↑', () => move(i, i - 1), { 'aria-label': `Subir ${v || ''}`, disabled: i === 0 }),
          button('btn--icon', '↓', () => move(i, i + 1), { 'aria-label': `Bajar ${v || ''}`, disabled: i === items.length - 1 }),
          button('btn--icon', '✕', () => {
            if (!confirm(`¿Quitar «${v || 'este elemento'}»?`)) return;
            items.splice(i, 1); if (en) en.splice(i, 1); draw(); onChange();
          }, { 'aria-label': `Quitar ${v || ''}` }));
      };
      const add = h('input', { class: 'input', placeholder, maxlength: '160', 'aria-label': `${addLabel}: ${label}` });
      const addBtn = button('btn--line', addLabel, () => {
        const v = add.value.trim();
        if (!v) { add.focus(); return; }
        items.push(v); if (en) en.push('');
        draw(); onChange();
        wrap.querySelector('.list-add .input')?.focus();
      }, { disabled: items.length >= max });
      add.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addBtn.click(); } });
      wrap.replaceChildren(...[
        h('p', { class: 'label' }, label),
        hint && h('p', { class: 'hint' }, hint),
        err(path), enPath && err(enPath),
        h('ul', { class: 'list' }, items.map(row)),
        h('div', { class: 'list-add' }, add, addBtn)].filter(Boolean));
    };
    draw();
    return wrap;
  };

  const section = (num, title, desc, ...body) => h('li', { class: 'sec' },
    h('div', { class: 'sec__head' }, h('span', { class: 'sec__num', 'aria-hidden': 'true' }, num),
      h('div', {}, h('h2', {}, title), desc && h('p', {}, desc))),
    h('div', { class: 'sec__body' }, ...body));

  const waNumber = text('Número de WhatsApp', 'settings.whatsapp_number', { inputmode: 'tel', placeholder: '(787) 848-7646', max: 20 });
  waNumber.hidden = !D.settings.whatsapp_enabled;
  const annFields = h('div', {},
    pair('Texto del aviso', 'settings.announcement.es', 'settings.announcement.en', { max: 160, hint: 'Una sola línea. Ejemplo: «Receso navideño: la oficina estará cerrada del 24 al 31 de diciembre.»' }),
    h('div', { class: 'pair' }, date('Mostrar desde (opcional)', 'settings.announcement.start'), date('Hasta (opcional)', 'settings.announcement.end')),
    h('p', { class: 'hint' }, 'Si pone fechas, el aviso aparece y desaparece solo en esas fechas.'));
  annFields.hidden = !D.settings.announcement.enabled;

  const issues = Object.keys(errorsByPath).length
    ? h('div', { class: 'alert', role: 'alert' }, MESSAGES.es.invalid_content, h('ul', {}, Object.entries(errorsByPath).map(([p, m]) => h('li', {}, `${labelFor(p)}: ${m}`))))
    : null;

  main.replaceChildren(
    statusBand(),
    h('div', { class: 'wrap' },
      h('div', { class: 'page-head' },
        h('p', { class: 'eyebrow' }, 'Contenido'),
        h('h1', {}, 'Su página'),
        h('p', { class: 'muted' }, 'Haga los cambios que necesite y luego toque «Revisar y publicar». Nada cambia en la página hasta que publique.'),
        state.notice && h('div', { class: 'alert alert--ok', role: 'status' }, state.notice),
        issues),
      h('ol', { class: 'sections' },
        section('01', 'Aviso temporal', 'Cierres, recesos o cambios de horario. Aparece arriba de la página.',
          toggle('Mostrar un aviso', 'settings.announcement.enabled', null, (on) => { annFields.hidden = !on; }),
          annFields),
        section('02', 'Pacientes nuevos', 'La etiqueta «Aceptando pacientes nuevos» junto a su nombre.',
          toggle('Aceptando pacientes nuevos', 'settings.accepting_new_patients', 'Apáguelo si no está recibiendo pacientes nuevos por ahora.')),
        section('03', 'Planes médicos', 'Los planes que acepta, en el orden en que aparecen.',
          list('Planes médicos aceptados', 'settings.insurance', { placeholder: 'Nombre del plan', max: 30, addLabel: 'Añadir plan' })),
        section('04', 'Teléfono y contacto', null,
          text('Teléfono de la oficina', 'practice.phone_display', { inputmode: 'tel', placeholder: '(787) 848-7646', max: 20, hint: 'Es el número de todos los botones «Agende su cita».' }),
          toggle('Mostrar WhatsApp', 'settings.whatsapp_enabled', 'Los botones verdes de WhatsApp en la página.', (on) => { waNumber.hidden = !on; }),
          waNumber,
          text('Correo electrónico', 'practice.email', { type: 'email', max: 120 }),
          pair('Horario', 'practice.hours.es', 'practice.hours.en', { max: 80 })),
        section('05', 'Dirección', 'El botón «Cómo llegar» usa esta dirección en Google Maps.',
          text('Calle', 'practice.address.street', { max: 100 }),
          text('Edificio y suite', 'practice.address.building', { max: 100 }),
          h('div', { class: 'pair' }, text('Ciudad', 'practice.address.city', { max: 60 }), h('div', { class: 'pair' },
            text('Estado', 'practice.address.region', { max: 2 }), text('Código postal', 'practice.address.postal', { max: 10, inputmode: 'numeric' })))),
        section('06', 'Especialidades y certificaciones', null,
          list('Especialidades', 'practice.specialties.es', { enPath: 'practice.specialties.en', max: 8, placeholder: 'Nueva especialidad (español)', addLabel: 'Añadir especialidad', hint: 'Escriba cada una en español y en inglés.' }),
          h('div', { class: 'field' }),
          list('Certificaciones', 'practice.certifications', { max: 8, placeholder: 'Diplomate of the American Board of…', addLabel: 'Añadir certificación', hint: 'Se muestran en inglés en ambas versiones, tal como en su tarjeta.' })),
        section('07', 'Lema y resumen', 'Lo que aparece debajo de su nombre.',
          pair('Lema', 'practice.tagline.es', 'practice.tagline.en', { max: 100 }),
          pair('Resumen', 'practice.summary.es', 'practice.summary.en', { area: true, max: 240 })),
        section('08', 'Nombre', 'Cómo aparece su nombre en la página.',
          pair('Nombre corto', 'practice.name.es_short', 'practice.name.en_short', { max: 60 }),
          pair('Nombre completo', 'practice.name.es_full', 'practice.name.en_full', { max: 80 })),
        section('09', 'Otros', null,
          toggle('La oficina atiende pacientes en inglés', 'practice.serves_english', 'Le indica a Google que se ofrece atención en inglés.'),
          text('Página de Facebook (opcional)', 'settings.facebook_url', { type: 'url', max: 200, placeholder: 'https://www.facebook.com/…', hint: 'Si la añade, aparece un enlace a Facebook al pie de la página.' }),
          h('p', { class: 'note' }, 'Las líneas de crisis (988 y Línea PAS) siempre aparecen al pie de la página y no se pueden quitar desde aquí.')),
      )),
    saveBar(),
  );
  state.notice = null;
  updateSaveBar();
  if (!state.publishing) checkDeployOnce();
}

/**
 * What the public site is actually showing, from /api/status. Returns a warning
 * (Spanish, for the doctor, naming what Angel must fix) or null when all is well.
 */
function deployProblem(s) {
  if (!s) return null;
  if (s.hook === false) {
    return 'Sus cambios se guardaron, pero la página pública no se actualiza sola todavía. Avísele a Angel: falta PUBLIC_BUILD_HOOK en el proyecto del portal.';
  }
  if (s.deployed === 0 && s.version > 1) {
    return 'Sus cambios se guardaron, pero la página pública todavía no lee el portal. Avísele a Angel: faltan ADMIN_EXPORT_URL y EXPORT_TOKEN en el proyecto público de Netlify.';
  }
  if (s.live === false && !state.publishing) {
    return 'Sus últimos cambios todavía no aparecen en la página. Si en 10 minutos siguen sin aparecer, avísele a Angel (revisar «Deploys» del proyecto público).';
  }
  return null;
}

function statusBand() {
  const problem = deployProblem(state.deploy);
  const band = h('div', { class: `status${state.publishing ? ' is-busy' : ''}${problem ? ' is-warn' : ''}`, role: 'status', 'aria-live': 'polite' });
  const lp = state.lastPublish;
  const when = lp ? new Date(lp.at).toLocaleString('es-PR', { dateStyle: 'long', timeStyle: 'short' }) : null;
  const line = state.publishing
    ? 'Publicando sus cambios… aparecerán en la página en 1 a 2 minutos.'
    : problem || (state.deploy?.live ? 'La página está al día.' : 'Comprobando la página…');
  band.append(h('div', { class: 'wrap' },
    h('p', {}, h('span', { class: 'dot', 'aria-hidden': 'true' }), line),
    when && h('p', { class: 'small muted' }, `Última publicación: ${when}, por ${lp.by}`)));
  return band;
}

function refreshStatusBand() {
  if (route() === 'contenido') document.querySelector('.status')?.replaceWith(statusBand());
}

/** One status check when the editor opens, so a broken connection is visible right away. */
async function checkDeployOnce() {
  try { state.deploy = await api('GET', '/api/status'); } catch { state.deploy = null; }
  if (!state.publishing) refreshStatusBand();
}

let saveBarEl;
function saveBar() {
  const discard = button('btn--light', 'Descartar', () => {
    if (!confirm('¿Descartar todos los cambios sin publicar?')) return;
    state.draft = clone(state.original); errorsByPath = {}; hooks.render();
  });
  const review = button('btn--cta', 'Revisar y publicar', openReview);
  saveBarEl = h('div', { class: 'savebar', hidden: true },
    h('div', { class: 'wrap' }, h('p', {}, 'Tiene cambios sin publicar'), h('div', { class: 'btns' }, discard, review)));
  return saveBarEl;
}
function updateSaveBar() { if (saveBarEl) saveBarEl.hidden = !dirty(); }

function openReview() {
  const changes = diff();
  const err = h('div', { 'aria-live': 'assertive' });
  const go = button('btn--cta', 'Publicar ahora', null);
  const dlg = h('dialog', { 'aria-labelledby': 'rv-title' },
    h('div', { class: 'dlg' },
      h('p', { class: 'eyebrow' }, 'Revisar'),
      h('h2', { id: 'rv-title' }, changes.length === 1 ? '1 cambio' : `${changes.length} cambios`),
      h('p', { class: 'muted small' }, 'Esto es lo que cambiará en la página en español e inglés.'),
      h('ul', { class: 'changes' }, changes.map((c) => h('li', {},
        h('p', { class: 'what' }, labelFor(c.path)),
        h('p', { class: 'from' }, h('span', { class: 'sr-only' }, 'Antes: '), pretty(c.from)),
        h('p', { class: 'to' }, h('span', { class: 'sr-only' }, 'Después: '), '→ ', pretty(c.to))))),
      err,
      h('div', { class: 'btns' }, go, button('btn--line', 'Seguir editando', () => dlg.close()))));
  dlg.addEventListener('close', () => dlg.remove());
  go.addEventListener('click', async () => {
    err.replaceChildren();
    busy(go, true, 'Publicando…');
    try {
      const r = await api('POST', '/api/content', { ...state.draft, version: state.version });
      errorsByPath = {};
      dlg.close();
      if (!r.changed.length) { state.notice = 'No había cambios que publicar.'; hooks.render(); return; }
      // Reload so the version and derived values (e.g. formatted phones) match what was saved.
      state.lastPublish = r.lastPublish;
      state.publishing = r.buildRequested;
      state.draft = null;
      state.notice = r.buildRequested
        ? 'Guardado. Gracias.'
        : 'Guardado, pero la página pública no se pudo actualizar automáticamente. Avísele a Angel (PUBLIC_BUILD_HOOK).';
      hooks.render();
      if (r.buildRequested) watchDeploy();
    } catch (ex) {
      if (ex.data.error === 'invalid_content') {
        errorsByPath = Object.fromEntries((ex.data.issues || []).map((i) => [i.path, i.msg]));
        dlg.close();
        hooks.render();
        document.querySelector('[aria-invalid="true"]')?.focus();
        return;
      }
      err.append(errorBox(msg(ex)));
      if (ex.data.error === 'conflict') err.append(button('btn--line', 'Recargar', () => { state.draft = null; dlg.close(); hooks.render(); }));
    } finally { busy(go, false, true); }
  });
  document.body.append(dlg);
  dlg.showModal();
}

let deployTimer;
function watchDeploy() {
  clearInterval(deployTimer);
  let tries = 0;
  deployTimer = setInterval(async () => {
    tries++;
    try {
      const s = await api('GET', '/api/status');
      state.deploy = s;
      // Stop when it's live, when nothing will ever rebuild (no hook), or after ~6 minutes.
      if (s.live === true || s.hook === false || tries > 36) {
        clearInterval(deployTimer);
        state.publishing = false;
        if (route() === 'contenido' && !dirty()) {
          refreshStatusBand();   // shows the specific problem if it isn't live
          if (s.live) document.querySelector('.status p')?.replaceChildren(h('span', { class: 'dot', 'aria-hidden': 'true' }), 'Sus cambios ya están en la página.');
        }
      }
    } catch { /* keep polling */ }
  }, 10_000);
}

// ── Security ────────────────────────────────────────────────────────────
/** "Cambiar de teléfono": verify password + current code, then enroll the new phone. */
function phoneSection() {
  const body = h('div', { class: 'sec__body' });
  const step1 = () => {
    const err = h('div', { 'aria-live': 'assertive' });
    const pw = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', required: true });
    const code = h('input', { class: 'input input--code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '9', required: true });
    const go = button('btn--mar', 'Continuar', null, { type: 'submit' });
    body.replaceChildren(h('form', { onsubmit: async (e) => {
      e.preventDefault(); err.replaceChildren();
      busy(go, true, 'Verificando…');
      try { step2(await api('POST', '/api/account/phone/start', { password: pw.value, code: code.value })); }
      catch (ex) { err.append(errorBox(msg(ex))); } finally { busy(go, false, true); }
    } },
    h('p', {}, 'Use esto si cambió de teléfono o reinstaló la aplicación de autenticación. Tenga a mano el teléfono nuevo.'),
    err,
    field({ label: 'Su contraseña', input: pw }),
    field({ label: 'Código actual', hint: 'Del teléfono anterior, o un código de recuperación si ya no lo tiene.', input: code }),
    h('div', { class: 'btns' }, go)));
  };
  const step2 = (r) => {
    const err = h('div', { 'aria-live': 'assertive' });
    const code = h('input', { class: 'input input--code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', required: true });
    const go = button('btn--mar', 'Confirmar', null, { type: 'submit' });
    body.replaceChildren(h('form', { onsubmit: async (e) => {
      e.preventDefault(); err.replaceChildren();
      busy(go, true, 'Verificando…');
      try {
        await api('POST', '/api/account/phone/finish', { changeId: r.changeId, code: code.value });
        state.notice = 'Listo. Desde ahora use los códigos del teléfono nuevo.';
        hooks.render();
      } catch (ex) { err.append(errorBox(msg(ex))); code.value = ''; code.focus(); } finally { busy(go, false, true); }
    } },
    h('p', {}, 'En el teléfono nuevo, abra la aplicación, toque «+» y escanee:'),
    h('img', { class: 'qr', src: r.qr, alt: 'Código QR para la aplicación de autenticación', width: '220', height: '220' }),
    h('details', {}, h('summary', { class: 'small' }, '¿No puede escanear? Escriba esta clave'), h('p', { class: 'secret' }, r.secret.replace(/(.{4})/g, '$1 ').trim())),
    err,
    field({ label: 'Código de 6 dígitos del teléfono nuevo', input: code }),
    h('div', { class: 'btns' }, go, button('btn--quiet', 'Cancelar', step1))));
    code.focus();
  };
  step1();
  return h('li', { class: 'sec' },
    h('div', { class: 'sec__head' }, h('span', { class: 'sec__num', 'aria-hidden': 'true' }, '03'),
      h('div', {}, h('h2', {}, 'Cambiar de teléfono'), h('p', {}, 'Mueva sus códigos a un teléfono nuevo sin ayuda.'))),
    body);
}

function renderSecurity(main) {
  const u = state.user;

  const pwErr = h('div', { 'aria-live': 'assertive' });
  const cur = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', required: true });
  const nw = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', minlength: '12', required: true });
  const nw2 = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', required: true });
  const pwCode = h('input', { class: 'input input--code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', required: true });
  const pwBtn = button('btn--mar', 'Cambiar contraseña', null, { type: 'submit' });

  const rcErr = h('div', { 'aria-live': 'assertive' });
  const rcCode = h('input', { class: 'input input--code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: '6', required: true });
  const rcBtn = button('btn--mar', 'Crear códigos nuevos', null, { type: 'submit' });

  main.replaceChildren(h('div', { class: 'wrap' },
    h('div', { class: 'page-head' },
      h('p', { class: 'eyebrow' }, 'Seguridad'),
      h('h1', {}, 'Su cuenta'),
      h('p', { class: 'muted' }, `Usuario: ${u.username}. Su cuenta está protegida con contraseña y un código de su teléfono.`),
      state.notice && h('div', { class: 'alert alert--ok', role: 'status' }, state.notice)),
    h('ol', { class: 'sections' },
      h('li', { class: 'sec' },
        h('div', { class: 'sec__head' }, h('span', { class: 'sec__num', 'aria-hidden': 'true' }, '01'), h('div', {}, h('h2', {}, 'Contraseña'), h('p', {}, 'Al cambiarla, se cierran sus otras sesiones.'))),
        h('form', { class: 'sec__body', onsubmit: async (e) => {
          e.preventDefault(); pwErr.replaceChildren();
          if (nw.value !== nw2.value) { pwErr.append(errorBox('Las contraseñas nuevas no coinciden.')); return; }
          busy(pwBtn, true, 'Guardando…');
          try {
            await api('POST', '/api/account/password', { current: cur.value, next: nw.value, code: pwCode.value });
            state.notice = 'Contraseña cambiada.'; hooks.render();
          } catch (ex) { pwErr.append(errorBox(msg(ex))); } finally { busy(pwBtn, false, true); }
        } },
        pwErr,
        field({ label: 'Contraseña actual', input: cur }),
        field({ label: 'Contraseña nueva', hint: 'Mínimo 12 caracteres.', input: nw }),
        field({ label: 'Repita la contraseña nueva', input: nw2 }),
        field({ label: 'Código de 6 dígitos de su aplicación', input: pwCode }),
        h('div', { class: 'btns' }, pwBtn))),
      h('li', { class: 'sec' },
        h('div', { class: 'sec__head' }, h('span', { class: 'sec__num', 'aria-hidden': 'true' }, '02'), h('div', {}, h('h2', {}, 'Códigos de recuperación'), h('p', {}, 'Para entrar si pierde su teléfono.'))),
        h('form', { class: 'sec__body', onsubmit: async (e) => {
          e.preventDefault(); rcErr.replaceChildren();
          busy(rcBtn, true, 'Creando…');
          try {
            const r = await api('POST', '/api/account/recovery', { code: rcCode.value });
            state.user.recoveryLeft = r.codes.length;
            renderRecoveryCodes(r.codes, u.username, () => { state.notice = 'Códigos nuevos guardados. Los anteriores ya no sirven.'; hooks.render(); });
          } catch (ex) { rcErr.append(errorBox(msg(ex))); } finally { busy(rcBtn, false, true); }
        } },
        h('p', {}, `Le quedan ${u.recoveryLeft} códigos sin usar.`),
        h('p', { class: 'hint' }, 'Crear códigos nuevos anula los anteriores.'),
        rcErr,
        field({ label: 'Código de 6 dígitos de su aplicación', input: rcCode }),
        h('div', { class: 'btns' }, rcBtn))),
      phoneSection(),
      h('li', { class: 'sec' },
        h('div', { class: 'sec__head' }, h('span', { class: 'sec__num', 'aria-hidden': 'true' }, '04'), h('div', {}, h('h2', {}, 'Sesiones'), h('p', {}, 'Por seguridad, la sesión se cierra sola tras 30 minutos sin actividad.'))),
        h('div', { class: 'sec__body' },
          h('p', {}, '¿Entró desde una computadora que no es suya, o cree que alguien más tiene acceso?'),
          h('div', { class: 'btns' }, button('btn--line', 'Cerrar todas las sesiones', async () => {
            if (!confirm('Se cerrará la sesión en todos los dispositivos, incluido este. ¿Continuar?')) return;
            await api('POST', '/api/account/signout-all', {}).catch(() => {});
            state.user = null; state.draft = null; state.authNotice = 'signed_out_all'; renderLogin();
          })))),
    )));
  state.notice = null;
}

// ── Activity ────────────────────────────────────────────────────────────
const EVENTS = {
  login: 'Entró al portal', logout: 'Salió', login_failed: 'Intento fallido de entrada', account_locked: 'Cuenta bloqueada temporalmente',
  published: 'Publicó cambios', password_changed: 'Cambió la contraseña', recovery_regenerated: 'Creó códigos de recuperación nuevos',
  signed_out_everywhere: 'Cerró todas las sesiones', authenticator_changed: 'Cambió de teléfono (autenticación)', account_created: 'Cuenta creada', bootstrap_login: 'Primer acceso con la contraseña inicial', account_reset: 'Cuenta restablecida', setup_failed: 'Intento fallido de configuración',
};
/** 'settings.insurance, practice.hours.es' → 'Planes médicos, Horario (español)'. */
const readableDetail = (e) => (e.event === 'published' && e.detail
  ? [...new Set(e.detail.replace(/ \(\+\d+\)$/, '').split(', ').map(labelFor))].join(', ')
  : e.detail);

async function renderActivity(main) {
  main.replaceChildren(h('p', { class: 'loading' }, 'Cargando…'));
  try {
    const { entries } = await api('GET', '/api/activity');
    main.replaceChildren(h('div', { class: 'wrap' },
      h('div', { class: 'page-head' }, h('p', { class: 'eyebrow' }, 'Actividad'), h('h1', {}, 'Registro'),
        h('p', { class: 'muted' }, 'Las últimas entradas, publicaciones y cambios de seguridad. Si ve algo que no reconoce, cambie su contraseña y avísele a Angel.')),
      entries.length ? h('ol', { class: 'log' }, entries.map((e) => h('li', {},
        h('time', { datetime: e.at }, new Date(e.at).toLocaleString('es-PR', { dateStyle: 'medium', timeStyle: 'short' })),
        h('div', {}, h('p', {}, `${EVENTS[e.event] || e.event} · ${e.user}`),
          h('p', { class: 'meta' }, [readableDetail(e), `IP ${e.ip}`].filter(Boolean).join(' · ')))))) : h('p', { class: 'muted' }, 'Todavía no hay actividad.')));
  } catch (ex) { main.replaceChildren(h('div', { class: 'wrap' }, errorBox(msg(ex)))); }
}

export { renderShell, renderEditor, renderSecurity, renderActivity };
