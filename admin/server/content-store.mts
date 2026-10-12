// The site's editable content lives here, in the portal's Netlify Blobs store.
// Publishing = save a new version + call the public site's build hook; the
// public build then reads it back through /api/export (Bearer EXPORT_TOKEN).
// No credential in this project can change the site's code.
import { store } from './store.mts';
import { env } from './env.mts';
import { HttpError } from './http.mts';
import seedPractice from '../../src/data/practice.json' with { type: 'json' };
import seedSettings from '../../src/data/settings.json' with { type: 'json' };

type Obj = Record<string, unknown>;
export interface Content {
  practice: Obj;
  settings: Obj;
  version: number;
  updatedAt: string;
  updatedBy: string;
}

const KEY = 'content';
const KEEP_VERSIONS = 20;

/** Current content. The first call seeds it from the repo's src/data files. */
export async function loadContent(): Promise<Content> {
  const kv = await store();
  let c = await kv.get<Content>(KEY);
  if (!c) {
    c = { practice: seedPractice as Obj, settings: seedSettings as Obj, version: 1, updatedAt: '', updatedBy: 'repo' };
    await kv.set(KEY, c);
  }
  return c;
}

/** Saves a new version if nobody else saved since `expectedVersion`. Keeps the last 20 for rollback. */
export async function saveContent(next: { practice: Obj; settings: Obj }, expectedVersion: number, by: string) {
  const kv = await store();
  const cur = await loadContent();
  if (cur.version !== expectedVersion) throw new HttpError(409, 'conflict');
  await kv.set(`${KEY}:v${cur.version}`, cur);
  if (cur.version > KEEP_VERSIONS) await kv.del(`${KEY}:v${cur.version - KEEP_VERSIONS}`);
  const saved: Content = { ...next, version: cur.version + 1, updatedAt: new Date().toISOString(), updatedBy: by };
  await kv.set(KEY, saved);
  return saved;
}

/** Asks Netlify to rebuild the public site. Returns false if the hook isn't set or fails. */
export async function requestPublicBuild() {
  if (env.local) return true;            // local dev: nothing to rebuild
  if (!env.buildHook) return false;
  try {
    const res = await fetch(env.buildHook, { method: 'POST', body: '{}', signal: AbortSignal.timeout(8000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Content version the public site was last built with (its /version.json), or null if unknown. */
export async function deployedVersion(): Promise<number | null> {
  if (env.local) return null;
  try {
    const res = await fetch(`${env.publicSite}/version.json?t=${Date.now()}`, { signal: AbortSignal.timeout(5000) });
    const { content } = (await res.json()) as { content?: number };
    return Number.isInteger(content) ? content! : null;
  } catch {
    return null;
  }
}
