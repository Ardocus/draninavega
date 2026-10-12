// Server-side schema for the two data files the portal may write.
// The client's payload is never written as-is: every value is checked and
// copied into a fresh object, so unknown keys are dropped. Fields the portal
// must not change (crisis lines, country) are carried over from the repo.
import { HttpError } from './http.mts';

/** C0/C1 control characters (built from code points to keep the source plain ASCII). */
const CONTROL_CHARS = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(31)}${String.fromCharCode(127)}-${String.fromCharCode(159)}]`);

type Obj = Record<string, unknown>;
interface Issue { path: string; msg: string }

class V {
  issues: Issue[] = [];
  fail(path: string, msg: string) { this.issues.push({ path, msg }); }

  obj(v: unknown, path: string): Obj {
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Obj;
    this.fail(path, 'Falta esta sección.');
    return {};
  }

  /** Single-line text: trimmed, NFC, no control characters. */
  text(v: unknown, path: string, { min = 1, max = 120 } = {}) {
    if (typeof v !== 'string') { this.fail(path, 'Debe ser texto.'); return ''; }
    const s = v.normalize('NFC').replace(/\s+/g, ' ').trim();
    if (CONTROL_CHARS.test(s)) this.fail(path, 'Contiene caracteres no permitidos.');
    else if (s.length < min) this.fail(path, min === 1 ? 'Este campo es obligatorio.' : `Mínimo ${min} caracteres.`);
    else if (s.length > max) this.fail(path, `Máximo ${max} caracteres.`);
    return s;
  }

  optText(v: unknown, path: string, max = 120) {
    return typeof v === 'string' && v.trim() === '' ? '' : this.text(v, path, { max });
  }

  bool(v: unknown, path: string) {
    if (typeof v !== 'boolean') this.fail(path, 'Valor inválido.');
    return v === true;
  }

  list(v: unknown, path: string, { min = 0, max = 20 } = {}) {
    if (!Array.isArray(v)) { this.fail(path, 'Debe ser una lista.'); return []; }
    if (v.length < min) this.fail(path, `Añada al menos ${min}.`);
    if (v.length > max) this.fail(path, `Máximo ${max} elementos.`);
    return v.slice(0, max);
  }

  /** Puerto Rico / US 10-digit number. Returns display "(787) 555-1234" and E.164. */
  phone(v: unknown, path: string) {
    const digits = (typeof v === 'string' ? v : '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
    if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) {
      this.fail(path, 'Escriba un número de 10 dígitos, por ejemplo (787) 848-7646.');
      return { display: '', e164: '' };
    }
    return { display: `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`, e164: `+1${digits}` };
  }

  email(v: unknown, path: string) {
    const s = this.text(v, path, { max: 120 }).toLowerCase();
    if (s && !/^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(s)) this.fail(path, 'Correo electrónico inválido.');
    return s;
  }

  date(v: unknown, path: string) {
    if (v === '' || v == null) return '';
    const s = typeof v === 'string' ? v : '';
    const d = new Date(`${s}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
      this.fail(path, 'Fecha inválida.');
      return '';
    }
    return s;
  }
}

export function validate(input: Obj, current: { practice: Obj; settings: Obj }) {
  const v = new V();
  const p = v.obj(input.practice, 'practice');
  const s = v.obj(input.settings, 'settings');

  // ── practice.json ──
  const name = v.obj(p.name, 'practice.name');
  const tagline = v.obj(p.tagline, 'practice.tagline');
  const specialties = v.obj(p.specialties, 'practice.specialties');
  const summary = v.obj(p.summary, 'practice.summary');
  const address = v.obj(p.address, 'practice.address');
  const hours = v.obj(p.hours, 'practice.hours');

  const specEs = v.list(specialties.es, 'practice.specialties', { min: 1, max: 8 }).map((x, i) => v.text(x, `practice.specialties.es.${i}`, { max: 120 }));
  const specEn = v.list(specialties.en, 'practice.specialties', { min: 1, max: 8 }).map((x, i) => v.text(x, `practice.specialties.en.${i}`, { max: 120 }));
  if (specEs.length !== specEn.length) v.fail('practice.specialties', 'Cada especialidad necesita su versión en inglés.');

  const phone = v.phone(p.phone_display, 'practice.phone_display');
  const fax = v.phone(p.fax_display, 'practice.fax_display');
  const postal = v.text(address.postal, 'practice.address.postal', { max: 10 });
  if (postal && !/^\d{5}(-\d{4})?$/.test(postal)) v.fail('practice.address.postal', 'Código postal inválido (5 dígitos).');
  const region = v.text(address.region, 'practice.address.region', { max: 2 }).toUpperCase();
  if (region && !/^[A-Z]{2}$/.test(region)) v.fail('practice.address.region', 'Use 2 letras, por ejemplo PR.');

  const englishOK = v.bool(p.serves_english, 'practice.serves_english');

  const practice = {
    name: {
      es_short: v.text(name.es_short, 'practice.name.es_short', { min: 2, max: 60 }),
      es_full: v.text(name.es_full, 'practice.name.es_full', { min: 2, max: 80 }),
      en_short: v.text(name.en_short, 'practice.name.en_short', { min: 2, max: 60 }),
      en_full: v.text(name.en_full, 'practice.name.en_full', { min: 2, max: 80 }),
    },
    tagline: {
      es: v.text(tagline.es, 'practice.tagline.es', { min: 2, max: 100 }),
      en: v.text(tagline.en, 'practice.tagline.en', { min: 2, max: 100 }),
    },
    specialties: { es: specEs, en: specEn },
    summary: {
      es: v.text(summary.es, 'practice.summary.es', { min: 2, max: 240 }),
      en: v.text(summary.en, 'practice.summary.en', { min: 2, max: 240 }),
    },
    certifications: v.list(p.certifications, 'practice.certifications', { max: 8 })
      .map((x, i) => v.text(x, `practice.certifications.${i}`, { min: 2, max: 160 })),
    address: {
      street: v.text(address.street, 'practice.address.street', { min: 2, max: 100 }),
      building: v.optText(address.building, 'practice.address.building', 100),
      city: v.text(address.city, 'practice.address.city', { min: 2, max: 60 }),
      region,
      postal,
      country: 'US',
    },
    phone: phone.e164,
    phone_display: phone.display,
    fax: fax.e164,
    fax_display: fax.display,
    email: v.email(p.email, 'practice.email'),
    hours: {
      es: v.text(hours.es, 'practice.hours.es', { min: 2, max: 80 }),
      en: v.text(hours.en, 'practice.hours.en', { min: 2, max: 80 }),
    },
    available_languages: englishOK ? ['es', 'en'] : ['es'],
    // Safety content: never editable from the portal.
    crisis_lines: current.practice.crisis_lines,
  };

  // ── settings.json ──
  const ann = v.obj(s.announcement, 'settings.announcement');
  const insurance = v.list(s.insurance, 'settings.insurance', { max: 30 })
    .map((x, i) => v.text(x, `settings.insurance.${i}`, { min: 2, max: 80 }));
  if (new Set(insurance.map((x) => x.toLowerCase())).size !== insurance.length) v.fail('settings.insurance', 'Hay un plan repetido.');

  const waEnabled = v.bool(s.whatsapp_enabled, 'settings.whatsapp_enabled');
  const wa = waEnabled || (typeof s.whatsapp_number === 'string' && s.whatsapp_number.trim())
    ? v.phone(s.whatsapp_number, 'settings.whatsapp_number')
    : { e164: '' };

  const fb = typeof s.facebook_url === 'string' ? s.facebook_url.trim() : '';
  if (fb && (fb.length > 200 || !/^https:\/\/(www\.|m\.)?facebook\.com\/[A-Za-z0-9._\-/?=&%]+$/.test(fb))) {
    v.fail('settings.facebook_url', 'Debe ser un enlace de Facebook que empiece con https://www.facebook.com/');
  }

  const annEnabled = v.bool(ann.enabled, 'settings.announcement.enabled');
  const annEs = v.optText(ann.es, 'settings.announcement.es', 160);
  const annEn = v.optText(ann.en, 'settings.announcement.en', 160);
  const start = v.date(ann.start, 'settings.announcement.start');
  const end = v.date(ann.end, 'settings.announcement.end');
  if (annEnabled && !annEs) v.fail('settings.announcement.es', 'Escriba el aviso en español.');
  if (annEnabled && !annEn) v.fail('settings.announcement.en', 'Escriba el aviso en inglés.');
  if (start && end && end < start) v.fail('settings.announcement.end', 'La fecha final es antes de la inicial.');

  const settings = {
    accepting_new_patients: v.bool(s.accepting_new_patients, 'settings.accepting_new_patients'),
    insurance,
    whatsapp_enabled: waEnabled,
    whatsapp_number: wa.e164.replace(/^\+/, ''),
    show_fax: v.bool(s.show_fax, 'settings.show_fax'),
    facebook_url: fb,
    announcement: { enabled: annEnabled, es: annEs, en: annEn, start, end },
  };

  if (v.issues.length) throw new HttpError(422, 'invalid_content', { issues: v.issues });
  return { practice, settings };
}

/** Shape sent to the browser: practice.json plus the derived `serves_english` flag. */
export function toClient(practice: Obj, settings: Obj) {
  const langs = Array.isArray(practice.available_languages) ? practice.available_languages : [];
  return { practice: { ...practice, serves_english: langs.includes('en') }, settings };
}

/** Dotted paths whose values differ, for the commit message and activity log. */
export function changedPaths(a: unknown, b: unknown, prefix = ''): string[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = new Set([...Object.keys(a as Obj), ...Object.keys(b as Obj)]);
    return [...keys].flatMap((k) => changedPaths((a as Obj)[k], (b as Obj)[k], prefix ? `${prefix}.${k}` : k));
  }
  return [prefix];
}

