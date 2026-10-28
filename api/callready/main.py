"""CallReady API: one coach endpoint over an OpenAI-compatible gateway.

The browser does all deterministic scoring. This service only writes the critique,
the improved answer and the analyst follow-up, from the same facts the UI shows
(data/pack.json). Responses are cached; daily and per-client caps bound the spend.
"""

import hashlib
import json
import os
import re
import sqlite3
import time
from collections import defaultdict, deque
from pathlib import Path

import httpx
from fastapi import FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parents[2]
PACK = json.loads((ROOT / "data" / "pack.json").read_text())
QUESTIONS = {q["id"]: q for q in PACK["questions"]}
COMMITMENTS = {c["id"]: c for c in PACK["commitments"]}

LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "")
LLM_API_KEY = os.environ.get("LLM_API_KEY", "")
# Effort tiers: the coach writes fact-bearing text, so it starts on the high tier;
# Sonnet 4.6 is the fallback. The gateway streams unless told not to.
MODELS = [m for m in os.environ.get("MODEL_CHAIN", "ag/gemini-3.8-flash-high,ag/claude-sonnet-4-6,ag/gemini-3.8-flash-medium").split(",") if m]
DB_PATH = os.environ.get("DB_PATH", str(ROOT / "api" / "callready.db"))
BACKEND_KEY = os.environ.get("BACKEND_KEY", "")
DAILY_CAP = int(os.environ.get("LLM_DAILY_CAP", "400"))
CLIENT_HOURLY_CAP = int(os.environ.get("LLM_CLIENT_HOURLY_CAP", "30"))
PROMPT_VERSION = "coach-v1"

app = FastAPI(title="CallReady API", docs_url=None, redoc_url=None, openapi_url=None)


def db() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH)
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("CREATE TABLE IF NOT EXISTS cache (k TEXT PRIMARY KEY, v TEXT, at REAL)")
    con.execute("CREATE TABLE IF NOT EXISTS usage (day TEXT PRIMARY KEY, n INTEGER)")
    return con


_client_calls: dict[str, deque] = defaultdict(deque)


def check_caps(client: str) -> None:
    now = time.time()
    q = _client_calls[client]
    while q and now - q[0] > 3600:
        q.popleft()
    if len(q) >= CLIENT_HOURLY_CAP:
        raise HTTPException(429, "hourly limit reached for this client")
    with db() as con:
        day = time.strftime("%Y-%m-%d")
        row = con.execute("SELECT n FROM usage WHERE day=?", (day,)).fetchone()
        if row and row[0] >= DAILY_CAP:
            raise HTTPException(429, "daily coach budget used up")
    q.append(now)


def count_call() -> None:
    with db() as con:
        day = time.strftime("%Y-%m-%d")
        con.execute("INSERT INTO usage(day, n) VALUES(?, 1) ON CONFLICT(day) DO UPDATE SET n = n + 1", (day,))


class CoachIn(BaseModel):
    qid: str = Field(max_length=8)
    answer: str = Field(min_length=10, max_length=2000)
    speaker: str = Field(default="CFO", max_length=10)
    total: int | None = None
    flags: list[str] = Field(default_factory=list, max_length=20)


def build_prompt(q: dict, body: CoachIn) -> list[dict]:
    persona = PACK["personas"][q["persona"]]
    speaker = PACK["company"]["speakers"].get(body.speaker, body.speaker)
    owed = [f'{c} ({COMMITMENTS[c]["status"]}): {COMMITMENTS[c]["said"]}, said at {COMMITMENTS[c]["ref"]}' for c in q["mustAck"]]
    system = (
        "You coach the leadership of a listed Indian company before its earnings call. "
        "You are strict and specific, like a senior investor-relations adviser. "
        "Use ONLY figures that appear in the FACTS block. Never invent a figure, an order, a price action, "
        "an acquisition or any current-quarter trading detail. Never give new forward-looking numbers: "
        "if guidance may change, say it will come through a formal filing. "
        "Return JSON only, with keys critique, improved, followup."
    )
    user = "\n".join([
        "FACTS (synthetic company, INR crore):",
        *[f"- {f}" for f in PACK["facts"]],
        "",
        f"QUESTION from {persona['name']} ({persona['firm']}): {q['text']}",
        f"TRAP in the question: {q['trap']}",
        f"COMMITMENTS the answer must own: {'; '.join(owed) or 'none'}",
        f"SPEAKER answering: {speaker}",
        f"ANSWER given:\n\"\"\"\n{body.answer}\n\"\"\"",
        f"Automated checks found: {'; '.join(body.flags) or 'no flags'}. Score {body.total}/100.",
        "",
        "Write JSON:",
        '- "critique": 2 to 3 sentences on what will go wrong with this answer on the call, most serious first.',
        f'- "improved": a stronger answer in the first person as {speaker}, 70 to 120 words, direct in the first sentence, owning any broken commitment, quantifying the drivers with FACTS figures only, ending with a concrete action or metric to watch.',
        f'- "followup": the single sharpest follow-up {persona["name"]} would ask next, in their voice.',
    ])
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]


def parse_json(text: str) -> dict:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise ValueError("no JSON object")
    out = json.loads(m.group(0))
    if not all(isinstance(out.get(k), str) and out[k].strip() for k in ("critique", "improved", "followup")):
        raise ValueError("missing keys")
    # House style: no em or en dashes in anything the UI shows.
    def clean(t: str) -> str:
        t = re.sub(r"(\d)\s*[\u2013\u2014-]\s*(\d)", r"\1 to \2", t)
        return re.sub(r"\s*[\u2014\u2013]\s*", ", ", t).strip()
    return {k: clean(out[k]) for k in ("critique", "improved", "followup")}


async def call_chain(messages: list[dict]) -> tuple[dict, str]:
    deadline = time.time() + 50
    last = "no model configured"
    async with httpx.AsyncClient() as client:
        for model in MODELS:
            left = deadline - time.time()
            if left < 5:
                break
            try:
                r = await client.post(
                    f"{LLM_BASE_URL}/chat/completions",
                    headers={"Authorization": f"Bearer {LLM_API_KEY}"},
                    json={"model": model, "messages": messages, "temperature": 0.2, "max_tokens": 900, "stream": False},
                    timeout=min(26, left),
                )
                count_call()
                if r.status_code != 200:
                    last = f"{model}: HTTP {r.status_code}"
                    continue
                content = r.json()["choices"][0]["message"]["content"] or ""
                return parse_json(content), model
            except (httpx.HTTPError, ValueError, KeyError, json.JSONDecodeError) as e:
                last = f"{model}: {type(e).__name__}"
    raise HTTPException(503, f"coach unavailable ({last})")


@app.get("/health")
def health() -> dict:
    with db() as con:
        row = con.execute("SELECT n FROM usage WHERE day=?", (time.strftime("%Y-%m-%d"),)).fetchone()
    return {"ok": True, "models": MODELS, "budget_left_today": DAILY_CAP - (row[0] if row else 0)}


@app.post("/api/coach")
async def coach(body: CoachIn, request: Request, x_callready_key: str = Header(default=""), x_client_ip: str = Header(default="")) -> dict:
    if BACKEND_KEY and x_callready_key != BACKEND_KEY:
        raise HTTPException(401, "unauthorised")
    q = QUESTIONS.get(body.qid)
    if not q:
        raise HTTPException(404, "unknown question")
    messages = build_prompt(q, body)
    key = hashlib.sha256(json.dumps([PROMPT_VERSION, MODELS, messages]).encode()).hexdigest()
    with db() as con:
        row = con.execute("SELECT v FROM cache WHERE k=?", (key,)).fetchone()
    if row:
        return {**json.loads(row[0]), "cached": True}
    check_caps(x_client_ip or (request.client.host if request.client else "unknown"))
    out, model = await call_chain(messages)
    res = {**out, "model": model.split("/")[-1]}
    with db() as con:
        con.execute("INSERT OR REPLACE INTO cache VALUES(?,?,?)", (key, json.dumps(res), time.time()))
    return {**res, "cached": False}
