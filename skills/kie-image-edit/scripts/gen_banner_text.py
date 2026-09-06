"""Kie.ai text-only edit pass on a banner image.

Uploads the source to a host you control (Kie's own uploader 401s on a stale
IP whitelist), then runs one edit task per headline variant.
Env: KIE_AI_API_KEY (KIE_API_KEY also accepted), IMAGE_HOST_TOKEN,
optional SRC_URL / KIE_MODEL / KIE_ASPECT / KIE_ONLY. No hardcoded secrets.
"""
import json
import os
import struct
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

SRC = Path(os.environ.get("SRC", "banner.jpg"))
OUTDIR = Path(__file__).resolve().parent / "banner"
# Benched 2026-09-06 (see bench_models.py). grok wins on aspect + sharpness:
# native 4:1 at 2816x704 vs nano-banana-edit's softer 2048x512. seedream is
# sharper still but has no "auto" and reframes to 21:9.
MODEL = os.environ.get("KIE_MODEL", "grok-imagine-image-2-0/image-edit")

IMG_UPLOAD = os.environ.get("IMAGE_HOST_UPLOAD_URL", "")
IMG_DIR = os.environ.get("IMAGE_HOST_DIR", "generated")
CREATE_URL = "https://api.kie.ai/api/v1/jobs/createTask"
RECORD_URL = "https://api.kie.ai/api/v1/jobs/recordInfo"

VARIANTS = {
    "v1_automate_the_enterprise": "Automate The Enterprise",
    "v2_automating_enterprise": "Automating Enterprise",
    "v3_automating_the_enterprise": "Automating the Enterprise",
}

PROMPT = (
    "Edit this wide banner image. Replace only the words 'Automate without limits' with "
    "'{text}'. Keep every other pixel unchanged: same background, same glow, same lightning "
    "bolt artwork, same n8n logo in the same place. Same font, size, color gradient and "
    "position for the headline. Output the full original wide banner, do not crop, do not "
    "letterbox, do not change the aspect ratio. Render at maximum sharpness with crisp "
    "anti-aliased letterforms and no blur. "
    # Letter-by-letter spellout: the model dropped a letter ('Enteprise') without it.
    "Spell the headline exactly, letter by letter: {spelled}. Proofread the rendered text "
    "before finishing; every letter must be present and in order."
)

PNG_MAGIC = bytes([0x89]) + b"PNG\r\n" + bytes([0x1A]) + b"\n"

# Probed 2026-09-06. The size key and its accepted values differ per model, and
# seedream has no "auto": it must be given a real ratio plus quality, so
# KIE_ASPECT is required when running it. See references/models.md.
SEEDREAM_RATIOS = {"1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"}


def size_params(model: str) -> dict:
    """Per-model size fields. Wrong key or a bare 'auto' is a paid failed task."""
    ar = os.environ.get("KIE_ASPECT", "").strip()
    if model.startswith("seedream/"):
        if ar not in SEEDREAM_RATIOS:
            sys.exit(f"seedream needs KIE_ASPECT from {sorted(SEEDREAM_RATIOS)}; got {ar or '(unset)'}")
        return {"aspect_ratio": ar, "quality": "high"}
    if model.startswith("grok"):
        return {"aspect_ratio": ar or "auto"}
    return {"image_size": ar or "auto"}


def dims(blob: bytes) -> str:
    """Width x height from a PNG or JPEG header. No Pillow dependency."""
    if blob[:8] == PNG_MAGIC:
        w, h = struct.unpack(">II", blob[16:24])
        return f"{w}x{h}"
    i = 2
    while i < len(blob) - 9:
        if blob[i] != 0xFF:
            i += 1
            continue
        if blob[i + 1] in (0xC0, 0xC1, 0xC2):
            h, w = struct.unpack(">HH", blob[i + 5:i + 9])
            return f"{w}x{h}"
        i += 2 + struct.unpack(">H", blob[i + 2:i + 4])[0]
    return "?"


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
        sys.exit(f"HTTP {e.code} from {url}\n{e.read().decode(errors='replace')}")


def host_source() -> str:
    """Upload the source to the image server; returns its public URL."""
    if not IMG_UPLOAD:
        sys.exit("set IMAGE_HOST_UPLOAD_URL, or pass SRC_URL for an already-hosted source")
    tok = os.environ.get("IMAGE_HOST_TOKEN") or ""
    if not tok:
        sys.exit("IMAGE_HOST_TOKEN not set")
    name = f"n8n-banner-src-{int(time.time())}{SRC.suffix}"
    req = urllib.request.Request(IMG_UPLOAD, data=SRC.read_bytes(), method="POST")
    req.add_header("Authorization", f"Bearer {tok}")
    req.add_header("Content-Type", "application/octet-stream")
    req.add_header("X-Filename", name)
    req.add_header("X-Directory", IMG_DIR)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            body = r.read().decode()
    except urllib.error.HTTPError as e:
        sys.exit(f"upload HTTP {e.code}\n{e.read().decode(errors='replace')}")
    print(f"upload response: {body}")
    url = (json.loads(body) or {}).get("url")
    if not url:
        sys.exit(f"upload returned no url: {body}")
    return url


def poll(task_id: str) -> str:
    for i in range(75):
        time.sleep(8)
        info = call(f"{RECORD_URL}?taskId={task_id}")
        d = info.get("data") or {}
        state = d.get("state")
        print(f"  poll {i+1}: {state}")
        if state == "success":
            res = json.loads(d.get("resultJson") or "{}")
            src = (res.get("resultUrls") or [None])[0]
            if not src:
                sys.exit(f"success without resultUrls:\n{json.dumps(info, indent=2)}")
            return src
        if state == "fail":
            sys.exit(f"task failed:\n{json.dumps(info, indent=2)}")
    sys.exit(f"timed out; taskId {task_id}")


def main() -> None:
    url = os.environ.get("SRC_URL", "").strip()
    if not url:
        if not SRC.exists():
            sys.exit(f"missing source: {SRC}")
        url = host_source()
    print(f"source: {url}")
    OUTDIR.mkdir(parents=True, exist_ok=True)

    # KIE_ONLY: comma-separated slugs, to re-roll a single bad variant.
    only = {v.strip() for v in os.environ.get("KIE_ONLY", "").split(",") if v.strip()}
    size = size_params(MODEL)

    tasks = {}
    for slug, text in VARIANTS.items():
        if only and slug not in only:
            continue
        payload = {
            "model": MODEL,
            "input": {
                "prompt": PROMPT.format(
                    text=text,
                    spelled=" ".join("-".join(w) for w in text.split()),
                ),
                "image_urls": [url],
                "output_format": "png",
                **size,
            },
        }
        created = call(CREATE_URL, payload)
        tid = (created.get("data") or {}).get("taskId")
        if created.get("code") != 200 or not tid:
            sys.exit(f"createTask failed for {slug}:\n{json.dumps(created, indent=2)}")
        print(f"{slug} -> taskId {tid}")
        tasks[slug] = tid

    for slug, tid in tasks.items():
        print(f"\nwaiting on {slug}")
        src = poll(tid)
        dl = urllib.request.Request(src, headers={"User-Agent": "kie-image-edit/1.0"})
        with urllib.request.urlopen(dl, timeout=180) as r:
            blob = r.read()
        # grok ignores output_format and returns JPEG; name the file by magic bytes.
        out = OUTDIR / f"{slug}.{'png' if blob[:8] == PNG_MAGIC else 'jpg'}"
        out.write_bytes(blob)
        # Output size is a per-model budget, not a request. Print it so a run that
        # did not actually gain resolution is visible without opening the file.
        print(f"LOCAL: {out}  {dims(blob)}")


if __name__ == "__main__":
    main()
