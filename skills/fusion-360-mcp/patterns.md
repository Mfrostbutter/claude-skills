# Fusion MCP Patterns

Copy-ready Python for `fusion_mcp_execute` scripts. Every snippet assumes the standard `run()` wrapper:

```python
import adsk.core, adsk.fusion

def run(_context: str):
    app = adsk.core.Application.get()
    design = adsk.fusion.Design.cast(app.activeProduct)
    root = design.rootComponent
    # paste snippet here
```

Internal units are cm. `ValueInput.createByString('30 mm')` accepts unit suffixes and Fusion converts.

## Table of contents

1. Idempotent user-parameter add
2. Parametric box from a sketched rectangle
3. Construction plane offset from origin plane
4. Multi-profile cut (n cells in one feature)
5. Cut through unknown depth
6. Symmetric extrude (centered on sketch plane)
7. Tapered extrude (legacy countersink approach)
8. Holes via HoleFeatureInput (preferred)
9. Fillet by current UI selection
10. Edit existing fillet radius (no rebuild needed)
11. Read parameter values for sketch math
12. Bounding box sanity check
13. Clean rebuild without losing parameters
14. Export to STL / 3MF / STEP
15. API documentation lookup (before guessing signatures)
16. Screenshot defaults
17. Document search
18. Partial-height interior features via top-shave cut
19. Targeted delete-and-rebuild
20. Force camera fit-view from script
21. Save viewport snapshot to disk
22. Doc state sanity-check (read-only opener)
23. Stepped solid via Join extrude (body + lip flange)
24. Volume sanity check (spec vs actual)
25. Countersink hole via HoleFeatureInput
26. Print all resolved parameter values

## 1. Idempotent user-parameter add

Make every script safe to re-run.

```python
param_defs = [
    ('length', '220 mm', 'mm', ''),
    ('width',  '148 mm', 'mm', ''),
    ('height', '38 mm',  'mm', ''),
    ('wall',   '3 mm',   'mm', ''),
    ('floor',  '3 mm',   'mm', ''),
    ('total_height',
     'base_height + air_gap + 2 * floor_thickness',
     'mm', 'COMPUTED'),
]

params = design.userParameters
for name, expr, unit, comment in param_defs:
    if not params.itemByName(name):
        params.add(name, adsk.core.ValueInput.createByString(expr), unit, comment)
```

Expressions can reference other params directly.

## 2. Parametric box from a sketched rectangle

```python
P = adsk.core.Point3D.create
w, l = 5.0, 5.0  # cm internally (5cm = 50mm)

sk = root.sketches.add(root.xYConstructionPlane)
sk.name = 'outer'
sk.isComputeDeferred = True
pts = [P(-w/2,-l/2,0), P(w/2,-l/2,0), P(w/2,l/2,0), P(-w/2,l/2,0)]
for i in range(4):
    sk.sketchCurves.sketchLines.addByTwoPoints(pts[i], pts[(i+1)%4])
sk.isComputeDeferred = False

assert sk.profiles.count == 1, f"expected 1 profile, got {sk.profiles.count}"

extrudes = root.features.extrudeFeatures
ext_in = extrudes.createInput(sk.profiles.item(0),
    adsk.fusion.FeatureOperations.NewBodyFeatureOperation)
ext_in.setDistanceExtent(False, adsk.core.ValueInput.createByString('height'))
feat = extrudes.add(ext_in)
feat.name = 'body_solid'
feat.bodies.item(0).name = 'main'
```

`isComputeDeferred = True` before bulk adds matters for >10 vertices. Below that it is optional. Always assert profile count after closing the sketch.

## 3. Construction plane offset from origin plane

```python
pi = root.constructionPlanes.createInput()
pi.setByOffset(root.xYConstructionPlane,
               adsk.core.ValueInput.createByString('height'))
plane = root.constructionPlanes.add(pi)
plane.name = 'top_plane'
```

## 4. Multi-profile cut (n cells in one feature)

After sketching multiple closed rectangles on a plane:

```python
profs = adsk.core.ObjectCollection.create()
for i in range(sk.profiles.count):
    profs.add(sk.profiles.item(i))

cut_in = extrudes.createInput(profs,
    adsk.fusion.FeatureOperations.CutFeatureOperation)
ext_def = adsk.fusion.DistanceExtentDefinition.create(
    adsk.core.ValueInput.createByString('height - floor'))
cut_in.setOneSideExtent(ext_def,
    adsk.fusion.ExtentDirections.NegativeExtentDirection)
cut_in.participantBodies = [body]
feat = extrudes.add(cut_in)
feat.name = 'pockets'
```

## 5. Cut through unknown depth

When geometry below the sketch plane has variable depth (gussets, flanges, dividers):

```python
cut_in.setAllExtent(adsk.fusion.ExtentDirections.NegativeExtentDirection)
```

Valid for cut and intersect operations only. This pattern fixes counterbore cuts that get blocked by intermediate geometry the script does not know about.

## 6. Symmetric extrude (centered on sketch plane)

```python
ext_in.setSymmetricExtent(
    adsk.core.ValueInput.createByString('length'),
    True)  # True = value is TOTAL extent, not half
```

## 7. Tapered extrude (cone, legacy countersink approach)

```python
ext_def = adsk.fusion.DistanceExtentDefinition.create(
    adsk.core.ValueInput.createByString('cs_depth'))
taper_vi = adsk.core.ValueInput.createByString('-cs_angle / 2')  # negative = inward
cut_in.setOneSideExtent(ext_def,
    adsk.fusion.ExtentDirections.NegativeExtentDirection,
    taper_vi)
```

For real countersinks, prefer `HoleFeatures.createCountersinkInput` (see section 8).

## 8. Holes via HoleFeatureInput (preferred over sketch+cut)

HoleFeature is parametric, named, editable in the timeline, and cleaner than two extruded cuts. Use over sketch+extrude-cut for any standard hole.

### 8a. Simple through-hole

```python
holes = root.features.holeFeatures
hi = holes.createSimpleInput(adsk.core.ValueInput.createByString('4.2 mm'))
center = adsk.core.Point3D.create(2.5, 2.5, 1.0)  # cm
hi.setPositionByPoint(top_face, center)
hi.setDistanceExtent(adsk.core.ValueInput.createByString('10 mm'))
holes.add(hi)
```

### 8b. Counterbored hole

```python
holes = root.features.holeFeatures
hi = holes.createCounterboreInput(
    adsk.core.ValueInput.createByString('4 mm'),   # hole dia
    adsk.core.ValueInput.createByString('8 mm'),   # cbore dia
    adsk.core.ValueInput.createByString('3 mm'))   # cbore depth
center = adsk.core.Point3D.create(2.5, 2.5, 1.0)
hi.setPositionByPoint(top_face, center)
hi.setDistanceExtent(adsk.core.ValueInput.createByString('10 mm'))
holes.add(hi)
```

Direction is implicit from the face normal passed to `setPositionByPoint`. No explicit `ExtentDirections` argument needed for `setDistanceExtent` here.

## 9. Fillet by current UI selection

When the user has selected edges in Fusion UI before asking Claude to fillet them:

```python
sel = adsk.core.Application.get().userInterface.activeSelections
edges = [sel.item(i).entity for i in range(sel.count)
         if isinstance(sel.item(i).entity, adsk.fusion.BRepEdge)]

fi = root.features.filletFeatures.createInput()
fi.isRollingBall = True  # matches user expectation for blends
ec = adsk.core.ObjectCollection.create()
for e in edges:
    ec.add(e)
fi.addConstantRadiusEdgeSet(ec,
    adsk.core.ValueInput.createByString('8 mm'),
    False)  # False = no tangent chain propagation
feat = root.features.filletFeatures.add(fi)
feat.name = 'edge_fillet_8mm'
```

## 10. Edit existing fillet radius (no rebuild needed)

```python
for f in root.features.filletFeatures:
    if 'edge_fillet' in f.name:
        f.edgeSets.item(0).radius.expression = '10 mm'
        f.name = 'edge_fillet_10mm'
        break
```

Inline radius edit. Cheaper than delete and recreate.

## 11. Read parameter values for sketch math

```python
def p(name):
    return design.userParameters.itemByName(name).value  # returns CM

reach = p('arm_reach')   # if param=30mm, reach == 3.0 (cm)
# Point3D.create(reach, 0, 0) also takes cm. Math is consistent.
```

Only multiply by 10 when printing dimensions for human display.

## 12. Bounding box sanity check (always after extrudes)

```python
bb = body.boundingBox
print(f"X: {bb.minPoint.x*10:.2f} to {bb.maxPoint.x*10:.2f} mm")
print(f"Y: {bb.minPoint.y*10:.2f} to {bb.maxPoint.y*10:.2f} mm")
print(f"Z: {bb.minPoint.z*10:.2f} to {bb.maxPoint.z*10:.2f} mm")
```

Screenshots can deceive on orientation. Bounding box per axis is ground truth.

## 13. Clean rebuild without losing parameters

```python
while root.bRepBodies.count > 0:  root.bRepBodies.item(0).deleteMe()
while root.sketches.count > 0:    root.sketches.item(0).deleteMe()
while root.features.count > 0:    root.features.item(0).deleteMe()
```

Use this instead of `update(undo)` to reset geometry while keeping `userParameters`. Safer than undo because parameters are preserved. For changes that only touch a subset of features (e.g. re-laying out cavities while keeping the body+lip), prefer the targeted delete-and-rebuild in section 19.

## 14. Export to STL / 3MF / STEP

All four formats verified working. Always absolute paths with forward slashes; ensure parent directory exists.

### 14a. STL

```python
import os
out_dir = 'C:/path/to/your/exports'
os.makedirs(out_dir, exist_ok=True)

body = design.rootComponent.bRepBodies.itemByName('main')
em = design.exportManager
opts = em.createSTLExportOptions(body, f'{out_dir}/part.stl')
opts.meshRefinement = adsk.fusion.MeshRefinementSettings.MeshRefinementHigh
em.execute(opts)
```

Refinement options: `MeshRefinementLow`, `MeshRefinementMedium`, `MeshRefinementHigh`. Only affects curved geometry; flat boxes produce identical files at any setting. Use `High` for production exports; the cost on flat-dominated geometry is zero, the benefit on curves is real.

### 14b. 3MF (color + multi-body capable)

```python
opts = em.createC3MFExportOptions(body, f'{out_dir}/part.3mf')
em.execute(opts)
```

Note the capital `C` in `createC3MFExportOptions`. Common signature-guess miss.

### 14c. STEP (component-scoped, not body-scoped)

```python
opts = em.createSTEPExportOptions(f'{out_dir}/part.step', design.rootComponent)
em.execute(opts)
```

Pass a sub-component to scope down; pass `design.rootComponent` for the whole doc.

### Export warnings

- Overwrite is SILENT. If preserving prior exports matters, add a version suffix.
- Relative paths fail with `RuntimeError: 3 : The selected folder does not exist.`
- Protected paths fail with `RuntimeError: 3 : The selected folder is not accessible.`
- Forward slashes work on Windows. Backslashes also work but forward is cleanest.

## 15. API documentation lookup (before guessing signatures)

Always set `apiCategory`. Null or omitted returns success with empty data (silent failure).

```json
{ "queryType": "apiDocumentation",
  "searchPattern": "createSTLExportOptions",
  "apiCategory": "member" }
```

- `member`: best for one named function. Returns signature and docstring.
- `class`: best for exploring an unknown class. Returns properties and functions.
- `all`: best when unsure. Returns everything matching.

Searches accept regex but plain substrings work. Multi-class hits (e.g. `setAllExtent` exists on 4 classes) help locate ownership.

## 16. Screenshot defaults

```json
{ "queryType": "screenshot",
  "width": 800, "height": 600,
  "direction": "current",
  "transparentBackground": true }
```

Run the fit-view block from section 20 BEFORE every screenshot. Without it, results are unreliable:

- `direction: "current"` auto-fits in the common case but stops auto-fitting on Untitled docs and right after script-driven feature additions.
- Named directions (`iso-top-right`, `top`, `right`, `front`) only set orientation; they NEVER auto-fit. If the camera was moved by a prior script, you get an empty frame with a navy background.

Background: `transparentBackground: true` gives a true transparent PNG for compositing. `transparentBackground: false` gives the Fusion workspace background (medium gray-blue with content, dark navy if empty).

## 17. Document search

Use when looking for a specific design (fuzzy, cross-project):

```json
{ "queryType": "document",
  "operation": "search",
  "name": "my-part-name" }
```

Matches case-insensitively. Treats `-` and `_` as equivalent. No project param needed.

Use `document/recent` for "what was I working on?" workflows. Use `document/open` to confirm active-doc state before destructive operations.

## 18. Partial-height interior features via top-shave cut

When dividers (or any interior wall) should stop short of the rim, leaving a common open bay across the top, add a second cut that shaves the top of the existing walls. Additive feature, foundation stays intact.

```python
# Compute divider rectangles from existing param values (read at script time)
cl    = p('compartment_length')
dt    = p('divider_thickness')
cw    = p('cavity_width')
cav_l = p('cavity_length')

# 2 dividers between 3 compartments
d1_x0 = -cav_l/2 + cl
d1_x1 =  d1_x0 + dt
d2_x0 =  cav_l/2 - cl - dt
d2_x1 =  d2_x0 + dt
y0, y1 = -cw/2, cw/2

sk = root.sketches.add(tray_top_plane)
sk.name = 'divider_tops'
sk.isComputeDeferred = True
for x0, x1 in [(d1_x0, d1_x1), (d2_x0, d2_x1)]:
    pts = [P(x0,y0,0), P(x1,y0,0), P(x1,y1,0), P(x0,y1,0)]
    for i in range(4):
        sk.sketchCurves.sketchLines.addByTwoPoints(pts[i], pts[(i+1)%4])
sk.isComputeDeferred = False
assert sk.profiles.count == 2

profs = adsk.core.ObjectCollection.create()
for i in range(sk.profiles.count): profs.add(sk.profiles.item(i))

cut_in = extrudes.createInput(profs,
    adsk.fusion.FeatureOperations.CutFeatureOperation)
ext_def = adsk.fusion.DistanceExtentDefinition.create(
    adsk.core.ValueInput.createByString('divider_top_offset'))
cut_in.setOneSideExtent(ext_def,
    adsk.fusion.ExtentDirections.NegativeExtentDirection)
cut_in.participantBodies = [body]
feat = extrudes.add(cut_in)
feat.name = 'divider_top_shave'
```

Verification math: volume change = (n_dividers) x (divider_thickness) x (cavity_width) x (offset_amount). For 2 x 3mm x 182mm x 20mm = 21.84 cm^3.

Caveat: the X positions in the sketch are computed from current param values at script time, not driven by sketch dimensions. Changing `divider_thickness`, `compartment_count`, or `cavity_length` later will not auto-update; re-run the script.

## 19. Targeted delete-and-rebuild

When changing layout fundamentally but keeping the body+lip foundation, delete only the cavity-shaping features by name, then rebuild. Faster than the section 13 "delete everything" approach when only the layout changes.

```python
# Delete in dependency order: cut features first, then sketches
to_delete_features = ['divider_top_shave', 'compartment_cavities']
to_delete_sketches = ['divider_tops', 'compartments']

for fname in to_delete_features:
    for i in range(root.features.count - 1, -1, -1):
        f = root.features.item(i)
        try:
            if f.name == fname:
                f.deleteMe()
                break
        except Exception:
            pass

for sname in to_delete_sketches:
    for sk in list(root.sketches):
        if sk.name == sname:
            sk.deleteMe()
            break

# Verify body returned to its pre-cut solid state
body = root.bRepBodies.itemByName('tray')
print(f"naked body volume: {body.volume:.2f} cm^3 (should match the solid math)")
```

Verification gate: print body volume after deletion. Should match the math for the body without any cavities (body_lower + lip_flange volumes). If off, something didn't delete cleanly.

Naming requirement: every feature MUST have a unique meaningful name. Without names, delete-by-name fails and you fall back to walking by index, which is fragile.

## 20. Force camera fit-view from script

Reliably frames the body for a screenshot. Closes the camera-control gap previously documented in gotchas.md.

```python
vp = app.activeViewport
vp.fit()
cam = vp.camera
cam.viewOrientation = adsk.core.ViewOrientations.IsoTopRightViewOrientation
cam.isFitView = True
vp.camera = cam
vp.refresh()
```

After this, `read` screenshot with `direction: "current"` produces a properly framed isometric. Named directions on their own do NOT reliably auto-fit; the camera position is whatever the last operation left behind.

Available orientations:

- `IsoTopRightViewOrientation`, `IsoTopLeftViewOrientation`, `IsoBottomLeftViewOrientation`, `IsoBottomRightViewOrientation`
- `FrontViewOrientation`, `BackViewOrientation`, `LeftViewOrientation`, `RightViewOrientation`
- `TopViewOrientation`, `BottomViewOrientation`

Run this block before every screenshot for consistent framing across design iterations.

## 21. Save viewport snapshot to disk

Save the current viewport as a PNG directly to a project path. Bypasses the base64 round-trip of `read` screenshot. Useful for capturing preview images straight into a project's docs folder.

```python
import os

docs_dir = 'C:/path/to/your/docs'
os.makedirs(docs_dir, exist_ok=True)

vp = app.activeViewport
preview_path = f'{docs_dir}/preview-isometric.png'
ok = vp.saveAsImageFile(preview_path, 1600, 1200)
print(f"viewport saved: {ok} -> {preview_path}")
```

Combines well with section 20 (force fit-view) before the save call. Returns `True` on success, `False` on failure. Overwrites silently like other Fusion exports.

## 22. Doc state sanity-check (read-only opener)

Run this BEFORE any modification on an unfamiliar doc. Fastest way to know what you're walking into.

```python
print(f"bodies={root.bRepBodies.count} sketches={root.sketches.count} "
      f"features={root.features.count} units={design.unitsManager.defaultLengthUnits}")
print(f"params={design.userParameters.count} "
      f"planes={root.constructionPlanes.count}")
print(f"doc.isSaved={app.activeDocument.isSaved} "
      f"doc.isModified={app.activeDocument.isModified}")
```

Tells you: is the doc empty, what state are bodies and sketches in, do existing params match what your script expects, is the doc saved (so MCP `save` will work) or Untitled (must SaveAs via UI first).

Pair with `print('PARAMS:', [p.name for p in design.userParameters])` when you suspect a prior script left params you should re-use rather than re-add.

## 23. Stepped solid via Join extrude (body + lip flange)

For tray/insert geometry that has a body section dropping into an opening plus a wider lip flange resting on top:

```python
# 1. Body lower (centered rect, extrude up by body_height)
sk_body = root.sketches.add(root.xYConstructionPlane)
sk_body.name = 'body_outer'
sk_body.isComputeDeferred = True
bL, bW = p('body_length'), p('body_width')  # cm
pts = [P(-bL/2,-bW/2,0), P(bL/2,-bW/2,0), P(bL/2,bW/2,0), P(-bL/2,bW/2,0)]
for i in range(4):
    sk_body.sketchCurves.sketchLines.addByTwoPoints(pts[i], pts[(i+1)%4])
sk_body.isComputeDeferred = False
assert sk_body.profiles.count == 1

ext_in = extrudes.createInput(sk_body.profiles.item(0),
    adsk.fusion.FeatureOperations.NewBodyFeatureOperation)
ext_in.setDistanceExtent(False, adsk.core.ValueInput.createByString('body_height'))
feat = extrudes.add(ext_in)
feat.name = 'body_lower'
body = feat.bodies.item(0)
body.name = 'tray'

# 2. Construction plane at body top
pi = root.constructionPlanes.createInput()
pi.setByOffset(root.xYConstructionPlane,
               adsk.core.ValueInput.createByString('body_height'))
body_top_plane = root.constructionPlanes.add(pi)
body_top_plane.name = 'body_top_plane'

# 3. Lip flange (wider rect on body top plane, JOIN extrude up by lip_height)
sk_lip = root.sketches.add(body_top_plane)
sk_lip.name = 'lip_outer'
sk_lip.isComputeDeferred = True
lL, lW = p('tray_outer_length'), p('tray_outer_width')
pts = [P(-lL/2,-lW/2,0), P(lL/2,-lW/2,0), P(lL/2,lW/2,0), P(-lL/2,lW/2,0)]
for i in range(4):
    sk_lip.sketchCurves.sketchLines.addByTwoPoints(pts[i], pts[(i+1)%4])
sk_lip.isComputeDeferred = False
assert sk_lip.profiles.count == 1

lip_in = extrudes.createInput(sk_lip.profiles.item(0),
    adsk.fusion.FeatureOperations.JoinFeatureOperation)
lip_in.setDistanceExtent(False, adsk.core.ValueInput.createByString('lip_height'))
lip_in.participantBodies = [body]   # join target
feat = extrudes.add(lip_in)
feat.name = 'lip_flange'
```

Result: single combined body, footprint `bL x bW` from z=0 to z=body_height, transitioning to `lL x lW` at the top for the lip portion. Bambu Studio will print this floor-down with no supports needed for the 90-degree lip step (short overhangs bridge cleanly).

## 24. Volume sanity check (spec vs actual)

Body volume is in cm^3. Compare against the spec's solid-envelope-minus-cavities math to catch missing cuts or doubled extrusions.

```python
body = root.bRepBodies.itemByName('tray')
print(f"body.volume = {body.volume:.2f} cm^3")
# Cross-check: solid envelope - removed cavities
# e.g. tray = body_box + lip_box - 3 * compartment_box
```

If actual is significantly off from spec math, something is wrong (missed cut, doubled body, wrong participantBody). Catches problems screenshots miss.

CAVEAT: `body.volume` is the geometric solid volume. It is NOT a filament weight estimate. Slicer infill, walls, top/bottom layers, and supports all change the actual print weight by a factor of 2-5x downward from solid volume. Always slice and read grams from the slicer before pricing.

## 25. Countersink hole via HoleFeatureInput

Companion to section 8a (simple) and 8b (counterbore). For screws with conical heads (M3 flat-head, M4 wood screws):

```python
holes = root.features.holeFeatures
hi = holes.createCountersinkInput(
    adsk.core.ValueInput.createByString('4.2 mm'),   # hole dia (shank clearance)
    adsk.core.ValueInput.createByString('8.4 mm'),   # csink dia (head width)
    adsk.core.ValueInput.createByString('82 deg'))   # csink angle (82 deg = #6 wood, 90 deg = metric flat)
center = adsk.core.Point3D.create(2.5, 2.5, 1.0)
hi.setPositionByPoint(top_face, center)
hi.setDistanceExtent(adsk.core.ValueInput.createByString('10 mm'))
holes.add(hi)
```

Common cone angles: 82 degrees (US wood/sheet metal #4-#12), 90 degrees (metric flat head ISO 10642), 100 degrees (US aircraft/military). When in doubt, look up the screw spec.

## 26. Print all resolved parameter values

After idempotent param add (section 1), confirm computed expressions resolve to what you expect:

```python
for pname in [d[0] for d in param_defs]:
    pv = design.userParameters.itemByName(pname)
    print(f"  {pname:30s} expr={pv.expression:40s} value={pv.value*10:.3f} mm")
```

Catches:
- Expression typos that silently default a computed value to 0
- Missing prerequisite params (referencing an undefined name returns a Fusion eval error, but only when triggered)
- Order-of-add issues (a computed param that references a param not yet added)

Run this once after param add, before any body-adding feature that uses a computed value.
