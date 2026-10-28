// XSS gate (guardrails plan, task 3). Loads a hostile pack, with script payloads in every text field,
// markup where numbers belong and a javascript: link, as the user's pack and as a review draft. Renders
// every screen, scores a hostile answer, and fails if any payload ran, any element carries an inline
// event handler, or any link uses javascript:. The detector is proven first: a payload deliberately
// injected into the page must be caught.
// Run: node scripts/check_xss.mjs [base-url]   (default http://127.0.0.1:8731, a local web/ server)
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertFreshServer } from './serve.mjs';

const BASE = process.argv[2] || 'http://127.0.0.1:8731';
await assertFreshServer(BASE);
setTimeout(() => { console.log('FAIL  gate timed out after 10 minutes (Chrome or the page hung)'); process.exit(2); }, 600000).unref();
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9336;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'callready-xss-'))}`, 'about:blank'], { stdio: 'ignore' });
let target;
for (let i = 0; i < 60 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* not up yet */ } }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map();
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;
await send('Page.enable');

// Build the hostile pack from the real sample format, so every field the UI reads is present.
const P = (n) => `<img src=x onerror="window.__pwned='${n}'">"><script>window.__pwned='${n}s'</script>`;
const sample = JSON.parse(readFileSync(new URL('../web/datasets/jk-tyre.json', import.meta.url)));
const hostile = JSON.parse(JSON.stringify(sample));
let n = 0;
const poison = (o) => { for (const [k, v] of Object.entries(o)) { if (typeof v === 'string' && !['schema', 'kind', 'metric', 'status', 'source'].includes(k)) o[k] = v + P(++n); else if (v && typeof v === 'object') poison(v); } };
poison(hostile);
hostile.id = 'hostile';
hostile.periods.current.pat = P('num');
hostile.provenance = { source: 'upload', urls: ['javascript:window.__pwned="href"', 'https://example.com/ok'], verify: { numbersFound: P('v1'), numbersTotal: 3 }, caveats: P('cav') };
hostile.company.speakers = { CEO: P('ceo'), CFO: P('cfo') };
hostile.commitments = [{ id: 'G1', kind: 'guidance', by: 'CFO', said: P('said'), metric: 'ebitdaMargin', target: { low: P('low'), high: 20 }, why: P('why') }, { id: 'S1', kind: 'statement', by: 'CEO', said: P('s1'), metric: 'other', status: 'broken', why: P('w2') }];
hostile.transcript = [{ ref: P('ref'), speaker: 'Analyst, X', text: P('line') }];
hostile.notes = [{ ref: 'N1', text: P('note') }];
hostile.bridge = [{ driver: P('drv'), bps: P('bps') }];
hostile.remarks = P('remarks');
hostile.questions = [{ id: 'Q01', theme: P('theme'), persona: P('persona'), owner: 'CFO', difficulty: 'Hard', text: P('qtext'), trap: P('trap'), cites: [P('cite')], mustAck: ['S1'], terms: [], keyFigures: [], followup: P('fu'), model: P('model'), weak: P('weak') }];
hostile.personas = { [P('pk')]: { name: P('pname'), firm: P('pfirm'), style: P('pstyle') } };

const PROBE = `(() => {
  const bad = [];
  if (window.__pwned) bad.push('a payload ran: ' + window.__pwned);
  document.querySelectorAll('*').forEach((el) => { for (const a of el.attributes) if (/^on/i.test(a.name)) bad.push('inline handler <' + el.tagName.toLowerCase() + ' ' + a.name + '>'); });
  document.querySelectorAll('a[href]').forEach((a) => { if (/^\\s*javascript:/i.test(a.getAttribute('href'))) bad.push('javascript: link'); });
  document.querySelectorAll('script').forEach((s) => { if (!s.src && s.textContent.includes('__pwned')) bad.push('script element from data'); });
  return [...new Set(bad)];
})()`;

let fails = 0;
await send('Page.navigate', { url: `${BASE}/#/` }); await sleep(1500);

// 1. Prove the detector: it must catch a payload injected on purpose.
await js(`document.body.insertAdjacentHTML('beforeend', '<img src=x onerror="window.__pwned=\\'canary\\'">'); new Promise((r) => setTimeout(r, 400))`);
const canary = await js(PROBE);
const detectorWorks = canary.some((x) => x.includes('canary') || x.includes('inline handler'));
console.log(`${detectorWorks ? 'PASS' : 'FAIL'}  detector catches a deliberately injected payload (${canary.join('; ')})`);
if (!detectorWorks) fails++;

// 2. The hostile pack, on every screen.
const store = `localStorage.setItem('callready.userpack', ${JSON.stringify(JSON.stringify(hostile))}); localStorage.setItem('callready.active', '{"kind":"user"}'); localStorage.setItem('callready.draft', ${JSON.stringify(JSON.stringify({ pack: hostile, fixes: [P('fix')], sourceText: 'source', model: P('model') }))});`;
for (const r of ['#/', '#/pressure', '#/questions', '#/rehearse/Q01', '#/report', '#/load', '#/review']) {
  await js(`${store} location.hash = '${r}'; location.reload();`);
  await sleep(1300);
  if (r.startsWith('#/rehearse')) await js(`(async () => { const a = document.getElementById('answer'); if (a) { a.value = ${JSON.stringify(P('answer') + ' we said margins would recover and they did not, revenue was 4850 crore')}; document.getElementById('score')?.click(); } await new Promise((d) => setTimeout(d, 900)); })()`);
  if (r === '#/report') await js(`(async () => { document.getElementById('demo')?.click(); await new Promise((d) => setTimeout(d, 400)); })()`);
  // Hover and focus every tooltip target, so data-tip text is rendered too.
  await js(`(async () => { for (const el of [...document.querySelectorAll('[data-tip]')].slice(0, 60)) el.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 10, clientY: 10 })); await new Promise((d) => setTimeout(d, 200)); })()`);
  const found = (await js(PROBE)) || [];
  const rendered = await js(`document.querySelector('main')?.textContent.length || 0`);
  const okRoute = !found.length && rendered > 50;
  console.log(`${okRoute ? 'PASS' : 'FAIL'}  ${r.padEnd(16)} ${found.length ? found.slice(0, 5).join('; ') : `rendered ${rendered} chars, no payload ran`}`);
  if (!okRoute) fails++;
}
ws.close(); chrome.kill();
console.log(fails ? `\n${fails} XSS check(s) FAILED` : '\nNo payload ran on any screen');
process.exit(fails ? 1 : 0);
