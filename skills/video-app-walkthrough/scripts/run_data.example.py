"""Drive one role-play interview end to end against the local app.

A respondent LLM plays an Accounts Payable lead and answers the interviewer
over the app's own HTTP endpoints, so every job, audit and model_calls row
lands exactly as it would for a human. Invented data only, roleplay track.

IN: a running app at BASE, OPENROUTER_API_KEY from the repo .env.
OUT: transcript log in ../captures/, interview id + token printed at the end.
"""
import asyncio
import html
import json
import os
import re
import sys
import time
from pathlib import Path

import httpx
from dotenv import dotenv_values

BASE = os.environ.get("APP_BASE", "http://127.0.0.1:8000")
OUT = Path(__file__).resolve().parent.parent / "captures"
RESPONDENT_MODEL = os.environ.get("RESPONDENT_MODEL", "google/gemini-2.5-flash-lite")
MAX_TURNS = 48

PERSONA = {
    "respondent_name": "AP Lead (role-play)",
    "respondent_role": "Accounts Payable Lead",
    "respondent_department": "Finance",
    "track": "roleplay",
    "business_unit": "Accounts payable",
    "org_size_band": "250-2000",
}

SYSTEM = """You are role-playing the Accounts Payable Lead at Cascadia Precision Industries, a 600-person precision manufacturer with two plants and one shared services office. You are being interviewed by an AI about how your work flows and which software it touches. Stay in character for every answer.

Your world:
- Team: you plus three AP specialists and one part-time temp at month end. The controller approves anything over 25k. Plant managers approve their own POs.
- Volume: about 1,400 supplier invoices a month, 70 percent arrive as PDF attachments to a shared mailbox in Outlook (ap@), the rest by post or through the Coupa supplier portal.
- Systems you actually use, by name: NetSuite (the ERP, where invoices are keyed and paid), Coupa (purchase orders and receipts), Outlook shared mailbox (intake, approval chasing, vendor queries), Excel (the exceptions tracker, the weekly payment run proposal, vendor statement recs), Adobe Acrobat (splitting multi-invoice PDFs), the JPMorgan Access banking portal (releasing payment files, checking returns), Slack (chasing plant approvers), DocuSign (new vendor forms), and a Fujitsu scanner for paper.
- The pain, in order: (1) the same invoice header data is typed twice, once from the PDF into NetSuite and again into the Excel exceptions tracker when anything does not match. (2) A three-way-match exception takes a specialist across Coupa, NetSuite, Outlook, Excel and sometimes Slack, five systems for one invoice, about 25 minutes each, roughly 180 a month. (3) Approval chasing: specialists send Slack and email reminders by hand, two or three touches per invoice over 25k. (4) Vendor statement reconciliation is a quarterly Excel exercise, two full days per specialist. (5) Duplicate payments: caught by eye at the payment run review, two slipped through last year, 11k and 3k, clawed back by phone. (6) New vendor onboarding: DocuSign form, then bank details retyped into NetSuite, then a call-back to verify the bank details. (7) Month-end accrual: the specialists export open items from NetSuite and Coupa to Excel and match them by hand, about a day and a half.
- Workarounds tried: an Outlook rule that files PDFs by sender (helps intake, nothing else); a NetSuite saved search for possible duplicates (misses amount variances); asked IT for a Coupa to NetSuite sync fix two years ago, still open.
- What good looks like: invoices extracted from the PDF and prefilled, exceptions routed to the right plant approver automatically with reminders, statement recs done by machine with a human reviewing the differences.

Rules for your answers:
- Two to five sentences. Concrete numbers, product names, time per occurrence, how many people, who catches errors, what has been tried. Do not volunteer everything at once; answer what was asked and let the interviewer dig.
- Never use personal names or email addresses. Refer to people by role (the controller, a specialist, the plant manager, the IT lead).
- Plain business language. No bullet lists, no markdown, no headings.
- If asked about something outside AP, answer briefly from the AP lead's point of view.
- When the interviewer asks for a system by name, name it. Never say "the CRM" or "the ERP" without the product name.
- Do not end the interview yourself. Do not thank the interviewer or ask them questions.
"""


def _env_key() -> str:
    vals = dotenv_values(REPO / ".env")
    key = vals.get("OPENROUTER_API_KEY") or ""
    if len(key) < 20:
        sys.exit("OPENROUTER_API_KEY not readable from the repo .env")
    return key


def _assistant_text(partial: str) -> tuple[str, bool, str]:
    """Return (assistant text, completed, kind). kind in exchange|error|limit|closed."""
    if "done-note" in partial or "This conversation is complete" in partial:
        completed = True
    else:
        completed = False
    msgs = re.findall(r'<div class="msg msg-assistant">(.*?)</div>', partial, re.S)
    if msgs:
        return html.unescape(msgs[-1]).strip(), completed, "exchange"
    if "retry" in partial.lower() and "/retry" in partial:
        return "", False, "error"
    if "limit" in partial.lower() and "reached" in partial.lower():
        return "", False, "limit"
    if "closed" in partial.lower():
        return "", True, "closed"
    return "", completed, "unknown"


async def respond(client: httpx.AsyncClient, key: str, history: list[dict]) -> str:
    body = {
        "model": RESPONDENT_MODEL,
        "messages": [{"role": "system", "content": SYSTEM}] + history,
        "temperature": 0.7,
        "max_tokens": 400,
    }
    for attempt in range(4):
        try:
            r = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json",
                         "HTTP-Referer": "http://localhost", "X-Title": "app-walkthrough-respondent"},
                json=body, timeout=120,
            )
            if r.status_code >= 500 or r.status_code == 429:
                raise httpx.HTTPStatusError(f"{r.status_code}", request=r.request, response=r)
            r.raise_for_status()
            text = (r.json()["choices"][0]["message"]["content"] or "").strip()
            if text:
                return text
        except Exception as exc:  # retry with backoff
            wait = 2 ** attempt
            print(f"  respondent call failed ({exc}); retry in {wait}s", flush=True)
            await asyncio.sleep(wait)
    sys.exit("respondent model kept failing")


async def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    key = _env_key()
    log_path = OUT / f"interview-{time.strftime('%Y%m%d-%H%M%S')}.jsonl"
    started = time.time()
    async with httpx.AsyncClient(base_url=BASE, timeout=httpx.Timeout(420.0), follow_redirects=False) as app, \
            httpx.AsyncClient() as llm:
        page = (await app.get("/join")).text
        m = re.search(r'name="engagement_id" value="([^"]+)"', page)
        if not m:
            sys.exit("no engagement on /join")
        engagement_id = m.group(1)
        r = await app.post("/join", data={"engagement_id": engagement_id, **PERSONA})
        if r.status_code != 303:
            sys.exit(f"/join did not redirect: {r.status_code}\n{r.text[:800]}")
        token = r.headers["location"].rsplit("/", 1)[-1]
        print(f"engagement {engagement_id}\ntoken minted; interview url {BASE}/i/{token}", flush=True)

        r = await app.post(f"/i/{token}/start", data={})
        q, completed, kind = _assistant_text(r.text)
        if kind != "exchange":
            sys.exit(f"start returned {kind}: {r.text[:600]}")
        history: list[dict] = []
        turn = 0
        with log_path.open("a", encoding="utf-8") as log:
            log.write(json.dumps({"role": "assistant", "content": q}) + "\n")
            while not completed and turn < MAX_TURNS:
                turn += 1
                print(f"\n[Q{turn}] {q[:160]}{'...' if len(q) > 160 else ''}", flush=True)
                history.append({"role": "user", "content": q})
                a = await respond(llm, key, history)
                history.append({"role": "assistant", "content": a})
                print(f"[A{turn}] {a[:160]}{'...' if len(a) > 160 else ''}", flush=True)
                log.write(json.dumps({"role": "user", "content": a}) + "\n")
                t0 = time.time()
                r = await app.post(f"/i/{token}/message", data={"message": a, "input_method": "text"})
                q, completed, kind = _assistant_text(r.text)
                if kind == "error":
                    print("  turn failed; retrying via /retry", flush=True)
                    r = await app.post(f"/i/{token}/retry", data={})
                    q, completed, kind = _assistant_text(r.text)
                if kind == "limit":
                    print("  spend/turn limit hit; stopping", flush=True)
                    break
                if kind not in ("exchange",):
                    print(f"  unexpected partial kind={kind}: {r.text[:300]}", flush=True)
                    break
                log.write(json.dumps({"role": "assistant", "content": q, "latency_s": round(time.time() - t0, 1)}) + "\n")
                print(f"  (interviewer took {time.time() - t0:.0f}s)", flush=True)
            if q:
                print(f"\n[closing] {q[:300]}", flush=True)
        print(f"\ncompleted={completed} turns={turn} elapsed={(time.time() - started) / 60:.1f} min", flush=True)
        print(f"log: {log_path}", flush=True)
        print(f"TOKEN={token}", flush=True)
        print(f"ENGAGEMENT={engagement_id}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
