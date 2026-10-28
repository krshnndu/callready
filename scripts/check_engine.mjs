// Calibration and data-readiness check: the evidence for go/no-go gates G-B and G-C
// (docs/08-GOVERNANCE.md). Exits non-zero on any failure. Run: node scripts/check_engine.mjs
import { readFileSync } from 'node:fs';
import { quarters, segments, unallocated, commitments, transcripts, remarksDraft } from '../web/js/pack.js';
import { analyze, validatePack } from '../web/js/core.js';
import { scoreAnswer as score, remarksCheck as remarks } from '../web/js/score.js';
import { samplePack } from '../web/js/sample.js';

const ctx = analyze(samplePack);
const questions = ctx.questions;
const scoreAnswer = (q, t) => score(ctx, q, t);
const remarksCheck = (t) => remarks(ctx, t);

let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; };
const near = (a, b, t) => Math.abs(a - b) <= t;

console.log('--- G-B data readiness');
const byQ = Object.fromEntries(quarters.map((r) => [r.q, r]));
for (const q of Object.keys(unallocated)) {
  const segRev = segments.reduce((s, x) => s + x.rows[q][0], 0);
  ok(segRev === byQ[q].revenue, `${q}: segment revenue ${segRev} = revenue ${byQ[q].revenue}`);
  const segEbit = segments.reduce((s, x) => s + (x.rows[q][0] * x.rows[q][1]) / 100, 0);
  const ebitda = segEbit + unallocated[q] + byQ[q].da;
  ok(near(ebitda, byQ[q].ebitda, 1.5), `${q}: segment EBIT + unallocated + D&A = ${ebitda.toFixed(1)} vs EBITDA ${byQ[q].ebitda}`);
}
const k = ctx.k;
ok(validatePack(samplePack).errors.length === 0, 'the sample pack passes the pack validator');
ok(near(k.revYoY, 14.3, 0.05), `revenue growth ${k.revYoY.toFixed(2)}% (doc: 14.3)`);
ok(near(k.mBps, -258, 1), `margin change ${k.mBps.toFixed(0)} bps (doc: -258)`);
ok(near(k.conv, 39, 0.5) && near(k.convPy, 86, 0.5), `cash conversion ${k.conv.toFixed(0)}% vs ${k.convPy.toFixed(0)}% (doc: 39 vs 86)`);
ok(near(k.lev, 0.79, 0.005) && k.ttm === 1195, `leverage ${k.lev.toFixed(2)}x on TTM EBITDA ${k.ttm} (doc: 0.79x, 1,195)`);
const imp = ctx.imp;
ok(imp.rows.every((r) => near(r.need, 15.3, 0.1)) && near(imp.record, 14.2, 0.05), `implied H2 margin ${imp.rows.map((r) => r.need.toFixed(2)).join('/')} vs record ${imp.record.toFixed(2)}`);
const lines = new Set(Object.entries(transcripts).flatMap(([t, v]) => v.lines.map(([id]) => `${t}-${id}`)));
ok(commitments.every((c) => lines.has(c.ref)), 'every commitment cites a transcript line that exists');
const pack = JSON.parse(readFileSync(new URL('../data/pack.json', import.meta.url)));
ok(pack.questions.length === questions.length && pack.questions.every((q, i) => q.model === questions[i].model), 'data/pack.json is in sync with the web pack (rerun export_pack.mjs if not)');

console.log('--- G-C scoring calibration');
const order = ctx.pressure.map((p) => p.id).join(',');
ok(order === 'guidance,cash,margin,seg-ENE,c-D1,leverage,consensus,seg-APP,capex,profit', `pressure order ${order}`);
const st = Object.fromEntries(ctx.commitments.map((c) => [c.id, c.status]));
ok(JSON.stringify(st) === JSON.stringify({ G1: 'on-track', G2: 'at-risk', G3: 'at-risk', G4: 'at-risk', G5: 'at-risk', S1: 'broken', S2: 'broken', D1: 'deflected' }), `commitment status by rules ${JSON.stringify(st)}`);
const rc = remarksCheck(remarksDraft);
ok(rc.gaps.length >= 6 && rc.risky.length >= 3, `remarks draft: ${rc.gaps.length} gaps, ${rc.risky.length} risky phrases`);
for (const q of questions) {
  const s = scoreAnswer(q, q.model);
  ok(s.band === 'green' && s.flags.length === 0, `${q.id} reference answer: ${s.total} ${s.band}, ${s.flags.length} flags`);
  if (q.weak) {
    const w = scoreAnswer(q, q.weak);
    ok(w.band !== 'green' && s.total - w.total >= 15, `${q.id} weak sample: ${w.total} ${w.band}, ${s.total - w.total} points below the reference`);
  }
}
// Planted errors: a wrong figure and a new forward number must always be caught.
const q1 = questions[0];
const planted = scoreAnswer(q1, q1.model.replace('11.6%', '12.6%'));
ok(planted.flags.some((f) => f.dim === 'Accuracy' && f.text.includes('12.6')), 'planted wrong figure (12.6%) is caught');
const fwd = scoreAnswer(q1, q1.model + ' We expect H2 margin to be 13.1%.');
ok(fwd.band === 'red' && fwd.flags.some((f) => f.dim === 'Disclosure'), 'planted forward number (13.1% in H2) forces Red');

console.log('--- Non-answers score Red (relevance gate)');
{
  const q = questions[0];
  const non = {
    'small talk': 'hello, I am doing well',
    'polite refusal': 'I would rather not comment on that at this point in time, thank you for the question.',
    'off-topic but long': 'The weather in Mumbai has been pleasant this week and our teams enjoyed the cricket match on Sunday. We had a wonderful offsite with good food, great conversations and a lot of energy across the organisation. Everyone is excited about the festive season ahead.',
    'filler only': 'Basically, you know, it is what it is, and to be honest we are sort of looking at things and we will see how things go over time.',
  };
  for (const [k, t] of Object.entries(non)) {
    const r = scoreAnswer(q, t);
    ok(r.band === 'red' && r.total <= 20 && r.flags.some((f) => f.dim === 'Relevance'), `${k}: ${r.total} ${r.band}${r.flags.some((f) => f.dim === 'Relevance') ? ', flagged as not an answer' : ', NOT flagged'}`);
  }
  const short = scoreAnswer(q, 'We missed the band: margin was 11.6% against 13.5% guided.');
  ok(!short.flags.some((f) => f.dim === 'Relevance'), `a short but real answer is not treated as a non-answer (${short.total})`);
}

console.log('--- Coach answers: rounding, redaction, and a rules-built ideal answer');
{
  const { sanitizePack: sp, analyze: an } = await import('../web/js/core.js');
  const sc = await import('../web/js/score.js');
  const { readFileSync: rf } = await import('node:fs');
  const w = an(sp(JSON.parse(rf(new URL('../web/datasets/wipro.json', import.meta.url)))).pack);
  const wq = w.questions.find((x) => x.theme === 'Outlook');
  const coachText = 'On margins, Q2 came in at 16.4%, 25 basis points below the prior year. Watch our operating cash flow, this quarter it was 53,048 million.';
  const r = sc.scoreAnswer(w, wq, coachText);
  ok(!r.flags.some((f) => f.dim === 'Accuracy'), `a margin change of -24.6 bps said as "25 basis points" is accepted (flags: ${r.flags.map((f) => f.text).join(', ') || 'none'})`);
  ok(typeof sc.redactUnverified === 'function', 'redactUnverified exists');
  if (typeof sc.redactUnverified === 'function') {
    const q1 = questions[0];
    const red = sc.redactUnverified(ctx, q1, 'Q2 margin was 11.6%, and we expect 12.4% next quarter.');
    ok(red.text.includes('11.6%') && !red.text.includes('12.4') && red.text.includes('[figure not in the disclosures]'), `an unverified figure is blanked, a verified one kept: "${red.text}"`);
    ok(red.removed.length === 1 && red.removed[0].includes('12.4'), 'the blanked figure is reported');
  }
  ok(typeof sc.idealAnswer === 'function', 'idealAnswer exists');
  if (typeof sc.idealAnswer === 'function') {
    for (const [name, c] of [['sample', ctx], ['wipro', w]]) {
      for (const q of c.questions) {
        const ia = sc.idealAnswer(c, q);
        const s2 = sc.scoreAnswer(c, q, ia.replace(/\[[^\]]*\]/g, ''));
        if (s2.figures.some((f) => !f.match) || s2.band === 'red' || ia.length < 80) { ok(false, `${name} ${q.id}: ideal answer uses only verified figures and is not Red (${s2.total} ${s2.band}; ${s2.figures.filter((f) => !f.match).map((f) => f.raw).join(', ')})`); }
      }
      ok(true, `${name}: a rules-built ideal answer exists for all ${c.questions.length} questions, using only verified figures`);
    }
  }
}

console.log('--- Charts are drawn honestly');
{
  const ch = await import('../web/js/charts.js');
  ok(typeof ch.niceTicks === 'function', 'niceTicks exists');
  if (typeof ch.niceTicks === 'function') {
    const t = ch.niceTicks(11.4, 14.5);
    ok(t.length >= 3 && t.length <= 6 && t.every((v) => Number.isInteger(v * 2)), `margin ticks are round numbers (${t.join(', ')})`);
  }
  const ln = ch.line({ W: 560, points: [{ label: 'Q1', value: 14.0 }, { label: 'Q2', value: 11.6, now: true }], title: 'm', band: { low: 13.5, high: 14.5 } });
  const tickLabels = [...ln.matchAll(/class="lab tick"[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]);
  ok(tickLabels.length >= 3 && tickLabels.every((x) => x.endsWith('%')), `line chart ticks carry their unit (${tickLabels.join(', ')})`);
  const wf = ch.waterfall({ W: 560, start: { label: 'Year ago', value: 14.2 }, steps: [{ label: 'a', delta: -1.8 }, { label: 'b', delta: -0.9 }, { label: 'c', delta: 0.1 }], end: { label: 'Now', value: 11.6 }, title: 'w' });
  ok(/axis-break/.test(wf) && /Axis starts at \d+(\.\d)?%/.test(wf), 'a waterfall whose axis does not start at zero marks the break and says where it starts');
}

console.log('--- Recommendations carry evidence');
{
  const { recommendations } = await import('../web/js/recs.js');
  const { remarksCheck: rcF } = await import('../web/js/score.js');
  const recs = recommendations(ctx, { themes: [{ th: 'Guidance', band: 'off' }], best: {}, rc: rcF(ctx, remarksDraft), contra: [] });
  ok(recs.length >= 5, `${recs.length} recommendations for the sample`);
  ok(recs.every((r) => Array.isArray(r.evidence) && r.evidence.length > 0 && r.evidence.every((e) => typeof e === 'string' && e.length)), 'every recommendation lists its evidence');
  const ids = new Set([...ctx.commitments.map((c) => c.id), ...Object.keys(ctx.sources)]);
  ok(recs.flatMap((r) => r.evidence).every((e) => ids.has(e) || /^(computed|rule|rehearsal)/.test(e)), 'every piece of evidence is a real commitment, a real source line, or a named computation');
}

console.log(fails ? `\n${fails} check(s) FAILED: no-go` : '\nAll checks passed: go');
process.exit(fails ? 1 : 0);
