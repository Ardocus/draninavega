// Runs before `astro build`. Pulls the doctor's latest content from the admin
// portal's /api/export and writes it into src/data/ for this build only.
//
//   ADMIN_EXPORT_URL + EXPORT_TOKEN set (Netlify, public project): fetch, check, write.
//   ADMIN_EXPORT_URL not set (local dev, first deploy): keep the committed src/data files.
//
// Fails the build (exit 1) on any problem, so a bad or unreachable export never
// replaces the live site with something broken. The portal already validates
// every field; this is the second, independent check.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const data = (f) => path.join(root, 'src', 'data', f);
const url = (process.env.ADMIN_EXPORT_URL || '').trim();
const token = (process.env.EXPORT_TOKEN || '').trim();

const fail = (why) => {
  console.error(`fetch-content: ${why}`);
  process.exit(1);
};

if (!url) {
  console.log('fetch-content: ADMIN_EXPORT_URL not set, using the committed src/data files.');
  process.exit(0);
}
if (!/^https:\/\//.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) fail('ADMIN_EXPORT_URL must be https.');
if (token.length < 32) fail('EXPORT_TOKEN is missing or too short.');

let res;
try {
  res = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
} catch (e) {
  fail(`could not reach the portal (${e.message}).`);
}
if (!res.ok) fail(`the portal answered ${res.status}. Check EXPORT_TOKEN matches on both Netlify projects.`);
const body = await res.json().catch(() => fail('the portal did not return JSON.'));

// ── Shape check (the types and fields the templates rely on) ─────────────
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v, max = 400) => typeof v === 'string' && v.length <= max;
const strs = (v, max) => Array.isArray(v) && v.every((x) => isStr(x, max));
const need = (ok, what) => { if (!ok) fail(`export rejected: ${what}`); };

const { practice: p, settings: s, version } = body;
need(isObj(p) && isObj(s), 'missing practice/settings');
need(Number.isInteger(version) && version > 0, 'bad version');
for (const k of ['es_short', 'es_full', 'en_short', 'en_full']) need(isStr(p.name?.[k], 80) && p.name[k], `name.${k}`);
for (const k of ['tagline', 'summary', 'hours']) need(isStr(p[k]?.es) && isStr(p[k]?.en) && p[k].es && p[k].en, k);
need(strs(p.specialties?.es, 160) && strs(p.specialties?.en, 160) && p.specialties.es.length === p.specialties.en.length, 'specialties');
need(strs(p.certifications, 160), 'certifications');
for (const k of ['street', 'city', 'region', 'postal']) need(isStr(p.address?.[k], 100) && p.address[k], `address.${k}`);
need(/^\+1\d{10}$/.test(p.phone) && isStr(p.phone_display, 20), 'phone');
need(isStr(p.email, 120) && /^[^\s@<>]+@[^\s@<>]+$/.test(p.email), 'email');
need(strs(p.available_languages, 2), 'available_languages');
// The crisis block must always ship (DEV-HANDOFF §1.3).
need(Array.isArray(p.crisis_lines) && p.crisis_lines.length === 2 && p.crisis_lines.every((l) => isStr(l.label, 40) && /^\+?\d{3,15}$/.test(l.tel)), 'crisis_lines');
need(typeof s.accepting_new_patients === 'boolean' && typeof s.whatsapp_enabled === 'boolean', 'settings toggles');
need(strs(s.insurance, 80), 'insurance');
need(isStr(s.whatsapp_number, 15) && /^\d*$/.test(s.whatsapp_number), 'whatsapp_number');
need(isStr(s.facebook_url, 200), 'facebook_url');
need(isObj(s.announcement) && typeof s.announcement.enabled === 'boolean', 'announcement');

const json = (o) => `${JSON.stringify(o, null, 2)}\n`;
await writeFile(data('practice.json'), json(p));
await writeFile(data('settings.json'), json(s));
await writeFile(data('meta.json'), json({ content: version }));
console.log(`fetch-content: using portal content v${version} (${body.updatedAt || 'no date'}).`);
