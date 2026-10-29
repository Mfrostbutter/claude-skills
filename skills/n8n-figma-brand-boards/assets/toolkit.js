// n8n graphic elements for use_figma, after Juanma Ramiau's n8n Design Toolkit
// plugin (designer/brand-2026/figma-toolkit). Paste the helpers you need under
// the board prelude. Values and rules: n8n-brand/reference/graphic-modes.md and
// designer/brand-2026/n8ndesign.md (the official file wins where the plugin
// differs). Colours are hex here, resolved per graphic mode from the frame
// background, because these elements are fixed by the brand, not themed.
const MODULE = 36, MAJOR = 72;
const hex = h => { h = h.replace("#", ""); return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255 }; };
const rgbToHex = c => "#" + [c.r, c.g, c.b].map(v => Math.round(v * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
const solidHex = (h, o = 1) => ({ type: "SOLID", color: hex(h), opacity: o });
const isDark = c => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b < 0.5;
const frameBg = f => { const p = f.fills; return p && p !== figma.mixed && p.length && p[0].type === "SOLID" ? p[0].color : hex("#FAFAFA"); };
const bgPaints = f => { const p = f.fills; return p && p !== figma.mixed && p.length ? JSON.parse(JSON.stringify(p)) : [solidHex("#FAFAFA")]; };
const gcd = (a, b) => b ? gcd(b, a % b) : a;
const lcm = (a, b) => a * b / gcd(a, b);
const R = n => Math.round(n * 100) / 100;
const hasFont = (fonts, family, style) => fonts.some(f => f.fontName.family === family && f.fontName.style === style);

// ---- Grid -----------------------------------------------------------------
// Graphic mode of a frame by its background: light | dark | maker (n8ndesign.md section 3)
const MODE_BG = { "#FAFAFA": "light", "#F1F1F1": "light", "#191919": "dark", "#242424": "dark", "#BFBFBF": "maker", "#868686": "maker" };
const modeOf = f => MODE_BG[rgbToHex(frameBg(f))] || (isDark(frameBg(f)) ? "dark" : "light");
const TOK = {
  light: { bgAccent: "#FF91AC", bgTertiary: "#EAEAEA", typePrimary: "#191919", dot: "#D6D6D6", dotAccent: "#FFD0D9", connector: "#191919", crosshair: "#E0E0E0" },
  dark:  { bgAccent: "#5A0026", bgTertiary: "#464646", typePrimary: "#FAFAFA", dot: "#464646", dotAccent: "#FFD0D9", connector: "#FAFAFA", crosshair: "#676767" },
  maker: { bgAccent: "#FFBCCA", bgTertiary: "#676767", typePrimary: "#F8F8F8", dot: "#A4A4A4", dotAccent: "#F1F1F1", connector: "#FAFAFA", crosshair: "#EAEAEA" } };
const DOTS = { xlarge: [72, 12], xlargeSmall: [72, 8], large: [36, 12], small: [36, 8], largeCondensed: [24, 8], smallCondensed: [12, 4] };

// Content area and dot lattice of a frame: margins 72, unit lcm(36, spacing) capped at 144,
// leftover split between opposite margins.
function gridLayout(frame, preset = "large", margin = 72) {
  const [spacing, dotSize] = DOTS[preset] || DOTS.large;
  let unit = lcm(MODULE, spacing); const aligned = unit <= 144; if (!aligned) unit = MODULE;
  const axis = (L, u) => { const usable = L - 2 * margin, n = Math.floor(usable / u + 1e-6), size = n * u; return { start: margin + Math.floor((usable - size) / 2), size }; };
  const gx = axis(frame.width, unit), gy = axis(frame.height, unit);
  const dx = aligned ? gx : axis(frame.width, spacing), dy = aligned ? gy : axis(frame.height, spacing);
  return { area: { x: gx.start, y: gy.start, w: gx.size, h: gy.size }, spacing, dotSize,
    dots: { x: dx.start, y: dy.start, nx: Math.round(dx.size / spacing) + 1, ny: Math.round(dy.size / spacing) + 1 } };
}

// Native guide grid: 36 minor at 12 percent, 72 major at 30, content edges at 60. A working aid only:
// the official cross grid is never visible in the output, so run clearGuides(frame) before handover.
function clearGuides(frame) { frame.layoutGrids = []; }
function guideGrid(frame, L, pink = "#FF91AC") {
  const c = a => Object.assign(hex(pink), { a });
  const line = (pattern, offset, count, step, color) => ({ pattern, alignment: "MIN", visible: true, color, count: Math.max(1, count), sectionSize: 1, gutterSize: Math.max(0, step - 1), offset });
  const A = L.area;
  frame.layoutGrids = [
    line("COLUMNS", A.x, A.w / MODULE + 1, MODULE, c(0.12)), line("ROWS", A.y, A.h / MODULE + 1, MODULE, c(0.12)),
    line("COLUMNS", A.x, Math.floor(A.w / MAJOR) + 1, MAJOR, c(0.3)), line("ROWS", A.y, Math.floor(A.h / MAJOR) + 1, MAJOR, c(0.3)),
    { pattern: "COLUMNS", alignment: "MIN", visible: true, color: c(0.6), count: 2, sectionSize: 1, gutterSize: A.w - 1, offset: A.x },
    { pattern: "ROWS", alignment: "MIN", visible: true, color: c(0.6), count: 2, sectionSize: 1, gutterSize: A.h - 1, offset: A.y }];
}

// Dot grid over the whole frame on the content lattice, masked to the content area.
// Group "Dot grid" { Crop (mask, edges on dot centres), Dots (locked vector) }.
// Colour defaults to Dot Grid/Primary of the frame's mode; "accent" picks Dot Grid/Accent.
function dotGrid(frame, L, color, opacity = 1) {
  const T = TOK[modeOf(frame)]; color = color === "accent" ? T.dotAccent : (color || T.dot);
  const { spacing: sp, dotSize } = L, r = dotSize / 2, A = L.dots;
  const kx = Math.max(0, Math.floor((A.x - r) / sp + 1e-6)), ky = Math.max(0, Math.floor((A.y - r) / sp + 1e-6));
  const x0 = A.x - kx * sp, y0 = A.y - ky * sp;
  const nx = Math.floor((frame.width - r - x0) / sp + 1e-6) + 1, ny = Math.floor((frame.height - r - y0) / sp + 1e-6) + 1;
  if (nx * ny > 40000) throw new Error("Too many dots (" + nx * ny + "); use a wider spacing");
  const k = 0.5522847498 * r;
  const circle = (cx, cy) => `M ${R(cx + r)} ${R(cy)} C ${R(cx + r)} ${R(cy + k)} ${R(cx + k)} ${R(cy + r)} ${R(cx)} ${R(cy + r)} C ${R(cx - k)} ${R(cy + r)} ${R(cx - r)} ${R(cy + k)} ${R(cx - r)} ${R(cy)} C ${R(cx - r)} ${R(cy - k)} ${R(cx - k)} ${R(cy - r)} ${R(cx)} ${R(cy - r)} C ${R(cx + k)} ${R(cy - r)} ${R(cx + r)} ${R(cy - k)} ${R(cx + r)} ${R(cy)} Z`;
  const parts = []; for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) parts.push(circle(r + i * sp, r + j * sp));
  const crop = figma.createRectangle(); frame.appendChild(crop); crop.name = "Crop";
  crop.resize(Math.max(0.01, (A.nx - 1) * sp), Math.max(0.01, (A.ny - 1) * sp)); crop.x = A.x; crop.y = A.y;
  crop.fills = [solidHex("#FFFFFF")]; crop.strokes = [solidHex("#FFFFFF")]; crop.strokeAlign = "OUTSIDE"; crop.strokeWeight = r + 0.5; crop.isMask = true;
  const v = figma.createVector(); frame.appendChild(v); v.name = "Dots";
  v.vectorPaths = [{ windingRule: "NONZERO", data: parts.join(" ") }]; v.fills = [solidHex(color, opacity)]; v.strokes = []; v.x = x0 - r; v.y = y0 - r; v.locked = true;
  const g = figma.group([crop, v], frame); g.name = "Dot grid " + sp + "/" + dotSize; return g;
}

// Background-coloured rectangle under `box` that hides the dots it touches, whole dots only,
// `rows` rows of dots around it. Insert it right below the box.
function dotCover(frame, L, box, rows = 1, name = "Margin") {
  const { spacing: sp, dotSize } = L, r = dotSize / 2, m = Math.max(r + 2, (rows - 0.5) * sp + r + 1);
  const ext = (lo, hi, start) => { let a = lo, z = hi; const i0 = Math.ceil((lo - r - start) / sp - 1e-6), i1 = Math.floor((hi + r - start) / sp + 1e-6); for (let i = i0; i <= i1; i++) { const c = start + i * sp; if (c + r > lo && c - r < hi) { a = Math.min(a, c - r - 1); z = Math.max(z, c + r + 1); } } return [a, z]; };
  const [x0, x1] = ext(box.x - m, box.x + box.width + m, L.dots.x % sp), [y0, y1] = ext(box.y - m, box.y + box.height + m, L.dots.y % sp);
  const c = figma.createRectangle(); frame.insertChild(frame.children.indexOf(box), c); c.name = name;
  c.resize(x1 - x0, y1 - y0); c.x = x0; c.y = y0; c.fills = bgPaints(frame); c.strokes = []; return c;
}

// ---- Deboss ---------------------------------------------------------------
// Official per-mode values (n8ndesign.md 2.2). Primary on neutral surfaces, Pinks on the mode's
// Background/Accent Pink. [top-left colour, alpha], [bottom-right colour, alpha].
const DEBOSS = {
  light: { primary: [["#EAEAEA", 1], ["#FFFFFF", 1]], pinks: [["#DB6B87", 0.5], ["#FFBCCA", 0.5]] },
  dark:  { primary: [["#191919", 1], ["#FAFAFA", 0.1]], pinks: [["#44001B", 1], ["#661A2D", 1]] },
  maker: { primary: [["#191919", 0.1], ["#FAFAFA", 0.2]], pinks: [["#191919", 0.1], ["#FAFAFA", 0.2]] } };
// offset, top-left blur, bottom-right blur
const DEBOSS_GEOM = { primary: { S: [4, 8, 8], M: [8, 12, 12], L: [12, 16, 16] }, pinks: { S: [4, 8, 8], M: [6, 16, 8], L: [12, 22, 22] } };

// Deboss box filled with the surface colour around it. opts { mode (auto by frame background),
// pinks: true for the Pinks family on an accent-pink surface, size S|M|L, radius 24 (Radius/XL),
// fill: override }. w and h in px (8 modules = 288).
function deboss(frame, x, y, w = 288, h = 288, opts = {}) {
  const mode = opts.mode || modeOf(frame), family = opts.pinks ? "pinks" : "primary", size = opts.size || "M";
  const [sh, hl] = DEBOSS[mode][family], [o, rs, rh] = DEBOSS_GEOM[family][size];
  const eff = (off, rad, [c, a]) => ({ type: "INNER_SHADOW", color: Object.assign(hex(c), { a }), offset: { x: off, y: off }, radius: rad, spread: 0, visible: true, blendMode: "NORMAL" });
  const r = figma.createRectangle(); frame.appendChild(r); r.name = "Deboss / " + family + " " + size;
  r.resize(w, h); r.x = x; r.y = y; r.cornerRadius = opts.radius == null ? 24 : opts.radius;
  r.fills = opts.fill ? [solidHex(opts.fill)] : (opts.pinks ? [solidHex(TOK[mode].bgAccent)] : bgPaints(frame));
  r.effects = [eff(o, rs, sh), eff(-o, rh, hl)];
  return r;
}

// ---- Capsules (72 spec, official tokens) ----------------------------------
// items [{ text, color: "pink" | "gray" | "#hex" }], opts { height 72, connector dots|crosses|none, mode }.
// Fill Background/Accent Pink or Background/Tertiary, text Type/Primary, dots Capsule Connector Dot,
// crosshairs Stroke + Crosshairs/Secondary, all of the frame's mode. Labels only, never sentences;
// one connector style per layout. Mono: Baumer Mono when the file has it, else Geist Mono (say so).
async function pills(frame, x, y, items, opts = {}) {
  const h = opts.height || 72, k = h / 72, fonts = await figma.listAvailableFontsAsync();
  const font = [["n8n Baumer Mono", "Regular"], ["Geist Mono", "Regular"], ["JetBrains Mono", "Regular"]].map(([family, style]) => ({ family, style })).find(f => hasFont(fonts, f.family, f.style));
  await figma.loadFontAsync(font);
  const T = TOK[opts.mode || modeOf(frame)], mark = hex(T.connector), crossColor = hex(T.crosshair);
  const box = figma.createFrame(); frame.appendChild(box); box.name = "Pills"; box.layoutMode = "HORIZONTAL"; box.primaryAxisSizingMode = "AUTO"; box.counterAxisSizingMode = "AUTO"; box.itemSpacing = 0; box.counterAxisAlignItems = "CENTER"; box.fills = []; box.clipsContent = false;
  const dot = (p, px, py, hA, vA) => { const d = h / 4, e = figma.createEllipse(); e.name = "Dot"; e.resize(d, d); e.fills = [{ type: "SOLID", color: mark }]; p.appendChild(e); e.layoutPositioning = "ABSOLUTE"; e.x = px - d / 2; e.y = py - d / 2; e.constraints = { horizontal: hA, vertical: vA }; };
  const cross = (p, px, py, hA, vA) => { const c = 12 * k, hc = c / 2, v = figma.createVector(); v.name = "Cross"; v.vectorPaths = [{ windingRule: "NONZERO", data: `M ${hc} 0 L ${hc} ${c} M 0 ${hc} L ${c} ${hc}` }]; v.strokes = [{ type: "SOLID", color: crossColor }]; v.strokeWeight = 1.5 * k; v.fills = []; p.appendChild(v); v.layoutPositioning = "ABSOLUTE"; v.x = px - hc; v.y = py - hc; v.constraints = { horizontal: hA, vertical: vA }; };
  const made = [];
  items.forEach((it, i) => {
    const p = figma.createFrame(); box.appendChild(p); p.name = "Pill " + (i + 1); p.layoutMode = "HORIZONTAL"; p.primaryAxisSizingMode = "AUTO"; p.counterAxisSizingMode = "FIXED"; p.resize(100, h); p.counterAxisAlignItems = "CENTER"; p.paddingLeft = p.paddingRight = h / 2; p.paddingTop = p.paddingBottom = 0; p.cornerRadius = h / 2; p.clipsContent = false;
    p.fills = [solidHex(it.color === "gray" ? T.bgTertiary : it.color && it.color[0] === "#" ? it.color : T.bgAccent)];
    const t = figma.createText(); t.fontName = font; t.characters = String(it.text).toUpperCase().replace(/N8N/g, "n8n"); t.fontSize = 34 * k; t.lineHeight = { unit: "PERCENT", value: 110 }; try { t.leadingTrim = "CAP_HEIGHT"; } catch (e) {} t.textAutoResize = "WIDTH_AND_HEIGHT"; t.fills = [solidHex(T.typePrimary)]; t.name = "Text"; p.appendChild(t);
    made.push(p);
  });
  const conn = opts.connector || "dots";
  made.forEach((p, j) => { const last = j === made.length - 1; if (conn === "dots") { dot(p, 0, h / 2, "MIN", "CENTER"); if (last) dot(p, p.width, h / 2, "MAX", "CENTER"); } else if (conn === "crosses") { cross(p, 0, 0, "MIN", "MIN"); cross(p, 0, h, "MIN", "MAX"); if (last) { cross(p, p.width, 0, "MAX", "MIN"); cross(p, p.width, h, "MAX", "MAX"); } } });
  box.x = x; box.y = y; return box;
}

// ---- Headline text (Baumer presets) ---------------------------------------
// Official type scale (n8ndesign.md 1.2): size -> line height px, letter spacing percent.
// Above 80 is Display at 90 percent line height. Headlines Medium, body Regular.
const SCALE = { 180: [162, -1], 160: [144, -1], 120: [108, -1], 80: [80, -1], 56: [56, -1], 48: [48, -1], 40: [42, -1], 32: [36, 0], 28: [32, 0], 24: [24, 0], 20: [24, 0], 18: [22, 0], 16: [20, 0], 14: [18, 0] };
function typePreset(size) {
  const style = size >= 20 ? "Medium" : "Regular";
  if (SCALE[size]) return { lh: SCALE[size][0], ls: SCALE[size][1], style };
  if (size > 80) return { lh: Math.round(size * 0.9), ls: -1, style };
  const near = Object.keys(SCALE).map(Number).reduce((a, b) => Math.abs(b - size) < Math.abs(a - size) ? b : a);
  return { lh: Math.round(size * SCALE[near][0] / near), ls: SCALE[near][1], style };
}
// Headline on the official scale; *asterisks* highlight in Type/Accent pink (pink text fails contrast
// on light backgrounds, keep highlights short); height rounded up to whole modules.
// Sans: Baumer Uniwidth when the file has it, else Inter.
async function headline(frame, x, y, w, size, raw) {
  const preset = typePreset(size);
  const fonts = await figma.listAvailableFontsAsync();
  const family = ["n8n Baumer Uniwidth", "Inter"].find(f => hasFont(fonts, f, preset.style));
  const font = { family, style: preset.style }; await figma.loadFontAsync(font);
  const ranges = []; let plain = ""; raw.split("*").forEach((part, i) => { if (i % 2) ranges.push([plain.length, plain.length + part.length]); plain += part; });
  const t = figma.createText(); frame.appendChild(t); t.fontName = font; t.characters = plain || " "; t.fontSize = size; t.lineHeight = { unit: "PIXELS", value: preset.lh }; t.letterSpacing = { unit: "PERCENT", value: preset.ls }; try { t.leadingTrim = "CAP_HEIGHT"; } catch (e) {}
  t.fills = [solidHex(TOK[modeOf(frame)].typePrimary)]; ranges.forEach(([a, b]) => t.setRangeFills(a, b, [solidHex("#FF91AC")]));
  t.textAutoResize = "WIDTH_AND_HEIGHT"; if (w && t.width > w) { t.textAutoResize = "HEIGHT"; t.resize(w, t.height); }
  const hh = Math.ceil(t.height / MODULE) * MODULE; t.textAutoResize = "NONE"; t.resize(t.width, hh); t.x = x; t.y = y; t.name = plain.slice(0, 40); return t;
}

// ---- Workflow nodes -------------------------------------------------------
const NODE = { light: { node: "#F1F1F1", port: "#D6D6D6", glyph: "#191919", line: "#D9D9D9", lineOpacity: 1 }, dark: { node: "#242424", port: "#464646", glyph: "#FAFAFA", line: "#676767", lineOpacity: 0.75 } };
const NODE_KEYS = { Integrations: "e4e0a58dd11603bace3202423fa8d46f1d72be90", Icons: "b01af9cf8b945a22ea9d7c99b9cc7db22af62b24", Image: "fa8f46c99ef79e09c709e1f081ecea4e0549e020" };

// Recolour a node instance to light or dark by swapping the known node, port and glyph colours.
function nodeTheme(inst, theme) {
  const to = NODE[theme], from = NODE[theme === "dark" ? "light" : "dark"];
  const map = { [from.node]: to.node, [from.port]: to.port, [from.glyph]: to.glyph };
  const swap = n => { if (!("fills" in n) || n.fills === figma.mixed || !n.fills.length) return; const f = JSON.parse(JSON.stringify(n.fills)); let changed = false; f.forEach(p => { if (p.type === "SOLID" && map[rgbToHex(p.color)]) { p.color = hex(map[rgbToHex(p.color)]); delete p.boundVariables; changed = true; } }); if (changed) { try { n.fills = f; } catch (e) {} } };
  swap(inst); inst.findAll(() => true).forEach(swap);
}
// Library "Node component" (key resolves org-wide through the MCP; verified 2026-10-29). Size in
// modules; theme light|dark by the frame background unless given.
async function nodeInstance(parent, x, y, content = "Integrations", modules = 10, theme) {
  theme = theme || (isDark(frameBg(parent)) ? "dark" : "light");
  const comp = await figma.importComponentByKeyAsync(NODE_KEYS[content] || NODE_KEYS.Integrations);
  const i = comp.createInstance(); parent.appendChild(i); i.rescale(modules * MODULE / i.width); i.x = x; i.y = y; i.name = "Node / " + content;
  if (theme === "dark") nodeTheme(i, "dark"); return i;
}

// n8n editor curve from the right edge of a to the left edge of b, drawn under both.
// Stroke 4.5 at a 360 node, scaled by the node width.
function connect(parent, a, b, theme) {
  theme = theme || (isDark(frameBg(parent)) ? "dark" : "light"); const T = NODE[theme];
  const p1 = { x: a.x + a.width, y: a.y + a.height / 2 }, p2 = { x: b.x, y: b.y + b.height / 2 };
  const minX = Math.min(p1.x, p2.x), minY = Math.min(p1.y, p2.y), d = Math.max(Math.abs(p2.x - p1.x) / 2, 60);
  const q1 = { x: p1.x - minX, y: p1.y - minY }, q2 = { x: p2.x - minX, y: p2.y - minY };
  const data = Math.abs(q2.y - q1.y) < 0.5 ? `M ${R(q1.x)} ${R(q1.y)} L ${R(q2.x)} ${R(q2.y)}` : `M ${R(q1.x)} ${R(q1.y)} C ${R(q1.x + d)} ${R(q1.y)} ${R(q2.x - d)} ${R(q2.y)} ${R(q2.x)} ${R(q2.y)}`;
  const v = figma.createVector(); parent.insertChild(Math.max(0, Math.min(parent.children.indexOf(a), parent.children.indexOf(b))), v); v.name = "Connection";
  v.vectorPaths = [{ windingRule: "NONE", data }]; v.strokes = [solidHex(T.line, T.lineOpacity)]; v.strokeWeight = 4.5 * a.width / 360; v.strokeCap = "ROUND"; v.fills = []; v.x = minX; v.y = minY;
  return v;
}

// ---- Logo from the brand library -------------------------------------------
const LOGO_KEYS = { Black: "496297eac8211952c425ab6ed61480a9d5f62026", White: "11342a3af88b2cca2d892e18a94968cd058f76c9" };
const LOGO_PROPS = { wordmark: "Show Wordmark#261:10", pink: "Pink#261:15" };
// opts { color Black|White (auto by background), wordmark false, pink true, modules 2 (symbol) | 1 (lockup),
// right: x is the right edge, bottom: y is the bottom edge, fallback: a Logo/* component to use when the key fails }.
// On Maker greys the official rule is black or white only (pink on Gray 40 is 1.15:1), so the
// pink symbol is off there unless opts.pink is set explicitly.
async function libLogo(parent, x, y, opts = {}) {
  const mode = modeOf(parent), color = opts.color || (mode === "dark" ? "White" : "Black"), lockup = !!opts.wordmark;
  if (opts.pink == null && mode === "maker") opts = Object.assign({}, opts, { pink: false });
  const h = (opts.modules || (lockup ? 1 : 2)) * MODULE; let i;
  try {
    const comp = await figma.importComponentByKeyAsync(LOGO_KEYS[color]); i = comp.createInstance(); parent.appendChild(i);
    const props = { Color: color }; props[LOGO_PROPS.wordmark] = lockup; props[LOGO_PROPS.pink] = opts.pink !== false; try { i.setProperties(props); } catch (e) {}
  } catch (e) { if (!opts.fallback) throw e; i = opts.fallback.createInstance(); parent.appendChild(i); }
  i.rescale(h / i.height); i.x = opts.right ? x - i.width : x; i.y = opts.bottom ? y - i.height : y; i.name = lockup ? "n8n lockup" : "n8n symbol"; return i;
}
