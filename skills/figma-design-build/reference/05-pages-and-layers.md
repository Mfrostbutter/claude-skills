# Pages + the organize-as-you-go discipline

## Page access requires setCurrentPageAsync

Reading `page.children` on a page that is not current returns `[]` (and then `.find(...)` is undefined, and you get `cannot read property 'x' of undefined`). Always:

```js
const page = figma.root.children.find(p=>p.name==="My Page");
await figma.setCurrentPageAsync(page);
const frame = page.children.find(c=>c.name==="my-frame"); // now populated
```

`figma.createPage()` makes a page; set `.name`. To switch, `await figma.setCurrentPageAsync(page)`. Setting `figma.currentPage = page` directly is not supported.

## Organize and label AS YOU BUILD (core requirement)

A clean file is built clean, not cleaned up afterward. Bake these into the build:

1. **Name every node on creation.**
   - Text → its content: `t.name = t.characters.slice(0,32)`.
   - Shapes → their role: `bg`, `divider`, `card`, `accent-bar`, `agent-node`.
   - Never leave default `Rectangle` / `Ellipse` / `Text`.
2. **Build inside named containers.** Prefer creating a named `FrameNode` per section and appending into it, so structure exists from the start. If you build flat for speed, **group each section the moment it is done** and name the group (`Nav`, `Hero`, `Stat band`, `Services`, `CTA band`, `Footer`).
3. **Bind to styles immediately** (`fillStyleId` / `textStyleId` / `effectStyleId`). Do not use raw hex and "stylize later".
4. **Name components semantically** with `/` folders.
5. **One page per purpose.** `Library · Foundations`, `Library · Components`, `Homepage mock`, `Infographics`. Do not pile unrelated work on one page.
6. **Delete rejected explorations as decisions land.** When the user picks an option, remove the boards/pages they rejected in the same session. Do not accumulate orphan exploration boards.

### Grouping a flat frame after the fact (fallback)

If you inherited a flat frame, snapshot children, bucket by vertical band, group each:

```js
const kids=[...F.children];
for(const n of kids) if(n.type==="TEXT"){const s=(n.characters||"").replace(/\n/g," ").trim(); if(s) n.name=s.slice(0,32);}
const B={Nav:[],Hero:[],Footer:[]};               // bucket by n.y ranges
for(const n of kids){ const y=n.y; /* push into B[...] by band */ }
for(const [name,arr] of Object.entries(B)) if(arr.length){ const g=figma.group(arr,F); g.name=name; }
```

`figma.group(nodes, parent)` preserves positions and relative stacking. Grouping by non-overlapping vertical bands keeps the render identical. Prefer doing this **as each section finishes**, not at the end.

## File hygiene checklist (true throughout, not just at the end)

- [ ] Every node named meaningfully.
- [ ] Sections in named groups/frames.
- [ ] Fills/text/effects bound to styles.
- [ ] Components foldered semantically.
- [ ] One page per purpose; rejected explorations removed.
