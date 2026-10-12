// Reads and writes the site's data files in GitHub. Netlify rebuilds the
// public site on every commit to the branch.
// Local dev (ADMIN_LOCAL=1) reads/writes ../src/data directly instead.
import { createHash } from 'node:crypto';
import { env } from './env.mts';
import { HttpError } from './http.mts';
import { DATA_FILES } from './content.mts';

type FileKey = keyof typeof DATA_FILES;
export interface Snapshot {
  practice: Record<string, unknown>;
  settings: Record<string, unknown>;
  /** Git blob SHA of each file as loaded; sent back on publish to detect conflicts. */
  versions: Record<FileKey, string>;
}

const ALLOWED_PATHS = new Set<string>(Object.values(DATA_FILES));
const gitBlobSha = (text: string) =>
  createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0${text}`).digest('hex');

// ── GitHub REST ──────────────────────────────────────────────────────────
async function gh<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`https://api.github.com/repos/${env.repo}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${env.githubToken}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'draninavega-admin',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const err = new HttpError(res.status === 422 || res.status === 409 ? 409 : 502, 'github_error');
    console.error(`GitHub ${init.method || 'GET'} ${path} → ${res.status}`);
    throw err;
  }
  return res.json() as Promise<T>;
}

async function readFileGh(path: string) {
  const f = await gh<{ content: string; sha: string }>(`/contents/${path}?ref=${encodeURIComponent(env.branch)}`);
  return { text: Buffer.from(f.content, 'base64').toString('utf8'), sha: f.sha };
}

// ── Local filesystem (dev only) ──────────────────────────────────────────
async function localRoot() {
  const path = await import('node:path');
  return process.env.ADMIN_LOCAL_REPO || path.resolve('..');
}
async function readFileLocal(rel: string) {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const text = await fs.readFile(path.join(await localRoot(), rel), 'utf8');
  return { text, sha: gitBlobSha(text) };
}

// ── Public API ───────────────────────────────────────────────────────────
export async function load(): Promise<Snapshot> {
  const read = env.local ? readFileLocal : readFileGh;
  const [p, s] = await Promise.all([read(DATA_FILES.practice), read(DATA_FILES.settings)]);
  return {
    practice: JSON.parse(p.text),
    settings: JSON.parse(s.text),
    versions: { practice: p.sha, settings: s.sha },
  };
}

/**
 * Commits the changed files in ONE commit (Git Data API), so the site never
 * builds with half an update. Rejects with 409 if either file changed since
 * the editor loaded it. Returns the new commit SHA.
 */
export async function publish(
  files: Partial<Record<FileKey, string>>,
  loadedVersions: Record<FileKey, string>,
  message: string,
): Promise<string> {
  const entries = (Object.keys(files) as FileKey[]).map((k) => ({ path: DATA_FILES[k], content: files[k]! }));
  for (const e of entries) if (!ALLOWED_PATHS.has(e.path)) throw new Error(`refusing to write ${e.path}`);
  if (!entries.length) throw new HttpError(400, 'no_changes');

  const current = await load();
  for (const k of Object.keys(DATA_FILES) as FileKey[]) {
    if (current.versions[k] !== loadedVersions[k]) throw new HttpError(409, 'conflict');
  }

  if (env.local) {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    for (const e of entries) await fs.writeFile(path.join(await localRoot(), e.path), e.content);
    return `local-${Date.now()}`;
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const ref = await gh<{ object: { sha: string } }>(`/git/ref/heads/${encodeURIComponent(env.branch)}`);
    const head = ref.object.sha;
    const headCommit = await gh<{ tree: { sha: string } }>(`/git/commits/${head}`);
    const tree = await gh<{ sha: string }>('/git/trees', {
      method: 'POST',
      body: JSON.stringify({
        base_tree: headCommit.tree.sha,
        tree: entries.map((e) => ({ path: e.path, mode: '100644', type: 'blob', content: e.content })),
      }),
    });
    const commit = await gh<{ sha: string }>('/git/commits', {
      method: 'POST',
      body: JSON.stringify({
        message,
        tree: tree.sha,
        parents: [head],
        author: { name: 'Portal administrativo', email: 'portal@draninavega.com', date: new Date().toISOString() },
      }),
    });
    try {
      await gh(`/git/refs/heads/${encodeURIComponent(env.branch)}`, {
        method: 'PATCH',
        body: JSON.stringify({ sha: commit.sha, force: false }),
      });
      return commit.sha;
    } catch (e) {
      // Someone pushed code in between: rebuild the commit on the new head once.
      if (attempt === 0 && e instanceof HttpError && e.status === 409) continue;
      throw e;
    }
  }
  throw new HttpError(409, 'conflict');
}

/** Is `sha` contained in what's deployed on the public site right now? */
export async function isLive(sha: string): Promise<boolean | null> {
  if (env.local) return true;
  try {
    const res = await fetch(`${env.publicSite}/version.json?t=${Date.now()}`, { signal: AbortSignal.timeout(5000) });
    const { commit } = (await res.json()) as { commit?: string };
    if (!commit || !/^[0-9a-f]{40}$/.test(commit)) return null;
    if (commit === sha) return true;
    const cmp = await gh<{ status: string }>(`/compare/${sha}...${commit}`);
    return cmp.status === 'ahead' || cmp.status === 'identical';
  } catch {
    return null;
  }
}
