import { analyze, validatePack, verifyAgainstSource, sanitizePack, uploadAllowed, applyEvidencePolicy, SCHEMA, METRICS } from './core.js';
import { scoreAnswer, remarksCheck, DIM_LABELS, OWN_PAST } from './score.js';
import { samplePack } from './sample.js';
import { personas as DEFAULT_PERSONAS } from './questions.js';
import { bars, line, waterfall, diverging, installTooltip, textW } from './charts.js';
import { extractByRules, mergeRulesFirst, crossCheck } from './extract.js';
import { recommendations } from './recs.js';

// Charts are drawn after the page renders, at the measured width of their box, and redrawn on resize.
const CHARTS = new Map();
let chartSeq = 0;
const chart = (draw, cls = '') => { const id = `c${++chartSeq}`; CHARTS.set(id, draw); return `<div class="chartbox ${cls}" data-chart="${id}"></div>`; };
function drawCharts() {
  document.querySelectorAll('[data-chart]').forEach((box) => { const draw = CHARTS.get(box.dataset.chart); if (draw) box.innerHTML = draw(Math.max(240, Math.floor(box.clientWidth))); });
}
let resizeT = null, lastW = window.innerWidth;
window.addEventListener('resize', () => { if (Math.abs(window.innerWidth - lastW) < 8) return; lastW = window.innerWidth; clearTimeout(resizeT); resizeT = setTimeout(drawCharts, 150); });

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (x) => typeof x === 'number' && Number.isFinite(x);
const f1 = (x) => (num(x) ? (Math.round(x * 10) / 10).toFixed(1) : '-');
const fmt = (x) => (num(x) ? Number(x).toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '-');
const sign = (x, d = 1) => (num(x) ? (x > 0 ? '+' : '') + (Math.round(x * 10 ** d) / 10 ** d).toFixed(d) : '-');
const API = '/api';
// A quote on screen gets exactly one pair of curly quotes; straight quotes inside it are dropped.
const quote = (t) => `\u201c${esc(String(t ?? '').replace(/["\u201c\u201d]/g, '').trim())}\u201d`;
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/';

const ICON = {
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6M6 18H4v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6h-2M6 14h12v7H6z"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12M7 11l5 5 5-5M4 20h16"/></svg>',
  logo: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18V9M9 18V5M14 18v-6M19 18V8"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  auto: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>',
};

// ---------- storage (every access guarded: private windows and blocked storage must still work) ----------
const mem = {};
const get = (k, d = null) => { try { const v = localStorage.getItem(k); return v == null ? (k in mem ? mem[k] : d) : JSON.parse(v); } catch { return k in mem ? mem[k] : d; } };
const set = (k, v) => { mem[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* memory only */ } };

// ---------- theme: Auto follows the system, Light and Dark pin it ----------
function applyTheme(t) { if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
applyTheme(get('callready.theme', 'auto'));
const themeSwitch = () => { const t = get('callready.theme', 'auto'); return `<div class="seg-switch" role="radiogroup" aria-label="Theme">${[['auto', 'Auto', ICON.auto], ['light', 'Light', ICON.sun], ['dark', 'Dark', ICON.moon]].map(([v, l, ic]) => `<button type="button" role="radio" aria-checked="${t === v}" data-theme-set="${v}" title="${l} theme">${ic}<span>${l}</span></button>`).join('')}</div>`; };

// ---------- packs: the sample, the real-company test datasets, or the user's own ----------
let DATASETS = null;
let userMemo = { raw: null, pack: null };
const dsCache = {};
async function datasets() { if (!DATASETS) { try { DATASETS = await (await fetch('datasets/index.json', { cache: 'no-cache' })).json(); } catch { DATASETS = []; } } return DATASETS; }
async function activePack() {
  const a = get('callready.active', { kind: 'sample' });
  // Every pack from outside the code (saved state, dataset files) passes the sanitiser before use.
  if (a.kind === 'user') { const raw = get('callready.userpack'); if (raw) { if (userMemo.raw !== raw) userMemo = { raw, pack: sanitizePack(raw).pack }; return userMemo.pack; } }
  if (a.kind === 'dataset' && /^[\w-]{1,60}$/.test(a.slug || '')) {
    if (!dsCache[a.slug]) { try { dsCache[a.slug] = sanitizePack(await (await fetch(`datasets/${a.slug}.json`, { cache: 'no-cache' })).json()).pack; } catch { /* fall back to the sample */ } }
    if (dsCache[a.slug]) return dsCache[a.slug];
  }
  return samplePack;
}
const kindOf = (p) => (p.provenance?.source === 'sample' ? 'Sample (synthetic)' : p.provenance?.source === 'dataset' ? 'Test dataset (real filing)' : 'Your upload');
const isSample = (p) => p.id === 'sample-meridian-arc';
let CTX = null;
const spk = (p, k) => p.company.speakers?.[k] || ({ CEO: 'CEO', CFO: 'CFO', ENERGY: 'Segment head' }[k] || k);
const personaOf = (p, key) => (p.personas || DEFAULT_PERSONAS)[key] || DEFAULT_PERSONAS[key] || DEFAULT_PERSONAS.hawk;

const cite = (id) => `<button class="cite" type="button" data-tip="${esc(CTX.sources[id] || id)}">${esc(id)}</button>`;
const attKey = () => `callready.attempts.${CTX.pack.id || 'pack'}`;
const attempts = () => get(attKey(), []);
const saveAttempts = (a) => set(attKey(), a);

// ---------- shell ----------
const STEPS = [['#/load', 'Load a company'], ['#/', 'Quarter'], ['#/pressure', 'Pressure map'], ['#/questions', 'Question bank'], ['#/rehearse', 'Rehearse'], ['#/report', 'Readiness report']];
function shell(active, body) {
  const p = CTX.pack;
  return `<div class="shell">
  <aside class="rail glass">
    <div class="brand"><span class="brand-mark">${ICON.logo}</span><div><b>CallReady</b><small>Earnings-call rehearsal</small></div></div>
    <nav aria-label="Steps"><ol class="steps">${STEPS.map(([h, l], i) => `<li><a href="${h}" ${active === h ? 'aria-current="page"' : ''}><span class="n">${i}</span>${l}</a></li>`).join('')}</ol></nav>
    <a class="co" href="#/load"><b>${esc(p.company.short || p.company.name)}</b><span>${esc(p.company.quarter)} &middot; ${esc(kindOf(p))}</span><span class="co-change">Change company</span></a>
    ${themeSwitch()}
    <p class="rail-foot">${p.company.synthetic ? 'Synthetic company and figures. ' : ''}Not investment or legal advice.</p>
  </aside>
  <main id="main">${body}</main></div>`;
}
const head = (h1, p) => `<header class="page-head"><h1>${h1}</h1>${p ? `<p>${p}</p>` : ''}</header>`;

// ---------- 0. Load ----------
async function viewLoad() {
  const ds = await datasets();
  const a = get('callready.active', { kind: 'sample' });
  const user = get('callready.userpack');
  const inUse = (kind, slug) => a.kind === kind && (kind !== 'dataset' || a.slug === slug);
  const row = (name, sub, kind, slug, meta, src) => `<tr><td><b>${esc(name)}</b><div class="tiny">${sub}</div></td><td class="hide-sm">${meta || ''}</td><td class="hide-sm">${src || ''}</td><td class="n"><button class="btn ${inUse(kind, slug) ? 'primary' : 'ghost'} small-btn" data-use="${kind}" data-slug="${esc(slug || '')}">${inUse(kind, slug) ? 'In use' : 'Use'}</button></td></tr>`;
  const pillFor = (d) => { const r = d.verify.numbersFound / Math.max(1, d.verify.numbersTotal); return `<span class="pill ${r >= 0.9 ? 'ok' : r >= 0.7 ? 'warn' : 'bad'}" data-tip="Extracted figures the rules found word for word in the filing">${d.verify.numbersFound}/${d.verify.numbersTotal} figures</span> <span class="pill neutral" data-tip="Commitment quotes found word for word">${d.verify.quotesFound}/${d.verify.quotesTotal} quotes</span>`; };
  return shell('#/load', `${head('Load a company', 'Use the sample, try a real company from the test datasets, or upload your own results. Every screen after this one runs on the company you load here.')}
  <section class="panel glass">
    <h2>Test datasets</h2>
    <p class="sub">Real Q2 FY27 results of listed Indian companies, from NSE and company filings, converted by the same pipeline as an upload. "Verified" counts the extracted figures the rules found word for word in the source document.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Company</th><th class="hide-sm">Verified by rules</th><th class="hide-sm">Source</th><th></th></tr></thead>
      <tbody>${row('Meridian Arc Industries', 'Synthetic sample, built to reproduce the brief', 'sample', '', '<span class="pill neutral">Hand-checked</span>', '<span class="tiny">Built in</span>')}
      ${ds.map((d) => row(d.company, `${esc(d.quarter)} &middot; ${esc(d.sector || '')} &middot; ${esc(d.units)}`, 'dataset', d.slug, pillFor(d), d.sources.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.kind)}</a>`).join(' &middot; '))).join('')}
      ${user ? row(user.company.name, `${esc(user.company.quarter)} &middot; your upload`, 'user', '', '', '<span class="tiny">This browser only</span>') : ''}</tbody>
    </table></div>
  </section>
  <div class="grid-2">
    <section class="panel glass">
      <h2>Upload results</h2>
      <p class="sub">A results press release, investor presentation or call transcript: PDF or text, one or more files. Text is read in your browser. Rules read the financial tables and guidance sentences first; AI is used only if the rules cannot read the tables, or if you ask it to add more. Every figure is then checked against your document, and you review it before anything is used.</p>
      <label class="drop" for="files">${ICON.upload}<span><b>Choose PDF or text files</b><br><span class="tiny">or drop them here</span></span><input id="files" type="file" accept=".pdf,.txt,.md,text/plain,application/pdf" multiple></label>
      <p class="tiny" id="file-list"></p>
      <textarea id="paste" rows="5" placeholder="Or paste the results text here"></textarea>
      <label class="keep small" style="margin-top:var(--s-3)"><input type="checkbox" id="use-ai"> Also use AI to add guidance, segments and the call Q&amp;A (slower; figures are still read by rules first and checked)</label>
      <div class="row" style="margin-top:var(--s-3)"><button class="btn primary" id="convert">Convert and check</button><span class="tiny" id="convert-status" role="status"></span></div>
      <div class="notice"><b>Only upload published documents.</b> The document text is sent to AI model providers through our gateway to convert it, and the result is kept on our server for 7 days. Do not upload unpublished results.</div>
    </section>
    <section class="panel glass">
      <h2>Upload a pack</h2>
      <p class="sub">Already have the figures? Fill the pack format directly and skip the AI step. The rules check it the same way.</p>
      <label class="drop" for="packfile">${ICON.upload}<span><b>Choose a pack (.json)</b></span><input id="packfile" type="file" accept=".json,application/json"></label>
      <p class="tiny" id="pack-status" role="status"></p>
      <div class="row"><button class="btn ghost" id="template">${ICON.download}<span>Download the format</span></button></div>
      <p class="tiny" style="margin-top:var(--s-3)">Format <code>${SCHEMA}</code>. Required: company name and quarter, and revenue and EBITDA for this quarter and the same quarter last year. Everything else is optional and switches on more checks.</p>
    </section>
  </div>`);
}
function download(name, obj) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function pdfText(file, notes = []) {
  const pdfjs = await import(`${PDFJS}pdf.min.mjs`);
  pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS}pdf.worker.min.mjs`;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  let out = '';
  if (doc.numPages > 80) notes.push(`${file.name} has ${doc.numPages} pages; only the first 80 are read`);
  for (let i = 1; i <= Math.min(doc.numPages, 80); i++) {
    const page = await doc.getPage(i); const tc = await page.getTextContent();
    // Join text pieces by their position on the page: pieces that touch are one word, so a number the
    // PDF stores as "31" + "7" reads as 317, and a change of baseline starts a new line.
    let line = '', lastX = null, lastY = null;
    for (const it of tc.items) {
      const [a, b, , , x, y] = it.transform; const fs = Math.hypot(a, b) || 10;
      if (lastY != null && Math.abs(y - lastY) > fs * 0.5) { out += line + '\n'; line = ''; lastX = null; }
      if (it.str) { line += (line && (lastX == null || x - lastX > fs * 0.15) ? ' ' : '') + it.str; lastX = x + it.width; lastY = y; }
      if (it.hasEOL) { out += line + '\n'; line = ''; lastX = null; }
    }
    out += line + '\n\n';
  }
  return out;
}
function bindLoad() {
  document.querySelectorAll('[data-use]').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.use; set('callready.active', k === 'dataset' ? { kind: k, slug: b.dataset.slug } : { kind: k }); location.hash = '#/'; }));
  $('#template').addEventListener('click', () => { const { questions, personas, ...pk } = samplePack; void questions; void personas; download('callready-pack-format.json', pk); });
  const files = $('#files'), drop = files.closest('.drop');
  files.addEventListener('change', () => { $('#file-list').textContent = [...files.files].map((f) => `${f.name} (${Math.round(f.size / 1024)} KB)`).join(', '); });
  ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => { files.files = e.dataTransfer.files; files.dispatchEvent(new Event('change')); });
  $('#convert').addEventListener('click', async () => {
    const st = $('#convert-status'), btn = $('#convert');
    try {
      btn.disabled = true; st.textContent = 'Reading the documents...';
      if (files.files.length) { const u = uploadAllowed(files.files); if (!u.ok) { st.textContent = u.reason; return; } }
      let text = '';
      const notes = [];
      for (const f of files.files) {
        let t;
        try { t = /\.pdf$/i.test(f.name) ? await pdfText(f, notes) : await f.text(); }
        catch (e) { st.textContent = /password/i.test(String(e?.name || e?.message)) ? `${f.name} is password-protected. Remove the password (print to PDF) and upload it again.` : `${f.name} could not be read as a PDF (${String(e?.message || e).slice(0, 80)}). Export it again, or paste its text.`; return; }
        if (t.trim().length < 50) notes.push(`${f.name} has almost no text layer (a scan?), so it adds nothing`);
        text += `=== ${f.name} ===\n` + t + '\n\n';
      }
      text = (text + $('#paste').value).replace(/[ \t]+/g, ' ').trim();
      if (text.length > 148000) { notes.push(`the text was ${Math.round(text.length / 1000)}k characters; only the first 148k are used`); text = text.slice(0, 148000); }
      if (text.length < 200) { st.textContent = 'Not enough text. A PDF that is a scanned image has no text to read: paste the text instead.'; return; }
      const docName = [...files.files].map((f) => f.name).join(', ') || 'pasted text';
      // Rules first: if the rules can read the core tables, no AI call is made for the figures.
      const rules = extractByRules(text, { name: docName });
      const rulesOk = validatePack(sanitizePack(rules.pack).pack).errors.length === 0;
      if (rulesOk && !$('#use-ai')?.checked) {
        const clean = sanitizePack({ ...rules.pack, id: `user-${Date.now().toString(36)}`, provenance: { source: 'upload', extractedBy: 'rules', at: new Date().toISOString(), files: [...files.files].map((f) => f.name) } });
        set('callready.draft', { pack: clean.pack, fixes: [...notes, ...(rules.report.rejected || []).map((r) => `table row not read (misaligned): ${r}`), ...clean.fixes], sourceText: text, model: 'rules (no AI)', rulesReport: rules.report });
        location.hash = '#/review';
        return;
      }
      const rulesDraft = (why) => { const clean = sanitizePack({ ...rules.pack, id: `user-${Date.now().toString(36)}`, provenance: { source: 'upload', extractedBy: 'rules', at: new Date().toISOString(), files: [...files.files].map((f) => f.name) } }); set('callready.draft', { pack: clean.pack, fixes: [...notes, ...(why ? [why] : []), ...clean.fixes], sourceText: text, model: 'rules (no AI)', rulesReport: rules.report }); location.hash = '#/review'; };
      try {
      st.textContent = rulesOk ? `The rules read the tables; now AI adds guidance, segments and the Q&A (${Math.round(text.length / 1000)}k characters, one to three minutes)...` : `The rules could not read this document's tables, so AI is converting it (${Math.round(text.length / 1000)}k characters, one to three minutes)...`;
      // The network path to the API can be slow or drop a request; retry rather than give up.
      const body = JSON.stringify({ text, name: docName });
      let j = null;
      for (let attempt = 0; attempt < 3 && !j?.job && j?.status !== 'done'; attempt++) {
        try { const r = await fetch(`${API}/extract`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }); j = await r.json(); if (r.status === 429) throw new Error(j.detail || 'rate limit'); } catch (e) { if (String(e.message).includes('limit')) throw e; await new Promise((d) => setTimeout(d, 3000)); }
      }
      if (!j || (!j.job && j.status !== 'done')) throw new Error(j?.error || j?.detail || 'could not start');
      const job = j.job, t0 = Date.now();
      let misses = 0;
      while (j.status === 'running') {
        if (Date.now() - t0 > 420000) throw new Error('took longer than 7 minutes');
        await new Promise((d) => setTimeout(d, 4000));
        st.textContent = `Converting with AI... ${Math.round((Date.now() - t0) / 1000)} s`;
        try { const r = await fetch(`${API}/extract?job=${job}`); const n = await r.json(); if (r.ok) { j = n; misses = 0; } else if (++misses > 8) throw new Error(n.error || n.detail || `status ${r.status}`); }
        catch (e) { if (++misses > 8) throw e; }
      }
      if (j.status !== 'done' || !j.pack) throw new Error(j.error || j.detail || 'failed');
      const merged = rulesOk ? mergeRulesFirst(rules.pack, j.pack) : j.pack;
      const cc = crossCheck(j.pack, rules.pack);
      const clean = sanitizePack({ ...merged, id: `user-${Date.now().toString(36)}`, provenance: { source: 'upload', extractedBy: rulesOk ? `rules + ${j.model}` : j.model, at: new Date().toISOString(), files: [...files.files].map((f) => f.name) } });
      set('callready.draft', { pack: clean.pack, fixes: [...notes, ...clean.fixes], sourceText: text, model: rulesOk ? `rules + ${j.model}` : j.model, crossCheck: cc, rulesReport: rules.report });
      location.hash = '#/review';
      } catch (e) {
        // The AI step failed. If the rules read the tables, carry on with the rules' figures.
        if (rulesOk) { rulesDraft(`AI was unavailable (${String(e.message || e).slice(0, 80)}), so only the rules' reading is used`); return; }
        throw e;
      }
    } catch (e) {
      st.textContent = `Conversion failed (${String(e.message || e).slice(0, 120)}). The AI service may be busy: try again, or upload a pack in the JSON format.`;
    } finally { btn.disabled = false; }
  });
  $('#packfile').addEventListener('change', async (e) => {
    const st = $('#pack-status');
    try {
      const f0 = e.target.files[0];
      if (!f0 || f0.size > 2e6) { st.textContent = 'A pack file must be a .json file under 2 MB.'; return; }
      const clean = sanitizePack(JSON.parse(await f0.text()));
      const p = clean.pack;
      const v = validatePack(p);
      if (v.errors.length) { st.innerHTML = `<span class="down">Not used:</span> ${v.errors.map(esc).join(' ')}`; return; }
      p.id = p.id && !String(p.id).startsWith('sample') ? p.id : `user-${Date.now().toString(36)}`;
      p.provenance = { ...(p.provenance || {}), source: 'upload' };
      set('callready.draft', { pack: p, fixes: clean.fixes, sourceText: null, model: null });
      location.hash = '#/review';
    } catch { st.textContent = 'That file is not valid JSON.'; }
  });
}

// ---------- 0b. Review an extracted or uploaded pack ----------
function viewReview() {
  const d = get('callready.draft');
  if (!d) return shell('#/load', `${head('Nothing to review', 'Load a company first.')}<a class="btn primary" href="#/load">Load a company ${ICON.arrow}</a>`);
  const p = d.pack; p.periods ||= {}; p.company ||= {};
  const ver = d.sourceText ? verifyAgainstSource(p, d.sourceText) : null;
  const found = Object.fromEntries((ver?.checks || []).map((c) => [c.path, c.found]));
  const qfound = Object.fromEntries((ver?.quotes || []).map((q) => [q.id, q.found]));
  const v = validatePack(p);
  const dot = (path) => (ver && path in found ? `<span class="vdot ${found[path] ? 'ok' : 'warn'}" data-tip="${found[path] ? 'Found in your document' : 'Not found in your document: check it'}"></span>` : '<span class="vdot"></span>');
  const val = (path) => path.split('.').reduce((o, k) => o?.[k], p);
  const inp = (path, type = 'number') => `<span class="vin">${dot(path)}<input data-path="${path}" type="${type}" ${type === 'number' ? 'step="any" inputmode="decimal"' : ''} value="${esc(val(path) ?? '')}" aria-label="${path}"></span>`;
  const flab = { revenue: 'Revenue', ebitda: 'EBITDA', pat: 'PAT', ocf: 'Operating cash flow', capex: 'Capex', netDebt: 'Net debt', da: 'D&A', invDays: 'Inventory days', recDays: 'Receivable days', payDays: 'Payable days' };
  return shell('#/load', `${head(`Review: ${esc(p.company.name || 'your company')}`, 'Check what was extracted before it is used. Green dots were found in your document by the rules; amber ones were not, so check them against the source. Every field is editable.')}
  <section class="panel glass">
    <div class="readouts">
      ${ver ? `<div class="readout ${ver.numbersFound / Math.max(1, ver.numbersTotal) < 0.8 ? 'bad' : ''}"><div class="v">${ver.numbersFound}/${ver.numbersTotal}</div><div class="l">figures found in the document</div></div>
      <div class="readout"><div class="v">${ver.quotesFound}/${ver.quotes.length}</div><div class="l">commitment quotes found word for word</div></div>
      <div class="readout"><div class="v">${ver.linesFound}/${ver.lines.length}</div><div class="l">transcript lines found</div></div>` : '<div class="readout"><div class="v">JSON</div><div class="l">uploaded pack: no source document to check against</div></div>'}
      ${d.model ? `<div class="readout"><div class="v small-v">${esc(d.model)}</div><div class="l">converted by</div></div>` : ''}
    </div>
    ${ver ? (() => { const nF = ver.checks.filter((c) => !c.found).length, nQ = ver.quotes.filter((q) => !q.found).length, nL = ver.lines.filter((l) => !l.found).length; return nF + nQ + nL ? `<div class="policy" role="note"><b>Evidence policy: nothing unverified is used.</b> ${nF} figure${nF === 1 ? '' : 's'}, ${nQ} quote${nQ === 1 ? '' : 's'} and ${nL} transcript line${nL === 1 ? '' : 's'} (amber below) were not found word for word in your document. When you use this company they are left out, so no question, score or recommendation rests on them. Correct any figure from the document first if you want it kept.<label class="keep"><input type="checkbox" id="keep-unverified"> Keep them anyway: I have checked each one against the document</label></div>` : '<div class="policy ok" role="note"><b>Evidence policy:</b> every figure, quote and transcript line was found in your document.</div>'; })() : ''}
    ${d.crossCheck?.checked ? `<div class="policy ${d.crossCheck.disagreements.length ? '' : 'ok'}" role="note"><b>Rules cross-check of the AI:</b> the rules read the same figures independently and agree on ${d.crossCheck.agree} of ${d.crossCheck.checked}.${d.crossCheck.disagreements.length ? ` Disagreements (the rules' value is used): ${d.crossCheck.disagreements.map((x) => `${esc(x.path)} AI ${fmt(x.ai)} vs rules ${fmt(x.rules)}`).join('; ')}.` : ''}</div>` : ''}
    ${d.rulesReport?.tables?.length ? `<p class="tiny" style="margin-top:var(--s-3)">Tables the rules read: ${d.rulesReport.tables.map((t) => `${esc(t.header.slice(0, 60))} (${esc(t.basis)})`).join('; ')}.</p>` : ''}
    ${d.fixes?.length ? `<div class="banner" style="margin-top:var(--s-3)"><b>Notes on reading and cleaning (${d.fixes.length}):</b> ${d.fixes.slice(0, 6).map(esc).join('; ')}${d.fixes.length > 6 ? '; ...' : ''}</div>` : ''}
    ${v.errors.length ? `<div class="risk" style="margin-top:var(--s-4)"><b>Fix before use:</b> ${v.errors.map(esc).join(' ')}</div>` : ''}
    ${v.warnings.length ? `<div class="banner" style="margin-top:var(--s-3)">${v.warnings.map(esc).join(' ')}</div>` : ''}
  </section>
  <section class="panel glass">
    <h2>Company</h2>
    <div class="form-grid">${[['company.name', 'Name'], ['company.short', 'Short name'], ['company.quarter', 'Quarter (for example Q2 FY27)'], ['company.units', 'Units (for example INR crore)'], ['company.unitWord', 'Unit word (for example crore)'], ['company.fyLabel', 'Financial year (for example FY27)']].map(([path, l]) => `<label><span>${l}</span>${inp(path, 'text')}</label>`).join('')}</div>
  </section>
  <section class="panel glass">
    <h2>Figures</h2>
    <div class="table-wrap"><table class="edit">
      <thead><tr><th>Line</th><th>This quarter</th><th>Year ago</th><th>Last quarter</th></tr></thead>
      <tbody>${Object.keys(flab).map((f) => `<tr><td>${flab[f]}</td>${['current', 'priorYear', 'priorQuarter'].map((per) => `<td>${inp(`periods.${per}.${f}`)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>
    <div class="form-grid" style="margin-top:var(--s-4)">${[['ytd.label', 'Year-to-date label', 'text'], ['ytd.revenue', 'YTD revenue'], ['ytd.ebitda', 'YTD EBITDA'], ['ytd.capex', 'YTD capex'], ['ytd.revenuePy', 'YTD revenue last year'], ['ytd.quartersElapsed', 'Quarters elapsed'], ['priorFY.revenue', 'Last full-year revenue'], ['priorFY.ebitda', 'Last full-year EBITDA'], ['priorFY.netDebt', 'Net debt at last year end'], ['ttmEbitda', 'Trailing 12-month EBITDA']].map(([path, l, t]) => `<label><span>${l}</span>${inp(path, t || 'number')}</label>`).join('')}</div>
  </section>
  <section class="panel glass">
    <h2>Segments</h2>
    ${(p.segments || []).length ? `<div class="table-wrap"><table class="edit"><thead><tr><th>Segment</th><th>Revenue</th><th>EBIT margin %</th><th>Revenue year ago</th><th>Margin year ago %</th></tr></thead><tbody>
      ${p.segments.map((s, i) => `<tr><td>${inp(`segments.${i}.name`, 'text')}</td><td>${inp(`segments.${i}.current.revenue`)}</td><td>${inp(`segments.${i}.current.margin`)}</td><td>${inp(`segments.${i}.priorYear.revenue`)}</td><td>${inp(`segments.${i}.priorYear.margin`)}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="small muted">No segments found. That is fine: segment checks are skipped.</p>'}
  </section>
  <section class="panel glass">
    <h2>Commitments on record</h2>
    <p class="sub">Guidance and statements management made, and questions they deflected. Rules compute status from the figures where the metric allows; for the rest, set it here.</p>
    ${(p.commitments || []).length ? p.commitments.map((c, i) => `<div class="commit">
      <div class="row"><b>${esc(c.id)}</b>${d.sourceText ? `<span class="pill ${qfound[c.id] ? 'ok' : 'warn'}">${qfound[c.id] ? 'Quote found in document' : 'Quote not found: check wording'}</span>` : ''}</div>
      <p class="said">${quote(c.said)}</p>
      <div class="form-grid tight">
        <label><span>Kind</span><select data-path="commitments.${i}.kind">${['guidance', 'statement', 'deflection'].map((k) => `<option ${c.kind === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
        <label><span>Metric</span><select data-path="commitments.${i}.metric">${METRICS.map((m) => `<option ${c.metric === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
        <label><span>Target low</span>${inp(`commitments.${i}.target.low`)}</label>
        <label><span>Target high</span>${inp(`commitments.${i}.target.high`)}</label>
        <label><span>Target value</span>${inp(`commitments.${i}.target.value`)}</label>
        <label><span>Status if rules cannot tell</span><select data-path="commitments.${i}.status"><option value="">auto</option>${['kept', 'broken', 'unclear', 'deflected'].map((k) => `<option ${c.status === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      </div></div>`).join('') : '<p class="small muted">None found. Add guidance in the JSON to switch on the consistency checks.</p>'}
  </section>
  <div class="row no-print"><button class="btn ghost" id="dl-draft">${ICON.download}<span>Download as JSON</span></button><span class="spacer"></span><a class="btn ghost" href="#/load">Cancel</a><button class="btn primary" id="use-draft">Use this company ${ICON.arrow}</button></div>
  <p class="tiny" id="use-status" role="status"></p>`);
}
function setPath(o, path, val) { const ks = path.split('.'); let x = o; ks.slice(0, -1).forEach((k, i) => { if (x[k] == null) x[k] = /^\d+$/.test(ks[i + 1]) ? [] : {}; x = x[k]; }); x[ks.at(-1)] = val; }
function collectDraft() {
  const d = get('callready.draft'); const p = d.pack;
  document.querySelectorAll('[data-path]').forEach((el) => {
    const raw = el.value.trim();
    setPath(p, el.dataset.path, el.type === 'number' ? (raw === '' ? null : Number(raw)) : el.tagName === 'SELECT' && raw === '' ? undefined : raw);
  });
  for (const c of p.commitments || []) { if (c.status === undefined) delete c.status; if (c.target && Object.values(c.target).every((x) => x == null)) delete c.target; }
  for (const k of ['ytd', 'priorFY']) if (p[k] && Object.entries(p[k]).every(([kk, x]) => kk === 'label' || x == null || x === '')) p[k] = null;
  p.schema = SCHEMA;
  d.pack = sanitizePack(p).pack;
  return d;
}
function bindReview() {
  $('#dl-draft')?.addEventListener('click', () => { const d = collectDraft(); download(`${(d.pack.company.short || 'company').replace(/\W+/g, '-').toLowerCase()}-pack.json`, d.pack); });
  $('#use-draft')?.addEventListener('click', () => {
    const d = collectDraft();
    // Strict evidence policy (robustness R2): unverified figures, quotes and lines are left out unless confirmed.
    if (d.sourceText) d.pack = applyEvidencePolicy(d.pack, d.sourceText, { keepUnverified: !!$('#keep-unverified')?.checked }).pack;
    const v = validatePack(d.pack);
    if (v.errors.length) { $('#use-status').innerHTML = `<span class="down">Fix first:</span> ${v.errors.map(esc).join(' ')}${d.sourceText ? ' A required figure that was not found in your document was left out: type it in from the document, or tick the keep box.' : ''}`; return; }
    set('callready.userpack', d.pack); set('callready.active', { kind: 'user' }); set('callready.draft', null);
    location.hash = '#/';
  });
}

// ---------- 1. Quarter ----------
function trendPoints(p) {
  const h = (p.history || []).filter((x) => num(x.revenue) && num(x.ebitda));
  const pts = h.length >= 3 ? h : [p.periods.priorYear, p.periods.priorQuarter, p.periods.current].filter((x) => x && num(x.revenue) && num(x.ebitda));
  return pts.map((x, i) => ({ label: x.label || ['Year ago', 'Last quarter', 'This quarter'][i] || '', revenue: x.revenue, margin: (x.ebitda / x.revenue) * 100, now: i === pts.length - 1 }));
}
function viewQuarter() {
  const { pack: p, k: K, commitments: cs, segs } = CTX;
  const st = { 'on-track': ['ok', 'On track'], kept: ['ok', 'Kept'], 'at-risk': ['warn', 'At risk'], broken: ['bad', 'Broken'], deflected: ['bad', 'Deflected'], unclear: ['neutral', 'Unclear'] };
  const tieLed = (ids) => { const ss = cs.filter((c) => ids.includes(c.id)).map((c) => c.status); return ss.includes('broken') || ss.includes('deflected') ? 'red' : ss.includes('at-risk') ? 'amber' : ss.length ? 'green' : ''; };
  const ties = (metric) => cs.filter((c) => c.metric === metric).map((c) => c.id);
  const rows = [
    ['Revenue', fmt(K.cur.revenue), fmt(K.py.revenue), `${sign(K.revYoY)}%`, K.revYoY >= 0, K.vsCons ? `${sign(K.vsCons.rev)}%` : '', K.vsCons ? K.vsCons.rev >= 0 : null, ties('revenueGrowth')],
    ['EBITDA', fmt(K.cur.ebitda), fmt(K.py.ebitda), `${sign(K.ebitdaYoY)}%`, K.ebitdaYoY >= 0, K.vsCons ? `${sign(K.vsCons.ebitda)}%` : '', K.vsCons ? K.vsCons.ebitda >= 0 : null, []],
    ['EBITDA margin', `${f1(K.m)}%`, `${f1(K.mPy)}%`, `${Math.round(K.mBps)} bps`, K.mBps >= 0, K.vsCons?.margin ? `${Math.round((K.m - K.vsCons.margin) * 100)} bps` : '', K.vsCons?.margin ? K.m >= K.vsCons.margin : null, ties('ebitdaMargin')],
    num(K.cur.pat) && ['PAT', fmt(K.cur.pat), fmt(K.py.pat), `${sign(K.patYoY)}%`, K.patYoY >= 0, K.vsCons?.pat != null ? `${sign(K.vsCons.pat)}%` : '', K.vsCons?.pat != null ? K.vsCons.pat >= 0 : null, []],
    num(K.cur.ocf) && ['Operating cash flow', fmt(K.cur.ocf), fmt(K.py.ocf), `${sign(K.ocfYoY)}%`, K.ocfYoY >= 0, '', null, ties('cashFlow')],
    num(K.conv) && ['OCF / EBITDA', `${Math.round(K.conv)}%`, num(K.convPy) ? `${Math.round(K.convPy)}%` : '-', num(K.convPy) ? `${Math.round(K.conv - K.convPy)} pts` : '-', K.conv >= (K.convPy ?? 0), '', null, []],
    num(K.ccc) && ['Cash conversion cycle', `${K.ccc} days`, num(K.cccPy) ? `${K.cccPy} days` : '-', num(K.cccPy) ? `${K.ccc - K.cccPy > 0 ? '+' : ''}${K.ccc - K.cccPy} days` : '-', K.ccc <= (K.cccPy ?? K.ccc), '', null, ties('workingCapital')],
    num(K.lev) && ['Net debt / EBITDA', `${K.lev.toFixed(2)}x`, num(K.levBase) ? `${K.levBase.toFixed(2)}x (year end)` : '-', num(K.levBase) ? `${K.lev - K.levBase > 0 ? '+' : ''}${(K.lev - K.levBase).toFixed(2)}x` : '-', K.lev <= (K.levBase ?? K.lev), '', null, ties('netDebtToEbitda')],
  ].filter(Boolean);
  const tp = trendPoints(p);
  const mg = cs.find((c) => c.kind === 'guidance' && c.metric === 'ebitdaMargin' && c.target?.low != null);
  const nBroken = cs.filter((c) => c.status === 'broken').length;
  const h1 = `Revenue ${K.revYoY >= 0 ? 'up' : 'down'} ${f1(Math.abs(K.revYoY))}%. Margin ${K.mBps >= 0 ? 'up' : 'down'} ${Math.abs(Math.round(K.mBps))} bps.${nBroken ? ` ${nBroken} promise${nBroken > 1 ? 's' : ''} broken.` : ''}`;
  return shell('#/', `${head(h1, `${esc(p.company.name)} reports ${esc(p.company.quarter)}${p.company.period ? ` (${esc(p.company.period)})` : ''}. This is what analysts will have open in front of them. Figures in ${esc(p.company.units || 'reported units')}.`)}
  ${!isSample(p) && CTX.warnings.length ? `<div class="banner" role="note"><b>Rules found ${CTX.warnings.length} thing${CTX.warnings.length > 1 ? 's' : ''} to check in this company's data:</b> ${CTX.warnings.map(esc).join(' ')}</div>` : ''}
  <section class="panel glass">
    <h2>Results against last year, the street and the company's own words</h2>
    <p class="sub">The last column is what management promised on earlier calls. That is where investors will aim.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Metric</th><th class="n">${esc(p.company.quarter)}</th><th class="n">Year ago</th><th class="n">Change</th><th class="n hide-sm">vs consensus</th><th class="hide-sm">Promise on record</th></tr></thead>
      <tbody>${rows.map(([m, a, b, ch, good, vc, vgood, ids]) => `<tr><td>${m}</td><td class="n">${a}</td><td class="n">${b}</td><td class="n ${good ? 'up' : 'down'}">${ch}</td><td class="n hide-sm ${vgood === null ? '' : vgood ? 'up' : 'down'}">${vc}</td><td class="hide-sm">${ids.length ? `<span class="row" style="gap:8px"><span class="led ${tieLed(ids)}"></span>${ids.map((t) => `<span class="pill neutral">${t}</span>`).join(' ')}</span>` : ''}</td></tr>`).join('')}</tbody>
    </table></div>
  </section>
  ${tp.length >= 2 ? `<div class="grid-2 even">
    <section class="panel glass"><h2>Revenue by quarter</h2><p class="sub">${esc(p.company.units || '')}. Hover or tap a bar for the figure.</p>${chart((W) => bars({ W, points: tp.map((x) => ({ label: x.label, value: x.revenue, now: x.now })), title: 'Revenue by quarter' }))}</section>
    <section class="panel glass"><h2>EBITDA margin by quarter</h2><p class="sub">${mg ? `The shaded band is the guided ${mg.target.low} to ${mg.target.high ?? mg.target.low}% range.` : 'Percent of revenue.'}</p>${chart((W) => line({ W, points: tp.map((x) => ({ label: x.label, value: x.margin, now: x.now })), title: 'EBITDA margin by quarter', band: mg ? { low: mg.target.low, high: mg.target.high ?? mg.target.low, label: `Guided ${mg.target.low} to ${mg.target.high ?? mg.target.low}%` } : null }))}</section>
  </div>` : ''}
  <div class="grid-2">
    <section class="panel glass">
      ${segs.length ? `<h2>Segments</h2><p class="sub">Revenue growth and EBIT margin against a year ago.</p>
      <div class="table-wrap"><table><thead><tr><th>Segment</th><th class="n">Revenue</th><th class="n">Growth</th><th class="n">Margin</th></tr></thead>
        <tbody>${segs.map((s) => `<tr><td>${esc(s.name)}</td><td class="n">${fmt(s.rev)}</td><td class="n ${s.growth >= 0 ? 'up' : 'down'}">${num(s.growth) ? sign(s.growth) + '%' : '-'}</td><td class="n">${f1(s.m)}%</td></tr>`).join('')}</tbody></table></div>
      ${segs.some((s) => num(s.bps)) ? `<h3 class="h3">Margin change, bps</h3>${chart((W) => diverging({ W, rows: segs.filter((s) => num(s.bps)).map((s) => ({ label: s.name, value: Math.round(s.bps), tip: `${s.name}: EBIT margin ${f1(s.mPy)}% to ${f1(s.m)}%` })), title: 'Segment margin change' }))}` : ''}` : '<h2>Segments</h2><p class="small muted">The document reports no segments.</p>'}
      ${p.bridge?.length ? `<h2 style="margin-top:var(--s-5)">Margin bridge</h2><p class="sub">${f1(K.mPy)}% to ${f1(K.m)}%, year on year.</p>${chart((W) => waterfall({ W, start: { label: 'Year ago', value: K.mPy }, steps: p.bridge.map((b) => ({ label: b.short || b.driver.split(':')[0], delta: b.bps / 100, tip: `${b.driver}: ${b.bps > 0 ? '+' : ''}${b.bps} bps` })), end: { label: 'This quarter', value: K.m }, title: 'EBITDA margin bridge' }))}` : ''}
    </section>
    <section class="panel glass">
      <h2>Commitments on record</h2>
      <p class="sub">Status is computed by rules from the figures where the metric allows (marked "rule"). Hover a reference to read the line.</p>
      ${cs.length ? `<table><tbody>${cs.map((c) => `<tr><td style="width:44px"><b>${esc(c.id)}</b></td><td>${quote(c.said)}<div class="tiny">${esc(c.why || '')}</div></td><td class="n"><span class="pill ${(st[c.status] || st.unclear)[0]}">${(st[c.status] || st.unclear)[1]}</span><div class="tiny" style="margin-top:4px">${c.statusSource === 'rule' ? 'rule' : c.statusSource === 'stated' ? 'stated' : ''}</div>${c.ref && CTX.sources[c.ref] ? `<div style="margin-top:6px">${cite(c.ref)}</div>` : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="small muted">No commitments in this pack, so the consistency checks are off.</p>'}
    </section>
  </div>
  <section class="panel glass">
    <details class="assume"><summary>Data, sources and assumptions</summary><ul>
      ${p.company.synthetic ? '<li>Meridian Arc Industries and every figure, person, analyst and broker are synthetic, built to reproduce the situation in the brief.</li>' : `<li>Source: ${esc(kindOf(p))}${p.provenance?.extractedBy ? `, converted by ${esc(p.provenance.extractedBy)} and checked by rules` : ''}.${(p.provenance?.urls || []).map((x) => ` <a href="${esc(x)}" target="_blank" rel="noopener">Filing</a>`).join('')}</li>`}
      ${p.provenance?.verify ? `<li>Rules found ${p.provenance.verify.numbersFound} of ${p.provenance.verify.numbersTotal} extracted figures, and ${p.provenance.verify.quotesFound} of ${p.provenance.verify.quotesTotal} quotes, word for word in the source.</li>` : ''}
      ${p.provenance?.caveats ? `<li>${esc(p.provenance.caveats)}</li>` : ''}
      ${p.provenance?.policy ? `<li>Evidence policy: ${p.provenance.policy === 'strict' ? `strict. ${(p.provenance.removed || []).length} value${(p.provenance.removed || []).length === 1 ? ' was' : 's were'} left out because the rules could not find ${(p.provenance.removed || []).length === 1 ? 'it' : 'them'} in the source${(p.provenance.removed || []).length ? `: ${esc(p.provenance.removed.slice(0, 6).join('; '))}${p.provenance.removed.length > 6 ? '; ...' : ''}` : ''}.` : 'unverified values were kept after a person confirmed them against the document.'}</li>` : ''}
      ${K.ttmAnnualised && num(K.lev) ? '<li>No trailing-twelve-month EBITDA in the source: leverage uses this quarter annualised.</li>' : ''}
      <li>Pressure weights and score thresholds are judgement calls from typical earnings-call practice, not fitted to data.</li>
      <li>Scores rank answer quality against a rubric; they do not predict the share-price reaction. Disclosure flags are prompts for the company secretary, not legal advice.</li>
      <li>AI use: every figure, ranking and score is computed by rules in the browser. AI converts uploaded documents and coaches rehearsals; its output is checked by the same rules before it is shown.</li>
    </ul></details>
  </section>
  <div class="row no-print"><span class="spacer"></span><a class="btn primary" href="#/pressure">See what investors will push on ${ICON.arrow}</a></div>`);
}

// ---------- 2. Pressure ----------
function gaugeSVG(imp, W = 640) {
  const lo = Math.floor(Math.min(imp.ytd, imp.low, imp.record) - 1), hi = Math.ceil(Math.max(imp.need, imp.high, imp.record) + 1), pad = 14, x = (v) => pad + ((v - lo) / (hi - lo)) * (W - 2 * pad);
  const marks = [[imp.ytd, 'var(--ink-2)', 'Year to date actual'], [imp.record, 'var(--ink-2)', 'Best quarter on record'], [imp.need, 'var(--bad)', 'Needed for the rest of the year']].sort((a, b) => a[0] - b[0]);
  // Marker labels: a label that would touch its left neighbour drops to the next row.
  let lastEnd = -Infinity, rows = 0;
  const placed = marks.map(([v, col, l]) => { const t = `${f1(v)}%`, w = textW(t, 12); const cx = Math.min(W - pad - w / 2, Math.max(pad + w / 2, x(v))); const row = cx - w / 2 < lastEnd + 6 ? 1 : 0; if (!row) lastEnd = cx + w / 2; rows = Math.max(rows, row); return { v, col, l, t, cx, row }; });
  const step = Math.max(1, Math.ceil(textW('16%') * 1.8 / ((W - 2 * pad) / (hi - lo))));
  const ticks = []; for (let t = lo; t <= hi; t += step) ticks.push(t);
  const H = 100 + rows * 15, band = `Guided ${imp.low} to ${imp.high}%`, bw = textW(band), bx = Math.min(W - pad - bw / 2, Math.max(pad + bw / 2, (x(imp.low) + x(imp.high)) / 2));
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" role="img" aria-label="Margin needed ${f1(imp.need)} percent, against a record of ${f1(imp.record)} percent and a guided range of ${imp.low} to ${imp.high} percent">
    <rect x="${pad}" y="40" width="${W - 2 * pad}" height="10" rx="5" fill="var(--sunk)"/>
    <rect x="${x(imp.low)}" y="36" width="${Math.max(3, x(imp.high) - x(imp.low))}" height="18" rx="4" fill="var(--accent-tint)" stroke="var(--accent)" stroke-width="1"/>
    <text class="lab" x="${bx}" y="28" text-anchor="middle">${band}</text>
    ${ticks.map((v) => `<text class="lab" x="${x(v)}" y="${H - 4}" text-anchor="middle">${v}%</text>`).join('')}
    ${placed.map((m) => `<g class="mark" tabindex="0" data-tip="${m.l}: ${m.t}"><line x1="${x(m.v)}" x2="${x(m.v)}" y1="34" y2="58" stroke="${m.col}" stroke-width="${m.col.includes('bad') ? 3 : 2}"/><circle cx="${x(m.v)}" cy="45" r="${m.col.includes('bad') ? 6 : 4}" fill="${m.col}"/><text class="val" x="${m.cx}" y="${74 + m.row * 15}" text-anchor="middle" style="fill:${m.col}">${m.t}</text></g>`).join('')}
  </svg>`;
}
function viewPressure() {
  const { pack: p, pressure: P, imp, commitments: cs } = CTX;
  const rc = remarksCheck(CTX, p.remarks || '');
  const ownerName = (o) => (o === 'ENERGY' ? 'Segment head' : o);
  return shell('#/pressure', `${head(imp && imp.need > imp.record ? 'To keep its margin promise, the company needs a half it has never had.' : 'What investors will push on, ranked.', 'Ranked by the size of the miss, how much investors care about the metric, whether it breaks something management said, and whether analysts asked about it before. Plain arithmetic, no AI.')}
  ${imp && num(imp.need) ? `<section class="panel glass">
    <h2>Margin guidance: can it still be met?</h2>
    <p class="sub">The bottom of the range across the guided revenue growth (${imp.rows.map((r) => `${r.growth}% growth: ${f1(r.need)}%`).join('; ')}).</p>
    ${chart((W) => gaugeSVG(imp, W), 'gauge')}
    <div class="readouts">
      <div class="readout"><div class="v">${f1(imp.ytd)}%</div><div class="l">${esc(imp.ytdLabel)} EBITDA margin</div></div>
      <div class="readout ${imp.need > imp.record ? 'bad' : ''}"><div class="v">${f1(imp.need)}%</div><div class="l">needed for the rest of the year</div></div>
      <div class="readout"><div class="v">${f1(imp.record)}%</div><div class="l">best quarter on record</div></div>
    </div>
  </section>` : ''}
  <section class="panel glass">
    <h2>Pressure map</h2>
    <p class="sub">Score = magnitude x salience x credibility (1.5 if a promise is broken, 1.25 if guidance is at risk) x recurrence (1.2 if asked before, 1.3 if deflected).</p>
    ${P.length ? `<ol class="plist">${P.map((x) => `<li>
      <span class="rank">${x.rank}</span>
      <div><h3><span class="led ${x.level}"></span>${esc(x.title)}</h3><p>${esc(x.evidence)}</p>
        <div class="row" style="gap:6px"><span class="pill neutral">${esc(x.theme)}</span><span class="pill accent">Owner: ${esc(ownerName(x.owner))}</span>${x.ties.map((t) => { const c = cs.find((y) => y.id === t); return `<span class="pill ${c && ['broken', 'deflected'].includes(c.status) ? 'bad' : 'warn'}">${t}</span>`; }).join('')}${x.recurrent.map(cite).join('')}</div></div>
      <div class="score-col" data-tip="magnitude ${x.magnitude.toFixed(2)} x salience ${x.salience} x credibility ${x.credibility} x recurrence ${x.recurrence}"><div class="v">${x.score.toFixed(2)}</div><div class="formula">${x.magnitude.toFixed(2)} x ${x.salience} x ${x.credibility} x ${x.recurrence}</div><div class="meter ${x.level}"><i style="width:${Math.round((x.score / P[0].score) * 100)}%"></i></div></div>
    </li>`).join('')}</ol>` : '<p class="small muted">No pressure points: every metric moved the right way. Rehearse the questions anyway; the street still asks.</p>'}
  </section>
  <section class="panel glass" id="remarks">
    <h2>Prepared remarks gap check</h2>
    <p class="sub">${p.remarks ? 'The draft opening remarks, checked against the pressure map. Edit the text and the check reruns as you type.' : 'Paste your draft opening remarks. The check reruns as you type.'}</p>
    <div class="grid-2">
      <textarea id="remarks-text" rows="14" aria-label="Prepared remarks draft" placeholder="Paste the draft prepared remarks here">${esc(p.remarks || '')}</textarea>
      <div id="remarks-out">${remarksOut(rc)}</div>
    </div>
  </section>
  <div class="row no-print"><span class="spacer"></span><a class="btn primary" href="#/questions">See the questions this will draw ${ICON.arrow}</a></div>`);
}
function remarksOut(rc) {
  return `<ul class="checklist">${rc.themes.map((t) => `<li><span class="led ${t.covered ? 'green' : 'red'}"></span><span>${esc(t.label)}</span><span class="spacer"></span><span class="pill ${t.covered ? 'ok' : 'bad'}">${t.covered ? 'Covered' : 'Silent'}</span></li>`).join('')}</ul>
  ${rc.risky.length ? `<p class="small" style="margin:0 0 8px;font-weight:600">Phrases to rethink</p>${rc.risky.map((r) => `<div class="risk"><q>${esc(r.phrase)}</q><br>${esc(r.why)}</div>`).join('')}` : '<p class="small muted">No risky phrases found.</p>'}`;
}

// ---------- 3. Questions ----------
let qFilter = 'All';
function viewQuestions() {
  const { pack: p, questions } = CTX;
  const themes = ['All', ...new Set(questions.map((q) => q.theme))];
  if (!themes.includes(qFilter)) qFilter = 'All';
  const list = questions.filter((q) => qFilter === 'All' || q.theme === qFilter);
  const diff = { Hard: 'bad', Medium: 'warn', Easy: 'ok' };
  return shell('#/questions', `${head(`${questions.length} questions the analysts are likely to ask`, questions[0]?.generated ? 'Generated by rules from the pressure map and the commitments on record, each with the trap inside it and the source it rests on.' : 'Written from the pressure map, the transcripts and the notes. Each carries the trap inside it and the source it rests on.')}
  <section class="panel glass">
    <div class="chips" role="group" aria-label="Filter by theme">${themes.map((t) => `<button class="chip" data-theme-f="${esc(t)}" aria-pressed="${t === qFilter}">${esc(t)}</button>`).join('')}</div>
    <ul class="qlist" style="margin-top:var(--s-4)">${list.map((q) => { const pe = personaOf(p, q.persona); return `<li>
      <div><div class="qmeta"><span class="pill ${diff[q.difficulty]}">${q.difficulty}</span><span><b style="color:var(--ink-2)">${esc(pe.name)}</b>${pe.firm ? `, ${esc(pe.firm)}` : ''}</span><span>Owner: ${esc(spk(p, q.owner).split(',')[0])}</span>${(q.cites || []).filter((c) => CTX.sources[c]).map(cite).join('')}</div>
      <p class="qtext">${esc(q.text)}</p><p class="trap"><b>Trap:</b> ${esc(q.trap)}</p></div>
      <div><a class="btn ghost" href="#/rehearse/${q.id}">Rehearse ${ICON.arrow}</a></div>
    </li>`; }).join('')}</ul>
  </section>`);
}

// ---------- 4. Rehearse ----------
let timerId = null;
function viewRehearse(qid) {
  const { pack: p, questions } = CTX;
  const q = questions.find((x) => x.id === qid) || questions[0];
  if (!q) return shell('#/rehearse', head('No questions yet', 'This company produced no pressure points to ask about.'));
  const pe = personaOf(p, q.persona);
  const speakers = Object.entries(p.company.speakers && Object.keys(p.company.speakers).length ? p.company.speakers : { CEO: 'CEO', CFO: 'CFO' });
  return shell('#/rehearse', `${head(`Rehearse: ${esc(q.theme)}`, 'Answer as you would on the call. Aim for 60 to 130 words, about 45 seconds spoken. The scorecard checks every figure against the disclosures.')}
  <div class="grid-2">
    <section class="panel glass">
      <div class="row"><label class="small muted" for="qpick">Question</label><select id="qpick">${questions.map((x) => `<option value="${x.id}" ${x.id === q.id ? 'selected' : ''}>${x.id} ${esc(x.theme)}: ${esc(x.text.slice(0, 44))}...</option>`).join('')}</select></div>
      <div class="qmeta" style="margin-top:var(--s-4)"><span><b style="color:var(--ink-2)">${esc(pe.name)}</b>${pe.firm ? `, ${esc(pe.firm)}` : ''}</span>. ${esc(pe.style || '')}</div>
      <p class="question-block">${quote(q.text)}</p>
      <div class="row" style="margin-bottom:var(--s-3)">
        <label class="small muted" for="speaker">Answering as</label>
        <select id="speaker">${speakers.map(([k2, v]) => `<option value="${esc(k2)}" ${k2 === q.owner ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
        <span class="spacer"></span><span class="timer" id="timer">1:00</span>
      </div>
      <textarea id="answer" rows="9" placeholder="Type your answer, or press Speak to dictate it." aria-label="Your answer"></textarea>
      <div class="row" style="margin-top:var(--s-3)">
        <button class="btn primary" id="score">Score my answer</button>
        <button class="btn ghost" id="speak" type="button">${ICON.mic}<span>Speak</span></button>
        <span class="spacer"></span>
        ${q.weak ? '<button class="btn ghost" id="weak" type="button">Load a weak sample</button>' : ''}
      </div>
      <div class="notice" role="note"><b>What is AI here, and where your answer goes.</b> The scorecard is rules running in your browser; nothing is sent anywhere to compute it. The coach is AI (Gemini 3.8 Flash, with Claude Sonnet 4.6 as fallback) reached through our gateway, so your answer is sent to those model providers. The coach's reply is cached on our server for 7 days, then deleted. Do not paste real unpublished information.</div>
      <p class="tiny" style="margin-top:var(--s-3)">Owner for this question: ${esc(spk(p, q.owner))}. Sources: ${(q.cites || []).filter((c) => CTX.sources[c]).map(cite).join(' ') || 'results tables'}</p>
    </section>
    <section class="panel glass" id="card"><div class="empty">Your scorecard appears here: seven dimensions, every flagged phrase marked in your answer, a follow-up from the same analyst, and a stronger answer grounded in the disclosures.</div></section>
  </div>`);
}
function ackSet(q, text) {
  const t = text.toLowerCase();
  return (q.mustAck || []).filter((id) => { const c = CTX.commitments.find((x) => x.id === id); return c && [...(c.ack || []), ...OWN_PAST, ...(c.kind === 'guidance' ? ['guidance', 'guided', 'target'] : ['we said', 'i said', 'last quarter'])].some((w) => t.includes(w)); });
}
function bindRehearse(qid) {
  const q = CTX.questions.find((x) => x.id === qid) || CTX.questions[0];
  if (!q) return;
  const ta = $('#answer'), tEl = $('#timer');
  let started = null, left = 60, recDuration = null;
  clearInterval(timerId);
  const tick = () => { left = Math.max(0, 60 - Math.floor((Date.now() - started) / 1000)); tEl.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`; tEl.classList.toggle('low', left <= 10); if (!left) clearInterval(timerId); };
  const start = () => { if (!started) { started = Date.now(); timerId = setInterval(tick, 250); } };
  ta.addEventListener('input', start);
  $('#qpick').addEventListener('change', (e) => { location.hash = `#/rehearse/${e.target.value}`; });
  $('#weak')?.addEventListener('click', () => { ta.value = q.weak; start(); });
  $('#score').addEventListener('click', () => {
    const text = ta.value.trim();
    if (text.split(/\s+/).length < 5) { $('#card').innerHTML = '<div class="empty">Write at least a sentence first. A real answer on a call runs 60 to 130 words.</div>'; return; }
    clearInterval(timerId);
    const speaker = $('#speaker').value;
    const res = scoreAnswer(CTX, q, text, { durationS: recDuration || null });
    saveAttempts([...attempts(), { qid: q.id, speaker, text, total: res.total, band: res.band, flags: res.flags.map((f) => f.dim), acked: ackSet(q, text), at: Date.now() }]);
    renderCard(q, text, res, speaker);
    if (window.innerWidth < 980) $('#card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = $('#speak');
  let rec = null, recStart = null;
  if (!SR) { btn.disabled = true; btn.title = 'Speech recognition is not available in this browser. Chrome and Edge support it.'; return; }
  btn.addEventListener('click', () => {
    if (rec) { rec.stop(); return; }
    rec = new SR(); rec.lang = 'en-IN'; rec.continuous = true; rec.interimResults = true;
    const base = ta.value ? ta.value + ' ' : '';
    rec.onresult = (e) => { let s = ''; for (const r of e.results) s += r[0].transcript; ta.value = base + s; };
    rec.onend = () => { recDuration = (Date.now() - recStart) / 1000; rec = null; btn.classList.remove('rec'); btn.querySelector('span').textContent = 'Speak'; };
    rec.onerror = () => {};
    recStart = Date.now(); start(); rec.start(); btn.classList.add('rec'); btn.querySelector('span').textContent = 'Stop';
  });
}
function markAnswer(text, res) {
  const spans = [];
  for (const f of res.figures) if (!f.match) spans.push([f.index, f.index + f.raw.length, 'bad']);
  for (const fl of res.flags) if (fl.dim === 'Disclosure' || fl.dim === 'Delivery') for (const part of fl.text.split(', ')) { const i = text.toLowerCase().indexOf(part.toLowerCase()); if (i >= 0) spans.push([i, i + part.length, fl.dim === 'Disclosure' ? 'bad' : 'warn']); }
  spans.sort((a, b) => a[0] - b[0]);
  let out = '', pos = 0;
  for (const [s, e, k2] of spans) { if (s < pos) continue; out += esc(text.slice(pos, s)) + `<mark class="${k2}">${esc(text.slice(s, e))}</mark>`; pos = e; }
  return out + esc(text.slice(pos));
}
function renderCard(q, text, res, speaker) {
  const bandTxt = { green: ['ok', 'Ready'], amber: ['warn', 'Needs work'], red: ['bad', 'Not ready'] }[res.band];
  $('#card').innerHTML = `
    <div class="row"><div class="total"><span class="v">${res.total}</span><span class="muted">/ 100</span></div><span class="spacer"></span><span class="led ${res.band}" style="width:14px;height:14px"></span><span class="pill ${bandTxt[0]}">${bandTxt[1]}</span></div>
    <ul class="dims">${Object.entries(res.dims).map(([k2, d]) => { const b = d.score >= 75 ? 'green' : d.score >= 55 ? 'amber' : 'red'; const on = Math.round(d.score / 10); return `<li><span>${DIM_LABELS[k2]} <span class="tiny">${res.weights[k2]}%</span></span><span class="segs ${b}" data-tip="${esc(DIM_LABELS[k2])}: ${d.score} of 100, weight ${res.weights[k2]}%">${Array.from({ length: 10 }, (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('')}</span><span class="num" style="text-align:right">${d.score}</span></li><li><span class="why">${esc(d.why)}</span></li>`; }).join('')}</ul>
    <div class="answer-view">${markAnswer(text, res)}</div>
    ${res.flags.length ? `<ul class="flags">${res.flags.map((fl) => `<li><span class="led ${fl.kind === 'red' ? 'red' : 'amber'}"></span><div><b>${fl.dim}:</b> <q>${esc(fl.text)}</q><br><span class="muted">${esc(fl.why)}</span></div></li>`).join('')}</ul>` : '<p class="small" style="margin-top:12px">No flags. Every figure matches the disclosures.</p>'}
    <div class="coach" id="coach">${q.model ? `<h3>${ICON.spark} Reference answer</h3><p class="tiny">Written from the disclosures and checked by the same rules. No AI was used for this scorecard.</p><div class="improved">${esc(q.model)}</div>` : '<p class="tiny">This scorecard is rules only. No AI was used.</p>'}
      <div class="row" style="margin-top:var(--s-3)"><button class="btn ghost" id="ask-coach" type="button">${ICON.spark}<span>Ask the AI coach for a critique</span></button><span class="tiny">One AI call. Its answer is checked by the rules before it is shown.</span></div></div>`;
  $('#ask-coach').addEventListener('click', () => { $('#coach').innerHTML = `<h3>${ICON.spark} Coach</h3><p class="muted small"><span class="spin"></span> Asking the coach for a critique and a stronger answer...</p>`; coach(q, text, res, speaker); });
}
// What an uploaded pack sends the coach: compact lines built from the same context the rules use.
function coachFacts() {
  const { pack: p, k: K, commitments: cs, segs, imp } = CTX;
  const per = (x, l) => x && num(x.revenue) && `${l} (${x.label || ''}): revenue ${fmt(x.revenue)}, EBITDA ${fmt(x.ebitda)} (margin ${f1((x.ebitda / x.revenue) * 100)}%)${num(x.pat) ? `, PAT ${fmt(x.pat)}` : ''}${num(x.ocf) ? `, operating cash flow ${fmt(x.ocf)}` : ''}${num(x.capex) ? `, capex ${fmt(x.capex)}` : ''}${num(x.netDebt) ? `, net debt ${fmt(x.netDebt)}` : ''}.`;
  return [per(K.cur, 'This quarter'), per(K.py, 'Same quarter last year'), per(K.pq, 'Last quarter'),
    `Revenue growth ${sign(K.revYoY)}%; EBITDA margin change ${Math.round(K.mBps)} bps.`,
    num(K.lev) ? `Net debt / EBITDA ${K.lev.toFixed(2)}x.` : null,
    K.vsCons ? `Vs consensus: revenue ${sign(K.vsCons.rev)}%, EBITDA ${sign(K.vsCons.ebitda)}%.` : null,
    imp && num(imp.need) ? `Margin guidance ${imp.low} to ${imp.high}%: ${imp.ytdLabel} margin ${f1(imp.ytd)}%; the rest of the year needs about ${f1(imp.need)}% (best quarter ${f1(imp.record)}%).` : null,
    ...segs.map((s) => `Segment ${s.name}: revenue ${fmt(s.rev)}${num(s.growth) ? ` (${sign(s.growth)}%)` : ''}, EBIT margin ${f1(s.m)}%${num(s.mPy) ? ` vs ${f1(s.mPy)}%` : ''}.`),
    ...cs.map((c) => `Commitment ${c.id} (${c.kind}, ${c.status}): "${c.said}"${c.why ? `. ${c.why}` : ''}.`),
    ...(p.notes || []).slice(0, 10).map((n) => `Note ${n.ref}: ${n.text}`),
  ].filter(Boolean).map((s) => s.slice(0, 300)).slice(0, 60);
}
async function coach(q, text, res, speaker) {
  const el = $('#coach'); const p = CTX.pack; const pe = personaOf(p, q.persona);
  const fallback = (why) => {
    el.innerHTML = q.model ? `<h3>${ICON.spark} Reference answer</h3><p class="tiny">${esc(why)}</p><div class="improved">${esc(q.model)}</div><div class="followup"><b>${esc(pe.name)} follows up:</b> ${quote(q.followup)}</div>`
      : `<h3>${ICON.spark} Coach</h3><p class="small muted">${esc(why)} The scorecard above is complete: it is computed by rules and needs no AI.</p><div class="followup"><b>${esc(pe.name)} would follow up:</b> ${quote(q.followup)}</div>`;
  };
  const flags = res.flags.map((fl) => `${fl.dim}: ${fl.text}: ${fl.why}`).slice(0, 20);
  const body = isSample(p)
    ? { qid: q.id, answer: text, speaker, total: res.total, flags }
    : { qid: 'U', answer: text, speaker: spk(p, speaker).slice(0, 60), total: res.total, flags, company: `${p.company.name}, ${p.company.quarter}, ${p.company.units || ''}`.slice(0, 120),
      question: { text: q.text.slice(0, 900), trap: (q.trap || '').slice(0, 400), persona: pe.name, owed: (q.mustAck || []).map((id) => CTX.commitments.find((c) => c.id === id)).filter(Boolean).map((c) => ({ id: c.id, status: c.status, said: c.said.slice(0, 400), ref: (c.ref || '').slice(0, 40) })) },
      facts: coachFacts() };
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 58000);
  try {
    const r = await fetch(`${API}/coach`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal, body: JSON.stringify(body) });
    clearTimeout(to);
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    if (!j.improved) throw new Error('empty');
    const check = scoreAnswer(CTX, q, j.improved);
    const safe = !check.figures.some((fg) => !fg.match) && check.band !== 'red';
    el.innerHTML = `<h3>${ICON.spark} Coach <span class="pill accent">${esc(j.model || 'live')}</span>${j.cached ? '<span class="pill neutral">cached</span>' : ''}</h3>
      <p>${esc(j.critique)}</p>
      ${safe ? `<div class="improved">${esc(j.improved)}</div>` : q.model ? `<div class="improved">${esc(q.model)}</div><p class="tiny">The live answer used a figure not in the disclosures, so the checked reference answer is shown instead.</p>` : '<p class="tiny">The live answer used a figure the rules could not find in the disclosures, so it is withheld. The critique above still applies.</p>'}
      <div class="followup"><b>${esc(pe.name)} follows up:</b> ${quote(j.followup || q.followup)}</div>`;
  } catch {
    clearTimeout(to);
    fallback(q.model ? 'The live coach is unavailable right now, so this is the reference answer from the question bank. It passes every check above.' : 'The live coach is unavailable right now.');
  }
}

// ---------- 5. Report ----------
const DEMO = [['Q01', 'CEO', 'weak'], ['Q01', 'CFO', 'model'], ['Q03', 'CFO', 'weak'], ['Q02', 'CFO', 'model'], ['Q04', 'CEO', 'model'], ['Q06', 'ENERGY', 'model']];
const BC = { irPeople: 3, irHoursWithout: 24, irHoursWith: 8, execs: 3, execHoursWithout: 4, execHoursWith: 3, irRate: 2500, execRate: 15000, coachCalls: 300, costPerCall: 2, hosting: 2000 };
const inr = (x) => '₹' + Math.round(x).toLocaleString('en-IN');
function bizCase() {
  const irSaved = BC.irPeople * (BC.irHoursWithout - BC.irHoursWith), exSaved = BC.execs * (BC.execHoursWithout - BC.execHoursWith);
  const value = irSaved * BC.irRate + exSaved * BC.execRate, cost = BC.coachCalls * BC.costPerCall + BC.hosting;
  return { irSaved, exSaved, value, cost, multiple: cost ? value / cost : 0 };
}
const BC_FIELDS = [['irPeople', 'Finance and IR people preparing Q&A'], ['irHoursWithout', 'Hours each per quarter today'], ['irHoursWith', 'Hours each with CallReady'], ['execs', 'Executives rehearsing'], ['execHoursWithout', 'Rehearsal hours each today'], ['execHoursWith', 'Rehearsal hours each with CallReady'], ['irRate', 'Loaded cost per finance/IR hour (INR)'], ['execRate', 'Loaded cost per executive hour (INR)'], ['coachCalls', 'Coach calls per quarter'], ['costPerCall', 'Model cost per coach call (INR)'], ['hosting', 'Hosting per quarter (INR)']];
function bizOut() {
  const b = bizCase();
  return `<div class="readouts"><div class="readout"><div class="v">${b.irSaved + b.exSaved} h</div><div class="l">prep hours saved per quarter</div></div><div class="readout"><div class="v">${inr(b.value)}</div><div class="l">time value per quarter</div></div><div class="readout"><div class="v">${inr(b.cost)}</div><div class="l">running cost per quarter</div></div><div class="readout"><div class="v">${b.multiple.toFixed(0)}x</div><div class="l">value to cost</div></div></div>
  <p class="tiny" style="margin-top:var(--s-3)">Not counted, and larger: one avoided disclosure slip or broken-promise exchange on a live call, which moves the share price and the board's trust.</p>`;
}
function viewReport() {
  const { pack: p, questions, pressure: P } = CTX;
  const att = attempts();
  const best = {};
  for (const a of att) if (!best[a.qid] || a.total > best[a.qid].total) best[a.qid] = a;
  const themes = [...new Set(questions.map((q) => q.theme))].map((th) => {
    const qs = questions.filter((q) => q.theme === th); const done = qs.filter((q) => best[q.id]);
    const avg = done.length ? Math.round(qs.reduce((s, q) => s + (best[q.id]?.total || 0), 0) / qs.length) : null;
    return { th, n: qs.length, done: done.length, avg, band: avg == null ? 'off' : avg >= 75 ? 'green' : avg >= 55 ? 'amber' : 'red' };
  });
  const bySpk = Object.keys(p.company.speakers && Object.keys(p.company.speakers).length ? p.company.speakers : { CEO: 1, CFO: 1 }).map((s) => { const a = att.filter((x) => x.speaker === s); return { s, n: a.length, avg: a.length ? Math.round(a.reduce((t, x) => t + x.total, 0) / a.length) : null }; });
  const contra = [];
  for (const q of questions) {
    const a = att.filter((x) => x.qid === q.id); const sp = [...new Set(a.map((x) => x.speaker))];
    if (sp.length < 2 || !(q.mustAck || []).length) continue;
    const latest = sp.map((s) => a.filter((x) => x.speaker === s).at(-1));
    if (new Set(latest.map((x) => x.acked.join(','))).size > 1 || new Set(latest.map((x) => x.band)).size > 1) contra.push({ q, latest });
  }
  const rc = remarksCheck(CTX, p.remarks || '');
  const recs = buildRecs(themes, best, rc, contra);
  const risks = P.slice(0, 5).map((x) => { const qs = questions.filter((q) => q.pressure === x.id); const r = qs.length ? Math.max(...qs.map((q) => best[q.id]?.total || 0)) : 0; return { x, readiness: r, risk: x.score * (1 - r / 100), q: qs[0] }; }).sort((a, b) => b.risk - a.risk);
  const sname = (s) => spk(p, s).split(',')[0];
  const hb = (label, sub, avg, tip) => { const b = avg == null ? 'off' : avg >= 75 ? 'green' : avg >= 55 ? 'amber' : 'red'; return `<div class="hbar" tabindex="0" data-tip="${esc(tip)}"><span class="led ${b}"></span><span class="hl">${esc(label)} <span class="tiny">${sub}</span></span><span class="track"><i class="${b}" style="width:${avg ?? 0}%"></i></span><span class="hv">${avg ?? '-'}</span></div>`; };
  return shell('#/report', `${head(`Readiness report: ${esc(p.company.short || p.company.name)} ${esc(p.company.quarter)}`, `${att.length ? `${att.length} rehearsed answer${att.length === 1 ? '' : 's'} from this browser.` : 'No answers rehearsed yet in this browser.'} A theme counts as not ready until it has been rehearsed.`)}
  <div class="row no-print">
    ${isSample(p) ? '<button class="btn ghost" id="demo">Load demo rehearsal</button>' : ''}
    <button class="btn ghost" id="clear">Clear answers</button><span class="spacer"></span>
    <button class="btn primary" id="print">${ICON.print} Print the briefing</button>
  </div>
  <section class="panel glass"><h2>Recommendations before the call</h2><p class="sub">Each one is tied to a computed fact, so it can be checked.</p>
    <ol class="recs">${recs.map((r) => `<li><div><h3>${esc(r.title)}</h3><p>${esc(r.body)}</p><p class="evidence"><b>Evidence:</b> ${r.evidence.map((e) => (CTX.sources[e] ? cite(e) : `<span class="pill neutral">${esc(e)}</span>`)).join(' ')}</p></div></li>`).join('')}</ol></section>
  <div class="grid-2">
    <section class="panel glass"><h2>Readiness by theme</h2><p class="sub">Mean of the best answer per question; questions not rehearsed count as zero.</p>
      <div class="hbars">${themes.map((t) => hb(t.th, `${t.done}/${t.n}`, t.avg, `${t.th}: ${t.avg ?? 'not rehearsed'}${t.avg != null ? ' of 100' : ''}, ${t.done} of ${t.n} questions rehearsed`)).join('')}</div>
      <h2 style="margin-top:var(--s-5)">By speaker</h2>
      <div class="hbars">${bySpk.map((s) => hb(sname(s.s), `${s.n} answer${s.n === 1 ? '' : 's'}`, s.avg, `${sname(s.s)}: ${s.avg ?? 'no answers yet'}`)).join('')}</div>
    </section>
    <section class="panel glass"><h2>Riskiest questions</h2><p class="sub">Pressure times how unready the team is on it.</p>
      <table><tbody>${risks.map((r) => `<tr><td><span class="led ${r.readiness >= 75 ? 'green' : r.readiness >= 55 ? 'amber' : 'red'}"></span></td><td>${esc(r.x.title)}${r.q ? `<div class="tiny"><a href="#/rehearse/${r.q.id}">Rehearse ${r.q.id}</a></div>` : ''}</td><td class="n">${r.readiness || '-'}</td></tr>`).join('')}</tbody></table>
      <h2 style="margin-top:var(--s-5)">Speaker contradictions</h2>
      ${contra.length ? contra.map((c) => `<div class="risk" style="background:var(--warn-tint)"><b>${c.q.id} ${esc(c.q.theme)}:</b> ${c.latest.map((x) => `${esc(sname(x.speaker))} scored ${x.total} and ${x.acked.length ? `acknowledged ${x.acked.join(', ')}` : 'acknowledged no commitment'}`).join('; ')}. Agree one line before the call.</div>`).join('') : '<p class="small muted">None found. Rehearse the same question as two speakers to check they tell the same story.</p>'}
    </section>
  </div>
  <section class="panel glass"><h2>Business case</h2><p class="sub">Every input below is an assumption for a mid-cap Indian listed company. Change any of them and the case recomputes.</p>
    <div class="grid-2"><div class="bc-grid">${BC_FIELDS.map(([k2, l]) => `<label><span>${esc(l)}</span><input type="number" min="0" inputmode="decimal" data-bc="${k2}" value="${BC[k2]}"></label>`).join('')}</div><div id="bc-out">${bizOut()}</div></div></section>`);
}
function buildRecs(themes, best, rc, contra) { return recommendations(CTX, { themes, best, rc, contra }); }
function bindReport() {
  $('#demo')?.addEventListener('click', () => {
    const add = DEMO.map(([qid, speaker, kind]) => { const q = CTX.questions.find((x) => x.id === qid); const text = q[kind]; const r = scoreAnswer(CTX, q, text); return { qid, speaker, text, total: r.total, band: r.band, flags: r.flags.map((fl) => fl.dim), acked: ackSet(q, text), at: Date.now() }; });
    saveAttempts([...attempts(), ...add]); render();
  });
  $('#clear').addEventListener('click', () => { saveAttempts([]); render(); });
  $('#print').addEventListener('click', () => window.print());
  document.querySelectorAll('[data-bc]').forEach((el) => el.addEventListener('input', () => { BC[el.dataset.bc] = Number(el.value) || 0; $('#bc-out').innerHTML = bizOut(); }));
}

// ---------- router ----------
async function render() {
  const h = location.hash || '#/';
  const app = $('#app');
  clearInterval(timerId);
  const p = await activePack();
  if (!CTX || CTX.pack !== p) { CTX = analyze(p); CTX.warnings = validatePack(p).warnings; }
  if (h.startsWith('#/load')) { app.innerHTML = await viewLoad(); bindLoad(); }
  else if (h.startsWith('#/review')) { app.innerHTML = viewReview(); bindReview(); }
  else if (h.startsWith('#/pressure')) { app.innerHTML = viewPressure(); const ta = $('#remarks-text'); ta.addEventListener('input', () => { $('#remarks-out').innerHTML = remarksOut(remarksCheck(CTX, ta.value)); }); }
  else if (h.startsWith('#/questions')) { app.innerHTML = viewQuestions(); app.querySelectorAll('[data-theme-f]').forEach((b) => b.addEventListener('click', () => { qFilter = b.dataset.themeF; render(); })); }
  else if (h.startsWith('#/rehearse')) { const id = h.split('/')[2] || CTX.questions[0]?.id; app.innerHTML = viewRehearse(id); bindRehearse(id); }
  else if (h.startsWith('#/report')) { app.innerHTML = viewReport(); bindReport(); }
  else app.innerHTML = viewQuarter();
  drawCharts();
  app.querySelectorAll('[data-theme-set]').forEach((b) => b.addEventListener('click', () => { set('callready.theme', b.dataset.themeSet); applyTheme(b.dataset.themeSet); app.querySelectorAll('[data-theme-set]').forEach((x) => x.setAttribute('aria-checked', String(x === b))); }));
  window.scrollTo(0, 0);
  const cur = app.querySelector('.steps [aria-current]'), strip = app.querySelector('.steps');
  if (cur && strip) { const r = cur.getBoundingClientRect(), sr = strip.getBoundingClientRect(); if (r.left < sr.left || r.right > sr.right) strip.scrollLeft += r.left - sr.left - 16; }
}
installTooltip();
// Text widths are measured with the web font; redraw once it has loaded.
document.fonts?.ready.then(() => drawCharts());
window.addEventListener('hashchange', render);
render();
