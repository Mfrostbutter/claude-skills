#!/usr/bin/env node
// Turns a workflow-map spec into ordered use_figma code chunks (one file per call).
// Usage: node render.mjs spec.json --out <dir>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(HERE, '..', 'assets');
export const MAX_CHUNK = 48000;

export const THEMES = {
  dark: { bg: '#040506', panel: '#0B0C0E', raised: '#14161A', border: '#1F2227', strong: '#3A3E46', text: '#FFFFFF', text2: '#9BA1A8', text3: '#6B7076', brand: '#EA4B71', line: '#6B7076', logo: 'n8n-logo-on-dark.svg' },
  light: { bg: '#FAFAFA', panel: '#FFFFFF', raised: '#F3F4F6', border: '#E5E7EB', strong: '#D1D5DB', text: '#040506', text2: '#6B7076', text3: '#9CA3AF', brand: '#EA4B71', line: '#9CA3AF', logo: 'n8n-logo-on-light.svg' },
};
export const HUE = { green: '#22C55E', blue: '#3DADFF', periwinkle: '#7C8CF5', orange: '#F5952E', violet: '#A07BFF', teal: '#2ABF9E', slate: '#7C8CA3', red: '#EF4444' };

const svg = (f) => readFileSync(join(ASSETS, f), 'utf8').replace(/\r?\n/g, '').replace(/<g clip-path[^>]*>|<\/g>|<defs>[\s\S]*<\/defs>/g, '');

/** Shared prelude: tokens, fonts, helpers, frame lookup. Redefined in every chunk. */
function prelude(spec) {
  const T = THEMES[spec.theme] ?? THEMES.dark;
  return `
const T=${JSON.stringify(T)};const HUE=${JSON.stringify(HUE)};
const FRAME_NAME=${JSON.stringify('Workflow map · ' + spec.title)};
const M=100,ZW=420,PITCH=480,NW=356,GAP=22,NOTE_GAP=44;
const PAGE_NAME=${JSON.stringify(spec.page ?? 'Workflow map')};
let PAGE=figma.root.children.find(p=>p.name===PAGE_NAME);if(!PAGE){PAGE=figma.createPage();PAGE.name=PAGE_NAME;}await figma.setCurrentPageAsync(PAGE);
for(const [family,style] of [['Inter','Regular'],['Inter','Medium'],['Inter','Semi Bold'],['JetBrains Mono','Regular'],['JetBrains Mono','Medium']]) await figma.loadFontAsync({family,style});
function rgb(h){h=h.replace('#','');return{r:parseInt(h.slice(0,2),16)/255,g:parseInt(h.slice(2,4),16)/255,b:parseInt(h.slice(4,6),16)/255};}
function hx(h){return[{type:'SOLID',color:rgb(h)}];}
function mix(a,b,w){const A=rgb(a),B=rgb(b);return[{type:'SOLID',color:{r:A.r*w+B.r*(1-w),g:A.g*w+B.g*(1-w),b:A.b*w+B.b*(1-w)}}];}
const INTER='Inter',MONO='JetBrains Mono';
function txt(p,x,y,chars,fam,st,size,hex,o){o=o||{};const t=figma.createText();p.appendChild(t);t.fontName={family:fam,style:st};t.fontSize=size;if(o.lh)t.lineHeight={value:o.lh,unit:'PERCENT'};if(o.tr!=null)t.letterSpacing={value:o.tr,unit:'PERCENT'};t.characters=chars;t.fills=hx(hex);if(o.w){t.textAutoResize='HEIGHT';t.resize(o.w,t.height);}t.x=o.rx!=null?o.rx-t.width:x;t.y=y;t.name=o.name||chars.replace(/\\n/g,' ').slice(0,40);return t;}
function rr(p,x,y,w,h,fill,rad,stroke,sw,name){const r=figma.createRectangle();p.appendChild(r);r.resize(Math.max(w,0.01),Math.max(h,0.01));r.x=x;r.y=y;r.cornerRadius=rad;r.fills=fill?(typeof fill==='string'?hx(fill):fill):[];if(stroke){r.strokes=typeof stroke==='string'?hx(stroke):stroke;r.strokeWeight=sw||1;r.strokeAlign='INSIDE';}r.name=name;return r;}
function svgNode(p,src,x,y,name){const n=figma.createNodeFromSvg(src);p.appendChild(n);n.fills=[];n.clipsContent=false;n.x=x;n.y=y;n.name=name;return n;}
function findFrame(){const f=figma.currentPage.findOne(n=>n.type==='FRAME'&&n.name===FRAME_NAME);if(!f)throw new Error('map frame missing: run chunk 00 first');return f;}
function mark(){const c=figma.currentPage.findOne(n=>n.type==='COMPONENT'&&n.name==='n8n/mark');if(!c)throw new Error('n8n/mark component missing: run chunk 00 first');return c;}
function bottomOf(f){let b=0;for(const c of f.children)b=Math.max(b,c.y+c.height);return b;}
function pill(p,x,y,label){const r=rr(p,x,y,10,10,T.panel,999,T.brand,1.5,'pill-bg');const i=mark().createInstance();p.appendChild(i);i.rescale(14/160);const t=txt(p,0,0,label,MONO,'Medium',14,T.text,{tr:2,name:label});r.resize(14+i.width+10+t.width+16,t.height+16);i.x=x+14;i.y=y+(r.height-i.height)/2;t.x=i.x+i.width+10;t.y=y+8;const g=figma.group([r,i,t],p);g.name='Workflow pill/'+label;return r;}
function node(p,x,y,hue,n,dashed){const c=HUE[hue]||HUE.slate;const tw=NW-36-(n.badge?44:0);
 const t=txt(p,x+18,0,n.title,INTER,'Semi Bold',18,T.text,{w:tw,name:n.title});
 const s=n.sub?txt(p,x+18,0,n.sub,MONO,'Regular',13,T.text2,{w:tw,lh:135,name:n.sub.slice(0,40)}):null;
 const ch=t.height+(s?4+s.height:0);const H=[50,70,88,106,124].find(v=>v>=ch+28)||ch+28;
 const r=rr(p,x,y,NW,H,mix(c,T.panel,${spec.theme === 'light' ? 0.14 : 0.15}),14,c,2,'node-bg');if(dashed)r.dashPattern=[10,6];
 p.appendChild(t);if(s)p.appendChild(s);const top=y+(H-ch)/2;t.y=top;if(s)s.y=top+t.height+4;
 const items=[r,t];if(s)items.push(s);
 if(n.badge){const i=mark().createInstance();p.appendChild(i);i.rescale(17/160);i.x=x+NW-18-i.width;i.y=y+(H-i.height)/2;i.name='n8n badge';items.push(i);}
 const g=figma.group(items,p);g.name='Node/'+n.title;return {x,y,w:NW,h:H};}
function vconn(p,a,b){const x=a.x+a.w/2,y1=a.y+a.h,L=b.y-y1;return svgNode(p,'<svg width="12" height="'+L+'" viewBox="0 0 12 '+L+'" xmlns="http://www.w3.org/2000/svg"><line x1="6" y1="0" x2="6" y2="'+(L-1)+'" stroke="'+T.line+'" stroke-width="2"/><polyline points="1,'+(L-7)+' 6,'+(L-1)+' 11,'+(L-7)+'" fill="none" stroke="'+T.line+'" stroke-width="2"/></svg>',x-6,y1,'connector');}
function elbow(p,a,b,xm){const x1=a.x+a.w,y1=a.y+a.h/2,x2=b.x,y2=b.y+b.h/2;const Y0=Math.min(y1,y2)-6,W=x2-x1,H=Math.abs(y2-y1)+12,l1=y1-Y0,l2=y2-Y0,lm=xm-x1;return svgNode(p,'<svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" xmlns="http://www.w3.org/2000/svg"><polyline points="0,'+l1+' '+lm+','+l1+' '+lm+','+l2+' '+(W-1)+','+l2+'" fill="none" stroke="'+T.line+'" stroke-width="2"/><polyline points="'+(W-7)+','+(l2-5)+' '+(W-1)+','+l2+' '+(W-7)+','+(l2+5)+'" fill="none" stroke="'+T.line+'" stroke-width="2"/></svg>',x1,Y0,'connector (cross-stage)');}
function stage(f,st,zx,top){const c=HUE[st.hue]||HUE.slate;
 txt(f,zx,top-34,st.label,MONO,'Medium',17,T.text,{tr:8,name:'Zone label '+st.label});
 const zb=rr(f,zx,top,ZW,10,T.panel,12,st.dashed?T.strong:T.border,1.5,'zone-bg '+st.label);if(st.dashed)zb.dashPattern=[10,6];
 let y=top+60;const ns=[];for(const n of st.nodes){const nd=node(f,zx+32,y,st.hue,n,st.dashed);ns.push(nd);y+=nd.h+GAP;}
 for(let k=0;k<ns.length-1;k++)vconn(f,ns[k],ns[k+1]);
 zb.resize(ZW,Math.max(y-GAP+36-top,120));const bottom=top+zb.height;let end=bottom;
 if(st.note){const t=txt(f,zx+22,0,st.note,INTER,'Regular',17,T.text,{w:372,lh:140,name:'note text'});const b=rr(f,zx+2,bottom+NOTE_GAP,416,t.height+40,mix(c,T.panel,${spec.theme === 'light' ? 0.1 : 0.11}),6,mix(c,T.panel,0.35),1,'note-bg');f.appendChild(t);t.y=bottom+NOTE_GAP+20;const g=figma.group([b,t],f);g.name='Narration '+st.label;end=bottom+NOTE_GAP+b.height;}
 return {nodes:ns,end};}
`;
}

/** Width of the map frame for a spec. */
export function frameWidth(spec) {
  let cols = 3;
  for (const r of spec.rows) cols = Math.max(cols, r.chain ? r.stages.length : Math.min(r.stages.length, 5));
  if (spec.data) cols = Math.max(cols, Math.min(spec.data.cards.length, 5));
  return Math.max(1600, 200 + cols * 480 - 60);
}

function setupChunk(spec) {
  const T = THEMES[spec.theme] ?? THEMES.dark;
  const W = frameWidth(spec);
  return `${prelude(spec)}
let comp=figma.currentPage.findOne(n=>n.type==='COMPONENT'&&n.name==='n8n/mark');
let right=0;for(const c of figma.currentPage.children)right=Math.max(right,c.x+c.width);
if(!comp){const lib=figma.createFrame();lib.name='n8n brand components';lib.resize(400,220);lib.fills=hx('#1A1B1E');lib.x=right+200;lib.y=-400;figma.currentPage.appendChild(lib);
 const src=figma.createNodeFromSvg(${JSON.stringify(svg('n8n-mark.svg'))});comp=figma.createComponent();comp.name='n8n/mark';comp.resize(304,160);comp.fills=[];for(const ch of [...src.children])comp.appendChild(ch);src.remove();lib.appendChild(comp);comp.x=24;comp.y=24;}
const old=figma.currentPage.findOne(n=>n.type==='FRAME'&&n.name===FRAME_NAME);if(old)old.name=FRAME_NAME+' (previous)';
const f=figma.createFrame();f.name=FRAME_NAME;f.resize(${W},1200);f.x=right+200;f.y=0;f.fills=hx(T.bg);f.clipsContent=true;figma.currentPage.appendChild(f);
const logo=svgNode(f,${JSON.stringify(svg(T.logo))},M,64,'n8n logo');logo.rescale(30/160);
txt(f,M,116,${JSON.stringify(spec.title)},INTER,'Semi Bold',60,T.text,{tr:-2.5,name:'Title'});
txt(f,M,196,${JSON.stringify(spec.subtitle ?? '')},MONO,'Regular',19,T.text2,{name:'Subtitle'});
${spec.principle ? `const pb=rr(f,${W}-M-940,64,940,10,T.panel,12,T.border,1,'principle-bg');const pt=txt(f,${W}-M-912,84,${JSON.stringify(spec.principle)},INTER,'Regular',19,T.text2,{w:884,lh:140,name:'Principle'});pb.resize(940,pt.height+40);const pg=figma.group([pb,pt],f);pg.name='Principle annotation';` : ''}
return {frame:f.id,width:${W}};`;
}

function rowChunk(spec, row, k) {
  const W = frameWidth(spec);
  return `${prelude(spec)}
const row=${JSON.stringify(row)};
const f=findFrame();
let y=bottomOf(f)+${k === 0 ? 70 : 110};
${k > 0 ? `rr(f,M,y-40,${W}-2*M,1,T.border,0,null,0,'row divider');` : ''}
if(row.chain&&row.pill){const p=pill(f,M,y,row.pill);const c=txt(f,0,0,row.caption,MONO,'Medium',15,T.text2,{tr:6,name:'Row caption'});c.x=M+p.width+20;c.y=y+(p.height-c.height)/2;y+=p.height+44;}
else{txt(f,M,y,row.caption,MONO,'Medium',15,T.text2,{tr:10,name:'Row caption'});y+=52;}
const per=row.chain?row.stages.length:5;
let prev=null;
for(let s=0;s<row.stages.length;s+=per){
 const line=row.stages.slice(s,s+per);let end=0;
 const labelTop=y+(line.some(st=>st.pill)&&!row.chain?50:0);const top=labelTop+34;
 line.forEach((st,i)=>{const zx=M+i*PITCH;if(st.pill&&!row.chain)pill(f,zx,y,st.pill);const r=stage(f,row.dashed?{...st,dashed:true}:st,zx,top);end=Math.max(end,r.end);
  if(row.chain&&prev&&r.nodes.length)elbow(f,prev.nodes[prev.nodes.length-1],r.nodes[0],M+(i-1)*PITCH+ZW+30);if(r.nodes.length)prev=r;});
 y=end+90;}
f.resize(${W},Math.max(f.height,bottomOf(f)+100));
return 'row ${k + 1} done';`;
}

function dataChunk(spec) {
  const W = frameWidth(spec);
  const d = spec.data;
  return `${prelude(spec)}
const d=${JSON.stringify(d)};
const f=findFrame();
const y0=bottomOf(f)+110;
const band=rr(f,M,y0,${W}-2*M,10,T.bg,16,T.border,1.5,'data band');
txt(f,M+40,y0+36,'DATA LAYER',MONO,'Medium',17,T.text,{tr:10,name:'Data label'});
txt(f,M+200,y0+36,d.caption,MONO,'Regular',17,T.text2,{name:'Data caption'});
let top=y0+96,maxB=top;
d.cards.forEach((c,i)=>{const col=i%5;if(i&&col===0){top=maxB+40;}const x=M+32+col*PITCH,w=388;
 const hd=rr(f,x,top,w,50,T.raised,12,null,0,'card header');const ht=txt(f,x+20,top+14,c.title,MONO,'Medium',16,T.brand,{tr:4,name:c.title});
 const body=rr(f,x,top+50,w,10,T.panel,0,T.border,1,'card body');body.bottomLeftRadius=12;body.bottomRightRadius=12;
 let y=top+68;const items=[hd,ht,body];for(const r of c.rows){const t=txt(f,x+20,y,r,MONO,'Regular',15,T.text,{name:r});items.push(t);y+=t.height+10;}
 body.resize(w,y-(top+50)+8);const cp=txt(f,x+4,top+50+body.height+14,c.caption,MONO,'Regular',14,T.text2,{w:w-8,name:'caption '+c.title});items.push(cp);
 const g=figma.group(items,f);g.name='Schema card/'+c.title;maxB=Math.max(maxB,cp.y+cp.height);});
band.resize(${W}-2*M,maxB-y0+40);
f.resize(${W},bottomOf(f)+100);
return 'data done';`;
}

function legendChunk(spec) {
  return `${prelude(spec)}
const f=findFrame();const y=bottomOf(f)+10;
const i=mark().createInstance();f.appendChild(i);i.rescale(14/160);i.x=M;i.y=y+3;i.name='legend badge';
txt(f,M+i.width+10,y,'= calls an n8n sub-workflow   ·   dashed = inactive or opt-in   ·   notes explain the design decision, not the nodes',MONO,'Regular',14,T.text3,{name:'Legend'});
f.resize(f.width,bottomOf(f)+80);
return {frame:f.id,height:f.height};`;
}

/** All chunks, in call order. */
export function render(spec) {
  const chunks = [{ name: '00-setup', code: setupChunk(spec) }];
  spec.rows.forEach((r, k) => chunks.push({ name: `${String(k + 1).padStart(2, '0')}-row`, code: rowChunk(spec, r, k) }));
  if (spec.data) chunks.push({ name: `${String(spec.rows.length + 1).padStart(2, '0')}-data`, code: dataChunk(spec) });
  chunks.push({ name: `${String(chunks.length).padStart(2, '0')}-legend`, code: legendChunk(spec) });
  for (const c of chunks) if (c.code.length > MAX_CHUNK) throw new Error(`${c.name} is ${c.code.length} chars, over the use_figma limit; split the row`);
  return chunks;
}

/** Spec problems that would render badly; TODO text is a warning, not an error. */
export function lint(spec) {
  const out = [];
  const walk = (s, where) => { if (typeof s === 'string' && /\bTODO\b/.test(s)) out.push(`${where} still has TODO text`); };
  walk(spec.principle, 'principle');
  for (const r of spec.rows) for (const st of r.stages) {
    walk(st.note, st.label);
    if (!HUE[st.hue]) out.push(`${st.label}: unknown hue "${st.hue}"`);
    if (st.nodes.length > 6) out.push(`${st.label}: ${st.nodes.length} nodes, keep a stage to 6`);
    if (!st.nodes.length) out.push(`${st.label}: no nodes`);
  }
  return out;
}

function main(argv) {
  const file = argv.find((a) => !a.startsWith('--'));
  const oi = argv.indexOf('--out');
  if (!file || oi < 0) { console.error('usage: render.mjs spec.json --out <dir>'); process.exit(2); }
  const spec = JSON.parse(readFileSync(file, 'utf8'));
  const out = argv[oi + 1];
  mkdirSync(out, { recursive: true });
  const chunks = render(spec);
  for (const c of chunks) writeFileSync(join(out, `${c.name}.js`), c.code);
  for (const w of lint(spec)) console.error(`warn: ${w}`);
  console.error(`${chunks.length} chunks -> ${out} (run in order with use_figma)`);
  for (const c of chunks) console.log(`${c.name}.js\t${c.code.length} chars`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));
