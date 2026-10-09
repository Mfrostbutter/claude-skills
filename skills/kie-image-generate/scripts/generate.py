"""Kie.ai text-to-image pack runner (Seedream 5.0 Pro by default).

Reads a JSON pack, submits every variant, polls, downloads, prints dimensions.
Env: KIE_API_KEY (KIE_AI_API_KEY also read), PACK, OUTDIR, optional KIE_ONLY (slug filter).
No hardcoded secrets. No Pillow: dimensions come straight from the PNG/JPEG header.

Pack shape:
{"model": "seedream/5-pro-text-to-image", "aspect_ratio": "4:3", "quality": "high",
 "output_format": "png", "reference_urls": [],
 "variants": {"v1_slug": "prompt", "v2_slug": {"prompt": "...", "aspect_ratio": "1:1"}}}
"""
import json
import os
import struct
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

CREATE_URL = "https://api.kie.ai/api/v1/jobs/createTask"
RECORD_URL = "https://api.kie.ai/api/v1/jobs/recordInfo"
PNG_MAGIC = bytes([0x89]) + b"PNG\r\n" + bytes([0x1A]) + b"\n"
RATIOS = {"1:1", "4:3", "3:4", "16:9", "9:16", "2:3", "3:2", "21:9"}
QUALITIES = {"basic", "high"}

PACK = Path(os.environ.get("PACK") or sys.exit("set PACK=<pack.json>"))
OUTDIR = Path(os.environ.get("OUTDIR") or PACK.with_suffix(""))
ONLY = {s.strip() for s in os.environ.get("KIE_ONLY", "").split(",") if s.strip()}


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
    req.add_header("User-Agent", "kie-image-generate/1.0")
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            body = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code} from {url}\n{e.read().decode(errors='replace')}")
    # Kie answers HTTP 200 with the real status in the body.
    if body.get("code") != 200:
        sys.exit(f"Kie error {body.get('code')}: {body.get('msg')}\n{json.dumps(body, indent=2)}")
    return body


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


def build(pack: dict, slug: str, spec) -> dict:
    v = {"prompt": spec} if isinstance(spec, str) else dict(spec)
    prompt = v["prompt"].strip()
    if not 4 <= len(prompt) <= 5000:
        sys.exit(f"{slug}: prompt must be 4 to 5000 chars, got {len(prompt)}")
    ar = v.get("aspect_ratio") or pack.get("aspect_ratio") or "4:3"
    q = v.get("quality") or pack.get("quality") or "high"
    if ar not in RATIOS:
        sys.exit(f"{slug}: aspect_ratio {ar!r} not in {sorted(RATIOS)}")
    if q not in QUALITIES:
        sys.exit(f"{slug}: quality {q!r} not in {sorted(QUALITIES)}")
    refs = v.get("reference_urls") or pack.get("reference_urls") or []
    model = v.get("model") or pack.get("model") or "seedream/5-pro-text-to-image"
    if refs and model.endswith("text-to-image"):
        model = model.replace("text-to-image", "image-to-image")
    inp = {"prompt": prompt, "aspect_ratio": ar, "quality": q,
           "output_format": v.get("output_format") or pack.get("output_format") or "png",
           "nsfw_checker": bool(v.get("nsfw_checker", pack.get("nsfw_checker", False)))}
    if refs:
        inp["image_urls"] = list(refs)
    return {"model": model, "input": inp}


def poll(task_id: str) -> str:
    for i in range(90):
        time.sleep(8)
        d = call(f"{RECORD_URL}?taskId={task_id}").get("data") or {}
        state = d.get("state")
        print(f"  poll {i + 1}: {state}")
        if state == "success":
            res = json.loads(d.get("resultJson") or "{}")
            url = (res.get("resultUrls") or [None])[0]
            if not url:
                sys.exit(f"success without resultUrls:\n{json.dumps(d, indent=2)}")
            return url
        if state == "fail":
            sys.exit(f"task failed: {d.get('failCode')} {d.get('failMsg')}\n{json.dumps(d, indent=2)}")
    sys.exit(f"timed out; taskId {task_id}")


def main() -> None:
    pack = json.loads(PACK.read_text(encoding="utf-8"))
    variants = {s: v for s, v in pack["variants"].items() if not ONLY or s in ONLY}
    if not variants:
        sys.exit(f"no variants match KIE_ONLY={sorted(ONLY)}")
    OUTDIR.mkdir(parents=True, exist_ok=True)
    tasks = {}
    for slug, spec in variants.items():
        payload = build(pack, slug, spec)
        tid = (call(CREATE_URL, payload).get("data") or {}).get("taskId")
        if not tid:
            sys.exit(f"{slug}: no taskId in response")
        print(f"{slug}: task {tid} ({payload['model']}, {payload['input']['aspect_ratio']}, {payload['input']['quality']})")
        tasks[slug] = (tid, payload)
    record = []
    for slug, (tid, payload) in tasks.items():
        print(f"{slug}:")
        t0 = time.time()
        url = poll(tid)
        with urllib.request.urlopen(url, timeout=300) as r:
            blob = r.read()
        out = OUTDIR / f"{slug}.{'png' if blob[:8] == PNG_MAGIC else 'jpg'}"
        out.write_bytes(blob)
        print(f"  saved {out} {dims(blob)} {len(blob) // 1024} KB in {int(time.time() - t0)}s")
        record.append({"slug": slug, "task_id": tid, "file": out.name, "dims": dims(blob), "model": payload["model"],
                       "aspect_ratio": payload["input"]["aspect_ratio"], "quality": payload["input"]["quality"],
                       "prompt": payload["input"]["prompt"]})
    (OUTDIR / "record.json").write_text(json.dumps(record, indent=1), encoding="utf-8")
    print(f"done: {len(record)} image(s) in {OUTDIR}")


if __name__ == "__main__":
    main()
