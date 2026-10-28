// Captures the README and docs screenshots from the live site with headless Chrome (DevTools protocol).
// Run: node scripts/screenshots.mjs [url]   ->  docs/screenshots/*.png
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const URL0 = process.argv[2] || 'https://callreadyai.vercel.app';
const OUT = new URL('../docs/screenshots/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9334;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const work = mkdtempSync(join(tmpdir(), 'callready-shots-'));
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(work, 'p')}`, '--hide-scrollbars', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });
let target;
for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* not up yet */ } }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map();
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = (expression) => send('Runtime.evaluate', { expression, awaitPromise: true });
await send('Page.enable');

const shots = [
  // name, hash, width, height, mobile, theme, setup
  ['desktop-quarter', '#/', 1440, 900, false, 'light'],
  ['desktop-pressure', '#/pressure', 1440, 900, false, 'light'],
  ['desktop-rehearse', '#/rehearse/Q01', 1440, 900, false, 'light', `document.getElementById('weak').click(); document.getElementById('score').click(); await new Promise(r => setTimeout(r, 4000));`],
  ['desktop-report-dark', '#/report', 1440, 900, false, 'dark', `document.getElementById('clear').click(); await new Promise(r => setTimeout(r, 300)); document.getElementById('demo').click(); await new Promise(r => setTimeout(r, 600));`],
  ['desktop-load', '#/load', 1440, 900, false, 'light'],
  ['phone-quarter', '#/', 390, 844, true, 'light'],
  ['phone-pressure-dark', '#/pressure', 390, 844, true, 'dark'],
  ['phone-rehearse', '#/rehearse/Q03', 390, 844, true, 'light', `document.getElementById('weak').click(); document.getElementById('score').click(); await new Promise(r => setTimeout(r, 3000)); document.getElementById('card').scrollIntoView();`],
];
await send('Page.navigate', { url: `${URL0}/#/` }); await sleep(2500);
for (const [name, hash, w, h, mobile, theme, setup] of shots) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
  await js(`localStorage.setItem('callready.theme', '"auto"'); localStorage.setItem('callready.active', '{"kind":"sample"}'); location.hash = '${hash}'; location.reload();`);
  await sleep(2500);
  if (setup) await js(`(async () => { ${setup} })()`);
  if (!setup?.includes('scrollIntoView')) await js('window.scrollTo(0, 0)');
  await sleep(500);
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}${name}.png`, Buffer.from(shot.data, 'base64'));
  console.log('saved', name);
}
ws.close(); chrome.kill();
