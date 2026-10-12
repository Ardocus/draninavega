# Security review — draninavega.com + admin portal

Date: 2026-10-11 · Scope: everything in this repo (public site, admin portal, Netlify config) · Reviewer: Claude (with Angel Santiago)

## 1. System and threat model

```
 Visitor ──HTTPS──▶ draninavega.com (Netlify, static Astro build, no JS deps at runtime)
                         ▲ rebuild on push
 Dra. Vega ─HTTPS─▶ admin.draninavega.com (separate Netlify project)
                    ├─ static UI (vanilla JS, same-origin only)
                    └─ /api/* Netlify Function ──▶ Netlify Blobs (users, sessions, limits, audit)
                                               └──▶ GitHub API (fine-grained token, 1 repo, Contents R/W)
                                                     └─ commits src/data/practice.json + settings.json only
```

**Assets:** integrity of the public site (a psychiatry practice: defacement or injected scripts would harm vulnerable visitors); the doctor's admin account; the GitHub token (write access to the site's source).
**Not in scope by design:** no patient health information is collected anywhere (DEV-HANDOFF §1.4). No forms, no analytics, no third-party scripts on either origin.

**Adversaries considered:** anonymous internet attackers (credential stuffing, brute force, CSRF, XSS, clickjacking); someone who obtains her password (phishing/reuse); someone with her old phone; leak of the Blobs store; a compromised dependency/CDN.

## 2. Controls

| Area | Control |
| --- | --- |
| Authentication | Username + password (scrypt N=2^17, r=8, p=1, 16-byte salt — OWASP minimum) **and** TOTP (RFC 6238, ±1 step, replay-protected via last-used step). Password-only never yields a session. |
| First account (bootstrap) | `admin` + a password whose **scrypt hash only** lives in the `BOOTSTRAP_PASSWORD_HASH` env var (never the repo). A correct bootstrap password yields **no session**: it forces authenticator enrollment (QR → first code) and recovery codes before the account is created. The pending enrollment can't be used with the normal code endpoint, and once the account exists the env hash is ignored. Same rate limits and audit as normal logins. |
| Recovery | 10 one-time codes (~40 bits each), stored as HMAC-SHA256 keyed with `DATA_KEY`; regenerating requires a fresh TOTP. Self-service phone change requires password + current code. |
| Secrets at rest | TOTP secrets AES-256-GCM encrypted with `DATA_KEY` (env var, not in Blobs). Session IDs stored only as SHA-256. |
| Sessions | 256-bit random IDs, server-side (revocable), 30 min idle / 8 h absolute, rotated at login and password change. Cookie: `__Host-` prefix, `HttpOnly; Secure; SameSite=Strict; Path=/`. "Sign out everywhere" via per-user epoch. |
| Brute force | Per-IP: 20 failures / 15 min → 15 min block. Per-username: 8 failures → 15 min lock, doubling to 4 h. Checked **before** scrypt. MFA step capped at 5 tries per password success. Unknown usernames get identical responses, timing (dummy scrypt) and lockout behaviour. |
| CSRF | Exact `Origin` match + `Sec-Fetch-Site` + required `application/json` on every non-GET; plus SameSite=Strict. No CORS headers. |
| Input handling | Server-side allowlist schema (`admin/server/content.mts`): types, lengths, formats (NANP phones, email, ISO dates, postal), no control chars, Facebook URL regex, duplicates. Output object rebuilt from scratch — unknown keys dropped. Crisis lines and country are copied from the repo, never from the client. |
| Repo writes | Hard path allowlist (2 files). Single atomic commit via Git Data API; optimistic concurrency on blob SHAs (409 on conflict). Token is fine-grained, one repo, Contents only. |
| Output encoding | Astro escapes all text/attributes. JSON-LD serialized with `<`, `>`, `&`, U+2028/9 escaped. `href`s from data are allowlisted (Facebook https only) or derived (maps). Portal UI builds DOM with `textContent` only. |
| Browser hardening | Public: CSP `default-src 'self'; script-src 'self'` (no inline scripts), `frame-ancestors 'none'`, HSTS, nosniff, Referrer-Policy, Permissions-Policy, COOP. Admin: CSP `default-src 'none'` + same-origin only, `Referrer-Policy: no-referrer`, CORP, `X-Robots-Tag: noindex`. |
| Supply chain | Public site: Astro only (build-time). Admin: `@netlify/blobs` + `qrcode-generator`, exact versions, lockfiles committed; crypto/TOTP use Node built-ins. No CDN scripts anywhere. `npm audit`: 0 vulnerabilities in both. |
| Audit | Logins, failures, lockouts, publishes (fields changed), security changes, with IP; visible to her in *Actividad*. No API can edit or delete it. |
| Privacy | No trackers, cookies only on the admin origin, fonts self-hosted, QR rendered server-side (secret never leaves our origin). |

## 3. Findings (all fixed in this review)

| # | Severity | Finding | Fix |
| --- | --- | --- | --- |
| F1 | **High** | Stored XSS path: portal-editable text (e.g. summary) was emitted into `<script type="application/ld+json">` via `JSON.stringify`, which does not escape `</script>`. | `safeJson()` escapes `< > &` U+2028/9. Verified by injecting `</script><script>alert(1)</script>` → emitted as `</script…`. |
| F2 | Medium | Previous CMS (Decap) loaded `unpkg.com` JS without SRI on the main origin, with GitHub OAuth. | Removed; replaced by the first-party portal on its own subdomain. |
| F3 | Medium | While `SETUP_CODE` is set, setup could overwrite an existing account (takeover if the code leaked). | Resetting an existing user additionally requires `SETUP_ALLOW_RESET=1`. Test added. |
| F4 | Low | Username enumeration: only real accounts could become "locked". | Failures counted for any well-formed username. Test added. |
| F5 | Low | Recovery-code hashes were unkeyed SHA-256 (40-bit codes brute-forceable offline from a store leak). | HMAC-SHA256 with `DATA_KEY`. |
| F6 | Low | Public CSP was a `<meta>` (no `frame-ancestors`); no HSTS. | CSP moved to response headers; HSTS added. |
| F7 | Low | Local dev server listened on all interfaces with a default setup code. | Binds to `127.0.0.1`. |
| F8 | Info | Directions URL stored as free text; Facebook URL rendered without scheme check. | Maps URL derived from the address; Facebook allowlisted at build and at input. |
| F10 | Medium | Requested fixed bootstrap credentials (`admin` / chosen password) would have been readable in the **public** repo if hard-coded. | Only the scrypt hash, only in a Netlify env var; generated via stdin (`npm run hash-password`); verified absent from the repo. Forced 2FA enrollment on first use. |
| F9 | Info | No self-service way to move 2FA to a new phone (would force an admin reset, weakening process). | Added password + current-code gated phone change. |

## 4. Verification

- `cd admin && npm test` — 15 end-to-end tests against the real handler: cookie flags, CSRF rejection, setup-code checks, password-only ≠ session, identical errors for unknown users, TOTP rejection + **replay**, recovery codes single-use, schema rejection (bad phone, `javascript:` URL, control chars, duplicates), unknown-key stripping, crisis-line preservation, conflict detection, per-user and per-IP lockout, enumeration parity, secrets encrypted/hashed at rest, phone change, bootstrap login (wrong password, no session before enrollment, enrollment can't be skipped or repeated).
- TOTP verified against the RFC 6238 SHA-1 test vector.
- Public build injection test: `</script>`, `"><img onerror>`, `<b onmouseover>`, `javascript:` — all neutralized in `dist/`.
- Manual run-through of setup → QR → recovery codes → login → edit → review → publish → public build.

## 5. Residual risks and recommendations

| # | Risk | Recommendation |
| --- | --- | --- |
| R1 | **The GitHub token can change site code**, not just data (Contents R/W is repo-wide). Compromise of the admin function's environment ⇒ ability to push to the public site. | Keep secrets scoped to *Functions + Production* only; previews off (see admin/README). Rotate yearly. For stronger isolation later: move `src/data` into a separate data-only repo that the site fetches at build time, and give the token access only to that repo. |
| R10 | **Bootstrap window:** until the first sign-in completes, `admin` is password-only — whoever enrolls first owns it. The password was also shared in chat. | Do the first sign-in immediately after the deploy; confirm a single `Cuenta creada` in *Actividad*; change the password afterwards; then delete `BOOTSTRAP_PASSWORD_HASH`. |
| R2 | **Netlify and GitHub accounts are the root of trust** (env vars, setup code, deploys). | Enforce 2FA (ideally passkeys/security keys) on Angel's GitHub and Netlify accounts. Limit Netlify team members. |
| R3 | **Repo is public.** No secrets are in it, but commit messages carry her display name and publish times. | Make `Ardocus/draninavega` private (Netlify works the same). |
| R4 | TOTP is phishable by a real-time proxy. | Future: add WebAuthn passkeys as the primary factor. Tell her the portal is only ever at `admin.draninavega.com`. |
| R5 | Blobs counters aren't atomic: parallel bursts can slightly exceed limits. | Acceptable at this scale. Optionally add a Netlify rate-limit rule on `/api/login*` for a platform-level cap. |
| R6 | Distributed brute force could cost function time (scrypt ~128 MiB). | Per-IP + per-user limits bound it; monitor Netlify usage. |
| R7 | Session cookie theft from a compromised computer. | 30 min idle timeout, *Cerrar todas las sesiones*, activity log. Advise she uses her own up-to-date device. |
| R8 | `DATA_KEY` loss ⇒ all authenticators must be re-enrolled. | Store `DATA_KEY` in Angel's password manager. |
| R9 | Email address is published (by design) and may attract spam/phishing. | Consider `info@draninavega.com` with a filtered mailbox (DEV-HANDOFF §9.3). |

## 6. Operational checklist

- [ ] Fine-grained GitHub token: one repo, Contents only, 1-year expiry, reminder set
- [ ] Admin env vars scoped to Functions / Production; secrets marked secret
- [ ] Admin project: branch deploys and deploy previews **off**
- [ ] First `admin` sign-in done right after deploy; one `Cuenta creada` in Actividad; bootstrap password changed
- [ ] `BOOTSTRAP_PASSWORD_HASH`, `SETUP_CODE` and `SETUP_ALLOW_RESET` removed after use + redeploy
- [ ] 2FA on Angel's GitHub and Netlify accounts
- [ ] Repo set to private
- [ ] Recovery codes printed and stored away from her phone
- [ ] `DATA_KEY` saved in a password manager
- [ ] After go-live: check headers at securityheaders.com / Mozilla Observatory for both domains
