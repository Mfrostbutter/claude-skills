# Styles + components (the design library)

## Styles are document-level; guard by name

Paint / text / effect styles live on the document, not a page. Re-running a build that creates them will **duplicate** them unless you guard by name:

```js
function paintStyle(name,hex){
  let s=figma.getLocalPaintStyles().find(p=>p.name===name);
  if(!s){s=figma.createPaintStyle(); s.name=name; s.paints=fl(hex);}
  return s.id;
}
```

Same pattern for `createTextStyle` (set `fontName` [font loaded first], `fontSize`, `lineHeight`, `letterSpacing`) and `createEffectStyle` (set `effects`). `getLocalTextStyles()` / `getLocalEffectStyles()` for the guard.

Name with `/` to create folders in the Figma styles panel: `accent/petrol`, `display/h1`, `elevation/card`.

> Note: `getLocalPaintStyles()` etc. are the sync API and still work; newer code may prefer `getLocalPaintStylesAsync()`. Either is fine.

## Bind everything to styles

This is what makes it a *library* (change a style → every consumer updates). Bind from the first draw:

```js
rect.fillStyleId   = paintIdByName["accent/petrol"];
text.fillStyleId   = paintIdByName["text/ink"];
text.textStyleId   = textIdByName["display/h1"];
rect.effectStyleId = effectIdByName["elevation/card"];
```

Build lookup maps once:

```js
const PS={}; figma.getLocalPaintStyles().forEach(s=>PS[s.name]=s.id);
const TS={}; figma.getLocalTextStyles().forEach(s=>TS[s.name]=s.id);
const ES={}; figma.getLocalEffectStyles().forEach(s=>ES[s.name]=s.id);
```

## Components

```js
const c=figma.createComponent();
c.name="Button/Primary";        // semantic, foldered
c.fills=[];                      // transparent component bg unless you want one
parent.appendChild(c); c.x=...; c.y=...;
// append children (rect bg first, then label); bind to styles
c.resizeWithoutConstraints(w,h);
```

Components placed inside a frame still work as components; instances are created with `component.createInstance()`.

## Variants

Group related components into a variant set:

```js
const set = figma.combineAsVariants([haikuC, sonnetC, opusC], parent);
set.name = "Model-chip";
```

For `combineAsVariants` the members should be named with the variant property (`Tier=Haiku`). If you do not need true variants yet, naming members `Model-chip/Haiku` (folder form) is a fine first pass; promote to a variant set later.

## Specimen pages

Build a visible **Foundations** page (swatches bound to each paint style + a type-ramp specimen per text style + elevation samples) and a **Components** page (one of each component with a caption). This documents the library and is how you screenshot-verify the styles render.
