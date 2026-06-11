# Gotchas (errors hit in practice + fixes)

A running log of concrete failures and their resolutions. Add to it.

| Symptom / error | Cause | Fix |
|---|---|---|
| `node.insertChild: no such property 'insertChild' on RECTANGLE node` | Tried to nest children inside a rectangle (e.g. a pill = rect + text). | Rects have no children. Append rect and text as **siblings** of the same parent, rect first. |
| Button label hidden behind its background | Rect appended **after** the text. | Z-order = append order. Draw bg first, text second. |
| `cannot read property 'x'/'findOne' of undefined`; `page.children` is `[]` | Read a non-current page's children. | `await figma.setCurrentPageAsync(page)` first. |
| `get_screenshot` rejects `nodeId` | Passed `"F"`, a variable name, empty, or a guess. | Use a real id `123:456`. Return `node.id` from `use_figma` and use that. |
| Brand font not rendering / not in `listAvailableFontsAsync` | Adobe/CC/local font; cloud MCP only has the server library. | Use a renderable twin for mockups, ship the real font in prod. See `02-fonts.md`. |
| `Cannot write to node with unloaded font` (or silent edit failure) | Set/edited text without loading its font (or the node's existing font when editing). | `loadFontAsync` the font(s) first; when changing fonts, load both old and new. |
| Duplicate styles after re-running a build | `createPaintStyle`/`TextStyle`/`EffectStyle` always create. | Guard by name with `getLocalXStyles().find(...)` before creating. |
| Parallelogram bar came out as a tilted rectangle | Used `node.rotation` (rotates the whole rect). | Use a shear `relativeTransform` for true parallelograms. `03-geometry-and-drawing.md`. |
| `resize` throws | Passed width/height `0`. | Clamp: `Math.max(v, 0.01)`. |
| Chip/label clipped past a card's right edge | Placed left-aligned, overflowed. | Measure text width, then place at `x - chipWidth` (right-align). |
| Tile/icon looks empty | An element drawn the same color as its background (e.g. petrol mark on a petrol tile). | Recolor to an on-dark tint / contrasting fill. |
| SyntaxError on a ternary inside a helper | Malformed inline `?:` (e.g. an extra `:`). | Compute the value in a `const` first; keep `use_figma` JS simple. |
| Figma MCP POST blocked / request fails when SVG or text contains shell strings | Cloudflare WAF flags payloads containing shell/curl/command tokens (pipes, `ssh`, `pct destroy`, `curl -H`). | Use generic filler for decorative pseudo-code text; avoid embedding real shell commands in node text sent through the MCP. |
| User "sees nothing" in desktop | Wrong page selected / stale file / wrong account. | Tell them the page name; Ctrl+R to reload; confirm account. `01-setup-and-auth.md`. |
| A multi-section build partly succeeded, partly vanished | A throw later in the call rolled back the whole thing. | `use_figma` is **transactional**: any throw rolls back the ENTIRE call, so nothing commits. Treat a failed call as all-or-nothing — fix and re-run the whole call; never assume partial nodes survived. To resume after a *successful* call, measure `max(child.y + child.height)`. |
| `TypeError: no such property '<x>' on <NODE>` | Throwaway cruft like `node.foo?a:b` or `D(...).set?null:null` left in the code — accessing a non-existent property throws. | Never write placeholder/defensive junk that reads an invented property. Build each node **once**, assign to a `const`, then mutate it. Don't create the same node twice. |
| Rows of a list overlap once one line wraps | Used a fixed row pitch (`y += 42`) but a line wrapped to 2+ lines. | Measure: set `characters` + width, read `node.height`, advance the cursor by `height + gap`. Pre-measure off-canvas (`x = -9999`, then `.remove()`) to size a container before drawing its background. |

## Environment notes

- `use_figma` JS runs in the Figma plugin sandbox: `figma.*` global, standard JS built-ins. No filesystem, no Node APIs. Keep code self-contained; helpers must be redefined in each call (no state persists between `use_figma` calls).
- `code` has a length cap (tens of KB). Split very large builds across calls; one frame or a few related frames per call is a good unit.
- Concurrent calls do not share variables. Pass needed ids/values by returning them and threading them into the next call.
- **Verifying tall frames:** `get_screenshot` renders the whole node, so a very tall frame comes back narrow and unreadable when clamped. Request it at `maxDimension = frame height` to get a native-width PNG, then slice it into readable chunks (e.g. an `Image.crop` loop with Python + Pillow) and read each chunk. Use whichever local interpreter actually has the imaging lib installed — a bundled/minimal Python may lack `pip`. Write temp files under the working directory (a system `/tmp` may not exist on every host) and delete them after.
