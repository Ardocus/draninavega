// Configuration comes only from Netlify environment variables (admin project).
// See admin/README.md for what each one is and how to generate it.

const read = (k: string) => (process.env[k] || '').trim();

export const env = {
  /** Local development: file-backed store and repo (admin/dev-server.mjs sets this). */
  get local() { return read('ADMIN_LOCAL') === '1'; },
  /** Exact origin the portal is served from. State-changing requests must come from it. */
  get origin() { return read('ADMIN_ORIGIN') || 'https://admin.draninavega.com'; },
  /** Public site, used to check whether a published change is live. */
  get publicSite() { return read('PUBLIC_SITE_URL') || 'https://draninavega.com'; },
  get repo() { return read('GITHUB_REPO') || 'Ardocus/draninavega'; },
  get branch() { return read('GITHUB_BRANCH') || 'main'; },
  /** Fine-grained token: this repo only, Contents read/write. */
  get githubToken() { return read('GITHUB_TOKEN'); },
  /** 32 random bytes, base64. Encrypts authenticator secrets at rest. */
  get dataKey() { return read('DATA_KEY'); },
  /** Enables first-time setup / account reset while set. Remove it afterwards. */
  get setupCode() { return read('SETUP_CODE'); },
};

/** Fail closed if the deployment is missing secrets. */
export function assertConfigured() {
  const missing: string[] = [];
  const key = Buffer.from(env.dataKey, 'base64');
  if (key.length !== 32) missing.push('DATA_KEY');
  if (!env.local && !env.githubToken) missing.push('GITHUB_TOKEN');
  if (missing.length) throw new Error(`Admin portal misconfigured: ${missing.join(', ')}`);
}
