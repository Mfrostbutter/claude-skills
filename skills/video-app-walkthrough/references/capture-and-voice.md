# Capture and voice: details and measured numbers

## Playwright capture

- Python Playwright 1.63, `pw.chromium.launch(channel="chromium", headless=True)`; `python -m playwright install chromium` is enough (the headless shell comes with it).
- `new_context(viewport=1920x1080, device_scale_factor=1, record_video_dir=RAW, record_video_size=1920x1080, color_scheme="dark")`. One context per scene.
- `ctx.add_init_script(CURSOR_JS)` injects the pointer. It is a `position:fixed` div with a 22 px SVG arrow, `z-index` max, updated on `mousemove` (capture phase), scaled to 0.8 on `mousedown`. It runs on every navigation inside the context, so it survives `page.goto`.
- Timing that reads well at 30 fps: glide 28 steps, type delay 45 ms (18 ms for a long paragraph), 400 to 900 ms pauses between fields, 1.6 s per smooth-scroll stop, 2.4 s when the viewer needs to read.
- `page.video.path()` is only final after `ctx.close()`; capture the `page.video` object before closing, then rename.
- Convert: `ffmpeg -y -i scene.webm -r 30 -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -vf scale=1920:1080:flags=lanczos -an scene.mp4`. The webm is VP8 at a variable frame rate; forcing 30 fps keeps AE happy.
- Scenes that mint data (a join form that creates a record) leave rows behind. Fine for role-play data; name them so they read as such on the dashboard.
- A scene that triggers a model call on camera (first question, one answer) costs a cent or two and reads far better than a static transcript. Wait with `locator(".msg-assistant").nth(n).wait_for(timeout=180_000)`.

## Identifier hygiene

Before filming: `for p in <pages>; do curl -s $BASE$p | grep -ciE "hostname|10\.10\.|surname|repo-name"; done`. Worker ids, operator emails, and audit actors are the usual leaks. Headless recording has no browser chrome, so the URL never appears. For a SPA (Vite, Next client routes) curl sees only the shell: open each route in Playwright, `page.wait_for_load_state("networkidle")`, and grep `page.content()` instead.

## Login and sessions

- Demo credentials come from `.env` or a secrets manager into environment variables; the capture script reads `os.environ`, never a literal.
- Scene 1 logs in on camera (type the username normally, the password with `page.type` into a `type=password` field so it renders masked), then `ctx.storage_state(path="captures/state.json")`. Every later context is created with `storage_state="captures/state.json"` so no scene re-authenticates.
- Delete `captures/state.json` at close-out; it holds a session cookie.

## VO before capture

`make_vo.py` runs before `capture.py`. The capture script reads `vo/manifest.json` and holds each scene for its VO duration + 3 s; `MIN_LEN` in the script is only the fallback when no manifest exists yet.

## Pacing a scene to its voice

The hold-at-end rule keeps a clip long enough; it does not keep the picture in step with the words. On the first run, the join-form scene filled and submitted in ten seconds under a twenty-one second VO, so for eleven seconds the viewer saw the next page while the voice was still on the form. Review caught it at 0:29.

Pattern (see `s02_join` in `scripts/capture.py`):

```python
t0 = time.time()
def at(t):                       # wait until t seconds into the scene
    rem = t - (time.time() - t0)
    if rem > 0: page.wait_for_timeout(int(rem * 1000))

page.goto(url); at(2.6); glide_to("input[name=name]")
at(3.6); page.type(..., delay=60)          # "types their name"
at(9.0); page.select_option(track, ...)    # "picks a track"
at(17.0); ...                              # hold here while the voice describes the options
at(21.1); submit()                         # "and press start"
```

Beat times come from the VO: play the wav once and note when each named action is spoken, or estimate from word position times total duration. Typing delay 55 to 70 ms reads as a person; 45 reads as a script. Verify with a frame grid at the beat times before building the comp.

## ElevenLabs

- Discover: `GET /v1/voices` (name, voice_id, category premade|professional, `fine_tuning.state` per model for clones), `GET /v1/models` (`can_do_text_to_speech`, `max_characters_request_subscribed_user`), `GET /v1/user/subscription` (tier, `character_count`, `character_limit`).
- A professional clone is usually tuned for `eleven_multilingual_v2` and the v2 turbo/flash family, not v3/v4; check `fine_tuning.state` and use a model it lists. `eleven_multilingual_v2` is the safe default for narration.
- `POST /v1/text-to-speech/{voice_id}?output_format=mp3_44100_128`, body `{text, model_id, voice_settings:{stability:0.5, similarity_boost:0.8, style:0.12, use_speaker_boost:true, speed:1.08}}`. `speed` (0.7 to 1.2) is the pace knob; 1.0 read slightly slow at review, 1.08 is the default here. Accept only `content-type: audio/*` with ID3 or MPEG sync bytes; retry on anything else.
- A scene opens on the frame the voice is about. Mint links, seed rows, or log in over HTTP before `page.goto`; never navigate through setup on camera (an instant auto-filled form between two pages read as a glitch at review). Park the fake cursor mid-frame at scene start.
- Loudness: `ffmpeg -af loudnorm=I=-16:TP=-1.5:LRA=11 -ar 48000 -ac 1` to WAV. AE imports WAV/MP3; WAV keeps the pipeline uniform.
- Measured: 3,267 characters of script produced 199 s of speech (16.4 chars/s, about 140 wpm). Budget 15 chars per target second so the cut lands short rather than long: a 3:00 target is about 2,700 characters. Set a per-scene budget from the clip you intend to shoot and check it with a one-liner before generating.
- Audience first. The first draft (written for engineers, mechanism-heavy, with contrast phrasing) was rejected after the review cut; the CSM rewrite kept every scene and page and changed only the words. Ask for the audience's technical level up front and write at that level.
- The script hash per scene lives in `vo/manifest.json`; rerunning after a one-line edit regenerates one scene.

## Data run (when the app has a conversational or form flow)

- Drive the app's own endpoints with `httpx`; parse the HTML partials the app returns (htmx apps return fragments) with a regex on the message class, and detect terminal states (completed note, error partial with a retry button, limit partial).
- Respondent model: a cheap, fast, non-reasoning model (the app's own fallback model id is a safe pick because it is known to work on that key). Temperature 0.7, 400 max tokens.
- Persona prompt: who you are, team, volumes, named systems, the pains in priority order with numbers, workarounds tried, what good looks like; rules: 2 to 5 sentences, answer what was asked, no personal names, name products, do not end the interview yourself.
- Poll the jobs table for the extraction and ranking kinds rather than sleeping a fixed time; log every job row with attempts and error so a retry on camera is explainable.
