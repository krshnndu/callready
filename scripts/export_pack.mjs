// Writes data/pack.json from the web pack, so the API coaches from exactly the facts the UI shows.
import { writeFileSync } from 'node:fs';
import * as pack from '../web/js/pack.js';
import { questions, personas } from '../web/js/questions.js';
import { analyze } from '../web/js/core.js';
import { samplePack } from '../web/js/sample.js';
const ctx = analyze(samplePack);
const k = { ...ctx.k, lev: ctx.k.lev }, imp = { ...ctx.imp, h1: ctx.imp.ytd };
const facts = [
  `Q2 FY27 revenue 2,480 crore (+${k.revYoY.toFixed(1)}% YoY, +1.6% vs consensus 2,440).`,
  `Q2 FY27 EBITDA 288 crore (${k.ebitdaYoY.toFixed(1)}% YoY; consensus 315, so 8.6% below). EBITDA margin 11.6% vs 14.2% (-258 bps). H1 margin ${imp.h1.toFixed(1)}%.`,
  'Margin bridge -258 bps: gross margin -180 (copper, steel, Appliances price competition), Energy losses -90, employee cost -28 (new plant), operating leverage +40.',
  `PAT 123 crore vs 152 (-19.1%); consensus 150.`,
  `OCF 112 crore vs 265; OCF/EBITDA 39% vs 86%. Inventory days 61 to 78, receivable days 52 to 64, payable days 58 to 55. FCF -103 crore.`,
  `Net debt 940 crore (640 at March); ${k.lev.toFixed(2)}x TTM EBITDA of 1,195 crore (0.52x at March). Final dividend 75 crore paid in September.`,
  'H1 capex 410 crore (mainly new Home Appliances plant) vs FY27 guidance of around 600.',
  'Segments Q2 FY27 (vs Q2 FY26): Home Appliances 1,190 crore +6.3%, EBIT margin 7.1% (10.4%); Industrial Motion 960 +17.1%, 15.2% (14.6%); Energy Solutions 330 +43.5%, -8.5% (-3.0%; Q1 FY27 -10.2%).',
  'Notes: 210 crore due from state distribution companies overdue beyond 180 days (Energy); expected credit loss provision 18 crore.',
  `FY27 guidance (Q4 FY26 call): mid-teens revenue growth; EBITDA margin 13.5 to 14.5%; capex around 600 crore; net debt/EBITDA below 1x; Energy EBIT breakeven by Q4 FY27. Bottom of band needs about ${imp.need.toFixed(1)}% in H2; best quarter on record ${imp.record.toFixed(1)}%.`,
];
const out = { company: pack.company, facts, commitments: pack.commitments, personas,
  questions: questions.map(({ id, theme, persona, owner, text, trap, mustAck, followup, model }) => ({ id, theme, persona, owner, text, trap, mustAck, followup, model })),
  pressure: ctx.pressure.map(({ id, title, score }) => ({ id, title, score: +score.toFixed(2) })) };
writeFileSync(new URL('../data/pack.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log('data/pack.json:', out.questions.length, 'questions,', facts.length, 'facts');
