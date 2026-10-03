"""Record one clip per walkthrough scene from the local app with Playwright.

Each scene gets its own browser context so Playwright writes one .webm per
scene; ffmpeg then turns each into an H.264 .mp4 that After Effects imports.
A fake cursor is injected so clicks and typing read on camera.

IN: running app at BASE, record ids via env APP_RECORD / APP_PARENT (else the newest matching row from the DB).
OUT: captures/scene_NN.mp4 and captures/clips.json with measured durations.
"""
import asyncio
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

import asyncpg
from playwright.sync_api import sync_playwright

BASE = os.environ.get("APP_BASE", "http://127.0.0.1:8000")
HERE = Path(__file__).resolve().parent
CAP = HERE.parent / "captures"
RAW = CAP / "raw"
FFMPEG = os.environ.get("FFMPEG", "ffmpeg")
FFPROBE = os.environ.get("FFPROBE", "ffprobe")
DB = os.environ.get("APP_DB_URL", "")  # only for ids_from_db()
W, H = 1920, 1080

# fallback hold per scene (seconds) when vo/manifest.json does not exist yet; VO + 3 s wins when it does
MIN_LEN = {"02": 28, "03": 34, "04": 16, "05": 31, "06": 36, "07": 26, "08": 28, "09": 16}
VO_MANIFEST = HERE.parent / "vo" / "manifest.json"
if VO_MANIFEST.exists():
    for _s in json.loads(VO_MANIFEST.read_text(encoding="utf-8"))["scenes"]:
        if _s["id"] in MIN_LEN:
            MIN_LEN[_s["id"]] = max(MIN_LEN[_s["id"]], float(_s["duration"]) + 3.0)

CURSOR_JS = """
(() => {
  const c = document.createElement('div');
  c.id = '__cur';
  c.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;'
    + 'transform:translate(-3px,-2px);transition:transform .08s;';
  c.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M5 3l14 8-6 1.5L16 20l-3 1-3-7.5L5 17z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  const add = () => document.body && document.body.appendChild(c);
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', add) : add();
  window.addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
  window.addEventListener('mousedown', () => { c.style.transform = 'translate(-3px,-2px) scale(.8)'; }, true);
  window.addEventListener('mouseup', () => { c.style.transform = 'translate(-3px,-2px) scale(1)'; }, true);
})();
"""

AP_ANSWER = ("Most of the pain is intake. About 1,400 supplier invoices a month and seventy percent land as PDFs "
             "in a shared Outlook mailbox. A specialist opens each one, keys the header into NetSuite, and if it "
             "does not match the Coupa PO it goes into an Excel exceptions tracker as well. Same data typed twice.")


def ids_from_db() -> tuple[str, str]:
    async def q():
        c = await asyncpg.connect(DB, timeout=5)
        row = await c.fetchrow(
            "SELECT id, engagement_id FROM interviews WHERE business_unit = 'Accounts payable' "
            "AND status = 'completed' ORDER BY completed_at DESC LIMIT 1")
        await c.close()
        return row
    row = asyncio.run(q())
    if not row:
        sys.exit("no completed Accounts payable interview in the DB")
    return str(row["id"]), str(row["engagement_id"])


def smooth_scroll(page, y: int, wait: float = 1.6):
    page.evaluate("y => window.scrollTo({top: y, behavior: 'smooth'})", y)
    page.wait_for_timeout(int(wait * 1000))


def scroll_to(page, selector: str, wait: float = 1.6, block: str = "start"):
    loc = page.locator(selector).first
    if loc.count():
        loc.evaluate("(el, b) => el.scrollIntoView({behavior: 'smooth', block: b})", block)
        page.wait_for_timeout(int(wait * 1000))
        return True
    return False


def glide(page, x: int, y: int, steps: int = 28):
    page.mouse.move(x, y, steps=steps)
    page.wait_for_timeout(250)


def hold(page, t0: float, scene: str):
    remaining = MIN_LEN[scene] - (time.time() - t0)
    if remaining > 0:
        page.wait_for_timeout(int(remaining * 1000))


def record(pw, scene: str, fn):
    """Run fn(page) in a fresh recording context; return the raw webm path."""
    browser = pw.chromium.launch(channel="chromium", headless=True)
    ctx = browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=1,
                              record_video_dir=str(RAW), record_video_size={"width": W, "height": H},
                              color_scheme="dark")
    ctx.add_init_script(CURSOR_JS)
    page = ctx.new_page()
    page.set_default_timeout(60_000)
    t0 = time.time()
    try:
        page.mouse.move(1180, 620)  # park the cursor mid-frame instead of the top-left corner
        fn(page)
        hold(page, t0, scene)
    finally:
        video = page.video
        ctx.close()
        browser.close()
    src = Path(video.path())
    dst = RAW / f"scene_{scene}.webm"
    if dst.exists():
        dst.unlink()
    src.rename(dst)
    print(f"  scene {scene}: {time.time() - t0:.0f}s -> {dst.name}", flush=True)
    return dst


def to_mp4(src: Path) -> Path:
    dst = CAP / (src.stem + ".mp4")
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", str(src), "-r", "30",
                    "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p",
                    "-vf", f"scale={W}:{H}:flags=lanczos,format=yuv420p", "-an", str(dst)], check=True)
    return dst


def duration(path: Path) -> float:
    out = subprocess.run([FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, check=True).stdout.strip()
    return float(out)


def main():
    interview_id = os.environ.get("APP_RECORD")
    engagement_id = os.environ.get("APP_PARENT")
    if not (interview_id and engagement_id):
        interview_id, engagement_id = ids_from_db()
    print(f"interview {interview_id}\nengagement {engagement_id}", flush=True)
    only = set(sys.argv[1:])
    RAW.mkdir(parents=True, exist_ok=True)

    # ---- scenes ----
    def s02_join(page):
        # paced to the 21 s VO: fields land as they are named, tracks hold while the three are described, submit on "press start"
        t0 = time.time()

        def at(t):
            rem = t - (time.time() - t0)
            if rem > 0:
                page.wait_for_timeout(int(rem * 1000))

        def glide_to(sel):
            box = page.locator(sel).bounding_box()
            if box:
                glide(page, int(box["x"] + 24), int(box["y"] + box["height"] / 2))

        page.goto(f"{BASE}/join")
        at(2.6)
        glide_to("input[name=respondent_name]")
        at(3.6)
        page.click("input[name=respondent_name]")
        page.type("input[name=respondent_name]", "AP Lead (role-play)", delay=60)
        at(5.6)
        page.click("input[name=respondent_role]")
        page.type("input[name=respondent_role]", "Accounts Payable Lead", delay=55)
        at(7.6)
        page.click("input[name=respondent_department]")
        page.type("input[name=respondent_department]", "Finance", delay=60)
        at(9.0)
        glide_to("select[name=track]")
        page.select_option("select[name=track]", "roleplay")
        at(17.0)
        glide_to("input[name=business_unit]")
        page.click("input[name=business_unit]")
        page.type("input[name=business_unit]", "Accounts payable", delay=55)
        at(19.0)
        page.select_option("select[name=org_size_band]", "250-2000")
        at(20.0)
        glide_to("button.btn-primary")
        at(21.1)
        with page.expect_navigation():
            page.locator("button.btn-primary").click()
        page.wait_for_timeout(2500)
        s02_join.url = page.url

    def s03_interview(page):
        page.goto(getattr(s02_join, "url", f"{BASE}/join"))
        page.wait_for_timeout(3500)
        begin = page.locator("button", has_text="Begin").first
        box = begin.bounding_box()
        if box:
            glide(page, int(box["x"] + box["width"] / 2), int(box["y"] + box["height"] / 2))
        page.wait_for_timeout(600)
        begin.click()
        page.locator(".msg-assistant").first.wait_for(timeout=180_000)
        page.wait_for_timeout(4500)
        ta = page.locator("#composer textarea, #composer input[name=message]").first
        ta.click()
        page.type("#composer textarea, #composer input[name=message]", AP_ANSWER, delay=18)
        page.wait_for_timeout(900)
        send = page.locator("#composer button[type=submit], #composer button.btn-primary").first
        box = send.bounding_box()
        if box:
            glide(page, int(box["x"] + box["width"] / 2), int(box["y"] + box["height"] / 2))
        send.click()
        page.locator(".msg-assistant").nth(1).wait_for(timeout=180_000)
        page.wait_for_timeout(1500)
        smooth_scroll(page, 4000, 1.5)
        page.wait_for_timeout(5000)

    def s04_boundary(page):
        # mint a fresh link off camera so the scene opens directly on the intro card
        import httpx
        with httpx.Client(base_url=BASE, follow_redirects=False, timeout=30) as h:
            eng = re.search(r'name="engagement_id" value="([^"]+)"', h.get("/join").text).group(1)
            r = h.post("/join", data={"engagement_id": eng, "respondent_name": "Reviewer (role-play)",
                                      "respondent_role": "Controller", "respondent_department": "Finance",
                                      "track": "roleplay", "business_unit": "General ledger and close",
                                      "org_size_band": "250-2000"})
            url = BASE + r.headers["location"]
        page.goto(url)
        page.wait_for_timeout(2500)
        glide(page, 700, 330, steps=36)
        page.wait_for_timeout(2500)
        glide(page, 700, 395, steps=24)

    def s05_detail_jobs(page):
        page.goto(f"{BASE}/interviews/{interview_id}")
        page.wait_for_timeout(2500)
        smooth_scroll(page, 700, 2.2)
        smooth_scroll(page, 1500, 2.2)
        scroll_to(page, "text=Pain points", 2.4)
        smooth_scroll(page, page.evaluate("window.scrollY") + 600, 2.4)
        scroll_to(page, "text=Topic coverage", 3.0)
        page.goto(f"{BASE}/jobs")
        page.wait_for_timeout(3000)
        glide(page, 900, 420)
        smooth_scroll(page, 500, 2.0)

    def s06_engagement_brief(page):
        page.goto(f"{BASE}/engagements/{engagement_id}")
        page.wait_for_timeout(2500)
        glide(page, 700, 500)
        smooth_scroll(page, 600, 2.4)
        scroll_to(page, "text=Generate ranking", 2.0, "center")
        page.wait_for_timeout(1200)
        page.goto(f"{BASE}/engagements/{engagement_id}/brief")
        page.wait_for_timeout(3000)
        smooth_scroll(page, 450, 2.4)
        smooth_scroll(page, 1000, 2.4)
        smooth_scroll(page, 1600, 2.4)
        smooth_scroll(page, 2200, 2.4)

    def s07_systems(page):
        page.goto(f"{BASE}/engagements/{engagement_id}/brief")
        page.wait_for_timeout(1800)
        if not scroll_to(page, "text=Systems inventory", 2.4):
            scroll_to(page, "text=systems", 2.4)
        page.wait_for_timeout(1500)
        smooth_scroll(page, page.evaluate("window.scrollY") + 500, 2.4)
        smooth_scroll(page, page.evaluate("window.scrollY") + 500, 2.4)

    def s08_admin(page):
        page.goto(f"{BASE}/admin")
        page.wait_for_timeout(2500)
        smooth_scroll(page, 700, 2.2)
        smooth_scroll(page, 1500, 2.2)
        smooth_scroll(page, 2400, 2.2)
        page.goto(f"{BASE}/admin/audit")
        page.wait_for_timeout(3200)
        smooth_scroll(page, 500, 2.0)
        page.goto(f"{BASE}/admin/retention")
        page.wait_for_timeout(3500)

    def s09_architecture(page):
        page.goto(f"{BASE}/architecture")
        page.wait_for_timeout(2500)
        smooth_scroll(page, 500, 2.4)
        smooth_scroll(page, 1100, 2.4)
        smooth_scroll(page, 1800, 2.4)

    scenes = [("02", s02_join), ("03", s03_interview), ("04", s04_boundary), ("05", s05_detail_jobs),
              ("06", s06_engagement_brief), ("07", s07_systems), ("08", s08_admin), ("09", s09_architecture)]

    results = {}
    with sync_playwright() as pw:
        for scene, fn in scenes:
            if only and scene not in only:
                continue
            print(f"recording scene {scene}", flush=True)
            raw = record(pw, scene, fn)
            mp4 = to_mp4(raw)
            results[scene] = {"clip": str(mp4), "duration": round(duration(mp4), 2)}
            print(f"  -> {mp4.name} {results[scene]['duration']}s", flush=True)

    manifest = CAP / "clips.json"
    existing = json.loads(manifest.read_text()) if manifest.exists() else {}
    existing.update(results)
    manifest.write_text(json.dumps(existing, indent=2))
    print(f"wrote {manifest}", flush=True)


if __name__ == "__main__":
    main()
