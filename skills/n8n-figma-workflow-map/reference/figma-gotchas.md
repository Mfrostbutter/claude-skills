# Figma Plugin API gotchas for maps

Behaviors of `use_figma` that break a map, each with the fix `render.mjs` already
applies. Read this before editing the renderer.

| Symptom | Cause | Fix |
|---|---|---|
| Solid white or black blocks behind connectors | `createNodeFromSvg` wraps the SVG in a frame with a white fill | Set `fills=[]` and `clipsContent=false` on the wrapper (`svgNode` does both) |
| Chunk draws on the wrong page, or `page.children` is `[]` | The call starts on whatever page was current | `await figma.setCurrentPageAsync(page)` at the top of every chunk (the prelude does it) |
| `Cannot write to node with unloaded font` | Text edited before its font loaded | Load every family and style up front; to edit existing text, `loadFontAsync(t.fontName)` first |
| `Semi Bold` not found for JetBrains Mono | That weight is not in Figma's library | Use Medium; Inter's style name is `Semi Bold` with a space |
| Return value missing or "no return value" | `use_figma` return reporting is unreliable | Name every node; find things by name with `get_metadata` or a read-only pass, not by returned ids |
| Code rejected as too long | Per-call code limit near 50k characters | One chunk per row; `render()` throws past 48k so you split the row, not the call |
| A failed chunk left nothing behind | Calls are transactional; an exception rolls the call back | Fix and rerun the same chunk; earlier chunks are intact |
| Grouped items jump position | `figma.group` children keep parent-frame coordinates, not group-local | Position items in frame coordinates before grouping |
| Text clips at the box edge | Box sized before text was measured | Create text first, read `height`, then size the box to text plus padding (`node` and notes do this) |
| Rerun draws a second map on top | Chunk 00 creates a new frame every time | It renames the old one `(previous)` and draws to the right; archive or remove the old frame by hand |
| Edits silently do nothing | View-only account on the file | `whoami`, and confirm edit access before the first chunk |
| Raster screenshots needed on the map | The sandbox has no filesystem | `upload_assets` onto a named holder rectangle; SVG assets are inlined by `render.mjs` instead |
