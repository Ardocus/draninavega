# Dra. Nina M. Vega Vázquez — website

Bilingual (Spanish-first) one-page site for a psychiatry practice in Ponce, PR.
Built from `DEV-HANDOFF.md` and the mockups in `design/`.

- `/` Spanish · `/en/` English
- Content is edited by the doctor at **admin.draninavega.com** (separate Netlify project in `admin/`)
- Static site built with [Astro](https://astro.build); hosted on Netlify. No server, no trackers, no third-party requests on the public pages.

## Run locally

Requires Node 22.12 or newer.

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # outputs dist/
npm run preview    # serves dist/
```

## Where things live

| What | File |
| --- | --- |
| Confirmed practice facts (name, address, phones, specialties) | `src/data/practice.json` |
| Office-editable toggles (§8): new patients, insurance, WhatsApp, fax, Facebook, announcement | `src/data/settings.json` (initial values; live values come from the portal) |
| All UI copy, per language | `src/i18n/es.json`, `src/i18n/en.json` |
| Design tokens and layout | `src/styles/global.css` |
| Page sections | `src/components/Home.astro` |
| Head, SEO, hreflang, JSON-LD, CSP | `src/layouts/Base.astro` |
| Language-switch and announcement-date script | `src/scripts/site.ts` |
| Netlify build, redirects, security headers | `netlify.toml` |
| Admin portal (separate Netlify project) | `admin/` |
| Security review | `SECURITY.md` |
| OG image and icons (source + renderer) | `scripts/og.html`, `npm run og` |

## Deploy to Netlify

1. **Code** lives at https://github.com/Ardocus/draninavega (branch `main`). Every push to `main` redeploys.
2. **Create the Netlify site.** In Netlify, choose *Add new project → Import an existing project → GitHub* and pick `Ardocus/draninavega`. The build settings are read from `netlify.toml` (`npm run build`, publish `dist`, Node 22), so leave the defaults.
3. **Add the domain.** Go to *Domain management → Add a domain* and enter `draninavega.com`. 
   At the registrar where the domain was bought, either point the nameservers to Netlify DNS, or add an `A` record for the apex to `75.2.60.5` and a `CNAME` for `www` to `<your-site>.netlify.app`.
   Set the apex as the primary domain; Netlify redirects `www` and provisions HTTPS (Let's Encrypt) on its own.
4. The production URL (`https://draninavega.com`) is already set in `astro.config.mjs`.
5. **Google.** Add the site to Google Search Console and submit `/sitemap.xml`. Make sure the Google Business Profile uses the same name, address and phone.

## Admin portal (`admin.draninavega.com`)

Dra. Vega updates the site herself through a private portal with two-factor login. It's a **second Netlify project** built from the `admin/` folder of this repo. Her content lives in the portal (Netlify Blobs); publishing calls this project's **build hook**, and the build pulls the content from the portal's `/api/export` (`scripts/fetch-content.mjs`, fails closed). Setup, environment variables and recovery steps: **[admin/README.md](admin/README.md)**. All env values: `node scripts/make-secrets.mjs`. Security review: **[SECURITY.md](SECURITY.md)**.

Git pushes that only touch `admin/` or docs don't rebuild the public site; build-hook builds always run (`ignore` rules in each `netlify.toml`). Without `ADMIN_EXPORT_URL` set, the public build uses the committed `src/data` files.

## Before launch — confirm with Dra. Vega (DEV-HANDOFF §3)

- [ ] WhatsApp number is the office line (portal → Teléfono y contacto)
- [ ] MCS Life is still accepted
- [ ] `accepting_new_patients` is still true
- [ ] OK to include the crisis-line footer (built in, recommended)
- [ ] OK to show the fax publicly (portal toggle)
- [ ] Whether the office serves patients in English (portal → Otros → «La oficina atiende pacientes en inglés»)
- [ ] Facebook page URL for the footer link (`facebook_url`, optional)
- [ ] Test on a 360px Android phone and an iPhone with a home indicator; check VoiceOver in Spanish

## Privacy rules (DEV-HANDOFF §9.4)

No analytics, ad pixels, session replay, Facebook embeds, CDN scripts or Google Fonts CDN. Fonts are self-hosted in `public/fonts/`. If analytics are wanted later, use a cookieless tool and get counsel's OK first. Don't add any form that could collect health information until a HIPAA-appropriate setup exists (§9.2).
