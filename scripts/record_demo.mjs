// Records the 90-second pitch path (docs/07-PITCH.md) on the live site as an MP4 backup.
// Headless Chrome over the DevTools protocol, screencast frames, captions burned in, ffmpeg to encode.
// Run: node scripts/record_demo.mjs [url] [out.mp4]
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const URL0 = process.argv[2] || 'https://callreadyai.vercel.app';
const OUT = process.argv[3] || new URL('../media/callready-demo.mp4', import.meta.url).pathname;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const W = 1440, H = 900, PORT = 9333;
const work = mkdtempSync(join(tmpdir(), 'callready-rec-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(work, 'profile')}`, `--window-size=${W},${H}`, '--hide-scrollbars', '--force-color-profile=srgb', 'about:blank'], { stdio: 'ignore' });
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* not up yet */ }
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map(); const frames = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  if (m.method === 'Page.screencastFrame') {
    frames.push({ t: m.params.metadata.timestamp, data: m.params.data });
    send('Page.screencastFrameAck', { sessionId: m.params.sessionId });
  }
});
function send(method, params = {}) { return new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); }); }
const js = (expr) => send('Runtime.evaluate', { expression: expr, awaitPromise: true });

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });

const caption = (text) => js(`(() => { let c = document.getElementById('rec-cap'); if (!c) { c = document.createElement('div'); c.id = 'rec-cap'; c.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);max-width:980px;padding:14px 22px;border-radius:16px;background:rgba(22,26,43,.86);color:#fff;font:500 20px/1.45 Inter,system-ui,sans-serif;z-index:9999;box-shadow:0 10px 30px rgba(0,0,0,.25);text-align:center'; document.body.appendChild(c); } c.textContent = ${JSON.stringify(text)}; })()`);
const go = async (hash) => { await js(`location.hash = '${hash}'`); await sleep(600); };
const scrollTo = async (y, ms = 1800) => js(`new Promise((done) => { const s = scrollY, t0 = performance.now(); const f = (t) => { const k = Math.min(1, (t - t0) / ${ms}); scrollTo(0, s + (${y} - s) * (1 - Math.pow(1 - k, 3))); k < 1 ? requestAnimationFrame(f) : done(); }; requestAnimationFrame(f); })`);
const scrollToSel = async (sel, ms) => { const r = await js(`(() => { const e = document.querySelector('${sel}'); return e ? e.getBoundingClientRect().top + scrollY - 90 : 0; })()`); await scrollTo(r.result.value, ms); };

await send('Page.navigate', { url: `${URL0}/#/report` });
await sleep(2500);
await js(`document.getElementById('clear')?.click()`);
await go('#/');
await sleep(1200);
await send('Page.startScreencast', { format: 'jpeg', quality: 82, maxWidth: W, maxHeight: H, everyNthFrame: 1 });

// 0:00 Problem
await caption('Revenue is up 14.3%, but EBITDA margin fell 258 bps and cash conversion halved. Analysts will quote last quarter\'s promises back to the CFO.');
await sleep(4000); await scrollTo(240, 1800); await sleep(2500);
// 0:10 Any company
await go('#/load');
await caption('Any company: upload the results PDF. AI converts it, rules check every figure against the document (48 of 48 on our test). Six real NSE filings ship as test datasets.');
await sleep(7500);
await js(`localStorage.setItem('callready.active', '{"kind":"sample"}')`);
// 0:18 Pressure map
await go('#/pressure');
await caption('Step 2. Plain arithmetic ranks what investors will push on. To keep the margin promise, H2 needs 15.3%; the best quarter ever was 14.2%.');
await sleep(5000); await scrollToSel('.plist', 2000); await sleep(4500); await scrollToSel('#remarks', 1800); await sleep(3000);
// 0:30 Rehearse
await go('#/rehearse/Q01');
await caption('Step 4. The CFO rehearses the guidance question with a weak answer.');
await sleep(3500);
await js(`document.getElementById('weak').click()`); await sleep(2500);
await js(`document.getElementById('score').click()`);
await caption('Red: 12.4% is not in the results, the August promise is ignored, and "definitely" is new guidance on the fly.');
await sleep(1500); await scrollToSel('#card', 1800); await sleep(5500);
await js(`new Promise((done) => { const t0 = Date.now(); const f = () => (document.querySelector('.improved') || Date.now() - t0 > 60000) ? done() : setTimeout(f, 300); f(); })`);
await scrollToSel('#coach', 2000);
await caption('The AI coach writes a stronger answer and the analyst\'s follow-up. Every figure is re-checked against the disclosures before it is shown.');
await sleep(8000);
// 0:55 Readiness report
await go('#/report');
await js(`document.getElementById('demo').click()`); await sleep(800);
await caption('Step 5. The readiness report: the decision to take before the call is to revise the margin band, not defend it.');
await sleep(6000); await scrollToSel('#bc-out', 2000);
await caption('On stated, editable assumptions: about 50 prep hours and Rs 1.65 lakh a quarter, for Rs 2,600 of running cost.');
await sleep(5500); await scrollTo(99999, 2000);
await caption('Readiness by theme and speaker, the riskiest questions, and the CEO/CFO contradiction on guidance.');
await sleep(5500);
await caption('Limitation: CallReady anticipates questions grounded in the disclosures, not ones driven by tomorrow\'s news.');
await sleep(5000);
await send('Page.stopScreencast');
await sleep(300);
ws.close(); chrome.kill();

// Frames arrive only when the screen changes: give each one its real on-screen duration.
const dir = join(work, 'frames'); mkdirSync(dir);
let list = '';
frames.forEach((f, i) => {
  const p = join(dir, `${String(i).padStart(5, '0')}.jpg`);
  writeFileSync(p, Buffer.from(f.data, 'base64'));
  const dur = i + 1 < frames.length ? Math.max(0.02, frames[i + 1].t - f.t) : 1.5;
  list += `file '${p}'\nduration ${dur.toFixed(3)}\n`;
});
list += `file '${join(dir, `${String(frames.length - 1).padStart(5, '0')}.jpg`)}'\n`;
writeFileSync(join(work, 'list.txt'), list);
mkdirSync(dirname(OUT), { recursive: true });
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(work, 'list.txt'), '-vf', 'fps=30,format=yuv420p,scale=1440:-2', '-c:v', 'libx264', '-preset', 'medium', '-crf', '23', '-movflags', '+faststart', OUT]);
const total = frames.length ? frames.at(-1).t - frames[0].t : 0;
console.log(`${frames.length} frames, ${total.toFixed(1)} s -> ${OUT}`);
