# The screenshot feedback loop

The render-and-look loop is the entire method. Building Figma blind produces bad output; the visual-design rule exists because hand-coded SVG/markup without rendering is blind iteration.

## get_screenshot essentials

- `nodeId` is **required** and must be a real id (`123:456` / `123-456`). `"F"`, an empty string, or a guess is rejected. Get ids by having `use_figma` **return** them: `return {id: frame.id}` or `return page.children.map(c=>({n:c.name,id:c.id}))`.
- `fileKey` is required.
- `maxDimension` caps the longer edge (default 1024). Bump to 1200–1500 to read fine detail; drop for thumbnails / to save context.
- Response gives a short-lived **URL + curl** by default (cheap on tokens). Set `enableBase64Response: true` only when you cannot fetch URLs (sandboxed); it appends the inline image so the model can see it directly.
- `contentsOnly: true` renders a node in isolation (excludes floating overlaps). Default false matches the canvas.

## Cadence

1. Build one frame or section.
2. Screenshot it (real id). Look at it.
3. Note concrete defects: overlaps, clipping, off-baseline text, wrong color, empty tiles (often an invisible same-color-on-same-color element).
4. Patch surgically (find node by characters/name, fix), or re-run the section build.
5. Re-screenshot only what changed.

Do not batch ten frames then screenshot once; you lose the ability to localize bugs. Verify the first instance of a new pattern before mass-producing (e.g. screenshot one infographic before building nine more like it).

## Reading common defects

- **Empty/blank shape** that should have content → an element drawn in the same color as its background (e.g. petrol `[a]` on a petrol tile). Recolor to an on-dark tint.
- **Clipped chip/label at a card edge** → element placed left-aligned but overflowing; right-align by measuring its width first or placing at `x - width`.
- **Text overlap between sections** → a fixed `y` collided with wrapped multi-line text above; measure `node.height` and flow the next element from it.
- **Nothing changed after an edit** → you edited a non-current page's children (returned `[]`), or the user is looking at a stale/other page in desktop.
