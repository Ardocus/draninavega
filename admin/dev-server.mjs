// Local development server for the admin portal: the edge gate, static files
// and the API function, with a file-backed store in admin/.local-store/.
// Run: npm run dev  →  http://localhost:8888
//
// Optional local bootstrap account: put a password in .local-store/_bootstrap_password
// (git-ignored), then sign in as "admin".
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 8888);
const storeDir = path.join(root, '.local-store');
await fs.mkdir(storeDir, { recursive: true });

// Local-only secrets, generated once and kept out of git (.local-store is ignored).
async function localSecret(name, make) {
  const file = path.join(storeDir, name);
  try { return (await fs.readFile(file, 'utf8')).trim(); } catch {
    const v = make();
    if (v) await fs.writeFile(file, v);
    return v;
  }
}
Object.assign(process.env, {
  ADMIN_LOCAL: '1',
  ADMIN_ORIGIN: `http://localhost:${PORT}`,
  ADMIN_LOCAL_STORE: storeDir,
  SESSION_SECRET: process.env.SESSION_SECRET || await localSecret('_session_secret', () => randomBytes(32).toString('base64url')),
  EXPORT_TOKEN: process.env.EXPORT_TOKEN || await localSecret('_export_token', () => randomBytes(32).toString('base64url')),
  BOOTSTRAP_PASSWORD: process.env.BOOTSTRAP_PASSWORD || await localSecret('_bootstrap_password', () => ''),
  SETUP_CODE: process.env.SETUP_CODE ?? 'local-dev-setup-code',
});

// The edge gate reads env through the Netlify global, as it does at the edge.
globalThis.Netlify = { env: { get: (k) => process.env[k] } };
const { default: gate } = await import('./netlify/edge-functions/gate.js');
const { default: api } = await import('./netlify/functions/api.mts');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.txt': 'text/plain' };
const PASS = Symbol('next');

async function send(res, r) {
  const cookies = r.headers.getSetCookie();
  if (cookies.length) res.setHeader('set-cookie', cookies);
  res.writeHead(r.status, Object.fromEntries([...r.headers].filter(([k]) => k !== 'set-cookie')));
  res.end(Buffer.from(await r.arrayBuffer()));
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks);
  const request = () => new Request(url, { method: req.method, headers: req.headers, body });

  const gated = await gate(request(), { next: () => PASS });
  if (gated !== PASS) return send(res, gated);

  if (url.pathname.startsWith('/api/')) return send(res, await api(request(), { ip: req.socket.remoteAddress }));

  const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const file = path.join(root, 'public', path.normalize(rel));
  if (!file.startsWith(path.join(root, 'public'))) { res.writeHead(403).end(); return; }
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' }).end(data);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Admin portal (local): http://localhost:${PORT}`);
  console.log(`Setup code: ${process.env.SETUP_CODE || '(disabled)'}`);
  console.log(`Bootstrap "admin" login: ${process.env.BOOTSTRAP_PASSWORD ? 'enabled' : 'off (.local-store/_bootstrap_password)'}`);
  console.log(`Preview the public site with portal content (repo root):\n  ADMIN_EXPORT_URL=http://localhost:${PORT}/api/export EXPORT_TOKEN=$(cat admin/.local-store/_export_token) npm run build`);
});
