// Phrasing-bias check (docs/08-GOVERNANCE.md C9): the same substance in a different register must
// score within 10 points of the reference answer. Registers: plain English, and Indian-English
// business usage. Run: node scripts/check_bias.mjs
import { analyze } from '../web/js/core.js';
import { scoreAnswer as score } from '../web/js/score.js';
import { samplePack } from '../web/js/sample.js';

const ctx = analyze(samplePack);
const questions = ctx.questions;
const scoreAnswer = (q, t) => score(ctx, q, t);

const V = {
  Q01: {
    plain: 'No, we will not defend the band. In August I said margins would be back in the band from Q2. That did not happen. Q2 EBITDA margin was 11.6% and H1 was 11.5%. To reach 13.5% for the year we would need about 15.3% in H2, and our best quarter ever was 14.2%. So we do not expect to reach the band this year. If the range changes, it will come in a formal filing after the board looks at it, not on this call. In H2 we will work on the 180 bps hit to gross margin and the 90 bps from Energy losses, and we will report both every quarter.',
    indian: 'Let me state very clearly, we will not be defending the band. As informed during the last call, we had expected to come back within the band from Q2 itself; that has not happened. Q2 EBITDA margin stood at 11.6% and H1 at 11.5%. To achieve 13.5% for the full year, H2 would require around 15.3%, which is higher than our best quarter of 14.2%. Hence we do not expect to achieve the band this year. Any revision in the range will be intimated through a formal filing after the board reviews the same, not on this call. Going ahead, we are focusing on the 180 bps impact on gross margin and the 90 bps from Energy losses, and we will be reporting progress on both every quarter.',
  },
  Q03: {
    plain: 'We said working capital would be back to normal by the end of Q2. It was not. Inventory days went up from 61 to 78 and receivable days from 52 to 64. So operating cash flow was 112 crore, down from 265, and only 39% of EBITDA. There are two reasons: stock in the Appliances channel did not clear after summer, and state discoms paid us more slowly in Energy. I will not give you a new date today. We will report inventory days and receivable days every quarter so you can track it.',
    indian: 'As communicated in the last call, we had expected working capital to normalise by end of Q2, and the same has not happened. Inventory days have gone up from 61 to 78 and receivable days from 52 to 64, due to which operating cash flow came at 112 crore as against 265, and conversion has come down to 39% of EBITDA. There are two reasons for this: channel inventory in Appliances did not get liquidated post summer, and receivables from state discoms in Energy have got stretched. I will not be giving a fresh timeline on this call. Rather, we will be reporting inventory and receivable days every quarter so that you can track the trend.',
  },
  Q04: {
    plain: 'That is a fair point. In August I said we would share more at the right time. That was not a good answer. Our Q2 notes now show 210 crore owed by state distribution companies, overdue for more than 180 days, in Energy Solutions. We have set aside an expected credit loss provision of 18 crore for it. From now on we will disclose the discom ageing every quarter.',
    indian: 'I fully take your point. During the last call I had mentioned that we would share details at the appropriate time, which was not a satisfactory response. As per the notes to accounts for this quarter, 210 crore is due from state distribution companies beyond 180 days in Energy Solutions. We have created an expected credit loss provision of 18 crore against the same. Going forward we will be disclosing the discom ageing every quarter.',
  },
  Q06: {
    plain: 'Breakeven in Q4 FY27 is now at risk. I will not pretend it is not. Revenue grew 43.5% to 330 crore, but EBIT margin was minus 8.5%, against minus 3.0% a year ago. That is because we priced low to win charger tenders, as I said in August. It is better than minus 10.2% in Q1. We will report segment EBIT every quarter against the breakeven goal, and if the date moves we will say so in a formal update.',
    indian: 'I would be candid that the breakeven target of Q4 FY27 is at risk as of now. Revenue has grown by 43.5% to 330 crore, but EBIT margin stood at minus 8.5% as against minus 3.0% last year, since we have been pricing for market share in charger tenders, as mentioned in August. There is an improvement from minus 10.2% in Q1 itself. We will be reporting segment EBIT every quarter against the breakeven commitment, and if there is any change in the timeline, the same will be intimated through a formal update.',
  },
  Q07: {
    plain: 'Net debt is 940 crore. That is 0.79 times trailing EBITDA of 1,195 crore, so we are still below 1x today. But the headroom is smaller than the 0.52 times we had at year end. Free cash flow was negative 103 crore this quarter, and we paid the 75 crore final dividend. Staying below 1x depends on working capital freeing up cash in H2. We will track it every quarter and tell you early if the commitment is at risk.',
    indian: 'Net debt stands at 940 crore, which is 0.79 times trailing EBITDA of 1,195 crore, so we are well within the below 1x commitment as on date, though the headroom has reduced from 0.52 times at year end. Free cash flow was negative 103 crore this quarter, and we have paid the final dividend of 75 crore. Remaining below 1x will depend on release of working capital in H2. We will be monitoring the same every quarter and will inform you well in advance if the commitment is at risk.',
  },
};

let fails = 0;
for (const [qid, regs] of Object.entries(V)) {
  const q = questions.find((x) => x.id === qid);
  const ref = scoreAnswer(q, q.model).total;
  for (const [reg, text] of Object.entries(regs)) {
    const s = scoreAnswer(q, text);
    const d = s.total - ref;
    const ok = Math.abs(d) <= 10;
    if (!ok) fails++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${qid} ${reg.padEnd(6)} ${s.total} vs ${ref} (${d >= 0 ? '+' : ''}${d})${s.flags.length ? '  flags: ' + s.flags.map((f) => `${f.dim}: ${f.text.slice(0, 50)}`).join('; ') : ''}`);
  }
}
console.log(fails ? `\n${fails} register(s) scored more than 10 points apart: the scorer is penalising phrasing` : '\nNo phrasing bias beyond 10 points');
process.exit(fails ? 1 : 0);
