# Geometry + drawing

## Z-order = append order

Later-appended children render **on top**. Always draw the background first, then the content. A common bug: drawing a button's rect after its label hides the label. Order: rect, then text.

## Rectangles cannot have children

`rect.insertChild(...)` / `appendChild` on a `RECTANGLE` throws `no such property 'insertChild' on RECTANGLE node`. To make a "chip" or "button", append the background rect and the label as **siblings** of the same parent (frame/component/group), rect first.

## Color helpers

The Plugin API wants `{r,g,b}` in 0..1 and paints as arrays:

```js
function rgb(h){h=h.replace('#','');return{r:parseInt(h.slice(0,2),16)/255,g:parseInt(h.slice(2,4),16)/255,b:parseInt(h.slice(4,6),16)/255};}
function fl(h,o){return[{type:"SOLID",color:rgb(h),opacity:o==null?1:o}];}
```

## Shadows (effects)

```js
node.effects = [
 {type:"DROP_SHADOW",color:{...rgb("#0a3743"),a:0.05},offset:{x:0,y:2}, radius:6, spread:0,  visible:true,blendMode:"NORMAL"},
 {type:"DROP_SHADOW",color:{...rgb("#0a2730"),a:0.10},offset:{x:0,y:18},radius:42,spread:-12,visible:true,blendMode:"NORMAL"}
];
```

A layered "tight contact + wide ambient" pair reads as tasteful elevation. Tint shadows toward the brand dark, not neutral grey, so they sit in-palette.

## Rotation vs skew

- `node.rotation = deg` rotates the rect around its origin. It stays a rectangle, just tilted (good for a "/" slash bar, the brand-mark skew, etc.).
- A **parallelogram** (vertical sides stay parallel, top/bottom stay horizontal, like italic bars on a baseline) needs a **shear**, which is not a node property. Use `relativeTransform`.

### Parallelogram bar via shear matrix

`relativeTransform = [[a,b,e],[c,d,f]]` maps local `(lx,ly)` to `(a*lx+b*ly+e, c*lx+d*ly+f)`. A horizontal shear keeps top/bottom horizontal and slants the sides. To place a bar of width `w`, height `h`, sheared by `k`, with its **bottom-left corner at (bx, by)** (bottoms aligned on a baseline = the "Adidas" look):

```js
function bar(parent,bx,by,w,h,k,hex){
  const r=figma.createRectangle(); parent.appendChild(r);
  r.resize(w,h); r.fills=fl(hex);
  const X=bx-k*h, Y=by-h;                  // top-left lands at (X,Y)
  r.relativeTransform=[[1,k,X],[0,1,Y]];   // bottom edge stays on `by`
  return r;
}
```

`k < 0` leans the top to the right (forward). Ascending heights with the same `by` gives bars that fan up from a shared baseline. Set `relativeTransform` **after** `resize` and after appending to the parent (coords are parent-relative).

### Arbitrary line segment via thin rect

No native dashed-line-as-rect. For a solid segment from P1 to P2, thickness `t`:

```js
function seg(parent,x1,y1,x2,y2,hex,t){
  const dx=x2-x1,dy=y2-y1,L=Math.hypot(dx,dy),c=dx/L,s=dy/L;
  const r=figma.createRectangle(); parent.appendChild(r);
  r.resize(L,t); r.fills=fl(hex);
  r.relativeTransform=[[c,-s,x1+s*t/2],[s,c,y1-c*t/2]]; // centered on the P1→P2 axis
  return r;
}
```

For dashed lines use a real `figma.createLine()` with `strokes` + `dashPattern`, or many short rects.

## Ellipses

```js
const e=figma.createEllipse(); parent.appendChild(e);
e.resize(2*r,2*r); e.x=cx-r; e.y=cy-r; e.fills=fl(hex);
```

## Two-tone text

```js
t.characters="AI automation,\nend to end.";
t.fills=fl("#0d0e12");                 // base = ink
t.setRangeFills(0,14, fl("#0a3743"));  // first phrase = accent
```

`resize(w,h)` will throw on `0`; clamp tiny dimensions (`Math.max(h,0.01)`).
