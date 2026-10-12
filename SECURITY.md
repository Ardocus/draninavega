# Security review — draninavega.com + admin portal

Reviewed 2026-10-11, updated 2026-10-12 (portal moved to the Wizarding World pattern: Blobs + build hook + export, edge gate) · Scope: everything in this repo · Reviewer: Claude (with Angel Santiago)

## 1. System and threat model

```
 Visitor ──HTTPS──▶ draninavega.com (Netlify, static Astro build, no runtime JS deps)
                         ▲ build hook (portal publishes)      │ build: GET /api/export (Bearer EXPORT_TOKEN)
                         │                                    ▼
 Dra. Vega ─HTTPS─▶ admin.draninavega.com (separate Netlify project)
                    ├─ edge gate: only sign-in page + sign-in/export APIs without a signed session
                    ├─ static UI (vanilla JS, same-origin only); editor code is behind the gate
                    └─ /api/* Netlify Function ──▶ Netlify Blobs (content versions, users, sessions, limits, audit)
```

**Assets:** integrity of the public site (a psychiatry practice: defacement or injected scripts would harm vulnerable visitors); the doctor's admin account; `SESSION_SECRET`.
**Not in scope by design:** no patient health information is collected anywhere (DEV-HANDOFF §1.4). No forms, no analytics, no third-party scripts on either origin.
**Notably absent:** any credential that can change the site's *code*. The portal can only change the two data documents, and the public build re-checks them.

**Adversaries considered:** anonymous internet attackers (credential stuffing, brute force, CSRF, XSS, clickjacking, probing); someone who obtains her password (phishing/reuse); someone with her old phone; leak of the Blobs store; leak of `EXPORT_TOKEN` or the build hook URL; a compromised dependency/CDN.

## 2. Controls

| Area | Control |
| --- | --- |
| Authentication | Username + password (scrypt N=2^17, r=8, p=1, 16-byte salt — OWASP minimum) **and** TOTP (RFC 6238, ±1 step, replay-protected via last-used step). Password-only never yields a session. |
| First account (bootstrap) | `admin` + `BOOTSTRAP_PASSWORD` env var (never the repo), compared in constant time. A correct bootstrap password yields **no session**: it forces authenticator enrollment (QR → first code) and recovery codes; only then is the account created, storing a scrypt hash of the password. The pending enrollment can't be used with the normal code endpoint; once the account exists the env var is ignored. Same rate limits and audit as normal logins. |
| Recovery | 10 one-time codes (~40 bits each), stored as HMAC-SHA256 with a key derived (HKDF) from `SESSION_SECRET`; regenerating requires a fresh TOTP. Self-service phone change requires password + current code. |
| Secrets at rest | TOTP secrets AES-256-GCM encrypted with an HKDF-derived key (`SESSION_SECRET` is an env var, not in Blobs). Session IDs stored only as SHA-256. |
| Sessions | Cookie value = 256-bit random ID + expiry + HMAC-SHA256 (`SESSION_SECRET`). The edge gate verifies the signature and expiry; the API then checks the server-side record (30 min idle / 8 h absolute, per-user epoch for "sign out everywhere", rotated at login and password change). Cookie: `__Host-` prefix, `HttpOnly; Secure; SameSite=Strict; Path=/`. |
| Edge gate | `netlify/edge-functions/gate.js` runs before every request. Without a valid signed cookie only the sign-in page, its assets and the sign-in/setup/export APIs are served; the editor code (`/app/portal.js`), every other API and any unknown path get 401 / redirect to `/`. Fails closed if `SESSION_SECRET` is missing. |
| Brute force | Per-IP: 20 failures / 15 min → 15 min block. Per-username: 8 failures → 15 min lock, doubling to 4 h. Checked **before** scrypt. MFA step capped at 5 tries per password success. Unknown usernames get identical responses, timing (dummy scrypt) and lockout behaviour. |
| CSRF | Exact `Origin` match + `Sec-Fetch-Site` + required `application/json` on every non-GET; plus SameSite=Strict. No CORS headers. |
| Input handling | Server-side allowlist schema (`admin/server/content.mts`): types, lengths, formats (NANP phones, email, ISO dates, postal), no control chars, Facebook URL regex, duplicates. Output object rebuilt from scratch — unknown keys dropped. Crisis lines and country are copied from the stored content, never from the client. |
| Publishing | New content version in Blobs with optimistic concurrency (409 on stale version); last 20 versions kept for rollback. Build hook triggers the public build. |
| Export | `GET /api/export` requires `Bearer EXPORT_TOKEN` (32+ chars, constant-time compare); returns only content that is public anyway. The public build (`scripts/fetch-content.mjs`) requires https, re-checks the shape and the crisis block, and **fails the build** on any problem, so the live site is never replaced by a broken or partial export. |
| Output encoding | Astro escapes all text/attributes. JSON-LD serialized with `<`, `>`, `&`, U+2028/9 escaped as JSON unicode escapes. `href`s from data are allowlisted (Facebook https only) or derived (maps). Portal UI builds DOM with `textContent` only. |
| Browser hardening | Public: CSP `default-src 'self'; script-src 'self'` (no inline scripts), `frame-ancestors 'none'`, HSTS, nosniff, Referrer-Policy, Permissions-Policy, COOP. Admin: CSP `default-src 'none'` + same-origin only, `Referrer-Policy: no-referrer`, CORP, `X-Robots-Tag: noindex`. |
| Supply chain | Public site: Astro only (build-time). Admin: `@netlify/blobs` + `qrcode-generator`, exact versions, lockfiles committed; crypto/TOTP use Node built-ins. No CDN scripts anywhere. `npm audit`: 0 vulnerabilities in both. |
| Audit | Logins, failures, lockouts, bootstrap, publishes (fields changed), security changes, with IP; visible to her in *Actividad*. No API can edit or delete it. |
| Privacy | No trackers, cookies only on the admin origin, fonts self-hosted, QR rendered server-side (secret never leaves our origin). |

## 3. Findings (all fixed)

| # | Severity | Finding | Fix |
| --- | --- | --- | --- |
| F1 | **High** | Stored XSS path: portal-editable text (e.g. summary) was emitted into `<script type="application/ld+json">` via `JSON.stringify`, which does not escape `</script>`. | `safeJson()` escapes `< > &` U+2028/9. Verified by injecting `</script><script>alert(1)</script>`: the `<` is emitted as a JSON unicode escape. |
| F2 | Medium | Previous CMS (Decap) loaded `unpkg.com` JS without SRI on the main origin, with GitHub OAuth. | Removed; replaced by the first-party portal on its own subdomain. |
| F3 | Medium | While `SETUP_CODE` is set, setup could overwrite an existing account (takeover if the code leaked). | Resetting an existing user additionally requires `SETUP_ALLOW_RESET=1`. Test added. |
| F4 | Low | Username enumeration: only real accounts could become "locked". | Failures counted for any well-formed username. Test added. |
| F5 | Low | Recovery-code hashes were unkeyed SHA-256 (40-bit codes brute-forceable offline from a store leak). | Keyed HMAC-SHA256. |
| F6 | Low | Public CSP was a `<meta>` (no `frame-ancestors`); no HSTS. | CSP moved to response headers; HSTS added. |
| F7 | Low | Local dev server listened on all interfaces with a default setup code. | Binds to `127.0.0.1`. |
| F8 | Info | Directions URL stored as free text; Facebook URL rendered without scheme check. | Maps URL derived from the address; Facebook allowlisted at build and at input. |
| F9 | Info | No self-service way to move 2FA to a new phone (would force an admin reset, weakening process). | Added password + current-code gated phone change. |
| F10 | Medium | Requested fixed bootstrap credentials (`admin` / chosen password) would have been readable in the **public** repo if hard-coded. | Env var only (`BOOTSTRAP_PASSWORD`), verified absent from the repo; forced 2FA enrollment on first use; ignored once the account exists. |
| F11 | **High** (design) | The GitHub-commit publishing model needed a token with write access to the whole repo, so a portal compromise could change the site's code. | Replaced by the Blobs + build hook + export model (from the Wizarding World workspace). No repo credential exists anymore. |
| F12 | Medium | Build-hook builds would have been skipped by the public project's `ignore` rule (no new commit). | `ignore` always builds when `INCOMING_HOOK_URL` is set. Verified both paths. |

## 4. Verification

- `cd admin && npm test` — 17 end-to-end tests against the real handler and edge gate: cookie flags, CSRF rejection, setup-code checks, password-only ≠ session, identical errors for unknown users, TOTP rejection + **replay**, recovery codes single-use, schema rejection (bad phone, `javascript:` URL, control chars, duplicates), unknown-key stripping, crisis-line preservation, stale-version conflict, export token (missing / wrong / truncated / correct), **edge gate** (open paths, private paths, unknown paths, forged expiry, swapped session ID, unsigned cookie, missing secret fails closed), per-user and per-IP lockout, enumeration parity, secrets encrypted/hashed at rest (bootstrap password never stored), phone change, bootstrap flow.
- TOTP verified against the RFC 6238 SHA-1 test vector.
- Public build injection test: `</script>`, `"><img onerror>`, `<b onmouseover>`, `javascript:` — all neutralized in `dist/`.
- Pipeline: local portal → publish in the browser → `/api/export` returns the new version → `fetch-content` + `astro build` produce `version.json` with that version; a wrong `EXPORT_TOKEN` fails the build.

## 5. Residual risks and recommendations

| # | Risk | Recommendation |
| --- | --- | --- |
| R1 | **`SESSION_SECRET` is the portal's master key** (cookie signatures, TOTP/recovery keys). Leak ⇒ forged cookies pass the gate (the API still requires a live server-side session) and Blobs data becomes decryptable. Rotation ⇒ account reset. | Secret env var, Functions scope only, previews off. Store a copy in the password manager. Rotate only on suspected leak, then reset the account. |
| R2 | **Netlify and GitHub accounts are the root of trust** (env vars, deploys, code). | Enforce 2FA (ideally passkeys/security keys) on Angel's GitHub and Netlify accounts. Limit team members. |
| R3 | `EXPORT_TOKEN` or build-hook URL leak. | Low impact: the export is public content; the hook can only trigger rebuilds (build minutes). Rotate if leaked. |
| R4 | **Bootstrap window:** until the first sign-in completes, `admin` is password-only — whoever enrolls first owns it. The password was also shared in chat. | Do the first sign-in immediately after deploying; confirm a single `Cuenta creada`; change the password; delete `BOOTSTRAP_PASSWORD`. |
| R5 | `BOOTSTRAP_PASSWORD` is plaintext in Netlify (chosen for simplicity, like the Wizarding World workspace). | Anyone with Netlify access can read it until deleted — delete it right after the first sign-in. |
| R6 | **Repo is public.** No secrets are in it. | Optional: make it private (Netlify works the same). |
| R7 | TOTP is phishable by a real-time proxy. | Future: WebAuthn passkeys. Tell her the portal is only ever at `admin.draninavega.com`. |
| R8 | Blobs counters aren't atomic: parallel bursts can slightly exceed limits. Distributed brute force could cost function time (scrypt ~128 MiB). | Acceptable at this scale; monitor Netlify usage. Optionally add a Netlify rate-limit rule on `/api/login*`. |
| R9 | Session cookie theft from a compromised computer. | 30 min idle timeout, *Cerrar todas las sesiones*, activity log. Advise she uses her own up-to-date device. |
| R10 | Email address is published (by design) and may attract spam/phishing. | Consider `info@draninavega.com` with a filtered mailbox (DEV-HANDOFF §9.3). |

## 6. Operational checklist

- [ ] `node scripts/make-secrets.mjs`; `SESSION_SECRET` saved in a password manager
- [ ] Admin env vars set (secrets marked secret, Functions scope); previews and branch deploys **off**
- [ ] Build hook created on the public project and set as `PUBLIC_BUILD_HOOK`; `ADMIN_EXPORT_URL` + `EXPORT_TOKEN` set on the public project
- [ ] First `admin` sign-in done right after deploy; one `Cuenta creada` in Actividad; password changed
- [ ] `BOOTSTRAP_PASSWORD`, `SETUP_CODE` and `SETUP_ALLOW_RESET` removed after use + redeploy
- [ ] 2FA on Angel's GitHub and Netlify accounts
- [ ] Recovery codes printed and stored away from her phone
- [ ] After go-live: check headers at securityheaders.com / Mozilla Observatory for both domains
