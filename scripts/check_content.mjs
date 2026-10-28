// Content-quality gate: what a person actually reads on every screen, for every company, at phone and
// laptop width. Fails on:
//   - a <select> option or button with no visible text or label
//   - a layout child that starts with punctuation (",", ".", ";", ":"), which shows as "word ,"
//   - a space before punctuation in visible text ("hawk , Northgate")
//   - straight double quotes around display text (we use one pair of curly quotes)
//   - a label with nothing after it ("Owner:", "by"), an empty pill, or an empty heading
//   - NaN, Infinity, undefined or null in visible text
// Run: node scripts/check_content.mjs [base-url]   (default http://127.0.0.1:8731, a local web/ server)
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:8731';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9338;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'callready-content-'))}`, 'about:blank'], { stdio: 'ignore' });
let target;
for (let i = 0; i < 60 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* not up */ } }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map();
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;
await send('Page.enable');

const PROBE = `(() => {
  const out = [];
  const main = document.querySelector('.shell') || document.body;
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  main.querySelectorAll('select').forEach((s) => { [...s.options].forEach((o, i) => { if (!o.textContent.trim() && o.value !== '') out.push('empty option ' + i + ' in <select id="' + s.id + '">'); }); });
  main.querySelectorAll('button, a.btn').forEach((b) => { if (vis(b) && !b.textContent.trim() && !b.getAttribute('aria-label') && !b.title) out.push('button with no text or label'); });
  main.querySelectorAll('*').forEach((el) => {
    if (!vis(el)) return;
    const cs = getComputedStyle(el);
    if (cs.display.includes('flex') || cs.display.includes('grid')) for (const n of el.childNodes) { const t = (n.textContent || '').trim(); if (t && /^[,.;:]/.test(t) && (n.nodeType === 3 || (n.nodeType === 1 && vis(n)))) out.push('layout child starts with punctuation: "' + t.slice(0, 40) + '" in <' + el.tagName.toLowerCase() + ' class="' + el.className + '">'); }
    if (el.matches('.pill, .cite, h1, h2, h3, .readout .v') && !el.textContent.trim()) out.push('empty <' + el.tagName.toLowerCase() + ' class="' + el.className + '">');
  });
  main.querySelectorAll('.evidence').forEach((e) => { if (!e.querySelector('.pill, .cite')) out.push('Evidence label with no evidence'); });
  const text = main.innerText;
  for (const m of text.matchAll(/[^\\s(]\\s+[,;:](?=\\s|$)|\\w\\s+\\.(?=\\s|$)/g)) out.push('space before punctuation: "' + text.slice(Math.max(0, m.index - 25), m.index + 15).replace(/\\s+/g, ' ') + '"');
  for (const m of text.matchAll(/(^|[\\s(])"[A-Za-z0-9][^"\\n]{3,}?"(?=[\\s.,;:)]|$)/g)) out.push('straight quotes around display text: ' + m[0].trim().slice(0, 60));
  for (const m of text.matchAll(/\\b(Owner|Answering as|Sources|by):\\s*$/gm)) out.push('label with nothing after it: "' + m[0] + '"');
  for (const m of text.matchAll(/\\b(NaN|Infinity|undefined)\\b|(?<![\\w-])null(?![\\w-])/g)) out.push('shows "' + m[0] + '": "' + text.slice(Math.max(0, m.index - 30), m.index + 10).replace(/\\s+/g, ' ') + '"');
  return [...new Set(out)];
})()`;

const packs = [{ kind: 'sample' }, ...JSON.parse(readFileSync(new URL('../web/datasets/index.json', import.meta.url))).map((d) => ({ kind: 'dataset', slug: d.slug }))];
const routes = ['#/load', '#/', '#/pressure', '#/questions', '#/rehearse', '#/report'];
let fails = 0;
await send('Page.navigate', { url: `${BASE}/#/` }); await sleep(1500);
for (const [w, h, mobile] of [[375, 812, true], [1440, 900, false]]) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  for (const pk of packs) for (const r of routes) {
    await js(`localStorage.setItem('callready.active', ${JSON.stringify(JSON.stringify(pk))}); location.hash = '${r}'; location.reload();`);
    await sleep(1300);
    if (r === '#/rehearse') await js(`(async () => { const b = document.getElementById('weak'); const a = document.getElementById('answer'); if (b) b.click(); else if (a) a.value = 'We said margins would recover, and they did not. Revenue grew but costs rose faster. We will report the margin every quarter.'; document.getElementById('score')?.click(); await new Promise((d) => setTimeout(d, 600)); })()`);
    if (r === '#/report') await js(`(async () => { document.getElementById('demo')?.click(); await new Promise((d) => setTimeout(d, 400)); })()`);
    const found = (await js(PROBE)) || [];
    if (found.length) { fails += found.length; console.log(`FAIL ${w}px ${pk.slug || 'sample'} ${r}`); for (const f of found.slice(0, 6)) console.log('    ' + f); }
  }
}
ws.close(); chrome.kill();
console.log(fails ? `\n${fails} content problem(s)` : '\nContent clean: every option, label, quote and punctuation mark reads correctly on every screen');
process.exit(fails ? 1 : 0);
