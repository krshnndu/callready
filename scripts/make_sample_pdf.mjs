// Builds a realistic results document for the synthetic company (press release, segment table,
// notes, last two call transcripts) as HTML and PDF. It is the round-trip test input for the upload
// pipeline: extract it, then compare the extracted pack with the sample pack it was built from.
// Run: node scripts/make_sample_pdf.mjs  ->  web/samples/meridian-arc-q2fy27-results.{html,pdf}
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { samplePack as p } from '../web/js/sample.js';

const out = new URL('../web/samples/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const c = p.periods.current, y = p.periods.priorYear, q = p.periods.priorQuarter;
const f = (x) => (x == null ? '-' : Number(x).toLocaleString('en-IN'));
const m = (r) => ((r.ebitda / r.revenue) * 100).toFixed(1);
const row = (l, a, b, d) => `<tr><td>${l}</td><td>${a}</td><td>${b}</td><td>${d}</td></tr>`;
const calls = {};
for (const l of p.transcript) (calls[l.call] ||= []).push(l);
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Meridian Arc Industries: Q2 FY27 results</title>
<style>body{font:11pt/1.5 Georgia,serif;margin:48px;color:#111}h1{font-size:18pt}h2{font-size:13pt;margin-top:28px}table{border-collapse:collapse;width:100%;font:10pt Arial,sans-serif}td,th{border-bottom:1px solid #ccc;padding:5px 6px;text-align:right}td:first-child,th:first-child{text-align:left}.s{color:#555;font-size:9pt}</style></head><body>
<p class="s">SYNTHETIC DOCUMENT FOR TESTING. Meridian Arc Industries Ltd is a fictional company.</p>
<h1>Meridian Arc Industries Ltd: results for the quarter ended 30 September 2026 (Q2 FY27)</h1>
<p>All figures in INR crore unless stated. Mumbai, ${p.company.resultsDate}.</p>
<h2>Consolidated financial highlights</h2>
<table><tr><th>Particulars</th><th>Q2 FY27</th><th>Q2 FY26</th><th>Q1 FY27</th></tr>
${row('Revenue from operations', f(c.revenue), f(y.revenue), f(q.revenue))}
${row('EBITDA', f(c.ebitda), f(y.ebitda), f(q.ebitda))}
${row('EBITDA margin (%)', m(c), m(y), m(q))}
${row('Depreciation and amortisation', f(c.da), f(y.da), f(q.da))}
${row('Profit after tax', f(c.pat), f(y.pat), '-')}
${row('Cash flow from operations', f(c.ocf), f(y.ocf), f(q.ocf))}
${row('Capital expenditure', f(c.capex), f(y.capex), f(q.capex))}
${row('Net debt (period end)', f(c.netDebt), '-', f(q.netDebt))}
${row('Inventory days', c.invDays, y.invDays, '-')}
${row('Receivable days', c.recDays, y.recDays, '-')}
${row('Payable days', c.payDays, y.payDays, '-')}</table>
<p>H1 FY27 revenue was ${f(p.ytd.revenue)} crore (H1 FY26: ${f(p.ytd.revenuePy)} crore) and H1 EBITDA ${f(p.ytd.ebitda)} crore. H1 capex was ${f(p.ytd.capex)} crore. FY26 revenue was ${f(p.priorFY.revenue)} crore, FY26 EBITDA ${f(p.priorFY.ebitda)} crore, and net debt at 31 March 2026 was ${f(p.priorFY.netDebt)} crore. Trailing twelve-month EBITDA is ${f(p.ttmEbitda)} crore.</p>
<h2>Segment results</h2>
<table><tr><th>Segment</th><th>Revenue Q2 FY27</th><th>EBIT margin Q2 FY27 (%)</th><th>Revenue Q2 FY26</th><th>EBIT margin Q2 FY26 (%)</th><th>EBIT margin Q1 FY27 (%)</th></tr>
${p.segments.map((s) => `<tr><td>${s.name}</td><td>${f(s.current.revenue)}</td><td>${s.current.margin.toFixed(1)}</td><td>${f(s.priorYear.revenue)}</td><td>${s.priorYear.margin.toFixed(1)}</td><td>${s.priorQuarter.margin.toFixed(1)}</td></tr>`).join('')}</table>
<h2>Management commentary</h2>${p.remarks.split('\n\n').map((x) => `<p>${x}</p>`).join('')}
<h2>Selected notes to the accounts</h2>${p.notes.map((n) => `<p>${n.ref}. ${n.text}</p>`).join('')}
<h2>Street consensus for Q2 FY27 (for reference)</h2><p>Revenue ${f(p.consensus.revenue)} crore; EBITDA ${f(p.consensus.ebitda)} crore; PAT ${f(p.consensus.pat)} crore.</p>
${Object.entries(calls).map(([title, lines]) => `<h2>Transcript extract: ${title}</h2>${lines.map((l) => `<p><b>${p.company.speakers[l.speaker] || l.speaker}:</b> ${l.text}</p>`).join('')}`).join('')}
</body></html>`;
writeFileSync(out + 'meridian-arc-q2fy27-results.html', html);
execFileSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--headless=new', '--disable-gpu', '--no-pdf-header-footer', `--print-to-pdf=${out}meridian-arc-q2fy27-results.pdf`, `file://${out}meridian-arc-q2fy27-results.html`], { stdio: 'ignore' });
console.log('wrote', out + 'meridian-arc-q2fy27-results.pdf');
