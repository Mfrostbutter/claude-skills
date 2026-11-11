"""Opens a headed Chromium on the live app so the operator can sign in through Cloudflare Access once.
Saves the session cookies to profile/storage_state.json for the headless capture runs. Nothing is printed
but the cookie count. Run: .venv python scripts/login.py"""
import sys, pathlib
from playwright.sync_api import sync_playwright

BASE = "https://app.example.com"  # the subject behind an identity proxy
W = pathlib.Path(__file__).resolve().parents[1]
STATE = W / "profile" / "storage_state.json"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    ctx = browser.new_context(viewport={"width": 1600, "height": 1000})
    page = ctx.new_page()
    page.goto(BASE + "/admin")
    print("Sign in through Access in the window. Waiting for the admin page...", flush=True)
    page.wait_for_url(lambda u: u.startswith(BASE) and "cloudflareaccess" not in u, timeout=300_000)
    page.wait_for_load_state("networkidle")
    ctx.storage_state(path=str(STATE))
    names = [c["name"] for c in ctx.cookies()]
    print(f"saved {len(names)} cookies to {STATE}; CF_Authorization present: {'CF_Authorization' in names}")
    browser.close()
