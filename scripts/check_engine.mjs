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

console.log(fails ? `\n${fails} check(s) FAILED: no-go` : '\nAll checks passed: go');
process.exit(fails ? 1 : 0);
