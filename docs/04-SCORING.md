# 04. Pressure ranking and answer scoring

Two engines carry the "sound reasoning" in this prototype. Both are mostly deterministic so they can be explained, tested and defended in front of judges.

## 1. Pressure map (deterministic)

Each candidate pressure point is a metric movement or a commitment. Its score:

```
pressure = magnitude x salience x credibility x recurrence
```

| Factor | Definition | Range |
| --- | --- | --- |
| magnitude | Size of the miss, normalised: bps for margins, % for growth and cash, gap to guidance or consensus. Mapped to 0 to 1 by fixed thresholds per metric (table in `engine/pressure.py`) | 0 to 1 |
| salience | How much investors weigh the metric. Default weights: guidance 1.0, EBITDA margin 0.95, operating cash flow 0.9, net debt / leverage 0.85, consensus miss 0.85, segment margin 0.7, capex 0.6, working-capital days 0.6, revenue 0.5 | 0.5 to 1 |
| credibility | 1.5 if the movement breaks a statement on record (S*), 1.25 if it puts guidance at risk (G*), else 1.0 | 1 to 1.5 |
| recurrence | 1.2 if analysts asked about it on an earlier call (from transcript tags), 1.3 if management deflected it (D*), else 1.0 | 1 to 1.3 |

Output per point: rank, score, the figures, the commitment it touches, the transcript lines that make it recurrent, and the suggested owner (CFO for cash, margin and guidance; segment president for segment items; CEO for strategy and capital allocation).

**Implied-guidance calculator** (`engine/implied.py`): for each live guidance item, the H2 run-rate needed to land inside the band, set against the historical maximum. For the sample pack this gives about 15.3% H2 EBITDA margin needed against a record of 14.2%. That one number drives the top recommendation.

Expected top five for the sample pack, used as a test fixture: margin guidance (G2, S1), cash conversion and working capital (S2), consensus EBITDA miss, Energy losses vs breakeven (G3), discom receivables (D1).

## 2. Answer scorecard

Seven dimensions, 0 to 100 overall. Deterministic checks run first and can cap a dimension; the LLM judge scores the rest with quoted evidence.

| Dimension | Weight | Deterministic part | LLM judge part |
| --- | --- | --- | --- |
| **Accuracy** | 25 | Extract every figure (numbers, %, bps, crore, x). Match each to a pack fact within rounding. One unmatched or wrong figure caps the dimension at 40; a wrong figure on the question's own metric caps it at 20 | Are the matched figures used correctly (right period, right base)? |
| **Consistency** | 20 | If the question touches a commitment with status Broken or At risk, the answer must mention it; silence caps at 50 | Does the answer contradict an earlier statement? Does it own the change ("we said X; Y happened; here is what changes")? |
| **Directness** | 15 | First two sentences share the question's key terms | Is the question answered, or deflected? |
| **Explanation** | 15 | Contains at least one quantified driver | Are the drivers causal, quantified and complete (the bridge)? |
| **Forward clarity** | 10 | | Concrete actions, timing and a metric to watch, without over-promising |
| **Disclosure safety** | 10 | Flags: a forward-looking figure not in guidance; an order, contract, M&A or pricing detail absent from the pack; a statement about the current quarter's trading | Selective-disclosure risk, unpublished price-sensitive information. **Any red flag shows a red LED whatever the total** |
| **Delivery** | 5 | Word count against a 60 to 130 word target; hedges and filler ("basically", "sort of", "to be honest"); with voice, words per minute against 130 to 170 | Jargon and tone |

Bands: **Green 75+, Amber 55 to 74, Red below 55.** A disclosure red flag forces Red.

Each scorecard returns: the total and band, per-dimension scores with one-line reasons, highlighted sentences with the flag that applies, the matching pack evidence, an **improved answer** (strong model, every figure cited, no figure absent from the pack, re-checked by the number checker before it is shown), and one persona follow-up.

## 3. Readiness report

- Readiness per theme: the mean of the best attempt per question in that theme; no attempt counts as Red.
- Readiness per speaker.
- **Cross-speaker contradictions:** two speakers' answers on the same theme compared for conflicting figures or claims (deterministic figure diff, then LLM confirmation).
- Riskiest five questions: highest pressure times lowest readiness.
- Recommendations: produced by the strong model from a fixed menu of recommendation types (add to the prepared remarks; pre-empt a figure; reassign the owner; revise or reaffirm guidance; prepare a bridge slide; legal review of a phrase), each tied to a computed fact. Free-form advice without a fact behind it is rejected by schema.

## 4. Calibration (gate for P3)

`api/tests/calibration/` holds 10 question pairs: a strong answer and a weak twin written by the team (wrong figure, deflection, silent on a broken promise, new forward number, rambling). The judge must score the strong answer above its twin by at least 15 points in 9 of 10 pairs, and catch every planted wrong figure and every planted forward number. The judge prompt version is pinned once this passes; changing it reruns the set.
