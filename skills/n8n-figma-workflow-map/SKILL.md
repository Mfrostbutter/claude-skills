---
name: n8n-figma-workflow-map
description: >-
  Review a set of n8n workflows and build a complete, n8n-branded workflow map in
  Figma: orchestrators as staged rows, sub-workflow calls badged with the n8n
  mark, standalone and opt-in workflows as lanes, and a data-layer band of the
  tables each workflow reads and writes. Use when asked to map, diagram,
  visualize, or document how several n8n workflows fit together, to draw an
  architecture picture of an n8n project, or to produce a branded map for a
  handoff, a review, or a post. Dark (n8n brand) and light themes.
---

# n8n workflow map in Figma

A workflow map answers "how do these workflows fit together" in one picture. The
n8n editor shows one canvas at a time; the map shows the whole system: which
workflow orchestrates, which ones it calls, what runs on its own trigger, and
which tables everything touches.

The work splits in two, and the split is the point:

1. **Review** is code plus judgment. `scripts/analyze.mjs` reads the workflow JSON
   and drafts a spec: roles, stages, triggers, sub-workflow calls, SQL tables. You
   then edit the spec so it teaches, which a script cannot do.
2. **Render** is pure code. `scripts/render.mjs` turns the spec into ordered
   `use_figma` chunks with the brand, grid, and connectors baked in. You run them
   and check each one with a screenshot.

Never hand-draw the map. Hand placement is how boxes clip, connectors go diagonal,
and the brand drifts between maps.

## 1. Gather the workflows

You need exported workflow JSON, one file per workflow or one array file. Any of:

- The project's own `workflows/` directory, when it keeps exports in git.
- The n8n CLI: `n8n export:workflow --all --separate --output=<dir>`.
- The n8n public API (`GET /api/v1/workflows/{id}`) or an n8n MCP server, one
  workflow per file in a scratch dir.

Include every workflow the orchestrators call. A call to a workflow outside the set
is flagged in the review warnings and drawn without a target.

## 2. Analyze

```bash
node scripts/analyze.mjs <dir|file>... --title "Project name" --out spec.json
```

| Flag | Use |
|---|---|
| `--title T` | Map title, also the frame name (`Workflow map · T`) |
| `--hide REGEX` | Drop glue nodes by name (`^(Merge|Set|NoOp)`) so stages show the steps that matter |
| `--dashed REGEX` | Mark opt-in workflows dashed even when active; inactive ones are dashed already |
| `--theme dark\|light` | Dark is the n8n brand default; light for print or a light doc |

What it decides:

- **Roles.** An *orchestrator* calls sub-workflows and has an external trigger. A
  *sub-workflow* is called and has no trigger of its own. Everything else is
  *standalone*.
- **Rows.** One chained row per orchestrator, busiest first. Standalone workflows
  go in one lanes row, first four nodes each.
- **Stages.** From the orchestrator's sticky zones (`## Title` headings, in canvas
  order). No stickies means five-node chunks of execution order, flagged for rename.
- **Nodes.** Alternative triggers merge into one node ("Schedule or Webhook").
  Execute Workflow nodes become the called workflow, badged with the n8n mark.
- **Data.** Tables pulled from Postgres/MySQL SQL, grouped by schema, ten per card,
  captioned with the writers.

Read the warnings it prints. Each one names a fix.

## 3. Review the spec (the part that makes it a map)

Open `spec.json` and edit:

- **`principle`**: one sentence on the architecture decision that shapes the
  whole system. "One orchestrator, many sub-workflows, each collector
  continues on error so a dead source degrades the report instead of killing the
  run." Not a summary of the diagram.
- **Every `note`**: rewrite from `TODO rewrite as the why: ...` into the design
  decision the stage embodies and the failure it prevents. Never restate the node
  labels. A map that only labels does not teach.
- **Stage `label`s**: `N · NAME`, short, uppercase. Rename auto-cut stages.
- **Stage size**: six nodes maximum. Split a zone, or re-run with `--hide`.
- **Hues**: each stage owns one hue left to right (`green blue periwinkle orange
  violet teal`); lanes use their own. `slate` is for opt-in or inactive. `red` is
  reserved for error paths only.
- **`page`**: the Figma page to draw on (default `Workflow map`).
- **`review`**: a read-only record of what the analyzer found. The renderer
  ignores it.

Customer names, hostnames, and internal URLs in node names land on the map. Scrub
them in the spec before the map is shared outside the team that owns the workflows.

## 4. Render

```bash
node scripts/render.mjs spec.json --out chunks/
```

It lints first (TODO text left, unknown hue, stage over six nodes, empty stage),
then writes `00-setup.js`, one `NN-row.js` per row, `NN-data.js`, and
`NN-legend.js`. Each is under the `use_figma` code limit. Fix every lint warning
before you run anything.

## 5. Draw in Figma

1. `whoami` to confirm the account and get the `planKey`. Edits on a view-only
   account fail silently.
2. `create_new_file` (design file, not FigJam), or use the file the user named.
3. Run the chunks **in order**, one `use_figma` call each, passing the file text
   verbatim as `code`. `00-setup` creates the page, the `n8n/mark` component, the
   frame, and the header. Every later chunk finds the frame by name and appends
   below the lowest child. A rerun of `00-setup` renames the old frame to
   `(previous)` rather than deleting it.
4. `get_screenshot` on the frame after the setup and after each row. Look for text
   past a border, a connector crossing a box, a stage taller than its neighbors
   for no reason. Fix the spec and re-render; do not patch the frame by hand
   unless it is a one-word fix.
5. Export or share the frame link. The frame is named `Workflow map · <title>`.

Chunk 00 must run before any other; a chunk that cannot find the frame or the
mark component throws with that message.

## Rules

- **The spec is the source.** Edit the spec and re-render. Hand edits in Figma are
  lost on the next render.
- **Brand is fixed.** Tokens, hues, logo, and type live in `render.mjs` and
  `reference/brand.md`. Do not restyle per map; a map that looks different from the
  last one reads as a different system.
- **Use the real mark.** The logo and badge come from `assets/`. Never draw an n8n
  glyph, never recolor it.
- **One color system.** Hue means stage, never role. Red means error, never a
  stage.
- **Screenshot every chunk.** Do not run all chunks blind and look at the end.

## Tests

`node --test tests/*.test.mjs` from the skill folder. Synthetic fixtures, no
dependencies, no Figma or n8n instance needed.

## Reference

- `reference/brand.md`: dark and light tokens, stage hues, type, logo rules.
- `reference/layout.md`: the grid, spacing, and how rows and lanes are laid out.
- `reference/figma-gotchas.md`: Plugin API behaviors that break a map, and the fix
  for each.

For general Figma MCP mechanics (fonts, geometry, styles, the screenshot loop),
load `figma-design-build` from this repo alongside this skill.
