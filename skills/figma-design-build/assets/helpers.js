// figma-design-build · helper block for use_figma calls.
// Paste the helpers you need into a use_figma `code` payload. They are NOT a
// module (the plugin sandbox has no imports); redefine per call. All helpers
// take an explicit parent so they work inside frames/components/groups.
//
// Conventions used here: pass hex strings; bind to styles when a library exists
// (see reference/04). NAME every node you create (reference/05).

// ---- color ----
function rgb(h){h=h.replace('#','');return{r:parseInt(h.slice(0,2),16)/255,g:parseInt(h.slice(2,4),16)/255,b:parseInt(h.slice(4,6),16)/255};}
function fl(h,o){return[{type:"SOLID",color:rgb(h),opacity:o==null?1:o}];}

// ---- elevation presets (or bind effectStyleId instead) ----
const CARD_SHADOW=[
 {type:"DROP_SHADOW",color:{...rgb("#0a3743"),a:0.05},offset:{x:0,y:2}, radius:6, spread:0,  visible:true,blendMode:"NORMAL"},
 {type:"DROP_SHADOW",color:{...rgb("#0a2730"),a:0.10},offset:{x:0,y:18},radius:42,spread:-12,visible:true,blendMode:"NORMAL"}
];
const BUTTON_SHADOW=[{type:"DROP_SHADOW",color:{...rgb("#0a3743"),a:0.28},offset:{x:0,y:6},radius:16,spread:-4,visible:true,blendMode:"NORMAL"}];

// ---- frame ----
function FR(page,name,x,y,w,h,bgHex){const f=figma.createFrame();f.name=name;f.x=x;f.y=y;f.resize(w,h);f.fills=fl(bgHex);f.clipsContent=true;page.appendChild(f);return f;}

// ---- rect (clamped) ----
function R(p,x,y,w,h,hex,name){const r=figma.createRectangle();p.appendChild(r);r.resize(Math.max(w,0.01),Math.max(h,0.01));r.x=x;r.y=y;r.fills=fl(hex);if(name)r.name=name;return r;}

// ---- rounded rect with optional shadow + border ----
function RR(p,x,y,w,h,hex,rad,shadow,borderHex,name){const r=figma.createRectangle();p.appendChild(r);r.resize(w,h);r.x=x;r.y=y;r.fills=fl(hex);r.cornerRadius=rad;if(shadow)r.effects=shadow;if(borderHex){r.strokes=fl(borderHex);r.strokeWeight=1;}if(name)r.name=name;return r;}

// ---- ellipse (by center) ----
function E(p,cx,cy,rad,hex,name){const e=figma.createEllipse();p.appendChild(e);e.resize(2*rad,2*rad);e.x=cx-rad;e.y=cy-rad;e.fills=fl(hex);if(name)e.name=name;return e;}

// ---- text (auto-names itself to its content) ----
// opts: {tr (letter%), lh (line-height%), w (fixed width → wrap), cx (center on x), rx (right-align to x)}
function T(p,x,y,chars,family,style,size,hex,opts){opts=opts||{};const t=figma.createText();p.appendChild(t);t.fontName={family,style};t.fontSize=size;if(opts.tr!=null)t.letterSpacing={value:opts.tr,unit:"PERCENT"};if(opts.lh!=null)t.lineHeight={value:opts.lh,unit:"PERCENT"};t.characters=chars;t.fills=fl(hex);if(opts.w){t.textAutoResize="HEIGHT";t.resize(opts.w,t.height);}let px=x;if(opts.cx!=null){t.textAlignHorizontal="CENTER";px=opts.cx-t.width/2;}else if(opts.rx!=null){px=opts.rx-t.width;}t.x=px;t.y=y;t.name=(chars||"").replace(/\n/g," ").slice(0,32);return t;}

// ---- pill / chip (rect + label, sibling order) ----
function chip(p,x,y,label,bgHex,fgHex,fontFamily,fontStyle){const t=figma.createText();p.appendChild(t);t.fontName={family:fontFamily||"Geist Mono",style:fontStyle||"SemiBold"};t.fontSize=11;t.letterSpacing={value:6,unit:"PERCENT"};t.characters=label;const w=t.width+24,h=t.height+12;const r=figma.createRectangle();p.appendChild(r);r.resize(w,h);r.x=x;r.y=y;r.cornerRadius=999;r.fills=fl(bgHex);r.name="chip-bg";p.appendChild(t);t.x=x+12;t.y=y+6;t.fills=fl(fgHex);t.name=label;return {w,h};}

// ---- content-sized pill (rect auto-fit to label + padding) ----
// Prefer this over a fixed-width rect with centered text: the box grows to the
// text so labels never clip or kiss the edge. padX/padY default to comfortable
// minimums. Centered on (cx, top y). Returns {w,h}.
function pill(p,cx,y,label,bgHex,fgHex,family,style,size,padX,padY,rad){padX=padX==null?16:padX;padY=padY==null?11:padY;const t=figma.createText();p.appendChild(t);t.fontName={family:family||"Inter",style:style||"Medium"};t.fontSize=size||12;t.characters=label;const w=t.width+2*padX,h=t.height+2*padY;const r=figma.createRectangle();p.appendChild(r);r.resize(w,h);r.x=cx-w/2;r.y=y;r.cornerRadius=rad==null?999:rad;r.fills=fl(bgHex);r.name="pill-bg";p.appendChild(t);t.x=cx-t.width/2;t.y=y+padY;t.fills=fl(fgHex);t.name=label;return {w,h};}

// ---- button (rect + label) ----
function button(p,x,y,label,fillHex,labelHex,family,style){const t=figma.createText();p.appendChild(t);t.fontName={family:family||"Geist",style:style||"SemiBold"};t.fontSize=15.5;t.characters=label;const w=t.width+52,h=54;const r=figma.createRectangle();p.appendChild(r);r.resize(w,h);r.x=x;r.y=y;r.cornerRadius=12;r.fills=fl(fillHex);r.effects=BUTTON_SHADOW;r.name="button-bg";p.appendChild(t);t.x=x+26;t.y=y+(h-t.height)/2;t.fills=fl(labelHex);t.name=label;return w;}

// ---- sheared parallelogram bar; bottom-left corner sits at (bx,by) ----
function bar(p,bx,by,w,h,k,hex,name){const r=figma.createRectangle();p.appendChild(r);r.resize(w,h);r.fills=fl(hex);const X=bx-k*h,Y=by-h;r.relativeTransform=[[1,k,X],[0,1,Y]];if(name)r.name=name;return r;}

// ---- line segment P1→P2 as a thin rect ----
function seg(p,x1,y1,x2,y2,hex,th,name){const dx=x2-x1,dy=y2-y1,L=Math.hypot(dx,dy),c=dx/L,s=dy/L;const r=figma.createRectangle();p.appendChild(r);r.resize(L,th);r.fills=fl(hex);r.relativeTransform=[[c,-s,x1+s*th/2],[s,c,y1-c*th/2]];if(name)r.name=name;return r;}

// ---- two-tone headline (accent on the first `splitAt` chars) ----
function twoTone(p,x,y,chars,splitAt,family,style,size,baseHex,accentHex,opts){const t=T(p,x,y,chars,family,style,size,baseHex,opts);t.setRangeFills(0,splitAt,fl(accentHex));return t;}

// ---- style guards (build/library) ----
function paintStyle(name,hex){let s=figma.getLocalPaintStyles().find(p=>p.name===name);if(!s){s=figma.createPaintStyle();s.name=name;s.paints=fl(hex);}return s.id;}
function textStyle(name,family,st,size,lhPct,trPct){let s=figma.getLocalTextStyles().find(t=>t.name===name);if(!s){s=figma.createTextStyle();s.name=name;s.fontName={family,style:st};s.fontSize=size;s.lineHeight={value:lhPct,unit:"PERCENT"};s.letterSpacing={value:trPct,unit:"PERCENT"};}return s.id;}
function effectStyle(name,effects){let s=figma.getLocalEffectStyles().find(e=>e.name===name);if(!s){s=figma.createEffectStyle();s.name=name;s.effects=effects;}return s.id;}
