// End-to-end journey on the live site with real, unseen filings (robustness plan, task R7).
// Uploads each company's PDFs through the real file input, converts, reviews, applies the strict
// evidence policy, walks every screen, scores an answer and opens the report. Fails on any page
// exception, any NaN/undefined/null on screen, any used figure not found in the document, or any
// headline figure that differs from the hand-checked truth.
// Run: node scripts/journey.mjs <scratch-dir-with-newco> [base-url]
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyAgainstSource } from '../web/js/core.js';

const SCRATCH = process.argv[2];
const BASE = process.argv[3] || 'https://callreadyai.vercel.app';
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9337;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const man = JSON.parse(readFileSync(`${SCRATCH}/newco/manifest.json`));
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'callready-journey-'))}`, '--window-size=1440,900', 'about:blank'], { stdio: 'ignore' });
let target;
for (let i = 0; i < 60 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* not up */ } }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map(); const errors = [];
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description?.split('\n')[0] || m.params.exceptionDetails?.text);
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error' && !/favicon|net::ERR_ABORTED/.test(m.params.entry.text)) errors.push(m.params.entry.text.slice(0, 160));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.value;
await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable'); await send('DOM.enable');
const BAD = /\b(NaN|Infinity|undefined)\b|(?<![\w-])null(?![\w-])/;
const waitHash = async (want, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const h = await js('location.hash'); if (h === want) return true; const st = await js(`document.getElementById('convert-status')?.textContent || ''`); if (/failed|could not|not enough/i.test(st)) return st; await sleep(2000); } return false; };

let fails = 0; const rows = [];
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; };
const runs = man.map((m, i) => ({ m, ai: i === man.length - 1 }));
for (const { m, ai } of runs) {
  console.log(`\n=== ${m.company} (${ai ? 'rules + AI' : 'rules only'})`);
  errors.length = 0;
  await send('Page.navigate', { url: `${BASE}/#/load` }); await sleep(2500);
  await js(`localStorage.clear(); location.reload()`); await sleep(2500);
  const doc = await send('DOM.getDocument', { depth: -1 });
  const node = await send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#files' });
  await send('DOM.setFileInputFiles', { nodeId: node.nodeId, files: m.files.map((f) => `${SCRATCH}/newco/${m.slug}/${f.kind}.pdf`) });
  await js(`document.getElementById('files').dispatchEvent(new Event('change', { bubbles: true })); ${ai ? "document.getElementById('use-ai').checked = true;" : ''} document.getElementById('convert').click(); 'ok'`);
  const t0 = Date.now();
  const reached = await waitHash('#/review', 480000);
  const secs = Math.round((Date.now() - t0) / 1000);
  check(reached === true, `converted and reached Review in ${secs} s${reached !== true ? `: ${reached}` : ''}`);
  if (reached !== true) continue;
  const draft = await js(`JSON.parse(localStorage.getItem('callready.draft'))`);
  const review = await js(`[...document.querySelectorAll('.readout')].map((r) => r.textContent.replace(/\\s+/g, ' ').trim()).join(' | ') + ' || ' + (document.querySelector('.policy')?.textContent.replace(/\\s+/g, ' ').trim() || '')`);
  console.log(`      review: ${review.slice(0, 300)}`);
  if (draft.crossCheck) console.log(`      cross-check: rules and AI agree on ${draft.crossCheck.agree}/${draft.crossCheck.checked}${draft.crossCheck.disagreements.length ? `; rules used for ${draft.crossCheck.disagreements.map((d) => `${d.path} (AI ${d.ai}, rules ${d.rules})`).join(', ')}` : ''}`);
  await js(`document.getElementById('use-draft').click(); 'ok'`);
  const used = await waitHash('#/', 15000);
  check(used === true, `"Use this company" accepted under the strict evidence policy${used !== true ? `: ${await js("document.getElementById('use-status')?.textContent")}` : ''}`);
  if (used !== true) continue;
  const pack = await js(`JSON.parse(localStorage.getItem('callready.userpack'))`);
  const ver = verifyAgainstSource(pack, draft.sourceText);
  check(ver.numbersFound === ver.numbersTotal && ver.quotesFound === ver.quotes.length && ver.linesFound === ver.lines.length, `every figure (${ver.numbersFound}/${ver.numbersTotal}), quote (${ver.quotesFound}/${ver.quotes.length}) and line (${ver.linesFound}/${ver.lines.length}) in use is in the document`);
  const t = m.truth, P = pack.periods;
  const pairs = [['revenue_current', P.current?.revenue], ['revenue_prior_year', P.priorYear?.revenue], ['ebitda_current', P.current?.ebitda], ['ebitda_prior_year', P.priorYear?.ebitda], ['pat_current', P.current?.pat], ['pat_prior_year', P.priorYear?.pat]];
  const acc = pairs.filter(([k, v]) => v === Number(String(t[k]).replace(/,/g, ''))).length;
  check(acc === pairs.length, `headline figures match the hand-checked truth: ${acc}/${pairs.length} (${pairs.map(([k, v]) => `${k}=${v}`).join(', ')})`);
  const screens = {};
  for (const r of ['#/', '#/pressure', '#/questions', '#/rehearse', '#/report']) {
    await js(`location.hash = '${r}'`); await sleep(1500);
    if (r === '#/rehearse') { await js(`(async () => { const a = document.getElementById('answer'); a.value = 'We said we would protect margins, and this quarter we did not. Revenue was ${t.revenue_current} crore and EBITDA ${t.ebitda_current} crore. Raw material costs drove the decline. We will report the margin bridge every quarter.'; a.dispatchEvent(new Event('input')); document.getElementById('score').click(); await new Promise((d) => setTimeout(d, 800)); })()`); }
    const txt = await js(`document.querySelector('main').innerText`);
    const bad = txt.match(BAD);
    screens[r] = { chars: txt.length, h1: (await js(`document.querySelector('h1')?.textContent`)) || '' };
    check(!bad && txt.length > 200, `${r.padEnd(12)} renders (${txt.length} chars)${bad ? `; shows "${bad[0]}" near "${txt.slice(Math.max(0, bad.index - 40), bad.index + 20).replace(/\s+/g, ' ')}"` : ''}`);
  }
  const score = await js(`(location.hash = '#/rehearse', new Promise((r) => setTimeout(() => r(document.querySelector('.total .v')?.textContent), 1200)))`);
  const pressure = await js(`(location.hash = '#/pressure', new Promise((r) => setTimeout(() => r([...document.querySelectorAll('.plist h3')].map((h) => h.textContent.trim()).slice(0, 4)), 1200)))`);
  check(errors.length === 0, `no page errors${errors.length ? `: ${[...new Set(errors)].slice(0, 3).join(' | ')}` : ''}`);
  rows.push({ company: m.company, mode: ai ? 'rules + AI' : 'rules only', secs, figures: `${ver.numbersFound}/${ver.numbersTotal}`, truth: `${acc}/${pairs.length}`, headline: screens['#/'].h1, pressure: pressure.join(' / '), quarter: pack.company.quarter });
}
ws.close(); chrome.kill();
console.log('\n=== Summary');
for (const r of rows) console.log(`${r.company} [${r.mode}, ${r.secs} s] ${r.quarter}: figures verified ${r.figures}, truth ${r.truth}. "${r.headline}" Top pressure: ${r.pressure}`);
console.log(fails ? `\n${fails} journey check(s) FAILED` : '\nJourney passed on every company');
process.exit(fails ? 1 : 0);
