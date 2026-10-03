---
name: video-app-walkthrough
description: >-
  Produce a narrated walkthrough video of a running web app end to end from one workstation: scripted Playwright screen captures (one clip per scene, fake cursor, 1080p), an ElevenLabs voiceover from a per-scene script (own clone or stock voice), an After Effects comp built by ExtendScript from a manifest (title card, lower thirds, Ken Burns, outro), rendered headless with aerender. Use whenever the user asks for a walkthrough, demo, explainer, product tour, screencast, or "make a video of the app", for any localhost or hosted web UI, with or without After Effects named. Also use to re-cut an existing walkthrough (new audience, new VO, new scenes, different length) or to film one page for a social clip.
---

# Video app walkthrough

A deterministic pipeline, not a screen-recorder session. Every stage writes files the next stage reads, so any stage reruns alone and the edit never depends on a human timing anything by hand. Python Playwright does the recording (the Playwright MCP cannot record video). Start a `workflow-capture` worklog at `_worklogs/YYYY-MM-DD-<slug>/WORKLOG.md` before step 0 and append DISCOVERY entries as tools surprise you.

```
scripts/run_data.*                 populate the app so pages are not empty (optional)
vo/script.md -> scripts/make_vo.py ElevenLabs -> vo/NN.wav + vo/manifest.json      (VO FIRST)
scripts/capture.py                 Playwright -> captures/scene_NN.mp4 + clips.json  (holds each scene to VO + 3 s)
scripts/assemble.py                -> ae/manifest.json
ae/build_comp.jsx (AfterFX -r)     -> ae/walkthrough.aep + a render-queue item
aerender                           -> out/walkthrough-review.mp4, then out/walkthrough-final.mp4
```

Working directory: `<workdir>\<slug>\` with `captures/ vo/ ae/ out/ scripts/`. `<workdir>` is a scratch folder outside any synced repo (a `.gitignore`d `.video/` or `~/video-work/`); raw webm and renders are hundreds of MB and the folder is disposable. The durable copy of the scripts is this skill's `scripts/`; copy improvements back here before closing out.

## 0. Preflight (five minutes, saves an hour)

Check, in one pass, before writing anything:

- **After Effects** installed and **open** (`Get-Process AfterFX`), `aerender.exe` under `Support Files`, ffmpeg + ffprobe on PATH (or `FFMPEG` / `FFPROBE` env vars), `node` for syntax-checking the .jsx.
- **AE scripting pref** "Allow Scripts to Write Files and Access Network" (Edit > Preferences > Scripting & Expressions). Off by default; the build script writes a log and saves the .aep. This and "AE open" are human blockers: put them in the question batch, not only here.
- **TTS key** reachable: read it from your secrets manager (Infisical, 1Password, a `.env` outside the repo) into a shell variable, print only `${#KEY}` and a sha256 prefix, then `GET /v1/voices`, `/v1/models`, `/v1/user/subscription`. A clone exposes `fine_tuning.state` per model; pick a model it is tuned for.
- **Data.** Count rows behind every page you intend to film (DB query, or the app's API). Zero rows on a new feature's page is the common failure; decide now whether to populate.
- **Identifier scan.** For server-rendered pages, `curl` each URL and `grep -ci` for hostnames, LAN IPs, personal names, repo names. For a SPA, curl returns an empty shell: scan `page.content()` from Playwright after the route renders. Headless capture has no URL bar, which removes the localhost tell for free.
- **Login.** If the app has one, find a demo account whose credentials live in `.env` or a secrets manager, never in the capture script. Log in once in the first scene (type a masked password), save `storage_state`, reuse it in every later context.

## 1. Ask the shaping questions in one batch

Recommended option first on each:

1. Voice: the user's own ElevenLabs clone if they have one, or a stock voice (name two).
2. Audience and **technical level**, plus length. Say the options plainly: a customer-facing or CSM overview (what it is, what you do, what you get), or an engineering cut (how it works). Default to the lower level; a script written by the builder drifts toward mechanism.
3. Permission to spend on a real data run, with the rough cost.
4. Output directory (`<workdir>\<slug>\`).
5. Is After Effects open with the scripting pref ticked. If not, say what to click.

Nothing downstream starts before the answers land.

## 2. Populate data so every filmed page has content

Pick the cheapest honest route:

- **Form or CRUD app:** seed invented rows through the app's own API (or its fixtures / SQL seed script if it ships one).
- **Conversational or wizard flow:** drive the app's own endpoints with an LLM playing the human (`scripts/run_data.example.py`), so every job, audit, and model-call row lands the way it would in production. The persona prompt carries the whole invented world and three rules: short answers, no personal names, name products.
- Then trigger any downstream jobs and poll the jobs table until they finish. Keep the log; it is the proof the data is invented.

Scenes that do not depend on slow jobs can film while those jobs run. Split the capture run by dependency.

## 3. Write the voice script to the audience, then generate VO

`vo/script.md`: one `## NN Title (page)` section per scene, prose only, read-aloud voice. Section 01 narrates the title card, the last section narrates the final page; the outro card after it is silent and repeats the last line as text. The VO generator parses those headings, so the heading format is load-bearing. Lower-third captions come from `assemble.py`'s `LOWER_THIRDS` dict, not from the headings.

Length: measured 16.4 characters per second of speech (about 140 wpm). Budget 15 characters per target second so there is slack: a 3:00 cut is about 2,700 characters. Set a per-scene budget and check it before generating.

Voice rules for an overview: plain spoken English, short sentences, contractions, one idea per scene, product names said plainly. No analogies. No contrast phrasing ("X, not Y", "rather than"). No "in this video". Say what the viewer does and what they get; leave how it works for the engineering cut. Run `make_vo.py` now; it writes `vo/manifest.json` with per-scene durations, which the capture step reads.

## 4. Capture with Playwright, one context per scene

`scripts/capture.py` is the template. Keep these properties:

- `channel="chromium"`, headless, viewport 1920x1080, `record_video_dir` per context, `color_scheme` matching the app.
- One browser context per scene, closed before the next, so each scene is its own `.webm`. The file is only complete after `ctx.close()`; rename then.
- A fake cursor injected with `add_init_script` (fixed-position SVG following `mousemove`, shrinks on `mousedown`). Playwright video has no pointer; without this, clicks and typing are invisible.
- `page.mouse.move(x, y, steps=28)` for glides, `page.type(..., delay=45)` for typing, `scrollTo({behavior:'smooth'})` with 1.6 to 2.4 s per stop, `scrollIntoView` on a `text=` locator to land on a section.
- Hold on the final state until the scene's VO duration + 3 s (read from `vo/manifest.json`; `MIN_LEN` is the fallback), then convert: `ffmpeg -r 30 -c:v libx264 -crf 17 -pix_fmt yuv420p -an`. AE does not import webm.
- Write `captures/clips.json` with measured durations (ffprobe), merged with any earlier batch.

**Pace every scene to the narration, not to how fast Playwright can act.** Playwright fills a form in ten seconds; the voice takes twenty. If the action finishes early, the clip holds its last frame while the voice is still describing the previous step, which reads as a cut to the wrong page. Before writing a scene, mark the beat times in its VO (open the wav in a player, or estimate from word position times duration) and use the `Scene.at(frac)` helper in `capture.py` (a fraction of the scene's VO, read from `vo/manifest.json`, so a regenerated line of narration does not break the pacing): each on-screen action starts within about a second of the words that name it, descriptive stretches hold on the element being described, and the final action (submit, navigate) fires as the last sentence lands. The on-screen action must never finish before the narration does.

Pull frames at the beat times from every clip (`ffmpeg -ss T -frames:v 1` into an `xstack` grid) and look at them before moving on. Thirty seconds of looking catches a wrong selector, a cursor parked over the text, or a scene that ran ahead of its voice.

## 5. Build the comp from a manifest

`scripts/assemble.py` joins `vo/manifest.json` + `captures/clips.json` into `ae/manifest.json`: a title scene, one clip scene per VO scene (clip path, VO path, both durations, lower-third text), an outro scene. Copy `scripts/build_comp.jsx` to `ae/build_comp.jsx`; it reads the manifest and builds everything. `references/after-effects-build.md` has the CONFIG, what the script does, and the ExtendScript traps that cost time on the first run.

Drive it from the shell (`scripts/run_pipeline.sh`), never by hand:

```
rm -f ae/build-log.txt
AfterFX.exe -r "<abs path>\ae\build_comp.jsx"        # returns at once; runs inside the open AE
until [ -s ae/build-log.txt ]; do sleep 2; done         # NON-empty log, not just existing
grep -q "^ERROR" ae/build-log.txt && stop
aerender.exe -project "<abs path>\ae\walkthrough.aep" -sound ON
```

Syntax-check the .jsx first: `cp x.jsx _check.js && node --check _check.js`. It catches parse errors only (and chokes on `#target` / `#include` lines, which this script does not use); the AE DOM is checked by the build log.

## 6. Review pass, then final

aerender runs at roughly 4x realtime on a mid-range desktop (218 s of 1080p took 12 min 46 s). So: set `CONFIG.review = true` in the jsx (5 Mbps preset, `out/walkthrough-review.mp4`), render, pull five frames (title, a lower third, two mid-scene, outro) plus `ffprobe` for the AAC stream, open the mp4 for the user, then flip `review` back to `false` (40 Mbps, `out/walkthrough-final.mp4`) and render the final while they watch. Different filenames, because the player holds the review file open.

Look at the frames. The lower-third text hidden under its own panel was invisible in the build log and obvious in one frame.

If the script changes after a review (audience, length), keep the captures: regenerate only the changed VO (hash skip), re-assemble, rebuild, re-render. Kill an in-flight render the moment the script is known to change.

## 7. Close out

- Keep: `out/walkthrough-final.mp4`, `ae/walkthrough.aep`, `vo/script.md`, `vo/*.wav`, `captures/*.mp4`, the scripts (copy improvements back into this skill's `scripts/`). The raw webm can go.
- Report bugs the real data run surfaced in the app (a retry that showed on the jobs page is a finding, not an edit).
- Final worklog entries, then `skill-forge` if the run taught something new.

## Guardrails

- **No secrets in any file you write.** TTS and model keys travel shell variable to process only; print length and a hash prefix, never the value. Demo logins come from `.env` or a secrets manager.
- **Write the overview for the stated audience's level.** CSM and customer cuts: what you do and what you get, plain words, no analogies, no contrast phrasing. Mechanism belongs in a separate engineering cut.
- **VO before capture.** The voice decides each scene's length; capturing first means guessing and freezing frames.
- **Never alert() in the AE script's error path.** A modal dialog blocks every later `AfterFX -r` until a human clicks it. Log to a file and exit.
- **Never `"" + errorObject` in ExtendScript.** It throws, masks the real error, and leaves an empty log. Use `err.message` and `err.line`.
- **Do not lock a layer you still have to move.** Build, `moveToEnd()`, then lock.
- **New layers land on top.** Create panels before text, or `text.moveToBeginning()`.
- **Do not hardcode an output-module template name.** Enumerate `outputModule.templates`; prefer `H.264 ... 40 Mbps`, then 15, then any H.264, then Lossless.
- **Do not film before the dependent jobs finish.** Pages behind a queue show stale or empty data.
- **Every stage stops the chain.** `set -o pipefail`; never `step | tail || exit`. A masked VO failure rendered a cut with half-new audio.
- **Aborting a render means killing `aerender` and its `AfterFX.com` engines**, then clearing the PID-named partials, before touching any audio file they imported.
- **Do not put anything in a synced repo tree**, and if the app's repo is a Syncthing follower, no git writes there either.
- **Invented data only on camera**, labelled as such wherever the app supports it.
