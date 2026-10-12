import practice from '../data/practice.json';
import settings from '../data/settings.json';
import es from '../i18n/es.json';
import en from '../i18n/en.json';

export type Lang = 'es' | 'en';
export type Strings = typeof es;

export const strings: Record<Lang, Strings> = { es, en };
export { practice, settings };

/** Root path of each language. */
export const langPath: Record<Lang, string> = { es: '/', en: '/en/' };

export const other = (lang: Lang): Lang => (lang === 'es' ? 'en' : 'es');

export const name = (lang: Lang) => ({
  short: lang === 'es' ? practice.name.es_short : practice.name.en_short,
  full: lang === 'es' ? practice.name.es_full : practice.name.en_full,
});

export const telHref = (tel: string) => `tel:${tel}`;

/** +17878487646 -> +1-787-848-7646 (schema.org style). */
const dashed = (e164: string) => e164.replace(/^\+1(\d{3})(\d{3})(\d{4})$/, '+1-$1-$2-$3');

/** Directions link, built from the address so the portal never stores a raw URL. */
export const mapsUrl = (() => {
  const a = practice.address;
  const q = [a.street, a.building, a.city, a.region, a.postal].filter(Boolean).join(' ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
})();

/**
 * JSON for an inline <script type="application/ld+json">. JSON.stringify alone
 * doesn't escape "</script>", so text edited in the portal could break out of
 * the tag. Escaping <, > and & keeps the JSON valid and inert.
 */
const BACKSLASH = String.fromCharCode(92);
const JSON_UNSAFE = new RegExp(`[<>&${String.fromCharCode(0x2028, 0x2029)}]`, 'g');
export const safeJson = (value: unknown) =>
  JSON.stringify(value).replace(JSON_UNSAFE, (c) => BACKSLASH + 'u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

/** Only ever link to Facebook over https, even if the data file says otherwise. */
export const facebookUrl = /^https:\/\/(www\.|m\.)?facebook\.com\/[^\s"<>]+$/.test(settings.facebook_url || '')
  ? settings.facebook_url
  : null;

export const whatsapp = settings.whatsapp_enabled && settings.whatsapp_number.replace(/\D/g, '')
  ? `https://wa.me/${settings.whatsapp_number.replace(/\D/g, '')}`
  : null;

/** Today's date (YYYY-MM-DD) in Puerto Rico, where the office is. */
export const todayPR = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Puerto_Rico' }).format(new Date());

/**
 * Announcement banner. Dates are inclusive and optional. The page also
 * re-checks the window in the browser, so a banner set weeks ahead appears
 * and disappears on time without a redeploy.
 */
export const announcement = (lang: Lang) => {
  const a = settings.announcement;
  const text = (a?.[lang] || '').trim();
  if (!a?.enabled || !text) return null;
  const start = a.start || '';
  const end = a.end || '';
  const today = todayPR();
  const activeAtBuild = (!start || today >= start) && (!end || today <= end);
  return { text, start, end, activeAtBuild };
};

/** schema.org Physician JSON-LD, using only confirmed data. */
export const jsonLd = (lang: Lang, url: string) => {
  const a = practice.address;
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Physician',
    name: practice.name.es_full,
    url,
    medicalSpecialty: ['Psychiatric'],
    telephone: dashed(practice.phone),
    email: practice.email,
    address: {
      '@type': 'PostalAddress',
      streetAddress: `${a.street}, ${a.building}`,
      addressLocality: a.city,
      addressRegion: a.region,
      postalCode: a.postal,
      addressCountry: a.country,
    },
    availableLanguage: practice.available_languages,
    isAcceptingNewPatients: settings.accepting_new_patients,
    description: practice.summary[lang],
  };
  if (facebookUrl) data.sameAs = [facebookUrl];
  return data;
};
