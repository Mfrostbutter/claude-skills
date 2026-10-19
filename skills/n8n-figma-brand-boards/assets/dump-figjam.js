// Read-only use_figma against a FigJam board. Returns every section with its
// shapes, texts, connectors and stickies: text, position, size, fill, dash.
// This is the content inventory for the design version.
const out = [];
const hex = p => { if (!p || !p.length || p[0].type !== 'SOLID') return null; const c = p[0].color; return [c.r,c.g,c.b].map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join(''); };
for (const sec of figma.currentPage.children) {
  const s = { name: sec.name, id: sec.id, type: sec.type, x: sec.x, y: sec.y, w: sec.width, h: sec.height, kids: [] };
  const kids = sec.type === 'SECTION' ? sec.children : [];
  for (const k of kids) {
    const e = { id: k.id, t: k.type, x: Math.round(k.x), y: Math.round(k.y), w: Math.round(k.width), h: Math.round(k.height) };
    if (k.type === 'SHAPE_WITH_TEXT') { e.shape = k.shapeType; e.text = k.text.characters; e.fill = hex(k.fills); e.dash = k.dashPattern; e.stroke = hex(k.strokes); }
    else if (k.type === 'TEXT') { e.text = k.characters; e.size = k.fontSize; e.fill = hex(k.fills); }
    else if (k.type === 'CONNECTOR') { e.from = k.connectorStart.endpointNodeId || JSON.stringify(k.connectorStart.position); e.to = k.connectorEnd.endpointNodeId || JSON.stringify(k.connectorEnd.position); e.dash = k.dashPattern; e.sw = k.strokeWeight; e.text = k.text && k.text.characters; }
    else if (k.type === 'STICKY') { e.text = k.text.characters; }
    else { e.name = k.name; }
    s.kids.push(e);
  }
  out.push(s);
}
return out;
