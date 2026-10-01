# Brand profile: n8n In The Loop (ITL) presentation language

The look of the n8n "In the Loop Presentation Template" (Google Slides, 2026).
Use it for anything that sits next to an ITL deck: infographics, section
graphics, social cards. It is deliberately narrow: three colours, one typeface,
no gradients, no outlines, no accent stripes.

## Palette

The template's rule: "core colours, black, white and pink. Please do not use
other colors." The greys below are the only tints we add, for panels and
captions. Paint-style names on the left are what the Figma library uses.

| Style name | Hex | Role |
|---|---|---|
| `ink/black` | `1A1A1A` | Hero and closing backgrounds, dark panels |
| `ink/text` | `000000` | Headlines and body on white |
| `paper/white` | `FFFFFF` | Default background |
| `paper/panel` | `F4F4F4` | Cards and content panels on white |
| `pink/accent` | `F28CA8` | The template pink: highlights in headlines, chapter backgrounds, emphasised blocks |
| `pink/deep` | `EA4B71` | Highlight words on white when `pink/accent` lacks contrast, big stat numbers, arrows |
| `pink/pale` | `FBD7E1` | Soft emphasis bands, the "vector" band, secondary ladder rungs |
| `grey/caption` | `6B6B6B` | Captions, sources, page numbers on white |
| `grey/on-dark` | `C9C9C9` | Secondary text on `ink/black` |

Dominance: white or `ink/black` carries 70% of any composition, `paper/panel`
20%, pink at most 10%. One pink element per graphic is usually right; two is the
ceiling.

Contrast notes: `pink/accent` on white passes only for large bold text (36px+).
Use `pink/deep` for anything smaller. Black text on `pink/accent` is fine at
any size. Never put `pink/accent` text on `pink/pale`.

## Typeface

**Zalando Sans**, the template's only font. Check the library before building:

```js
const all = await figma.listAvailableFontsAsync();
return all.filter(f => f.fontName.family === "Zalando Sans").map(f => f.fontName.style);
```

Verified 2026-10-01: Figma's library has **Zalando Sans** with styles `Black`,
`ExtraBold`, `Bold`, `SemiBold`, `Medium`, `Regular`, `Light`, `ExtraLight`
(no spaces in the compound names) plus `Zalando Sans Expanded` and
`Zalando Sans SemiExpanded`. Use `Bold` for headings and `Regular` for body;
`SemiBold` for chip labels. Re-run the check if a load fails: libraries change.
Fallback if it ever disappears: **Inter** (`Bold`, `Semi Bold`, `Regular`).

## Type ramp

Mirrors the template's "Type sizes" slide, scaled for a 1920-wide artboard.
Text-style names on the left.

| Style name | Size / line height | Weight | Use |
|---|---|---|---|
| `display/number` | 160 / 90% | Bold | One big number per graphic |
| `display/title` | 72 / 95% | Bold | Infographic headline; two-tone with one pink phrase |
| `heading/large` | 44 / 100% | Bold | Section header inside a graphic |
| `heading/medium` | 30 / 105% | Bold | Card and column headers |
| `heading/small` | 22 / 110% | Bold | Labels, chip text |
| `body` | 20 / 125% | Regular | Body copy, never below 18 on a graphic meant for a stage screen |
| `caption` | 15 / 120% | Regular | Sources, footnotes, in `grey/caption` |

Headlines are sentence case, never title case, never all caps. The pink phrase
in a two-tone headline is the claim, not a random word: "the ones that
**classify nothing**", "already **inside**".

## Composition rules (from the template slides)

- Artboards are 16:9. Canonical sizes: `1920 x 1080` for stage and
  `1600 x 900` for docs. Margins 96px on the 1920 board.
- Title top-left, body right or below. Nothing centred except a lone statement.
- Cards: `paper/panel` fill, 12px radius, no stroke, no shadow. Header
  `heading/medium`, body `body`, 28px inner padding.
- Emphasis band: `pink/pale` fill, 12px radius, full content width, one line of
  text in `heading/small` bold plus body.
- Ladders and flows: steps as panels left to right, arrows in `grey/caption`
  2px, the rung you want people to pick in `pink/accent`.
- Chapter or hero boards: `ink/black` background, white headline, pink second
  line. Or the inverse: full `pink/accent` background with black text.
- No icons unless the n8n pixel icon set is supplied as assets. Shapes and type
  carry the graphic.
- Footer: n8n logo bottom-left (asset, via `upload_assets`), page or figure
  number bottom-right in `caption`. Leave the logo slot empty if the asset is
  not available; the ITL design team adds it.

## Helpers

`assets/helpers.js` carries `N8N` (the palette constants) and `n8nStyles()`
(creates every paint and text style above, guarded by name, and returns lookup
maps). Call `n8nStyles()` once per file before drawing; bind with
`fillStyleId` / `textStyleId` from the maps it returns.

## Provenance

Derived 2026-10-01 from the "n8n In the Loop Presentation Template" (Drive,
`Copy of n8n In the Loop Presentation Template.pptx`) and the ITL 2026 deck
"Agent Influence: Design for Containment" built the same day. Not the n8n
product design system (`EA4B71` is the only overlap) and not the n8n.io
website palette.
