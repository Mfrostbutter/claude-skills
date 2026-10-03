"""Join the VO manifest and the clip manifest into ae/manifest.json for build_comp.jsx.

IN: vo/manifest.json, captures/clips.json.
OUT: ae/manifest.json with one entry per scene: title card, eight clips, outro.
"""
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
VO = json.loads((ROOT / "vo" / "manifest.json").read_text(encoding="utf-8"))["scenes"]
CLIPS = json.loads((ROOT / "captures" / "clips.json").read_text(encoding="utf-8"))

LOWER_THIRDS = {
    "02": "Join: one link, three tracks",
    "03": "The interview: one question at a time",
    "04": "The data boundary",
    "05": "Extraction runs as a job",
    "06": "Ranking and the brief",
    "07": "Systems inventory: four coverage bands",
    "08": "Admin, audit, retention",
    "09": "/architecture has the map",
}


def fwd(p: str) -> str:
    return str(Path(p)).replace("\\", "/")


scenes = []
for s in VO:
    sid = s["id"]
    if sid == "01":
        scenes.append({"id": sid, "kind": "title", "title_text": "Your App Name",
                       "subtitle_text": "A walkthrough for the team", "vo": fwd(s["wav"]), "vo_duration": s["duration"]})
        continue
    clip = CLIPS.get(sid)
    if not clip:
        raise SystemExit(f"scene {sid} has no clip in captures/clips.json")
    scenes.append({"id": sid, "kind": "clip", "title_text": LOWER_THIRDS[sid], "clip": fwd(clip["clip"]),
                   "clip_duration": clip["duration"], "vo": fwd(s["wav"]), "vo_duration": s["duration"]})
# outro card repeats the last two sentences of the final narrated scene
_last = re.split(r"(?<=[.!?])\s+", VO[-1]["text"].strip())
_last = [x for x in _last if x]
scenes.append({"id": f"{len(VO) + 1:02d}", "kind": "outro",
               "title_text": _last[-2] if len(_last) > 1 else _last[-1],
               "subtitle_text": _last[-1] if len(_last) > 1 else "", "vo": None, "vo_duration": 0})

out = ROOT / "ae" / "manifest.json"
out.write_text(json.dumps({"scenes": scenes}, indent=2), encoding="utf-8")
total = sum(max(s.get("vo_duration", 0) + 1.6, 4) for s in scenes if s["kind"] == "clip") \
    + (scenes[0]["vo_duration"] + 1.8) + 5.0
print(f"wrote {out}: {len(scenes)} scenes, about {total:.0f}s ({total / 60:.1f} min)")
