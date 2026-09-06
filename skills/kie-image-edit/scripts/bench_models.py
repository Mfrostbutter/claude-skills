"""Kie.ai edit-model bench: same source + same headline through several models.

Records model, params, task id, latency, output dimensions and file for side-by-side review.
Env: KIE_API_KEY / KIE_AI_API_KEY, SRC_URL. No hardcoded secrets.
"""
import json
import os
import struct
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

OUTDIR = Path(__file__).resolve().parent / "bench"
CREATE_URL = "https://api.kie.ai/api/v1/jobs/createTask"
RECORD_URL = "https://api.kie.ai/api/v1/jobs/recordInfo"

TEXT = os.environ.get("KIE_TEXT", "Automate The Enterprise")
SPELLED = " ".join("-".join(w) for w in TEXT.split())
PROMPT = (
    f"Edit this wide banner image. Replace only the words 'Automate without limits' with '{TEXT}'. "
    "Keep every other pixel unchanged: same background, same glow, same lightning bolt artwork, "
    "same n8n logo in the same place. Same font, size, color gradient and position for the "
    "headline. Output the full original wide banner, do not crop, do not letterbox, do not change "
    "the aspect ratio. Render at maximum sharpness with crisp anti-aliased letterforms and no "
    f"blur. Spell the headline exactly, letter by letter: {SPELLED}. Proofread the rendered text "
    "before finishing; every letter must be present and in order."
)

# Probed 2026-09-06. seedream rejects aspect_ratio "auto" and enforces a prompt minimum length;
# grok requires image_urls (plural) plus aspect_ratio and ignores unknown keys.
BENCH = [
    ("nano_banana_edit", "google/nano-banana-edit",
     {"output_format": "png", "image_size": "auto"}),
    ("seedream5_21x9_4k", "seedream/5-pro-image-to-image",
     {"output_format": "png", "aspect_ratio": "21:9", "quality": "high", "resolution": "4K"}),
    ("seedream5_21x9_2k", "seedream/5-pro-image-to-image",
     {"output_format": "png", "aspect_ratio": "21:9", "quality": "high", "resolution": "2K"}),
    ("grok_imagine2_edit", "grok-imagine-image-2-0/image-edit",
     {"output_format": "png", "aspect_ratio": "auto"}),
]


def key() -> str:
    k = os.environ.get("KIE_API_KEY") or os.environ.get("KIE_AI_API_KEY") or ""
    if not k:
        sys.exit("KIE_API_KEY not set")
    return k


def call(url: str, payload: dict | None = None) -> dict:
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(url, data=data, method="POST" if data else "GET")
    req.add_header("Authorization", f"Bearer {key()}")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "kie-image-edit/1.0")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return {"code": e.code, "msg": e.read().decode(errors="replace")}


def dims(path: Path) -> str:
    """Width x height from a PNG or JPEG header, without Pillow."""
    d = path.read_bytes()
    if d[:8] == b"\x89PNG\r\n\x1a\n":
        w, h = struct.unpack(">II", d[16:24])
        return f"{w}x{h}"
    i = 2
    while i < len(d) - 9:
        if d[i] != 0xFF:
            i += 1
            continue
        if d[i + 1] in (0xC0, 0xC1, 0xC2):
            h, w = struct.unpack(">HH", d[i + 5:i + 9])
            return f"{w}x{h}"
        i += 2 + struct.unpack(">H", d[i + 2:i + 4])[0]
    return "?"


def main() -> None:
    url = os.environ.get("SRC_URL", "").strip()
    if not url:
        sys.exit("SRC_URL not set (upload the source first)")
    OUTDIR.mkdir(parents=True, exist_ok=True)

    started, rows = {}, []
    for slug, model, extra in BENCH:
        payload = {"model": model, "input": {"prompt": PROMPT, "image_urls": [url], **extra}}
        created = call(CREATE_URL, payload)
        tid = (created.get("data") or {}).get("taskId")
        if created.get("code") != 200 or not tid:
            rows.append((slug, model, extra, "CREATE FAILED", created.get("msg"), "-", "-"))
            print(f"{slug}: create failed - {created.get('msg')}")
            continue
        started[slug] = (model, extra, tid, time.time())
        print(f"{slug}: taskId {tid}")

    for slug, (model, extra, tid, t0) in started.items():
        state, src = "timeout", None
        for _ in range(75):
            time.sleep(8)
            d = (call(f"{RECORD_URL}?taskId={tid}").get("data") or {})
            state = d.get("state") or "?"
            if state == "success":
                src = (json.loads(d.get("resultJson") or "{}").get("resultUrls") or [None])[0]
                break
            if state == "fail":
                print(f"{slug}: FAILED {d.get('failMsg') or d.get('failCode')}")
                break
        secs = round(time.time() - t0)
        if not src:
            rows.append((slug, model, extra, state, "-", "-", f"{secs}s"))
            continue
        dl = urllib.request.Request(src, headers={"User-Agent": "kie-image-edit/1.0"})
        with urllib.request.urlopen(dl, timeout=180) as r:
            blob = r.read()
        # grok ignores output_format and returns JPEG; name the file by magic bytes.
        png = bytes([0x89]) + b"PNG\r\n" + bytes([0x1A]) + b"\n"
        out = OUTDIR / f"{slug}.{'png' if blob[:8] == png else 'jpg'}"
        out.write_bytes(blob)
        rows.append((slug, model, extra, "success", dims(out),
                     f"{out.stat().st_size // 1024} KB", f"{secs}s"))
        print(f"{slug}: {dims(out)}  {out}")

    print("\n| variant | model | params | state | dims | size | latency |")
    print("|---|---|---|---|---|---|---|")
    for slug, model, extra, state, d, sz, secs in rows:
        p = ", ".join(f"{k}={v}" for k, v in extra.items() if k != "output_format")
        print(f"| {slug} | `{model}` | {p} | {state} | {d} | {sz} | {secs} |")


if __name__ == "__main__":
    main()
