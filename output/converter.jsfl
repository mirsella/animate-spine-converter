/******/ (function() { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ "./source/core/Converter.ts":
/*!**********************************!*\
  !*** ./source/core/Converter.ts ***!
  \**********************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {



exports.Converter = void 0;
var Logger_1 = __webpack_require__(/*! ../logger/Logger */ "./source/logger/Logger.ts");
var SpineAnimationHelper_1 = __webpack_require__(/*! ../spine/SpineAnimationHelper */ "./source/spine/SpineAnimationHelper.ts");
var SpineImage_1 = __webpack_require__(/*! ../spine/SpineImage */ "./source/spine/SpineImage.ts");
var SpineSkeleton_1 = __webpack_require__(/*! ../spine/SpineSkeleton */ "./source/spine/SpineSkeleton.ts");
var ConvertUtil_1 = __webpack_require__(/*! ../utils/ConvertUtil */ "./source/utils/ConvertUtil.ts");
var ImageUtil_1 = __webpack_require__(/*! ../utils/ImageUtil */ "./source/utils/ImageUtil.ts");
var JsonEncoder_1 = __webpack_require__(/*! ../utils/JsonEncoder */ "./source/utils/JsonEncoder.ts");
var LayerMaskUtil_1 = __webpack_require__(/*! ../utils/LayerMaskUtil */ "./source/utils/LayerMaskUtil.ts");
var LibraryUtil_1 = __webpack_require__(/*! ../utils/LibraryUtil */ "./source/utils/LibraryUtil.ts");
var PathUtil_1 = __webpack_require__(/*! ../utils/PathUtil */ "./source/utils/PathUtil.ts");
var ShapeUtil_1 = __webpack_require__(/*! ../utils/ShapeUtil */ "./source/utils/ShapeUtil.ts");
var StringUtil_1 = __webpack_require__(/*! ../utils/StringUtil */ "./source/utils/StringUtil.ts");
var ConverterContextGlobal_1 = __webpack_require__(/*! ./ConverterContextGlobal */ "./source/core/ConverterContextGlobal.ts");
var Converter = /** @class */ (function () {
    function Converter(document, config) {
        this._document = document;
        this._workingPath = PathUtil_1.PathUtil.parentPath(document.pathURI);
        this._config = config;
    }
    Converter.prototype.getIndent = function (depth) {
        var indent = "";
        for (var i = 0; i < depth; i++)
            indent += "  ";
        return indent;
    };
    Converter.prototype.safelyExportImage = function (context, exportAction) {
        var containerItem = null;
        var curr = context.parent;
        while (curr != null) {
            if (curr.element && curr.element.elementType === 'instance' && curr.element.instanceType === 'symbol') {
                if (curr.element.libraryItem) {
                    containerItem = curr.element.libraryItem;
                    break;
                }
            }
            curr = curr.parent;
        }
        var dom = this._document;
        var currentTl = dom.getTimeline();
        var mustEdit = false;
        if (containerItem && currentTl.name !== containerItem.name) {
            if (dom.library.itemExists(containerItem.name)) {
                mustEdit = true;
            }
        }
        if (mustEdit) {
            dom.library.editItem(containerItem.name);
            try {
                return exportAction();
            }
            finally {
                dom.exitEditMode();
            }
        }
        else {
            return exportAction();
        }
    };
    Converter.prototype.convertElementSlot = function (context, exportTarget, imageExportFactory) {
        var baseImageName = context.global.shapesCache.get(exportTarget);
        if (baseImageName == null) {
            baseImageName = ConvertUtil_1.ConvertUtil.createAttachmentName(context.element, context);
            context.global.shapesCache.set(exportTarget, baseImageName);
        }
        var baseImagePath = this.prepareImagesExportPath(context, baseImageName);
        var spineImage = context.global.imagesCache.get(baseImagePath);
        if (spineImage == null) {
            try {
                var hints = this.createSelectionHints(context);
                Logger_1.Logger.trace("[IMAGE] Exporting new image: ".concat(baseImageName, " (Path: ").concat(baseImagePath, ")"));
                spineImage = this.safelyExportImage(context, function () {
                    return imageExportFactory(context, baseImagePath);
                });
            }
            catch (e) {
                Logger_1.Logger.error("[Converter] Image export error for '".concat(baseImageName, "': ").concat(e, ". Using placeholder."));
                spineImage = new SpineImage_1.SpineImage(baseImagePath, 1, 1, 1, 0, 0, 0, 0);
            }
            context.global.imagesCache.set(baseImagePath, spineImage);
        }
        else {
            // Logger.trace(`[IMAGE] Cache hit for: ${baseImageName}`);
        }
        var element = context.element;
        var calcMatrix = context.matrixOverride || element.matrix;
        var regX = element.x;
        var regY = element.y;
        var transX = element.transformX;
        var transY = element.transformY;
        if (context.matrixOverride && context.positionOverride) {
            regX = calcMatrix.tx;
            regY = calcMatrix.ty;
            transX = context.positionOverride.x;
            transY = context.positionOverride.y;
        }
        var requiredOffset = ImageUtil_1.ImageUtil.calculateAttachmentOffset(calcMatrix, regX, regY, transX, transY, spineImage.imageCenterOffsetX, spineImage.imageCenterOffsetY, baseImageName);
        var spineOffsetX = requiredOffset.x;
        var spineOffsetY = requiredOffset.y;
        var finalAttachmentName = baseImageName;
        var TOLERANCE = 2.0;
        var variants = context.global.attachmentVariants.get(baseImageName);
        if (!variants) {
            variants = [];
            variants.push({ x: spineImage.x, y: spineImage.y, name: baseImageName });
            context.global.attachmentVariants.set(baseImageName, variants);
        }
        var found = false;
        for (var _i = 0, variants_1 = variants; _i < variants_1.length; _i++) {
            var v = variants_1[_i];
            var dx = Math.abs(v.x - spineOffsetX);
            var dy = Math.abs(v.y - spineOffsetY);
            if (dx < TOLERANCE && dy < TOLERANCE) {
                finalAttachmentName = v.name;
                found = true;
                break;
            }
        }
        if (!found) {
            finalAttachmentName = baseImageName + '_' + (variants.length + 1);
            variants.push({ x: spineOffsetX, y: spineOffsetY, name: finalAttachmentName });
            Logger_1.Logger.trace("[VARIANT] New variant created: ".concat(finalAttachmentName, " (Offset: ").concat(spineOffsetX.toFixed(2), ", ").concat(spineOffsetY.toFixed(2), ") for ").concat(baseImageName));
        }
        else {
            // Logger.trace(`[VARIANT] Matched variant: ${finalAttachmentName} for ${baseImageName}`);
        }
        var subcontext = context.createSlot(context.element);
        var slot = subcontext.slot;
        Logger_1.Logger.trace("[SLOT] Created/Retrieved slot '".concat(slot.name, "' for '").concat(baseImageName, "' (Stage: ").concat(context.global.stageType, ")"));
        if (context.global.stageType === "structure" /* ConverterStageType.STRUCTURE */) {
            if (context.clipping != null) {
                context.clipping.end = slot;
            }
            return;
        }
        var attachmentName = this.prepareImagesAttachmentName(context, finalAttachmentName);
        var attachment = slot.createAttachment(attachmentName, "region" /* SpineAttachmentType.REGION */);
        if (finalAttachmentName !== baseImageName) {
            attachment.path = this.prepareImagesAttachmentName(context, baseImageName);
        }
        attachment.width = spineImage.width;
        attachment.height = spineImage.height;
        attachment.scaleX = 1 / spineImage.scale;
        attachment.scaleY = 1 / spineImage.scale;
        attachment.x = spineOffsetX;
        attachment.y = spineOffsetY;
        SpineAnimationHelper_1.SpineAnimationHelper.applySlotAttachment(context.global.animation, slot, context, attachment, context.time);
    };
    Converter.prototype.createSelectionHints = function (context) {
        try {
            var el = context.element;
            var layer = el.layer;
            var frame = context.frame;
            if (!layer || !frame)
                return undefined;
            var timeline = null;
            var curr = context.parent;
            while (curr) {
                if (curr.element && curr.element.libraryItem && curr.element.libraryItem.timeline) {
                    var tl = curr.element.libraryItem.timeline;
                    for (var i = 0; i < tl.layers.length; i++) {
                        if (tl.layers[i] === layer) {
                            timeline = tl;
                            break;
                        }
                    }
                }
                if (timeline)
                    break;
                curr = curr.parent;
            }
            if (!timeline)
                return undefined;
            var layerIndex = -1;
            for (var i = 0; i < timeline.layers.length; i++) {
                if (timeline.layers[i] === layer) {
                    layerIndex = i;
                    break;
                }
            }
            if (layerIndex === -1)
                return undefined;
            var elementIndex = -1;
            if (frame.elements) {
                for (var i = 0; i < frame.elements.length; i++) {
                    if (frame.elements[i] === el) {
                        elementIndex = i;
                        break;
                    }
                }
            }
            if (elementIndex === -1)
                return undefined;
            return {
                layerIndex: layerIndex,
                frameIndex: frame.startFrame,
                elementIndex: elementIndex
            };
        }
        catch (e) {
            return undefined;
        }
    };
    Converter.prototype.convertBitmapElementSlot = function (context) {
        var _this = this;
        this.convertElementSlot(context, context.element.libraryItem, function (context, imagePath) {
            return ImageUtil_1.ImageUtil.exportBitmap(imagePath, context.element, _this._config.exportImages);
        });
    };
    Converter.prototype.convertShapeMaskElementSlot = function (context, matrix, controlOffset) {
        if (matrix === void 0) { matrix = null; }
        if (controlOffset === void 0) { controlOffset = null; }
        var attachmentName = context.global.shapesCache.get(context.element);
        if (attachmentName == null) {
            attachmentName = ConvertUtil_1.ConvertUtil.createAttachmentName(context.element, context);
            context.global.shapesCache.set(context.element, attachmentName);
        }
        var subcontext = context.createSlot(context.element);
        var slot = subcontext.slot;
        var attachment = slot.createAttachment(attachmentName, "clipping" /* SpineAttachmentType.CLIPPING */);
        context.clipping = attachment;
        attachment.vertices = ShapeUtil_1.ShapeUtil.extractVertices(context.element, 32, matrix, controlOffset);
        attachment.vertexCount = attachment.vertices != null ? attachment.vertices.length / 2 : 0;
        if (context.global.stageType === "structure" /* ConverterStageType.STRUCTURE */) {
            attachment.end = slot;
            return;
        }
        SpineAnimationHelper_1.SpineAnimationHelper.applySlotAttachment(context.global.animation, slot, context, attachment, context.time);
    };
    Converter.prototype.convertShapeElementSlot = function (context) {
        var _this = this;
        this.convertElementSlot(context, context.element, function (context, imagePath) {
            var hints = _this.createSelectionHints(context);
            return ImageUtil_1.ImageUtil.exportShape(imagePath, context.element, _this._document, _this._config.shapeExportScale, _this._config.exportShapes, hints);
        });
    };
    Converter.prototype.composeElementMaskLayer = function (context, convertLayer, allowBaking) {
        var _this = this;
        this.convertElementLayer(context.switchContextLayer(convertLayer), convertLayer, function (subcontext) {
            var type = subcontext.element.elementType;
            if (type === 'shape') {
                var m = subcontext.element.matrix;
                var localAnchorX = subcontext.element.transformationPoint.x;
                var localAnchorY = subcontext.element.transformationPoint.y;
                var offsetMatrix = {
                    a: m.a, b: m.b, c: m.c, d: m.d,
                    tx: m.tx - localAnchorX,
                    ty: m.ty - localAnchorY
                };
                _this.convertShapeMaskElementSlot(subcontext, offsetMatrix, null);
                context.clipping = subcontext.clipping;
            }
            else if (type === 'instance') {
                var innerShape = _this.findFirstShapeInSymbol(subcontext.element);
                if (innerShape) {
                    var im = innerShape.matrix;
                    var localAnchorX = subcontext.element.transformationPoint.x;
                    var localAnchorY = subcontext.element.transformationPoint.y;
                    var offsetMatrix = {
                        a: im.a, b: im.b, c: im.c, d: im.d,
                        tx: im.tx - localAnchorX,
                        ty: im.ty - localAnchorY
                    };
                    var originalElement = subcontext.element;
                    subcontext.element = innerShape;
                    _this.convertShapeMaskElementSlot(subcontext, offsetMatrix, null);
                    subcontext.element = originalElement;
                    context.clipping = subcontext.clipping;
                }
            }
        }, allowBaking);
    };
    Converter.prototype.findFirstShapeInSymbol = function (instance) {
        if (!instance.libraryItem || !instance.libraryItem.timeline)
            return null;
        var timeline = instance.libraryItem.timeline;
        for (var _i = 0, _a = timeline.layers; _i < _a.length; _i++) {
            var layer = _a[_i];
            if (layer.layerType !== 'normal')
                continue;
            for (var _b = 0, _c = layer.frames; _b < _c.length; _b++) {
                var frame = _c[_b];
                for (var _d = 0, _e = frame.elements; _d < _e.length; _d++) {
                    var element = _e[_d];
                    if (element.elementType === 'shape')
                        return element;
                }
            }
        }
        return null;
    };
    Converter.prototype.disposeElementMaskLayer = function (context) {
        context.clipping = null;
    };
    Converter.prototype.convertPrimitiveElement = function (context) {
        var _this = this;
        this.convertElementSlot(context, context.element.libraryItem, function (context, imagePath) {
            return ImageUtil_1.ImageUtil.exportLibraryItem(imagePath, context.element, _this._config.shapeExportScale, _this._config.exportShapes);
        });
    };
    Converter.prototype.convertCompositeElementLayer = function (context, convertLayer, allowBaking) {
        var _this = this;
        this.convertElementLayer(context.switchContextLayer(convertLayer), convertLayer, function (subcontext) {
            var _a = subcontext.element, elementType = _a.elementType, instanceType = _a.instanceType;
            if (elementType === 'shape')
                _this.convertShapeElementSlot(subcontext);
            if (elementType === 'text' && _this._config.exportTextAsShapes)
                _this.convertShapeElementSlot(subcontext);
            if (elementType === 'instance') {
                if (instanceType === 'bitmap')
                    _this.convertBitmapElementSlot(subcontext);
                if (instanceType === 'symbol')
                    _this.convertElement(subcontext);
            }
        }, allowBaking);
    };
    Converter.prototype.getLiveTransform = function (context, frameIndex) {
        var _a;
        var dom = this._document;
        var timeline = dom.getTimeline();
        try {
            timeline.currentFrame = frameIndex;
            var hints = this.createSelectionHints(context);
            if (!hints) {
                return null;
            }
            // Aggressively ensure the layer is visible and unlocked for selection
            var layer = timeline.layers[hints.layerIndex];
            var wasLocked = layer.locked;
            var wasVisible = layer.visible;
            layer.locked = false;
            layer.visible = true;
            dom.selectNone();
            var frame = layer.frames[frameIndex];
            if (!frame) {
                layer.locked = wasLocked;
                layer.visible = wasVisible;
                return null;
            }
            var el = frame.elements[hints.elementIndex];
            if (!el) {
                Logger_1.Logger.trace("    [LIVE] No element at index ".concat(hints.elementIndex, " on layer ").concat(hints.layerIndex, " frame ").concat(frameIndex));
                layer.locked = wasLocked;
                layer.visible = wasVisible;
                return null;
            }
            el.selected = true;
            // Selection sometimes fails in JSFL if not forced
            if (dom.selection.length === 0) {
                dom.selection = [el];
            }
            if (dom.selection.length > 0) {
                var selected = dom.selection[0];
                var res = {
                    matrix: selected.matrix,
                    transformX: selected.transformX,
                    transformY: selected.transformY
                };
                layer.locked = wasLocked;
                layer.visible = wasVisible;
                return res;
            }
            else {
                Logger_1.Logger.trace("    [LIVE] Selection failed for '".concat(el.name || '<anon>', "' at frame ").concat(frameIndex, " even after forcing."));
            }
            layer.locked = wasLocked;
            layer.visible = wasVisible;
        }
        catch (e) {
            Logger_1.Logger.warning("[Converter] LiveTransform failed for frame ".concat(frameIndex, " (Layer ").concat((_a = context.layer) === null || _a === void 0 ? void 0 : _a.name, "): ").concat(e));
        }
        return null;
    };
    Converter.prototype.convertCompositeElement = function (context) {
        var item = context.element.libraryItem;
        if (!item)
            return;
        var indent = this.getIndent(context.recursionDepth);
        Logger_1.Logger.trace("".concat(indent, "[STRUCT] Symbol: ").concat(item.name, " (Depth: ").concat(context.recursionDepth, ")"));
        if (context.recursionDepth > 32) {
            Logger_1.Logger.warning("".concat(indent, "[WARN] Max recursion depth reached for ").concat(item.name, ". Skipping."));
            return;
        }
        var canEdit = false;
        var mustRestoreContext = false;
        var currentTl = this._document.getTimeline();
        if (currentTl.name !== item.name) {
            if (this._document.library.itemExists(item.name)) {
                // ALWAYS enter edit mode to enable "Live" matrix sampling for all depths.
                // This ensures nested tweens are correctly interpolated.
                this._document.library.editItem(item.name);
                canEdit = true;
                mustRestoreContext = true;
            }
        }
        else {
            canEdit = true;
        }
        try {
            var timeline = canEdit ? this._document.getTimeline() : item.timeline;
            var layers = timeline.layers;
            for (var i = layers.length - 1; i >= 0; i--) {
                var layer = layers[i];
                if (!layer.visible) {
                    Logger_1.Logger.trace("".concat(indent, "  [LAYER] Skipping Hidden Layer: ").concat(layer.name));
                    continue;
                }
                Logger_1.Logger.trace("".concat(indent, "  [LAYER] Processing: ").concat(layer.name, " (Type: ").concat(layer.layerType, ")"));
                if (layer.layerType === 'normal' || layer.layerType === 'guided') {
                    this.convertCompositeElementLayer(context, layer, canEdit);
                }
                else if (layer.layerType === 'masked') {
                    var mask = LayerMaskUtil_1.LayerMaskUtil.extractTargetMask(layers, i);
                    if (mask)
                        this.composeElementMaskLayer(context, mask, canEdit);
                    this.convertCompositeElementLayer(context, layer, canEdit);
                }
                else if (layer.layerType === 'mask') {
                    this.disposeElementMaskLayer(context);
                }
            }
        }
        finally {
            if (mustRestoreContext) {
                this._document.exitEditMode();
            }
        }
    };
    Converter.prototype.hideLayerSlots = function (context, layer, time) {
        var slots = context.global.layersCache.get(layer);
        var indent = this.getIndent(context.recursionDepth);
        if (slots && slots.length > 0) {
            for (var _i = 0, slots_1 = slots; _i < slots_1.length; _i++) {
                var s = slots_1[_i];
                Logger_1.Logger.trace("".concat(indent, "    [Visibility] Hiding slot '").concat(s.name, "' at Time ").concat(time.toFixed(3), " (Layer: ").concat(layer.name, ")"));
                SpineAnimationHelper_1.SpineAnimationHelper.applySlotAttachment(context.global.animation, s, context, null, time);
                // Also hide all children slots recursively
                this.hideChildSlots(context, s.bone, time);
            }
        }
    };
    Converter.prototype.hideChildSlots = function (context, parentBone, time) {
        var skeleton = context.global.skeleton;
        var animation = context.global.animation;
        for (var i = 0; i < skeleton.slots.length; i++) {
            var slot = skeleton.slots[i];
            // Optimization: slot.bone.name.indexOf(parentBone.name + "/") === 0 
            // would also work if we used naming conventions strictly.
            // But checking the actual parent reference is safer.
            var curr = slot.bone;
            while (curr) {
                if (curr === parentBone) {
                    SpineAnimationHelper_1.SpineAnimationHelper.applySlotAttachment(animation, slot, context, null, time);
                    break;
                }
                curr = curr.parent;
            }
        }
    };
    Converter.prototype.convertElementLayer = function (context, layer, factory, allowBaking) {
        var _a, _b, _c;
        if (allowBaking === void 0) { allowBaking = true; }
        var _d = context.global, label = _d.label, stageType = _d.stageType, frameRate = _d.frameRate;
        var start = 0, end = layer.frames.length - 1;
        var indent = this.getIndent(context.recursionDepth);
        var isNestedFlattening = false;
        var targetFrame = 0;
        if (context.parent == null && label != null && stageType === "animation" /* ConverterStageType.ANIMATION */) {
            start = label.startFrameIdx;
            end = label.endFrameIdx;
        }
        else if (context.parent != null && stageType === "animation" /* ConverterStageType.ANIMATION */) {
            try {
                var instance = context.element;
                // FIX: Check context.frame instead of context.parent.frame
                // We rely on the current context's frame/internalFrame to determine state relative to parent
                if (instance && instance.libraryItem && instance.libraryItem.timeline && context.frame) {
                    var tl = instance.libraryItem.timeline;
                    // NESTED TIME RESOLUTION:
                    // Use THIS context's internal frame (passed from parent's loop) to determine playhead position.
                    // This ensures "Animations in Animations" stay in sync because context.internalFrame IS the parent's current frame index.
                    var parentInternalFrame = (context.internalFrame !== undefined) ? context.internalFrame : 0;
                    var parentKeyframeStart = context.frame.startFrame;
                    var frameOffset = Math.max(0, parentInternalFrame - parentKeyframeStart);
                    var firstFrame = (instance.firstFrame !== undefined) ? instance.firstFrame : 0;
                    var loopMode = (instance.loop !== undefined) ? instance.loop : 'loop';
                    var tlFrameCount = tl.frameCount;
                    if (tlFrameCount <= 0)
                        return;
                    if (loopMode === 'single frame') {
                        targetFrame = firstFrame;
                    }
                    else if (loopMode === 'play once') {
                        targetFrame = firstFrame + frameOffset;
                        if (targetFrame >= tlFrameCount)
                            targetFrame = tlFrameCount - 1;
                    }
                    else { // loop
                        targetFrame = (firstFrame + frameOffset) % tlFrameCount;
                    }
                    Logger_1.Logger.trace("".concat(indent, "    [NESTED] Instance: ").concat(instance.name || instance.libraryItem.name, " ParentFrame: ").concat(parentInternalFrame, " Offset: ").concat(frameOffset, " Target: ").concat(targetFrame, "/").concat(tlFrameCount));
                    if (targetFrame >= 0 && targetFrame < layer.frames.length) {
                        isNestedFlattening = true;
                        start = targetFrame;
                        end = targetFrame;
                    }
                    else {
                        return;
                    }
                }
            }
            catch (e) { }
        }
        if (isNestedFlattening) {
            var frame = layer.frames[start];
            if (!frame)
                return;
            var time = context.timeOffset;
            Logger_1.Logger.trace("".concat(indent, "  [FLATTEN] ").concat(layer.name, " Frame: ").concat(start, " (Time: ").concat(time.toFixed(3), ") (context.time: ").concat(context.time.toFixed(3), ")"));
            if (frame.elements.length === 0) {
                if (stageType === "animation" /* ConverterStageType.ANIMATION */) {
                    this.hideLayerSlots(context, layer, time);
                }
                return;
            }
            for (var eIdx = 0; eIdx < frame.elements.length; eIdx++) {
                var el = frame.elements[eIdx];
                var matrixOverride = null;
                var positionOverride = null;
                if (stageType === "animation" /* ConverterStageType.ANIMATION */) {
                    var elName = el.name || ((_a = el.libraryItem) === null || _a === void 0 ? void 0 : _a.name) || '<anon>';
                    // SAVE CONTEXT STATE: getLiveTransform uses switchContext... which mutates the context
                    var savedElement = context.element;
                    var savedFrame = context.frame;
                    var live = this.getLiveTransform(context.switchContextFrame(frame).switchContextElement(el), start);
                    // RESTORE CONTEXT STATE
                    context.element = savedElement;
                    context.frame = savedFrame;
                    if (live) {
                        Logger_1.Logger.trace("".concat(indent, "    [LIVE] Sampled '").concat(elName, "' at frame ").concat(start, ": tx=").concat(live.matrix.tx.toFixed(2), " ty=").concat(live.matrix.ty.toFixed(2)));
                        matrixOverride = live.matrix;
                        positionOverride = { x: live.transformX, y: live.transformY };
                    }
                    else {
                        Logger_1.Logger.trace("".concat(indent, "    [LIVE] Sampling failed for '").concat(elName, "' at frame ").concat(start, ". Using context matrix."));
                    }
                }
                // FIX: When flattening, we pass 0 as time because context.time is already absolute for Spine.
                var sub = context.switchContextFrame(frame).createBone(el, 0, matrixOverride, positionOverride);
                sub.internalFrame = start; // Store the calculated internal frame for child symbols
                if (el.elementType === 'instance' && el.instanceType === 'symbol' && stageType === "animation" /* ConverterStageType.ANIMATION */) {
                    var instance = el;
                    var firstFrameOffset = (instance.firstFrame || 0) / frameRate;
                    // timeOffset must be set relative to the new sub-context's absolute time
                    sub.timeOffset = sub.time - firstFrameOffset;
                }
                factory(sub);
            }
            return;
        }
        Logger_1.Logger.trace("".concat(indent, "  [LOOP] ").concat(layer.name, ": Start=").concat(start, " End=").concat(end));
        for (var i = start; i <= end; i++) {
            var time = (i - start) / frameRate;
            time += context.timeOffset;
            if (i < 0 || i >= layer.frames.length || !layer.frames[i]) {
                if (stageType === "animation" /* ConverterStageType.ANIMATION */) {
                    this.hideLayerSlots(context, layer, time);
                }
                continue;
            }
            var frame = layer.frames[i];
            if (!frame)
                continue;
            Logger_1.Logger.trace("".concat(indent, "  [STEP] Frame: ").concat(i, " (Time: ").concat(time.toFixed(3), ")"));
            if (this._config.exportFrameCommentsAsEvents && frame.labelType === 'comment') {
                context.global.skeleton.createEvent(frame.name);
                if (stageType === "animation" /* ConverterStageType.ANIMATION */)
                    SpineAnimationHelper_1.SpineAnimationHelper.applyEventAnimation(context.global.animation, frame.name, time);
            }
            if (frame.elements.length === 0) {
                if (stageType === "animation" /* ConverterStageType.ANIMATION */) {
                    this.hideLayerSlots(context, layer, time);
                }
                continue;
            }
            var activeSlots = [];
            var _loop_1 = function (eIdx) {
                var el = frame.elements[eIdx];
                var elName = el.name || ((_b = el.libraryItem) === null || _b === void 0 ? void 0 : _b.name) || '<anon>';
                if (stageType === "animation" /* ConverterStageType.ANIMATION */) {
                    Logger_1.Logger.trace("".concat(indent, "    [ELEM] Processing element '").concat(elName, "' at Frame ").concat(i, " (Start: ").concat(frame.startFrame, ")"));
                }
                var parentMat = null;
                if (layer.parentLayer) {
                    this_1._document.getTimeline().currentFrame = i;
                    parentMat = this_1.getLayerParentMatrix(layer, i);
                }
                var bakedData = null;
                if (i !== frame.startFrame) {
                    var isClassic = frame.tweenType === 'classic';
                    var isGuided = (layer.parentLayer && layer.parentLayer.layerType === 'guide');
                    var isSupportedEase = !frame.hasCustomEase;
                    if (!allowBaking || (isClassic && !isGuided && isSupportedEase)) {
                        // Skip baking, let Spine interpolate
                        // But we MUST still mark the slot as active!
                        // Recursively discover the slot name
                        var sub_1 = context.switchContextFrame(frame).createBone(el, time, null, null);
                        if (el.elementType === 'instance' && el.instanceType === 'symbol' && stageType === "animation" /* ConverterStageType.ANIMATION */) {
                            var instance = el;
                            var firstFrameOffset = (instance.firstFrame || 0) / frameRate;
                            sub_1.timeOffset = time - firstFrameOffset;
                        }
                        var tempSlot_1 = null;
                        var originalCreateSlot_1 = sub_1.createSlot;
                        sub_1.createSlot = function (element) {
                            var res = originalCreateSlot_1.call(sub_1, element);
                            tempSlot_1 = res.slot;
                            return res;
                        };
                        // We need to call factory to ensure the slot is created/retrieved
                        factory(sub_1);
                        if (tempSlot_1)
                            activeSlots.push(tempSlot_1);
                        return "continue";
                    }
                    if (allowBaking) {
                        if (context.recursionDepth > 0) {
                            // SAVE CONTEXT STATE
                            var savedElement = context.element;
                            var savedFrame = context.frame;
                            bakedData = this_1.getLiveTransform(context.switchContextFrame(frame).switchContextElement(el), i);
                            // RESTORE CONTEXT STATE
                            context.element = savedElement;
                            context.frame = savedFrame;
                        }
                        else {
                            // ... depth 0 baking ...
                            this_1._document.getTimeline().currentFrame = i;
                            var wasLocked = layer.locked;
                            var wasVisible = layer.visible;
                            layer.locked = false;
                            layer.visible = true;
                            var timeline = this_1._document.getTimeline();
                            var layerIdx = -1;
                            for (var k = 0; k < timeline.layers.length; k++) {
                                if (timeline.layers[k] === layer) {
                                    layerIdx = k;
                                    break;
                                }
                            }
                            if (layerIdx === -1) {
                                for (var k = 0; k < timeline.layers.length; k++) {
                                    if (timeline.layers[k].name === layer.name) {
                                        layerIdx = k;
                                        break;
                                    }
                                }
                            }
                            if (layerIdx !== -1) {
                                timeline.setSelectedLayers(layerIdx);
                            }
                            timeline.setSelectedFrames(i, i + 1);
                            try {
                                timeline.convertToKeyframes();
                                var freshLayer = timeline.layers[layerIdx];
                                var freshFrame = freshLayer.frames[i];
                                if (freshFrame.elements.length > 0) {
                                    var bakedEl = freshFrame.elements[0];
                                    bakedData = {
                                        matrix: bakedEl.matrix,
                                        transformX: bakedEl.transformX,
                                        transformY: bakedEl.transformY
                                    };
                                }
                            }
                            catch (e) {
                                Logger_1.Logger.warning("[Converter] Bake failed for frame ".concat(i, " (").concat(layer.name, "): ").concat(e));
                            }
                            if (!bakedData) {
                                this_1._document.selectNone();
                                el.selected = true;
                                if (this_1._document.selection.length > 0) {
                                    var proxy = this_1._document.selection[0];
                                    bakedData = {
                                        matrix: proxy.matrix,
                                        transformX: proxy.transformX,
                                        transformY: proxy.transformY
                                    };
                                }
                            }
                            layer.locked = wasLocked;
                            layer.visible = wasVisible;
                        }
                    }
                }
                else {
                    if (allowBaking) {
                        this_1._document.getTimeline().currentFrame = i;
                    }
                }
                var finalMatrixOverride = null;
                var finalPositionOverride = null;
                var sourceMatrix = bakedData ? bakedData.matrix : el.matrix;
                var sourceTransX = bakedData ? bakedData.transformX : el.transformX;
                var sourceTransY = bakedData ? bakedData.transformY : el.transformY;
                if (parentMat) {
                    finalMatrixOverride = this_1.concatMatrix(sourceMatrix, parentMat);
                    finalPositionOverride = {
                        x: sourceTransX * parentMat.a + sourceTransY * parentMat.c + parentMat.tx,
                        y: sourceTransX * parentMat.b + sourceTransY * parentMat.d + parentMat.ty
                    };
                }
                else if (bakedData) {
                    finalMatrixOverride = sourceMatrix;
                    finalPositionOverride = { x: sourceTransX, y: sourceTransY };
                }
                var sub = context.switchContextFrame(frame).createBone(el, time, finalMatrixOverride, finalPositionOverride);
                sub.internalFrame = i; // Fix: Pass current loop index as internal frame for nested time resolution
                Logger_1.Logger.trace("".concat(indent, "    [INTERNAL] Passed internal frame ").concat(i, " to child '").concat(el.name || ((_c = el.libraryItem) === null || _c === void 0 ? void 0 : _c.name) || '<anon>', "'"));
                if (el.elementType === 'instance' && el.instanceType === 'symbol' && stageType === "animation" /* ConverterStageType.ANIMATION */) {
                    var instance = el;
                    var firstFrameOffset = (instance.firstFrame || 0) / frameRate;
                    sub.timeOffset = time - firstFrameOffset;
                }
                var frameSlot = null;
                var originalCreateSlot = sub.createSlot;
                sub.createSlot = function (element) {
                    var res = originalCreateSlot.call(sub, element);
                    frameSlot = res.slot;
                    return res;
                };
                factory(sub);
                if (frameSlot)
                    activeSlots.push(frameSlot);
                if (context.element && context.element.libraryItem && allowBaking) {
                    var targetName = context.element.libraryItem.name;
                    var dom = this_1._document;
                    var currentTl = dom.getTimeline();
                    if (currentTl.name !== targetName) {
                        if (dom.library.itemExists(targetName)) {
                            dom.library.editItem(targetName);
                        }
                    }
                }
                if (allowBaking && this_1._document.getTimeline().currentFrame !== i) {
                    this_1._document.getTimeline().currentFrame = i;
                }
            };
            var this_1 = this;
            for (var eIdx = 0; eIdx < frame.elements.length; eIdx++) {
                _loop_1(eIdx);
            }
            // VISIBILITY FIX: Hide inactive slots on this layer
            if (stageType === "animation" /* ConverterStageType.ANIMATION */) {
                var allLayerSlots = context.global.layersCache.get(layer);
                if (allLayerSlots) {
                    for (var sIdx = 0; sIdx < allLayerSlots.length; sIdx++) {
                        var s = allLayerSlots[sIdx];
                        var isActive = false;
                        for (var aIdx = 0; aIdx < activeSlots.length; aIdx++) {
                            if (activeSlots[aIdx] === s) {
                                isActive = true;
                                break;
                            }
                        }
                        if (!isActive) {
                            Logger_1.Logger.trace("".concat(indent, "    [Visibility] Auto-hiding inactive slot '").concat(s.name, "' at Time ").concat(time.toFixed(3), " (Layer: ").concat(layer.name, ")"));
                            SpineAnimationHelper_1.SpineAnimationHelper.applySlotAttachment(context.global.animation, s, context, null, time);
                            this.hideChildSlots(context, s.bone, time);
                        }
                    }
                }
            }
        }
    };
    Converter.prototype.convertElement = function (context) {
        var indent = this.getIndent(context.recursionDepth);
        Logger_1.Logger.trace("".concat(indent, "[CONVERT] Path: ").concat(context.symbolPath, " (Depth: ").concat(context.recursionDepth, ")"));
        if (LibraryUtil_1.LibraryUtil.isPrimitiveLibraryItem(context.element.libraryItem, this._config)) {
            this.convertPrimitiveElement(context);
        }
        else {
            this.convertCompositeElement(context);
        }
    };
    Converter.prototype.prepareImagesExportPath = function (context, image) {
        var folder = this.resolveWorkingPath(context.global.skeleton.imagesPath);
        if (!FLfile.exists(folder))
            FLfile.createFolder(folder);
        return PathUtil_1.PathUtil.joinPath(folder, image + '.png');
    };
    Converter.prototype.prepareImagesAttachmentName = function (context, image) {
        return (this._config.appendSkeletonToImagesPath && this._config.mergeSkeletons) ? PathUtil_1.PathUtil.joinPath(context.global.skeleton.name, image) : image;
    };
    Converter.prototype.resolveWorkingPath = function (path) {
        return PathUtil_1.PathUtil.joinPath(this._workingPath, path);
    };
    Converter.prototype.convertSymbolInstance = function (element, context) {
        if (element.elementType === 'instance' && element.instanceType === 'symbol') {
            try {
                context.global.stageType = "structure" /* ConverterStageType.STRUCTURE */;
                this.convertElement(context);
                Logger_1.Logger.trace("[Converter] Converting animations for symbol instance: ".concat(element.name || element.libraryItem.name, ". Found ").concat(context.global.labels.length, " labels."));
                if (context.global.labels.length > 0) {
                    var isDefaultOnly = context.global.labels.length === 1 && context.global.labels[0].name === 'default';
                    if (!isDefaultOnly) {
                        for (var _i = 0, _a = context.global.labels; _i < _a.length; _i++) {
                            var l = _a[_i];
                            Logger_1.Logger.trace("  - Processing label: ".concat(l.name, " (frames ").concat(l.startFrameIdx, "-").concat(l.endFrameIdx, ")"));
                            context.global.processedSymbols.clear();
                            var sub = context.switchContextAnimation(l);
                            sub.global.stageType = "animation" /* ConverterStageType.ANIMATION */;
                            this.convertElement(sub);
                        }
                    }
                    else {
                        Logger_1.Logger.trace("  - Processing default timeline animation (frames 0-".concat(context.global.labels[0].endFrameIdx, ")"));
                        context.global.processedSymbols.clear();
                        var sub = context.switchContextAnimation(context.global.labels[0]);
                        sub.global.stageType = "animation" /* ConverterStageType.ANIMATION */;
                        this.convertElement(sub);
                    }
                }
                return true;
            }
            catch (e) {
                Logger_1.Logger.error(JsonEncoder_1.JsonEncoder.stringify(e));
            }
        }
        return false;
    };
    Converter.prototype.concatMatrix = function (m1, m2) {
        return {
            a: m1.a * m2.a + m1.b * m2.c,
            b: m1.a * m2.b + m1.b * m2.d,
            c: m1.c * m2.a + m1.d * m2.c,
            d: m1.c * m2.b + m1.d * m2.d,
            tx: m1.tx * m2.a + m1.ty * m2.c + m2.tx,
            ty: m1.tx * m2.b + m1.ty * m2.d + m2.ty
        };
    };
    Converter.prototype.getLayerParentMatrix = function (layer, frameIndex) {
        var _a;
        if (!layer.parentLayer)
            return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
        var parentLayer = layer.parentLayer;
        var parentGlobal = this.getLayerParentMatrix(parentLayer, frameIndex);
        var parentFrame = parentLayer.frames[frameIndex];
        if (!parentFrame || parentFrame.elements.length === 0) {
            Logger_1.Logger.trace("    [PARENTING] Layer '".concat(layer.name, "' has empty parent layer '").concat(parentLayer.name, "' at frame ").concat(frameIndex, "."));
            return parentGlobal;
        }
        var wasLocked = parentLayer.locked;
        var wasVisible = parentLayer.visible;
        parentLayer.locked = false;
        parentLayer.visible = true;
        var el = parentFrame.elements[0];
        var elName = el.name || ((_a = el.libraryItem) === null || _a === void 0 ? void 0 : _a.name) || '<anon>';
        var layerIdx = -1;
        var layers = this._document.getTimeline().layers;
        for (var k = 0; k < layers.length; k++) {
            if (layers[k] === parentLayer) {
                layerIdx = k;
                break;
            }
        }
        if (layerIdx !== -1) {
            this._document.getTimeline().setSelectedLayers(layerIdx);
            this._document.getTimeline().setSelectedFrames(frameIndex, frameIndex + 1);
            this._document.selectNone();
            el.selected = true;
            var finalMat = el.matrix;
            if (this._document.selection.length > 0) {
                finalMat = this._document.selection[0].matrix;
            }
            Logger_1.Logger.trace("    [PARENTING] Resolved parent '".concat(parentLayer.name, "' (").concat(elName, ") at frame ").concat(frameIndex, ". Raw Child Mat: a=").concat(el.matrix.a.toFixed(2), " tx=").concat(el.matrix.tx.toFixed(2), ". Final Mat: a=").concat(finalMat.a.toFixed(2), " tx=").concat(finalMat.tx.toFixed(2), " ty=").concat(finalMat.ty.toFixed(2)));
            parentLayer.locked = wasLocked;
            parentLayer.visible = wasVisible;
            return this.concatMatrix(finalMat, parentGlobal);
        }
        return parentGlobal;
    };
    Converter.prototype.convertSelection = function () {
        var skeleton = (this._config.mergeSkeletons ? new SpineSkeleton_1.SpineSkeleton() : null);
        var cache = (this._config.mergeSkeletons && this._config.mergeSkeletonsRootBone) ? ConverterContextGlobal_1.ConverterContextGlobal.initializeCache() : null;
        var output = [];
        for (var _i = 0, _a = this._document.selection; _i < _a.length; _i++) {
            var el = _a[_i];
            var context = ConverterContextGlobal_1.ConverterContextGlobal.initializeGlobal(el, this._config, this._document.frameRate, skeleton, cache);
            if (this.convertSymbolInstance(el, context) && skeleton == null)
                output.push(context.skeleton);
        }
        if (skeleton) {
            skeleton.imagesPath = this._config.imagesExportPath;
            skeleton.name = StringUtil_1.StringUtil.simplify(PathUtil_1.PathUtil.fileBaseName(this._document.name));
            output.push(skeleton);
        }
        return output;
    };
    return Converter;
}());
exports.Converter = Converter;


/***/ }),

/***/ "./source/core/ConverterColor.ts":
/*!***************************************!*\
  !*** ./source/core/ConverterColor.ts ***!
  \***************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {



exports.ConverterColor = void 0;
var NumberUtil_1 = __webpack_require__(/*! ../utils/NumberUtil */ "./source/utils/NumberUtil.ts");
var ConverterColor = /** @class */ (function () {
    function ConverterColor(element) {
        if (element === void 0) { element = null; }
        this._parent = null;
        this._element = element;
    }
    ConverterColor.prototype.blend = function (element) {
        var color = new ConverterColor(element);
        color._parent = this;
        return color;
    };
    ConverterColor.prototype.merge = function () {
        var current = this;
        var visible = 1;
        var alpha = 1;
        var red = 1;
        var green = 1;
        var blue = 1;
        //-----------------------------------
        while (current != null && current._element != null) {
            var element = current._element;
            if (element.visible === false) {
                visible = 0;
            }
            alpha = visible * NumberUtil_1.NumberUtil.clamp(alpha * (element.colorAlphaPercent / 100) + element.colorAlphaAmount / 255);
            red = NumberUtil_1.NumberUtil.clamp(red * (element.colorRedPercent / 100) + element.colorRedAmount / 255);
            green = NumberUtil_1.NumberUtil.clamp(green * (element.colorGreenPercent / 100) + element.colorGreenAmount / 255);
            blue = NumberUtil_1.NumberUtil.clamp(blue * (element.colorBluePercent / 100) + element.colorBlueAmount / 255);
            current = current._parent;
        }
        //-----------------------------------
        return (NumberUtil_1.NumberUtil.color(red) +
            NumberUtil_1.NumberUtil.color(green) +
            NumberUtil_1.NumberUtil.color(blue) +
            NumberUtil_1.NumberUtil.color(alpha));
    };
    return ConverterColor;
}());
exports.ConverterColor = ConverterColor;


/***/ }),

/***/ "./source/core/ConverterContext.ts":
/*!*****************************************!*\
  !*** ./source/core/ConverterContext.ts ***!
  \*****************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {



exports.ConverterContext = void 0;
var SpineAnimationHelper_1 = __webpack_require__(/*! ../spine/SpineAnimationHelper */ "./source/spine/SpineAnimationHelper.ts");
var SpineTransformMatrix_1 = __webpack_require__(/*! ../spine/transform/SpineTransformMatrix */ "./source/spine/transform/SpineTransformMatrix.ts");
var ConvertUtil_1 = __webpack_require__(/*! ../utils/ConvertUtil */ "./source/utils/ConvertUtil.ts");
var ConverterContext = /** @class */ (function () {
    function ConverterContext() {
        this.timeOffset = 0;
        this.matrixOverride = null;
        this.positionOverride = null;
        this.recursionDepth = 0;
        this.symbolPath = "";
        this.internalFrame = 0;
        /**
         * Offset to shift children from Parent Registration Point to Parent Anchor Point.
         * Calculated as: -Parent.transformationPoint
         */
        this.parentOffset = { x: 0, y: 0 };
        // empty
    }
    ConverterContext.prototype.switchContextFrame = function (frame) {
        this.frame = frame;
        return this;
    };
    ConverterContext.prototype.switchContextElement = function (element) {
        this.element = element;
        return this;
    };
    ConverterContext.prototype.switchContextAnimation = function (label) {
        var _a = this.global, skeleton = _a.skeleton, labels = _a.labels;
        if (labels.indexOf(label) !== -1) {
            this.global.animation = skeleton.createAnimation(label.name);
            this.global.label = label;
        }
        return this;
    };
    ConverterContext.prototype.switchContextLayer = function (layer) {
        this.layer = layer;
        if (this.global.layersCache.get(layer) == null) {
            this.global.layersCache.set(layer, []);
        }
        return this;
    };
    ConverterContext.prototype.createBone = function (element, time, matrixOverride, positionOverride) {
        var _a;
        if (matrixOverride === void 0) { matrixOverride = null; }
        if (positionOverride === void 0) { positionOverride = null; }
        var boneName = ConvertUtil_1.ConvertUtil.createBoneName(element, this);
        var referenceTransform = this.global.assetTransforms.get(boneName);
        // Pass isTween flag to constructor to handle flipping continuity correctly
        var isTween = this.frame && this.frame.tweenType === 'classic';
        var transform = new SpineTransformMatrix_1.SpineTransformMatrix(element, referenceTransform, matrixOverride, positionOverride, isTween);
        // Update the cache with the current transform for the next frame
        this.global.assetTransforms.set(boneName, transform);
        var context = new ConverterContext();
        // Propagate overrides to children context if needed, or store for Slot creation
        context.matrixOverride = matrixOverride;
        context.positionOverride = positionOverride;
        context.bone = this.global.skeleton.createBone(boneName, this.bone);
        context.clipping = this.clipping;
        context.slot = null;
        context.time = this.time + time;
        context.global = this.global;
        context.parent = this;
        context.recursionDepth = this.recursionDepth + 1;
        var name = element.name || ((_a = element.libraryItem) === null || _a === void 0 ? void 0 : _a.name) || '<anon>';
        context.symbolPath = this.symbolPath ? this.symbolPath + " > " + name : name;
        context.blendMode = ConvertUtil_1.ConvertUtil.obtainElementBlendMode(element);
        context.color = this.color.blend(element);
        context.layer = this.layer;
        context.element = element;
        context.frame = this.frame;
        if (this.blendMode !== "normal" /* SpineBlendMode.NORMAL */ && context.blendMode === "normal" /* SpineBlendMode.NORMAL */) {
            context.blendMode = this.blendMode;
        }
        if (context.bone.initialized === false) {
            context.bone.initialized = true;
            // Shift position from Parent Registration Point to Parent Anchor Point
            var boneTransform = {
                rotation: transform.rotation,
                scaleX: transform.scaleX,
                scaleY: transform.scaleY,
                shearX: transform.shearX,
                shearY: transform.shearY,
                x: transform.x + this.parentOffset.x,
                y: transform.y + this.parentOffset.y
            };
            SpineAnimationHelper_1.SpineAnimationHelper.applyBoneTransform(context.bone, boneTransform);
        }
        // Set parentOffset for children of this bone: shift from this bone's RP to this bone's Anchor
        // Both axes are negated symmetrically (Y flip happens at Spine output layer)
        context.parentOffset = {
            x: -element.transformationPoint.x,
            y: -element.transformationPoint.y
        };
        if (context.global.stageType === "animation" /* ConverterStageType.ANIMATION */) {
            var boneTransform = {
                rotation: transform.rotation,
                scaleX: transform.scaleX,
                scaleY: transform.scaleY,
                shearX: transform.shearX,
                shearY: transform.shearY,
                x: transform.x + this.parentOffset.x,
                y: transform.y + this.parentOffset.y
            };
            SpineAnimationHelper_1.SpineAnimationHelper.applyBoneAnimation(context.global.animation, context.bone, context, boneTransform, context.time);
        }
        return context;
    };
    ConverterContext.prototype.createSlot = function (element) {
        var context = new ConverterContext();
        context.bone = this.bone;
        context.clipping = this.clipping;
        context.slot = this.global.skeleton.createSlot(ConvertUtil_1.ConvertUtil.createSlotName(this), this.bone);
        context.time = this.time;
        context.global = this.global;
        context.parent = this;
        context.blendMode = ConvertUtil_1.ConvertUtil.obtainElementBlendMode(element);
        context.color = this.color;
        context.layer = this.layer;
        context.element = element;
        context.frame = this.frame;
        if (this.blendMode !== "normal" /* SpineBlendMode.NORMAL */ && context.blendMode === "normal" /* SpineBlendMode.NORMAL */) {
            context.blendMode = this.blendMode;
        }
        if (context.slot.initialized === false) {
            context.slot.initialized = true;
            context.slot.color = context.color.merge();
            context.slot.blend = context.blendMode;
            if (context.layer != null) {
                var layerSlots = context.global.layersCache.get(context.layer);
                layerSlots.push(context.slot);
            }
        }
        if (context.global.stageType === "animation" /* ConverterStageType.ANIMATION */) {
            SpineAnimationHelper_1.SpineAnimationHelper.applySlotAnimation(context.global.animation, context.slot, context, context.color.merge(), context.time);
        }
        return context;
    };
    return ConverterContext;
}());
exports.ConverterContext = ConverterContext;


/***/ }),

/***/ "./source/core/ConverterContextGlobal.ts":
/*!***********************************************!*\
  !*** ./source/core/ConverterContextGlobal.ts ***!
  \***********************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = null ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? ({}) : (__.prototype = b.prototype, new __());
    };
})();

exports.ConverterContextGlobal = void 0;
var Logger_1 = __webpack_require__(/*! ../logger/Logger */ "./source/logger/Logger.ts");
var SpineAnimationHelper_1 = __webpack_require__(/*! ../spine/SpineAnimationHelper */ "./source/spine/SpineAnimationHelper.ts");
var SpineSkeleton_1 = __webpack_require__(/*! ../spine/SpineSkeleton */ "./source/spine/SpineSkeleton.ts");
var SpineTransformMatrix_1 = __webpack_require__(/*! ../spine/transform/SpineTransformMatrix */ "./source/spine/transform/SpineTransformMatrix.ts");
var ConvertUtil_1 = __webpack_require__(/*! ../utils/ConvertUtil */ "./source/utils/ConvertUtil.ts");
var PathUtil_1 = __webpack_require__(/*! ../utils/PathUtil */ "./source/utils/PathUtil.ts");
var StringUtil_1 = __webpack_require__(/*! ../utils/StringUtil */ "./source/utils/StringUtil.ts");
var ConverterColor_1 = __webpack_require__(/*! ./ConverterColor */ "./source/core/ConverterColor.ts");
var ConverterContext_1 = __webpack_require__(/*! ./ConverterContext */ "./source/core/ConverterContext.ts");
var ConverterMap_1 = __webpack_require__(/*! ./ConverterMap */ "./source/core/ConverterMap.ts");
var ConverterContextGlobal = /** @class */ (function (_super) {
    __extends(ConverterContextGlobal, _super);
    function ConverterContextGlobal() {
        return _super.call(this) || this;
    }
    ConverterContextGlobal.initializeGlobal = function (element, config, frameRate, skeleton, cache) {
        var _a;
        if (skeleton === void 0) { skeleton = null; }
        if (cache === void 0) { cache = null; }
        var transform = new SpineTransformMatrix_1.SpineTransformMatrix(element);
        var libraryItem = element.libraryItem;
        Logger_1.Logger.assert(libraryItem || element.name || ((_a = element.layer) === null || _a === void 0 ? void 0 : _a.name), "Root element must have a libraryItem, name, or layer name. Got elementType=".concat(element.elementType));
        var name = libraryItem ? StringUtil_1.StringUtil.simplify(libraryItem.name) : (element.name ? StringUtil_1.StringUtil.simplify(element.name) : StringUtil_1.StringUtil.simplify(element.layer.name));
        var context = (cache == null) ? ConverterContextGlobal.initializeCache() : cache;
        context.global = context;
        context.stageType = "animation" /* ConverterStageType.ANIMATION */;
        context.parent = null;
        context.labels = ConvertUtil_1.ConvertUtil.obtainElementLabels(element);
        context.animation = null;
        context.frameRate = frameRate;
        context.label = null;
        context.config = config;
        context.skeleton = (skeleton == null) ? new SpineSkeleton_1.SpineSkeleton() : skeleton;
        context.skeleton.imagesPath = (config.appendSkeletonToImagesPath ? PathUtil_1.PathUtil.joinPath(config.imagesExportPath, name) : config.imagesExportPath);
        context.skeleton.name = name;
        context.bone = context.skeleton.createBone('root');
        context.clipping = null;
        context.slot = null;
        context.blendMode = "normal" /* SpineBlendMode.NORMAL */;
        context.color = new ConverterColor_1.ConverterColor();
        context.layer = null;
        context.element = element;
        context.frame = null;
        context.time = 0;
        if (config.mergeSkeletons && config.mergeSkeletonsRootBone !== true) {
            context.bone = context.skeleton.createBone(context.skeleton.name, context.bone);
        }
        // To center the skeleton at (0,0), shift children by the ASSET's local anchor
        // Both axes are negated symmetrically (Y flip happens at Spine output layer)
        context.parentOffset = {
            x: -element.transformationPoint.x,
            y: -element.transformationPoint.y
        };
        Logger_1.Logger.trace("[Global] Root: ".concat(context.skeleton.name, " anchor=(").concat(element.transformationPoint.x.toFixed(2), ", ").concat(element.transformationPoint.y.toFixed(2), ")"));
        if (config.transformRootBone) {
            SpineAnimationHelper_1.SpineAnimationHelper.applyBoneTransform(context.bone, transform);
        }
        return context;
    };
    ConverterContextGlobal.initializeCache = function () {
        var context = new ConverterContextGlobal();
        context.imagesCache = new ConverterMap_1.ConverterMap();
        context.shapesCache = new ConverterMap_1.ConverterMap();
        context.layersCache = new ConverterMap_1.ConverterMap();
        context.assetTransforms = new ConverterMap_1.ConverterMap();
        context.attachmentVariants = new ConverterMap_1.ConverterMap();
        context.processedSymbols = new ConverterMap_1.ConverterMap();
        return context;
    };
    return ConverterContextGlobal;
}(ConverterContext_1.ConverterContext));
exports.ConverterContextGlobal = ConverterContextGlobal;


/***/ }),

/***/ "./source/core/ConverterMap.ts":
/*!*************************************!*\
  !*** ./source/core/ConverterMap.ts ***!
  \*************************************/
/***/ (function(__unused_webpack_module, exports) {



exports.ConverterMap = void 0;
var ConverterMap = /** @class */ (function () {
    function ConverterMap() {
        this.values = [];
        this.keys = [];
    }
    ConverterMap.prototype.clear = function () {
        this.values.length = 0;
        this.keys.length = 0;
    };
    ConverterMap.prototype.size = function () {
        return this.keys.length;
    };
    ConverterMap.prototype.has = function (key) {
        return this.keys.indexOf(key) !== -1;
    };
    ConverterMap.prototype.set = function (key, value) {
        var existingIndex = this.keys.indexOf(key);
        if (existingIndex !== -1) {
            this.values[existingIndex] = value;
        }
        else {
            this.values.push(value);
            this.keys.push(key);
        }
    };
    ConverterMap.prototype.get = function (key) {
        for (var index = 0; index < this.keys.length; index++) {
            if (this.keys[index] === key) {
                return this.values[index];
            }
        }
        return null;
    };
    return ConverterMap;
}());
exports.ConverterMap = ConverterMap;


/***/ }),

/***/ "./source/logger/Logger.ts":
/*!*********************************!*\
  !*** ./source/logger/Logger.ts ***!
  \*********************************/
/***/ (function(__unused_webpack_module, exports) {



exports.Logger = void 0;
var Logger = /** @class */ (function () {
    function Logger() {
        this._output = [];
    }
    //-----------------------------------
    Logger.trace = function () {
        var params = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            params[_i] = arguments[_i];
        }
        Logger._instance.trace('[TRACE] ' + params.join(' '));
    };
    Logger.warning = function () {
        var params = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            params[_i] = arguments[_i];
        }
        Logger._instance.trace('[WARNING] ' + params.join(' '));
    };
    Logger.error = function () {
        var params = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            params[_i] = arguments[_i];
        }
        Logger._instance.trace('[ERROR] ' + params.join(' '));
    };
    Logger.assert = function (condition, message) {
        if (!condition) {
            var errorMsg = '[ASSERT FAILED] ' + message;
            Logger._instance.trace(errorMsg);
            Logger._instance.flush();
            throw new Error(errorMsg);
        }
    };
    Logger.flush = function () {
        Logger._instance.flush();
    };
    //-----------------------------------
    Logger.prototype.trace = function (message) {
        this._output.push(message);
    };
    Logger.prototype.flush = function () {
        fl.outputPanel.clear();
        fl.outputPanel.trace(this._output.join('\n'));
        this._output.length = 0;
    };
    Logger._instance = new Logger();
    return Logger;
}());
exports.Logger = Logger;


/***/ }),

/***/ "./source/spine/SpineAnimation.ts":
/*!****************************************!*\
  !*** ./source/spine/SpineAnimation.ts ***!
  \****************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {



exports.SpineAnimation = void 0;
var SpineTimeline_1 = __webpack_require__(/*! ./timeline/SpineTimeline */ "./source/spine/timeline/SpineTimeline.ts");
var SpineTimelineGroupBone_1 = __webpack_require__(/*! ./timeline/SpineTimelineGroupBone */ "./source/spine/timeline/SpineTimelineGroupBone.ts");
var SpineTimelineGroupSlot_1 = __webpack_require__(/*! ./timeline/SpineTimelineGroupSlot */ "./source/spine/timeline/SpineTimelineGroupSlot.ts");
var SpineAnimation = /** @class */ (function () {
    function SpineAnimation() {
        this.bones = [];
        this.events = new SpineTimeline_1.SpineTimeline();
        this.slots = [];
    }
    //-----------------------------------
    SpineAnimation.prototype.createBoneTimeline = function (bone) {
        var timeline = this.findBoneTimeline(bone);
        if (timeline != null) {
            return timeline;
        }
        timeline = new SpineTimelineGroupBone_1.SpineTimelineGroupBone();
        timeline.bone = bone;
        this.bones.push(timeline);
        return timeline;
    };
    SpineAnimation.prototype.createEvent = function (name, time) {
        this.events.createFrame(time, null, false).name = name;
    };
    SpineAnimation.prototype.createSlotTimeline = function (slot) {
        var timeline = this.findSlotTimeline(slot);
        if (timeline != null) {
            return timeline;
        }
        timeline = new SpineTimelineGroupSlot_1.SpineTimelineGroupSlot();
        timeline.slot = slot;
        this.slots.push(timeline);
        return timeline;
    };
    //-----------------------------------
    SpineAnimation.prototype.findBoneTimeline = function (bone) {
        for (var _i = 0, _a = this.bones; _i < _a.length; _i++) {
            var timeline = _a[_i];
            if (timeline.bone === bone) {
                return timeline;
            }
        }
        return null;
    };
    SpineAnimation.prototype.findSlotTimeline = function (slot) {
        for (var _i = 0, _a = this.slots; _i < _a.length; _i++) {
            var timeline = _a[_i];
            if (timeline.slot === slot) {
                return timeline;
            }
        }
        return null;
    };
    return SpineAnimation;
}());
exports.SpineAnimation = SpineAnimation;


/***/ }),

/***/ "./source/spine/SpineAnimationHelper.ts":
/*!**********************************************!*\
  !*** ./source/spine/SpineAnimationHelper.ts ***!
  \**********************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {



exports.SpineAnimationHelper = void 0;
var Logger_1 = __webpack_require__(/*! ../logger/Logger */ "./source/logger/Logger.ts");
var SpineAnimationHelper = /** @class */ (function () {
    function SpineAnimationHelper() {
    }
    SpineAnimationHelper.applyBoneAnimation = function (animation, bone, context, transform, time) {
        var timeline = animation.createBoneTimeline(bone);
        var curve = SpineAnimationHelper.obtainFrameCurve(context);
        var rotateTimeline = timeline.createTimeline("rotate" /* SpineTimelineType.ROTATE */);
        // Rotation Unwrapping (Shortest Path)
        // Ensure that the new angle is continuous relative to the previous keyframe
        var angle = transform.rotation - bone.rotation;
        if (rotateTimeline.frames.length > 0) {
            var prevFrame = rotateTimeline.frames[rotateTimeline.frames.length - 1];
            // Only apply unwrapping if we are moving forward in time (sequential export)
            if (time >= prevFrame.time) {
                var prevAngle = prevFrame.angle;
                // Use a epsilon for time equality to avoid unwrapping the same keyframe twice
                if (time > prevFrame.time) {
                    var originalAngle = angle;
                    while (angle - prevAngle > 180)
                        angle -= 360;
                    while (angle - prevAngle < -180)
                        angle += 360;
                    if (Math.abs(angle - originalAngle) > 0.1) {
                        Logger_1.Logger.trace("[UNWRAP] Bone '".concat(bone.name, "' T=").concat(time.toFixed(3), ": ").concat(originalAngle.toFixed(2), " -> ").concat(angle.toFixed(2), " (diff ").concat(Math.abs(angle - originalAngle).toFixed(2), ")"));
                    }
                    if (Math.abs(angle - prevAngle) > 170) {
                        Logger_1.Logger.trace("[DEBUG] RotJump: ".concat(prevAngle.toFixed(1), " -> ").concat(angle.toFixed(1), " (Bone: ").concat(bone.name, ", T=").concat(time.toFixed(3), ")"));
                    }
                }
            }
        }
        var rotateFrame = rotateTimeline.createFrame(time, curve);
        rotateFrame.angle = angle;
        var translateTimeline = timeline.createTimeline("translate" /* SpineTimelineType.TRANSLATE */);
        var translateFrame = translateTimeline.createFrame(time, curve);
        translateFrame.x = transform.x - bone.x;
        translateFrame.y = transform.y - bone.y;
        var scaleTimeline = timeline.createTimeline("scale" /* SpineTimelineType.SCALE */);
        var scaleFrame = scaleTimeline.createFrame(time, curve);
        scaleFrame.x = transform.scaleX / bone.scaleX;
        scaleFrame.y = transform.scaleY / bone.scaleY;
        var shearTimeline = timeline.createTimeline("shear" /* SpineTimelineType.SHEAR */);
        var shearFrame = shearTimeline.createFrame(time, curve);
        shearFrame.x = transform.shearX - bone.shearX;
        shearFrame.y = transform.shearY - bone.shearY;
        var curveStr = (typeof curve === 'string') ? curve : (curve ? 'bezier' : 'linear');
        Logger_1.Logger.trace("[KEY] Bone '".concat(bone.name, "' at T=").concat(time.toFixed(3), " [").concat(curveStr, "]: rot=").concat(angle.toFixed(2), " pos=(").concat(translateFrame.x.toFixed(2), ", ").concat(translateFrame.y.toFixed(2), ") scale=(").concat(scaleFrame.x.toFixed(2), ", ").concat(scaleFrame.y.toFixed(2), ") shearY=").concat(shearFrame.y.toFixed(2)));
    };
    SpineAnimationHelper.applyBoneTransform = function (bone, transform) {
        bone.x = transform.x;
        bone.y = transform.y;
        bone.rotation = transform.rotation;
        bone.scaleX = transform.scaleX;
        bone.scaleY = transform.scaleY;
        bone.shearX = transform.shearX;
        bone.shearY = transform.shearY;
    };
    SpineAnimationHelper.applySlotAttachment = function (animation, slot, context, attachment, time) {
        var _a;
        var timeline = animation.createSlotTimeline(slot);
        var curve = SpineAnimationHelper.obtainFrameCurve(context);
        var attachmentTimeline = timeline.createTimeline("attachment" /* SpineTimelineType.ATTACHMENT */);
        // VISIBILITY FIX: Start of Animation
        if (attachmentTimeline.frames.length === 0 && time > 0) {
            Logger_1.Logger.trace("[VISIBILITY] Auto-hiding slot '".concat(slot.name, "' at frame 0 (First key is at ").concat(time.toFixed(3), ")"));
            var hiddenFrame = attachmentTimeline.createFrame(0, 'stepped');
            hiddenFrame.name = null;
        }
        var attachmentFrame = attachmentTimeline.createFrame(time, curve);
        attachmentFrame.name = (attachment != null) ? attachment.name : null;
        Logger_1.Logger.trace("[VISIBILITY] Slot '".concat(slot.name, "' -> ").concat(attachmentFrame.name ? attachmentFrame.name : 'HIDDEN', " at Time ").concat(time.toFixed(3), " (Frame: ").concat((_a = context.frame) === null || _a === void 0 ? void 0 : _a.startFrame, ")"));
        if (context.frame != null && context.frame.startFrame === 0) {
            slot.attachment = attachment;
        }
    };
    SpineAnimationHelper.applySlotAnimation = function (animation, slot, context, color, time) {
        var timeline = animation.createSlotTimeline(slot);
        var curve = SpineAnimationHelper.obtainFrameCurve(context);
        var colorTimeline = timeline.createTimeline("color" /* SpineTimelineType.COLOR */);
        var colorFrame = colorTimeline.createFrame(time, curve);
        colorFrame.color = color;
    };
    SpineAnimationHelper.obtainFrameCurve = function (context) {
        var frame = context.frame;
        if (frame != null) {
            if (frame.tweenType === 'none') {
                return 'stepped';
            }
            // If it's not a Classic Tween, we assume baking is required (Linear)
            if (frame.tweenType !== 'classic') {
                return null;
            }
            // 1. Check Custom Ease
            if (frame.hasCustomEase) {
                var points = null;
                try {
                    points = frame.getCustomEase();
                }
                catch (e) {
                    Logger_1.Logger.warning("[Curve] Frame ".concat(frame.startFrame, ": getCustomEase failed: ").concat(e));
                }
                // Spine only supports 1 cubic bezier segment (4 points: P0, C1, C2, P3)
                // If points > 4, it's a complex curve -> requires baking -> Linear
                if (points && points.length === 4) {
                    Logger_1.Logger.trace("[Curve] Frame ".concat(frame.startFrame, ": Custom Ease applied. P0=(").concat(points[0].x, ", ").concat(points[0].y, ") P1=(").concat(points[1].x.toFixed(3), ", ").concat(points[1].y.toFixed(3), ") P2=(").concat(points[2].x.toFixed(3), ", ").concat(points[2].y.toFixed(3), ") P3=(").concat(points[3].x, ", ").concat(points[3].y, ")"));
                    return {
                        cx1: points[1].x,
                        cy1: points[1].y,
                        cx2: points[2].x,
                        cy2: points[2].y
                    };
                }
                if (points) {
                    Logger_1.Logger.trace("[Curve] Frame ".concat(frame.startFrame, ": Custom Ease Rejected (Points: ").concat(points.length, "). Logic: Spine 4.2 only supports single-segment beziers via JSON. Multi-segment requires sampling."));
                }
                return null; // Force bake for complex custom ease
            }
            // 2. Check Standard Easing (-100 to 100)
            if (frame.tweenEasing !== 0) {
                var intensity = frame.tweenEasing; // -100 to 100
                var k = Math.abs(intensity) / 100;
                // Animate uses a Quadratic Bezier (1 control point Q1)
                // We must elevate it to Cubic Bezier (2 control points C1, C2)
                var q1y = 0.5;
                if (intensity < 0) { // Ease In
                    q1y = 0.5 * (1 - k);
                }
                else { // Ease Out
                    q1y = 0.5 + 0.5 * k;
                }
                // Degree Elevation: Quadratic to Cubic
                var c1x = (2 / 3) * 0.5; // 0.333...
                var c1y = (2 / 3) * q1y;
                var c2x = 1 - (1 / 3); // 0.666...
                var c2y = 1 + (2 / 3) * (q1y - 1);
                Logger_1.Logger.trace("[Curve] Frame ".concat(frame.startFrame, ": Standard Ease ").concat(intensity, " -> Q1y=").concat(q1y.toFixed(3), " -> C1=(").concat(c1x.toFixed(3), ", ").concat(c1y.toFixed(3), ") C2=(").concat(c2x.toFixed(3), ", ").concat(c2y.toFixed(3), ")"));
                return {
                    cx1: c1x,
                    cy1: c1y,
                    cx2: c2x,
                    cy2: c2y
                };
            }
            // Default Linear
            Logger_1.Logger.trace("[Curve] Frame ".concat(frame.startFrame, ": No Easing (Linear)."));
            return null;
        }
        //-----------------------------------
        return null;
    };
    SpineAnimationHelper.applyEventAnimation = function (animation, event, time) {
        animation.createEvent(event, time);
    };
    return SpineAnimationHelper;
}());
exports.SpineAnimationHelper = SpineAnimationHelper;


/***/ }),

/***/ "./source/spine/SpineBone.ts":
/*!***********************************!*\
  !*** ./source/spine/SpineBone.ts ***!
  \***********************************/
/***/ (function(__unused_webpack_module, exports) {



exports.SpineBone = void 0;
var SpineBone = /** @class */ (function () {
    function SpineBone() {
        this.initialized = false;
    }
    return SpineBone;
}());
exports.SpineBone = SpineBone;


/***/ }),

/***/ "./source/spine/SpineEvent.ts":
/*!************************************!*\
  !*** ./source/spine/SpineEvent.ts ***!
  \************************************/
/***/ (function(__unused_webpack_module, exports) {



exports.SpineEvent = void 0;
var SpineEvent = /** @class */ (function () {
    function SpineEvent() {
        // empty
    }
    return SpineEvent;
}());
exports.SpineEvent = SpineEvent;


/***/ }),

/***/ "./source/spine/SpineImage.ts":
/*!************************************!*\
  !*** ./source/spine/SpineImage.ts ***!
  \************************************/
/***/ (function(__unused_webpack_module, exports) {



exports.SpineImage = void 0;
var SpineImage = /** @class */ (function () {
    function SpineImage(path, width, height, scale, x, y, imageCenterOffsetX, imageCenterOffsetY) {
        if (imageCenterOffsetX === void 0) { imageCenterOffsetX = 0; }
        if (imageCenterOffsetY === void 0) { imageCenterOffsetY = 0; }
        this.path = path;
        this.width = width;
        this.height = height;
        this.scale = scale;
        this.x = x;
        this.y = y;
        this.imageCenterOffsetX = imageCenterOffsetX;
        this.imageCenterOffsetY = imageCenterOffsetY;
    }
    return SpineImage;
}());
exports.SpineImage = SpineImage;


/***/ }),

/***/ "./source/spine/SpineSkeleton.ts":
/*!***************************************!*\
  !*** ./source/spine/SpineSkeleton.ts ***!
  \***************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {



exports.SpineSkeleton = void 0;
var JsonEncoder_1 = __webpack_require__(/*! ../utils/JsonEncoder */ "./source/utils/JsonEncoder.ts");
var SpineAnimation_1 = __webpack_require__(/*! ./SpineAnimation */ "./source/spine/SpineAnimation.ts");
var SpineBone_1 = __webpack_require__(/*! ./SpineBone */ "./source/spine/SpineBone.ts");
var SpineEvent_1 = __webpack_require__(/*! ./SpineEvent */ "./source/spine/SpineEvent.ts");
var SpineSlot_1 = __webpack_require__(/*! ./SpineSlot */ "./source/spine/SpineSlot.ts");
var SpineSkeleton = /** @class */ (function () {
    function SpineSkeleton() {
        this.imagesPath = './images/';
        this.bones = [];
        this.animations = [];
        this.events = [];
        this.slots = [];
    }
    //-----------------------------------
    SpineSkeleton.prototype.createBone = function (name, parent) {
        if (parent === void 0) { parent = null; }
        var bone = this.findBone(name);
        if (bone != null) {
            return bone;
        }
        bone = new SpineBone_1.SpineBone();
        bone.parent = parent;
        bone.name = name;
        this.bones.push(bone);
        return bone;
    };
    SpineSkeleton.prototype.createAnimation = function (name) {
        var animation = this.findAnimation(name);
        if (animation != null) {
            return animation;
        }
        animation = new SpineAnimation_1.SpineAnimation();
        animation.name = name;
        this.animations.push(animation);
        return animation;
    };
    SpineSkeleton.prototype.createSlot = function (name, parent) {
        if (parent === void 0) { parent = null; }
        var slot = this.findSlot(name);
        if (slot != null) {
            return slot;
        }
        slot = new SpineSlot_1.SpineSlot();
        slot.bone = parent;
        slot.name = name;
        this.slots.push(slot);
        return slot;
    };
    SpineSkeleton.prototype.createEvent = function (name) {
        var event = this.findEvent(name);
        if (event != null) {
            return event;
        }
        event = new SpineEvent_1.SpineEvent();
        event.name = name;
        this.events.push(event);
        return event;
    };
    //-----------------------------------
    SpineSkeleton.prototype.findBone = function (name) {
        for (var _i = 0, _a = this.bones; _i < _a.length; _i++) {
            var bone = _a[_i];
            if (bone.name === name) {
                return bone;
            }
        }
        return null;
    };
    SpineSkeleton.prototype.findAnimation = function (name) {
        for (var _i = 0, _a = this.animations; _i < _a.length; _i++) {
            var animation = _a[_i];
            if (animation.name === name) {
                return animation;
            }
        }
        return null;
    };
    SpineSkeleton.prototype.findSlot = function (name) {
        for (var _i = 0, _a = this.slots; _i < _a.length; _i++) {
            var slot = _a[_i];
            if (slot.name === name) {
                return slot;
            }
        }
        return null;
    };
    SpineSkeleton.prototype.findEvent = function (name) {
        for (var _i = 0, _a = this.events; _i < _a.length; _i++) {
            var event = _a[_i];
            if (event.name === name) {
                return event;
            }
        }
        return null;
    };
    //-----------------------------------
    SpineSkeleton.prototype.convert = function (format) {
        return JsonEncoder_1.JsonEncoder.stringify(format.convert(this));
    };
    return SpineSkeleton;
}());
exports.SpineSkeleton = SpineSkeleton;


/***/ }),

/***/ "./source/spine/SpineSkeletonHelper.ts":
/*!*********************************************!*\
  !*** ./source/spine/SpineSkeletonHelper.ts ***!
  \*********************************************/
/***/ (function(__unused_webpack_module, exports) {



exports.SpineSkeletonHelper = void 0;
var SpineSkeletonHelper = /** @class */ (function () {
    function SpineSkeletonHelper() {
    }
    SpineSkeletonHelper.simplifySkeletonNames = function (skeleton) {
        while (true) {
            var hasCollisions = false;
            var isSimplified = true;
            //-----------------------------------
            var bones = [];
            var repeats = {};
            var names = [];
            //-----------------------------------
            for (var _i = 0, _a = skeleton.bones; _i < _a.length; _i++) {
                var bone = _a[_i];
                var path = bone.name.split('/');
                var name = bone.name;
                if (path.length > 1) {
                    name = path.slice(1).join('/');
                    isSimplified = false;
                }
                if (repeats[name] == null) {
                    repeats[name] = 1;
                }
                else {
                    repeats[name]++;
                }
                names.push(name);
                bones.push(bone);
            }
            //-----------------------------------
            for (var index = 0; index < bones.length; index++) {
                var name = names[index];
                if (repeats[name] === 1) {
                    bones[index].name = name;
                    for (var _b = 0, _c = skeleton.slots; _b < _c.length; _b++) {
                        var slot = _c[_b];
                        if (slot.bone === bones[index]) {
                            slot.name = name + '_slot';
                        }
                    }
                }
                else {
                    hasCollisions = true;
                }
            }
            //-----------------------------------
            if (hasCollisions || isSimplified) {
                break;
            }
        }
    };
    return SpineSkeletonHelper;
}());
exports.SpineSkeletonHelper = SpineSkeletonHelper;


/***/ }),

/***/ "./source/spine/SpineSlot.ts":
/*!***********************************!*\
  !*** ./source/spine/SpineSlot.ts ***!
  \***********************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {



exports.SpineSlot = void 0;
var SpineClippingAttachment_1 = __webpack_require__(/*! ./attachment/SpineClippingAttachment */ "./source/spine/attachment/SpineClippingAttachment.ts");
var SpinePointAttachment_1 = __webpack_require__(/*! ./attachment/SpinePointAttachment */ "./source/spine/attachment/SpinePointAttachment.ts");
var SpineRegionAttachment_1 = __webpack_require__(/*! ./attachment/SpineRegionAttachment */ "./source/spine/attachment/SpineRegionAttachment.ts");
var SpineSlot = /** @class */ (function () {
    function SpineSlot() {
        this.initialized = false;
        this.attachments = [];
    }
    //-----------------------------------
    SpineSlot.prototype.createAttachment = function (name, type) {
        var attachment = this.findAttachment(name);
        if (attachment != null) {
            return attachment;
        }
        if (type === "region" /* SpineAttachmentType.REGION */) {
            attachment = new SpineRegionAttachment_1.SpineRegionAttachment();
        }
        else if (type === "clipping" /* SpineAttachmentType.CLIPPING */) {
            attachment = new SpineClippingAttachment_1.SpineClippingAttachment();
        }
        else if (type === "point" /* SpineAttachmentType.POINT */) {
            attachment = new SpinePointAttachment_1.SpinePointAttachment();
        }
        if (attachment != null) {
            this.attachments.push(attachment);
            attachment.name = name;
        }
        return attachment;
    };
    //-----------------------------------
    SpineSlot.prototype.findAttachment = function (name) {
        for (var _i = 0, _a = this.attachments; _i < _a.length; _i++) {
            var attachment = _a[_i];
            if (attachment.name === name) {
                return attachment;
            }
        }
        return null;
    };
    return SpineSlot;
}());
exports.SpineSlot = SpineSlot;


/***/ }),

/***/ "./source/spine/attachment/SpineAttachment.ts":
/*!****************************************************!*\
  !*** ./source/spine/attachment/SpineAttachment.ts ***!
  \****************************************************/
/***/ (function(__unused_webpack_module, exports) {



exports.SpineAttachment = void 0;
var SpineAttachment = /** @class */ (function () {
    function SpineAttachment(type) {
        this.type = type;
    }
    return SpineAttachment;
}());
exports.SpineAttachment = SpineAttachment;


/***/ }),

/***/ "./source/spine/attachment/SpineClippingAttachment.ts":
/*!************************************************************!*\
  !*** ./source/spine/attachment/SpineClippingAttachment.ts ***!
  \************************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = null ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? ({}) : (__.prototype = b.prototype, new __());
    };
})();

exports.SpineClippingAttachment = void 0;
var SpineAttachment_1 = __webpack_require__(/*! ./SpineAttachment */ "./source/spine/attachment/SpineAttachment.ts");
var SpineClippingAttachment = /** @class */ (function (_super) {
    __extends(SpineClippingAttachment, _super);
    function SpineClippingAttachment() {
        var _this = _super.call(this, "clipping" /* SpineAttachmentType.CLIPPING */) || this;
        _this.vertexCount = 0;
        _this.vertices = [];
        return _this;
    }
    return SpineClippingAttachment;
}(SpineAttachment_1.SpineAttachment));
exports.SpineClippingAttachment = SpineClippingAttachment;


/***/ }),

/***/ "./source/spine/attachment/SpinePointAttachment.ts":
/*!*********************************************************!*\
  !*** ./source/spine/attachment/SpinePointAttachment.ts ***!
  \*********************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = null ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? ({}) : (__.prototype = b.prototype, new __());
    };
})();

exports.SpinePointAttachment = void 0;
var SpineAttachment_1 = __webpack_require__(/*! ./SpineAttachment */ "./source/spine/attachment/SpineAttachment.ts");
var SpinePointAttachment = /** @class */ (function (_super) {
    __extends(SpinePointAttachment, _super);
    function SpinePointAttachment() {
        return _super.call(this, "point" /* SpineAttachmentType.POINT */) || this;
    }
    return SpinePointAttachment;
}(SpineAttachment_1.SpineAttachment));
exports.SpinePointAttachment = SpinePointAttachment;


/***/ }),

/***/ "./source/spine/attachment/SpineRegionAttachment.ts":
/*!**********************************************************!*\
  !*** ./source/spine/attachment/SpineRegionAttachment.ts ***!
  \**********************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = null ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? ({}) : (__.prototype = b.prototype, new __());
    };
})();

exports.SpineRegionAttachment = void 0;
var SpineAttachment_1 = __webpack_require__(/*! ./SpineAttachment */ "./source/spine/attachment/SpineAttachment.ts");
var SpineRegionAttachment = /** @class */ (function (_super) {
    __extends(SpineRegionAttachment, _super);
    function SpineRegionAttachment() {
        return _super.call(this, "region" /* SpineAttachmentType.REGION */) || this;
    }
    return SpineRegionAttachment;
}(SpineAttachment_1.SpineAttachment));
exports.SpineRegionAttachment = SpineRegionAttachment;


/***/ }),

/***/ "./source/spine/formats/SpineFormatOptimizer.ts":
/*!******************************************************!*\
  !*** ./source/spine/formats/SpineFormatOptimizer.ts ***!
  \******************************************************/
/***/ (function(__unused_webpack_module, exports) {



exports.SpineFormatOptimizer = void 0;
var SpineFormatOptimizer = /** @class */ (function () {
    function SpineFormatOptimizer() {
        var _a;
        this._frameCheckersMap = (_a = {},
            _a["attachment" /* SpineTimelineType.ATTACHMENT */] = this.isEmptyAttachmentFrame,
            _a["color" /* SpineTimelineType.COLOR */] = this.isEmptyColorFrame,
            _a["rotate" /* SpineTimelineType.ROTATE */] = this.isEmptyRotateFrame,
            _a["translate" /* SpineTimelineType.TRANSLATE */] = this.isEmptyTranslateFrame,
            _a["scale" /* SpineTimelineType.SCALE */] = this.isEmptyScaleFrame,
            _a["shear" /* SpineTimelineType.SHEAR */] = this.isEmptyShearFrame,
            _a);
    }
    //-----------------------------------
    SpineFormatOptimizer.prototype.isEmptyRotateFrame = function (group, frame) {
        return (frame.angle === 0);
    };
    SpineFormatOptimizer.prototype.isEmptyTranslateFrame = function (group, frame) {
        return (frame.x === 0 && frame.y === 0);
    };
    SpineFormatOptimizer.prototype.isEmptyScaleFrame = function (group, frame) {
        return (frame.x === 1 && frame.y === 1);
    };
    SpineFormatOptimizer.prototype.isEmptyShearFrame = function (group, frame) {
        return (frame.x === 0 && frame.y === 0);
    };
    SpineFormatOptimizer.prototype.isEmptyAttachmentFrame = function (group, frame) {
        if (group.slot.attachment != null) {
            return (frame.name === group.slot.attachment.name);
        }
        return (frame.name == null);
    };
    SpineFormatOptimizer.prototype.isEmptyColorFrame = function (group, frame) {
        return (group.slot.color === frame.color);
    };
    //-----------------------------------
    SpineFormatOptimizer.prototype.isEmptyTimeline = function (group, timeline) {
        var checker = this._frameCheckersMap[timeline.type];
        if (checker != null) {
            for (var _i = 0, _a = timeline.frames; _i < _a.length; _i++) {
                var frame = _a[_i];
                if (checker(group, frame) === false) {
                    return false;
                }
            }
            return true;
        }
        return false;
    };
    //-----------------------------------
    SpineFormatOptimizer.prototype.optimizeTimeline = function (group) {
        var timelines = group.timelines;
        for (var index = 0; index < timelines.length; index++) {
            var timeline = timelines[index];
            if (this.isEmptyTimeline(group, timeline)) {
                timelines.splice(index, 1);
                index--;
            }
        }
    };
    return SpineFormatOptimizer;
}());
exports.SpineFormatOptimizer = SpineFormatOptimizer;


/***/ }),

/***/ "./source/spine/formats/SpineFormatV3_8_99.ts":
/*!****************************************************!*\
  !*** ./source/spine/formats/SpineFormatV3_8_99.ts ***!
  \****************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};

exports.SpineFormatV3_8_99 = void 0;
var JsonFormatUtil_1 = __webpack_require__(/*! ../../utils/JsonFormatUtil */ "./source/utils/JsonFormatUtil.ts");
var SpineFormatOptimizer_1 = __webpack_require__(/*! ./SpineFormatOptimizer */ "./source/spine/formats/SpineFormatOptimizer.ts");
var SpineFormatV3_8_99 = /** @class */ (function () {
    function SpineFormatV3_8_99() {
        this.version = '3.8.99';
        this.optimizer = new SpineFormatOptimizer_1.SpineFormatOptimizer();
    }
    //-----------------------------------
    SpineFormatV3_8_99.prototype.convertSkeleton = function (skeleton) {
        return {
            spine: this.version,
            images: skeleton.imagesPath,
            hash: 'unknown'
        };
    };
    SpineFormatV3_8_99.prototype.convertBone = function (bone) {
        return JsonFormatUtil_1.JsonFormatUtil.cleanObject({
            name: bone.name,
            parent: (bone.parent != null) ? bone.parent.name : null,
            length: bone.length,
            transform: bone.transform,
            skin: bone.skin,
            x: bone.x,
            y: bone.y * SpineFormatV3_8_99.Y_FLIP,
            rotation: bone.rotation,
            scaleX: bone.scaleX,
            scaleY: bone.scaleY,
            shearX: bone.shearX,
            shearY: bone.shearY,
            color: bone.color
        });
    };
    SpineFormatV3_8_99.prototype.convertBones = function (skeleton) {
        var result = [];
        for (var _i = 0, _a = skeleton.bones; _i < _a.length; _i++) {
            var bone = _a[_i];
            result.push(this.convertBone(bone));
        }
        return result;
    };
    //-----------------------------------
    SpineFormatV3_8_99.prototype.convertTimelineFrameCurve = function (frame) {
        var curve = frame.curve;
        if (curve === 'stepped') {
            return { curve: 'stepped' };
        }
        if (curve != null) {
            return JsonFormatUtil_1.JsonFormatUtil.cleanObject({
                curve: curve.cx1,
                c2: curve.cy1,
                c3: curve.cx2,
                c4: curve.cy2
            });
        }
        return null;
    };
    SpineFormatV3_8_99.prototype.convertTimelineFrame = function (frame, flipY) {
        if (flipY === void 0) { flipY = false; }
        var curve = this.convertTimelineFrameCurve(frame);
        return JsonFormatUtil_1.JsonFormatUtil.cleanObject(__assign(__assign({}, curve), { time: frame.time, angle: frame.angle, name: frame.name, color: frame.color, x: frame.x, y: frame.y != null && flipY ? frame.y * SpineFormatV3_8_99.Y_FLIP : frame.y }));
    };
    SpineFormatV3_8_99.prototype.convertTimeline = function (timeline) {
        var length = timeline.frames.length;
        var result = [];
        var flipY = timeline.type === "translate" /* SpineTimelineType.TRANSLATE */;
        for (var index = 0; index < length; index++) {
            var frame = this.convertTimelineFrame(timeline.frames[index], flipY);
            if (index === (length - 1)) {
                // last frame cannot contain curve property
                delete frame.curve;
            }
            result.push(frame);
        }
        return result;
    };
    SpineFormatV3_8_99.prototype.convertTimelineGroup = function (group) {
        this.optimizer.optimizeTimeline(group);
        var result = {};
        for (var _i = 0, _a = group.timelines; _i < _a.length; _i++) {
            var timeline = _a[_i];
            result[timeline.type] = this.convertTimeline(timeline);
        }
        return result;
    };
    SpineFormatV3_8_99.prototype.convertBonesTimeline = function (animation) {
        var result = {};
        for (var _i = 0, _a = animation.bones; _i < _a.length; _i++) {
            var group = _a[_i];
            result[group.bone.name] = this.convertTimelineGroup(group);
        }
        return result;
    };
    SpineFormatV3_8_99.prototype.convertSlotsTimeline = function (animation) {
        var result = {};
        for (var _i = 0, _a = animation.slots; _i < _a.length; _i++) {
            var group = _a[_i];
            result[group.slot.name] = this.convertTimelineGroup(group);
        }
        return result;
    };
    SpineFormatV3_8_99.prototype.convertAnimation = function (animation) {
        return JsonFormatUtil_1.JsonFormatUtil.cleanObject({
            bones: this.convertBonesTimeline(animation),
            events: this.convertTimeline(animation.events),
            slots: this.convertSlotsTimeline(animation)
        });
    };
    SpineFormatV3_8_99.prototype.convertAnimations = function (skeleton) {
        var result = {};
        for (var _i = 0, _a = skeleton.animations; _i < _a.length; _i++) {
            var animation = _a[_i];
            result[animation.name] = this.convertAnimation(animation);
        }
        return result;
    };
    //-----------------------------------
    SpineFormatV3_8_99.prototype.convertClippingAttachment = function (attachment) {
        return JsonFormatUtil_1.JsonFormatUtil.cleanObject({
            type: attachment.type,
            name: attachment.name,
            end: (attachment.end != null) ? attachment.end.name : null,
            vertexCount: attachment.vertexCount,
            vertices: attachment.vertices,
            color: attachment.color
        });
    };
    SpineFormatV3_8_99.prototype.convertPointAttachment = function (attachment) {
        return JsonFormatUtil_1.JsonFormatUtil.cleanObject({
            type: attachment.type,
            name: attachment.name,
            x: attachment.x,
            y: attachment.y != null ? attachment.y * SpineFormatV3_8_99.Y_FLIP : undefined,
            rotation: attachment.rotation,
            color: attachment.color
        });
    };
    SpineFormatV3_8_99.prototype.convertRegionAttachment = function (attachment) {
        return JsonFormatUtil_1.JsonFormatUtil.cleanObject({
            type: attachment.type,
            name: attachment.name,
            path: attachment.path,
            x: attachment.x,
            y: attachment.y != null ? attachment.y * SpineFormatV3_8_99.Y_FLIP : undefined,
            rotation: attachment.rotation,
            scaleX: attachment.scaleX,
            scaleY: attachment.scaleY,
            width: attachment.width,
            height: attachment.height,
            color: attachment.color
        });
    };
    SpineFormatV3_8_99.prototype.convertAttachment = function (attachment) {
        switch (attachment.type) {
            case "clipping" /* SpineAttachmentType.CLIPPING */:
                return this.convertClippingAttachment(attachment);
            case "point" /* SpineAttachmentType.POINT */:
                return this.convertPointAttachment(attachment);
            case "region" /* SpineAttachmentType.REGION */:
                return this.convertRegionAttachment(attachment);
        }
        return null;
    };
    SpineFormatV3_8_99.prototype.convertSlotAttachments = function (slot) {
        var result = {};
        for (var _i = 0, _a = slot.attachments; _i < _a.length; _i++) {
            var attachment = _a[_i];
            result[attachment.name] = this.convertAttachment(attachment);
        }
        return result;
    };
    SpineFormatV3_8_99.prototype.convertSlot = function (slot) {
        return JsonFormatUtil_1.JsonFormatUtil.cleanObject({
            name: slot.name,
            bone: (slot.bone != null) ? slot.bone.name : null,
            attachment: (slot.attachment != null) ? slot.attachment.name : null,
            blend: slot.blend,
            color: slot.color
        });
    };
    SpineFormatV3_8_99.prototype.convertSlots = function (skeleton) {
        var result = [];
        for (var _i = 0, _a = skeleton.slots; _i < _a.length; _i++) {
            var slot = _a[_i];
            result.push(this.convertSlot(slot));
        }
        return result;
    };
    //-----------------------------------
    SpineFormatV3_8_99.prototype.convertEvent = function (event) {
        return JsonFormatUtil_1.JsonFormatUtil.cleanObject({
            name: event.name,
            int: event.int,
            float: event.float,
            string: event.string
        });
    };
    SpineFormatV3_8_99.prototype.convertEvents = function (skeleton) {
        var result = {};
        for (var _i = 0, _a = skeleton.events; _i < _a.length; _i++) {
            var event = _a[_i];
            result[event.name] = this.convertEvent(event);
        }
        return result;
    };
    //-----------------------------------
    SpineFormatV3_8_99.prototype.convertSkinAttachments = function (skeleton) {
        var result = {};
        for (var _i = 0, _a = skeleton.slots; _i < _a.length; _i++) {
            var slot = _a[_i];
            result[slot.name] = this.convertSlotAttachments(slot);
        }
        return result;
    };
    SpineFormatV3_8_99.prototype.convertSkins = function (skeleton) {
        return [
            {
                attachments: this.convertSkinAttachments(skeleton),
                name: 'default'
            }
        ];
    };
    //-----------------------------------
    SpineFormatV3_8_99.prototype.convert = function (skeleton) {
        return JsonFormatUtil_1.JsonFormatUtil.cleanObject({
            skeleton: this.convertSkeleton(skeleton),
            bones: this.convertBones(skeleton),
            animations: this.convertAnimations(skeleton),
            slots: this.convertSlots(skeleton),
            events: this.convertEvents(skeleton),
            skins: this.convertSkins(skeleton)
        });
    };
    // Y-axis direction: Animate uses Y-down, Spine uses Y-up
    SpineFormatV3_8_99.Y_FLIP = -1;
    return SpineFormatV3_8_99;
}());
exports.SpineFormatV3_8_99 = SpineFormatV3_8_99;


/***/ }),

/***/ "./source/spine/formats/SpineFormatV4_0_00.ts":
/*!****************************************************!*\
  !*** ./source/spine/formats/SpineFormatV4_0_00.ts ***!
  \****************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = null ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? ({}) : (__.prototype = b.prototype, new __());
    };
})();
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};

exports.SpineFormatV4_0_00 = void 0;
var JsonFormatUtil_1 = __webpack_require__(/*! ../../utils/JsonFormatUtil */ "./source/utils/JsonFormatUtil.ts");
var SpineFormatV3_8_99_1 = __webpack_require__(/*! ./SpineFormatV3_8_99 */ "./source/spine/formats/SpineFormatV3_8_99.ts");
var SpineFormatV4_0_00 = /** @class */ (function (_super) {
    __extends(SpineFormatV4_0_00, _super);
    function SpineFormatV4_0_00() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.version = '4.0.64';
        return _this;
    }
    SpineFormatV4_0_00.prototype.convertTimelineFrameCurve = function (frame) {
        var curve = frame.curve;
        if (curve === 'stepped') {
            return { curve: 'stepped' };
        }
        if (curve != null) {
            return {
                curve: [curve.cx1, curve.cy1, curve.cx2, curve.cy2]
            };
        }
        return null;
    };
    SpineFormatV4_0_00.prototype.convertTimeline = function (timeline) {
        var length = timeline.frames.length;
        var result = [];
        for (var index = 0; index < length; index++) {
            var frameData = timeline.frames[index];
            var curve = this.convertTimelineFrameCurve(frameData);
            var isRotate = timeline.type === "rotate" /* SpineTimelineType.ROTATE */;
            var isTranslate = timeline.type === "translate" /* SpineTimelineType.TRANSLATE */;
            var isScale = timeline.type === "scale" /* SpineTimelineType.SCALE */;
            var isShear = timeline.type === "shear" /* SpineTimelineType.SHEAR */;
            var isColor = timeline.type === "color" /* SpineTimelineType.COLOR */;
            var isAttachment = timeline.type === "attachment" /* SpineTimelineType.ATTACHMENT */;
            var frame = __assign({ time: frameData.time }, curve);
            if (isRotate) {
                frame.value = frameData.angle;
            }
            else if (isTranslate) {
                frame.x = frameData.x;
                frame.y = frameData.y != null ? frameData.y * SpineFormatV4_0_00.Y_FLIP : undefined;
            }
            else if (isScale || isShear) {
                frame.x = frameData.x;
                frame.y = frameData.y;
            }
            else if (isColor) {
                frame.color = frameData.color;
            }
            else if (isAttachment) {
                frame.name = frameData.name;
            }
            if (index === (length - 1)) {
                delete frame.curve;
            }
            result.push(JsonFormatUtil_1.JsonFormatUtil.cleanObject(frame));
        }
        return result;
    };
    SpineFormatV4_0_00.prototype.convertTimelineGroup = function (group) {
        this.optimizer.optimizeTimeline(group);
        var result = {};
        for (var _i = 0, _a = group.timelines; _i < _a.length; _i++) {
            var timeline = _a[_i];
            result[this.convertTimelineType(timeline.type)] = this.convertTimeline(timeline);
        }
        return result;
    };
    SpineFormatV4_0_00.prototype.convertTimelineType = function (type) {
        if (type === "color" /* SpineTimelineType.COLOR */) {
            return 'rgba';
        }
        return type;
    };
    return SpineFormatV4_0_00;
}(SpineFormatV3_8_99_1.SpineFormatV3_8_99));
exports.SpineFormatV4_0_00 = SpineFormatV4_0_00;


/***/ }),

/***/ "./source/spine/formats/SpineFormatV4_1_00.ts":
/*!****************************************************!*\
  !*** ./source/spine/formats/SpineFormatV4_1_00.ts ***!
  \****************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = null ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? ({}) : (__.prototype = b.prototype, new __());
    };
})();

exports.SpineFormatV4_1_00 = void 0;
var SpineFormatV4_0_00_1 = __webpack_require__(/*! ./SpineFormatV4_0_00 */ "./source/spine/formats/SpineFormatV4_0_00.ts");
var SpineFormatV4_1_00 = /** @class */ (function (_super) {
    __extends(SpineFormatV4_1_00, _super);
    function SpineFormatV4_1_00() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.version = '4.1.19';
        return _this;
    }
    return SpineFormatV4_1_00;
}(SpineFormatV4_0_00_1.SpineFormatV4_0_00));
exports.SpineFormatV4_1_00 = SpineFormatV4_1_00;


/***/ }),

/***/ "./source/spine/formats/SpineFormatV4_2_00.ts":
/*!****************************************************!*\
  !*** ./source/spine/formats/SpineFormatV4_2_00.ts ***!
  \****************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = null ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? ({}) : (__.prototype = b.prototype, new __());
    };
})();

exports.SpineFormatV4_2_00 = void 0;
var SpineFormatV4_1_00_1 = __webpack_require__(/*! ./SpineFormatV4_1_00 */ "./source/spine/formats/SpineFormatV4_1_00.ts");
var SpineFormatV4_2_00 = /** @class */ (function (_super) {
    __extends(SpineFormatV4_2_00, _super);
    function SpineFormatV4_2_00() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.version = '4.2.0';
        return _this;
    }
    return SpineFormatV4_2_00;
}(SpineFormatV4_1_00_1.SpineFormatV4_1_00));
exports.SpineFormatV4_2_00 = SpineFormatV4_2_00;


/***/ }),

/***/ "./source/spine/timeline/SpineTimeline.ts":
/*!************************************************!*\
  !*** ./source/spine/timeline/SpineTimeline.ts ***!
  \************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {



exports.SpineTimeline = void 0;
var SpineTimelineFrame_1 = __webpack_require__(/*! ./SpineTimelineFrame */ "./source/spine/timeline/SpineTimelineFrame.ts");
var SpineTimeline = /** @class */ (function () {
    function SpineTimeline() {
        this.frames = [];
    }
    SpineTimeline.prototype.createFrame = function (time, curve, unique) {
        if (unique === void 0) { unique = true; }
        var frame = this.findFrame(time);
        if (frame != null && unique) {
            return frame;
        }
        frame = new SpineTimelineFrame_1.SpineTimelineFrame();
        frame.curve = curve;
        frame.time = time;
        this.frames.push(frame);
        return frame;
    };
    SpineTimeline.prototype.findFrame = function (time) {
        for (var _i = 0, _a = this.frames; _i < _a.length; _i++) {
            var frame = _a[_i];
            if (frame.time === time) {
                return frame;
            }
        }
        return null;
    };
    return SpineTimeline;
}());
exports.SpineTimeline = SpineTimeline;


/***/ }),

/***/ "./source/spine/timeline/SpineTimelineFrame.ts":
/*!*****************************************************!*\
  !*** ./source/spine/timeline/SpineTimelineFrame.ts ***!
  \*****************************************************/
/***/ (function(__unused_webpack_module, exports) {



exports.SpineTimelineFrame = void 0;
var SpineTimelineFrame = /** @class */ (function () {
    function SpineTimelineFrame() {
        this.time = 0;
    }
    return SpineTimelineFrame;
}());
exports.SpineTimelineFrame = SpineTimelineFrame;


/***/ }),

/***/ "./source/spine/timeline/SpineTimelineGroup.ts":
/*!*****************************************************!*\
  !*** ./source/spine/timeline/SpineTimelineGroup.ts ***!
  \*****************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {



exports.SpineTimelineGroup = void 0;
var SpineTimeline_1 = __webpack_require__(/*! ./SpineTimeline */ "./source/spine/timeline/SpineTimeline.ts");
var SpineTimelineGroup = /** @class */ (function () {
    function SpineTimelineGroup() {
        this.timelines = [];
    }
    SpineTimelineGroup.prototype.createTimeline = function (type) {
        var timeline = this.findTimeline(type);
        if (timeline != null) {
            return timeline;
        }
        timeline = new SpineTimeline_1.SpineTimeline();
        timeline.type = type;
        this.timelines.push(timeline);
        return timeline;
    };
    SpineTimelineGroup.prototype.findTimeline = function (type) {
        for (var _i = 0, _a = this.timelines; _i < _a.length; _i++) {
            var timeline = _a[_i];
            if (timeline.type === type) {
                return timeline;
            }
        }
        return null;
    };
    return SpineTimelineGroup;
}());
exports.SpineTimelineGroup = SpineTimelineGroup;


/***/ }),

/***/ "./source/spine/timeline/SpineTimelineGroupBone.ts":
/*!*********************************************************!*\
  !*** ./source/spine/timeline/SpineTimelineGroupBone.ts ***!
  \*********************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = null ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? ({}) : (__.prototype = b.prototype, new __());
    };
})();

exports.SpineTimelineGroupBone = void 0;
var SpineTimelineGroup_1 = __webpack_require__(/*! ./SpineTimelineGroup */ "./source/spine/timeline/SpineTimelineGroup.ts");
var SpineTimelineGroupBone = /** @class */ (function (_super) {
    __extends(SpineTimelineGroupBone, _super);
    function SpineTimelineGroupBone() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    return SpineTimelineGroupBone;
}(SpineTimelineGroup_1.SpineTimelineGroup));
exports.SpineTimelineGroupBone = SpineTimelineGroupBone;


/***/ }),

/***/ "./source/spine/timeline/SpineTimelineGroupSlot.ts":
/*!*********************************************************!*\
  !*** ./source/spine/timeline/SpineTimelineGroupSlot.ts ***!
  \*********************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = null ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? ({}) : (__.prototype = b.prototype, new __());
    };
})();

exports.SpineTimelineGroupSlot = void 0;
var SpineTimelineGroup_1 = __webpack_require__(/*! ./SpineTimelineGroup */ "./source/spine/timeline/SpineTimelineGroup.ts");
var SpineTimelineGroupSlot = /** @class */ (function (_super) {
    __extends(SpineTimelineGroupSlot, _super);
    function SpineTimelineGroupSlot() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    return SpineTimelineGroupSlot;
}(SpineTimelineGroup_1.SpineTimelineGroup));
exports.SpineTimelineGroupSlot = SpineTimelineGroupSlot;


/***/ }),

/***/ "./source/spine/transform/SpineTransformMatrix.ts":
/*!********************************************************!*\
  !*** ./source/spine/transform/SpineTransformMatrix.ts ***!
  \********************************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {



exports.SpineTransformMatrix = void 0;
var Logger_1 = __webpack_require__(/*! ../../logger/Logger */ "./source/logger/Logger.ts");
var NumberUtil_1 = __webpack_require__(/*! ../../utils/NumberUtil */ "./source/utils/NumberUtil.ts");
var SpineTransformMatrix = /** @class */ (function () {
    function SpineTransformMatrix(element, reference, matrixOverride, positionOverride, isTween) {
        if (reference === void 0) { reference = null; }
        if (matrixOverride === void 0) { matrixOverride = null; }
        if (positionOverride === void 0) { positionOverride = null; }
        if (isTween === void 0) { isTween = false; }
        var _a;
        // Position: The Spine bone must be positioned at the Transformation Point.
        if (positionOverride) {
            this.x = positionOverride.x;
            this.y = positionOverride.y;
        }
        else {
            this.x = element.transformX;
            this.y = element.transformY;
        }
        var name = element.name || ((_a = element.libraryItem) === null || _a === void 0 ? void 0 : _a.name) || '<anon>';
        // Log transform points
        Logger_1.Logger.trace("[MATRIX] '".concat(name, "' Transform: pos=(").concat(this.x.toFixed(2), ", ").concat(this.y.toFixed(2), ") registration=(").concat(element.x.toFixed(2), ", ").concat(element.y.toFixed(2), ") pivot=(").concat(element.transformationPoint.x.toFixed(2), ", ").concat(element.transformationPoint.y.toFixed(2), ")"));
        // Decompose the matrix
        // Use override if provided (e.g. for Layer Parenting resolution)
        var mat = matrixOverride || element.matrix;
        var decomposed = SpineTransformMatrix.decomposeMatrix(mat, reference, name, isTween);
        this.rotation = decomposed.rotation;
        this.scaleX = decomposed.scaleX;
        this.scaleY = decomposed.scaleY;
        this.shearX = decomposed.shearX;
        this.shearY = decomposed.shearY;
    }
    /**
     * Decomposes an Animate Matrix into Spine components using a robust Basis Vector approach.
     * Accounts for coordinate system differences (Animate Y-Down vs Spine Y-Up).
     */
    SpineTransformMatrix.decomposeMatrix = function (mat, reference, debugName, isTween) {
        if (reference === void 0) { reference = null; }
        if (debugName === void 0) { debugName = ''; }
        if (isTween === void 0) { isTween = false; }
        // Log raw matrix for debugging
        Logger_1.Logger.trace("[DECOMPOSE] '".concat(debugName, "' Raw Flash Matrix: a=").concat(mat.a.toFixed(4), " b=").concat(mat.b.toFixed(4), " c=").concat(mat.c.toFixed(4), " d=").concat(mat.d.toFixed(4), " tx=").concat(mat.tx.toFixed(2), " ty=").concat(mat.ty.toFixed(2)));
        // Spine Basis Vectors derived from Animate Matrix (Y-Up conversion)
        // Assumption Check: Animate is Y-down. We flip 'b' and 'c' because they represent 
        // the cross-axis influence in the rotation/skew components.
        var a = mat.a;
        var b = -mat.b;
        var c = -mat.c;
        var d = mat.d;
        Logger_1.Logger.trace("[DECOMPOSE] '".concat(debugName, "' Y-Up Basis: a=").concat(a.toFixed(4), " b=").concat(b.toFixed(4), " c=").concat(c.toFixed(4), " d=").concat(d.toFixed(4)));
        var scaleX = Math.sqrt(a * a + b * b);
        var scaleY = Math.sqrt(c * c + d * d);
        var det = a * d - b * c;
        Logger_1.Logger.trace("[DECOMPOSE] '".concat(debugName, "' Magnitudes: scaleX_raw=").concat(scaleX.toFixed(4), " scaleY_raw=").concat(scaleY.toFixed(4), " det=").concat(det.toFixed(6)));
        // Base angles for X and Y axes
        var angleX = Math.atan2(b, a) * (180 / Math.PI);
        var angleY = Math.atan2(d, c) * (180 / Math.PI);
        var rotation = angleX;
        var appliedScaleX = scaleX;
        var appliedScaleY = scaleY;
        if (det < 0) {
            // Negative determinant means a flip exists.
            // Option 1: Flip Y (Default basis)
            var rot1 = angleX;
            // Option 2: Flip X (Rotate 180 and Flip Y)
            var rot2 = angleX + 180;
            while (rot2 > 180)
                rot2 -= 360;
            while (rot2 <= -180)
                rot2 += 360;
            if (reference) {
                var diff1 = Math.abs(NumberUtil_1.NumberUtil.deltaAngle(rot1, reference.rotation));
                var diff2 = Math.abs(NumberUtil_1.NumberUtil.deltaAngle(rot2, reference.rotation));
                Logger_1.Logger.trace("[DECOMPOSE] '".concat(debugName, "' Flip Detected. RefRot=").concat(reference.rotation.toFixed(2), ". Opt1(FlipY): ").concat(rot1.toFixed(2), " (diff ").concat(diff1.toFixed(2), "). Opt2(FlipX): ").concat(rot2.toFixed(2), " (diff ").concat(diff2.toFixed(2), ")"));
                // DISCONTINUITY PREVENTION:
                // If we are tweening, we MUST prioritize staying close to the reference.
                var threshold = isTween ? 90 : 10;
                if (diff2 < diff1 - threshold) {
                    rotation = rot2;
                    appliedScaleX = -scaleX;
                    appliedScaleY = scaleY;
                    Logger_1.Logger.trace("[DECOMPOSE] '".concat(debugName, "' Chosen Opt 2 (FlipX) - stability threshold: ").concat(threshold));
                }
                else {
                    rotation = rot1;
                    appliedScaleX = scaleX;
                    appliedScaleY = -scaleY;
                    Logger_1.Logger.trace("[DECOMPOSE] '".concat(debugName, "' Chosen Opt 1 (FlipY) - default."));
                }
            }
            else {
                // NO REFERENCE (First frame of this bone)
                // Heuristic: Prefer the option with the smaller rotation.
                // Animate's "Flip Horizontal" often has 0 rotation and scaleX = -1.
                // Our angleX for a flipped basis is 180.
                // Option 1 (FlipY): 180 deg
                // Option 2 (FlipX): 0 deg
                // Choosing the smaller rotation (Option 2) matches Animate's visual properties better.
                if (Math.abs(rot2) < Math.abs(rot1) - 10) {
                    rotation = rot2;
                    appliedScaleX = -scaleX;
                    appliedScaleY = scaleY;
                    Logger_1.Logger.trace("[DECOMPOSE] '".concat(debugName, "' Flip Detected. No reference. Heuristic: Chosen Opt 2 (FlipX) because rot ").concat(rot2.toFixed(2), " is smaller than ").concat(rot1.toFixed(2)));
                }
                else {
                    rotation = rot1;
                    appliedScaleX = scaleX;
                    appliedScaleY = -scaleY;
                    Logger_1.Logger.trace("[DECOMPOSE] '".concat(debugName, "' Flip Detected. No reference. Defaulting to Flip Y."));
                }
            }
        }
        // Recalculate shear based on the chosen rotation/scale signs
        // Spine Y-Axis angle = rotation + 90 + shearY
        var visualAngleY = angleY;
        if (appliedScaleY < 0) {
            visualAngleY = Math.atan2(-d, -c) * (180 / Math.PI);
        }
        var shearY = visualAngleY - rotation - 90;
        while (shearY <= -180)
            shearY += 360;
        while (shearY > 180)
            shearY -= 360;
        // Log intermediate decomposition steps
        Logger_1.Logger.trace("[DECOMPOSE] '".concat(debugName, "' Decomposition: det=").concat(det.toFixed(4), " angleX=").concat(angleX.toFixed(2), " angleY=").concat(angleY.toFixed(2), " chosenRot=").concat(rotation.toFixed(2)));
        // Unwrap Rotation (Shortest path to reference)
        if (reference) {
            var diff = rotation - reference.rotation;
            while (diff > 180) {
                rotation -= 360;
                diff -= 360;
            }
            while (diff < -180) {
                rotation += 360;
                diff += 360;
            }
        }
        else {
            while (rotation <= -180)
                rotation += 360;
            while (rotation > 180)
                rotation -= 360;
        }
        var result = {
            rotation: Math.round(rotation * 10000) / 10000,
            scaleX: Math.round(appliedScaleX * 10000) / 10000,
            scaleY: Math.round(appliedScaleY * 10000) / 10000,
            shearX: 0,
            shearY: Math.round(shearY * 10000) / 10000
        };
        Logger_1.Logger.trace("[DECOMPOSE] '".concat(debugName, "' Result: rot=").concat(result.rotation.toFixed(2), " sx=").concat(result.scaleX.toFixed(2), " sy=").concat(result.scaleY.toFixed(2), " shY=").concat(result.shearY.toFixed(2)));
        return result;
    };
    SpineTransformMatrix.Y_DIRECTION = -1;
    return SpineTransformMatrix;
}());
exports.SpineTransformMatrix = SpineTransformMatrix;


/***/ }),

/***/ "./source/utils/ConvertUtil.ts":
/*!*************************************!*\
  !*** ./source/utils/ConvertUtil.ts ***!
  \*************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {



exports.ConvertUtil = void 0;
var Logger_1 = __webpack_require__(/*! ../logger/Logger */ "./source/logger/Logger.ts");
var JsonUtil_1 = __webpack_require__(/*! ./JsonUtil */ "./source/utils/JsonUtil.ts");
var StringUtil_1 = __webpack_require__(/*! ./StringUtil */ "./source/utils/StringUtil.ts");
var ConvertUtil = /** @class */ (function () {
    function ConvertUtil() {
    }
    ConvertUtil.createElementName = function (element, context) {
        var _a;
        var result = element.layer.name;
        if (element.elementType === 'instance') {
            if (JsonUtil_1.JsonUtil.validString(element.name)) {
                result = element.name;
            }
            else if (JsonUtil_1.JsonUtil.validString(element.layer.name)) {
                result = element.layer.name;
            }
            else {
                Logger_1.Logger.assert(element.libraryItem != null, "createElementName: instance element has no libraryItem and no valid name/layer.name (layer: ".concat(((_a = element.layer) === null || _a === void 0 ? void 0 : _a.name) || 'unknown', ")"));
                result = element.libraryItem.name;
            }
        }
        else {
            if (JsonUtil_1.JsonUtil.validString(element.layer.name)) {
                result = element.layer.name;
            }
        }
        if (result === '' || result == null) {
            return ConvertUtil.createShapeName(context);
        }
        else {
            return StringUtil_1.StringUtil.simplify(result);
        }
    };
    ConvertUtil.obtainElementBlendMode = function (element) {
        if (element.blendMode === 'multiply') {
            return "multiply" /* SpineBlendMode.MULTIPLY */;
        }
        else if (element.blendMode === 'screen') {
            return "screen" /* SpineBlendMode.SCREEN */;
        }
        else if (element.blendMode === 'add') {
            return "additive" /* SpineBlendMode.ADDITIVE */;
        }
        else {
            return "normal" /* SpineBlendMode.NORMAL */;
        }
    };
    ConvertUtil.obtainElementLabels = function (element) {
        var _a;
        var labels = [];
        var item = element.libraryItem;
        Logger_1.Logger.assert(item != null, "obtainElementLabels: element has no libraryItem. Only symbol instances can have frame labels. (element: ".concat(element.name || ((_a = element.layer) === null || _a === void 0 ? void 0 : _a.name) || 'unknown', ", elementType: ").concat(element.elementType, ")"));
        Logger_1.Logger.assert(item.timeline != null, "obtainElementLabels: libraryItem has no timeline. (item: ".concat(item.name, ")"));
        var timeline = item.timeline;
        var layers = timeline.layers;
        var potentialLabels = [];
        // 1. Collect all labels from all layers
        for (var _i = 0, layers_1 = layers; _i < layers_1.length; _i++) {
            var layer = layers_1[_i];
            // Optimization: Skip guide and mask layers if they shouldn't contain labels? 
            // Usually labels are on normal layers or folder layers (though folders are weird in JSFL).
            // Let's scan all.
            var frames = layer.frames;
            for (var frameIdx = 0; frameIdx < frames.length; frameIdx++) {
                var frame = frames[frameIdx];
                if (frame.startFrame !== frameIdx)
                    continue;
                if (frame.labelType === 'name' && frame.name) {
                    potentialLabels.push({
                        idx: frame.startFrame,
                        name: frame.name
                    });
                }
            }
        }
        // 2. Sort labels by frame index
        potentialLabels.sort(function (a, b) { return a.idx - b.idx; });
        // 3. Convert to ranges (start to next_start - 1)
        if (potentialLabels.length > 0) {
            var _loop_1 = function (i) {
                var current = potentialLabels[i];
                var next = potentialLabels[i + 1];
                var startFrame = current.idx;
                var endFrame = next ? (next.idx - 1) : (timeline.frameCount - 1);
                // Filter out duplicates if multiple layers have the same label at the same frame
                // or if different labels exist at same frame (ambiguous, but we take the last one or skip?)
                // Simple dedup by name check or just push?
                // Let's push, but maybe check if we already added a label for this startFrame?
                // Actually, if there are two labels at the same frame on different layers, 
                // that's weird. We'll just process them.
                // Check if this specific label/range already exists (deduplication)
                var exists = labels.some(function (l) { return l.startFrameIdx === startFrame && l.name === current.name; });
                if (!exists) {
                    labels.push({
                        name: current.name,
                        startFrameIdx: startFrame,
                        endFrameIdx: endFrame
                    });
                }
            };
            for (var i = 0; i < potentialLabels.length; i++) {
                _loop_1(i);
            }
        }
        if (labels.length === 0) {
            // Logger.trace(`No labels found for ${item.name}, using default full timeline.`);
            labels.push({
                endFrameIdx: item.timeline.frameCount - 1,
                startFrameIdx: 0,
                name: 'default'
            });
        }
        else {
            // Logger.trace(`Found ${labels.length} labels for ${item.name}: ${labels.map(l => `${l.name}(${l.startFrameIdx}-${l.endFrameIdx})`).join(', ')}`);
        }
        return labels;
    };
    ConvertUtil.createAttachmentName = function (element, context) {
        var _a;
        var result = '';
        if (element.instanceType === 'bitmap' || element.instanceType === 'symbol') {
            Logger_1.Logger.assert(element.libraryItem != null, "createAttachmentName: bitmap/symbol instance has no libraryItem (element: ".concat(element.name || ((_a = element.layer) === null || _a === void 0 ? void 0 : _a.name) || 'unknown', ", instanceType: ").concat(element.instanceType, ")"));
            result = element.libraryItem.name;
        }
        if (result === '' || result == null) {
            return ConvertUtil.createShapeName(context);
        }
        else {
            // Debugging naming collisions/issues
            // Logger.trace(`[Naming] Raw: '${result}' -> Simplified: '${StringUtil.simplify(result)}'`);
            return StringUtil_1.StringUtil.simplify(result);
        }
    };
    ConvertUtil.createBoneName = function (element, context) {
        var name = ConvertUtil.createElementName(element, context);
        // Log naming decision if needed
        // if (name.indexOf('dash') !== -1) Logger.trace(`[NAMING] Created bone name base: ${name} (Element: ${element.name}, Lib: ${element.libraryItem?.name}, Layer: ${element.layer.name})`);
        if (context != null && context.bone != null && context.bone.name !== 'root') {
            return context.bone.name + '/' + name;
        }
        return name;
    };
    ConvertUtil.createSlotName = function (context) {
        return context.bone.name + '_slot';
    };
    ConvertUtil.createShapeName = function (context) {
        for (var index = 0; index < Number.MAX_VALUE; index++) {
            var name = 'shape_' + index;
            if (context.global.shapesCache.values.indexOf(name) === -1) {
                return name;
            }
        }
        return 'shape';
    };
    return ConvertUtil;
}());
exports.ConvertUtil = ConvertUtil;


/***/ }),

/***/ "./source/utils/ImageUtil.ts":
/*!***********************************!*\
  !*** ./source/utils/ImageUtil.ts ***!
  \***********************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {



exports.ImageUtil = void 0;
var Logger_1 = __webpack_require__(/*! ../logger/Logger */ "./source/logger/Logger.ts");
var SpineImage_1 = __webpack_require__(/*! ../spine/SpineImage */ "./source/spine/SpineImage.ts");
var ImageUtil = /** @class */ (function () {
    function ImageUtil() {
    }
    ImageUtil.exportBitmap = function (imagePath, element, exportImages) {
        var _a, _b;
        Logger_1.Logger.assert(element.libraryItem != null, "exportBitmap: element has no libraryItem (element: ".concat(element.name || ((_a = element.layer) === null || _a === void 0 ? void 0 : _a.name) || 'unknown', ")"));
        // Capture geometric properties immediately
        var regPointX = element.x;
        var regPointY = element.y;
        var transPointX = element.transformX;
        var transPointY = element.transformY;
        var matrix = element.matrix;
        var item = element.libraryItem;
        var w = item.hPixels || item.width || 0;
        var h = item.vPixels || item.height || 0;
        if (exportImages) {
            item.exportToFile(imagePath);
        }
        // Calculate Smart Pivot Offset
        var localCenterX = w / 2;
        var localCenterY = h / 2;
        var offset = ImageUtil.calculateAttachmentOffset(matrix, regPointX, regPointY, transPointX, transPointY, localCenterX, localCenterY, element.name || ((_b = element.libraryItem) === null || _b === void 0 ? void 0 : _b.name));
        return new SpineImage_1.SpineImage(imagePath, w, h, 1, offset.x, offset.y, localCenterX, localCenterY);
    };
    ImageUtil.exportLibraryItem = function (imagePath, element, scale, exportImages) {
        Logger_1.Logger.assert(element.libraryItem != null, "exportLibraryItem: element has no libraryItem");
        return ImageUtil.exportSymbol(imagePath, element, fl.getDocumentDOM(), scale, exportImages);
    };
    ImageUtil.exportInstance = function (imagePath, element, document, scale, exportImages) {
        // If the instance has filters, color effects, or is a specific "baking" candidate, we export from Stage.
        // Otherwise, we export from Library to handle reusability better.
        // For now, we prefer Stage export if there are ANY visual overrides, to ensure fidelity (e.g. Dash effects).
        var hasFilters = element.filters && element.filters.length > 0;
        var hasColor = element.colorMode && element.colorMode !== 'none';
        if (hasFilters || hasColor) {
            return ImageUtil.exportInstanceFromStage(imagePath, element, document, scale, exportImages);
        }
        Logger_1.Logger.assert(element.libraryItem != null, "exportInstance: element has no libraryItem. (type: ".concat(element.elementType, ")"));
        return ImageUtil.exportSymbol(imagePath, element, document, scale, exportImages);
    };
    ImageUtil.sleep = function (ms) {
        var start = new Date().getTime();
        while (new Date().getTime() < start + ms)
            ;
    };
    ImageUtil.clearClipboard = function () {
        try {
            var blankDoc = fl.createDocument();
            blankDoc.width = 1;
            blankDoc.height = 1;
            blankDoc.addNewRectangle({ left: 0, top: 0, right: 1, bottom: 1 }, 0);
            blankDoc.selectAll();
            blankDoc.clipCopy();
            // Use try-catch for close to handle EDAPT or other plugin errors
            try {
                blankDoc.close(false);
            }
            catch (e) { /* ignore */ }
        }
        catch (e) {
            Logger_1.Logger.warning("[ImageUtil] Failed to clear clipboard: ".concat(e));
        }
    };
    ImageUtil.regainFocus = function (dom) {
        try {
            // Strategy 1: Explicitly make the target document active
            if (dom.makeActive) {
                try {
                    dom.makeActive();
                }
                catch (e) { /* ignore */ }
            }
            // Strategy 2: If the active DOM is not our target, try to switch
            var current = fl.getDocumentDOM();
            if (current && current.name !== dom.name) {
                // Try to focus by opening/closing a dummy if makeActive didn't work effectively? 
                // Or just rely on the retry.
            }
        }
        catch (e) {
            Logger_1.Logger.warning("[ImageUtil] regainFocus failed: ".concat(e));
        }
    };
    ImageUtil.exportInstanceFromStage = function (imagePath, element, document, scale, exportImages) {
        var _a;
        var matrix = element.matrix;
        var transPointX = element.transformX;
        var transPointY = element.transformY;
        var regPointX = matrix.tx;
        var regPointY = matrix.ty;
        var dom = document;
        var layer = element.layer;
        var wasLocked = layer.locked;
        var wasVisible = layer.visible;
        layer.locked = false;
        layer.visible = true;
        // Ensure we are focused on the right document before selection
        ImageUtil.regainFocus(dom);
        // Explicitly clear frame selection to ensure we are in Object Selection mode
        try {
            dom.getTimeline().setSelectedFrames([]);
        }
        catch (e) {
            try {
                dom.getTimeline().setSelectedFrames(0, 0);
                dom.selectNone();
            }
            catch (e2) { }
        }
        dom.selectNone();
        element.selected = true;
        var copySuccess = false;
        // Retry loop for clipCopy
        for (var attempt = 0; attempt < 4; attempt++) {
            try {
                // Ensure selection is fresh
                if (attempt > 0) {
                    ImageUtil.regainFocus(dom);
                    // Force re-selection sequence
                    dom.selectNone();
                    try {
                        dom.getTimeline().setSelectedFrames([]);
                    }
                    catch (e) { }
                    // Try alternative selection method
                    if (attempt % 2 === 1) {
                        dom.selection = [element];
                    }
                    else {
                        element.selected = true;
                    }
                    // Verify selection
                    if (dom.selection.length === 0) {
                        // Force frame selection reset again
                        try {
                            var tl = dom.getTimeline();
                            // Refresh frame (assignment to itself forces update in JSFL)
                            var cf = tl.currentFrame;
                            tl.currentFrame = cf;
                        }
                        catch (e) { }
                        // Try assignment again if element.selected = true failed
                        try {
                            dom.selection = [element];
                        }
                        catch (e) {
                            element.selected = true;
                        }
                    }
                    ImageUtil.sleep(200 + (attempt * 100)); // Increased backoff
                }
                if (dom.selection.length > 0) {
                    dom.clipCopy();
                    copySuccess = true;
                    // Logger.trace(`[ImageUtil] exportInstanceFromStage: Success on attempt ${attempt+1}`);
                    break;
                }
                else {
                    if (attempt === 0) {
                        // First attempt failed. Try assignment fallback immediately
                        try {
                            dom.selection = [element];
                        }
                        catch (e) { }
                        if (dom.selection.length > 0) {
                            dom.clipCopy();
                            copySuccess = true;
                            break;
                        }
                        Logger_1.Logger.warning("[ImageUtil] exportInstanceFromStage: Selection empty (attempt ".concat(attempt + 1, "). Layer: ").concat(layer.name));
                    }
                }
            }
            catch (e) {
                Logger_1.Logger.warning("[ImageUtil] exportInstanceFromStage: clipCopy failed (attempt ".concat(attempt + 1, "/4): ").concat(e, "."));
                ImageUtil.clearClipboard();
            }
        }
        element.selected = false;
        layer.locked = wasLocked;
        layer.visible = wasVisible;
        if (!copySuccess) {
            Logger_1.Logger.error("[ImageUtil] exportInstanceFromStage: Failed to copy element after retries. Element: ".concat(element.name));
            return new SpineImage_1.SpineImage(imagePath, 1, 1, scale, 0, 0);
        }
        try {
            var tempDoc = fl.createDocument();
            try {
                tempDoc.clipPaste(true);
                var w = 1;
                var h = 1;
                var localCenterX = 0;
                var localCenterY = 0;
                if (tempDoc.selection.length > 0) {
                    var pasted = tempDoc.selection[0];
                    // --- SANITIZATION STEP ---
                    // If the pasted element is a Symbol Instance, we must clean its internal timeline 
                    // (remove hidden layers) to prevent "Full Asset" glitches where hidden reference layers appear.
                    if (pasted.elementType === 'instance' && pasted.instanceType === 'symbol' && pasted.libraryItem) {
                        try {
                            // Ensure the temp document is active for editing
                            if (tempDoc.makeActive) {
                                try {
                                    tempDoc.makeActive();
                                }
                                catch (e) { }
                            }
                            // Select the instance to ensure context
                            tempDoc.selectNone();
                            pasted.selected = true;
                            // Enter the symbol in place
                            var libItem = pasted.libraryItem;
                            var itemName = libItem.name;
                            // Note: We use the library item name to edit.
                            tempDoc.library.editItem(itemName);
                            var subTimeline = tempDoc.getTimeline();
                            // Iterate backwards to delete hidden/guide layers
                            var modified = false;
                            for (var i = subTimeline.layers.length - 1; i >= 0; i--) {
                                var lay = subTimeline.layers[i];
                                var shouldDelete = lay.layerType === 'guide' || !lay.visible;
                                if (shouldDelete) {
                                    // Logger.trace(`[ImageUtil] Sanitizing: Deleting layer '${lay.name}' (visible=${lay.visible}, type=${lay.layerType}) in '${itemName}'`);
                                    subTimeline.deleteLayer(i);
                                    modified = true;
                                }
                            }
                            // Exit editing mode to return to Main Timeline of temp doc
                            tempDoc.exitEditMode();
                            // Re-select the pasted instance if edit mode cleared selection
                            if (modified) {
                                tempDoc.selectAll();
                            }
                            else {
                                // If nothing was modified, ensure selection is active
                                if (tempDoc.selection.length === 0) {
                                    pasted.selected = true;
                                }
                            }
                        }
                        catch (eSanitize) {
                            Logger_1.Logger.warning("[ImageUtil] Failed to sanitize temp symbol: ".concat(eSanitize));
                            try {
                                tempDoc.exitEditMode();
                            }
                            catch (e) { }
                        }
                    }
                    // -------------------------
                    // Re-fetch selection[0] as editing might have changed reference
                    if (tempDoc.selection.length > 0) {
                        var finalPasted = tempDoc.selection[0];
                        // Disable cacheAsBitmap on the final instance too
                        if (finalPasted.elementType === 'instance') {
                            finalPasted.cacheAsBitmap = false;
                        }
                        // RESET MATRIX TO IDENTITY (removes skew/scale/rotation, BUT keeps filters/color effects)
                        finalPasted.matrix = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
                        var rect = tempDoc.getSelectionRect();
                        var width = rect.right - rect.left;
                        var height = rect.bottom - rect.top;
                        w = Math.max(1, Math.ceil(width * scale));
                        h = Math.max(1, Math.ceil(height * scale));
                        localCenterX = rect.left + width / 2;
                        localCenterY = rect.top + height / 2;
                        if (exportImages) {
                            tempDoc.width = w;
                            tempDoc.height = h;
                            if (scale !== 1) {
                                finalPasted.scaleX = scale;
                                finalPasted.scaleY = scale;
                            }
                            var finalRect = tempDoc.getSelectionRect();
                            var fx = (finalRect.left + finalRect.right) / 2;
                            var fy = (finalRect.top + finalRect.bottom) / 2;
                            tempDoc.moveSelectionBy({
                                x: (w / 2) - fx,
                                y: (h / 2) - fy
                            });
                            tempDoc.exportPNG(imagePath, true, true);
                        }
                    }
                }
                var offset = ImageUtil.calculateAttachmentOffset(matrix, regPointX, regPointY, transPointX, transPointY, localCenterX, localCenterY, element.name || ((_a = element.libraryItem) === null || _a === void 0 ? void 0 : _a.name));
                return new SpineImage_1.SpineImage(imagePath, w, h, scale, offset.x, offset.y, localCenterX, localCenterY);
            }
            finally {
                try {
                    tempDoc.close(false);
                }
                catch (eClose) {
                    Logger_1.Logger.warning("[ImageUtil] Failed to close temp document (exportInstanceFromStage): ".concat(eClose));
                }
            }
        }
        catch (eDoc) {
            Logger_1.Logger.error("[ImageUtil] Error during temp document processing: ".concat(eDoc));
            return new SpineImage_1.SpineImage(imagePath, 1, 1, scale, 0, 0);
        }
    };
    ImageUtil.exportShape = function (imagePath, element, document, scale, exportImages, 
    // Optional selection hints to resolve "Live" element from Data element
    selectionHint) {
        var matrix = element.matrix;
        var transPointX = element.transformX;
        var transPointY = element.transformY;
        var regPointX = matrix.tx;
        var regPointY = matrix.ty;
        var dom = document;
        var timeline = dom.getTimeline();
        var originalFrame = timeline.currentFrame;
        var layer = element.layer;
        var wasLocked = layer.locked;
        var wasVisible = layer.visible;
        layer.locked = false;
        layer.visible = true;
        ImageUtil.regainFocus(dom);
        // Explicitly clear frame selection
        try {
            timeline.setSelectedFrames([]);
        }
        catch (e) {
            try {
                timeline.setSelectedFrames(0, 0);
                dom.selectNone();
            }
            catch (e2) { }
        }
        dom.selectNone();
        // CRITICAL FIX: If we have selection hints, use them to find the "Live" element.
        // The 'element' reference passed might be from a read-only Data API if we switched context.
        if (selectionHint) {
            try {
                var liveLayer = timeline.layers[selectionHint.layerIndex];
                var liveFrame = liveLayer.frames[selectionHint.frameIndex];
                var liveElement = liveFrame.elements[selectionHint.elementIndex];
                liveElement.selected = true;
            }
            catch (e) {
                Logger_1.Logger.warning("[ImageUtil] Failed to resolve live element from hints: ".concat(e, ". Falling back to object reference."));
                element.selected = true;
            }
        }
        else {
            element.selected = true;
        }
        if (dom.selection.length === 0) {
            // Selection failed logging
        }
        var copySuccess = false;
        // Retry loop for clipCopy
        for (var attempt = 0; attempt < 4; attempt++) {
            try {
                if (attempt > 0) {
                    ImageUtil.regainFocus(dom);
                    // Ensure we are still on the correct frame
                    if (timeline.currentFrame !== originalFrame) {
                        timeline.currentFrame = originalFrame;
                    }
                    try {
                        timeline.setSelectedFrames([]);
                    }
                    catch (e) { }
                    dom.selectNone();
                    // Try alternative selection method
                    if (attempt % 2 === 1) {
                        dom.selection = [element];
                    }
                    else {
                        element.selected = true;
                    }
                    // If selection is still empty and it's a shape on a specific layer, 
                    // and it's likely the only thing there or we are desperate:
                    if (dom.selection.length === 0 && element.elementType === 'shape') {
                        // Try selecting the layer's frame content?
                        // Careful not to select whole frame duration
                    }
                    ImageUtil.sleep(100 + (attempt * 100));
                }
                if (dom.selection.length > 0) {
                    dom.clipCopy();
                    copySuccess = true;
                    // Logger.trace(`[ImageUtil] exportShape: Success on attempt ${attempt+1}`);
                    break;
                }
                else {
                    if (attempt === 0) {
                        // First attempt failed. Try assignment fallback immediately before logging/sleeping
                        try {
                            dom.selection = [element];
                        }
                        catch (e) { }
                        if (dom.selection.length > 0) {
                            dom.clipCopy();
                            copySuccess = true;
                            break;
                        }
                        Logger_1.Logger.warning("[ImageUtil] exportShape: Selection empty on layer '".concat(layer.name, "' (attempt ").concat(attempt + 1, "). Element type: ").concat(element.elementType));
                    }
                }
            }
            catch (e) {
                Logger_1.Logger.warning("[ImageUtil] exportShape: clipCopy failed (attempt ".concat(attempt + 1, "/4): ").concat(e, "."));
                ImageUtil.clearClipboard();
            }
        }
        // ImageUtil.log(`exportShape: Copy finished. Success=${copySuccess}`);
        element.selected = false;
        layer.locked = wasLocked;
        layer.visible = wasVisible;
        if (!copySuccess) {
            Logger_1.Logger.error("[ImageUtil] exportShape: Failed to copy element after retries. Layer: '".concat(layer.name, "'"));
            return new SpineImage_1.SpineImage(imagePath, 1, 1, scale, 0, 0);
        }
        // Paste into a temp document
        var tempDoc = fl.createDocument();
        try {
            tempDoc.clipPaste(true);
            var w = 1;
            var h = 1;
            var localCenterX = 0;
            var localCenterY = 0;
            if (tempDoc.selection.length > 0) {
                var pasted = tempDoc.selection[0];
                // RESET MATRIX TO IDENTITY
                pasted.matrix = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
                // Measure the normalized shape
                var rect = tempDoc.getSelectionRect();
                var width = rect.right - rect.left;
                var height = rect.bottom - rect.top;
                w = Math.max(1, Math.ceil(width * scale));
                h = Math.max(1, Math.ceil(height * scale));
                localCenterX = rect.left + width / 2;
                localCenterY = rect.top + height / 2;
                if (exportImages) {
                    tempDoc.width = w;
                    tempDoc.height = h;
                    // Apply Export Scale
                    if (scale !== 1) {
                        pasted.scaleX = scale;
                        pasted.scaleY = scale;
                    }
                    // Center in the Temp Canvas
                    var finalRect = tempDoc.getSelectionRect();
                    var fx = (finalRect.left + finalRect.right) / 2;
                    var fy = (finalRect.top + finalRect.bottom) / 2;
                    tempDoc.moveSelectionBy({
                        x: (w / 2) - fx,
                        y: (h / 2) - fy
                    });
                    tempDoc.exportPNG(imagePath, true, true);
                }
            }
            var offset = ImageUtil.calculateAttachmentOffset(matrix, regPointX, regPointY, transPointX, transPointY, localCenterX, localCenterY);
            return new SpineImage_1.SpineImage(imagePath, w, h, scale, offset.x, offset.y, localCenterX, localCenterY);
        }
        finally {
            try {
                tempDoc.close(false);
            }
            catch (e) { /* ignore */ }
        }
    };
    ImageUtil.exportSymbol = function (imagePath, element, document, scale, exportImages) {
        var item = element.libraryItem;
        // Capture geometric properties BEFORE switching context
        var regPointX = element.x;
        var regPointY = element.y;
        var transPointX = element.transformX;
        var transPointY = element.transformY;
        var matrix = element.matrix;
        // SAFE EXPORT STRATEGY: Duplicate the symbol, clean it up (delete hidden layers), export, then delete duplicate.
        // This avoids modifying the original symbol's layer visibility/locking state and ensures 'selectAll' only grabs what we want.
        var lib = document.library;
        var originalName = item.name;
        // 1. Select and Duplicate
        lib.selectItem(originalName);
        if (!lib.duplicateItem(originalName)) {
            Logger_1.Logger.error("[ImageUtil] Failed to duplicate symbol '".concat(originalName, "' for export."));
            return new SpineImage_1.SpineImage(imagePath, 1, 1, scale, 0, 0);
        }
        // The duplicate is now selected and named "Copy of ..." or similar.
        var duplicateItem = lib.getSelectedItems()[0];
        var tempSymbolName = duplicateItem.name;
        // 2. Edit the Duplicate
        lib.editItem(tempSymbolName);
        var dom = fl.getDocumentDOM();
        var timeline = dom.getTimeline();
        // 3. Clean up Layers (Delete hidden/guide layers)
        // Iterate backwards to avoid index issues when deleting
        for (var i = timeline.layers.length - 1; i >= 0; i--) {
            var layer = timeline.layers[i];
            if (layer.layerType === 'guide' || !layer.visible) {
                timeline.deleteLayer(i);
            }
            else {
                // Ensure remaining visible layers are unlocked
                layer.locked = false;
            }
        }
        // 4. Select All (Now safe because only visible renderable content remains)
        dom.selectAll();
        // Calculate offsets
        var rect;
        if (dom.selection.length > 0) {
            rect = dom.getSelectionRect();
        }
        else {
            rect = { left: 0, top: 0, right: 0, bottom: 0 };
        }
        var width = rect.right - rect.left;
        var height = rect.bottom - rect.top;
        var w = Math.max(1, Math.ceil(width * scale));
        var h = Math.max(1, Math.ceil(height * scale));
        var localCenterX = rect.left + width / 2;
        var localCenterY = rect.top + height / 2;
        var offset = ImageUtil.calculateAttachmentOffset(matrix, regPointX, regPointY, transPointX, transPointY, localCenterX, localCenterY);
        if (exportImages && dom.selection.length > 0) {
            var copySuccess = false;
            // Retry loop
            for (var attempt = 0; attempt < 3; attempt++) {
                try {
                    if (attempt > 0)
                        ImageUtil.sleep(50);
                    dom.clipCopy();
                    copySuccess = true;
                    break;
                }
                catch (e) {
                    Logger_1.Logger.warning("[ImageUtil] exportSymbol: clipCopy failed (attempt ".concat(attempt + 1, "/3): ").concat(e));
                    ImageUtil.clearClipboard();
                    // Select again just in case
                    dom.selectAll();
                }
            }
            if (copySuccess) {
                var tempDoc = fl.createDocument();
                try {
                    tempDoc.width = w;
                    tempDoc.height = h;
                    tempDoc.clipPaste();
                    if (tempDoc.selection.length > 0) {
                        tempDoc.selectAll();
                        tempDoc.group();
                        var group = tempDoc.selection[0];
                        group.scaleX *= scale;
                        group.scaleY *= scale;
                        var pRect = tempDoc.getSelectionRect();
                        var pCx = (pRect.left + pRect.right) / 2;
                        var pCy = (pRect.top + pRect.bottom) / 2;
                        tempDoc.moveSelectionBy({
                            x: (tempDoc.width / 2) - pCx,
                            y: (tempDoc.height / 2) - pCy
                        });
                    }
                    tempDoc.exportPNG(imagePath, true, true);
                }
                finally {
                    try {
                        tempDoc.close(false);
                    }
                    catch (e) { }
                }
            }
        }
        // 5. Cleanup
        dom.exitEditMode();
        lib.deleteItem(tempSymbolName);
        return new SpineImage_1.SpineImage(imagePath, w, h, scale, offset.x, offset.y, localCenterX, localCenterY);
    };
    /**
     * Calculates the Attachment Offset using the "Smart Pivot" algorithm.
     * Uses explicit matrix inversion to map the World Space offset vector back into the
     * Bone's Local Space.
     */
    ImageUtil.calculateAttachmentOffset = function (matrix, regPointX, regPointY, transPointX, transPointY, localCenterX, localCenterY, debugName) {
        // Assumption Check:
        // Animate Registration Point (regPointX, regPointY) is the (0,0) of the symbol data.
        // Animate Transformation Point (transPointX, transPointY) is the visual pivot.
        // Spine Bone origin is AT the Transformation Point.
        // We need the offset from Bone Origin to Image Center.
        // 1. Vector from Bone Origin (Trans Point) to Reg Point (in Parent Space)
        var dx = regPointX - transPointX;
        var dy = regPointY - transPointY;
        Logger_1.Logger.trace("[OFFSET] '".concat(debugName || 'anon', "' BoneToReg Vector: (").concat(dx.toFixed(2), ", ").concat(dy.toFixed(2), ")"));
        // 2. Inverse Matrix Calculation
        var a = matrix.a;
        var b = matrix.b;
        var c = matrix.c;
        var d = matrix.d;
        var det = a * d - b * c;
        if (Math.abs(det) < 0.000001) {
            Logger_1.Logger.warning("[OFFSET] Singular matrix for ".concat(debugName || 'unknown', ". Det=").concat(det, ". Using center."));
            return { x: localCenterX, y: localCenterY };
        }
        var invDet = 1.0 / det;
        // Apply Inverse Matrix to map the Parent-Space vector (dx, dy) into Local-Space
        // Assumption: localRx, localRy is the distance from the pivot to the (0,0) of the image data in image-local coordinates.
        var localRx = (d * dx - c * dy) * invDet;
        var localRy = (-b * dx + a * dy) * invDet;
        Logger_1.Logger.trace("[OFFSET] '".concat(debugName || 'anon', "' Local Offset: (").concat(localRx.toFixed(2), ", ").concat(localRy.toFixed(2), ") (invDet=").concat(invDet.toFixed(6), ")"));
        // 3. Add Image Center Offset
        // Attachment (0,0) is at image center. 
        // We add localCenterX/Y because the image data (0,0) is usually top-left or specified by library.
        var finalX = localRx + localCenterX;
        var finalY = localRy + localCenterY;
        Logger_1.Logger.trace("[OFFSET] '".concat(debugName || 'anon', "' Final Spine Offset: (").concat(finalX.toFixed(2), ", ").concat(finalY.toFixed(2), ") (localCenter: ").concat(localCenterX, ", ").concat(localCenterY, ")"));
        return { x: finalX, y: finalY };
    };
    // Helper for legacy/other paths
    ImageUtil.exportSelectionOnly = function (imagePath, dom, scale, exportImages, anchorX, anchorY, element, options) {
        dom.selectNone();
        element.selected = true;
        var rect = dom.getSelectionRect();
        var width = rect.right - rect.left;
        var height = rect.bottom - rect.top;
        var w = Math.max(1, Math.ceil(width * scale));
        var h = Math.max(1, Math.ceil(height * scale));
        var localCenterX = rect.left + width / 2;
        var localCenterY = rect.top + height / 2;
        var regRelativeAnchorX = anchorX + rect.left;
        var regRelativeAnchorY = anchorY + rect.top;
        var offsetX = localCenterX - regRelativeAnchorX;
        var offsetY = localCenterY - regRelativeAnchorY;
        if (exportImages) {
            dom.clipCopy();
            var tempDoc = fl.createDocument();
            tempDoc.width = w;
            tempDoc.height = h;
            tempDoc.clipPaste();
            if (tempDoc.selection.length > 0) {
                tempDoc.selectAll();
                tempDoc.group();
                var group = tempDoc.selection[0];
                group.scaleX *= scale;
                group.scaleY *= scale;
                var pRect = tempDoc.getSelectionRect();
                tempDoc.moveSelectionBy({
                    x: (tempDoc.width / 2) - (pRect.left + pRect.right) / 2,
                    y: (tempDoc.height / 2) - (pRect.top + pRect.bottom) / 2
                });
            }
            tempDoc.exportPNG(imagePath, true, true);
            tempDoc.close(false);
        }
        return new SpineImage_1.SpineImage(imagePath, w, h, scale, offsetX, offsetY, localCenterX, localCenterY);
    };
    ImageUtil.exportInstanceContents = function (imagePath, dom, scale, exportImages, anchorX, anchorY) {
        var rect = dom.getSelectionRect();
        var width = rect.right - rect.left;
        var height = rect.bottom - rect.top;
        var w = Math.max(1, Math.ceil(width * scale));
        var h = Math.max(1, Math.ceil(height * scale));
        var centerX = rect.left + width / 2;
        var centerY = rect.top + height / 2;
        var offsetX = centerX - (anchorX + rect.left);
        var offsetY = centerY - (anchorY + rect.top);
        return new SpineImage_1.SpineImage(imagePath, w, h, scale, offsetX, offsetY, centerX, centerY);
    };
    return ImageUtil;
}());
exports.ImageUtil = ImageUtil;


/***/ }),

/***/ "./source/utils/JsonEncoder.ts":
/*!*************************************!*\
  !*** ./source/utils/JsonEncoder.ts ***!
  \*************************************/
/***/ (function(__unused_webpack_module, exports) {



exports.JsonEncoder = void 0;
var JsonEncoder = /** @class */ (function () {
    function JsonEncoder() {
    }
    JsonEncoder.stringifyArray = function (object, depth) {
        if (depth === void 0) { depth = 25; }
        var result = '';
        for (var index = 0; index < object.length; index++) {
            if (result.length > 0)
                result += ',';
            result += JsonEncoder.stringify(object[index], depth);
        }
        return '[' + result + ']';
    };
    JsonEncoder.stringifyObject = function (object, depth) {
        if (depth === void 0) { depth = 25; }
        var result = '';
        for (var key in object) {
            if (result.length > 0)
                result += ',';
            result += '"' + key + '":' + JsonEncoder.stringify(object[key], depth);
        }
        return '{' + result + '}';
    };
    JsonEncoder.stringify = function (object, depth) {
        if (depth === void 0) { depth = 25; }
        if (object == null || typeof (object) === 'function') {
            return 'null';
        }
        if (typeof (object) === 'object' && depth > 0) {
            if (object.constructor !== Array) {
                return JsonEncoder.stringifyObject(object, depth - 1);
            }
            else {
                return JsonEncoder.stringifyArray(object, depth - 1);
            }
        }
        if (typeof (object) === 'string') {
            return '"' + object.replace('"', '\\"') + '"';
        }
        if (typeof (object) === 'number') {
            return object.toString();
        }
        return 'null';
    };
    return JsonEncoder;
}());
exports.JsonEncoder = JsonEncoder;


/***/ }),

/***/ "./source/utils/JsonFormatUtil.ts":
/*!****************************************!*\
  !*** ./source/utils/JsonFormatUtil.ts ***!
  \****************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {



exports.JsonFormatUtil = void 0;
var JsonUtil_1 = __webpack_require__(/*! ./JsonUtil */ "./source/utils/JsonUtil.ts");
var JsonFormatUtil = /** @class */ (function () {
    function JsonFormatUtil() {
    }
    JsonFormatUtil.cleanObject = function (source) {
        var result = {};
        /**
         * Removing undefined, incorrect or non-essential properties
         * to reduce output JSON file size.
         */
        for (var key in source) {
            var value = source[key];
            if (value === null && key === 'name') {
                result[key] = null;
                continue;
            }
            if (JsonUtil_1.JsonUtil.validNumber(value)) {
                if (key === 'shearX' || key === 'shearY' || key === 'rotation') {
                    if (value !== 0) {
                        result[key] = value;
                    }
                    continue;
                }
                if (key === 'scaleX' || key === 'scaleY') {
                    if (value !== 1) {
                        result[key] = value;
                    }
                    continue;
                }
                result[key] = value;
            }
            if (JsonUtil_1.JsonUtil.validArray(value)) {
                if (JsonUtil_1.JsonUtil.nonEmptyArray(value)) {
                    result[key] = value;
                }
                continue;
            }
            if (JsonUtil_1.JsonUtil.validObject(value)) {
                if (JsonUtil_1.JsonUtil.nonEmptyObject(value)) {
                    result[key] = value;
                }
                continue;
            }
            if (JsonUtil_1.JsonUtil.validBoolean(value)) {
                result[key] = value;
            }
            if (JsonUtil_1.JsonUtil.validString(value)) {
                result[key] = value;
            }
        }
        return result;
    };
    return JsonFormatUtil;
}());
exports.JsonFormatUtil = JsonFormatUtil;


/***/ }),

/***/ "./source/utils/JsonUtil.ts":
/*!**********************************!*\
  !*** ./source/utils/JsonUtil.ts ***!
  \**********************************/
/***/ (function(__unused_webpack_module, exports) {



exports.JsonUtil = void 0;
var JsonUtil = /** @class */ (function () {
    function JsonUtil() {
    }
    JsonUtil.validNumber = function (source) {
        return (typeof (source) === 'number') && (isNaN(source) === false);
    };
    JsonUtil.validString = function (source) {
        return (typeof (source) === 'string') && (source.length !== 0);
    };
    JsonUtil.validBoolean = function (source) {
        return (typeof (source) === 'boolean');
    };
    JsonUtil.validArray = function (source) {
        return (typeof (source) === 'object') && (source != null) && (source.constructor === Array);
    };
    JsonUtil.nonEmptyArray = function (source) {
        return (source.length !== 0);
    };
    JsonUtil.validObject = function (source) {
        return (typeof (source) === 'object') && (source != null);
    };
    JsonUtil.nonEmptyObject = function (source) {
        for (var key in source) {
            if (key != null && key !== '') {
                return true;
            }
        }
        return false;
    };
    return JsonUtil;
}());
exports.JsonUtil = JsonUtil;


/***/ }),

/***/ "./source/utils/LayerMaskUtil.ts":
/*!***************************************!*\
  !*** ./source/utils/LayerMaskUtil.ts ***!
  \***************************************/
/***/ (function(__unused_webpack_module, exports) {



exports.LayerMaskUtil = void 0;
var LayerMaskUtil = /** @class */ (function () {
    function LayerMaskUtil() {
    }
    LayerMaskUtil.extractTargetMask = function (layers, targetIdx) {
        for (var layerIdx = targetIdx - 1; layerIdx >= 0; layerIdx--) {
            var layer = layers[layerIdx];
            if (layer.layerType === 'mask') {
                return layer;
            }
        }
        return null;
    };
    return LayerMaskUtil;
}());
exports.LayerMaskUtil = LayerMaskUtil;


/***/ }),

/***/ "./source/utils/LibraryUtil.ts":
/*!*************************************!*\
  !*** ./source/utils/LibraryUtil.ts ***!
  \*************************************/
/***/ (function(__unused_webpack_module, exports) {



exports.LibraryUtil = void 0;
var LibraryUtil = /** @class */ (function () {
    function LibraryUtil() {
    }
    LibraryUtil.isPrimitiveLibraryItem = function (libraryItem, config) {
        var bitmapsCount = 0;
        var shapesCount = 0;
        /**
         * Detecting, if the provided library item (MovieClip or Graphics) is simple enough
         * to be exported as a single image, and to reduce amount of slots.
         *
         * Requirements:
         * - only normal layers;
         * - only one frame on each layer;
         * - only bitmaps or shapes.
         */
        if (libraryItem.itemType !== 'movie clip' && libraryItem.itemType !== 'graphic') {
            return false;
        }
        for (var _i = 0, _a = libraryItem.timeline.layers; _i < _a.length; _i++) {
            var layer = _a[_i];
            var frame = layer.frames[0];
            if (layer.frames.length !== 1 || layer.layerType !== 'normal') {
                return false;
            }
            for (var _b = 0, _c = frame.elements; _b < _c.length; _b++) {
                var element = _c[_b];
                if (element.elementType === 'instance') {
                    if (element.instanceType === 'bitmap') {
                        bitmapsCount++;
                    }
                    else {
                        return false;
                    }
                }
                else if (element.elementType === 'shape') {
                    shapesCount++;
                }
                else if (element.elementType === 'text') {
                    if (config.exportTextAsShapes) {
                        shapesCount++;
                    }
                    else {
                        return false;
                    }
                }
                else {
                    return false;
                }
            }
        }
        if (bitmapsCount > 0 && shapesCount > 0) {
            return (config.mergeImages && config.mergeShapes);
        }
        if (bitmapsCount === 0 && shapesCount !== 0) {
            return config.mergeShapes;
        }
        if (bitmapsCount !== 0 && shapesCount === 0) {
            return config.mergeImages;
        }
        return true;
    };
    return LibraryUtil;
}());
exports.LibraryUtil = LibraryUtil;


/***/ }),

/***/ "./source/utils/NumberUtil.ts":
/*!************************************!*\
  !*** ./source/utils/NumberUtil.ts ***!
  \************************************/
/***/ (function(__unused_webpack_module, exports) {



exports.NumberUtil = void 0;
var NumberUtil = /** @class */ (function () {
    function NumberUtil() {
    }
    NumberUtil.equals = function (first, second, precision) {
        if (precision === void 0) { precision = 0.001; }
        return Math.abs(first - second) < precision;
    };
    NumberUtil.sign = function (value) {
        if (value > 0)
            return 1;
        if (value < 0)
            return -1;
        return 0;
    };
    NumberUtil.clamp = function (value) {
        return (value < 1) ? ((value > 0) ? value : 0) : 1;
    };
    NumberUtil.prepend = function (content, value, length) {
        while (content.length < length) {
            content = value + content;
        }
        return content;
    };
    NumberUtil.color = function (value) {
        var color = Math.floor(value * 255).toString(16);
        return NumberUtil.prepend(color, 0, 2);
    };
    NumberUtil.deltaAngle = function (current, target) {
        var delta = target - current;
        while (delta <= -180)
            delta += 360;
        while (delta > 180)
            delta -= 360;
        return delta;
    };
    return NumberUtil;
}());
exports.NumberUtil = NumberUtil;


/***/ }),

/***/ "./source/utils/PathUtil.ts":
/*!**********************************!*\
  !*** ./source/utils/PathUtil.ts ***!
  \**********************************/
/***/ (function(__unused_webpack_module, exports) {



exports.PathUtil = void 0;
var PathUtil = /** @class */ (function () {
    function PathUtil() {
    }
    PathUtil.parentPath = function (path) {
        var index = path.lastIndexOf('/');
        if (index !== -1) {
            return path.slice(0, index);
        }
        return '';
    };
    PathUtil.removeTrailingSlash = function (path) {
        while (path.length > 0 && path[path.length - 1] === '/') {
            path = path.slice(0, path.length - 1);
        }
        return path;
    };
    PathUtil.removeLeadingSlash = function (path) {
        while (path.length > 0 && path[0] === '/') {
            path = path.slice(1);
        }
        return path;
    };
    PathUtil.joinPath = function () {
        var paths = [];
        for (var _i = 0; _i < arguments.length; _i++) {
            paths[_i] = arguments[_i];
        }
        var result = '';
        for (var _a = 0, paths_1 = paths; _a < paths_1.length; _a++) {
            var path = paths_1[_a];
            if (result.length > 0) {
                result = PathUtil.removeTrailingSlash(result) + '/' + PathUtil.removeLeadingSlash(path);
            }
            else {
                result = path;
            }
        }
        return result;
    };
    PathUtil.fileBaseName = function (path) {
        var fileName = PathUtil.fileName(path);
        var index = fileName.lastIndexOf('.');
        if (index !== -1) {
            return fileName.slice(0, index);
        }
        return fileName;
    };
    PathUtil.fileName = function (path) {
        var index = path.lastIndexOf('/');
        if (index !== -1) {
            return path.slice(index + 1);
        }
        return path;
    };
    return PathUtil;
}());
exports.PathUtil = PathUtil;


/***/ }),

/***/ "./source/utils/ShapeUtil.ts":
/*!***********************************!*\
  !*** ./source/utils/ShapeUtil.ts ***!
  \***********************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {



exports.ShapeUtil = void 0;
var Logger_1 = __webpack_require__(/*! ../logger/Logger */ "./source/logger/Logger.ts");
var DEFAULT_CURVE_SEGMENTS = 20;
var ShapeUtil = /** @class */ (function () {
    function ShapeUtil() {
    }
    ShapeUtil.extractVertices = function (instance, segmentsPerCurve, matrix, controlOffset) {
        if (segmentsPerCurve === void 0) { segmentsPerCurve = DEFAULT_CURVE_SEGMENTS; }
        if (matrix === void 0) { matrix = null; }
        if (controlOffset === void 0) { controlOffset = null; }
        if (instance.elementType !== 'shape') {
            return null;
        }
        if (instance.contours && instance.contours.length > 0) {
            return ShapeUtil.extractVerticesFromContours(instance, segmentsPerCurve, matrix, controlOffset);
        }
        return ShapeUtil.extractVerticesFromEdges(instance, segmentsPerCurve, matrix);
    };
    /**
     * Transforms a point by a 2D affine matrix.
     */
    ShapeUtil.transformPoint = function (x, y, matrix) {
        if (!matrix)
            return { x: x, y: y };
        return {
            x: x * matrix.a + y * matrix.c + matrix.tx,
            y: x * matrix.b + y * matrix.d + matrix.ty
        };
    };
    /**
     * Multiplies two matrices: m1 * m2 (apply m1 then m2)
     */
    ShapeUtil.multiplyMatrices = function (m1, m2) {
        return {
            a: m1.a * m2.a + m1.b * m2.c,
            b: m1.a * m2.b + m1.b * m2.d,
            c: m1.c * m2.a + m1.d * m2.c,
            d: m1.c * m2.b + m1.d * m2.d,
            tx: m1.tx * m2.a + m1.ty * m2.c + m2.tx,
            ty: m1.tx * m2.b + m1.ty * m2.d + m2.ty
        };
    };
    ShapeUtil.extractVerticesFromContours = function (instance, segmentsPerCurve, matrix, controlOffset) {
        if (controlOffset === void 0) { controlOffset = null; }
        var vertices = [];
        var totalEdges = 0;
        if (instance.contours.length > 1) {
            // Shape has multiple contours
        }
        if (matrix) {
            // Matrix available
        }
        for (var i = 0; i < instance.contours.length; i++) {
            var contour = instance.contours[i];
            if (contour.interior) {
                continue;
            }
            var startHalfEdge = contour.getHalfEdge();
            if (startHalfEdge == null) {
                continue;
            }
            // Push the very first vertex of the contour
            var firstVertex = startHalfEdge.getVertex();
            var pStart = ShapeUtil.transformPoint(firstVertex.x, firstVertex.y, matrix);
            vertices.push(pStart.x, -pStart.y);
            var halfEdge = startHalfEdge;
            var safetyCounter = 0;
            var MAX_EDGES = 5000;
            var visitedEdges = {};
            do {
                if (safetyCounter++ > MAX_EDGES) {
                    Logger_1.Logger.warning("Contour " + i + " exceeded MAX_EDGES. Breaking loop.");
                    break;
                }
                var edge = halfEdge.getEdge();
                var rawStart = halfEdge.getVertex();
                var nextHalfEdge = halfEdge.getNext();
                if (!nextHalfEdge)
                    break;
                var rawEnd = nextHalfEdge.getVertex();
                // Loop detection
                var edgeKey = rawStart.x.toFixed(2) + "_" + rawStart.y.toFixed(2) + "_" + rawEnd.x.toFixed(2) + "_" + rawEnd.y.toFixed(2);
                if (visitedEdges[edgeKey])
                    break;
                visitedEdges[edgeKey] = true;
                var p0 = ShapeUtil.transformPoint(rawStart.x, rawStart.y, matrix);
                var p3 = ShapeUtil.transformPoint(rawEnd.x, rawEnd.y, matrix);
                // Check for sequence continuity
                if (vertices.length >= 2) {
                    var lastX = vertices[vertices.length - 2];
                    var lastY = -vertices[vertices.length - 1];
                    var distSq = Math.pow(lastX - p0.x, 2) + Math.pow(lastY - p0.y, 2);
                    if (distSq > 0.01) {
                        Logger_1.Logger.warning("Contour GAP at Edge " + totalEdges + ": [" + lastX.toFixed(2) + "," + lastY.toFixed(2) + "] -> [" + p0.x.toFixed(2) + "," + p0.y.toFixed(2) + "]");
                    }
                }
                var canonicalHalfEdge = edge.getHalfEdge(0);
                var canonicalVertex = canonicalHalfEdge ? canonicalHalfEdge.getVertex() : null;
                var isReverse = canonicalVertex &&
                    (Math.abs(canonicalVertex.x - rawStart.x) > 0.01 || Math.abs(canonicalVertex.y - rawStart.y) > 0.01);
                if (edge.isLine) {
                    if (halfEdge.getNext() !== startHalfEdge) {
                        vertices.push(p3.x, -p3.y);
                    }
                }
                else {
                    var rawControl0 = edge.getControl(0);
                    if (controlOffset) {
                        rawControl0.x += controlOffset.x;
                        rawControl0.y += controlOffset.y;
                    }
                    var rawControl1 = null;
                    try {
                        rawControl1 = edge.getControl(1);
                        if (rawControl1 && controlOffset) {
                            rawControl1.x += controlOffset.x;
                            rawControl1.y += controlOffset.y;
                        }
                    }
                    catch (e) { }
                    var p1 = ShapeUtil.transformPoint(rawControl0.x, rawControl0.y, matrix);
                    if (rawControl1) {
                        var p2 = ShapeUtil.transformPoint(rawControl1.x, rawControl1.y, matrix);
                        if (isReverse) {
                            // Reverse traversal: p0 -> p3. Controls are p2 (near p0) and p1 (near p3).
                            var validP2 = ShapeUtil.clampControlPoint(p0, p3, p2);
                            var validP1 = ShapeUtil.clampControlPoint(p3, p0, p1);
                            ShapeUtil.tessellateCubicBezierPart(vertices, p0, validP2, validP1, p3, segmentsPerCurve, halfEdge.getNext() === startHalfEdge);
                        }
                        else {
                            // Forward traversal: p0 -> p3. Controls are p1 (near p0) and p2 (near p3).
                            var validP1 = ShapeUtil.clampControlPoint(p0, p3, p1);
                            var validP2 = ShapeUtil.clampControlPoint(p3, p0, p2);
                            ShapeUtil.tessellateCubicBezierPart(vertices, p0, validP1, validP2, p3, segmentsPerCurve, halfEdge.getNext() === startHalfEdge);
                        }
                    }
                    else {
                        var validP1 = ShapeUtil.clampControlPoint(p0, p3, p1);
                        ShapeUtil.tessellateQuadraticBezierPart(vertices, p0, validP1, p3, segmentsPerCurve, halfEdge.getNext() === startHalfEdge);
                    }
                }
                halfEdge = nextHalfEdge;
                totalEdges++;
            } while (halfEdge !== startHalfEdge && halfEdge != null);
        }
        return vertices;
    };
    ShapeUtil.clampControlPoint = function (pAnchor, pOpposite, pControl) {
        var dx = pOpposite.x - pAnchor.x;
        var dy = pOpposite.y - pAnchor.y;
        var lenSq = dx * dx + dy * dy;
        if (lenSq < 0.0001)
            return pAnchor;
        var cx = pControl.x - pAnchor.x;
        var cy = pControl.y - pAnchor.y;
        // Project onto edge vector: t = (c . d) / (d . d)
        var t = (cx * dx + cy * dy) / lenSq;
        if (t < 0) {
            // Pulls backward
            return { x: pAnchor.x, y: pAnchor.y };
        }
        if (t > 1) {
            // Overshoots
            return { x: pOpposite.x, y: pOpposite.y };
        }
        return pControl;
    };
    ShapeUtil.extractVerticesFromEdges = function (instance, segmentsPerCurve, matrix) {
        var vertices = [];
        for (var i = 0; i < instance.edges.length; i++) {
            var edge = instance.edges[i];
            var halfEdge = edge.getHalfEdge(0);
            if (!halfEdge)
                continue;
            var rawStart = halfEdge.getVertex();
            var nextHalfEdge = halfEdge.getOppositeHalfEdge();
            if (!nextHalfEdge) {
                var p = ShapeUtil.transformPoint(rawStart.x, rawStart.y, matrix);
                vertices.push(p.x, -p.y);
                continue;
            }
            var rawEnd = nextHalfEdge.getVertex();
            var p0 = ShapeUtil.transformPoint(rawStart.x, rawStart.y, matrix);
            var p3 = ShapeUtil.transformPoint(rawEnd.x, rawEnd.y, matrix);
            if (edge.isLine) {
                vertices.push(p0.x, -p0.y);
            }
            else {
                var rawControl0 = edge.getControl(0);
                var p1 = ShapeUtil.transformPoint(rawControl0.x, rawControl0.y, matrix);
                ShapeUtil.tessellateQuadraticBezierPart(vertices, p0, p1, p3, segmentsPerCurve, false);
            }
        }
        return vertices;
    };
    ShapeUtil.tessellateQuadraticBezierPart = function (vertices, p0, p1, p2, segments, isLast) {
        // Start point p0 is already pushed. We push from t = 1/seg to 1.0 (if not last)
        var endLimit = isLast ? segments : segments + 1;
        for (var i = 1; i < endLimit; i++) {
            var t = i / segments;
            var mt = 1 - t;
            var x = mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x;
            var y = mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y;
            // Avoid duplicate of start if it's the very last point
            if (isLast && i === segments)
                continue;
            vertices.push(x, -y);
        }
    };
    ShapeUtil.tessellateCubicBezierPart = function (vertices, p0, p1, p2, p3, segments, isLast) {
        var endLimit = isLast ? segments : segments + 1;
        for (var i = 1; i < endLimit; i++) {
            var t = i / segments;
            var mt = 1 - t;
            var mt2 = mt * mt;
            var mt3 = mt2 * mt;
            var t2 = t * t;
            var t3 = t2 * t;
            var x = mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x;
            var y = mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y;
            if (isLast && i === segments)
                continue;
            vertices.push(x, -y);
        }
    };
    return ShapeUtil;
}());
exports.ShapeUtil = ShapeUtil;


/***/ }),

/***/ "./source/utils/StringUtil.ts":
/*!************************************!*\
  !*** ./source/utils/StringUtil.ts ***!
  \************************************/
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {



exports.StringUtil = void 0;
var Logger_1 = __webpack_require__(/*! ../logger/Logger */ "./source/logger/Logger.ts");
var StringUtil = /** @class */ (function () {
    function StringUtil() {
    }
    StringUtil.simplify = function (value) {
        if (!value)
            return 'unnamed';
        // Lowercase first
        var result = value.toLowerCase();
        var original = result;
        // Manual replacement of common illegal characters to be safe in old JSFL
        var searchChars = ["/", "\\", ".", "-", " ", "\t", "\n", "\r", "\xa0"];
        for (var i = 0; i < searchChars.length; i++) {
            var char = searchChars[i];
            while (result.indexOf(char) !== -1) {
                result = result.replace(char, "_");
            }
        }
        // AGGRESSIVE SANITIZATION: Replace anything that is not a-z, 0-9, or _
        var cleaned = "";
        for (var i = 0; i < result.length; i++) {
            var char = result.charAt(i);
            var code = result.charCodeAt(i);
            // Allow a-z (97-122), 0-9 (48-57), and _ (95)
            if ((code >= 97 && code <= 122) || (code >= 48 && code <= 57) || code === 95) {
                cleaned += char;
            }
            else {
                // Log the character code to understand what we are replacing
                Logger_1.Logger.trace("[Naming] Sanitize: Character '".concat(char, "' (code: 0x").concat(code.toString(16), ") in '").concat(original, "' replaced with '_'"));
                cleaned += "_";
            }
        }
        result = cleaned;
        // Collapse multiple underscores
        while (result.indexOf("__") !== -1) {
            result = result.replace("__", "_");
        }
        // Trim leading/trailing underscores
        if (result.charAt(0) === "_")
            result = result.substring(1);
        if (result.charAt(result.length - 1) === "_")
            result = result.substring(0, result.length - 1);
        if (result === "")
            return "unnamed";
        return result;
    };
    return StringUtil;
}());
exports.StringUtil = StringUtil;


/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Check if module exists (development only)
/******/ 		if (__webpack_modules__[moduleId] === undefined) {
/******/ 			var e = new Error("Cannot find module '" + moduleId + "'");
/******/ 			e.code = 'MODULE_NOT_FOUND';
/******/ 			throw e;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry needs to be wrapped in an IIFE because it needs to be isolated against other modules in the chunk.
!function() {
var exports = __webpack_exports__;
/*!*************************!*\
  !*** ./source/index.ts ***!
  \*************************/
var __webpack_unused_export__;

__webpack_unused_export__ = ({ value: true });
var Converter_1 = __webpack_require__(/*! ./core/Converter */ "./source/core/Converter.ts");
var Logger_1 = __webpack_require__(/*! ./logger/Logger */ "./source/logger/Logger.ts");
var SpineFormatV4_2_00_1 = __webpack_require__(/*! ./spine/formats/SpineFormatV4_2_00 */ "./source/spine/formats/SpineFormatV4_2_00.ts");
var SpineSkeletonHelper_1 = __webpack_require__(/*! ./spine/SpineSkeletonHelper */ "./source/spine/SpineSkeletonHelper.ts");
var PathUtil_1 = __webpack_require__(/*! ./utils/PathUtil */ "./source/utils/PathUtil.ts");
//-----------------------------------
fl.showIdleMessage(false);
var config = {
    outputFormat: new SpineFormatV4_2_00_1.SpineFormatV4_2_00(),
    imagesExportPath: './images/',
    appendSkeletonToImagesPath: false,
    mergeSkeletons: false,
    mergeSkeletonsRootBone: false,
    transformRootBone: false,
    simplifyBonesAndSlots: false,
    exportFrameCommentsAsEvents: true,
    exportShapes: true,
    exportTextAsShapes: true,
    shapeExportScale: 2,
    mergeShapes: true,
    exportImages: true,
    mergeImages: true
};
var getSelectionPaths = function (doc) {
    var paths = [];
    var timeline = doc.getTimeline();
    // Default to frame 0 if undefined, though it should be defined
    var currentFrame = timeline.currentFrame || 0;
    var layers = timeline.layers;
    for (var l = 0; l < layers.length; l++) {
        var layer = layers[l];
        // Get the frame object active at the current playhead
        // layers[i].frames[j] returns the frame object starting at or before j
        var frame = layer.frames[currentFrame];
        if (!frame)
            continue;
        // Check elements on this frame
        if (frame.elements) {
            for (var e = 0; e < frame.elements.length; e++) {
                if (frame.elements[e].selected) {
                    paths.push({
                        layerIndex: l,
                        frameIndex: currentFrame,
                        elementIndex: e
                    });
                }
            }
        }
    }
    return { paths: paths, currentFrame: currentFrame };
};
var applySelectionPaths = function (doc, data) {
    var timeline = doc.getTimeline();
    // 1. Restore Playhead
    timeline.currentFrame = data.currentFrame;
    // 2. Clear current selection to be safe
    doc.selectNone();
    var layers = timeline.layers;
    var newSelection = [];
    // 3. Find and select elements
    for (var _i = 0, _a = data.paths; _i < _a.length; _i++) {
        var path = _a[_i];
        if (path.layerIndex >= layers.length)
            continue;
        var layer = layers[path.layerIndex];
        var frame = layer.frames[data.currentFrame];
        // Ensure we are targeting the same relative element index
        if (frame && frame.elements && path.elementIndex < frame.elements.length) {
            var el = frame.elements[path.elementIndex];
            el.selected = true; // Mark as selected
            newSelection.push(el);
        }
    }
    // 4. Update document selection (JSFL often requires setting the array explicitly)
    if (newSelection.length > 0) {
        doc.selection = newSelection;
    }
};
var run = function () {
    var originalDoc = fl.getDocumentDOM();
    if (!originalDoc) {
        Logger_1.Logger.error("No document open.");
        return;
    }
    if (!originalDoc.pathURI) {
        Logger_1.Logger.error("Please save the document before exporting.");
        return;
    }
    // --- CAPTURE STATE FROM ORIGINAL DOC ---
    var selectionData = getSelectionPaths(originalDoc);
    if (selectionData.paths.length === 0) {
        Logger_1.Logger.warning("No elements selected. Please select the Symbol(s) you wish to export.");
        // We could return here, but maybe the user wants to run on 'nothing' (though unlikely)?
        // The original logic would have run with empty selection and done nothing.
        // Let's return to be helpful.
        return;
    }
    Logger_1.Logger.trace("Selected ".concat(selectionData.paths.length, " items for export."));
    var originalPath = originalDoc.pathURI;
    var workingDir = PathUtil_1.PathUtil.parentPath(originalPath);
    var baseName = PathUtil_1.PathUtil.fileBaseName(originalPath);
    var tempPath = PathUtil_1.PathUtil.joinPath(workingDir, baseName + "_export_tmp.fla");
    // Check if we are already in the temp file (prevent infinite recursion if user runs script on temp)
    if (originalPath.indexOf("_export_tmp.fla") !== -1) {
        Logger_1.Logger.warning("Running directly on temporary export file.");
        processDocument(originalDoc);
        return;
    }
    // Clean up any stale temp file
    if (FLfile.exists(tempPath)) {
        FLfile.remove(tempPath);
    }
    // Copy the current file to temp
    if (!FLfile.copy(originalPath, tempPath)) {
        Logger_1.Logger.error("Failed to create temporary export file.");
        return;
    }
    var tempDoc = fl.openDocument(tempPath);
    if (!tempDoc) {
        Logger_1.Logger.error("Failed to open temporary export file.");
        return;
    }
    // Disable UI updates during heavy export process to prevent crashes and race conditions
    var wasLivePreview = tempDoc.livePreview;
    tempDoc.livePreview = false;
    try {
        // --- RESTORE STATE IN TEMP DOC ---
        applySelectionPaths(tempDoc, selectionData);
        processDocument(tempDoc);
    }
    catch (e) {
        Logger_1.Logger.error("An error occurred during conversion: ".concat(e));
    }
    finally {
        // Restore UI updates
        tempDoc.livePreview = wasLivePreview;
        // Close temp doc without saving changes
        tempDoc.close(false);
        // Remove temp file
        if (FLfile.exists(tempPath)) {
            FLfile.remove(tempPath);
        }
        // Restore focus to original document
        fl.openDocument(originalPath);
    }
};
var processDocument = function (document) {
    var converter = new Converter_1.Converter(document, config);
    var result = converter.convertSelection();
    for (var _i = 0, result_1 = result; _i < result_1.length; _i++) {
        var skeleton = result_1[_i];
        Logger_1.Logger.trace('Exporting skeleton: ' + skeleton.name + '...');
        if (config.simplifyBonesAndSlots) {
            SpineSkeletonHelper_1.SpineSkeletonHelper.simplifySkeletonNames(skeleton);
        }
        if (skeleton.bones.length > 0) {
            var skeletonPath = converter.resolveWorkingPath(skeleton.name + '.json');
            FLfile.write(skeletonPath, skeleton.convert(config.outputFormat));
            Logger_1.Logger.trace('Skeleton export completed.');
        }
        else {
            Logger_1.Logger.error('Nothing to export.');
        }
    }
};
run();
//-----------------------------------
Logger_1.Logger.flush();

}();
/******/ })()
;