---
name: figma-design-build
description: >-
  Build, design, edit, or read designs in Figma through the Figma MCP (the
  cloud connector: use_figma plugin-API calls + get_screenshot feedback loop),
  and do design-to-code. Use whenever the task is to create or change a Figma
  file, mock up a UI / logo / infographic / design system, build Figma styles
  or components, or pull a Figma design into code. Encodes the hard-won rules:
  server-side font limits, load-before-edit, page/layer access, geometry and
  shear math, styles + components, and organize-as-you-go layer hygiene so the
  file is clean by construction, not cleaned up after.
---

# Figma design + build via the MCP

The Figma MCP runs JavaScript against the **Figma Plugin API** (`use_figma`) and renders **server-side**. You drive it like a headless design tool and verify with `get_screenshot`. This skill is the operating manual: the loop, the limits, and the hygiene.

## Two modes

1. **Build from scratch / edit** (the common case): author UI, logos, infographics, design systems with `use_figma`, verifying each step with `get_screenshot`. This is most of this skill.
2. **Design-to-code**: read an existing design with `get_design_context` / `get_metadata` / `get_screenshot`, or capture a web page with `generate_figma_design`. See `reference/07-design-to-code.md`.

## Before you touch a tool

- Many Figma tools are **deferred**. Load their schemas with ToolSearch first (e.g. `select:mcp__claude_ai_Figma__use_figma,mcp__claude_ai_Figma__get_screenshot,mcp__claude_ai_Figma__whoami`).
- The server instructions say load the **`/figma-use` skill before `use_figma`** when it exists. If it is not installed, proceed using this skill's rules.
- Confirm the account with `whoami` (returns the `planKey` you need to create files). Right account matters: edits fail silently on a view-only account. See `reference/01-setup-and-auth.md`.

## Core principles (do not skip)

1. **The screenshot loop is the work.** Build a small piece, `get_screenshot`, read it, fix, repeat. Never author a large design blind. Hand-authoring without rendering is how you ship ugly. `reference/06-screenshot-loop.md`.
2. **Fonts render server-side from Figma's built-in library (Google Fonts).** Locally-installed / Adobe Creative Cloud fonts are invisible to the cloud MCP, even when the user has them. If a brand font is not in the library, mock with the closest available twin and ship the real font in production. Always `loadFontAsync` before setting or editing any text. `reference/02-fonts.md`.
3. **Organize and label as you go, never as an afterthought.** This is a requirement, not a nicety:
   - `node.name = "..."` on **every** node you create (text → its content, rects → their role: `bg`, `divider`, `card`). Default `Rectangle` / `Text` names are not acceptable.
   - Build each section inside a **named container** (frame or group), or group it the moment the section is finished. Use stable section names (`Nav`, `Hero`, `Stat band`, ...).
   - **Bind to styles from the first draw** (`fillStyleId`, `textStyleId`, `effectStyleId`), not after. If the design system does not exist yet, create the styles first, then build against them.
   - Name components semantically with `/` folders (`Logo/Mark`, `Button/Primary`, `Model-chip/Haiku`).
   A file built this way needs no cleanup pass. `reference/05-pages-and-layers.md`.
4. **Verify state before mutating.** `await figma.setCurrentPageAsync(page)` before reading `page.children` (otherwise it returns `[]`). Return real node ids from `use_figma` so you can screenshot them.

## Standard playbook (build-from-scratch)

1. `whoami` → account + `planKey`. `create_new_file` if needed → capture `fileKey`.
2. **Foundations first.** Create paint / text / effect styles (guard by name to avoid duplicates). This locks the palette + type ramp and makes step 4 bindable. `reference/04-styles-and-components.md`.
3. **Discover fonts** you intend to use with `listAvailableFontsAsync` filtered to your candidates; record exact style names (they vary: `Semi Bold` vs `SemiBold`). `loadFontAsync` all of them up front.
4. **Build, named + bound + grouped as you go.** Use a reusable helper block (`assets/helpers.js`) for `rect`, `roundedRect`, `text`, `chip`, shadows, shear bars, etc. Draw backgrounds before text (z-order = append order).
5. `get_screenshot` the frame (real node id, `enableBase64Response: true` if you cannot fetch URLs). Read, fix, repeat.
6. **Components**: promote repeated UI to `createComponent`; group variants with `combineAsVariants`.
7. **Keep the file clean**: one page per purpose, delete rejected explorations as decisions land, never accumulate orphan boards.

## Geometry you will need

Rects, ellipses, text only get you so far. For slanted/parallelogram shapes use a **shear matrix** via `relativeTransform`; for arbitrary line segments use a thin rect + matrix; for two-tone text use `setRangeFills`. Exact formulas in `reference/03-geometry-and-drawing.md`. Rectangles **cannot** have children, and later-appended siblings render on top.

## Reference (read on demand)

- `reference/01-setup-and-auth.md` — accounts, planKey, file/node id extraction.
- `reference/02-fonts.md` — the server-side font reality, load rules, style-name gotchas, twin pattern.
- `reference/03-geometry-and-drawing.md` — z-order, shear/parallelogram math, lines, two-tone, rotation vs skew.
- `reference/04-styles-and-components.md` — create + bind styles, components, variants.
- `reference/05-pages-and-layers.md` — page access, the organize-as-you-go discipline, naming conventions.
- `reference/06-screenshot-loop.md` — screenshot ids, base64 vs URL, the iteration cadence.
- `reference/07-design-to-code.md` — reading designs + web capture + Code Connect.
- `reference/08-gotchas.md` — the specific errors hit in practice and their fixes.
- `assets/helpers.js` — copy-paste helper library for `use_figma` calls.
