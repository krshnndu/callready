// Layout gate: renders every screen for every pack at phone and laptop widths in headless Chrome and
// fails on any of these:
//   - chart text overlapping other chart text
//   - chart text spilling outside its chart
//   - horizontal page scroll
//   - content poking out of its panel (outside the parts that scroll on purpose: tables, the step bar)
// Run: node scripts/check_layout.mjs [base-url]   (default http://127.0.0.1:8731, a local web/ server)
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertFreshServer } from './serve.mjs';

const BASE = process.argv[2] || 'http://127.0.0.1:8731';
await assertFreshServer(BASE);
setTimeout(() => { console.log('FAIL  gate timed out after 10 minutes (Chrome or the page hung)'); process.exit(2); }, 600000).unref();
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9335;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'callready-layout-'))}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
let target;
for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* not up yet */ } }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map();
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;
await send('Page.enable');

const PROBE = `(() => {
  const out = [];
  const inter = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  if (document.documentElement.scrollWidth > innerWidth + 1) out.push('page scrolls sideways: ' + document.documentElement.scrollWidth + 'px wide at ' + innerWidth + 'px');
  document.querySelectorAll('svg.chart').forEach((svg) => {
    const box = svg.getBoundingClientRect();
    const texts = [...svg.querySelectorAll('text')].map((t) => ({ t: t.textContent, r: t.getBoundingClientRect() })).filter((x) => x.r.width > 0);
    for (const x of texts) if (x.r.left < box.left - 2 || x.r.right > box.right + 2) out.push('chart text outside its chart: "' + x.t + '"');
    for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) if (inter(texts[i].r, texts[j].r)) out.push('chart text overlaps: "' + texts[i].t + '" and "' + texts[j].t + '"');
  });
  document.querySelectorAll('.panel').forEach((p) => {
    const pr = p.getBoundingClientRect();
    p.querySelectorAll('*').forEach((el) => {
      if (el.closest('.table-wrap, .steps, svg')) return;
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > pr.right + 1 || r.left < pr.left - 1)) out.push('pokes out of its panel: <' + el.tagName.toLowerCase() + ' class="' + el.className + '"> "' + (el.textContent || '').trim().slice(0, 40) + '"');
    });
  });
  return [...new Set(out)];
})()`;

const packs = [{ kind: 'sample' }, ...JSON.parse(readFileSync(new URL('../web/datasets/index.json', import.meta.url))).map((d) => ({ kind: 'dataset', slug: d.slug }))];
const routes = ['#/load', '#/', '#/pressure', '#/questions', '#/rehearse', '#/report'];
const sizes = [[375, 812, true], [1440, 900, false]];
let fails = 0;
await send('Page.navigate', { url: `${BASE}/#/` }); await sleep(1500);
for (const [w, h, mobile] of sizes) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  for (const pk of packs) {
    for (const r of routes) {
      await js(`localStorage.setItem('callready.active', ${JSON.stringify(JSON.stringify(pk))}); location.hash = '${r}'; location.reload();`);
      await sleep(1400);
      if (r === '#/rehearse') await js(`(async () => { const b = document.getElementById('weak'); const a = document.getElementById('answer'); if (b) b.click(); else if (a) a.value = 'We said margins would recover, and they did not. Revenue grew but costs rose faster. We will report the margin every quarter.'; document.getElementById('score')?.click(); await new Promise((d) => setTimeout(d, 600)); })()`);
      if (r === '#/report') await js(`(async () => { document.getElementById('demo')?.click(); await new Promise((d) => setTimeout(d, 500)); })()`);
      const found = (await js(PROBE)) || [];
      if (found.length) { fails += found.length; console.log(`FAIL ${w}px ${pk.slug || 'sample'} ${r}`); for (const f of found.slice(0, 8)) console.log('    ' + f); }
    }
  }
}
ws.close(); chrome.kill();
console.log(fails ? `\n${fails} layout problem(s)` : '\nLayout clean: no overlaps, spills or sideways scroll on any screen, pack or size');
process.exit(fails ? 1 : 0);
