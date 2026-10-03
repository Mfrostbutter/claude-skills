/* App walkthrough: build the AE comp from ae/manifest.json.
 * ES3 ExtendScript. Run in AE (File > Scripts > Run Script File) or AfterFX.exe -r.
 * Reads the manifest, imports clips + VO, lays out scenes, lower thirds, title and
 * outro cards, saves ae/walkthrough.aep. Rendering is done by aerender afterwards.
 */
(function () {
  var CONFIG = {
    compName: "App Walkthrough",
    width: 1920, height: 1080, fps: 30,
    bg: "#1a1a1a", ink: "#f2f2f2", muted: "#b3b3b3", accent: "#ff8fb1", panel: "#262626",
    fontBold: "Inter-Bold", fontRegular: "Inter-Regular", fontMedium: "Inter-Medium",
    fade: 0.45,          // clip fade in/out seconds
    kenBurns: 3.5,       // percent scale growth over a scene
    voLead: 0.6,         // VO starts this long after the scene cut
    lowerThirdIn: 0.5,   // lower third enters after the cut
    lowerThirdHold: 6.0, // seconds the lower third stays
    outroHold: 5.0,
    titlePad: 1.2,
    scenePad: 1.0,       // scene length = VO + pad
    review: false        // true = 5 Mbps preset -> walkthrough-review.mp4; false = 40 Mbps -> walkthrough-final.mp4
  };

  var log = [];
  function L(s) { log.push(s); }

  function hexToRgb(hex) {
    hex = String(hex).replace(/^#/, "");
    return [parseInt(hex.substr(0, 2), 16) / 255, parseInt(hex.substr(2, 2), 16) / 255, parseInt(hex.substr(4, 2), 16) / 255];
  }
  function scriptDir() { return (new File($.fileName)).parent.fsName + "/"; }
  function readText(path) {
    var f = new File(path); if (!f.exists) return null;
    f.encoding = "UTF-8"; f.open("r"); var t = f.read(); f.close(); return t;
  }
  function importFile(path) {
    var f = new File(path);
    if (!f.exists) { L("MISSING " + path); return null; }
    try { return app.project.importFile(new ImportOptions(f)); } catch (e) { L("import failed " + path + ": " + String(e.message)); return null; }
  }
  function resolvePS(family, style, guess) {
    try {
      if (app.fonts && app.fonts.getFontsByFamilyNameAndStyleName) {
        var arr = app.fonts.getFontsByFamilyNameAndStyleName(family, style);
        if (arr && arr.length) return arr[0].postScriptName;
      }
    } catch (e) {}
    return guess;
  }
  function easeAll(prop) {
    var spatial = false; try { spatial = prop.isSpatial; } catch (e) {}
    var dim = spatial ? 1 : ((prop.value instanceof Array) ? prop.value.length : 1);
    for (var i = 1; i <= prop.numKeys; i++) {
      prop.setInterpolationTypeAtKey(i, KeyframeInterpolationType.BEZIER, KeyframeInterpolationType.BEZIER);
      var ein = [], eout = [];
      for (var d = 0; d < dim; d++) { ein.push(new KeyframeEase(0, 33)); eout.push(new KeyframeEase(0, 33)); }
      prop.setTemporalEaseAtKey(i, ein, eout);
    }
  }
  function tg(layer) { return layer.property("ADBE Transform Group"); }
  function keys(prop, arr) { for (var i = 0; i < arr.length; i++) prop.setValueAtTime(arr[i][0], arr[i][1]); easeAll(prop); }

  function makeText(comp, name, str, fontPS, size, rgb, tracking) {
    var layer = comp.layers.addText(str);
    layer.name = name;
    var td = layer.property("ADBE Text Properties").property("ADBE Text Document");
    var doc = td.value;
    doc.fontSize = size;
    try { doc.font = fontPS; } catch (e) {}
    doc.applyFill = true; doc.fillColor = rgb; doc.applyStroke = false;
    doc.justification = ParagraphJustification.LEFT_JUSTIFY;
    if (tracking !== undefined) doc.tracking = tracking;
    doc.text = str;
    td.setValue(doc);
    tg(layer).property("ADBE Anchor Point").setValue([0, 0]);
    return layer;
  }
  function rectOf(layer) { return layer.sourceRectAtTime(0, false); }
  function fitWidth(layer, maxW, minSize) {
    // shrink a card's text until it fits the frame; long outro lines otherwise run off both edges
    var td = layer.property("ADBE Text Properties").property("ADBE Text Document"), doc = td.value;
    while (rectOf(layer).width > maxW && doc.fontSize > minSize) {
      doc.fontSize = doc.fontSize - 4; td.setValue(doc); doc = td.value;
    }
  }
  function placeLeft(layer, left, baseline) {
    var r = rectOf(layer);
    tg(layer).property("ADBE Position").setValue([left - r.left, baseline]);
  }
  function placeCenter(layer, cx, baseline) {
    var r = rectOf(layer);
    tg(layer).property("ADBE Position").setValue([cx - (r.left + r.width / 2), baseline]);
  }
  function makeRect(comp, name, x, y, w, h, rgb, radius) {
    var s = comp.layers.addShape(); s.name = name;
    var gc = s.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group").property("ADBE Vectors Group");
    var rc = gc.addProperty("ADBE Vector Shape - Rect");
    rc.property("ADBE Vector Rect Size").setValue([w, h]);
    rc.property("ADBE Vector Rect Position").setValue([w / 2, h / 2]);
    try { rc.property("ADBE Vector Rect Roundness").setValue(radius || 0); } catch (e) {}
    gc.addProperty("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").setValue([rgb[0], rgb[1], rgb[2], 1]);
    tg(s).property("ADBE Anchor Point").setValue([0, 0]);
    tg(s).property("ADBE Position").setValue([x, y]);
    return s;
  }
  function span(layer, inT, outT) { layer.startTime = inT; layer.inPoint = inT; layer.outPoint = outT; }

  try {
    app.beginUndoGroup("Build walkthrough");
    var dir = scriptDir();
    var raw = readText(dir + "manifest.json");
    if (!raw) throw new Error("manifest.json not found next to the script");
    var M = eval("(" + raw + ")");
    var fps = CONFIG.fps, Wd = CONFIG.width, Ht = CONFIG.height;
    var bg = hexToRgb(CONFIG.bg), ink = hexToRgb(CONFIG.ink), muted = hexToRgb(CONFIG.muted), accent = hexToRgb(CONFIG.accent), panel = hexToRgb(CONFIG.panel);
    var fBold = resolvePS("Inter", "Bold", CONFIG.fontBold), fReg = resolvePS("Inter", "Regular", CONFIG.fontRegular), fMed = resolvePS("Inter", "Medium", CONFIG.fontMedium);
    L("fonts: " + fBold + " / " + fReg + " / " + fMed);

    // scene timeline
    var scenes = M.scenes, t = 0, i;
    for (i = 0; i < scenes.length; i++) {
      var sc = scenes[i];
      sc.start = t;
      if (sc.kind === "title") sc.length = (sc.vo_duration || 0) + CONFIG.titlePad + CONFIG.voLead;
      else if (sc.kind === "outro") sc.length = CONFIG.outroHold;
      else sc.length = Math.max((sc.vo_duration || 0) + CONFIG.voLead + CONFIG.scenePad, 4);
      t += sc.length;
    }
    var total = t;

    // drop an older build so the script is re-runnable
    for (i = app.project.numItems; i >= 1; i--) {
      var it = app.project.item(i);
      if (it instanceof CompItem && it.name === CONFIG.compName) it.remove();
    }
    var comp = app.project.items.addComp(CONFIG.compName, Wd, Ht, 1, total, fps);
    var bgSolid = comp.layers.addSolid(bg, "bg", Wd, Ht, 1, total);

    // folder for footage
    var folder = null;
    for (i = 1; i <= app.project.numItems; i++) if (app.project.item(i) instanceof FolderItem && app.project.item(i).name === "walkthrough-footage") folder = app.project.item(i);
    if (!folder) folder = app.project.items.addFolder("walkthrough-footage");

    for (i = 0; i < scenes.length; i++) {
      var s = scenes[i], s0 = s.start, s1 = s.start + s.length;

      if (s.kind === "title" || s.kind === "outro") {
        var bar = makeRect(comp, "bar-" + s.id, 0, 0, 14, 150, accent, 0);
        var h1 = makeText(comp, "h1-" + s.id, s.title_text, fBold, s.kind === "title" ? 92 : 72, ink, -20);
        var h2 = makeText(comp, "h2-" + s.id, s.subtitle_text || "", fReg, 38, muted, 0);
        fitWidth(h1, Wd - 300, 40); fitWidth(h2, Wd - 300, 26);
        var r1 = rectOf(h1), r2 = rectOf(h2);
        var blockW = Math.max(r1.width, r2.width) + 60, left = (Wd - blockW) / 2 + 60;
        var base1 = Ht / 2 - 10, base2 = base1 + 70;
        placeLeft(h1, left, base1); placeLeft(h2, left, base2);
        tg(bar).property("ADBE Position").setValue([left - 48, base1 - r1.height - 4]);
        var layersT = [bar, h1, h2], k;
        for (k = 0; k < layersT.length; k++) {
          span(layersT[k], s0, s1);
          var op = tg(layersT[k]).property("ADBE Opacity");
          keys(op, [[s0 + 0.15 * k, 0], [s0 + 0.15 * k + 0.6, 100], [s1 - 0.6, 100], [s1 - 0.05, 0]]);
          var pp = tg(layersT[k]).property("ADBE Position"), pv = pp.value;
          keys(pp, [[s0 + 0.15 * k, [pv[0] - 30, pv[1]]], [s0 + 0.15 * k + 0.7, pv]]);
        }
      } else {
        var item = importFile(s.clip);
        if (item) {
          item.parentFolder = folder;
          var lay = comp.layers.add(item);
          lay.name = "clip-" + s.id;
          lay.startTime = s0; lay.inPoint = s0; lay.outPoint = Math.min(s1, s0 + item.duration);
          if (s0 + item.duration < s1) {
            // clip shorter than the scene: freeze the last frame by time remapping
            lay.timeRemapEnabled = true;
            var tr = lay.property("ADBE Time Remapping");
            var lastT = item.duration - 1 / fps;
            tr.setValueAtTime(s0, 0); tr.setValueAtTime(s0 + lastT, lastT); tr.setValueAtTime(s1, lastT);
            lay.outPoint = s1;
            L("scene " + s.id + ": clip " + item.duration.toFixed(1) + "s < scene " + s.length.toFixed(1) + "s, last frame held");
          }
          // keep the 16:9 capture inside the frame with a small inset
          var sc0 = 100 * (Wd - 80) / item.width;
          var scP = tg(lay).property("ADBE Scale");
          keys(scP, [[s0, [sc0, sc0]], [s1, [sc0 + CONFIG.kenBurns, sc0 + CONFIG.kenBurns]]]);
          keys(tg(lay).property("ADBE Opacity"), [[s0, 0], [s0 + CONFIG.fade, 100], [s1 - CONFIG.fade, 100], [s1, 0]]);
        }
        // lower third
        var lt = makeText(comp, "lt-" + s.id, s.title_text, fMed, 34, ink, 0);
        var ltR = rectOf(lt);
        var padX = 26, boxH = 64, boxY = Ht - 120, boxX = 70;
        var box = makeRect(comp, "ltbox-" + s.id, boxX, boxY, ltR.width + padX * 2 + 14, boxH, panel, 10);
        var stripe = makeRect(comp, "ltstripe-" + s.id, boxX, boxY, 8, boxH, accent, 4);
        placeLeft(lt, boxX + 14 + padX, boxY + boxH / 2 + ltR.height / 2 - 4);
        var ltIn = s0 + CONFIG.lowerThirdIn, ltOut = Math.min(s1 - 0.4, ltIn + CONFIG.lowerThirdHold);
        var parts = [box, stripe, lt], m;
        for (m = 0; m < parts.length; m++) {
          span(parts[m], ltIn, ltOut);
          keys(tg(parts[m]).property("ADBE Opacity"), [[ltIn, 0], [ltIn + 0.35, 100], [ltOut - 0.35, 100], [ltOut, 0]]);
          var p2 = tg(parts[m]).property("ADBE Position"), v2 = p2.value;
          keys(p2, [[ltIn, [v2[0] - 24, v2[1]]], [ltIn + 0.45, v2]]);
        }
        // widen the box animation by scaling x from the left
        keys(tg(box).property("ADBE Scale"), [[ltIn, [0, 100]], [ltIn + 0.45, [100, 100]]]);
        // layers add at the top of the stack: text was made first, so lift it above box and stripe
        lt.moveToBeginning();
      }

      // voice
      if (s.vo) {
        var voItem = importFile(s.vo);
        if (voItem) {
          voItem.parentFolder = folder;
          var voLay = comp.layers.add(voItem);
          voLay.name = "vo-" + s.id;
          voLay.startTime = s0 + CONFIG.voLead;
          voLay.moveToEnd();
        }
      }
    }
    bgSolid.moveToEnd();
    bgSolid.locked = true;

    // scene markers for the edit
    for (i = 0; i < scenes.length; i++) comp.markerProperty.setValueAtTime(scenes[i].start, new MarkerValue(scenes[i].id + " " + scenes[i].title_text));

    // render queue: one item, H.264 if the install has a template for it, else Lossless (ffmpeg finishes it)
    var rq = app.project.renderQueue;
    while (rq.numItems > 0) rq.item(1).remove();
    var rqi = rq.items.add(comp);
    var om = rqi.outputModule(1), tpls = om.templates, chosen = "Lossless", ti;
    // prefer the highest-bitrate H.264 preset; UI text falls apart below ~15 Mbps
    var prefs = CONFIG.review ? [/H\.264.*5 Mbps/, /H\.264.*Match Render/] : [/H\.264.*40 Mbps/, /H\.264.*15 Mbps/, /H\.264.*Match Render/], pi;
    for (pi = 0; pi < prefs.length && chosen === "Lossless"; pi++) {
      for (ti = 0; ti < tpls.length; ti++) { if (prefs[pi].test(tpls[ti])) { chosen = tpls[ti]; break; } }
    }
    try { om.applyTemplate(chosen); } catch (e3) { L("applyTemplate failed for " + chosen + ": " + String(e3.message)); chosen = "Lossless"; om.applyTemplate(chosen); }
    var ext = /H\.264/.test(chosen) ? ".mp4" : ".avi";
    var outFolder = new Folder(dir + "../out"); if (!outFolder.exists) outFolder.create();
    om.file = new File(outFolder.fsName + (CONFIG.review ? "/walkthrough-review" : "/walkthrough-final") + ext);
    L("render queue: template '" + chosen + "' -> " + om.file.fsName);
    L("templates available: " + tpls.join(" | "));

    // save next to the script
    var aep = new File(dir + "walkthrough.aep");
    app.project.save(aep);
    L("saved " + aep.fsName + "  comp " + total.toFixed(1) + "s, " + scenes.length + " scenes");

    var lf = new File(dir + "build-log.txt"); lf.encoding = "UTF-8"; lf.open("w"); lf.write(log.join("\n")); lf.close();
    app.endUndoGroup();
  } catch (err) {
    try { app.endUndoGroup(); } catch (e2) {}
    // ExtendScript throws on ("" + errorObject); read the fields instead
    var msg = "unknown";
    try { msg = String(err.message) + " (line " + String(err.line) + ")"; } catch (e4) {}
    // log only, no alert: a modal dialog would block the next scripted run
    var ef = new File(scriptDir() + "build-log.txt"); ef.encoding = "UTF-8"; ef.open("w"); ef.write("ERROR " + msg + "\n" + log.join("\n")); ef.close();
  }
})();
