// Chart-truth gate: reads every drawn chart back and fails if a picture says something the numbers do
// not. It runs on every screen for every company at phone and laptop width, then on seeded random
// inputs for every chart type (negatives, zeros, one point, equal values, huge and tiny numbers,
// NaN and Infinity). For each chart it checks:
//   - the chart records its scale (every chart must be drawn through charts.js scale())
//   - every bar, dot and range sits at the pixels its value maps to, within 0.75 px
//   - a bar chart's axis includes zero; a waterfall cuts its axis only when a step would be thinner
//     than MIN_STEP_PX from zero, and a cut bar carries a break mark and a caption saying where the
//     axis starts
//   - ticks are round (1, 2, 2.5 or 5 times a power of ten), evenly spaced, span the axis, carry the
//     unit, and are placed and labelled at the value they claim
//   - bar and diverging value labels say the value of their bar
//   - negatives use a true minus sign, never a hyphen
//   - no NaN, Infinity or undefined anywhere in the drawing
// Run: node scripts/check_charts.mjs [base-url] [random-cases-per-type]   (default http://127.0.0.1:8731, 300)
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertFreshServer } from './serve.mjs';

const BASE = process.argv[2] || 'http://127.0.0.1:8731';
await assertFreshServer(BASE);
setTimeout(() => { console.log('FAIL  gate timed out after 10 minutes (Chrome or the page hung)'); process.exit(2); }, 600000).unref();
const CASES = Number(process.argv[3]) || 300;
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9339;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const chrome = spawn(CHROME, ['--headless=new', '--no-sandbox', `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'callready-charts-'))}`, 'about:blank'], { stdio: 'ignore' });
let target;
for (let i = 0; i < 60 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* not up */ } }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map();
ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
await send('Page.enable');

// The checker runs in the page, so it measures what the browser actually drew.
const TRUTH = `window.__truth = (root) => {
  const out = [], near = (a, b, t = 0.75) => Math.abs(a - b) <= t, num = (t) => parseFloat(String(t).replace(/\u2212/g, '-').replace(/[^0-9.+-]/g, ''));
  for (const svg of root.querySelectorAll('svg.chart')) {
    const kind = svg.dataset.chart;
    if (!kind) { out.push('a chart drawn without a recorded scale (not through charts.js): ' + (svg.getAttribute('aria-label') || '').slice(0, 60)); continue; }
    const name = kind + ' "' + (svg.getAttribute('aria-label') || '').slice(0, 50) + '"';
    if (/NaN|Infinity|undefined/.test(svg.outerHTML)) { out.push(name + ': NaN, Infinity or undefined in the drawing'); continue; }
    const lo = +svg.dataset.lo, hi = +svg.dataset.hi, p0 = +svg.dataset.p0, p1 = +svg.dataset.p1, axis = svg.dataset.axis, unit = svg.dataset.unit || '';
    if (![lo, hi, p0, p1].every(Number.isFinite) || !(hi > lo)) { out.push(name + ': scale is not a real range'); continue; }
    const map = (v) => p0 + (p1 - p0) * (v - lo) / (hi - lo);
    const [pmin, pmax] = [Math.min(p0, p1), Math.max(p0, p1)];
    const note = svg.nextElementSibling?.classList.contains('chart-note') ? svg.nextElementSibling.textContent : '';
    const isBar = ['bars', 'waterfall', 'diverging'].includes(kind);
    if (isBar && kind !== 'waterfall' && !(lo <= 0 && hi >= 0)) out.push(name + ': a bar chart whose axis leaves out zero');
    if (kind === 'waterfall' && lo > 0 && !/Axis starts at/.test(note)) out.push(name + ': axis cut above zero without saying so');
    // A cut is allowed only when some step would be thinner than MIN_STEP_PX drawn from zero.
    if (kind === 'waterfall' && lo > 0) {
      const steps = [...svg.querySelectorAll('.bar.up, .bar.down, .bar.gap')].map((m) => Math.abs(+m.dataset.v - +m.dataset.b)).filter((d) => d > 0);
      const px = steps.length ? (Math.min(...steps) / hi) * Math.abs(p0 - p1) : Infinity;
      if (px >= window.__MIN_STEP_PX + 0.01) out.push(name + ': axis cut at ' + lo + ' although every step is visible from zero (smallest ' + px.toFixed(1) + ' px), so the totals look further apart than they are');
    }
    for (const m of svg.querySelectorAll('[data-v]:not(.tick)')) {
      const v = +m.dataset.v, pe = map(v);
      if (pe < pmin - 0.75 || pe > pmax + 0.75) { out.push(name + ': value ' + v + ' drawn outside its axis'); continue; }
      if (m.tagName === 'circle') { const c = +m.getAttribute(axis === 'y' ? 'cy' : 'cx'); if (!near(c, pe)) out.push(name + ': dot for ' + v + ' at ' + c.toFixed(1) + ', should be ' + pe.toFixed(1)); continue; }
      const b = +m.dataset.b, clipped = b < lo - (hi - lo) * 1e-9 || b > hi + (hi - lo) * 1e-9, pb = map(Math.min(hi, Math.max(lo, b)));
      const bb = m.getBBox(), [a0, a1] = axis === 'y' ? [bb.y, bb.y + bb.height] : [bb.x, bb.x + bb.width];
      const tol = Math.abs(pe - pb) < 2 ? 2.01 : 0.75;
      if (!near(a0, Math.min(pb, pe), tol) || !near(a1, Math.max(pb, pe), tol)) out.push(name + ': mark for ' + b + ' to ' + v + ' drawn at ' + a0.toFixed(1) + '..' + a1.toFixed(1) + ', should be ' + Math.min(pb, pe).toFixed(1) + '..' + Math.max(pb, pe).toFixed(1));
      if (clipped && !m.parentNode.querySelector('.axis-break')) out.push(name + ': bar from ' + b + ' is cut by the axis but has no break mark');
      if (clipped && !/Axis starts at/.test(note)) out.push(name + ': bar from ' + b + ' is cut by the axis and the caption does not say so');
      if ((kind === 'bars' || kind === 'diverging') && b === 0) { const t = m.parentNode.querySelector('.val'); if (t) { if (/(^|[^\w])-\d/.test(t.textContent)) out.push(name + ': hyphen used as a minus sign in "' + t.textContent + '"'); const n = num(t.textContent), d = (String(t.textContent).split('.')[1] || '').replace(/[^0-9]/g, '').length; if (!(Math.abs(n - v) <= 0.5 * 10 ** -d + 1e-9)) out.push(name + ': label "' + t.textContent + '" on a bar of ' + v); } }
    }
    for (const t of svg.querySelectorAll('text')) if (/(^|[\s(])-\d/.test(t.textContent)) out.push(name + ': hyphen used as a minus sign in "' + t.textContent + '"');
    const ticks = [...svg.querySelectorAll('.tick')];
    if ((kind === 'line' || kind === 'gauge') && ticks.length < 2) out.push(name + ': no axis ticks');
    if (ticks.length >= 2) {
      const tv = ticks.map((t) => +t.dataset.v), step = tv[1] - tv[0], mant = step / 10 ** Math.floor(Math.log10(step));
      if (![1, 2, 2.5, 5, 10].some((x) => Math.abs(x - mant) < 1e-6)) out.push(name + ': tick step ' + step + ' is not round');
      if (tv.some((t, i) => i && Math.abs(t - tv[i - 1] - step) > Math.abs(step) * 1e-6)) out.push(name + ': ticks are unevenly spaced');
      if (Math.abs(tv[0] - lo) > 1e-9 || Math.abs(tv[tv.length - 1] - hi) > 1e-9) out.push(name + ': ticks do not span the axis');
      for (const t of ticks) {
        const txt = t.textContent, v = +t.dataset.v;
        if (unit && !txt.endsWith(unit)) out.push(name + ': tick "' + txt + '" has no unit');
        if (/(^|[^\w])-\d/.test(txt)) out.push(name + ': hyphen used as a minus sign in tick "' + txt + '"'); if (Math.abs(num(txt.replace(/,/g, '')) - v) > 1e-9 * Math.max(1, Math.abs(v))) out.push(name + ': tick labelled "' + txt + '" sits at ' + v);
        const pos = axis === 'y' ? +t.getAttribute('y') - 4 : +t.getAttribute('x');
        if (!near(pos, map(v))) out.push(name + ': tick "' + txt + '" placed at ' + pos.toFixed(1) + ', should be ' + map(v).toFixed(1));
      }
    }
  }
  return out;
}; 'ok'`;

let fails = 0, charts = 0;
const report = (where, found) => { if (found.length) { fails += found.length; console.log(`FAIL ${where}`); for (const f of [...new Set(found)].slice(0, 6)) console.log('    ' + f); } };

// 1. Every screen, every company, two widths.
const packs = [{ kind: 'sample' }, ...JSON.parse(readFileSync(new URL('../web/datasets/index.json', import.meta.url))).map((d) => ({ kind: 'dataset', slug: d.slug }))];
const routes = ['#/', '#/pressure', '#/questions', '#/rehearse', '#/report'];
await send('Page.navigate', { url: `${BASE}/#/` }); await sleep(1500);
for (const [w, h, mobile] of [[375, 812, true], [1440, 900, false]]) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile });
  for (const pk of packs) for (const r of routes) {
    await js(`localStorage.setItem('callready.active', ${JSON.stringify(JSON.stringify(pk))}); location.hash = '${r}'; location.reload();`);
    await sleep(1300);
    await js(TRUTH); await js(`import('/js/charts.js').then((m) => { window.__MIN_STEP_PX = m.MIN_STEP_PX; return 1; })`);
    charts += await js(`document.querySelectorAll('svg.chart').length`);
    report(`${w}px ${pk.slug || 'sample'} ${r}`, (await js(`window.__truth(document)`)) || []);
  }
}
console.log(`Screens: ${charts} charts drawn across ${packs.length} companies, ${routes.length} screens, 2 widths`);

// 2. Seeded random inputs for every chart type.
const fuzz = await js(`(async () => {
  ${TRUTH};
  const C = await import('/js/charts.js?gate=' + Date.now()); window.__MIN_STEP_PX = C.MIN_STEP_PX;
  let seed = 20261028; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const num = () => pick([() => (rnd() - 0.5) * 200, () => rnd() * 1e6, () => -rnd() * 1e6, () => 0, () => rnd() * 0.01, () => 10 + rnd() * 10, () => 1e9, () => -0.001, () => NaN, () => Infinity, () => 7, () => 11.6, () => 14.2])();
  const label = () => pick(['Q1 FY26', 'Gross margin', 'Employee cost', 'A very long driver name that will not fit', '', 'x', 'Energy Solutions & <Co>', 'Q4 FY27']);
  const n = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const make = {
    bars: () => C.bars({ W: n(260, 900), title: 'Fuzz bars', points: Array.from({ length: n(0, 9) }, (_, i) => ({ label: label(), value: num(), now: i === 0 })) }),
    line: () => C.line({ W: n(260, 900), title: 'Fuzz line', points: Array.from({ length: n(0, 9) }, () => ({ label: label(), value: num() })), band: rnd() < 0.5 ? { low: num(), high: num(), label: label() } : null }),
    waterfall: () => C.waterfall({ W: n(260, 900), title: 'Fuzz waterfall', start: { label: 'Year ago', value: num() }, end: { label: 'This quarter', value: num() }, steps: Array.from({ length: n(0, 7) }, () => ({ label: label(), delta: pick([num, () => (rnd() - 0.5) * 4])() })) }),
    diverging: () => C.diverging({ W: n(260, 900), title: 'Fuzz diverging', rows: Array.from({ length: n(0, 6) }, () => ({ label: label(), value: Math.round(num()) })) }),
    gauge: () => C.gauge({ W: n(260, 900), title: 'Fuzz gauge', marks: Array.from({ length: n(0, 4) }, (_, i) => ({ label: label(), value: num(), bad: i === 0 })), band: rnd() < 0.7 ? { low: num(), high: num() } : null }),
  };
  const host = document.createElement('div'); host.style.cssText = 'position:absolute;left:0;top:0;width:900px;visibility:hidden'; document.body.appendChild(host);
  const out = [], counts = {};
  for (const [k, f] of Object.entries(make)) for (let i = 0; i < ${CASES}; i++) {
    let html; try { html = f(); } catch (e) { out.push(k + ' threw: ' + e.message); continue; }
    host.innerHTML = html; counts[k] = (counts[k] || 0) + host.querySelectorAll('svg.chart').length;
    for (const x of window.__truth(host)) out.push('case ' + k + ' #' + i + ': ' + x);
  }
  host.remove();
  return { out, counts };
})()`);
report(`random inputs`, fuzz.out);
console.log(`Random: ${Object.entries(fuzz.counts).map(([k, v]) => `${k} ${v}`).join(', ')} charts drawn from ${CASES} cases per type`);

ws.close(); chrome.kill();
console.log(fails ? `\n${fails} chart truth problem(s)` : '\nCharts are true: every mark sits at its value, every cut axis is marked and said, every tick is round and labelled');
process.exit(fails ? 1 : 0);
