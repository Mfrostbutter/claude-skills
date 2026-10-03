# After Effects build: what the script does and what bit us

`scripts/build_comp.jsx` (copied to `ae/build_comp.jsx` in the working dir) is ES3 ExtendScript driven by `ae/manifest.json`. Load the `after-effects-extendscript` skill for the general DOM rules (matchnames, text anchoring, easing); this file is the walkthrough-specific layer.

CONFIG at the top: `compName`, size and fps, colours (`bg`, `ink`, `muted`, `accent`, `panel`: take them from the app's CSS variables; if the app has none, sample a screenshot), fonts (Inter; must be installed on the OS, AE sees system fonts only), `fade 0.45`, `kenBurns 3.5`, `voLead 0.6`, `lowerThirdIn 0.5`, `lowerThirdHold 6.0`, `outroHold 5.0`, `titlePad 1.2`, `scenePad 1.0`, and `review` (true = 5 Mbps preset to `out/walkthrough-review.mp4`; false = 40 Mbps to `out/walkthrough-final.mp4`). The driver cannot pass arguments through `AfterFX -r`, so flip `review` with `sed` between passes.

## Manifest shape

```json
{ "scenes": [
  {"id":"01","kind":"title","title_text":"...","subtitle_text":"...","vo":"/abs/path/vo/01.wav","vo_duration":19.3},
  {"id":"02","kind":"clip","title_text":"Lower third text","clip":"/abs/path/captures/scene_02.mp4","clip_duration":28.2,"vo":"/abs/path/vo/02.wav","vo_duration":23.9},
  {"id":"10","kind":"outro","title_text":"One imperative line.","subtitle_text":"...","vo":null,"vo_duration":0}
]}
```

Forward slashes in paths; `new File()` accepts them on Windows. ES3 has no `JSON`; the script uses `eval("(" + text + ")")`.

## Timeline rules (CONFIG at the top of the script)

- clip scene length = `vo_duration + voLead (0.6) + scenePad (1.0)`, min 4 s
- title = VO + titlePad + voLead; outro = `outroHold` (5 s), no VO
- VO layer `startTime = sceneStart + voLead`
- clip: scaled to `(compW - 80) / clipW` so a 40 px inset shows the comp background, Ken Burns +3.5 % over the scene, 0.45 s opacity fades; if the clip is shorter than the scene, time-remap holds the last frame (logged)
- lower third: rounded panel + accent stripe + Inter Medium 34 px, slides in 24 px at `sceneStart + 0.5`, holds 6 s
- title and outro card text is shrunk to fit (`fitWidth`, 4 px steps, floor 40/26 px) before the block is centred; without it a long closing sentence runs off both edges
- comp markers at each scene start, named `NN title`, so the timeline is navigable by hand afterwards
- background solid in the app's own `--bg`; accent and ink from the app's CSS tokens so the cards match the product

## Render queue from the script

The script clears the render queue, adds the comp, enumerates `outputModule(1).templates`, picks by preference (`/H\.264.*40 Mbps/`, `/H\.264.*15 Mbps/`, `/H\.264.*Match Render/`, else `Lossless`), sets `om.file` under `out/`, logs the chosen template and the full template list, saves the project. `aerender -project x.aep -sound ON` then renders whatever is queued. AE 2026 ships: `H.264 - Match Render Settings - 5 / 15 / 40 Mbps`, `High Quality`, `Lossless`, `AIFF 48kHz`, plus hidden X-Factor presets.

## Traps, in the order they cost time

1. **`"text" + err` throws in ExtendScript** ("Object of type Error found where a Number, Array, or Property is needed"). A catch block that concatenates the error fails itself, pops that dialog, and leaves the log file empty because `File.open("w")` already created it. Report `String(err.message) + " (line " + err.line + ")"`.
2. **A leaked file handle survives the script.** After trap 1, AE still held `build.log` open; `rm` said busy and the next run could not write it. Changed the log name. If you see "Device or resource busy" on the log, pick a new name rather than fighting it.
3. **Modal alert blocks automation.** While any AE dialog is up, `AfterFX -r` does nothing. The error path logs only.
4. **Locked layers cannot move.** `bgSolid.locked = true` before `moveToEnd()` throws. Lock last.
5. **New layers land at the top.** Text created before its background panel ends up underneath it. Create backgrounds first or `textLayer.moveToBeginning()`.
6. **Template regex order.** The first `/H\.264/` match on this install is the 5 Mbps preset. UI text needs 15+; use 40 for the final.
7. **`AfterFX.exe -r` returns immediately** and runs the script in the already-open instance (title bar shows "Executing Script ..."). Detect completion from the log file the script writes, and wait for it to be non-empty.
8. **aerender before the save** fails with `Unable to call "openFast" ... Path is not valid`. The chain must gate on the log, not on time.
9. **Killing aerender leaves orphans.** `aerender.exe` spawns an `AfterFX.com` render engine per run; `Stop-Process aerender` leaves it alive, holding the partial `.m4v`/`.aac` (named with its PID) and the imported footage, so the next ffmpeg write to a `vo/*.wav` fails with exit −13 and `rm` says busy. To abort a render: kill `aerender`, then every `AfterFX.com` (`Get-Process | ? Name -match 'AfterFX.com'`), never the `AfterFX` UI process, then clear `out/walkthrough-*.<pid>.*`.
10. **Fonts are system fonts.** Inter installed per-user on Windows lands in `%LOCALAPPDATA%\Microsoft\Windows\Fonts`, so `resolvePS("Inter","Bold")` returns `Inter-Bold`. On a box without it the script silently falls back; the build log prints the resolved names, read them.

## Rerunnability

Each run removes the old comp by name and rebuilds; imported footage accumulates in the `walkthrough-footage` folder of the project (harmless, tidy by hand if the .aep matters). Rendering to a new filename per pass avoids the player's lock on the previous mp4.

## Timing

218 s of 1080p30, two text cards, eight clips, nine VO layers: build < 3 s, aerender 12 min 46 s at 5 Mbps on a mid-range desktop. Budget 4x realtime per render pass and do a review pass before the final.
