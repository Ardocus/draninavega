// Key-value storage for users, sessions, rate limits and the activity log.
// Production: Netlify Blobs (site-scoped, strong consistency).
// Local dev: one JSON file per key under admin/.local-store/.
import { env } from './env.mts';

export interface KV {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
}

let kv: KV | undefined;

export async function store(): Promise<KV> {
  if (kv) return kv;
  if (env.local) {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const dir = process.env.ADMIN_LOCAL_STORE || path.resolve('.local-store');
    await fs.mkdir(dir, { recursive: true });
    const file = (k: string) => path.join(dir, `${encodeURIComponent(k)}.json`);
    kv = {
      async get(k) {
        try { return JSON.parse(await fs.readFile(file(k), 'utf8')); } catch { return null; }
      },
      async set(k, v) { await fs.writeFile(file(k), JSON.stringify(v)); },
      async del(k) { await fs.rm(file(k), { force: true }); },
    };
  } else {
    const { getStore } = await import('@netlify/blobs');
    const s = getStore({ name: 'admin-portal', consistency: 'strong' });
    kv = {
      get: (k) => s.get(k, { type: 'json' }),
      set: async (k, v) => { await s.setJSON(k, v); },
      del: (k) => s.delete(k),
    };
  }
  return kv;
}
