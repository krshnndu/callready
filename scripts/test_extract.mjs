// Round-trip test of the upload pipeline: results document text -> AI extraction -> rules verification,
// then a field-by-field comparison with the pack the document was generated from.
// Run: node scripts/test_extract.mjs <document.txt> [base-url]
import { readFileSync, writeFileSync } from 'node:fs';
import { samplePack } from '../web/js/sample.js';
import { validatePack, verifyAgainstSource, analyze, PERIOD_FIELDS } from '../web/js/core.js';

const [file, base = 'https://callreadyai.vercel.app'] = process.argv.slice(2);
const text = readFileSync(file, 'utf8');
const t0 = Date.now();
let r = await fetch(`${base}/api/extract`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, name: file.split('/').pop() }) });
let j = await r.json();
while (r.ok && j.status === 'running') {
  await new Promise((d) => setTimeout(d, 5000));
  r = await fetch(`${base}/api/extract?job=${j.job || jobId}`); var jobId = j.job || jobId; j = await r.json();
}
if (!r.ok || j.status === 'failed') { console.log('extract failed', r.status, j); process.exit(1); }
const p = j.pack;
writeFileSync(new URL('../data/extracted-sample.json', import.meta.url), JSON.stringify(p, null, 2) + '\n');
console.log(`extracted by ${j.model}${j.cached ? ' (cached)' : ''} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

const v = validatePack(p);
console.log('validation:', v.errors.length ? v.errors : 'no errors', v.warnings.length ? `| warnings: ${v.warnings.join(' ')}` : '');
const ver = verifyAgainstSource(p, text);
console.log(`rules check against the document: ${ver.numbersFound}/${ver.numbersTotal} numbers found, ${ver.quotesFound}/${ver.quotes.length} commitment quotes found verbatim, ${ver.linesFound}/${ver.lines.length} transcript lines found`);
for (const c of ver.checks.filter((x) => !x.found)) console.log('   not in document:', c.path, c.value);

// Accuracy against the truth the document was built from.
let ok = 0, total = 0;
const cmp = (path, got, want) => { if (want == null) return; total++; const hit = got != null && Math.abs(got - want) <= Math.max(0.051, Math.abs(want) * 0.001); if (hit) ok++; else console.log('   mismatch', path, 'got', got, 'want', want); };
for (const per of ['current', 'priorYear', 'priorQuarter']) for (const f of PERIOD_FIELDS) cmp(`periods.${per}.${f}`, p.periods?.[per]?.[f], samplePack.periods[per][f]);
for (const s of samplePack.segments) {
  const g = (p.segments || []).find((x) => x.name?.toLowerCase().includes(s.name.toLowerCase().split(' ')[0]));
  for (const per of ['current', 'priorYear']) for (const f of ['revenue', 'margin']) cmp(`segments.${s.name}.${per}.${f}`, g?.[per]?.[f], s[per][f]);
}
for (const f of ['revenue', 'ebitda', 'netDebt']) cmp(`priorFY.${f}`, p.priorFY?.[f], samplePack.priorFY[f]);
for (const f of ['revenue', 'ebitda', 'capex', 'revenuePy']) cmp(`ytd.${f}`, p.ytd?.[f], samplePack.ytd[f]);
cmp('ttmEbitda', p.ttmEbitda, samplePack.ttmEbitda);
for (const f of ['revenue', 'ebitda', 'pat']) cmp(`consensus.${f}`, p.consensus?.[f], samplePack.consensus[f]);
console.log(`field accuracy vs truth: ${ok}/${total}`);
console.log('commitments:', (p.commitments || []).map((c) => `${c.id}:${c.kind}:${c.metric}${c.target ? JSON.stringify(c.target) : ''}`).join(' '));
if (!v.errors.length) {
  const ctx = analyze(p);
  console.log('implied:', ctx.imp ? ctx.imp.need?.toFixed(1) : 'n/a', '| statuses:', ctx.commitments.map((c) => `${c.id}=${c.status}`).join(' '));
  console.log('pressure:', ctx.pressure.slice(0, 6).map((x) => x.id).join(', '), '|', ctx.questions.length, 'questions');
}
