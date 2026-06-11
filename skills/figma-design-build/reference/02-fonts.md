# Fonts (the most important limitation)

## The cloud MCP renders server-side from Figma's built-in library

`use_figma` and `get_screenshot` execute on Figma's servers, **not** in the user's desktop app. Consequence: the only fonts available are Figma's built-in library (effectively Google Fonts + a standard set). **Locally installed fonts and Adobe Creative Cloud / Adobe Fonts faces are invisible to the cloud MCP**, even after the user activates them.

Verified the hard way: a user activated **Forma DJR Deck** via Creative Cloud; `listAvailableFontsAsync` still did not list it (only an unrelated `Petit Formal Script` matched `/forma/`). Adobe-exclusive faces (Forma DJR, Acumin, Neue Haas Grotesk, Söhne, GT America, Aeonik) cannot be rendered here.

### Pattern: "twin in mockups, real in prod"

If the brand's chosen display/body font is not in the library:
- Build all mockups with the **closest available twin** (e.g. Schibsted Grotesk or Inter for a neo-grotesque; Fraunces for a soft serif).
- Production CSS ships the **real** font.
- The user can swap nodes to the real font in **their** desktop app (it has the local font). But once a node is set to a font the cloud cannot load, the MCP can no longer **edit** that text (see "load-before-edit").
- Better outcome: if a fully-renderable, self-hostable family fits (e.g. **Geist + Geist Mono**, open-license, in the library), prefer it. No twin, no hosting cost, mockups use the real face.

## Discover before you load

Never guess style names. Discover:

```js
const all = await figma.listAvailableFontsAsync();
const want = ["Geist","Geist Mono","Inter","Fraunces"];
const out = {};
for (const f of all) { const fam = f.fontName.family;
  if (want.includes(fam)) (out[fam] ??= []).push(f.fontName.style); }
return out;
```

## Load before you set OR edit text

You must `await figma.loadFontAsync({family, style})` for **every** font you will set. To **edit** existing text you must load its **current** font too (so when changing fonts, load both old and new). Load everything up front:

```js
await Promise.all([
  ["Geist","Black"],["Geist","Bold"],["Geist","Regular"],
  ["Geist Mono","Medium"]
].map(([family,style]) => figma.loadFontAsync({family,style})));
```

## Style-name gotchas

Style strings differ per family. Confirm via discovery; common traps:
- Inter: `Semi Bold`, `Extra Bold`, `Extra Light` (with spaces).
- Archivo: `Extra Bold` (space).
- Geist / Geist Mono: `SemiBold`, `ExtraBold` (no space). Geist Mono also has `Black`…`Thin`.
- `figma.mixed` is returned for `node.fontName` when a text node has multiple fonts in its range; guard with `if (fn !== figma.mixed)` before reading `fn.family`.

## Two-tone / partial color text

Color part of a string with `setRangeFills(start, end, paints)` after setting a base fill. Font does not need to differ; only fills. See `03-geometry-and-drawing.md`.
