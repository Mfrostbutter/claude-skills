"""Kie.ai portrait edit pass: one source, several graded / set / retouch variants.

Differs from gen_photo_looks.py in one way that matters: a portrait needs an
IDENTITY lock in the keeps, or the model quietly redraws the face into a
generic one. Everything else is the same subject + look + keep structure.
Env: KIE_AI_API_KEY, IMAGE_HOST_TOKEN, optional SRC_URL / KIE_MODEL / KIE_ASPECT /
KIE_ONLY / KIE_TAG / KIE_NSFW. No hardcoded secrets.
"""
import json
import os
import struct
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

SRC = Path(os.environ.get("SRC", "portrait.jpg"))
OUTDIR = Path(__file__).resolve().parent / "portrait-looks"
MODEL = os.environ.get("KIE_MODEL", "grok-imagine-image-2-0/image-edit")
TAG = os.environ.get("KIE_TAG", "").strip()

IMG_UPLOAD = os.environ.get("IMAGE_HOST_UPLOAD_URL", "")
IMG_DIR = os.environ.get("IMAGE_HOST_DIR", "generated")
CREATE_URL = "https://api.kie.ai/api/v1/jobs/createTask"
RECORD_URL = "https://api.kie.ai/api/v1/jobs/recordInfo"

PNG_MAGIC = bytes([0x89]) + b"PNG\r\n" + bytes([0x1A]) + b"\n"
SEEDREAM_RATIOS = {"1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"}

SUBJECT = (
    "an available-light interior portrait in an attic room: a dark-haired woman in a black lace "
    "slip sits on the edge of a wooden bench-bed, leaning forward with her hands on her knee, "
    "looking off to the right of frame. A hanging lantern glows at the top of the frame, a palm "
    "frond crosses the left foreground out of focus, a patterned rug lies on dark wood flooring, "
    "and an upholstered chair back is soft in the bottom-left corner"
)

# The identity lock. Without this the face drifts into a generic model within one pass.
IDENTITY = (
    "Keep the same woman: her exact face, facial structure, eyes, nose, mouth, jawline, "
    "expression and gaze direction, her hair colour, length and how it falls, her skin tone, and "
    "her body proportions. Keep the same pose, the same hands and their placement, the same bare "
    "feet, and the same black lace slip and necklace exactly as worn. She must be immediately "
    "recognisable as the same person in the same moment. Do not slim, reshape, age or beautify "
    "her, do not change the neckline or coverage of the garment, and do not add or remove people."
)

# Expression edits need the identity lock minus the expression clause, or the two fight
# and the model splits the difference into a smirk.
IDENTITY_FREE_EXPRESSION = (
    "Keep the same woman: her exact face, facial structure, eyes, nose, mouth, jawline and gaze "
    "direction, her hair colour, length and how it falls, her skin tone, and her body proportions. "
    "Keep the same pose, the same hands and their placement, the same bare feet, and the same "
    "black lace slip and necklace exactly as worn. She must be immediately recognisable as the "
    "same person in the same moment. Do not slim, reshape, age or beautify her, do not change the "
    "neckline or coverage of the garment, and do not add or remove people."
)

KEEP = (
    "Keep the same composition, camera position, framing and focal length. Keep the room and its "
    "furniture where they are: the bench-bed, the hanging lantern, the rug, the wood floor, the "
    "foreground palm frond and the chair back in the bottom-left. This is a photographic edit of "
    "a real photograph, not a reimagining."
)

LOOKS = {
    "cine_warm_lamplight": (
        "grade", None,
        "Grade for warm practical lamplight. Let the hanging lantern read as the key: amber "
        "falloff across the wall and bedding, warm highlights on her shoulder and cheek, deep "
        "chocolate shadows with retained detail. Slight halation on the lantern flame, gentle "
        "filmic contrast, warm-neutral skin, no orange cast on the whites.",
    ),
    "cine_cold_window": (
        "grade", None,
        "Regrade as cool directional window light from the right, late blue hour outside. Cold "
        "steel-blue ambient on the walls and bedding, the lantern the only warm source, strong "
        "modelling on her face and legs, deep cyan-leaning shadows. Moody, restrained, editorial.",
    ),
    "bw_lowkey": (
        "grade", None,
        "Convert to a classic low-key black and white portrait. Deep blacks, luminous controlled "
        "highlights on skin, strong Rembrandt-style modelling from the lantern, rich midtone "
        "separation in the lace, fine silver-halide grain. Think large-format editorial "
        "monochrome, not a desaturated colour file.",
    ),
    "bw_editorial_grain": (
        "grade", None,
        "Convert to high-contrast reportage black and white on pushed 400-speed film: visible "
        "grain, slightly lifted blacks, bright specular highlights, softer shoulder in the "
        "highlights. Timeless, grainy, documentary rather than glossy.",
    ),
    "set_clean_foreground": (
        "set", "Remove the out-of-focus palm frond from the left foreground and the upholstered "
        "chair back from the bottom-left corner, rebuilding the room behind them plausibly so the "
        "bench, bedding, rug and floor continue naturally. Leave the lighting and grade as shot.",
        None,
    ),
    "set_candlelit_room": (
        "set", "Change the room's dressing to a candlelit period interior: replace the hanging "
        "lantern with a warmer oil lamp, add a few candles on the surface behind her, warm the "
        "plaster walls, and let the light sources motivate the exposure. Keep the bench, the "
        "bedding, the rug and the floor.",
        None,
    ),
    "smile_warm": (
        "expression", "Change only the shape of her mouth. Lift the corners into a soft, warm, "
        "relaxed smile with the lips lightly parted and a hint of her own teeth. Keep her lips "
        "their natural colour and shape and do not widen the mouth or open it into a laugh. "
        "Her skin must stay smooth: no nasolabial folds or laugh lines beside the nose and mouth, "
        "no crow's feet or creases at the outer corners of the eyes, no wrinkles under the eyes, "
        "no forehead lines, no squinting or narrowing of the eyes. The eyes stay open exactly as "
        "they are in the source. "
        "HER HEAD DOES NOT MOVE. She stays in the same three-quarter turn away from the camera, "
        "chin at the same height and angle, face turned to her left, looking past the right edge "
        "of the frame at something out of shot. She is NOT looking at the camera and NOT smiling "
        "at the viewer: she is smiling at whatever she is already looking at. Do not rotate, "
        "tilt or re-pose her head or neck by any amount, do not turn her face toward the lens, "
        "and do not redirect her eyes. Compare the head angle against the source and match it.",
        None,
    ),
    "retouch_natural": (
        "retouch", "Do a natural professional retouch only: even the skin tone while keeping "
        "visible pores and texture, reduce shine on the forehead and shoulder, tidy stray hairs, "
        "clean up sensor dust and minor wall marks, and balance the exposure between her lit and "
        "shadowed side. No skin smoothing that removes texture, no reshaping of any kind.",
        None,
    ),
}

GRADE_TMPL = (
    "This photograph shows {subject}. {look} {identity} {keep} "
    "Render sharp and high detail with natural skin texture, no blur, no plastic smoothing, "
    "no added text, no watermark, no border."
)
EDIT_TMPL = (
    "This photograph shows {subject}. {edit} {identity} {keep} "
    "Render sharp and high detail with natural skin texture, no blur, no plastic smoothing, "
    "no added text, no watermark, no border."
)


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
    if not IMG_UPLOAD:
        sys.exit("set IMAGE_HOST_UPLOAD_URL, or pass SRC_URL for an already-hosted source")
    tok = os.environ.get("IMAGE_HOST_TOKEN") or ""
    if not tok:
        sys.exit("IMAGE_HOST_TOKEN not set")
    name = f"portrait-src-{int(time.time())}{SRC.suffix}"
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
            # An NSFW rejection surfaces here, not at createTask.
            print(f"  FAILED: {d.get('failCode')} {d.get('failMsg')}")
            return None
    print(f"  timed out; taskId {task_id}")
    return None


def build_prompt(kind: str, edit: str | None, look: str | None) -> str:
    if kind == "grade":
        return GRADE_TMPL.format(subject=SUBJECT, look=look, identity=IDENTITY, keep=KEEP)
    ident = IDENTITY_FREE_EXPRESSION if kind == "expression" else IDENTITY
    return EDIT_TMPL.format(subject=SUBJECT, edit=edit, identity=ident, keep=KEEP)


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
    extra = {}
    if os.environ.get("KIE_NSFW"):
        extra["nsfw_checker"] = os.environ["KIE_NSFW"].lower() == "true"

    tasks = {}
    for slug, (kind, edit, look) in LOOKS.items():
        if only and slug not in only:
            continue
        payload = {
            "model": MODEL,
            "input": {
                "prompt": build_prompt(kind, edit, look),
                "image_urls": [url],
                "output_format": "png",
                **size,
                **extra,
            },
        }
        created = call(CREATE_URL, payload)
        tid = (created.get("data") or {}).get("taskId")
        if created.get("code") != 200 or not tid:
            print(f"{slug}: createTask failed - {created.get('msg')}")
            continue
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
