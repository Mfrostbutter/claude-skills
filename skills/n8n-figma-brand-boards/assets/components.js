// use_figma on the Components page. Needs ids from the foundations ledger:
// replace the VariableID and S: values below. Builds Card (Role), Capsule
// (Tone) and the logo components from the brand SVG paths. Returns ids and
// property keys; save them to the ledger.
const page = await figma.getNodeByIdAsync("COMPONENTS_PAGE_ID");
await figma.setCurrentPageAsync(page);
await Promise.all([["Inter","Medium"],["Inter","Regular"],["Geist Mono","Medium"]].map(([family,style]) => figma.loadFontAsync({family, style})));
const V = async id => figma.variables.getVariableByIdAsync(id);
const S = { bgTert: await V("S.bg/tertiary"), bgAccent: await V("S.bg/accent"), bgInverse: await V("S.bg/inverse"), tyPrimary: await V("S.type/primary"), tyOnAccent: await V("S.type/on-accent"), tyOnInverse: await V("S.type/on-inverse"), borderDefault: await V("S.border/default") };
const N = { rCard: await V("N.radius/card"), rBadge: await V("N.radius/badge"), rPill: await V("N.radius/pill"), sXs: await V("N.space/xs") };
const T = { label: "T.n8n/Label", small: "T.n8n/Body small", mono: "T.n8n/Mono caps" };
const paint = v => [figma.variables.setBoundVariableForPaint({ type: "SOLID", color: { r: 0, g: 0, b: 0 } }, "color", v)];
page.findAll(n => ["Card", "Capsule"].includes(n.name) && n.type === "COMPONENT_SET").forEach(n => n.remove());

async function card(role, fillVar, textVar, radiusVar, strokeVar) {
  const c = figma.createComponent(); c.name = "Role=" + role;
  c.layoutMode = "VERTICAL"; c.primaryAxisSizingMode = "AUTO"; c.counterAxisSizingMode = "FIXED"; c.resize(440, 100);
  c.paddingLeft = 28; c.paddingRight = 28; c.paddingTop = 24; c.paddingBottom = 24; c.setBoundVariable("itemSpacing", N.sXs);
  c.fills = paint(fillVar);
  for (const k of ["topLeftRadius","topRightRadius","bottomLeftRadius","bottomRightRadius"]) c.setBoundVariable(k, radiusVar);
  if (strokeVar) { c.strokes = paint(strokeVar); c.strokeWeight = 1.5; c.strokeAlign = "INSIDE"; }
  const title = figma.createText(); c.appendChild(title); await title.setTextStyleIdAsync(T.label); title.characters = "Card title"; title.name = "Title"; title.fills = paint(textVar); title.textAutoResize = "HEIGHT"; title.layoutSizingHorizontal = "FILL";
  const sub = figma.createText(); c.appendChild(sub); await sub.setTextStyleIdAsync(T.small); sub.characters = "One line that says what happens here"; sub.name = "Subtitle"; sub.fills = paint(textVar); sub.opacity = 0.72; sub.textAutoResize = "HEIGHT"; sub.layoutSizingHorizontal = "FILL";
  return c;
}
const cardSet = figma.combineAsVariants([await card("Customer", S.bgInverse, S.tyOnInverse, N.rBadge, null), await card("Us", S.bgTert, S.tyPrimary, N.rCard, S.borderDefault), await card("Discovery", S.bgAccent, S.tyOnAccent, N.rCard, null)], page);
cardSet.name = "Card";
cardSet.description = "Who does the work sets the role. Customer = Core Black plain box. Us (AE, SE, CS, FDE) = Gray 20 rounded with Gray 40 stroke. Discovery = Main Accent Pink rounded. Width is fixed per instance; height hugs.";
cardSet.layoutMode = "VERTICAL"; cardSet.itemSpacing = 24; cardSet.paddingLeft = cardSet.paddingRight = cardSet.paddingTop = cardSet.paddingBottom = 24; cardSet.primaryAxisSizingMode = "AUTO"; cardSet.counterAxisSizingMode = "AUTO";
const kTitle = cardSet.addComponentProperty("Title", "TEXT", "Card title");
const kSub = cardSet.addComponentProperty("Subtitle", "TEXT", "One line that says what happens here");
const kShow = cardSet.addComponentProperty("Show subtitle", "BOOLEAN", true);
for (const v of cardSet.children) { v.findOne(n => n.name === "Title").componentPropertyReferences = { characters: kTitle }; v.findOne(n => n.name === "Subtitle").componentPropertyReferences = { characters: kSub, visible: kShow }; }
cardSet.x = 0; cardSet.y = 0;

async function capsule(tone, fillVar, textVar, strokeVar) {
  const c = figma.createComponent(); c.name = "Tone=" + tone;
  c.layoutMode = "HORIZONTAL"; c.primaryAxisSizingMode = "AUTO"; c.counterAxisSizingMode = "AUTO";
  c.paddingLeft = 14; c.paddingRight = 14; c.paddingTop = 7; c.paddingBottom = 7; c.primaryAxisAlignItems = "CENTER"; c.counterAxisAlignItems = "CENTER";
  c.fills = paint(fillVar); for (const k of ["topLeftRadius","topRightRadius","bottomLeftRadius","bottomRightRadius"]) c.setBoundVariable(k, N.rPill);
  if (strokeVar) { c.strokes = paint(strokeVar); c.strokeWeight = 1; c.strokeAlign = "INSIDE"; }
  const t = figma.createText(); c.appendChild(t); await t.setTextStyleIdAsync(T.mono); t.characters = "LABEL"; t.name = "Label"; t.fills = paint(textVar);
  return c;
}
const capSet = figma.combineAsVariants([await capsule("Light", S.bgTert, S.tyPrimary, S.borderDefault), await capsule("Dark", S.bgInverse, S.tyOnInverse, null), await capsule("Pink", S.bgAccent, S.tyOnAccent, null)], page);
capSet.name = "Capsule"; capSet.description = "Mono caps label. Dates, day markers, step numbers, who and when. Caps always; n8n stays lowercase.";
capSet.layoutMode = "HORIZONTAL"; capSet.itemSpacing = 16; capSet.paddingLeft = capSet.paddingRight = capSet.paddingTop = capSet.paddingBottom = 24; capSet.primaryAxisSizingMode = "AUTO"; capSet.counterAxisSizingMode = "AUTO";
const kLabel = capSet.addComponentProperty("Label", "TEXT", "LABEL");
for (const v of capSet.children) v.findOne(n => n.name === "Label").componentPropertyReferences = { characters: kLabel };
capSet.x = 0; capSet.y = cardSet.height + 80;

// Logos: paste SYMBOL and WORD path data from designer/brand-2026/logo/n8n-lockup-black.svg
const SYMBOL = "PASTE_SYMBOL_PATH_D"; const WORD = "PASTE_WORDMARK_PATH_D";
const lockup = (symFill, wordFill) => `<svg width="267" height="54" viewBox="0 0 267 54" fill="none" xmlns="http://www.w3.org/2000/svg"><g transform="translate(0 0.3)"><path d="${SYMBOL}" fill="${symFill}"/></g><g transform="translate(173.55 0.3)"><path d="${WORD}" fill="${wordFill}"/></g></svg>`;
const symbolSvg = fill => `<svg width="133.5" height="53.4" viewBox="0 0 133.5 53.4" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="${SYMBOL}" fill="${fill}"/></svg>`;
function logoComponent(name, svg, y) { const node = figma.createNodeFromSvg(svg); const comp = figma.createComponent(); comp.name = name; comp.resize(node.width, node.height); comp.fills = []; while (node.children.length) comp.appendChild(node.children[0]); node.remove(); page.appendChild(comp); comp.x = 0; comp.y = y; return comp; }
const y0 = capSet.y + capSet.height + 80;
const logos = {
  black: logoComponent("Logo/Lockup black", lockup("#191919", "#191919"), y0).id,
  light: logoComponent("Logo/Lockup light", lockup("#FF91AC", "#191919"), y0 + 100).id,
  dark: logoComponent("Logo/Lockup dark", lockup("#FF91AC", "#FAFAFA"), y0 + 200).id,
  white: logoComponent("Logo/Lockup white", lockup("#FAFAFA", "#FAFAFA"), y0 + 300).id,
  symbol: logoComponent("Logo/Symbol pink", symbolSvg("#FF91AC"), y0 + 400).id,
};
return { cardSet: cardSet.id, cardVariants: cardSet.children.map(c => c.id), cardProps: { kTitle, kSub, kShow }, capSet: capSet.id, capVariants: capSet.children.map(c => c.id), kLabel, logos };
