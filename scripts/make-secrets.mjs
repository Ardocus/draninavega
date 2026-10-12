// Prints every environment variable for both Netlify projects, with fresh
// random secrets. Writes nothing to disk — keep the terminal open while you paste.
//   node scripts/make-secrets.mjs
import { randomBytes } from 'node:crypto';

const r = (n) => randomBytes(n).toString('base64url');
const exportToken = r(32);

console.log(`
=== ADMIN PORTAL project (base directory: admin) ===
Mark the first three as "Contains secret values". Scope: Functions (if offered).

  SESSION_SECRET      = ${r(48)}
  EXPORT_TOKEN        = ${exportToken}
  BOOTSTRAP_PASSWORD  = <the first-sign-in password you chose, 12+ characters>
  ADMIN_ORIGIN        = https://admin.draninavega.com
  PUBLIC_SITE_URL     = https://draninavega.com
  PUBLIC_BUILD_HOOK   = <later: public project → Build hooks → add one, paste its URL here>

  Optional: BOOTSTRAP_USER = admin   (that's the default)

=== PUBLIC SITE project (base directory: empty) ===

  ADMIN_EXPORT_URL    = https://admin.draninavega.com/api/export
  EXPORT_TOKEN        = ${exportToken}      (same value as above, mark as secret)

Notes
- Changing SESSION_SECRET later signs everyone out and makes stored authenticator
  secrets and recovery codes unreadable (the account must be reset). Keep a copy
  in your password manager.
- After the first sign-in, delete BOOTSTRAP_PASSWORD from the admin project.
`);
