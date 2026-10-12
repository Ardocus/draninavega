# Portal administrativo — admin.draninavega.com

A private portal where Dra. Vega updates her website herself. Login screens in Spanish or English (toggle), editor in Spanish; password + authenticator-app login; no source code involved.

**How it works.** She edits fields → the portal's server function validates everything → it commits `src/data/practice.json` / `src/data/settings.json` to GitHub in one commit → Netlify rebuilds draninavega.com (~1–2 min) → the portal shows "Sus cambios ya están en la página".

It's a **separate Netlify project** built from this same repo (base directory `admin`). The public site never contains admin code, and the portal's secrets exist only in this project.

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

## One-time setup (Angel)

### 1. GitHub token
GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate:
- Resource owner: `Ardocus` · Repository access: **Only select repositories → `Ardocus/draninavega`**
- Permissions → Repository → **Contents: Read and write** (Metadata: read is added automatically). Nothing else.
- Expiration: 1 year. Put a calendar reminder to rotate it.

### 2. Generate the secrets
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```
↑ `DATA_KEY` (encrypts authenticator secrets; keep a copy in your password manager — losing it means re-enrolling).

```bash
cd admin
npm install
npm run hash-password
```
↑ type the bootstrap password and press Enter. The output (`scrypt$131072$8$1$…`) is `BOOTSTRAP_PASSWORD_HASH`. The password itself is never stored anywhere — not in the repo (which is public), not in Netlify.

### 3. Create the Netlify project
Netlify → **Add new project → Import an existing project → GitHub → `Ardocus/draninavega`**:
- **Base directory: `admin`** (everything else comes from `admin/netlify.toml`)
- Project name e.g. `draninavega-admin`

**Environment variables** (Project configuration → Environment variables). Scope: **Functions**; deploy context: **Production** only; tick *Contains secret values* for the first three:

| Key | Value |
| --- | --- |
| `GITHUB_TOKEN` | token from step 1 |
| `DATA_KEY` | from step 2 |
| `BOOTSTRAP_PASSWORD_HASH` | from step 2 |
| `BOOTSTRAP_USER` | `admin` (optional; this is the default) |
| `ADMIN_ORIGIN` | `https://admin.draninavega.com` |
| `PUBLIC_SITE_URL` | `https://draninavega.com` |
| `GITHUB_REPO` | `Ardocus/draninavega` |
| `GITHUB_BRANCH` | `main` |

`SETUP_CODE` is **not** needed for the first account; it's only for resets or extra accounts (see below).

**Turn off previews** (Project configuration → Build & deploy → Branches and deploy contexts): Branch deploys **None**, Deploy previews **None**. Preview URLs would otherwise run the functions with production secrets.

**Domain:** Domain management → Add a domain → `admin.draninavega.com`. With Netlify DNS it's automatic; otherwise add a `CNAME admin → <project>.netlify.app` at the registrar. HTTPS is provisioned automatically.

Deploy (Deploys → Trigger deploy).

### 4. First sign-in (do it right after deploying, ~5 minutes)
Until this is done, the `admin` account is protected by the password only — whoever signs in first enrolls their phone. So do it immediately, together with the doctor:
1. She installs **Google Authenticator** or **Microsoft Authenticator** on her phone.
2. Open `https://admin.draninavega.com`, choose Español/English (top right), sign in as **`admin`** with the bootstrap password.
3. The portal goes straight to *Conecte su teléfono*: enter her name, scan the QR, type the 6-digit code.
4. **Save the 10 recovery codes** (download/print; keep them away from the phone).
5. Recommended: Seguridad → *Contraseña* → change the password (the bootstrap one has been shared in chat/messages).

### 5. Close the bootstrap
Delete `BOOTSTRAP_PASSWORD_HASH` from the environment variables and redeploy. (It's already inert once the `admin` account exists — the stored account always wins — but removing it is tidier.) Check *Actividad*: you should see exactly one `Cuenta creada` from your own IP.

### Extra accounts (optional)
To add an account for yourself: set `SETUP_CODE` (`node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"`), redeploy, open `#configurar`, then delete `SETUP_CODE` and redeploy.

---

## If something goes wrong

| Situation | Fix |
| --- | --- |
| New phone | She does it herself: Seguridad → **Cambiar de teléfono** (password + a code from the old phone or a recovery code, then scan the new QR). |
| Lost phone **and** recovery codes | Set `SETUP_CODE` (new value) **and** `SETUP_ALLOW_RESET=1`, redeploy, run `#configurar` with the **same username**, then delete both variables and redeploy. All old sessions are signed out. |
| Forgot password | Same as above (reset). |
| Account locked | Too many wrong attempts: wait 15 minutes (doubles on repeat, max 4 h). |
| "No se pudo publicar" | Usually an expired/revoked `GITHUB_TOKEN`. Check the Functions log in Netlify. |
| Suspicious activity in *Actividad* | Seguridad → *Cerrar todas las sesiones*, change password; rotate `GITHUB_TOKEN`. |

## Local development
```bash
cd admin
npm install
npm run dev     # http://localhost:8888 · setup code: local-dev-setup-code
npm test        # API security tests
npm run hash-password   # make a BOOTSTRAP_PASSWORD_HASH
```
Local mode stores accounts in `admin/.local-store/` (git-ignored; put a hash in `.local-store/_bootstrap_hash` to try the bootstrap login) and edits `../src/data/*.json` directly, so you can preview with `npm run dev` in the root.

## Files
| File | Purpose |
| --- | --- |
| `netlify/functions/api.mts` | API router (`/api/*`) |
| `server/auth.mts` | Accounts, login + 2FA, sessions, rate limits, recovery codes, setup, activity log |
| `server/content.mts` | Server-side schema/validation for everything she can edit |
| `server/repo.mts` | GitHub read + single-commit publish; deploy status |
| `server/crypto.mts`, `server/totp.mts` | scrypt, AES-GCM, HMAC, RFC 6238 TOTP (Node built-ins only) |
| `public/` | The portal UI (vanilla JS, no third-party code) |
| `test/api.test.mjs` | End-to-end security tests |

See `../SECURITY.md` for the security review.
