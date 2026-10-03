# Scripts

Copy this folder's contents into `<workdir>\<slug>\scripts\` (and `build_comp.jsx` into `ae\`), then edit the CONFIG/constants at the top of each file. Each script states IN / OUT at the top. Order: `run_data` (optional) -> `make_vo.py` -> `capture.py` -> `assemble.py` -> `run_pipeline.sh` (AE build + aerender). `build_comp.jsx` has `CONFIG.review`: `true` renders the 5 Mbps review cut to `out/walkthrough-review.mp4`, `false` the 40 Mbps final to `out/walkthrough-final.mp4`; flip it with `sed` between passes.

| File | Stage | Edit before use |
|---|---|---|
| `run_data.example.py` | populate the app with invented data over its own endpoints | the whole persona and the endpoint shapes; this one is specific to an interview-style app |
| `capture.py` | Playwright scene recorder; `Scene` helper paces beats as fractions of each scene's VO (`at(0.6)` = 60% through the narration), writes `clips.json` after every scene | `BASE`, the scene functions, selectors |
| `script.example.md` | voice script format the VO generator parses | all prose; keep the `## NN Title (…)` headings |
| `make_vo.py` | ElevenLabs TTS per scene | `MODEL`, `SETTINGS`; voice via `ELEVENLABS_VOICE_ID` env, key via `ELEVENLABS_KEY` env |
| `assemble.py` | joins VO + clips into the AE manifest | `LOWER_THIRDS`, title/outro text |
| `build_comp.jsx` | builds the AE comp and queues the render | `CONFIG` block (colours, fonts, pads, comp name) |
| `run_pipeline.sh` | AE build + aerender driver | AE path if the version changes |

Python deps: `playwright`, `httpx`, `asyncpg` (only for the DB census). Use the app's own venv when it has one.
