---
name: fusion-360-mcp
description: >-
  Drive Autodesk Fusion 360 through the Fusion MCP server (fusion_mcp_execute, fusion_mcp_read, fusion_mcp_update) for parametric CAD. Use whenever the task is to model, edit, or inspect a part in Fusion via the MCP: parametric sketches, extrudes, holes, fillets, chamfers, revolves, lofts, shells, joins/cuts, user parameters, exports to STL/3MF/STEP, screenshots/fit-view, undo/redo, or API-documentation lookups. Triggers include "model a {bracket/tray/mount/panel/organizer} in Fusion", "add a counterbore hole", "extrude this sketch", "export the part to STL", "fillet these edges", "screenshot the model", "look up the Fusion API for {method}", or any mention of Fusion 360, the Fusion MCP, the Fusion Python API, or .f3d/.f3z/.step files. Encodes the safe script shape, tool-selection logic, the unit gotcha (internal cm), the explicit fit-view-before-screenshot rule, and the failure-mode catalog. Pairs with patterns.md (reusable snippets) and gotchas.md (failure catalog).
---

# Fusion 360 MCP

Drive the Autodesk Fusion MCP server safely and efficiently to build and edit parametric CAD. The MCP wraps the Fusion Python API behind three tools:

- `fusion_mcp_execute` — runs Python in the active document, or does file ops
- `fusion_mcp_read` — screenshots, API docs lookup, document/project queries
- `fusion_mcp_update` — undo/redo

Load `patterns.md` (reusable Python snippets across the whole MCP surface) and `gotchas.md` (full failure-mode catalog) on demand. This SKILL.md is the operating manual; those two are the deep reference.

## When to reach for each tool

| Tool | When to use |
|---|---|
| `execute` (script) | Any model change: param adds, sketches, extrudes, fillets, hole features, edits to existing features, body cleanup. ~80% of calls. |
| `read` (screenshot) | Verifying geometry after a non-trivial change. ALWAYS run the explicit fit-view block (`patterns.md`) before screenshotting — named directions do not auto-fit, and even `direction: "current"` is unreliable on Untitled docs. |
| `read` (apiDocumentation) | BEFORE writing a script that uses an unfamiliar method. Always set `apiCategory`; omitting it returns success with empty data (silent failure). |
| `read` (document, projects) | Listing open/recent docs, searching by name, getting project IDs. Use `search` (fuzzy, cross-project) for a specific design. |
| `update` (undo, redo) | Last resort. Undo treats the prior `execute` as ONE atomic transaction; if it added params AND geometry, undo wipes both silently. Prefer the delete-loop cleanup in `patterns.md`. |
| `execute` (document) | File ops: open, save, close. NEVER call without explicit user instruction. Save on Untitled docs is refused by the MCP (initial SaveAs must happen in the Fusion UI). Close on dirty docs requires `userConfirmedSaveAndClose` or `userConfirmedCloseWithoutSave`; surface the choice to the user. |

## Script anatomy

Every `execute` script body must use this shape. No other entry point works.

```python
import adsk.core, adsk.fusion

def run(_context: str):
    app = adsk.core.Application.get()
    design = adsk.fusion.Design.cast(app.activeProduct)
    root = design.rootComponent
    # ... work here ...
    print(f"summary: bodies={root.bRepBodies.count}")
```

Rules:

1. Define exactly `def run(_context: str):`. No other name works.
2. Do NOT wrap `run()` in `try/except`. Exceptions return as the tool error with full traceback; catching kills the traceback.
3. Use `print()` for any data you need back — the tool result `message` captures stdout.
4. Print the bounding box after any extrude. Screenshots can deceive on orientation; the bounding box does not.
5. Name every feature, sketch, body, and plane. Stable names are required for targeted delete-and-rebuild (`patterns.md`).

## Default build workflow

1. Sanity-check doc state: print `bodies/sketches/features/units` before touching anything (`patterns.md`).
2. Add user parameters idempotently (`itemByName` guard before `add`). Print resolved values to catch typos and prerequisite-order issues before any geometry.
3. Build geometry one feature per `execute` call. Name everything.
4. Assert profile counts after every sketch close (`assert sk.profiles.count == <expected>`). Print bounding box AND volume after every body-adding feature.
5. For stepped solids (base + lip/flange), use the Join-extrude pattern in `patterns.md`.
6. Run the fit-view block, then screenshot with `direction: "current"`; save an isometric preview with `vp.saveAsImageFile` if you want a durable image.
7. Export with absolute, forward-slash paths. Use `MeshRefinementHigh` for STL; pair with 3MF for slicers that prefer it.

## Default workflow for unfamiliar APIs

Before writing a script that touches `HoleFeatureInput`, `ExportManager`, `RevolveFeatures`, `LoftFeatureInput`, or any method whose signature you don't have memorized:

1. Call `fusion_mcp_read` with `queryType: "apiDocumentation"`, `apiCategory: "member"`, and the method name as `searchPattern`.
2. Read the signature and arg types.
3. Then write the script.

One read call is cheaper than a failed execute round-trip plus debugging.

## Top gotchas

Full catalog in `gotchas.md`. The ones that bite first:

1. **Internal geometry is always cm, not mm.** `.value` returns cm; `Point3D.create` takes cm. Only multiply by 10 when printing for human-readable display.
2. **Sketch plane orientation.** XY is the safe default (extrude up world Z). XZ maps sketch Y to NEGATIVE world Z (negate Y for Z-up geometry). YZ extrudes along world X. Default to XY for trays/panels/organizers; XZ for brackets/arms (negate Y).
3. **`profiles.count == 2` after closing a 4+ vertex polygon means self-intersection.** Always `assert sk.profiles.count == <expected>` before extruding.
4. **Undo is dangerous on mixed-content scripts.** It wipes the last `execute` as one atomic transaction. Keep scripts idempotent; prefer the delete-loop cleanup over undo.
5. **`apiDocumentation` with no `apiCategory` returns empty silently.** Always set it.
6. **Screenshots need an explicit fit-view first.** Run the fit-view block (`vp.fit()` + orientation set + `vp.refresh()`) before EVERY screenshot.
7. **Cut through unknown depth: use `setAllExtent(direction)`.** Critical for counterbore cuts through gussets, dividers, or flanges.
8. **Save on Untitled docs fails via the MCP.** Initial SaveAs must happen in the Fusion UI.
9. **Close on dirty docs requires an explicit confirmation flag.** Never auto-pick; surface the save/discard choice to the user.
10. **Export paths must be absolute with forward slashes.**
11. **CAD volume is NOT a filament-weight estimate.** A solid model's cm³ volume does not equal print weight (infill, walls, top/bottom layers change it dramatically). Any pre-slice filament/cost number is provisional — the real figure comes from slicing the actual STL.

## Reference files

- `patterns.md` — reusable Python snippets across the MCP surface (parameters, sketches, extrudes, joins, holes, fillets, cleanup, fit-view, export, doc-state checks).
- `gotchas.md` — full failure-mode catalog with reproductions and fixes.

## First-call template

```python
import adsk.core, adsk.fusion

def run(_context: str):
    app = adsk.core.Application.get()
    design = adsk.fusion.Design.cast(app.activeProduct)
    root = design.rootComponent

    # 1. Sanity-check doc state
    print(f"bodies={root.bRepBodies.count} sketches={root.sketches.count} "
          f"features={root.features.count} units={design.unitsManager.defaultLengthUnits}")

    # 2. Add params idempotently
    param_defs = [
        ('length', '100 mm', 'mm', ''),
        ('width',  '50 mm',  'mm', ''),
        ('height', '20 mm',  'mm', ''),
        ('wall',   '3 mm',   'mm', ''),
        ('floor',  '3 mm',   'mm', ''),
    ]
    params = design.userParameters
    for name, expr, unit, comment in param_defs:
        if not params.itemByName(name):
            params.add(name, adsk.core.ValueInput.createByString(expr), unit, comment)

    # 3. Sketch + extrude (XY plane default; internal units are cm)
    P = adsk.core.Point3D.create
    L, W = 5.0, 2.5  # cm
    sk = root.sketches.add(root.xYConstructionPlane)
    sk.name = 'base_outer'
    sk.isComputeDeferred = True
    pts = [P(-L/2,-W/2,0), P(L/2,-W/2,0), P(L/2,W/2,0), P(-L/2,W/2,0)]
    for i in range(4):
        sk.sketchCurves.sketchLines.addByTwoPoints(pts[i], pts[(i+1)%4])
    sk.isComputeDeferred = False
    assert sk.profiles.count == 1, f"expected 1 profile, got {sk.profiles.count}"

    extrudes = root.features.extrudeFeatures
    ext_in = extrudes.createInput(sk.profiles.item(0),
        adsk.fusion.FeatureOperations.NewBodyFeatureOperation)
    ext_in.setDistanceExtent(False, adsk.core.ValueInput.createByString('height'))
    feat = extrudes.add(ext_in)
    feat.name = 'base_solid'

    # 4. Bounding box check (print mm for humans)
    body = feat.bodies.item(0)
    body.name = 'base'
    bb = body.boundingBox
    print(f"bbox X:{bb.minPoint.x*10:.2f} to {bb.maxPoint.x*10:.2f} mm")
    print(f"bbox Y:{bb.minPoint.y*10:.2f} to {bb.maxPoint.y*10:.2f} mm")
    print(f"bbox Z:{bb.minPoint.z*10:.2f} to {bb.maxPoint.z*10:.2f} mm")
```

Replace param defs, sketch geometry, and feature operations for the specific part.
