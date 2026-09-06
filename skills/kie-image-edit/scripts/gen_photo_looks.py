"""Kie.ai cinematic look pass on a photo: one source, several graded variants.

Same machinery as gen_banner_text.py but the edit is a color/light/weather grade
rather than a text swap, so the prompt names what to preserve structurally
(geometry, architecture, composition) instead of what to preserve pixel-wise.
Env: KIE_AI_API_KEY, IMAGE_HOST_TOKEN, optional SRC_URL / KIE_MODEL / KIE_ASPECT /
KIE_ONLY / KIE_TAG. No hardcoded secrets.
"""
import json
import os
import struct
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

SRC = Path(os.environ.get("SRC", "photo.jpg"))
OUTDIR = Path(os.environ.get("OUTDIR") or Path(__file__).resolve().parent / "photo-looks")
MODEL = os.environ.get("KIE_MODEL", "grok-imagine-image-2-0/image-edit")
TAG = os.environ.get("KIE_TAG", "").strip()

IMG_UPLOAD = os.environ.get("IMAGE_HOST_UPLOAD_URL", "")
IMG_DIR = os.environ.get("IMAGE_HOST_DIR", "generated")
CREATE_URL = "https://api.kie.ai/api/v1/jobs/createTask"
RECORD_URL = "https://api.kie.ai/api/v1/jobs/recordInfo"

PNG_MAGIC = bytes([0x89]) + b"PNG\r\n" + bytes([0x1A]) + b"\n"
SEEDREAM_RATIOS = {"1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"}

# The scene, restated so the model does not invent a different one. A grade prompt
# with no subject anchor drifts into a generic landscape.
SUBJECT = (
    "a wide river between forested mountains, with a ruined brick castle on a small "
    "island at the right, bare winter trees in the foreground, and the far shore "
    "receding into haze"
)

KEEP = (
    "Keep the exact same composition, camera position, framing and horizon line. Keep every "
    "structure exactly where it is and the same shape: the ruined castle and its towers, the "
    "stone building on the left shore, the shoreline, the islands, the mountain ridgelines, the "
    "foreground branches. Do not add, remove, move or redesign any building, boat or landmass. "
    "Do not add people. This is a color, light and atmosphere grade of a real photograph, not a "
    "reimagining."
)

LOOKS = {
    "golden_hour": (
        "Regrade to late golden hour just before sunset. Warm low sun raking in from the left, "
        "long soft shadows, amber and rose light on the castle brickwork and the mountain faces, "
        "the water carrying a warm specular glitter path. Deep but not crushed shadows in the "
        "foreground trees. Rich, film-like, natural."
    ),
    "blue_hour_storm": (
        "Regrade to blue hour under a breaking storm. Deep indigo and slate sky with heavy "
        "layered cloud, a single shaft of cold light falling on the castle, the water dark, "
        "glassy and desaturated. Moody, high contrast, cinematic, cold highlights against warm "
        "lamplight in the castle windows."
    ),
    "autumn_fog": (
        "Regrade to a still autumn morning with low fog on the water. Warm ochre, rust and "
        "amber foliage across the hillsides, soft diffused light, fog banks separating the "
        "foreground, midground island and background ridges into distinct depth layers. Muted, "
        "painterly, quiet."
    ),
    "anamorphic_dusk": (
        "Regrade as an anamorphic cinema still at dusk: teal shadows, warm amber highlights, "
        "gentle halation on the brightest speculars, subtle film grain, slight vignette, shallow "
        "falloff toward the edges. Moody prestige-drama color science."
    ),
    "winter_snow": (
        "Regrade to a cold overcast winter afternoon after snowfall. Snow on the mountain slopes, "
        "the shoreline and the castle roofline, bare trees rimed with frost, near-monochrome "
        "blue-grey palette with the castle brick as the only warm note. Crisp, still, austere."
    ),
}

PROMPT = (
    "This photograph shows {subject}. {look} {keep} "
    "Render sharp and high detail, with clean natural texture and no blur, no haze wash, no "
    "added text, no watermark, no border."
)

# A look pack swaps subject/keep/looks per shoot without forking this file.
# JSON: {"subject": "...", "keep": "...", "looks": {"slug": "..."}}; keep is optional.
_pack = os.environ.get("LOOK_PACK", "").strip()
if _pack:
    _d = json.loads(Path(_pack).read_text(encoding="utf-8"))
    SUBJECT = _d["subject"]
    KEEP = _d.get("keep", KEEP)
    LOOKS = _d["looks"]


def key() -> str:
    k = os.environ.get("KIE_AI_API_KEY") or os.environ.get("KIE_API_KEY") or ""
    if not k:
        sys.exit("KIE_AI_API_KEY not set")
    return k


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
    """Upload the source to the image server; returns the url it hands back."""
    if not IMG_UPLOAD:
        sys.exit("set IMAGE_HOST_UPLOAD_URL, or pass SRC_URL for an already-hosted source")
    tok = os.environ.get("IMAGE_HOST_TOKEN") or ""
    if not tok:
        sys.exit("IMAGE_HOST_TOKEN not set")
    name = f"photo-src-{int(time.time())}{SRC.suffix}"
    req = urllib.request.Request(IMG_UPLOAD, data=SRC.read_bytes(), method="POST")
    req.add_header("Authorization", f"Bearer {tok}")
    req.add_header("Content-Type", "application/octet-stream")
    req.add_header("X-Filename", name)
    req.add_header("X-Directory", IMG_DIR)
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            body = r.read().decode()
    except urllib.error.HTTPError as e:
        sys.exit(f"upload HTTP {e.code}\n{e.read().decode(errors='replace')}")
    print(f"upload response: {body}")
    url = (json.loads(body) or {}).get("url")
    if not url:
        sys.exit(f"upload returned no url: {body}")
    return url


def poll(task_id: str) -> str | None:
    for i in range(75):
        time.sleep(8)
        d = (call(f"{RECORD_URL}?taskId={task_id}").get("data") or {})
        state = d.get("state")
        print(f"  poll {i+1}: {state}")
        if state == "success":
            return (json.loads(d.get("resultJson") or "{}").get("resultUrls") or [None])[0]
        if state == "fail":
            print(f"  FAILED: {d.get('failMsg') or d.get('failCode')}")
            return None
    print(f"  timed out; taskId {task_id}")
    return None


def main() -> None:
    url = os.environ.get("SRC_URL", "").strip()
    if not url:
        if not SRC.exists():
            sys.exit(f"missing source: {SRC}")
        url = host_source()
    print(f"source: {url}")
    OUTDIR.mkdir(parents=True, exist_ok=True)

    only = {v.strip() for v in os.environ.get("KIE_ONLY", "").split(",") if v.strip()}
    size = size_params(MODEL)

    tasks = {}
    for slug, look in LOOKS.items():
        if only and slug not in only:
            continue
        payload = {
            "model": MODEL,
            "input": {
                "prompt": PROMPT.format(subject=SUBJECT, look=look, keep=KEEP),
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
        if not src:
            continue
        dl = urllib.request.Request(src, headers={"User-Agent": "kie-image-edit/1.0"})
        with urllib.request.urlopen(dl, timeout=300) as r:
            blob = r.read()
        name = f"{slug}{'_' + TAG if TAG else ''}"
        out = OUTDIR / f"{name}.{'png' if blob[:8] == PNG_MAGIC else 'jpg'}"
        out.write_bytes(blob)
        print(f"LOCAL: {out}  {dims(blob)}  {len(blob)//1024} KB")


if __name__ == "__main__":
    main()
