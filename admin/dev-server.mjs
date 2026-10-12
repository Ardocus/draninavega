// Local development server for the admin portal: static files + the API
// function, with a file-backed store and the repo's own src/data files.
// Run: npm run dev  →  http://localhost:8888
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
const keyFile = path.join(storeDir, '_dev_key');
let devKey;
try { devKey = await fs.readFile(keyFile, 'utf8'); } catch {
  devKey = randomBytes(32).toString('base64');
  await fs.writeFile(keyFile, devKey);
}
Object.assign(process.env, {
  ADMIN_LOCAL: '1',
  ADMIN_ORIGIN: `http://localhost:${PORT}`,
  ADMIN_LOCAL_STORE: storeDir,
  ADMIN_LOCAL_REPO: path.resolve(root, '..'),
  DATA_KEY: process.env.DATA_KEY || devKey,
  SETUP_CODE: process.env.SETUP_CODE ?? 'local-dev-setup-code',
});

// Optional local bootstrap account: put a hash from `npm run hash-password` in .local-store/_bootstrap_hash
try { process.env.BOOTSTRAP_PASSWORD_HASH ||= (await fs.readFile(path.join(storeDir, '_bootstrap_hash'), 'utf8')).trim(); } catch { /* none */ }

const { default: api } = await import('./netlify/functions/api.mts');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname.startsWith('/api/')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks);
    const r = await api(new Request(url, { method: req.method, headers: req.headers, body }), { ip: req.socket.remoteAddress });
    const cookies = r.headers.getSetCookie();
    if (cookies.length) res.setHeader('set-cookie', cookies);
    res.writeHead(r.status, Object.fromEntries([...r.headers].filter(([k]) => k !== 'set-cookie')));
    res.end(Buffer.from(await r.arrayBuffer()));
    return;
  }
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const file = path.join(root, 'public', path.normalize(rel));
  if (!file.startsWith(path.join(root, 'public'))) { res.writeHead(403).end(); return; }
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(data);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`Admin portal (local): http://localhost:${PORT}`);
  console.log(`Setup code: ${process.env.SETUP_CODE || '(disabled)'}`);
  console.log('Edits write to ../src/data/*.json');
});
