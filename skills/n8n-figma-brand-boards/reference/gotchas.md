# Gotchas met while building n8n brand boards in Figma Design

Dated 2026-10-19, Figma MCP `use_figma` against an org Design file.

## Fonts
- `listAvailableFontsAsync()` has no `n8n Baumer Uniwidth` or `n8n Baumer Mono`.
  Figma renders server-side from its own library; local or Creative Cloud fonts
  do not count. Inter (Medium, Regular) and Geist Mono (Medium, Regular) are the
  twins. Check again each time; libraries change.
- Load every family and style you will touch at the top of every call, in one
  `Promise.all`. Setting a text style on a text node still needs the style's
  font loaded.

## Variables and styles
- `figma.variables.createVariable(name, collection, "COLOR")` takes the
  collection object, not its id.
- A colour variable value can carry alpha: `{ r, g, b, a: 0.5 }`. That is how
  `type/secondary` matches the brand's "black 50 percent" without a grey hex.
- Scopes: primitives `[]` (hidden from pickers), backgrounds
  `["FRAME_FILL","SHAPE_FILL"]`, text `["TEXT_FILL"]`, strokes
  `["STROKE_COLOR"]`, radius `["CORNER_RADIUS"]`, gaps `["GAP"]`.
- Bind a paint with
  `figma.variables.setBoundVariableForPaint({type:"SOLID",color:{r:0,g:0,b:0}}, "color", variable)`
  and assign the array to `fills` or `strokes`.
- `getLocalTextStyles()` is deprecated; use `getLocalTextStylesAsync()`. Text
  style ids look like `S:703f8c…656,` with a trailing comma. Pass them whole.
- Dark mode on one frame only: `frame.setExplicitVariableModeForCollection(collection, darkModeId)`.
  Everything inside that frame bound to `n8n Color` resolves through Dark. The
  Foundations page uses this per swatch to show both halves of a token.

## Components
- Build each variant as its own component, then `combineAsVariants([...], page)`.
  Add properties on the **set** (`set.addComponentProperty`) and point each
  variant's text node at them with `componentPropertyReferences = { characters: key, visible: boolKey }`.
- The property key returned is `Name#id` and must be used verbatim in
  `instance.setProperties({...})`.
- Card instances: `i.resize(w, i.height)` then `i.layoutSizingVertical = "HUG"`.
  Without the second line the instance keeps the main component's height.
- Instance overrides for padding and `itemSpacing` work; the Discovery hero card
  and the slim return cards use them instead of extra variants.
- `createNodeFromSvg(svg)` returns a frame of vectors. Move its children into a
  fresh `createComponent()` so the logo is a component, not a frame. The SVG
  needs explicit `width` and `height`.

## Arrows and lines
- Line rotation is unreliable here. Use a vector with a `vectorNetwork`: two
  vertices, the second with `strokeCap: "ARROW_EQUILATERAL"`, one segment with
  horizontal tangents (`tangentStart {x:k,y:0}`, `tangentEnd {x:-k,y:0}`,
  `k` = half the horizontal distance) for an S-curve, `k = 0` for a straight line.
  `setVectorNetworkAsync` is the async setter.
- Set `fills = []` on the vector or it fills the curve's chord.
- `dashPattern` works on vectors with arrow caps.

## Layout
- Measure after creating. Card heights depend on wrapped text; place arrows,
  rails and the next row from `node.y + node.height`, not from the plan.
- Two-line descriptions at 17px fit in a 480px card at about 52 characters per
  line. Three lines break the row pitch; tighten the copy instead.
- Labels that sit beside a rail need checking against the card above; the first
  miss was the "living brief" label overlapping a card bottom.

## MCP tools
- `use_figma` returns a value only when the script ends in `return`. Return ids
  and measured geometry from every mutating call and write them to a ledger file.
- `download_assets` takes a single `nodeId` and a full `localPath` with the file
  name, and returns a short-lived URL; `curl -sL -o` it. Six boards are six calls
  and may run in parallel. The SVG asset list in the response is the vectors on
  the board, not something to download.
- `download_assets` returned 1x PNGs on 2026-10-19 although `scale: 2` was passed.
  Check the pixel size with `file`; export from the Figma UI when print needs 2x.
- `download_assets` caps the export at 4096px on the long side and downscales
  the rest: a 7890px page came back 748 x 4096. Export tall pages one section
  frame at a time and keep the full-page export only as a preview.
- `get_screenshot` returns a 1024-wide preview URL; download and read it.
  Enough to spot overlaps and clipping, not enough to judge 1px strokes.
