// GroupAssetSymbols.jsfl
(function () {
  var doc = fl.getDocumentDOM();
  if (!doc) {
    fl.trace("No document open.");
    return;
  }

  var PREFIX = "asset_";

  // Safer default: only group the first frame of each symbol.
  // Set to true if you want to attempt grouping every frame.
  var GROUP_ALL_FRAMES = false;

  // Avoid wrapping a single existing group into another group.
  var SKIP_IF_ALREADY_SINGLE_GROUP = true;

  // Set true to only log actions (no modifications).
  var DRY_RUN = false;

  function baseName(path) {
    var parts = String(path).split("/");
    return parts[parts.length - 1];
  }

  function isTargetLibraryItem(item) {
    if (!item || !item.name) return false;
    if (baseName(item.name).indexOf(PREFIX) !== 0) return false;

    // Typical symbol types you can edit and group contents inside.
    return (
      item.itemType === "movie clip" ||
      item.itemType === "graphic" ||
      item.itemType === "button"
    );
  }

  function shouldGroup(dom) {
    var sel = dom.selection;
    if (!sel || sel.length === 0) return false;

    if (!SKIP_IF_ALREADY_SINGLE_GROUP) return true;

    return !(sel.length === 1 && sel[0].elementType === "group");
  }

  var lib = doc.library;
  var items = lib.items;

  var targets = [];
  for (var i = 0; i < items.length; i++) {
    if (isTargetLibraryItem(items[i])) targets.push(items[i].name);
  }

  fl.trace(
    "GroupAssetSymbols: found " +
      targets.length +
      " library item(s) with base name starting '" +
      PREFIX +
      "'."
  );

  var processedSymbols = 0;
  var groupedFrames = 0;

  for (var t = 0; t < targets.length; t++) {
    var name = targets[t];

    lib.editItem(name);

    // After editItem, the current DOM refers to the symbol being edited.
    var symDom = fl.getDocumentDOM();
    var tl = symDom.getTimeline();

    // Compute a frame limit that covers all layers if GROUP_ALL_FRAMES is enabled.
    var maxFrameCount = 1;
    for (var l = 0; l < tl.layers.length; l++) {
      var layer = tl.layers[l];
      if (layer && layer.frames && layer.frames.length > maxFrameCount) {
        maxFrameCount = layer.frames.length;
      }
    }

    var frameLimit = GROUP_ALL_FRAMES ? maxFrameCount : 1;

    for (var f = 0; f < frameLimit; f++) {
      tl.currentFrame = f;

      symDom.selectNone();
      symDom.selectAll();

      if (shouldGroup(symDom)) {
        if (!DRY_RUN) symDom.group();
        groupedFrames++;
      }
    }

    if (!DRY_RUN) symDom.exitEditMode();

    processedSymbols++;
  }

  fl.trace(
    "GroupAssetSymbols: processed " +
      processedSymbols +
      " symbol(s), grouped " +
      groupedFrames +
      " frame(s)" +
      (DRY_RUN ? " (dry-run)" : "") +
      "."
  );

  // Return focus to the original document (safety).
  fl.getDocumentDOM();
})();
