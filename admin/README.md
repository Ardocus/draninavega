# Portal administrativo — admin.draninavega.com

A private portal where Dra. Vega updates her website herself. Sign-in screens in Spanish or English (toggle), editor in Spanish; password + authenticator-app login; no source code involved.

**How it works** (same pattern as the Wizarding World workspace):

```
 admin.draninavega.com (this folder)                 draninavega.com (repo root)
┌──────────────────────────────────┐  build hook   ┌──────────────────────────────┐
│ edge gate ─ sign-in ─ editor     │ ────────────▶ │ scripts/fetch-content.mjs     │
│ /api (function)                  │               │  GET /api/export (EXPORT_TOKEN)│
│ Netlify Blobs: content, users,   │ ◀──────────── │  shape check, fail closed      │
│   sessions, activity log         │  EXPORT_TOKEN │ astro build → static site      │
└──────────────────────────────────┘               └──────────────────────────────┘
```

She edits → **Publicar** saves a new content version in Blobs (last 20 kept) and calls the public site's build hook → the public build fetches `/api/export` → ~1–2 min later the portal shows "Sus cambios ya están en la página". Nothing in this project can change the site's code: there is no GitHub token.

| What she can change | Notes |
| --- | --- |
| Announcement banner (ES/EN, optional dates) | Holiday closures etc. |
| "Aceptando pacientes nuevos" | On/off |
| Insurance plans | Add, remove, reorder |
| Phone, fax (+ show/hide), email, WhatsApp (+ on/off), hours | Phones are normalized to (787) 555-1234 |
| Address | The "Cómo llegar" link is built from it |
| Specialties (ES/EN), certifications | |
| Tagline, summary, name (ES/EN) | |
| Facebook link, "serves patients in English" | |

Locked on purpose: the crisis-line block (988 / Línea PAS) and the page layout/design.

---

## Setup

### 1. Generate the values
At the repo root:
```bash
node scripts/make-secrets.mjs
```
It prints every variable for **both** Netlify projects (nothing is written to disk). Keep the terminal open while you paste. Save `SESSION_SECRET` in your password manager.

### 2. Admin project (Netlify)
*Add new project → Import an existing project → GitHub → `Ardocus/draninavega`* → **Base directory: `admin`** → Deploy.

**Environment variables** (Project configuration → Environment variables). Scope: **Functions** if offered; tick *Contains secret values* on the secrets:

| Key | Value | Secret |
| --- | --- | --- |
| `SESSION_SECRET` | from make-secrets | ✅ |
| `EXPORT_TOKEN` | from make-secrets | ✅ |
| `BOOTSTRAP_PASSWORD` | the first-sign-in password you chose (12+ characters) | ✅ |
| `ADMIN_ORIGIN` | `https://admin.draninavega.com` (no trailing slash) | |
| `PUBLIC_SITE_URL` | `https://draninavega.com` | |
| `PUBLIC_BUILD_HOOK` | step 3 | ✅ |

`BOOTSTRAP_USER` is optional (default `admin`).

**Turn off previews** (Project configuration → Build & deploy → Branches and deploy contexts): Branch deploys **None**, Deploy previews **None**, so preview URLs never run with these secrets.

**Domain:** Domain management → Add a domain → `admin.draninavega.com`.

### 3. Connect the two projects
1. **Public** project → Project configuration → Build & deploy → **Build hooks** → *Add build hook* (name: `admin portal`, branch: `main`) → copy the URL.
2. **Admin** project → add `PUBLIC_BUILD_HOOK` = that URL.
3. **Public** project → environment variables: `ADMIN_EXPORT_URL` = `https://admin.draninavega.com/api/export`, `EXPORT_TOKEN` = the same value as the admin project (secret).
4. Redeploy both (Deploys → Trigger deploy).

Until step 3 is done the public site simply builds from the committed `src/data` files.

### 4. First sign-in (do it right after deploying)
Until this is done, `admin` is protected by the password only — whoever signs in first enrolls their phone. So do it immediately, together with the doctor:
1. She installs **Google Authenticator** or **Microsoft Authenticator**.
2. Open `https://admin.draninavega.com` (not the `.netlify.app` address — sign-in only works on `ADMIN_ORIGIN`), pick Español/English, sign in as **`admin`** with the bootstrap password.
3. *Conecte su teléfono*: her name, scan the QR, type the 6-digit code.
4. **Save the 10 recovery codes** (download/print; keep them away from the phone).
5. Seguridad → *Contraseña* → change the password.
6. Delete `BOOTSTRAP_PASSWORD` from the admin project and redeploy. Check *Actividad*: exactly one `Cuenta creada`.

### Extra accounts (optional)
Set `SETUP_CODE` (`node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"`), redeploy, open `#configurar`, then delete `SETUP_CODE` and redeploy.

---

## If something goes wrong

| Situation | Fix |
| --- | --- |
| "No hay conexión" on `localhost:8888` | That's the local dev server; start it with `npm run dev`. The real portal is `admin.draninavega.com`. |
| Sign-in refused on the `.netlify.app` address | Expected: writes must come from `ADMIN_ORIGIN`. Use `admin.draninavega.com`. |
| `/api/session` returns `server_error` | `SESSION_SECRET` missing or shorter than 32 characters. |
| "Guardado, pero la página pública no se pudo actualizar" | `PUBLIC_BUILD_HOOK` missing/wrong. Fix it, then trigger a deploy of the public project. |
| Public build fails at `fetch-content` | `EXPORT_TOKEN` differs between the projects, or `ADMIN_EXPORT_URL` is wrong. The live site stays as it was. |
| New phone | She does it herself: Seguridad → **Cambiar de teléfono**. |
| Lost phone **and** recovery codes, or forgot password | Set `SETUP_CODE` and `SETUP_ALLOW_RESET=1`, redeploy, run `#configurar` with the **same username**, then delete both and redeploy. |
| Account locked | Wait 15 minutes (doubles on repeat, max 4 h). |
| Suspicious activity in *Actividad* | Seguridad → *Cerrar todas las sesiones*, change password, rotate `EXPORT_TOKEN`. |

**Rotating `SESSION_SECRET`** signs everyone out and makes stored authenticator secrets and recovery codes unreadable → the account must be reset (row above). Only rotate if it leaked.

## Local development
```bash
cd admin
npm install
npm run dev     # http://localhost:8888 · setup code: local-dev-setup-code
npm test        # API + edge gate security tests
```
Local mode keeps everything in `admin/.local-store/` (git-ignored). Put a password in `.local-store/_bootstrap_password` to try the `admin` first sign-in. The dev server prints the command to build the public site from the local portal's content.

## Files
| File | Purpose |
| --- | --- |
| `netlify/edge-functions/gate.js` | Edge gate: only the sign-in page/APIs are served without a valid signed session |
| `netlify/functions/api.mts` | API router (`/api/*`), including `/api/export` for the public build |
| `server/auth.mts` | Accounts, login + 2FA, bootstrap, sessions, rate limits, recovery codes, setup, activity log |
| `server/content.mts` | Server-side schema/validation for everything she can edit |
| `server/content-store.mts` | Content versions in Blobs, build hook, deploy status |
| `server/crypto.mts`, `server/totp.mts` | scrypt, HKDF/AES-GCM/HMAC from `SESSION_SECRET`, signed cookies, RFC 6238 TOTP |
| `public/assets/` | Sign-in screens (open): `main.js`, `core.js`, `auth.js`, `app.css` |
| `public/app/portal.js` | The editor, Seguridad, Actividad (gated) |
| `test/api.test.mjs` | End-to-end security tests |

See `../SECURITY.md` for the security review.
