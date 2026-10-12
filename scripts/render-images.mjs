// Renders scripts/og.html to the PNGs in /public with a local headless Chrome or Edge.
// Run with `npm run og` after changing the design. The PNGs are committed, so
// Netlify never needs a browser.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const page = pathToFileURL(path.join(root, 'scripts', 'og.html')).href;

const candidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const browser = candidates.find((p) => existsSync(p));
if (!browser) throw new Error('No Chrome/Edge found. Set CHROME_PATH.');

const shots = [
  { out: 'og.png', query: '', size: '1200,630' },
  { out: 'apple-touch-icon.png', query: '?icon', size: '180,180' },
  { out: 'favicon-32.png', query: '?icon=small', size: '32,32' },
];

for (const s of shots) {
  const out = path.join(root, 'public', s.out);
  execFileSync(browser, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--allow-file-access-from-files', '--virtual-time-budget=3000',
    `--window-size=${s.size}`, `--screenshot=${out}`, page + s.query,
  ], { stdio: 'ignore' });
  console.log('wrote', path.relative(root, out));
}
