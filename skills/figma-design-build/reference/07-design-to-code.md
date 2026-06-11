# Design-to-code + reading designs

The other direction: pull existing Figma designs into code, capture web pages into Figma, and map components.

## Reading a design

- `get_design_context(fileKey, nodeId)` — the primary design-to-code tool. Returns reference code + a screenshot + asset download URLs + metadata. Adapt the code to the target project's conventions; do not paste verbatim. `forceCode: true` forces code even when output is large; `excludeScreenshot` to save context (not recommended).
- `get_metadata(fileKey[, nodeId])` — cheap structural overview: node ids, types, names, positions, sizes (XML). Omit `nodeId` to list the document's top-level pages, then drill in. Use this to find the node you want before `get_design_context`. Design files only (not FigJam/Slides).
- `get_screenshot` — visual reference for any node (see `06`).
- `get_variable_defs`, `get_design_context` together expose variables/tokens used by a node.

Typical flow: `get_metadata` (no nodeId → pages) → `get_metadata(pageId)` → pick the frame → `get_design_context(frame)` → adapt to code.

## Code → design (write into Figma)

- `use_figma` — the general write tool (everything in this skill). Default for creating/editing Figma from intent or code.
- `generate_figma_design` — the **exception**: use only when capturing a **web app page/view** into Figma for the first time (pixel-perfect screenshot capture). For web apps, run `generate_figma_design` and `use_figma` in parallel: the former captures, the latter rebuilds from design-system components, then refine `use_figma` against the screenshot. For non-web / from-scratch / updating an already-captured page, use `use_figma` only.
- `create_new_file` — blank file before writing (see `01`).
- `upload_assets` — push image assets into Figma.

## Code Connect (map components to code)

- `get_code_connect_map`, `add_code_connect_map`, `get_code_connect_suggestions`, `send_code_connect_mappings`, `get_context_for_code_connect` — link Figma components to their codebase implementations so design-to-code emits your real components. Use when a design system exists in both Figma and code.

## FigJam + diagrams

- `get_figjam`, `generate_diagram` — FigJam boards and diagrams. `generate_diagram` has a mandatory `/figma-generate-diagram` skill to load first when present. FigJam uses `/board/` URLs; design tools use `/design/`; slides `/slides/`. `get_metadata` does not work on FigJam/Slides.

## Skills the server expects (load first if present)

- `/figma-use` before `use_figma`.
- `/figma-generate-design` before `generate_figma_design`.
- `/figma-generate-library` for building a design system in Figma from code.
- `/figma-code-connect` for Code Connect flows.
- `/figma-generate-diagram` before `generate_diagram`.

If a server skill is not installed, this skill's rules stand in.
