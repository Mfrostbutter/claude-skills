# Fusion MCP Gotchas

Failure modes from production sessions plus stress-test findings. Each entry: what happens, why, the fix.

## Sketch plane orientation surprises

**XY plane (safe default).** Sketch X maps to world X, sketch Y maps to world Y. Extrude in `+Z` direction goes up. No surprises.

**XZ plane.** Sketch X maps to world X. Sketch Y maps to NEGATIVE world Z. For Z-up geometry, negate all Y values in your vertex list. A typical symptom: a side-profile bracket drawn Y-flipped on first attempt, only caught by the bounding box because the iso-top-right screenshot still looked plausible.

**YZ plane.** Sketch X maps to world Y. Sketch Y maps to world Z. Extrude direction is world X. Result: the part lies on its side in world space, rotated 90 degrees from expected.

**Rule.** Default to XY for top-down designs (trays, panels, anything that lays flat). XZ for side-profile parts (brackets, arms), remembering to negate Y. Avoid YZ unless extrusion along world X is specifically wanted.

## Self-intersecting polygon returns `profiles.count == 2`

A polygon where two edges cross internally (e.g. an 8-vertex Z-profile where edges V8 to V1 cross V5 to V6, producing a figure-8) is treated by Fusion as TWO closed profiles, not an error. The extrude succeeds and produces wrong geometry.

**Rule.** Always `assert sk.profiles.count == <expected>` immediately after `sk.isComputeDeferred = False`. Print the count if uncertain. Bail before extruding.

Profile count of 0 means the polygon did not close (vertex typo or float mismatch).

## Undo wipes whole-script transactions silently

`update(undo)` reverses the last `execute` as ONE atomic transaction. If that script added params AND created geometry, undo wipes both. Common symptom: "wait, why are these params missing?" several scripts later.

**Rule.** Make every script idempotent (params, bodies, sketches all checked-and-added). When rollback is plausible, split into two `execute` calls: params first, geometry second. Prefer the delete-loop cleanup over undo when resetting geometry.

## `apiDocumentation` with null apiCategory returns empty silently

Omitting `apiCategory` returns `{"message": "API documentation query completed", "success": true}` with NO data. Looks like success.

**Rule.** Always set `apiCategory` to `"member"`, `"class"`, `"description"`, or `"all"`.

## Internal units are cm, not mm

`userParameters.itemByName(name).value` returns CM. `Point3D.create(x, y, z)` takes CM. A 30mm parameter has `.value == 3.0`.

`ValueInput.createByString('30 mm')` accepts unit suffixes and Fusion converts. Use this for human-readable expressions.

**Trap.** Treating `.value` as mm and multiplying sketch coords by 10 doubles every dimension.

**Rule.** Only multiply by 10 when PRINTING dimensions for human display. Math inside scripts stays in cm.

## Screenshot `direction: "current"` auto-fits in most cases, but not all

`direction: "current"` auto-fits the camera to show the body in the common case. It does NOT preserve the current viewport camera; it re-fits.

Two known failure modes:

- Untitled docs: auto-fit is unreliable, often returns an empty frame.
- Immediately after script-driven feature additions: the camera may not have settled, fit can miss.

**Rule.** Always run the explicit fit-view block (patterns.md section 20) before screenshotting. Treat `direction: "current"` auto-fit as a happy-path bonus, not a guarantee.

## Camera reset has no MCP primitive (CLOSED 2026-05-22)

Resolved via the Python API from within an `execute` script. The MCP itself doesn't expose a camera primitive directly, but Fusion's `activeViewport.fit()` does what's needed:

```python
vp = app.activeViewport
vp.fit()
cam = vp.camera
cam.viewOrientation = adsk.core.ViewOrientations.IsoTopRightViewOrientation
cam.isFitView = True
vp.camera = cam
vp.refresh()
```

See patterns.md section 20. Verified across multiple successive design iterations; produces consistent framing every time.

Previous workarounds (asking the user to press Home, or hoping `direction: "current"` happened to do the right thing) are no longer needed.

## Named-direction screenshots still need an explicit fit-view call

Closing the camera-reset gap (above) does NOT change the fact that named directions like `iso-top-right` don't auto-fit on their own. If you call `read` screenshot with a named direction WITHOUT first running the `vp.fit()` pattern from patterns.md section 20, the result is whatever zoom the viewport happened to be at, often a tight crop or empty frame.

**Rule.** For deterministic screenshots, ALWAYS run the patterns.md section 20 fit-view block first, then take the screenshot. Even for `direction: "current"`. Controlling the camera explicitly is more reliable than depending on screenshot-side auto-fit behavior.

## `setOneSideExtent` with fixed distance stops at obstructions

A counterbore cut using `setDistanceExtent(floor_thickness)` to cut up from a gusset bottom can stop short when the gusset itself sits below the sketch plane. The fixed distance only clears the upper feature, leaving the cut blocked.

**Rule.** When geometry below the sketch plane is variable or unknown depth, use `setAllExtent(direction)` for cut and intersect operations. Cuts through everything in that direction.

## Do not catch exceptions in `run()`

```python
# BAD
def run(_context: str):
    try:
        # ... work ...
    except Exception as e:
        print(f"failed: {e}")  # loses the traceback
```

The MCP returns Python exceptions with full traceback as the tool error. Catching them turns a 30-second fix into a 10-minute debug because the line number and stack frame are gone.

**Rule.** Let exceptions propagate. Trust the tool error path.

## Counterbore vs countersink direction

For parts where screws drive upward into the part (e.g. mounting brackets installed from below), the counterbore must be cut UP from the screw-tab bottom, not DOWN from the top. Easy to get wrong on the first attempt by defaulting to "screw enters from the top".

**Rule.** Trace the actual screw direction in the install before placing the counterbore. Place the counterbore sketch on a plane positioned at the bottom-facing side, then `setAllExtent(NegativeExtentDirection)` to cut up.

## Save on Untitled documents fails via MCP

Calling `execute document save` on a never-saved doc returns `{"error": "Document 'Untitled' is new and must be saved by the user first.", "success": false}`. No dialog, no UI prompt. Clean refusal.

**Rule.** Initial SaveAs must happen in the Fusion UI. After that, MCP `save` works for revisions. Surface this to the user when they ask Claude to save a brand-new design.

## Close on dirty documents requires confirmation flag

`execute document close` on a dirty doc returns: `"has unsaved changes. Confirm with the user before closing. Specify userConfirmedSaveAndClose or userConfirmedCloseWithoutSave in the request."`

Also: `userConfirmedSaveAndClose: true` on an Untitled doc still fails with the same "must be saved by the user first" error, because the save step inside save-and-close hits the same wall.

**Rule.** Never auto-pick which confirmation flag to send. Surface the choice to the user. The `saved: false` field in the close response is the audit trail for "did the agent discard changes?"

## Export path requirements

- Relative paths fail with `RuntimeError: 3 : The selected folder does not exist.`
- Protected paths (e.g. `C:/Windows/System32/`) fail with `RuntimeError: 3 : The selected folder is not accessible.`
- Missing parent folder likely produces the same "does not exist" error.
- Overwrite is SILENT. Existing file clobbered without prompt.

**Rule.** Always absolute paths. Always `os.makedirs(dirname, exist_ok=True)` before export. If preserving prior versions matters, add a suffix to the path.

## STL refinement is no-op for flat geometry

A 50x50x10 box exports to 684 bytes at Low, Medium, and High refinement (identical files). Refinement only affects curved geometry tessellation.

**Rule.** Use `MeshRefinementHigh` by default for production exports. Cost on flat-dominated geometry is zero; benefit on curves is substantial.

## `createC3MFExportOptions` capital C

The 3MF export function is `em.createC3MFExportOptions`, not `em.create3MFExportOptions`. Common signature-guess miss. The C prefix is consistent with how Fusion versions its color-capable formats.

## `isRollingBall = True` matters for fillets

Default `FilletFeatureInput` geometry is NOT the spherical-corner blend most CAD users expect. Set `isRollingBall = True` for the standard blend.

## `isComputeDeferred` matters for >10 vertex sketches

`sk.isComputeDeferred = True` before bulk `addByTwoPoints` calls, `= False` after. Without it, every line add re-solves the sketch. Below 10 vertices the difference is negligible; at 50+ Fusion freezes.

## HoleFeatureInput is worth using over sketch+cut

It is tempting to bypass `HoleFeatureInput` because the signature looks awkward, but it works on first attempt with `createCounterboreInput(holeDia, cboreDia, cboreDepth)` and `setPositionByPoint(face, point3d)`.

**Rule.** Use `HoleFeatures` for standard holes (simple, counterbore, countersink). Parametric, named, editable in timeline, cleaner than two extruded cuts. Reserve sketch+extrude-cut for non-standard hole geometry.

## Project ID format mismatch

`document/open` returns `parentProjectId` in base64 form (e.g. `a.YnVzaW5lc3M6Z21haWw...`). `document/recent`, `document/search`, and `projects` return the same project as a decimal ID (e.g. `202602051047590776`). Same project, two formats. Use whatever the consuming call accepts; not yet confirmed if `document/open` for fileId accepts either form.

## Flange overhangs need slicer tree supports

CAD-side note: 10mm+ horizontal flange overhangs require tree supports in the slicer. No CAD-side fix short of redesigning as a chamfered skirt. Worth flagging when proposing flanged designs.

## `defaultLengthUnits` is read-only via script

Display units (mm vs cm) must be set via the Fusion UI or document template, not via script. Internal geometry is always cm regardless of display units; this is cosmetic only.

## `setDistanceExtent` direction is implicit on HoleFeature

For `HoleFeatureInput.setDistanceExtent`, the through-direction comes from the face normal passed to `setPositionByPoint`. No explicit `ExtentDirections` argument needed. Different from `ExtrudeFeatureInput`, which requires explicit direction.

## Redo stack is consumed by new features

After `undo`, any new feature added via `execute` consumes the redo stack. Subsequent `redo` returns `{"error": "Nothing to redo", "canUndo": true, "canRedo": false, "success": false}`. Fails gracefully.

**Rule.** The skill can rely on `canUndo` and `canRedo` flags in the returned JSON for branching logic. Document that any new feature kills the redo stack.

## Untitled docs have no fileId

`document/open` (read) lists Untitled docs without an `id` field. Cannot pass them to `document/open` (execute) since fileId is required. Untitled doc workflows must start from creating fresh in the Fusion UI or saving the doc first.

## Document search treats `-` and `_` as equivalent

Query `My-Part` matches docs named `My_Part...`. Useful for fuzzy matching across naming conventions.

## `participantBodies` is required for cuts that target a specific body

When multiple bodies exist in a component and a cut should only affect one:

```python
cut_in.participantBodies = [body]
```

Without this, Fusion may pick the wrong body or apply the cut to all candidate bodies. Always set when more than one body is present. Also required for the Join extrude pattern (`patterns.md` section 23) so the lip flange joins onto the body rather than creating a new disconnected solid.

## CAD volume is NOT a filament-weight estimate

`body.volume` (returns cm^3) is the geometric solid volume. Real print weight is dramatically lower because slicers use sparse infill, fixed wall counts, and don't fill cavities the way a solid would.

Symptom: a 306 cm^3 tray modeled in Fusion estimates "~310g of ABS at solid density" but actually prints at ~90g (30% infill, 3 perimeters, 5 top/bottom layers). Pricing off the solid number kills margin; pricing off a guess is just as bad.

**Rule.** Treat any pre-slice filament weight as provisional. Slice the actual STL in Bambu Studio (or whichever slicer) and read grams + print time from there. Lock COGS only after the first verified print confirms the slicer numbers.

## `document/open` (execute) requires fileId in urn form

The `fileId` parameter for `execute document open` is the `urn:adsk.wipprod:dm.lineage:...` form returned in the `id` field of `document/search` or `document/recent` results.

**Workflow.** `read document search` (or `recent`) -> copy the `id` field -> pass as `fileId` to `execute document open`. Project ID is NOT a substitute and isn't required for the open call.

## Tapered cut needs the third arg form of `setOneSideExtent`

`setOneSideExtent(extentDef, direction)` is the standard signature. To add taper (countersink-style cone), pass a third `ValueInput` for the taper angle:

```python
ext_def = adsk.fusion.DistanceExtentDefinition.create(
    adsk.core.ValueInput.createByString('cs_depth'))
taper_vi = adsk.core.ValueInput.createByString('-cs_angle / 2')  # negative = inward
cut_in.setOneSideExtent(ext_def,
    adsk.fusion.ExtentDirections.NegativeExtentDirection,
    taper_vi)
```

Easy to miss the third positional arg. For standard countersinks, prefer `HoleFeatures.createCountersinkInput` (`patterns.md` section 25); it's parametric and editable in the timeline.

## STL refinement is a no-op for flat geometry, real for curves

`MeshRefinementLow`, `MeshRefinementMedium`, `MeshRefinementHigh` produce identical files for any flat-faceted geometry. The difference only shows up on curved surfaces (fillets, revolves, lofts), where High gives smoother facets at the cost of file size.

**Rule.** Default to `MeshRefinementHigh` for production exports. Cost on flat-dominated geometry is zero (identical output); benefit on curve-heavy parts is significant.

## Export artifact cleanup is your responsibility

The MCP writes export files wherever you point them, never warns on overwrite, and never cleans up. Test runs that wrote to `C:/temp/test_body.stl` etc. accumulate over sessions.

**Rule.** Use a scoped sub-folder for throwaway exports (e.g. `C:/temp/fusion-tests/`) that you can delete in bulk. Production exports should always go to a project-pathed destination, never `C:/temp`.
