# 08. Governance (PMI-CPMAI)

CallReady is governed by the PMI Certified Professional in Managing AI (PMI-CPMAI) framework, using its exam content outline (September 2025). The outline has five domains, weighted by how much of the job they represent:

| Domain | Weight | What it asks of the project |
| --- | --- | --- |
| I. Responsible and trustworthy AI | 15% | Privacy and security, transparency, bias checks, regulatory compliance, an accountability trail |
| II. Business needs and solutions | 26% | Problem and persona, feasibility against non-AI options, risk assessment, scope, ROI, adoption, success criteria, resources |
| III. Data needs | 26% | Define, source, govern and evaluate data; a go/no-go on data readiness; explain the data to leadership |
| IV. Model development and evaluation | 16% | Technique choice, QA/QC and configuration management, data preparation, and a go/no-go before operation |
| V. Operationalize | 17% | Deployment plan with rollback, model governance and drift, metrics, final report, transition and contingency plans |

Two ideas run through all five. **The work is iterative**: business, data, model and operation are revisited as each one teaches you something. And **the gates are explicit**: data readiness, data preparation and operational readiness each get a recorded go/no-go decision with an owner.

## 1. What this changes about how CallReady is run

1. **Gates are written down, not implied.** Every go/no-go below has a date, evidence and an owner. The build so far skipped this: it shipped because the demo worked.
2. **AI is justified against the alternative.** Domain II asks whether AI is needed at all. CallReady's answer is its design: arithmetic, ranking and checking are rules; the model only writes. That split is now a stated decision, not a side effect.
3. **Trust is a feature with owners.** Privacy, transparency and an audit trail are tasks with deliverables, not a line in the README.
4. **Operation includes the end.** Transition and contingency plans cover how the service fails and how it is retired. CallReady is temporary, so its transition plan is a decommissioning plan.

## 2. Assessment against each domain (2026-10-28)

Status: **Met**, **Partial** or **Gap**.

### Domain I. Responsible and trustworthy AI

| Task | Status | Evidence, and what is missing |
| --- | --- | --- |
| Privacy and security plan | Partial | No personal data by design: the pack is synthetic and there are no accounts. The API needs a shared key, its body size and per-client calls are capped, and secrets live only on the host. **Gaps:** answers sent to the coach go to third-party model providers through the gateway, and the UI does not say so; cached answers are kept indefinitely, though the plan promised 7 days |
| Transparency | Partial | The coach names the model that answered; the rules and weights are published (`04-SCORING.md`). **Gap:** no plain statement on screen of which parts are rules and which are AI, and no model card |
| Bias checks | Gap | The "bias" that matters here is scorer bias: penalising plain or non-native phrasing, or one speaker role. Never tested |
| Regulatory compliance | Partial | SEBI disclosure rules shape the disclosure-safety checks. India's DPDP Act would apply to real users' data; today there is none. Not legal advice, and the product says so |
| Accountability and audit trail | Partial | Git history, a decisions log (D-01 to D-09) and a versioned prompt (`coach-v1`). **Gaps:** go/no-go decisions were never recorded; the coach's outputs are cached but not logged with the model and prompt version that produced them |

### Domain II. Business needs and solutions

| Task | Status | Evidence, and what is missing |
| --- | --- | --- |
| Problem and persona | Partial | PRD sections 1 and 2. **Gap:** not validated with a real IR or finance professional |
| Feasibility vs non-AI options | Met | Rules first; the model is limited to writing and coaching, and is checked by the rules |
| Risk assessment | Partial | Risk register R-01 to R-10. **Missing AI-specific risks:** invented figures in the coach's output, prompt injection through the answer box, the gateway silently changing which model answers, and over-trust in a score |
| Scope statement | Met | PRD feature table with priorities and an out-of-scope list |
| ROI and business case | Gap | Only an unquantified "days to an hour" claim in the pitch |
| Adoption risks | Partial | Executives may resist being scored. The design answer is private, per-browser rehearsal with no accounts, but it is not stated |
| Success criteria | Partial | Targets are in PRD section 6, but none are measured in operation |
| Resources | Met | One shared VPS, Vercel, the LLM gateway; constraints recorded (disk, ports) |

### Domain III. Data needs

| Task | Status | Evidence, and what is missing |
| --- | --- | --- |
| Required data, sources, SMEs | Partial | The pack schema and one authoritative table (`03-DATA.md`). Synthetic by design, which is a stated assumption. No data SME review |
| Workspace and infrastructure | Met | Repo, VPS clone as source of truth, gitignored host runbook |
| Data evaluation and quality | Partial | The reconciliations (segments to EBIT to EBITDA) were checked by hand while building. **Gap:** `validate_pack.py` was planned and never built, so a future edit could break the numbers silently |
| Go/no-go on data readiness | Gap | Not recorded |
| Explaining the data to leadership | Met | The Quarter screen, the commitments table and the assumptions panel |

### Domain IV. Model development and evaluation

CallReady trains no model. In this domain, "model" means the scoring rules plus the coach prompt and its model chain.

| Task | Status | Evidence, and what is missing |
| --- | --- | --- |
| Technique selection | Met | Rules for computation and checking; Gemini 3.8 Flash (high) for the coach, Claude Sonnet 4.6 as fallback, Flash (medium) last. The reasons are recorded in D-05 and in the architecture |
| QA/QC and configuration management | Partial | The 12 reference answers all score Green and the weak samples score Red; the coach's output is re-checked by the number checker before it is shown. **Gap:** that check was an ad hoc script, never committed, so it is not repeatable |
| Data preparation | Met | `scripts/export_pack.mjs` derives the API's facts from the same source as the UI |
| Go/no-go before operation | Gap | The coach went live without a recorded decision or an evaluation of its outputs beyond two samples |

### Domain V. Operationalize

| Task | Status | Evidence, and what is missing |
| --- | --- | --- |
| Deployment plan and rollback | Partial | Vercel keeps every deploy and can roll back instantly; the Funnel port turns off with one command; the systemd unit restarts the API. Not written down in one place |
| Model governance and drift | Gap | The gateway can change which model answers. Nothing tracks the fallback rate or latency |
| Metrics | Gap | `/health` shows only today's remaining budget |
| Final report and lessons learned | Gap | Due at close |
| Transition plan | Partial | The teardown steps exist in conversation, not in the repo |
| Contingency plan | Partial | The browser falls back to vetted reference answers, and the pitch path is cached. No recorded backup video; no uptime check before the pitch |

## 3. Changes

Ordered by value to the submission (17:00 today), then by governance value. Effort is estimated in minutes.

| # | Change | Domain | Effort | Before 17:00? |
| --- | --- | --- | --- | --- |
| C1 | **AI use and privacy notice** on the Rehearse screen: what is rules and what is AI, that answers sent to the coach reach third-party model providers, not to paste real unpublished information, and that cached answers are deleted after 7 days | I | 15 | Yes |
| C2 | **Delete cached answers after 7 days** in the API, as the plan promised | I | 10 | Yes |
| C3 | **Business case on the Report screen and in the pitch:** IR and leadership prep hours per quarter, with and without CallReady, against running cost per quarter, with every assumption labelled. It replaces the bare "days to an hour" | II | 30 | Yes |
| C4 | **Commit the calibration check** as `scripts/check_engine.mjs`: reference answers must be Green with no flags, weak samples Red, the pack reconciles, and the pressure order is fixed. It becomes the evidence for the go/no-go gates | III, IV | 20 | Yes |
| C5 | **Record the go/no-go gates** (section 4), with today's evidence | I, III, IV | 10 | Yes |
| C6 | **Coach telemetry in `/health`:** calls by model, fallback rate, median latency, cache hit rate | V | 20 | Yes |
| C7 | **Prompt-injection guard:** the coach prompt treats the answer strictly as data, and any instructions inside it are ignored | I, II | 5 | Yes |
| C8 | **AI-specific risks** added to the register (R-11 to R-14) | II | 10 | Yes |
| C9 | Scorer bias test: rephrase each reference answer plainly and in Indian-English register; scores must stay within 10 points | I | 30 | If time |
| C10 | Recorded backup video of the 90-second demo | V | 15 | If time |
| C11 | Final report and lessons learned (`09-CLOSEOUT.md`), and the decommissioning plan as the transition plan | V | 20 | At close |
| C12 | One 15-minute validation call with an IR or finance professional on the top 10 questions | II, III | external | After |

## 4. Go/no-go log

| Gate | Date | Decision | Evidence | Owner |
| --- | --- | --- | --- | --- |
| G-A Business feasibility (is this an AI problem, is there value, will it be used) | 2026-10-28 | Go, with AI limited to writing and coaching | PRD; rules-first design; the brief | Team lead |
| G-B Data readiness | pending C4 | | `check_engine.mjs` reconciliation | Team lead |
| G-C Model ready for operation (scoring rules and coach) | pending C4 and C7 | Retroactive: the coach is already live | Calibration results; two live coach samples, both checked | Team lead |
| G-D Decommission | at close | | `09-CLOSEOUT.md` | Team lead |
