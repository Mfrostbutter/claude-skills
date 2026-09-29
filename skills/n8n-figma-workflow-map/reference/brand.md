# Brand tokens

The map uses the n8n product palette: near-black surfaces, hairline borders, white
type, and n8n pink as the single brand accent. The source of truth is `THEMES` and
`HUE` in `scripts/render.mjs`; this page explains them. Change a value there, not
here, then update this table.

## Surfaces and type

| Token | Dark | Light | Used for |
|---|---|---|---|
| `bg` | `#040506` | `#FAFAFA` | Frame, data band |
| `panel` | `#0B0C0E` | `#FFFFFF` | Zone backgrounds, card bodies, pills |
| `raised` | `#14161A` | `#F3F4F6` | Schema card headers |
| `border` | `#1F2227` | `#E5E7EB` | Zone, card, and band hairlines, row dividers |
| `strong` | `#3A3E46` | `#D1D5DB` | Dashed (opt-in) zone borders |
| `text` | `#FFFFFF` | `#040506` | Titles, node titles, notes, table names |
| `text2` | `#9BA1A8` | `#6B7076` | Subtitle, node subtitles, captions, principle |
| `text3` | `#6B7076` | `#9CA3AF` | Legend |
| `brand` | `#EA4B71` | `#EA4B71` | Workflow pills, schema card titles, the mark |
| `line` | `#6B7076` | `#9CA3AF` | Connectors |

`brand` is the only accent. It marks n8n itself (workflow pills, the badge, card
titles) and nothing else. Never use it for a stage.

## Stage hues

Each stage owns one hue; the node fill is the hue mixed 15% into `panel`, the node
stroke is the full hue at 2px, and the stage note is a 11% fill with a 35% border.

| Hue | Hex | Role |
|---|---|---|
| `green` | `#22C55E` | Stage |
| `blue` | `#3DADFF` | Stage |
| `periwinkle` | `#7C8CF5` | Stage |
| `orange` | `#F5952E` | Stage |
| `violet` | `#A07BFF` | Stage |
| `teal` | `#2ABF9E` | Stage |
| `slate` | `#7C8CA3` | Opt-in or inactive workflow, always dashed |
| `red` | `#EF4444` | Error path only. Never a normal stage. |

The analyzer cycles the six stage hues in order. Reassign in the spec when two
adjacent stages land on hues that read too alike for the audience.

## Type

- **Inter**: title (Semi Bold 60), node titles (Semi Bold 18), notes and principle
  (Regular 17 to 19).
- **JetBrains Mono**: subtitle, stage labels, pills, node subtitles, table names,
  captions. Medium for labels, Regular for body. JetBrains Mono has no Semi Bold in
  Figma's font library; Medium is the heaviest weight used.

Both are in Figma's built-in library, so they render server-side with no upload.

## Logo and mark

- `assets/n8n-logo-on-dark.svg` and `n8n-logo-on-light.svg`: the full lockup, top
  left of the header, 30px tall. The theme picks the file.
- `assets/n8n-mark.svg`: the pink mark alone. Chunk 00 turns it into the
  `n8n/mark` component; pills, badges, and the legend are instances of it.
- Keep the proportions and the pink. Do not recolor, outline, or redraw it.
- The n8n name and logo are trademarks of n8n GmbH. They are bundled here only to
  depict n8n workflows; follow n8n's brand guidelines when a map is published.
- The badge on a node means "this step calls an n8n sub-workflow". Do not use it as
  decoration.
