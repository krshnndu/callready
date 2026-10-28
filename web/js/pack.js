// Synthetic company pack: Meridian Arc Industries Ltd (fictional). INR crore.
// Authoritative figures: docs/03-DATA.md section 3. Every line and note has a stable id for citations.

export const company = {
  name: 'Meridian Arc Industries Ltd',
  short: 'Meridian Arc',
  ticker: 'MERIDARC (fictional)',
  quarter: 'Q2 FY27',
  period: 'Jul to Sep 2026',
  resultsDate: '2026-11-04',
  callDate: '2026-11-05',
  units: 'INR crore',
  speakers: {
    CEO: 'Meera Kulkarni, CEO',
    CFO: 'Arjun Sethi, CFO',
    ENERGY: 'Priya Nair, President, Energy Solutions',
  },
};

// Quarterly P&L, cash and balance sheet lines.
export const quarters = [
  { q: 'Q1 FY26', revenue: 2020, ebitda: 283, da: 90, ocf: 190, capex: 120, netDebt: null },
  { q: 'Q2 FY26', revenue: 2170, ebitda: 308, da: 99, ocf: 265, capex: 130, netDebt: null, pat: 152, otherIncome: 10, financeCost: 17, invDays: 61, recDays: 52, payDays: 58 },
  { q: 'Q3 FY26', revenue: 2260, ebitda: 315, da: null, ocf: 280, capex: 140, netDebt: null },
  { q: 'Q4 FY26', revenue: 2410, ebitda: 330, da: null, ocf: 310, capex: 150, netDebt: 640 },
  { q: 'Q1 FY27', revenue: 2300, ebitda: 262, da: 103, ocf: 78, capex: 195, netDebt: 760 },
  { q: 'Q2 FY27', revenue: 2480, ebitda: 288, da: 108, ocf: 112, capex: 215, netDebt: 940, pat: 123, otherIncome: 12, financeCost: 28, invDays: 78, recDays: 64, payDays: 55, dividend: 75 },
];

// Segment revenue and EBIT margin (%).
export const segments = [
  { name: 'Home Appliances', key: 'APP', rows: { 'Q1 FY26': [1060, 10.1], 'Q2 FY26': [1120, 10.4], 'Q1 FY27': [1130, 7.0], 'Q2 FY27': [1190, 7.1] } },
  { name: 'Industrial Motion', key: 'IND', rows: { 'Q1 FY26': [760, 14.3], 'Q2 FY26': [820, 14.6], 'Q1 FY27': [880, 14.9], 'Q2 FY27': [960, 15.2] } },
  { name: 'Energy Solutions', key: 'ENE', rows: { 'Q1 FY26': [200, -1.5], 'Q2 FY26': [230, -3.0], 'Q1 FY27': [290, -10.2], 'Q2 FY27': [330, -8.5] } },
];

export const consensus = { q: 'Q2 FY27', revenue: 2440, ebitda: 315, margin: 12.9, pat: 150, source: 'Synthetic street consensus, 12 brokers' };

// Margin bridge Q2 FY26 to Q2 FY27, in bps.
export const bridge = [
  { driver: 'Gross margin: copper and steel costs, Appliances price competition', bps: -180 },
  { driver: 'Energy Solutions losses', bps: -90 },
  { driver: 'Employee cost: new plant ramp-up', bps: -28 },
  { driver: 'Operating leverage on other costs', bps: 40 },
];

// Commitments on record. status: on-track | at-risk | broken | deflected
export const commitments = [
  { id: 'G1', ref: 'Q4FY26-L024', by: 'CFO', said: 'FY27 revenue growth "mid-teens"', metric: 'FY27 revenue growth', status: 'on-track', why: 'H1 revenue +14.1%',
    ack: ['mid-teens', 'revenue growth', 'guid'] },
  { id: 'G2', ref: 'Q4FY26-L024', by: 'CFO', said: 'FY27 EBITDA margin "13.5 to 14.5 percent"', metric: 'FY27 EBITDA margin', status: 'at-risk', why: 'H1 11.5%; H2 would need about 15.3%, above the 14.2% record',
    ack: ['band', 'guidance', 'guided', '13.5', 'range', 'full-year margin', 'full year margin'] },
  { id: 'G3', ref: 'Q4FY26-L038', by: 'CEO', said: 'Energy Solutions "EBIT breakeven by the fourth quarter of FY27"', metric: 'Energy EBIT', status: 'at-risk', why: 'EBIT margin -8.5% vs -3.0% a year ago',
    ack: ['breakeven', 'break-even', 'break even'] },
  { id: 'G4', ref: 'Q4FY26-L031', by: 'CFO', said: 'FY27 capex "around 600 crore"', metric: 'Capex', status: 'at-risk', why: 'H1 capex 410 crore',
    ack: ['600', 'capex guidance', 'around 600'] },
  { id: 'G5', ref: 'Q4FY26-L031', by: 'CFO', said: 'Net debt to EBITDA "below 1x"', metric: 'Leverage', status: 'at-risk', why: '0.79x and rising, from 0.52x at year end',
    ack: ['below 1x', 'below one times', '1x', 'below 1 times', 'commitment'] },
  { id: 'S1', ref: 'Q1FY27-L019', by: 'CFO', said: '"Back within our guided band from Q2"', metric: 'EBITDA margin', status: 'broken', why: 'Q2 margin 11.6%, below the 13.5% floor',
    ack: ['we said', 'i said', 'we told', 'in august', 'last quarter', 'we expected', 'did not happen', 'we were wrong', 'we were not', 'not back', 'transitory'] },
  { id: 'S2', ref: 'Q1FY27-L027', by: 'CFO', said: 'Working capital "should normalise by the end of Q2"', metric: 'Working capital', status: 'broken', why: 'Inventory days 61 to 78, receivable days 52 to 64',
    ack: ['we said', 'i said', 'in august', 'last quarter', 'did not', 'normalise', 'normalize', 'got worse', 'worsened'] },
  { id: 'D1', ref: 'Q1FY27-L034', by: 'CEO', said: 'Discom receivables: "more detail at the right time"', metric: 'Receivables', status: 'deflected', why: 'Q2 notes show 210 crore overdue beyond 180 days',
    ack: ['right time', 'in august', 'last quarter', 'should have', 'fair challenge', 'not a good answer', 'from now on'] },
];

export const transcripts = {
  'Q4FY26': { title: 'Q4 FY26 earnings call, 2026-05-14', lines: [
    ['L010', 'CEO', 'FY26 closed with revenue of 8,860 crore and an EBITDA margin of close to 14 percent.'],
    ['L024', 'CFO', 'For FY27 we are guiding to mid-teens revenue growth, with EBITDA margins in the 13.5 to 14.5 percent band.'],
    ['L031', 'CFO', 'Capex for FY27 will be around 600 crore, and net debt to EBITDA will stay below 1x.'],
    ['L038', 'CEO', 'Energy Solutions will reach EBIT breakeven by the fourth quarter of FY27.'],
    ['L052', 'Analyst, Brightwater AMC', 'Working capital in Energy looks stretched. How much of your receivables sit with state utilities?'],
    ['L053', 'CFO', 'It is within normal ranges for the industry, and we monitor it closely.'],
  ] },
  'Q1FY27': { title: 'Q1 FY27 earnings call, 2026-08-06', lines: [
    ['L008', 'CEO', 'Q1 revenue grew 13.9 percent to 2,300 crore, in line with our mid-teens ambition.'],
    ['L019', 'CFO', 'The Q1 margin dip is transitory. Commodity costs have peaked, and we expect to be back within our guided band from Q2.'],
    ['L027', 'CFO', 'Working capital should normalise by the end of Q2 as channel inventory unwinds after the summer season.'],
    ['L033', 'Analyst, Tamarind Research', 'Can you quantify the receivables from state discoms in Energy?'],
    ['L034', 'CEO', "We'll share more detail at the right time."],
    ['L041', 'ENERGY', 'We are pricing for share in charger tenders this year; margins will follow scale.'],
    ['L048', 'Analyst, Halden Securities', 'Is the full-year margin band still achievable after an 11.4 percent quarter?'],
    ['L049', 'CFO', 'Yes. We remain comfortable with the band.'],
  ] },
};

export const notes = [
  ['N1', 'Trade receivables include 210 crore due from state distribution companies (Energy Solutions) overdue beyond 180 days.'],
  ['N2', 'An expected credit loss provision of 18 crore has been made against these receivables.'],
  ['N3', 'H1 FY27 capex of 410 crore relates mainly to the new Home Appliances plant.'],
  ['N4', 'Net debt at 30 September 2026 was 940 crore (31 March 2026: 640 crore).'],
  ['N5', 'A final dividend of 75 crore for FY26 was paid in September 2026.'],
];

export const remarksDraft = `Good evening, and thank you for joining us.

Q2 FY27 delivered record quarterly revenue of 2,480 crore, up 14.3 percent year on year, with strong momentum across all three segments.

Industrial Motion had an outstanding quarter, growing 17.1 percent with margins expanding again. Energy Solutions grew 43.5 percent as we won new charger tenders, and Home Appliances continued to gain share in a competitive market.

We continue to invest for the long term, with our new plant on schedule.

We remain confident in our strategy and in our FY27 outlook. With that, I will hand over to Arjun for the financials.`;
