"""Record one clip per admin-walkthrough scene from the local app with Playwright.

Each scene gets its own browser context so Playwright writes one .webm per
scene; ffmpeg then turns each into an H.264 .mp4 that After Effects imports.
A fake cursor is injected so clicks and typing read on camera. Beats are
fractions of the scene's VO duration (read from vo/manifest.json), so the
on-screen action lands on the words that name it.

IN: running app at BASE, vo/manifest.json. Scene ids on argv limit the run.
OUT: captures/scene_NN.mp4 and captures/clips.json with measured durations.
"""
import json
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = os.environ.get("APP_BASE", "http://127.0.0.1:8000")
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
CAP = ROOT / "captures"
RAW = CAP / "raw"
FFMPEG = os.environ.get("FFMPEG", "ffmpeg")
FFPROBE = os.environ.get("FFPROBE", "ffprobe")
W, H = 1920, 1080
VO_LEAD, TAIL = 0.6, 3.0  # VO starts 0.6 s into the scene in the comp; hold 3 s past its end

VO = {s["id"]: s["duration"] for s in json.loads((ROOT / "vo" / "manifest.json").read_text(encoding="utf-8"))["scenes"]}

# localStorage keys the app reads at boot: first-run tours, welcome banners, "get started" cards.
# Find them in the app's onboarding code; a tour that dims the page ruins every scene.
PRESEED = {}  # e.g. {"app_tips_enabled": "0", "app_welcome_dismissed": "1"}
# elements to hide outright when no localStorage key controls them
HIDE_CSS = ""  # e.g. "#welcome-banner{display:none !important}"

INIT_JS = """
(() => {
  try {
    const seed = __PRESEED__;
    for (const k in seed) localStorage.setItem(k, seed[k]);
  } catch (e) {}
  const css = __HIDE_CSS__;
  if (css) {
    const style = document.createElement('style');
    style.textContent = css;
    const addStyle = () => document.head && document.head.appendChild(style);
    document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', addStyle) : addStyle();
  }
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


class Scene:
    """Timing helpers bound to one recording: beats as fractions of the VO."""

    def __init__(self, page, sid: str):
        self.page, self.t0, self.vo = page, time.time(), VO[sid]

    def at(self, frac: float):
        t = VO_LEAD + frac * self.vo
        rem = t - (time.time() - self.t0)
        if rem > 0:
            self.page.wait_for_timeout(int(rem * 1000))

    def glide(self, x: int, y: int, steps: int = 28):
        self.page.mouse.move(x, y, steps=steps)
        self.page.wait_for_timeout(250)

    def glide_to(self, sel: str, dx: int = 24):
        loc = self.page.locator(sel)
        if loc.count() == 0:
            return  # not on screen in this state: skip, never wait out a timeout on camera
        box = loc.first.bounding_box()
        if box:
            self.glide(int(box["x"] + min(dx, box["width"] / 2)), int(box["y"] + box["height"] / 2))

    def scroll_to(self, sel: str, wait: float = 1.4, block: str = "start"):
        loc = self.page.locator(sel).first
        if loc.count():
            loc.evaluate("(el, b) => el.scrollIntoView({behavior: 'smooth', block: b})", block)
            self.page.wait_for_timeout(int(wait * 1000))

    def wheel_in(self, sel: str, dy: int, wait: float = 1.2):
        self.glide_to(sel, dx=400)
        self.page.mouse.wheel(0, dy)
        self.page.wait_for_timeout(int(wait * 1000))

    def click(self, sel: str):
        self.glide_to(sel)
        loc = self.page.locator(sel)
        if loc.count():
            loc.first.click()

    def hold_min(self):
        rem = VO_LEAD + self.vo + TAIL - (time.time() - self.t0)
        if rem > 0:
            self.page.wait_for_timeout(int(rem * 1000))


def record(pw, sid: str, fn):
    browser = pw.chromium.launch(channel="chromium", headless=True)
    ctx = browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=1,
                              record_video_dir=str(RAW), record_video_size={"width": W, "height": H},
                              color_scheme="dark")
    ctx.add_init_script(INIT_JS.replace("__PRESEED__", json.dumps(PRESEED)).replace("__HIDE_CSS__", json.dumps(HIDE_CSS)))
    page = ctx.new_page()
    page.set_default_timeout(60_000)
    page.mouse.move(1180, 620)
    sc = Scene(page, sid)
    try:
        reset_server_state(page)
        fn(sc)
        sc.hold_min()
    finally:
        video = page.video
        ctx.close()
        browser.close()
    src = Path(video.path())
    dst = RAW / f"scene_{sid}.webm"
    if dst.exists():
        dst.unlink()
    src.rename(dst)
    print(f"  scene {sid}: {time.time() - sc.t0:.0f}s -> {dst.name}", flush=True)
    return dst


def to_mp4(src: Path) -> Path:
    dst = CAP / (src.stem + ".mp4")
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", str(src), "-r", "30",
                    "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p",
                    "-vf", "scale=1920:1080:flags=lanczos", "-an", str(dst)], check=True)
    return dst


def compress_middle(src: Path, dst: Path, start: float, end: float, target: float,
                    head: float = 6.0, tail: float = 14.0) -> Path:
    """Cut [start, end) of src into dst, time-compressing the middle so the clip lasts `target` seconds.

    The first `head` and last `tail` seconds stay real time, so the click that starts a long
    operation and the result that ends it read naturally; only the waiting in between speeds up.
    Used when a scene films a deploy or a job whose wall clock outruns its narration.
    """
    total = end - start
    if total <= target + 1:
        subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-ss", f"{start:.2f}", "-to", f"{end:.2f}", "-i", str(src),
                        "-r", "30", "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p",
                        "-vf", "scale=1920:1080:flags=lanczos", "-an", str(dst)], check=True)
        return dst
    mid_src = total - head - tail
    mid_dst = max(target - head - tail, 4.0)
    factor = mid_dst / mid_src
    fc = (f"[0:v]trim=start={start:.2f}:end={start + head:.2f},setpts=PTS-STARTPTS[a];"
          f"[0:v]trim=start={start + head:.2f}:end={start + head + mid_src:.2f},setpts=(PTS-STARTPTS)*{factor:.5f}[b];"
          f"[0:v]trim=start={start + head + mid_src:.2f}:end={end:.2f},setpts=PTS-STARTPTS[c];"
          f"[a][b][c]concat=n=3:v=1:a=0,fps=30,scale=1920:1080:flags=lanczos[v]")
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", str(src), "-filter_complex", fc, "-map", "[v]",
                    "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-an", str(dst)], check=True)
    return dst


def duration(path: Path) -> float:
    out = subprocess.run([FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, check=True).stdout.strip()
    return float(out)


H2 = "h2:has-text('{}')"


def reset_server_state(page):
    """Undo anything an earlier scene changed on the SERVER (active tenant, selected instance, a toggled flag).

    A fresh browser context resets the client, not the backend; a scene that switches
    the selected instance on camera leaves every later scene filming the wrong one.
    Put the API call that restores the filming state here, e.g.
    page.request.post(f"{BASE}/api/instances/{MAIN_INSTANCE}/activate").
    """
    return


def view(sc, route: str, wait: float = 2.6):
    """Open a view with a fresh page load.

    Hash-routed SPAs often read location.hash at init only, so navigating by clicking
    the sidebar (or setting the hash on an open page) does nothing; a new goto works.
    """
    sc.page.goto(f"{BASE}/#{route}")
    sc.page.wait_for_timeout(int(wait * 1000))


# ---- scenes ----

def s02_map(sc):
    sc.page.goto(f"{BASE}/admin"); sc.page.wait_for_timeout(1200)
    sc.at(0.08); sc.glide(700, 330)
    sc.at(0.40); sc.scroll_to("p.muted.small:has(a[href='/admin/coverage'])", block="center")
    sc.at(0.48); sc.glide_to("a[href='/admin/coverage']")
    sc.at(0.56); sc.glide_to("a[href='/admin/review']")
    sc.at(0.62); sc.glide_to("a[href='/admin/review/outcomes']")
    sc.at(0.68); sc.glide_to("a[href='/admin/retention']")
    sc.at(0.74); sc.glide_to("a[href='/admin/audit']")
    sc.at(0.86); sc.scroll_to(H2.format("New interview link"), block="start")


def s03_mint(sc):
    p = sc.page
    p.goto(f"{BASE}/admin"); p.wait_for_timeout(800)
    sc.scroll_to(H2.format("New interview link"))
    sc.at(0.18); sc.click("input[name=respondent_name]"); p.type("input[name=respondent_name]", "Jordan Lee", delay=65)
    sc.at(0.27); sc.click("input[name=respondent_role]"); p.type("input[name=respondent_role]", "Controller", delay=60)
    sc.at(0.34); sc.click("input[name=respondent_department]"); p.type("input[name=respondent_department]", "Finance", delay=60)
    sc.at(0.41); sc.glide_to("form[action='/admin/tokens'] select[name=track]"); p.select_option("form[action='/admin/tokens'] select[name=track]", "roleplay")
    sc.at(0.47); sc.click("input[name=business_unit]"); p.type("input[name=business_unit]", "General ledger and close", delay=55)
    p.select_option("form[action='/admin/tokens'] select[name=org_size_band]", "250-2000")
    sc.at(0.55); sc.glide_to("form[action='/admin/tokens'] button")
    sc.at(0.58)
    with p.expect_navigation():
        p.locator("form[action='/admin/tokens'] button").click()
    p.wait_for_timeout(600)
    sc.at(0.70); sc.glide_to("code", dx=120)


def s04_models(sc):
    p = sc.page
    p.goto(f"{BASE}/admin"); p.wait_for_timeout(800)
    sc.scroll_to(H2.format("Models per engagement"))
    sc.at(0.12); sc.glide_to("select[name=interview_model]")
    sc.at(0.22); sc.glide_to("select[name=extraction_model]")
    sc.at(0.60); p.select_option("select[name=extraction_model]", "deepseek/deepseek-v4.1-flash")
    sc.at(0.68); sc.glide_to("form[action$='/models'] button")
    sc.at(0.72)
    with p.expect_navigation():
        p.locator("form[action$='/models'] button").click()
    p.wait_for_timeout(900)
    sc.scroll_to(H2.format("Models per engagement"))
    sc.glide_to("select[name=extraction_model]")


def s05_caps(sc):
    p = sc.page
    p.goto(f"{BASE}/admin"); p.wait_for_timeout(800)
    sc.scroll_to(H2.format("Spend caps per engagement"))
    sc.at(0.12); sc.glide_to("input[name=spend_cap_usd]")
    sc.at(0.26); sc.glide_to("input[name=turn_cap_per_token]")
    sc.at(0.40); sc.glide_to("input[name=spend_cap_usd]")
    sc.at(0.58); sc.glide_to("section:has(h2:has-text('Spend caps')) .muted, section:has(h2:has-text('Spend caps')) p", dx=200)
    sc.at(0.80); sc.click("input[name=spend_cap_usd]"); p.fill("input[name=spend_cap_usd]", ""); p.type("input[name=spend_cap_usd]", "40", delay=90)
    sc.at(0.90); sc.glide_to("form[action$='/caps'] button")
    with p.expect_navigation():
        p.locator("form[action$='/caps'] button").click()
    p.wait_for_timeout(800)
    sc.scroll_to(H2.format("Spend caps per engagement"))


def s06_prompt(sc):
    p = sc.page
    p.goto(f"{BASE}/admin"); p.wait_for_timeout(800)
    sc.scroll_to(H2.format("Interviewer prompt"))
    sc.at(0.10); sc.wheel_in("form[action='/admin/prompts'] textarea", 300, wait=1.0)
    sc.at(0.30); sc.scroll_to(H2.format("Interviewer prompt")); sc.glide_to("section:has(h2:has-text('Interviewer prompt')) table tbody tr:nth-child(1) td:nth-child(1)")
    sc.at(0.45); sc.glide_to("section:has(h2:has-text('Interviewer prompt')) table tbody tr:nth-child(2) td:nth-child(1)")
    sc.at(0.55); sc.glide_to("section:has(h2:has-text('Interviewer prompt')) form[action*='/activate'] button")
    sc.at(0.60)
    with p.expect_navigation():
        p.locator("section:has(h2:has-text('Interviewer prompt')) form[action*='/activate'] button").first.click()
    p.wait_for_timeout(800)
    sc.scroll_to(H2.format("Interviewer prompt"))
    sc.glide_to("section:has(h2:has-text('Interviewer prompt')) table tbody tr:nth-child(2) td:nth-child(3)")


def s07_question_set(sc):
    p = sc.page
    p.goto(f"{BASE}/admin"); p.wait_for_timeout(800)
    sc.scroll_to(H2.format("Question set"))
    sc.at(0.12); sc.wheel_in("form[action='/admin/question-set'] textarea", 420, wait=1.4)
    sc.at(0.32); p.mouse.wheel(0, 420); p.wait_for_timeout(1000)
    sc.at(0.46); sc.glide_to("form[action='/admin/question-set'] button")
    sc.at(0.50)
    with p.expect_navigation():
        p.locator("form[action='/admin/question-set'] button").click()
    p.wait_for_timeout(600)
    sc.glide(700, 250)
    sc.at(0.72); sc.scroll_to(H2.format("Question set"))


def s08_profile(sc):
    p = sc.page
    p.goto(f"{BASE}/admin"); p.wait_for_timeout(800)
    sc.scroll_to(H2.format("Platform profile"))
    sc.at(0.10); sc.wheel_in("form[action='/admin/platform-profile'] textarea", 420, wait=1.4)
    sc.at(0.32); p.mouse.wheel(0, 480); p.wait_for_timeout(1000)
    sc.at(0.55); p.mouse.wheel(0, 480); p.wait_for_timeout(1000)
    sc.at(0.72); sc.glide_to("form[action='/admin/platform-profile'] button")
    sc.at(0.76)
    with p.expect_navigation():
        p.locator("form[action='/admin/platform-profile'] button").click()
    p.wait_for_timeout(600)
    sc.glide(700, 250)


def s09_history(sc):
    p = sc.page
    p.goto(f"{BASE}/admin/instrument/question_set"); p.wait_for_timeout(1000)
    sc.at(0.14); sc.glide_to("table.table tbody tr:nth-child(1) td:nth-child(1)")
    sc.at(0.24); sc.glide_to("table.table tbody tr:nth-child(1) td:nth-child(3)")
    sc.at(0.42); sc.click("a[href='/admin/instrument/question_set?v=1']")
    p.wait_for_timeout(800)
    sc.at(0.50); sc.scroll_to("pre.diff", block="start"); sc.glide(760, 600)
    sc.at(0.74); sc.scroll_to("table.table"); sc.glide_to("form[action$='/1/restore'] button")
    sc.at(0.80)
    with p.expect_navigation():
        p.locator("form[action$='/1/restore'] button").click()
    p.wait_for_timeout(800)
    sc.glide_to("table.table tbody tr:nth-child(1) td:nth-child(1)")


def s10_coverage(sc):
    p = sc.page
    p.goto(f"{BASE}/admin/coverage"); p.wait_for_timeout(1000)
    sc.at(0.10); sc.glide_to("table thead th:nth-child(3)")
    sc.at(0.22); sc.glide_to("table thead th:nth-child(6)")
    sc.at(0.32); sc.glide_to("table thead th:nth-child(8)")
    sc.at(0.42); sc.glide_to("table thead th:nth-child(11)")
    sc.at(0.56); sc.glide_to("a[href='/admin/coverage.csv']")
    sc.at(0.78); sc.glide_to("table tbody tr:nth-child(1) td:nth-child(3)")


def s11_review(sc):
    p = sc.page
    p.goto(f"{BASE}/admin/review"); p.wait_for_timeout(1000)
    sc.at(0.10); sc.glide(760, 420)
    sc.at(0.40); sc.glide(760, 560)
    sc.at(0.62); p.goto(f"{BASE}/admin/review/outcomes"); p.wait_for_timeout(900)
    sc.at(0.72); sc.glide_to("table thead th:nth-child(1)")
    sc.at(0.82); sc.glide_to("table tbody tr:nth-child(1) td:nth-child(5)")
    sc.at(0.90); sc.glide_to("table tbody tr:nth-child(2) td:nth-child(5)")


def s12_retention(sc):
    p = sc.page
    p.goto(f"{BASE}/admin/retention"); p.wait_for_timeout(1000)
    sc.at(0.08); sc.glide(760, 330)
    sc.at(0.50); sc.glide_to(":text('Defaults:')", dx=200)
    sc.at(0.66); sc.glide_to(":text('Not enforced')", dx=200)
    sc.at(0.78); sc.glide_to("table", dx=300)


def s13_audit(sc):
    p = sc.page
    p.goto(f"{BASE}/admin/audit"); p.wait_for_timeout(1000)
    sc.at(0.08); sc.glide_to("table thead th:nth-child(2)")
    sc.at(0.20); sc.glide_to("select[name=action]")
    p.select_option("select[name=action]", "prompt.activate")
    sc.at(0.28); sc.click("form.audit-filters button")
    p.wait_for_timeout(900)
    sc.at(0.42); sc.glide_to("table tbody tr:nth-child(1) td:nth-child(2)")
    sc.at(0.66); sc.glide_to("table tbody tr:nth-child(1) td:nth-child(6)")
    sc.at(0.86); sc.glide(760, 300)


SCENES = [("02", s02_map), ("03", s03_mint), ("04", s04_models), ("05", s05_caps), ("06", s06_prompt),
          ("07", s07_question_set), ("08", s08_profile), ("09", s09_history), ("10", s10_coverage),
          ("11", s11_review), ("12", s12_retention), ("13", s13_audit)]


def main():
    only = set(sys.argv[1:])
    RAW.mkdir(parents=True, exist_ok=True)
    results = {}
    with sync_playwright() as pw:
        for sid, fn in SCENES:
            if only and sid not in only:
                continue
            print(f"recording scene {sid} (vo {VO[sid]}s)", flush=True)
            raw = record(pw, sid, fn)
            mp4 = to_mp4(raw)
            results[sid] = {"clip": str(mp4), "duration": round(duration(mp4), 2)}
            print(f"  -> {mp4.name} {results[sid]['duration']}s", flush=True)
            write_manifest(results)  # after every scene, so a crash mid-run loses nothing
    print(f"wrote {CAP / 'clips.json'}", flush=True)


def write_manifest(results: dict) -> None:
    manifest = CAP / "clips.json"
    existing = json.loads(manifest.read_text()) if manifest.exists() else {}
    existing.update(results)
    manifest.write_text(json.dumps(existing, indent=2))


if __name__ == "__main__":
    main()
