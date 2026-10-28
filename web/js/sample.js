// The shipped sample, Meridian Arc Industries (synthetic), in the same callready.pack.v1 format an upload
// produces. Source figures live in pack.js; the hand-written question bank in questions.js.
import { company, quarters, segments, unallocated, consensus, bridge, commitments, transcripts, notes, remarksDraft } from './pack.js';
import { questions, personas } from './questions.js';
import { SCHEMA } from './core.js';

const q = Object.fromEntries(quarters.map((r) => [r.q, r]));
const per = (r) => ({ label: r.q, revenue: r.revenue, ebitda: r.ebitda, pat: r.pat ?? null, ocf: r.ocf, capex: r.capex, netDebt: r.netDebt, da: r.da, invDays: r.invDays ?? null, recDays: r.recDays ?? null, payDays: r.payDays ?? null });
const META = {
  G1: { metric: 'revenueGrowth', target: { low: 14, high: 16 }, period: 'FY27', date: '2026-05-14' },
  G2: { metric: 'ebitdaMargin', target: { low: 13.5, high: 14.5 }, period: 'FY27', date: '2026-05-14' },
  G3: { metric: 'segmentEbit', segment: 'Energy Solutions', target: { low: 0 }, period: 'Q4 FY27', date: '2026-05-14' },
  G4: { metric: 'capex', target: { value: 600 }, period: 'FY27', date: '2026-05-14' },
  G5: { metric: 'netDebtToEbitda', target: { high: 1 }, period: 'FY27', date: '2026-05-14' },
  S1: { metric: 'ebitdaMargin', target: { low: 13.5 }, period: 'Q2 FY27', date: '2026-08-06', topic: 'margin back in band from Q2' },
  S2: { metric: 'workingCapital', period: 'Q2 FY27', date: '2026-08-06', topic: 'working capital normal by end of Q2' },
  D1: { metric: 'other', date: '2026-08-06', topic: 'discom receivables', askedRef: 'Q1FY27-L033' },
};

export const samplePack = {
  schema: SCHEMA,
  id: 'sample-meridian-arc',
  provenance: { source: 'sample', note: 'Synthetic company built for the prototype' },
  company: { name: company.name, short: company.short, quarter: company.quarter, period: company.period, units: company.units, fyLabel: 'FY27',
    resultsDate: company.resultsDate, callDate: company.callDate, speakers: company.speakers, synthetic: true },
  periods: { current: per(q['Q2 FY27']), priorYear: per(q['Q2 FY26']), priorQuarter: per(q['Q1 FY27']) },
  history: quarters.map((r) => ({ label: r.q, revenue: r.revenue, ebitda: r.ebitda, ocf: r.ocf, capex: r.capex })),
  priorFY: { label: 'FY26', revenue: 8860, ebitda: 1236, netDebt: 640 },
  ytd: { label: 'H1 FY27', revenue: 4780, ebitda: 550, capex: 410, revenuePy: 4190, quartersElapsed: 2 },
  ttmEbitda: 1195,
  segments: segments.map((s) => ({ name: s.name, key: s.key, owner: s.key === 'ENE' ? 'ENERGY' : 'CEO',
    current: { revenue: s.rows['Q2 FY27'][0], margin: s.rows['Q2 FY27'][1] }, priorYear: { revenue: s.rows['Q2 FY26'][0], margin: s.rows['Q2 FY26'][1] }, priorQuarter: { revenue: s.rows['Q1 FY27'][0], margin: s.rows['Q1 FY27'][1] } })),
  unallocated,
  consensus: { revenue: consensus.revenue, ebitda: consensus.ebitda, pat: consensus.pat, source: consensus.source },
  bridge,
  commitments: commitments.map((c) => ({ id: c.id, kind: c.id[0] === 'G' ? 'guidance' : c.id[0] === 'S' ? 'statement' : 'deflection', by: c.by, said: c.said.replace(/^"|"$/g, ''), ref: c.ref, why: c.why, ack: c.ack, ...META[c.id] })),
  transcript: Object.entries(transcripts).flatMap(([key, t]) => t.lines.map(([id, speaker, text]) => ({ ref: `${key}-${id}`, call: t.title, speaker, text }))),
  notes: notes.map(([ref, text]) => ({ ref, text })),
  remarks: remarksDraft,
  questions,
  personas,
};
