# Dra. Nina M. Vega — Website Developer Handoff

Bilingual (Spanish-first) marketing site for a psychiatry practice in Ponce, Puerto Rico. This file covers everything needed to build the mockup to production and the hooks left open for later integrations.

| Resource | Link |
| --- | --- |
| Mockup canvas (desktop + mobile, ES + EN) | https://claude.ai/artifact/KPxY469TnTzbAVenYV5Kgo |
| Design system "Perla del Sur" (tokens, components, brand guide) | https://claude.ai/artifact/TW9yrKV3S387dM2iAd29Cv |

Both links are private until the owner shares them. Ask Angel Santiago for access.

---

## Project context

### What this is
A first website for **Dra. Nina M. Vega Vázquez**, a board-certified psychiatrist in private practice in Ponce, on Puerto Rico's south coast. She treats adults and has a sub-specialty in child and adolescent psychiatry. She sees patients by appointment only, from a suite in the Edificio Marvesa on Ave. Tito Castro.

### Why it's being built
Today the practice has no website. Its online presence is:
- a Facebook page (about 220 followers)
- flyers posted there, such as "accepting new patients", the insurance list, a staff hiring post, and holiday closures
- a printed business card

Patients currently find her through word of mouth, Facebook, or insurance directories, then call to book.

The site's job is simple: help a prospective patient, or a parent looking for help for their child, confirm three things fast:
1. She's the right kind of doctor.
2. She takes their insurance.
3. How to reach her.

Then the site gets them to call. It is not a content or marketing site.

### Who it's for
- **Primary:** Spanish-speaking adults in Ponce and the south region. Many visit on phones, and some are older Medicare Advantage patients.
- **Secondary:** parents and caregivers seeking child and adolescent psychiatry, a scarce specialty on the island.
- **Tertiary:** English-speaking or bilingual visitors (hence `/en`), plus referring providers who need the address, fax and credentials.

Visitors may be anxious or in a hard moment. The design and copy aim to feel calm, local and trustworthy, and to make the next step obvious.

### People
| Role | Person | Responsibility |
| --- | --- | --- |
| Client / subject matter | Dra. Nina M. Vega Vázquez | Final approval of all facts and Spanish copy |
| Project lead / design owner | Angel Santiago (her son) | Design direction, English copy review, developer contact |
| Development | You | Build, hosting, integrations |

Route content questions through Angel. Don't contact patients or post on the practice's social accounts.

### Design direction, in brief
The visual system is called **"Perla del Sur"** after Ponce's nickname. It was built deliberately to avoid the generic template look (dark navy, gradients, rounded card grids, stock icons). Everything traces back to something real:
- the aqua of her existing logo
- the teal of her flyers
- the Roman-capital letters of her office wall sign
- the limestone, flamboyán trees, sunflowers and arched doorways of Ponce

Please preserve that intent. When in doubt, choose plain, spacious and editorial over decorated.

### Scope
**v1 (this handoff)**
- One-page site in Spanish and English: hero, specialties and certifications, insurance, contact, footer with crisis lines
- Responsive down to 360px
- Call, WhatsApp and directions links
- Basic CMS toggles (§8)

**Out of scope for v1, with room left for later (§9)**
- Embedded map
- Online appointment requests or booking
- Patient portal
- FAQ or extra pages
- Analytics

**Not planned**
- Blog or health articles
- Testimonials or reviews
- Live chat
- Social media feeds

### Status
The design is approved in principle. The mockup and design system are final for v1 layout and style. A handful of facts still need the doctor's confirmation before launch (§3). No domain or hosting has been chosen yet.

---

## 1. Ground rules

1. **Only verified facts.** Every piece of copy comes from the doctor's business card, flyers, or Facebook page (see §3). Do not add bios, service descriptions, testimonials, stats or stock photos. If something isn't confirmed, leave it out rather than shipping a placeholder.
2. **Spanish first.** Spanish is the primary audience. English is an adaptation, not a literal translation.
3. **Not an emergency service.** The crisis-line block in the footer must ship on every page, in both languages.
4. **No patient health information through the website** until a HIPAA-appropriate setup exists (see §9).

---

## 2. Site map and routes

| Route | Language | Mockup artboard |
| --- | --- | --- |
| `/` | Spanish (default) | `Main.dc.html` / `Movil.dc.html` |
| `/en` | English | `EN.dc.html` / `MobileEN.dc.html` |

The site is a single page with anchor sections:

| Section | ES anchor | EN anchor |
| --- | --- | --- |
| Hero | `#inicio` | `#home` |
| Specialties + certifications | `#especialidades` | `#specialties` |
| Insurance plans | `#planes` | `#insurance` |
| Contact | `#contacto` | `#contact` |

The structure is built to grow: future sections (e.g. `/citas` booking, `/preguntas` FAQ) can become their own routes using the same section patterns.

### i18n requirements
- `<html lang="es">` on `/` and `<html lang="en">` on `/en`.
- Add `<link rel="alternate" hreflang="es" href="…/">`, `hreflang="en"` → `/en`, and `hreflang="x-default"` → `/`.
- Mark inline foreign-language text with `lang` (e.g. the Spanish tagline on the English page, and the English certification titles on the Spanish page are already marked `lang` in the mockup).
- The language switch (header pill + footer link) goes to the **same section** in the other language when possible.
- Keep all copy in locale files (`es.json`, `en.json`), not hard-coded, so Angel can review the English separately.

---

## 3. Content: source of truth

All of this is confirmed. Store it as data (e.g. `practice.json`), not in templates.

```json
{
  "name": {
    "es_short": "Dra. Nina M. Vega",
    "es_full": "Dra. Nina M. Vega Vázquez",
    "en_short": "Dr. Nina M. Vega",
    "en_full": "Dr. Nina M. Vega Vázquez"
  },
  "tagline": {
    "es": "Su bienestar es nuestra meta",
    "en": "Your well-being is our goal"
  },
  "specialties": {
    "es": ["Psiquiatra general", "Sub-especialista en niños y adolescentes"],
    "en": ["General psychiatry", "Child & adolescent psychiatry (sub-specialty)"]
  },
  "summary": {
    "es": "Psiquiatra de adultos, niños y adolescentes. Horario por cita previa.",
    "en": "Psychiatrist for adults, children and adolescents. By appointment only."
  },
  "certifications": [
    "Diplomate of the American Board of Psychiatry & Neurology",
    "Diplomate of the American Board of Child and Adolescent Psychiatry"
  ],
  "address": {
    "street": "472 Ave. Tito Castro",
    "building": "Edificio Marvesa, Suite 401",
    "city": "Ponce",
    "region": "PR",
    "postal": "00716",
    "country": "US"
  },
  "phone": "+17878487646",
  "phone_display": "(787) 848-7646",
  "fax_display": "(787) 290-7722",
  "email": "draninavega@yahoo.com",
  "hours": { "es": "Por cita previa", "en": "By appointment only" },
  "accepting_new_patients": true,
  "insurance": [
    "Triple-S Medicare Advantage",
    "MCS Classicare",
    "MCS Comercial",
    "MCS Life",
    "Medicare"
  ],
  "crisis_lines": [
    { "label": "988", "tel": "988", "note_es": "llamada o texto", "note_en": "call or text" },
    { "label": "Línea PAS", "tel": "+18009810023", "display": "1-800-981-0023" }
  ]
}
```

Certifications are shown in English on both pages, exactly as on her card.

### Confirm with the doctor before launch
| Item | Why |
| --- | --- |
| WhatsApp number | Her Facebook page has a WhatsApp button; the mockup assumes it's the office line (`wa.me/17878487646`). |
| MCS Life | Listed on her Aug 2026 post, not on an older flyer. Confirm it's still accepted. |
| `accepting_new_patients` | From the Aug 2026 post. Must be easy to switch off (see §8). |
| Crisis-line block | Not from her own materials. Strongly recommended for a psychiatry site; her call. Numbers verified current per ASSMCA (Aug 2025). |
| Fax on the website | It's on her card; confirm she wants it public. |

---

## 4. Design tokens

The mockup uses hex values inline. Production should use these as CSS custom properties. Source: `project/tokens.json` in the design system.

```css
:root, [data-theme="dia"] {
  --cal: #F5EFE4;          /* page ground, limestone */
  --cal-100: #EDE4D3;      /* alternating bands */
  --papel: #FBF8F2;        /* inputs, dialogs */
  --tinta: #16332F;        /* primary text */
  --tinta-suave: #4F625D;  /* secondary text */
  --linea: #CFC3AE;        /* hairline rules (decorative) */
  --mar: #0E6B63;          /* brand teal: links, secondary buttons, numerals */
  --on-mar: #FFFFFF;
  --vidrio: #A6D9D3;       /* sea-glass bands (logo color) */
  --girasol: #D9A33A;      /* sunflower accents, never text */
  --flamboyan: #B8432A;    /* the ONE booking CTA per view */
  --on-flamboyan: #FFFFFF;
  --uva: #5E7A3C;          /* illustration only */
  --foco: #0E6B63;         /* focus ring */
}
[data-theme="noche"] {
  --cal: #10221F; --cal-100: #16302B; --papel: #1A3631;
  --tinta: #F1EADC; --tinta-suave: #A9BAB4; --linea: #2E4A44;
  --mar: #5FC0B4; --on-mar: #10221F; --vidrio: #1E4642;
  --girasol: #E6B656; --flamboyan: #E8704F; --on-flamboyan: #10221F;
  --uva: #93B068; --foco: #A6D9D3;
}
```

The mockup only shows the Día (light) theme. Noche (dark) is defined and contrast-checked but optional for v1. Footer-only colors used in the mockup: `#3E5A55` (divider) and `#C9D6D2` (muted text on `--tinta`).

**Contrast:** every text pairing passes WCAG AA. Never put `--girasol` or `--uva` behind or as small text.

### Type
| Role | Font | Notes |
| --- | --- | --- |
| Display | **Marcellus** (Google Fonts, 400 only) | Name, headlines, numerals, insurance list. Never bold or italic. |
| Text | **Atkinson Hyperlegible Next** (Google Fonts, 400/700) | Fallback stack: `"Atkinson Hyperlegible", system-ui, sans-serif`. |

Body text minimum is 18px; small text minimum is 15px. Self-host the fonts in production (`woff2`) instead of the Google Fonts CDN; this is faster and avoids sending visitor IPs to a third party.

### Spacing and radius
Spacing scale: 4, 8, 16, 24, 40, 64, 104, 168 px. Radius: `0` (default), `4px` (buttons, inputs), `999px 999px 0 0` (arch frames, top corners only), `999px` (status pill).

---

## 5. Layout patterns (no card grids)

| Pattern | Where | Spec |
| --- | --- | --- |
| Full-bleed bands | Sections | Alternate `--cal`, `--cal-100`, `--vidrio`. Content max-width 1240px, gutter `clamp(16px, 4vw, 40px)`. |
| Numbered rows | Specialties | Marcellus numeral in `--mar`, title, hairline `--linea` below. |
| Typeset list | Insurance | Marcellus, 1px `--tinta` rules on `--vidrio`. |
| Definition list | Contact | `<dl>`; 140px label column wraps under on mobile. |
| Arch frame | Hero art, map area | `border-radius: 999px 999px 0 0`, 3:4. Decorative (`aria-hidden`). |
| Gold rule | Under hero name | 112 × 3px `--girasol`. |
| Status pill | "Aceptando pacientes nuevos" | Gold dot + uppercase label. Toggle-driven (§8). |

Section headers always pair an uppercase tracked eyebrow (13px, 700, `letter-spacing: .16em`) above a Marcellus headline.

---

## 6. Responsive behavior

| Breakpoint | Behavior |
| --- | --- |
| ≥1025px | Desktop layout as drawn at 1440. |
| 641–1024px | Same layout; hero art capped at 300px. |
| ≤640px | Mobile rules below. |

Mobile rules (classes prefixed `m-` in the mockup):
- `.m-nav`: header nav becomes one horizontally scrollable row (no hamburger needed for 4 items).
- `.m-btns`: CTA groups stack, full width, centered labels.
- `.m-hero-art`: hero arch shrinks to 200px; `.m-hide` removes the second arch and the map illustration.
- `.m-crisis`: footer crisis block drops its fixed basis so it can't overflow.
- `.m-bar`: a **sticky bottom bar** with "Llamar / Call" (`--flamboyan`) and "WhatsApp" (`--mar`). It is 52px tall, pads for `env(safe-area-inset-bottom)`, and adds 88px bottom padding to the page so nothing hides behind it.

Fluid type uses `clamp()`. The hero name is `clamp(46px, 7.4vw, 104px)` and wraps to two lines on phones by design. Add `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` (`viewport-fit=cover` is required for the safe-area padding).

---

## 7. Accessibility checklist

- Real `<a href>` for every action: `tel:`, `mailto:`, `https://wa.me/…`, and the maps link. Tap targets are at least 44px.
- Visible focus: `outline: 2px solid var(--foco); outline-offset: 3px`. Never remove it.
- Decorative SVGs and arches have `aria-hidden="true"`.
- Landmarks: `header`, `nav` (labelled), `main` (add it in prod; the mockup omits it), `footer`. The sticky bar is a second `nav` labelled "Contacto rápido / Quick contact".
- Headings: one `h1` per page, `h2` per section, `h3` for rows.
- Respect `prefers-reduced-motion` if any animation is added. The design has none.
- Test with VoiceOver in Spanish; screen readers switch pronunciation from the `lang` attributes.

---

## 8. Content management

The doctor's office will need to change a few things without a developer:

| Setting | Type | Effect |
| --- | --- | --- |
| `accepting_new_patients` | boolean | Shows/hides the hero status pill. |
| `insurance[]` | list | Renders the insurance section. |
| `whatsapp_enabled` / `whatsapp_number` | boolean / string | Shows/hides WhatsApp buttons and sets the link. |
| `announcement` (optional) | `{es, en, start, end}` | A one-line banner for closures, e.g. her Christmas break posts ("Receso Navideño"). Not in the mockup; place it above the header, `--vidrio` background. |

A headless CMS or even a single JSON file in the repo works. Keep schema keys in English and values per locale.

---

## 9. Integration points (left open)

Each of these has a defined spot in the layout so it can be added without redesign.

### 9.1 Maps
- **Now:** the "Cómo llegar / Get directions" button opens `https://www.google.com/maps/search/?api=1&query=472+Ave+Tito+Castro+Edificio+Marvesa+Ponce+PR+00716`.
- **Later:** replace the decorative arch in the contact section (`.m-hide` block, right column) with a map inside the same arch shape (`border-radius: 999px 999px 0 0; overflow: hidden`).
  - Options: Google Maps Embed API (needs an API key; restrict it by HTTP referrer), or a static map image linked to the directions URL. The static image is lighter and has no third-party script.
  - Lazy-load the embed (`loading="lazy"`) or load it on click. On mobile keep it hidden or show a short static strip; don't add a full embed above the fold.
- Verify the pin location with the office; geocoders sometimes mis-place building suites.

### 9.2 Appointment requests / booking
- **Now:** every CTA is `tel:+17878487646` (plus WhatsApp). This is intentional: she schedules "por cita previa" by phone.
- **Later options, from simplest:**
  1. **Callback request form** collecting only name, phone, preferred language, and preferred contact time, with **no free-text reason field** so no health information can enter. Send it to the office by email or SMS.
  2. **Third-party scheduling** (EHR-integrated or standalone). It must be a vendor that signs a **HIPAA Business Associate Agreement**. Embed it on a dedicated `/citas` (`/en/book`) route and keep the main page's CTA pointing there.
  3. **EHR patient portal** link, if her electronic records system offers one.
- The single coral `--flamboyan` button per view is the booking entry point; swap its `href`, not the design.
- Any form needs: labels, inline errors in both languages, spam protection that doesn't break screen readers (prefer a honeypot or a privacy-friendly service over image CAPTCHAs), and a confirmation message saying the office will call back. Include a note that it's not for emergencies, with the crisis lines.

### 9.3 Email
The practice uses a Yahoo address. If a custom domain is set up, recommend domain email (`info@…`), and do not route form submissions containing anything beyond contact details through standard email.

### 9.4 Analytics and tracking
- Psychiatry pages are sensitive. **Do not install ad pixels** (Meta, TikTok, etc.) or session-replay tools.
- If analytics are wanted, use a cookieless, privacy-focused tool with IP anonymization, and only on aggregate page views.
- HHS has issued guidance on tracking technologies on HIPAA-covered entities' websites. Parts have been litigated, so have the practice's counsel confirm before adding any tracker.

### 9.5 Social
The Facebook page can be linked in the footer (icon plus label), opening in a new tab. Don't embed the Facebook feed; it loads Meta tracking scripts.

### 9.6 Future pages
The patterns already support FAQ (numbered rows), forms for new patients (on `--papel` inputs), and a downloadable intake PDF. Get content for these from the doctor; don't draft medical content.

---

## 10. SEO and metadata

- Titles: `Dra. Nina M. Vega Vázquez · Psiquiatra en Ponce` / `Dr. Nina M. Vega Vázquez · Psychiatrist in Ponce`.
- Meta descriptions: reuse the `summary` strings plus the city.
- JSON-LD on both pages, using only confirmed data:

```json
{
  "@context": "https://schema.org",
  "@type": "Physician",
  "name": "Dra. Nina M. Vega Vázquez",
  "medicalSpecialty": ["Psychiatric"],
  "telephone": "+1-787-848-7646",
  "faxNumber": "+1-787-290-7722",
  "email": "draninavega@yahoo.com",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "472 Ave. Tito Castro, Edificio Marvesa, Suite 401",
    "addressLocality": "Ponce",
    "addressRegion": "PR",
    "postalCode": "00716",
    "addressCountry": "US"
  },
  "availableLanguage": ["es"],
  "isAcceptingNewPatients": true
}
```

- Keep `isAcceptingNewPatients` tied to the CMS toggle.
- Add English to `availableLanguage` only if she confirms the office serves patients in English.
- Make sure the Google Business Profile shows the same name, address and phone.
- Open Graph image: generate one from the design (`--cal` ground, Marcellus name, `--vidrio` arch). Don't use stock photography.

---

## 11. Assets

| Asset | Status |
| --- | --- |
| Logo | No vector exists. Use the Marcellus wordmark. Recreate the circular aqua logo with the sunflower as SVG before launch if she wants it. |
| Sunflower / sea-grape line drawing | Inline SVG in the mockup hero; extract it to `/assets/motif.svg`. |
| Office sign photo | On her Facebook page. Get the original file from the office if it's to appear on the site. |
| Favicon | Gold sunflower circle on `--cal`, or "NV" in Marcellus. |

---

## 12. Build notes

- Stack-agnostic. A static site (Astro, Eleventy, Next static export) fits; there's no server need until booking forms.
- The mockup's `.dc.html` files are design references, not production code. Rebuild with semantic components using the tokens above.
- Performance targets: LCP under 2s on 4G. The hero has no images, so this is easy if fonts are self-hosted with `font-display: swap` and preloaded.
- Test on a small Android phone (360px) and an iPhone with a home indicator.
