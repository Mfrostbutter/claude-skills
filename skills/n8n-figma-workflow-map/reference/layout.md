# Layout

Every map uses the same grid so maps can sit side by side and read as one family.
Constants live in the `render.mjs` prelude.

## Grid

| Constant | Value | Meaning |
|---|---|---|
| `M` | 100 | Outer margin, all sides |
| `ZW` | 420 | Zone (stage) width |
| `PITCH` | 480 | Zone x step, so 60 between zones |
| `NW` | 356 | Node width, 32 inset from the zone edge |
| `GAP` | 22 | Vertical gap between nodes in a zone |
| `NOTE_GAP` | 44 | Gap from zone bottom to its note |

Frame width is `200 + columns * 480 - 60`, floor 1600, where columns is the widest
row (chained rows use every stage, lanes cap at five per line, data cards cap at
five). Height grows with content; each chunk resizes the frame to fit.

## Header

Logo at (M, 64). Title below it, subtitle below that with ` · ` separators. The
principle card sits top right, 940 wide, sized to its text.

## Rows

Rows stack top to bottom in spec order, 110 apart, with a hairline divider between.

- **Chained row** (an orchestrator): a pink workflow pill and a mono caption with
  the trigger, then its stages left to right. The last node of each stage connects
  to the first node of the next with an orthogonal elbow in the 60px gutter. Nodes
  inside a stage connect top-down.
- **Lanes row** (standalone workflows): one caption, then one lane per workflow,
  each with its own pill above the zone label. Five lanes per line, then wrap. No
  cross-lane connectors, because lanes do not call each other.

Stage label is `N · NAME` above the zone. Zone height fits its nodes; stages in a
row are not forced to equal height. The note hangs `NOTE_GAP` below its own zone.

## Nodes

Title in Inter, subtitle in mono (what the node does: schedule, table, endpoint,
"sub-workflow"). Height snaps to 50, 70, 88, 106, or 124 from the content so a row
of nodes lines up. A badge reserves 44px on the right of the title.

## Data band

Full width, `bg` fill with a hairline so it reads as a floor under the rows. Label
`DATA LAYER` and the table count, then schema cards on the zone pitch: a `raised`
header with the schema name in pink, the table names, and a caption under the card
naming the writers.

## Legend

One mono line under the band: badge meaning, dashed meaning, and that notes explain
decisions rather than nodes.

## Density limits

- Six nodes per stage. Past that, split the zone or hide glue nodes.
- Four nodes per lane. The analyzer truncates; a lane is a summary, not the canvas.
- Ten tables per card. The analyzer splits a schema into `schema · 1`, `schema · 2`.
