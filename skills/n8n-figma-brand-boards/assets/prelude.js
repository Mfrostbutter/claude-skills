// Prelude for every artboard call. Paste at the top of the use_figma script and
// fill the ids from the ledger. Then build the board below it.
const page = await figma.getNodeByIdAsync("BOARDS_PAGE_ID");
await figma.setCurrentPageAsync(page);
await Promise.all([["Inter","Medium"],["Inter","Regular"],["Geist Mono","Medium"],["Geist Mono","Regular"]].map(([family,style]) => figma.loadFontAsync({family, style})));
const V = id => figma.variables.getVariableByIdAsync(id);
const [bgPrimary, tyPrimary, tySecondary, tyAccent, lineAccent, linePath, bgInverse, cardSet, capSet, logoComp] = await Promise.all([
  V("S.bg/primary"), V("S.type/primary"), V("S.type/secondary"), V("S.type/accent"), V("S.line/accent"), V("S.line/path"), V("S.bg/inverse"),
  figma.getNodeByIdAsync("CARD_SET_ID"), figma.getNodeByIdAsync("CAPSULE_SET_ID"), figma.getNodeByIdAsync("LOGO_LOCKUP_LIGHT_ID")]);
const T = { display:"T.n8n/Display", title:"T.n8n/Title", heading:"T.n8n/Heading", label:"T.n8n/Label", body:"T.n8n/Body", small:"T.n8n/Body small", caption:"T.n8n/Caption", mono:"T.n8n/Mono caps", monoLg:"T.n8n/Mono caps large" };
const PROPS = { title: "Title#…", sub: "Subtitle#…", show: "Show subtitle#…", label: "Label#…" };
const paint = v => [figma.variables.setBoundVariableForPaint({ type: "SOLID", color: { r: 0, g: 0, b: 0 } }, "color", v)];
const variant = (set, name) => set.children.find(c => c.name === name);

// Card instance: role Customer | Us | Discovery, fixed width, hug height
function card(parent, role, title, sub, x, y, w) { const i = variant(cardSet, "Role=" + role).createInstance(); parent.appendChild(i); i.x = x; i.y = y; i.resize(w, i.height); i.layoutSizingVertical = "HUG"; const p = {}; p[PROPS.title] = title; p[PROPS.sub] = sub || " "; p[PROPS.show] = !!sub; i.setProperties(p); i.name = "Card / " + title; return i; }
// Capsule instance: tone Light | Dark | Pink
function cap(parent, tone, label, x, y) { const i = variant(capSet, "Tone=" + tone).createInstance(); parent.appendChild(i); i.x = x; i.y = y; const p = {}; p[PROPS.label] = label; i.setProperties(p); i.name = "Capsule / " + label; return i; }
// Styled text; w fixes the width and wraps
async function text(parent, styleId, chars, x, y, w, fillVar, align) { const t = figma.createText(); parent.appendChild(t); await t.setTextStyleIdAsync(styleId); t.characters = chars; t.fills = paint(fillVar || tyPrimary); if (w) { t.textAutoResize = "HEIGHT"; t.resize(w, t.height); } if (align) t.textAlignHorizontal = align; t.x = x; t.y = y; t.name = chars.replace(/\n/g, " ").slice(0, 40); return t; }
function logo(parent, x, y, h) { const i = logoComp.createInstance(); parent.appendChild(i); const s = h / i.height; i.resize(i.width * s, h); i.x = x; i.y = y; i.name = "n8n lockup"; return i; }
// Footer: lockup left, figure string right, both on the 1004 baseline
async function footer(board, figure) { logo(board, 80, 1004, 36); return text(board, T.mono, figure, 1040, 1014, 800, tySecondary, "RIGHT"); }
// Legend: the three role capsules in a row
async function legend(board, x, y) { const a = cap(board, "Dark", "CUSTOMER", x, y); const b = cap(board, "Light", "US: AE, SE, CS, FDE", a.x + a.width + 10, y); const c = cap(board, "Pink", "DISCOVERY", b.x + b.width + 10, y); return c.x + c.width; }
// Arrow from (x1,y1) to (x2,y2): one head, horizontal tangents; bend 0 = straight
async function arrow(parent, x1, y1, x2, y2, opts) {
  opts = opts || {};
  const v = figma.createVector(); parent.appendChild(v); v.name = opts.name || "arrow";
  const k = Math.abs(x2 - x1) * (opts.bend == null ? 0.5 : opts.bend) * Math.sign(x2 - x1 || 1);
  await v.setVectorNetworkAsync({ vertices: [{ x: x1, y: y1, strokeCap: "NONE" }, { x: x2, y: y2, strokeCap: "ARROW_EQUILATERAL" }], segments: [{ start: 0, end: 1, tangentStart: { x: k, y: 0 }, tangentEnd: { x: -k, y: 0 } }], regions: [] });
  v.strokes = paint(opts.accent ? lineAccent : linePath); v.strokeWeight = opts.weight || 3; v.fills = []; if (opts.dashed) v.dashPattern = [12, 10];
  return v;
}
// Artboard shell: 1920x1080 on bg/primary, title, subline
async function artboard(name, x, title, subline) {
  page.findAll(n => n.name === name && n.parent === page).forEach(n => n.remove());
  const board = figma.createFrame(); page.appendChild(board);
  board.name = name; board.resize(1920, 1080); board.x = x; board.y = 0; board.fills = paint(bgPrimary); board.clipsContent = true;
  await text(board, T.title, title, 80, 64, 1760);
  if (subline) await text(board, T.body, subline, 80, 124, 1700, tySecondary);
  return board;
}
// ... build the board, then: await legend(board, 420, 1006); await footer(board, "FIGURE · DATE"); return { board: board.id };
