# Placing raster images (screenshots, logos, photos)

The `use_figma` plugin sandbox has **no filesystem**, so you cannot read a local image from inside `use_figma`. Bring external images in with the **`upload_assets`** MCP tool (load its schema via ToolSearch first).

## The pattern: image as a fill on a node you control

1. In `use_figma`, create and **name** the holder rectangle at the exact position and size you want, with `fills = []` as a placeholder.
2. Call `upload_assets({ fileKey, nodeId, count: 1, scaleMode })` with the holder's node id. It returns a single-use `submitUrl`.
3. POST the bytes to that URL:
   `curl -s -X POST -F "file=@/abs/path/img.png;type=image/png" "<submitUrl>"`
   Multipart `file=` is preferred (the filename becomes the Figma layer name). The response carries `imageHash` + `placedOnNodeId`. The URL is single-use and expires in ~10 min.

- **Without `nodeId`**, `upload_assets` instead creates a NEW frame with the image on the current page. Prefer the `nodeId` path so you control placement inside your design.
- Formats: PNG / JPG / GIF / WebP, max 10 MB. **SVG is not supported here** — for SVG, call `figma.createNodeFromSvg()` inside `use_figma`.

## scaleMode: FILL vs FIT

- **FILL** covers the rect, cropping overflow. Use when you sized the holder to the image's own aspect ratio (then there is no crop).
- **FIT** shows the whole image, letterboxing with transparent padding. Use for **logos / transparent PNGs** where aspect must be preserved and you don't want cropping.
- Match the holder's aspect to the source to avoid distortion or letterbox bars: `holderH = holderW / (imgW / imgH)`.

## Pre-process before importing (the sandbox can't crop)

- Crop / resize / composite the source **first**, outside Figma. Python + Pillow is the reliable path; ImageMagick is often unavailable, and on Windows `convert` resolves to the unrelated disk tool.
- Use an interpreter that actually has the imaging library installed (a minimal or bundled Python may not). Probe with `python -c "import PIL"` before relying on it.
- **Read the cropped file back to confirm bounds** (chrome removed, nothing clipped) before importing. Iterate the crop box against the screenshot until it is clean.

## Framing a screenshot as a product artifact (not a raw grab)

- Put the image on a holder **inside a card** rect (surface fill, hairline stroke), then give the card a soft accent glow via `effects`: one or two `DROP_SHADOW`s with `offset {x:0,y:0}`, a large `radius`, and a low-alpha accent color. It reads as a designed artifact, not a screenshot.
- **Overlay a logo** the same way: a second named rect in a corner, `upload_assets` with `scaleMode: FIT` and a transparent-PNG logo, appended after the image so it renders on top (z-order = append order). On a dark surface use a light-on-dark logo variant.

## Cross-file image transfer

- To reuse an image already living in another Figma file, `download_assets` returns the raw source image URLs from that node's subtree. Feed those bytes to `upload_assets` in the target file.
