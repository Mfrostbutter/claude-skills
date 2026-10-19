---
name: n8n-figma-brand-boards
description: >-
  Turn a FigJam board, an outline or a process story into a Figma Design file on
  the n8n October 2026 brand: variable collections with Light and Dark modes,
  the n8n/ text styles, Card and Capsule components, 1920x1080 artboards with
  curved arrows, a dark cover and a Foundations page, all through the Figma MCP
  (use_figma). Use when asked to make a FigJam board "prettier", to produce a
  branded design version of a diagram, or to build any n8n-branded board,
  one-pager or deck page in Figma Design. Worked example: the Discovery file.
---

# n8n brand boards in Figma Design

Figma Design, not FigJam. The result is a file where every colour is a variable,
every text is a style, every box is a component instance, and the artboards read
as finished slides. Built from a FigJam board (the content source) or from an
outline. Load `figma-use` and `figma-generate-design` before the first
`use_figma`; load `figma-generate-library` for the foundations step. The general
operating manual is `figma-design-build`; this skill is the n8n-brand recipe on
top of it. Brand values and rules come from `n8n-brand`; do not retype hex.

## Procedure

1. **Dump the source.** For a FigJam board, one read-only `use_figma` per board
   that returns every shape with text, position, size and fill (script in
   `assets/dump-figjam.js`). The dump is the content inventory; the design
   version reorganises it and tightens the copy to one or two lines per card.
2. **Create the file and check fonts.** `create_new_file` in the org
   (`planKey` from `whoami`). `listAvailableFontsAsync()` filtered for
   `n8n Baumer` returns nothing as of 2026-10-19: Figma renders from its own
   library. Use **Inter** (Medium, Regular) for Uniwidth and **Geist Mono**
   (Medium) for Baumer Mono, say so in the handoff, and put the swap note on the
   Foundations page. Never substitute another display face.
3. **Foundations.** Run `assets/foundations.js`: pages Cover, Foundations,
   Components, Discovery (rename the last for the subject); collections
   `n8n Primitives` (core, pink, gray ramps, scopes `[]`), `n8n Color` with
   Light and Dark modes aliased to the primitives (`type/secondary` is a raw
   rgba, 50 percent black in light and 70 percent white in dark), `n8n Shape`
   (radius and space); nine `n8n/` text styles. Save the returned ids to a ledger
   file in the scratchpad; every later call reads ids from it, never from memory.
4. **Components.** Run `assets/components.js`: `Card` (Role = Customer, Us,
   Discovery; Title, Subtitle, Show subtitle properties; fixed width, hug height)
   and `Capsule` (Tone = Light, Dark, Pink; Label), plus the lockups and the pink
   symbol imported with `createNodeFromSvg` from the brand SVG paths. Screenshot
   the sets before going on.
5. **Artboards.** One `use_figma` per board, each starting with the prelude in
   `assets/prelude.js` (card, cap, text, logo, footer, legend, arrow). 1920x1080,
   80px side margins, title at y 64 in `n8n/Title`, secondary subline at y 124,
   mono caps column labels at y 230, closing statement in `n8n/Heading` at
   y 880, footer at y 1004: lockup left, the three legend capsules at x 420, the
   figure string right-aligned in mono caps. Position arrows from measured card
   geometry after the cards exist, not from planned numbers.
6. **Screenshot loop.** `get_screenshot` the board, download, look, fix with a
   targeted call. One pass per board is normal; the misses are label overlaps and
   a card that ended up taller than planned.
7. **Cover.** On the Cover page, the same tokens with the Dark mode applied to
   the frame (`setExplicitVariableModeForCollection`), Display at 128, the claim
   in `type/accent`, the pink symbol as the hero on the right, the dark lockup
   bottom-left.
8. **Record and export.** `download_assets` at 2x, one node per call, into the
   project's `boards/exports/design/`. Write the file key, page and board ids
   into the project's board map and the memory entry.

## The one-page variant

When the ask is one canvas to publish as a page, build a single 1440-wide frame
with one child frame per section (`Section / Hero`, `Section / Steps`, ...),
96px side margins, each section closed with `resize` to its measured content
plus 72 to 96px, and the root resized to the last section's bottom. Alternate
`bg/primary` and `bg/secondary` sections; hero and the closing section in Dark
mode. Keep it to the timeline and one thin pink rule; no arrow fans. A FigJam
board's connectors do not survive the translation; order, colour and a column
label carry the relationship instead. Worked example: page "One page" in the
Discovery file, nine sections, 7890px tall.

## Brand rules that bind here

- Light mode on the boards, Dark on the cover; one mode per surface.
- Customer = `bg/inverse` plain box (radius 8). Us = `bg/tertiary` with
  `border/default`, radius 16. Discovery = `bg/accent`, radius 16. Black text on
  pink, never pink text on pink.
- Pink is the accent: one pink element per board carries the point, pink lines
  only for the living brief or the equivalent thread.
- Mono caps for capsules, dates, column labels, footer; `n8n` lowercase inside
  caps. Sentence case everywhere else. No em dashes, no emoji, no people's
  names, no customer names.
- Arrows are vectors with a single end cap (`vectorNetwork` vertices carry
  `strokeCap`), 3px solid for the main path, 2.5px dashed `[12, 10]` for feeds
  into, pink only for the brief.

## Gotchas (full list in `reference/gotchas.md`)

- Set `layoutSizingVertical = "HUG"` after `resize(w, h)` on a Card instance,
  or the height stays frozen when the text changes.
- `setProperties` keys carry the `#id` suffix returned by
  `addComponentProperty`; read them from the ledger.
- `download_assets` takes one `nodeId`; six boards are six calls, which can run
  in parallel because they are read-only. `use_figma` calls never run in
  parallel.
- Text style ids end with a comma; pass them verbatim to `setTextStyleIdAsync`.

## Worked example

`reference/discovery-file.md`: the Discovery (n8n brand) file, with page, board,
component and variable ids, built 2026-10-19 from the three Discovery FigJam
boards in `n8n-fde-harness/discovery/`.
