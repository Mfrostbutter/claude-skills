// use_figma, Design file, run once. Pages, n8n Primitives, n8n Color (Light +
// Dark), n8n Shape, nine n8n/ text styles. Idempotent by name. Returns the ids;
// save them to the ledger. Values from designer/brand-2026/tokens/colors.json.
const names = ["Cover", "Foundations", "Components", "Boards"];  // rename "Boards" for the subject
const pages = {};
const first = figma.root.children[0];
if (!names.includes(first.name)) first.name = "Cover";
for (const n of names) { let p = figma.root.children.find(p => p.name === n); if (!p) { p = figma.createPage(); p.name = n; } pages[n] = p.id; }

// Baumer is not in Figma's library; Inter and a mono twin stand in
const fonts = await figma.listAvailableFontsAsync();
const has = (fam, st) => fonts.some(f => f.fontName.family === fam && f.fontName.style === st);
const SANS = ["n8n Baumer Uniwidth", "Inter"].find(f => has(f, "Medium") && has(f, "Regular"));
const MONO = ["n8n Baumer Mono", "Geist Mono", "JetBrains Mono", "IBM Plex Mono"].find(f => has(f, "Medium") && has(f, "Regular")) || "Inter";
await Promise.all([[SANS,"Medium"],[SANS,"Regular"],[MONO,"Medium"],[MONO,"Regular"]].map(([family,style]) => figma.loadFontAsync({family, style})));

const rgb = h => { h = h.replace('#',''); return { r: parseInt(h.slice(0,2),16)/255, g: parseInt(h.slice(2,4),16)/255, b: parseInt(h.slice(4,6),16)/255 }; };
const rgba = (h, a) => Object.assign(rgb(h), { a });
const cols = await figma.variables.getLocalVariableCollectionsAsync();
const allVars = await figma.variables.getLocalVariablesAsync();
const getColl = (name, firstMode) => { let c = cols.find(c => c.name === name); if (!c) c = figma.variables.createVariableCollection(name); c.renameMode(c.modes[0].modeId, firstMode); return c; };
const getVar = (coll, name, type) => { let v = allVars.find(v => v.name === name && v.variableCollectionId === coll.id); if (!v) v = figma.variables.createVariable(name, coll, type); return v; };
const cssName = n => "var(--n8n-" + n.replace(/\//g, "-").replace(/\s+/g, "-").toLowerCase() + ")";

const prim = getColl("n8n Primitives", "Value"); const pm = prim.modes[0].modeId; const P = {};
const primitives = {
  "core/black": "191919", "core/white": "FAFAFA",
  "pink/10": "FFE8EC", "pink/20": "FFD0D9", "pink/30": "FFBCCA", "pink/main": "FF91AC", "pink/70": "87003C", "pink/80": "5A0026", "pink/90": "44001B",
  "gray/0": "FFFFFF", "gray/05": "FAFAFA", "gray/10": "F8F8F8", "gray/15": "F1F1F1", "gray/20": "EAEAEA", "gray/25": "E0E0E0", "gray/30": "D6D6D6", "gray/40": "BFBFBF", "gray/50": "A4A4A4", "gray/60": "868686", "gray/70": "676767", "gray/80": "464646", "gray/85": "353535", "gray/90": "242424", "gray/95": "191919",
};
for (const [n, h] of Object.entries(primitives)) { const v = getVar(prim, n, "COLOR"); v.setValueForMode(pm, rgb(h)); v.scopes = []; v.setVariableCodeSyntax("WEB", cssName(n)); P[n] = v; }

const sem = getColl("n8n Color", "Light"); const lm = sem.modes[0].modeId;
const dmode = sem.modes.find(m => m.name === "Dark"); const dm = dmode ? dmode.modeId : sem.addMode("Dark");
const alias = v => ({ type: "VARIABLE_ALIAS", id: v.id }); const S = {};
const semantics = [
  ["bg/primary",   alias(P["gray/05"]),  alias(P["gray/95"]),  ["FRAME_FILL","SHAPE_FILL"]],
  ["bg/secondary", alias(P["gray/15"]),  alias(P["gray/90"]),  ["FRAME_FILL","SHAPE_FILL"]],
  ["bg/tertiary",  alias(P["gray/20"]),  alias(P["gray/80"]),  ["FRAME_FILL","SHAPE_FILL"]],
  ["bg/accent",    alias(P["pink/main"]), alias(P["pink/80"]), ["FRAME_FILL","SHAPE_FILL"]],
  ["bg/accent-soft", alias(P["pink/10"]), alias(P["pink/90"]), ["FRAME_FILL","SHAPE_FILL"]],
  ["bg/inverse",   alias(P["core/black"]), alias(P["core/white"]), ["FRAME_FILL","SHAPE_FILL"]],
  ["type/primary", alias(P["core/black"]), alias(P["core/white"]), ["TEXT_FILL"]],
  ["type/secondary", rgba("191919", 0.5), rgba("FAFAFA", 0.7), ["TEXT_FILL"]],
  ["type/on-accent", alias(P["core/black"]), alias(P["core/white"]), ["TEXT_FILL"]],
  ["type/on-inverse", alias(P["core/white"]), alias(P["core/black"]), ["TEXT_FILL"]],
  ["type/accent",  alias(P["pink/70"]),  alias(P["pink/main"]), ["TEXT_FILL"]],
  ["border/default", alias(P["gray/40"]), alias(P["gray/70"]), ["STROKE_COLOR"]],
  ["border/strong", alias(P["core/black"]), alias(P["core/white"]), ["STROKE_COLOR"]],
  ["line/path",    alias(P["core/black"]), alias(P["core/white"]), ["STROKE_COLOR"]],
  ["line/accent",  alias(P["pink/main"]), alias(P["pink/main"]), ["STROKE_COLOR"]],
];
for (const [n, l, d, scopes] of semantics) { const v = getVar(sem, n, "COLOR"); v.setValueForMode(lm, l); v.setValueForMode(dm, d); v.scopes = scopes; v.setVariableCodeSyntax("WEB", cssName(n)); S[n] = v; }

const shape = getColl("n8n Shape", "Value"); const sm = shape.modes[0].modeId; const N = {};
const numbers = [["radius/card", 16, ["CORNER_RADIUS"]], ["radius/badge", 8, ["CORNER_RADIUS"]], ["radius/pill", 999, ["CORNER_RADIUS"]], ["radius/none", 0, ["CORNER_RADIUS"]],
  ["space/xs", 8, ["GAP"]], ["space/sm", 16, ["GAP"]], ["space/md", 24, ["GAP"]], ["space/lg", 40, ["GAP"]], ["space/xl", 64, ["GAP"]], ["space/margin", 96, ["GAP"]]];
for (const [n, val, scopes] of numbers) { const v = getVar(shape, n, "FLOAT"); v.setValueForMode(sm, val); v.scopes = scopes; v.setVariableCodeSyntax("WEB", cssName(n)); N[n] = v; }

const existing = await figma.getLocalTextStylesAsync(); const T = {};
const ramp = [
  ["n8n/Display", SANS, "Medium", 72, 100, -1, "Twin for n8n Baumer Uniwidth Medium. Hero statements."],
  ["n8n/Title", SANS, "Medium", 44, 110, -0.5, "Twin for n8n Baumer Uniwidth Medium. Artboard title."],
  ["n8n/Heading", SANS, "Medium", 30, 115, 0, "Twin for n8n Baumer Uniwidth Medium. Column and card headers."],
  ["n8n/Label", SANS, "Medium", 22, 125, 0, "Twin for n8n Baumer Uniwidth Medium. Card titles, step names."],
  ["n8n/Body", SANS, "Regular", 20, 135, 0, "Twin for n8n Baumer Uniwidth Regular. Body copy on a stage board."],
  ["n8n/Body small", SANS, "Regular", 17, 135, 0, "Twin for n8n Baumer Uniwidth Regular. Card body, descriptions."],
  ["n8n/Caption", SANS, "Regular", 14, 130, 0, "Twin for n8n Baumer Uniwidth Regular. Footnotes, sources."],
  ["n8n/Mono caps", MONO, "Medium", 14, 120, 6, "Twin for n8n Baumer Mono Medium. Capsules, dates, labels. Always caps, n8n stays lowercase."],
  ["n8n/Mono caps large", MONO, "Medium", 18, 120, 6, "Twin for n8n Baumer Mono Medium. Column labels."],
];
for (const [name, family, style, size, lh, tr, desc] of ramp) {
  let s = existing.find(s => s.name === name); if (!s) { s = figma.createTextStyle(); s.name = name; }
  s.fontName = { family, style }; s.fontSize = size; s.lineHeight = { value: lh, unit: "PERCENT" }; s.letterSpacing = { value: tr, unit: "PERCENT" }; s.description = desc; T[name] = s.id;
}
const ids = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.id]));
return { pages, fonts: { sans: SANS, mono: MONO }, collections: { primitives: prim.id, color: sem.id, shape: shape.id }, modes: { light: lm, dark: dm }, P: ids(P), S: ids(S), N: ids(N), T };
