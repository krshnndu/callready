import { company, quarters, segments, commitments, transcripts, notes, remarksDraft, consensus, bridge } from './pack.js';
import { kpis, impliedH2, pressureMap, segmentTable, remarksCheck, scoreAnswer, DIM_LABELS } from './engine.js';
import { questions, personas } from './questions.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const f1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const fmt = (x) => Number(x).toLocaleString('en-IN');
const sign = (x, d = 1) => (x > 0 ? '+' : '') + (Math.round(x * 10 ** d) / 10 ** d).toFixed(d);
const K = kpis();
const IMP = impliedH2(K);
const PRESSURE = pressureMap();
const API = '/api';

const ICON = {
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  mic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6M6 18H4v-6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6h-2M6 14h12v7H6z"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/></svg>',
  logo: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18V9M9 18V5M14 18v-6M19 18V8"/></svg>',
};

// ---------- citations ----------
const SRC = {};
for (const [k, t] of Object.entries(transcripts)) for (const [id, who, line] of t.lines) SRC[`${k}-${id}`] = `${t.title}. ${company.speakers[who] || who}: "${line}"`;
for (const [id, line] of notes) SRC[id] = `Q2 FY27 notes to accounts: ${line}`;
const cite = (id) => `<button class="cite" type="button" title="${esc(SRC[id] || id)}">${esc(id)}</button>`;

// ---------- attempts (per browser) ----------
const STORE = 'callready.attempts.v1';
const loadAttempts = () => { try { return JSON.parse(localStorage.getItem(STORE)) || []; } catch { return []; } };
const saveAttempts = (a) => { try { localStorage.setItem(STORE, JSON.stringify(a)); } catch { /* storage blocked: keep in memory */ } memAttempts = a; };
let memAttempts = loadAttempts();

// ---------- shell ----------
const STEPS = [
  ['#/', 'Quarter'], ['#/pressure', 'Pressure map'], ['#/questions', 'Question bank'], ['#/rehearse', 'Rehearse'], ['#/report', 'Readiness report'],
];
function shell(active, body) {
  return `<div class="shell">
  <aside class="rail glass">
    <div class="brand"><span class="brand-mark">${ICON.logo}</span><div><b>CallReady</b><small>Earnings-call rehearsal</small></div></div>
    <ol class="steps">${STEPS.map(([h, l], i) => `<li><a href="${h}" ${active === h ? 'aria-current="page"' : ''}><span class="n">${i + 1}</span>${l}</a></li>`).join('')}</ol>
    <div class="co"><b>${company.short}</b><span>${company.quarter} call on ${company.callDate}</span></div>
    <p class="rail-foot">Synthetic company and figures, built for a prototype. Not investment or legal advice.</p>
  </aside>
  <main id="main">${body}</main></div>`;
}

// ---------- 1. Quarter ----------
function viewQuarter() {
  const c = K.cur, p = K.py;
  const rows = [
    ['Revenue', fmt(c.revenue), fmt(p.revenue), `${sign(K.revYoY)}%`, K.revYoY > 0, `${sign(K.vsCons.rev)}%`, K.vsCons.rev > 0, 'G1', 'green'],
    ['EBITDA', fmt(c.ebitda), fmt(p.ebitda), `${sign(K.ebitdaYoY)}%`, false, `${sign(K.vsCons.ebitda)}%`, false, '', ''],
    ['EBITDA margin', `${f1(K.m)}%`, `${f1(K.mPy)}%`, `${Math.round(K.mBps)} bps`, false, `${Math.round((K.m - consensus.margin) * 100)} bps`, false, 'S1 G2', 'red'],
    ['PAT', fmt(c.pat), fmt(p.pat), `${sign(K.patYoY)}%`, false, `${sign(K.vsCons.pat)}%`, false, '', ''],
    ['Operating cash flow', fmt(c.ocf), fmt(p.ocf), `${sign(K.ocfYoY)}%`, false, '', null, 'S2', 'red'],
    ['OCF / EBITDA', `${Math.round(K.conv)}%`, `${Math.round(K.convPy)}%`, `${Math.round(K.conv - K.convPy)} pts`, false, '', null, '', ''],
    ['Cash conversion cycle', `${K.ccc} days`, `${K.cccPy} days`, `+${K.ccc - K.cccPy} days`, false, '', null, 'S2', 'red'],
    ['Net debt / TTM EBITDA', `${K.lev.toFixed(2)}x`, `${K.levFy.toFixed(2)}x (Mar)`, `+${(K.lev - K.levFy).toFixed(2)}x`, false, '', null, 'G5', 'amber'],
  ];
  const seg = segmentTable();
  const status = { 'on-track': ['ok', 'On track'], 'at-risk': ['warn', 'At risk'], broken: ['bad', 'Broken'], deflected: ['bad', 'Deflected'] };
  return shell('#/', `
  <header class="page-head">
    <h1>Revenue up ${f1(K.revYoY)}%. Margin, cash and two promises down.</h1>
    <p>${company.name} reports ${company.quarter} (${company.period}) on ${company.resultsDate} and takes questions the next day. This is everything analysts will have open in front of them. Figures in ${company.units}.</p>
  </header>
  <section class="panel glass">
    <h2>Results against last year, the street and our own words</h2>
    <p class="sub">The last column is what management promised on earlier calls. That is where investors will aim.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Metric</th><th class="n">${company.quarter}</th><th class="n">Q2 FY26</th><th class="n">Change</th><th class="n">vs consensus</th><th>Promise on record</th></tr></thead>
      <tbody>${rows.map(([m, a, b, ch, good, vc, vgood, ties, led]) => `<tr><td>${m}</td><td class="n">${a}</td><td class="n">${b}</td><td class="n ${good ? 'up' : 'down'}">${ch}</td><td class="n ${vgood === null ? '' : vgood ? 'up' : 'down'}">${vc}</td><td>${ties ? `<span class="row" style="gap:8px"><span class="led ${led}"></span>${ties.split(' ').map((t) => `<span class="pill neutral">${t}</span>`).join(' ')}</span>` : ''}</td></tr>`).join('')}</tbody>
    </table></div>
  </section>
  <div class="grid-2">
    <section class="panel glass">
      <h2>Segments</h2>
      <p class="sub">One segment carries the quarter; two drag it down.</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Segment</th><th class="n">Revenue</th><th class="n">Growth</th><th class="n">EBIT margin</th><th class="n">Change</th></tr></thead>
        <tbody>${seg.map((s) => `<tr><td>${s.name}</td><td class="n">${fmt(s.rev)}</td><td class="n up">${sign(s.growth)}%</td><td class="n">${f1(s.m)}%</td><td class="n ${s.bps >= 0 ? 'up' : 'down'}">${s.bps > 0 ? '+' : ''}${Math.round(s.bps)} bps</td></tr>`).join('')}</tbody>
      </table></div>
      <h2 style="margin-top:var(--s-5)">Margin bridge</h2>
      <p class="sub">${f1(K.mPy)}% to ${f1(K.m)}%, Q2 FY26 to Q2 FY27.</p>
      <table><tbody>${bridge.map((b) => `<tr><td>${esc(b.driver)}</td><td class="n ${b.bps >= 0 ? 'up' : 'down'}">${b.bps > 0 ? '+' : ''}${b.bps} bps</td></tr>`).join('')}</tbody></table>
    </section>
    <section class="panel glass">
      <h2>Commitments on record</h2>
      <p class="sub">Verbatim from the last two calls. Hover a reference to read the line.</p>
      <table><tbody>${commitments.map((c) => `<tr><td style="width:44px"><b>${c.id}</b></td><td>${esc(c.said)}<div class="tiny">${esc(c.why)}</div></td><td class="n"><span class="pill ${status[c.status][0]}">${status[c.status][1]}</span><div style="margin-top:6px">${cite(c.ref)}</div></td></tr>`).join('')}</tbody></table>
    </section>
  </div>
  <section class="panel glass">
    <details class="assume"><summary>Data and assumptions</summary><ul>
      <li>Meridian Arc Industries and every figure, person, analyst and broker are synthetic, built to reproduce the situation in the brief.</li>
      <li>Indian listed company: SEBI listing and insider-trading rules frame what may be said on a call. Financial year April to March; figures in INR crore.</li>
      <li>Consensus (${consensus.source.toLowerCase()}) stands in for the estimates a real IR team would buy.</li>
      <li>Pressure weights and score thresholds are judgement calls from typical earnings-call practice, not fitted to data.</li>
      <li>Scores rank answer quality against a rubric; they do not predict the share-price reaction. Disclosure flags are prompts for the company secretary, not legal advice.</li>
      <li>AI use: every figure, ranking and score is computed by rules in the browser. Only the rehearsal coach uses AI models, and its output is re-checked by the same rules before it is shown.</li>
    </ul></details>
  </section>
  <div class="row no-print"><span class="spacer"></span><a class="btn primary" href="#/pressure">See what investors will push on ${ICON.arrow}</a></div>`);
}

// ---------- 2. Pressure ----------
function gaugeSVG() {
  const lo = 10, hi = 16, W = 640, x = (v) => 20 + ((v - lo) / (hi - lo)) * (W - 40);
  const marks = [[IMP.h1, 'H1 actual', 'var(--ink-2)'], [IMP.record, 'Best quarter ever', 'var(--ink-2)'], [IMP.need, 'H2 needed', 'var(--bad)']];
  return `<svg viewBox="0 0 ${W} 96" role="img" aria-label="H2 margin needed ${f1(IMP.need)} percent, against a record of ${f1(IMP.record)} percent and a guided band of 13.5 to 14.5 percent">
    <rect x="20" y="40" width="${W - 40}" height="10" rx="5" fill="var(--sunk)"/>
    <rect x="${x(13.5)}" y="36" width="${x(14.5) - x(13.5)}" height="18" rx="4" fill="var(--accent-tint)" stroke="var(--accent)" stroke-width="1"/>
    <text x="${(x(13.5) + x(14.5)) / 2}" y="28" text-anchor="middle">Guided band 13.5 to 14.5%</text>
    ${[10, 11, 12, 13, 14, 15, 16].map((v) => `<text x="${x(v)}" y="92" text-anchor="middle">${v}%</text>`).join('')}
    ${marks.map(([v, l, col], i) => `<line x1="${x(v)}" x2="${x(v)}" y1="34" y2="58" stroke="${col}" stroke-width="${i === 2 ? 3 : 2}"/><circle cx="${x(v)}" cy="45" r="${i === 2 ? 6 : 4}" fill="${col}"/><text class="big" x="${x(v)}" y="${i === 1 ? 74 : 74}" dy="${i === 0 ? 0 : 0}" text-anchor="middle" fill="${col}" style="fill:${col}">${f1(v)}%</text>`).join('')}
  </svg>`;
}
function viewPressure() {
  const rc = remarksCheck(remarksDraft);
  return shell('#/pressure', `
  <header class="page-head">
    <h1>To keep its margin promise, the company needs a half-year it has never had.</h1>
    <p>Ranked by what investors will push on hardest: the size of the miss, how much they care about the metric, whether it breaks something management said, and whether they asked about it before. Plain arithmetic, no AI.</p>
  </header>
  <section class="panel glass">
    <h2>FY27 margin guidance: can it still be met?</h2>
    <p class="sub">Bottom of the band, across the guided mid-teens revenue range (${IMP.rows.map((r) => `${r.growth}% growth: ${f1(r.need)}%`).join('; ')}).</p>
    <div class="gauge">${gaugeSVG()}</div>
    <div class="readouts">
      <div class="readout"><div class="v">${f1(IMP.h1)}%</div><div class="l">H1 FY27 EBITDA margin</div></div>
      <div class="readout bad"><div class="v">${f1(IMP.need)}%</div><div class="l">needed in H2 for 13.5%</div></div>
      <div class="readout"><div class="v">${f1(IMP.record)}%</div><div class="l">best quarter in two years</div></div>
    </div>
  </section>
  <section class="panel glass">
    <h2>Pressure map</h2>
    <p class="sub">Score = magnitude x salience x credibility (1.5 if a promise is broken, 1.25 if guidance is at risk) x recurrence (1.2 if asked before, 1.3 if deflected).</p>
    <ol class="plist">${PRESSURE.map((p) => `<li>
      <span class="rank">${p.rank}</span>
      <div><h3><span class="led ${p.level}"></span>${esc(p.title)}</h3><p>${esc(p.evidence)}</p>
        <div class="row" style="gap:6px"><span class="pill neutral">${p.theme}</span><span class="pill accent">Owner: ${p.owner === 'ENERGY' ? 'President, Energy' : p.owner}</span>${p.ties.map((t) => `<span class="pill ${commitments.find((c) => c.id === t).status === 'broken' || commitments.find((c) => c.id === t).status === 'deflected' ? 'bad' : 'warn'}">${t}</span>`).join('')}${p.recurrent.map(cite).join('')}</div></div>
      <div class="score-col"><div class="v">${p.score.toFixed(2)}</div><div class="formula">${p.magnitude.toFixed(2)} x ${p.salience} x ${p.credibility} x ${p.recurrence}</div><div class="meter ${p.level}"><i style="width:${Math.round((p.score / PRESSURE[0].score) * 100)}%"></i></div></div>
    </li>`).join('')}</ol>
  </section>
  <section class="panel glass" id="remarks">
    <h2>Prepared remarks gap check</h2>
    <p class="sub">The draft opening remarks, checked against the pressure map. Edit the text and the check reruns as you type.</p>
    <div class="grid-2">
      <textarea id="remarks-text" rows="14" aria-label="Prepared remarks draft">${esc(remarksDraft)}</textarea>
      <div id="remarks-out">${remarksOut(rc)}</div>
    </div>
  </section>
  <div class="row no-print"><span class="spacer"></span><a class="btn primary" href="#/questions">See the questions this will draw ${ICON.arrow}</a></div>`);
}
function remarksOut(rc) {
  return `<ul class="checklist">${rc.themes.map((t) => `<li><span class="led ${t.covered ? 'green' : 'red'}"></span>${esc(t.label)}<span class="spacer"></span><span class="pill ${t.covered ? 'ok' : 'bad'}">${t.covered ? 'Covered' : 'Silent'}</span></li>`).join('')}</ul>
  ${rc.risky.length ? `<p class="small" style="margin:0 0 8px;font-weight:600">Phrases to rethink</p>${rc.risky.map((r) => `<div class="risk"><q>${esc(r.phrase)}</q><br>${esc(r.why)}</div>`).join('')}` : '<p class="small muted">No risky phrases found.</p>'}`;
}

// ---------- 3. Questions ----------
let qFilter = 'All';
function viewQuestions() {
  const themes = ['All', ...new Set(questions.map((q) => q.theme))];
  const list = questions.filter((q) => qFilter === 'All' || q.theme === qFilter);
  const diff = { Hard: 'bad', Medium: 'warn', Easy: 'ok' };
  return shell('#/questions', `
  <header class="page-head">
    <h1>${questions.length} questions the analysts are likely to ask</h1>
    <p>Generated from the pressure map, the transcripts and the notes. Each carries the trap inside it and the source it rests on.</p>
  </header>
  <section class="panel glass">
    <div class="chips" role="group" aria-label="Filter by theme">${themes.map((t) => `<button class="chip" data-theme="${esc(t)}" aria-pressed="${t === qFilter}">${esc(t)}</button>`).join('')}</div>
    <ul class="qlist" style="margin-top:var(--s-4)">${list.map((q) => { const p = personas[q.persona]; return `<li>
      <div><div class="qmeta"><span class="pill ${diff[q.difficulty]}">${q.difficulty}</span><b style="color:var(--ink-2)">${p.name}</b>, ${p.firm}<span>Owner: ${q.owner === 'ENERGY' ? 'President, Energy' : q.owner}</span>${q.cites.map(cite).join('')}</div>
      <p class="qtext">${esc(q.text)}</p><p class="trap"><b>Trap:</b> ${esc(q.trap)}</p></div>
      <div><a class="btn ghost" href="#/rehearse/${q.id}">Rehearse ${ICON.arrow}</a></div>
    </li>`; }).join('')}</ul>
  </section>`);
}

// ---------- 4. Rehearse ----------
let timerId = null;
function viewRehearse(qid) {
  const q = questions.find((x) => x.id === qid) || questions[0];
  const p = personas[q.persona];
  const speakers = Object.entries(company.speakers);
  return shell('#/rehearse', `
  <header class="page-head">
    <h1>Rehearse: ${esc(q.theme)}</h1>
    <p>Answer as you would on the call. Aim for 60 to 130 words, about 45 seconds spoken. The scorecard checks every figure against the disclosures.</p>
  </header>
  <div class="grid-2">
    <section class="panel glass">
      <div class="row"><label class="small muted" for="qpick">Question</label><select id="qpick">${questions.map((x) => `<option value="${x.id}" ${x.id === q.id ? 'selected' : ''}>${x.id} ${esc(x.theme)}: ${esc(x.text.slice(0, 48))}...</option>`).join('')}</select></div>
      <div class="qmeta" style="margin-top:var(--s-4)"><b style="color:var(--ink-2)">${p.name}</b>, ${p.firm}. ${esc(p.style)}.</div>
      <p class="question-block">"${esc(q.text)}"</p>
      <div class="row" style="margin-bottom:var(--s-3)">
        <label class="small muted" for="speaker">Answering as</label>
        <select id="speaker">${speakers.map(([k, v]) => `<option value="${k}" ${k === q.owner ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
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
      <p class="tiny" style="margin-top:var(--s-3)">Owner for this question: ${q.owner === 'ENERGY' ? company.speakers.ENERGY : company.speakers[q.owner]}. Sources: ${q.cites.map(cite).join(' ') || 'results tables'}</p>
    </section>
    <section class="panel glass" id="card"><div class="empty">Your scorecard appears here: seven dimensions, every flagged phrase marked in your answer, a follow-up from the same analyst, and a stronger answer grounded in the disclosures.</div></section>
  </div>`);
}
function bindRehearse(qid) {
  const q = questions.find((x) => x.id === qid) || questions[0];
  const ta = $('#answer'), tEl = $('#timer');
  let started = null, left = 60;
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
    const durationS = started ? (Date.now() - started) / 1000 : null;
    const speaker = $('#speaker').value;
    const res = scoreAnswer(q, text, { durationS: recDuration || null });
    saveAttempts([...memAttempts, { qid: q.id, speaker, text, total: res.total, band: res.band, flags: res.flags.map((f) => f.dim), acked: ackSet(q, text), at: Date.now() }]);
    renderCard(q, text, res, speaker);
    void durationS;
  });
  // Voice: browser speech recognition, nothing leaves the browser except to the browser's own engine.
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const btn = $('#speak');
  let rec = null, recStart = null, recDuration = null;
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
function ackSet(q, text) {
  const t = text.toLowerCase();
  return (q.mustAck || []).filter((id) => commitments.find((c) => c.id === id).ack.some((w) => t.includes(w)));
}
function markAnswer(text, res) {
  const spans = [];
  for (const f of res.figures) if (!f.match) spans.push([f.index, f.index + f.raw.length, 'bad']);
  for (const fl of res.flags) {
    if (fl.dim === 'Disclosure' || fl.dim === 'Delivery') {
      for (const part of fl.text.split(', ')) { const i = text.toLowerCase().indexOf(part.toLowerCase()); if (i >= 0) spans.push([i, i + part.length, fl.dim === 'Disclosure' ? 'bad' : 'warn']); }
    }
  }
  spans.sort((a, b) => a[0] - b[0]);
  let out = '', pos = 0;
  for (const [s, e, k] of spans) { if (s < pos) continue; out += esc(text.slice(pos, s)) + `<mark class="${k}">${esc(text.slice(s, e))}</mark>`; pos = e; }
  return out + esc(text.slice(pos));
}
function renderCard(q, text, res, speaker) {
  const bandTxt = { green: ['ok', 'Ready'], amber: ['warn', 'Needs work'], red: ['bad', 'Not ready'] }[res.band];
  $('#card').innerHTML = `
    <div class="row"><div class="total"><span class="v">${res.total}</span><span class="muted">/ 100</span></div><span class="spacer"></span><span class="led ${res.band}" style="width:14px;height:14px"></span><span class="pill ${bandTxt[0]}">${bandTxt[1]}</span></div>
    <ul class="dims">${Object.entries(res.dims).map(([k, d]) => { const b = d.score >= 75 ? 'green' : d.score >= 55 ? 'amber' : 'red'; const on = Math.round(d.score / 10); return `<li><span>${DIM_LABELS[k]} <span class="tiny">${res.weights[k]}%</span></span><span class="segs ${b}">${Array.from({ length: 10 }, (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('')}</span><span class="num" style="text-align:right">${d.score}</span></li><li><span class="why">${esc(d.why)}</span></li>`; }).join('')}</ul>
    <div class="answer-view">${markAnswer(text, res)}</div>
    ${res.flags.length ? `<ul class="flags">${res.flags.map((f) => `<li><span class="led ${f.kind === 'red' ? 'red' : 'amber'}"></span><div><b>${f.dim}:</b> <q>${esc(f.text)}</q><br><span class="muted">${esc(f.why)}</span></div></li>`).join('')}</ul>` : '<p class="small" style="margin-top:12px">No flags. Every figure matches the disclosures.</p>'}
    <div class="coach" id="coach"><h3>${ICON.spark} Coach</h3><p class="muted small"><span class="spin"></span> Asking the coach for a critique and a stronger answer...</p></div>`;
  coach(q, text, res, speaker);
}
async function coach(q, text, res, speaker) {
  const el = $('#coach');
  const fallback = (why) => {
    el.innerHTML = `<h3>${ICON.spark} Reference answer</h3><p class="tiny">${esc(why)}</p><div class="improved">${esc(q.model)}</div><div class="followup"><b>${personas[q.persona].name} follows up:</b> "${esc(q.followup)}"</div>`;
  };
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 58000);
  try {
    const r = await fetch(`${API}/coach`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
      body: JSON.stringify({ qid: q.id, answer: text, speaker, total: res.total, flags: res.flags.map((f) => `${f.dim}: ${f.text}: ${f.why}`) }) });
    clearTimeout(to);
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    if (!j.improved) throw new Error('empty');
    const check = scoreAnswer(q, j.improved);
    const safe = !check.figures.some((f) => !f.match) && check.band !== 'red';
    el.innerHTML = `<h3>${ICON.spark} Coach <span class="pill accent">${esc(j.model || 'live')}</span>${j.cached ? '<span class="pill neutral">cached</span>' : ''}</h3>
      <p>${esc(j.critique)}</p>
      <div class="improved">${esc(safe ? j.improved : q.model)}</div>
      ${safe ? '' : '<p class="tiny">The live answer used a figure not in the disclosures, so the checked reference answer is shown instead.</p>'}
      <div class="followup"><b>${personas[q.persona].name} follows up:</b> "${esc(j.followup || q.followup)}"</div>`;
  } catch (e) {
    clearTimeout(to);
    fallback('The live coach is unavailable right now, so this is the reference answer from the question bank. It passes every check above.');
  }
}

// ---------- 5. Report ----------
const DEMO = [
  ['Q01', 'CEO', 'weak'], ['Q01', 'CFO', 'model'], ['Q03', 'CFO', 'weak'], ['Q02', 'CFO', 'model'], ['Q04', 'CEO', 'model'], ['Q06', 'ENERGY', 'model'],
];
function viewReport() {
  const att = memAttempts;
  const best = {};
  for (const a of att) if (!best[a.qid] || a.total > best[a.qid].total) best[a.qid] = a;
  const themes = [...new Set(questions.map((q) => q.theme))].map((th) => {
    const qs = questions.filter((q) => q.theme === th);
    const done = qs.filter((q) => best[q.id]);
    const avg = done.length ? Math.round(qs.reduce((s, q) => s + (best[q.id]?.total || 0), 0) / qs.length) : null;
    return { th, n: qs.length, done: done.length, avg, band: avg == null ? 'off' : avg >= 75 ? 'green' : avg >= 55 ? 'amber' : 'red' };
  });
  const bySpk = Object.keys(company.speakers).map((s) => { const a = att.filter((x) => x.speaker === s); return { s, n: a.length, avg: a.length ? Math.round(a.reduce((t, x) => t + x.total, 0) / a.length) : null }; });
  // Contradictions: the same question answered by two speakers who own different commitments.
  const contra = [];
  for (const q of questions) {
    const a = att.filter((x) => x.qid === q.id);
    const spk = [...new Set(a.map((x) => x.speaker))];
    if (spk.length < 2 || !(q.mustAck || []).length) continue;
    const latest = spk.map((s) => a.filter((x) => x.speaker === s).at(-1));
    const sets = latest.map((x) => x.acked.join(','));
    if (new Set(sets).size > 1 || new Set(latest.map((x) => x.band)).size > 1) contra.push({ q, latest });
  }
  const rc = remarksCheck(remarksDraft);
  const recs = buildRecs(themes, best, rc, contra);
  const risks = PRESSURE.slice(0, 5).map((p) => {
    const qs = questions.filter((q) => q.pressure === p.id);
    const r = qs.length ? Math.max(...qs.map((q) => best[q.id]?.total || 0)) : 0;
    return { p, readiness: r, risk: p.score * (1 - r / 100), q: qs[0] };
  }).sort((a, b) => b.risk - a.risk);
  return shell('#/report', `
  <header class="page-head">
    <h1>Readiness report: ${company.quarter} call</h1>
    <p>${att.length ? `${att.length} rehearsed answers from this browser.` : 'No answers rehearsed yet in this browser.'} A theme counts as not ready until it has been rehearsed.</p>
  </header>
  <div class="row no-print">
    <button class="btn ghost" id="demo">Load demo rehearsal</button>
    <button class="btn ghost" id="clear">Clear answers</button>
    <span class="spacer"></span>
    <button class="btn primary" id="print">${ICON.print} Print the briefing</button>
  </div>
  <section class="panel glass">
    <h2>Recommendations before the call</h2>
    <p class="sub">Each one is tied to a computed fact, so it can be checked.</p>
    <ol class="recs">${recs.map((r) => `<li><div><h3>${esc(r.title)}</h3><p>${esc(r.body)}</p></div></li>`).join('')}</ol>
  </section>
  <section class="panel glass">
    <h2>Business case</h2>
    <p class="sub">Every input below is an assumption for a mid-cap Indian listed company. Change any of them and the case recomputes.</p>
    <div class="grid-2">
      <div class="bc-grid">${BC_FIELDS.map(([k, l]) => `<label><span>${esc(l)}</span><input type="number" min="0" data-bc="${k}" value="${BC[k]}"></label>`).join('')}</div>
      <div id="bc-out">${bizOut()}</div>
    </div>
  </section>
  <div class="grid-2">
    <section class="panel glass">
      <h2>Readiness by theme</h2>
      <p class="sub">Mean of the best answer per question; questions not rehearsed count as zero.</p>
      <div class="themes">${themes.map((t) => `<div><span class="led ${t.band}"></span>${esc(t.th)}<span class="tiny">${t.done}/${t.n}</span><span class="v">${t.avg ?? '-'}</span></div>`).join('')}</div>
      <h2 style="margin-top:var(--s-5)">By speaker</h2>
      <div class="themes">${bySpk.map((s) => `<div><span class="led ${s.avg == null ? 'off' : s.avg >= 75 ? 'green' : s.avg >= 55 ? 'amber' : 'red'}"></span>${esc(company.speakers[s.s].split(',')[0])}<span class="tiny">${s.n} answer${s.n === 1 ? '' : 's'}</span><span class="v">${s.avg ?? '-'}</span></div>`).join('')}</div>
    </section>
    <section class="panel glass">
      <h2>Riskiest questions</h2>
      <p class="sub">Pressure times how unready the team is on it.</p>
      <table><tbody>${risks.map((r) => `<tr><td><span class="led ${r.readiness >= 75 ? 'green' : r.readiness >= 55 ? 'amber' : 'red'}"></span></td><td>${esc(r.p.title)}${r.q ? `<div class="tiny"><a href="#/rehearse/${r.q.id}">Rehearse ${r.q.id}</a></div>` : ''}</td><td class="n">${r.readiness || '-'}</td></tr>`).join('')}</tbody></table>
      <h2 style="margin-top:var(--s-5)">Speaker contradictions</h2>
      ${contra.length ? contra.map((c) => `<div class="risk" style="background:var(--warn-tint)"><b>${c.q.id} ${esc(c.q.theme)}:</b> ${c.latest.map((x) => `${esc(company.speakers[x.speaker].split(',')[0])} scored ${x.total} and ${x.acked.length ? `acknowledged ${x.acked.join(', ')}` : 'acknowledged no commitment'}`).join('; ')}. Agree one line before the call.</div>`).join('') : '<p class="small muted">None found. Rehearse the same question as two speakers to check they tell the same story.</p>'}
    </section>
  </div>`);
}
function buildRecs(themes, best, rc, contra) {
  const R = [];
  R.push({ title: 'Decide on margin guidance before the call, not during it',
    body: `H1 EBITDA margin is ${f1(IMP.h1)}%. The bottom of the 13.5 to 14.5% band needs about ${f1(IMP.need)}% in H2, above the ${f1(IMP.record)}% best quarter on record. Defending the band (G2) after the August promise (S1) failed invites the hardest follow-up of the call. Recommend the board settles a revised range and files it with the results, so the CFO can point to it.` });
  if (rc.gaps.length) R.push({ title: 'Close the gaps in the prepared remarks',
    body: `The draft is silent on: ${rc.gaps.map((g, i) => (i ? g.label[0].toLowerCase() + g.label.slice(1) : g.label)).join('; ')}. Add the ${Math.abs(Math.round(K.mBps))} bps margin bridge and the working-capital days, and remove "${rc.risky[0]?.phrase || ''}", which reaffirms an outlook the numbers no longer support.` });
  R.push({ title: 'Own the two August statements in the opening, before an analyst quotes them',
    body: `S1 (margin back in band from Q2) and S2 (working capital normal by end of Q2) both failed. One sentence each, from the CFO, in the prepared remarks: what was said, what happened, what changes.` });
  R.push({ title: 'Disclose the discom receivables ageing proactively',
    body: 'The August deflection (D1) left 210 crore overdue beyond 180 days to be found in the notes. Put it, and the 18 crore provision, in the CFO\'s section, and commit to quarterly ageing disclosure.' });
  const weak = themes.filter((t) => t.band === 'red' || t.band === 'off').map((t) => t.th);
  if (weak.length) R.push({ title: `Rehearse again: ${weak.slice(0, 4).join(', ')}`,
    body: `These themes are not ready${Object.keys(best).length ? ' on the answers given so far' : ' because nothing has been rehearsed yet'}. Owners: CFO for guidance, margin, cash and balance sheet; President, Energy for Energy; CEO for candour and capital allocation.` });
  if (contra.length) R.push({ title: 'Align CEO and CFO on one line per theme',
    body: `${contra.map((c) => c.q.id).join(', ')} got different answers from different speakers. Agree the wording, then rehearse both again.` });
  R.push({ title: 'Send every forward-looking figure through the company secretary',
    body: 'Any number about H2, FY28 or the current quarter that is not already in guidance is new disclosure. The scorecard flags these in red; none should reach the call.' });
  return R;
}
// Business case (docs/08-GOVERNANCE.md C3). Every input is an assumption, editable on screen.
const BC_DEFAULT = { irPeople: 3, irHoursWithout: 24, irHoursWith: 8, execs: 3, execHoursWithout: 4, execHoursWith: 3, irRate: 2500, execRate: 15000, coachCalls: 300, costPerCall: 2, hosting: 2000 };
let BC = { ...BC_DEFAULT };
const inr = (x) => '\u20b9' + Math.round(x).toLocaleString('en-IN');
function bizCase() {
  const irSaved = BC.irPeople * (BC.irHoursWithout - BC.irHoursWith);
  const exSaved = BC.execs * (BC.execHoursWithout - BC.execHoursWith);
  const value = irSaved * BC.irRate + exSaved * BC.execRate;
  const cost = BC.coachCalls * BC.costPerCall + BC.hosting;
  return { irSaved, exSaved, value, cost, net: value - cost, multiple: cost ? value / cost : 0 };
}
const BC_FIELDS = [
  ['irPeople', 'Finance and IR people preparing Q&A'], ['irHoursWithout', 'Hours each per quarter today'], ['irHoursWith', 'Hours each with CallReady'],
  ['execs', 'Executives rehearsing'], ['execHoursWithout', 'Rehearsal hours each today'], ['execHoursWith', 'Rehearsal hours each with CallReady'],
  ['irRate', 'Loaded cost per finance/IR hour (INR)'], ['execRate', 'Loaded cost per executive hour (INR)'],
  ['coachCalls', 'Coach calls per quarter'], ['costPerCall', 'Model cost per coach call (INR)'], ['hosting', 'Hosting per quarter (INR)'],
];
function bizOut() {
  const b = bizCase();
  return `<div class="readouts">
    <div class="readout"><div class="v">${b.irSaved + b.exSaved} h</div><div class="l">prep hours saved per quarter</div></div>
    <div class="readout"><div class="v">${inr(b.value)}</div><div class="l">time value per quarter</div></div>
    <div class="readout"><div class="v">${inr(b.cost)}</div><div class="l">running cost per quarter</div></div>
    <div class="readout"><div class="v">${b.multiple.toFixed(0)}x</div><div class="l">value to cost</div></div>
  </div><p class="tiny" style="margin-top:var(--s-3)">Not counted, and larger: one avoided disclosure slip or broken-promise exchange on a live call, which moves the share price and the board's trust.</p>`;
}
function bindReport() {
  document.querySelectorAll('[data-bc]').forEach((el) => el.addEventListener('input', () => { BC[el.dataset.bc] = Number(el.value) || 0; $('#bc-out').innerHTML = bizOut(); }));
  $('#demo').addEventListener('click', () => {
    const add = DEMO.map(([qid, speaker, kind]) => { const q = questions.find((x) => x.id === qid); const text = q[kind]; const r = scoreAnswer(q, text); return { qid, speaker, text, total: r.total, band: r.band, flags: r.flags.map((f) => f.dim), acked: ackSet(q, text), at: Date.now() }; });
    saveAttempts([...memAttempts, ...add]); render();
  });
  $('#clear').addEventListener('click', () => { saveAttempts([]); render(); });
  $('#print').addEventListener('click', () => window.print());
}

// ---------- router ----------
function render() {
  const h = location.hash || '#/';
  const app = $('#app');
  clearInterval(timerId);
  if (h.startsWith('#/pressure')) { app.innerHTML = viewPressure(); const ta = $('#remarks-text'); ta.addEventListener('input', () => { $('#remarks-out').innerHTML = remarksOut(remarksCheck(ta.value)); }); }
  else if (h.startsWith('#/questions')) { app.innerHTML = viewQuestions(); app.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => { qFilter = b.dataset.theme; render(); })); }
  else if (h.startsWith('#/rehearse')) { const id = h.split('/')[2] || 'Q01'; app.innerHTML = viewRehearse(id); bindRehearse(id); }
  else if (h.startsWith('#/report')) { app.innerHTML = viewReport(); bindReport(); }
  else app.innerHTML = viewQuarter();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', render);
render();
void segments; void quarters;
