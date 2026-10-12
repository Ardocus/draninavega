// Configuration comes only from Netlify environment variables (admin project).
// `node ../scripts/make-secrets.mjs` prints every value; admin/README.md explains them.

const read = (k: string) => (process.env[k] || '').trim();

export const env = {
  /** Local development: file-backed store (admin/dev-server.mjs sets this). */
  get local() { return read('ADMIN_LOCAL') === '1'; },
  /** Exact origin the portal is served from. State-changing requests must come from it. */
  get origin() { return read('ADMIN_ORIGIN') || 'https://admin.draninavega.com'; },
  /** Public site, used to check whether a published change is live. */
  get publicSite() { return read('PUBLIC_SITE_URL') || 'https://draninavega.com'; },
  /** 32+ random chars. Signs session cookies and derives the at-rest encryption keys. */
  get sessionSecret() { return read('SESSION_SECRET'); },
  /** 32+ random chars, shared with the public project. Lets its build read /api/export. */
  get exportToken() { return read('EXPORT_TOKEN'); },
  /** Public project → Build hooks. Called after every publish. */
  get buildHook() { return read('PUBLIC_BUILD_HOOK'); },
  /** First sign-in only: username + password, until that account exists in the store. */
  get bootstrapUser() { return (read('BOOTSTRAP_USER') || 'admin').toLowerCase(); },
  get bootstrapPassword() { return process.env.BOOTSTRAP_PASSWORD || ''; },
  /** Enables /#configurar (extra accounts / resets) while set. Remove it afterwards. */
  get setupCode() { return read('SETUP_CODE'); },
};

/** Fail closed if the deployment is missing its core secret. */
export function assertConfigured() {
  if (env.sessionSecret.length < 32) throw new Error('Admin portal misconfigured: SESSION_SECRET (32+ characters)');
}
