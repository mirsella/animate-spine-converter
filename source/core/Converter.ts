import { Logger } from '../logger/Logger';
import { SpineClippingAttachment } from '../spine/attachment/SpineClippingAttachment';
import { SpineRegionAttachment } from '../spine/attachment/SpineRegionAttachment';
import { SpineAnimationHelper } from '../spine/SpineAnimationHelper';
import { SpineImage } from '../spine/SpineImage';
import { SpineSkeleton } from '../spine/SpineSkeleton';
import { SpineTransformMatrix } from '../spine/transform/SpineTransformMatrix';
import { SpineAttachmentType } from '../spine/types/SpineAttachmentType';
import { ConvertUtil } from '../utils/ConvertUtil';
import { ImageExportFactory } from '../utils/ImageExportFactory';
import { ImageUtil } from '../utils/ImageUtil';
import { JsonEncoder } from '../utils/JsonEncoder';
import { LayerConvertFactory } from '../utils/LayerConvertFactory';
import { LayerMaskUtil } from '../utils/LayerMaskUtil';
import { LibraryUtil } from '../utils/LibraryUtil';
import { PathUtil } from '../utils/PathUtil';
import { ShapeUtil } from '../utils/ShapeUtil';
import { StringUtil } from '../utils/StringUtil';
import { ConverterConfig } from './ConverterConfig';
import { ConverterContext } from './ConverterContext';
import { ConverterContextGlobal } from './ConverterContextGlobal';
import { ConverterStageType } from './ConverterStageType';

export class Converter {
    private readonly _document:FlashDocument;
    private readonly _workingPath:string;
    private readonly _config:ConverterConfig;

    public constructor(document:FlashDocument, config:ConverterConfig) {
        this._document = document;
        this._workingPath = PathUtil.parentPath(document.pathURI);
        this._config = config;
    }

    private safelyExportImage(context: ConverterContext, exportAction: () => SpineImage): SpineImage {
        // 1. Identify the Symbol definition that contains this element
        // We iterate up the context chain to find the nearest "Symbol Instance" context.
        // This context represents the MovieClip/Graphic that owns the timeline where our shape resides.
        
        let containerItem: FlashItem | null = null;
        let curr = context.parent;
        
        while (curr != null) {
            // Check if this context represents a Symbol Instance
            if (curr.element && curr.element.elementType === 'instance' && curr.element.instanceType === 'symbol') {
                 if (curr.element.libraryItem) {
                     containerItem = curr.element.libraryItem;
                     break;
                 }
            }
            curr = curr.parent;
        }
        
        const dom = this._document;
        const currentTl = dom.getTimeline();
        
        let mustEdit = false;
        
        if (containerItem && currentTl.name !== containerItem.name) {
            // We are NOT in the timeline of the container. 
            // We MUST switch to select the element safely.
            if (dom.library.itemExists(containerItem.name)) {
                mustEdit = true;
            }
        }

        if (mustEdit) {
            // Logger.trace(`[Converter] Context switch required for image export: ${containerItem.name}`);
            dom.library.editItem(containerItem.name);
            try {
                return exportAction();
            } finally {
                dom.exitEditMode();
            }
        } else {
            return exportAction();
        }
    }

    private convertElementSlot(context: ConverterContext, exportTarget: FlashElement | FlashItem, imageExportFactory: ImageExportFactory): void {
        // 1. Get Base Name (for PNG path and initial cache key)
        let baseImageName = context.global.shapesCache.get(exportTarget);
        if (baseImageName == null) {
            baseImageName = ConvertUtil.createAttachmentName(context.element, context);
            context.global.shapesCache.set(exportTarget, baseImageName);
        }

        // 2. Ensure Image is Exported/Cached (to get dimensions and localCenter)
        const baseImagePath = this.prepareImagesExportPath(context, baseImageName);
        let spineImage = context.global.imagesCache.get(baseImagePath);
        if (spineImage == null) {
            try {
                // WRAP THE EXPORT FACTORY WITH SAFE CONTEXT SWITCHING
                // Pass selection hints to help ImageUtil find the live element
                const hints = this.createSelectionHints(context);
                spineImage = this.safelyExportImage(context, () => {
                    // We modify the factory signature via closure or just pass hints down?
                    // ImageExportFactory signature is (context, path) -> SpineImage.
                    // We need to inject hints into the actual call inside convertShapeElementSlot/convertBitmapElementSlot.
                    // But here 'imageExportFactory' is a callback. 
                    // We can't change its signature easily here without changing the interface.
                    // Instead, let's attach hints to the context temporarily?
                    // Or better, let's just make the factory calls below pass the hints.
                    return imageExportFactory(context, baseImagePath);
                });
            } catch (e) {
                Logger.error(`[Converter] Image export error for '${baseImageName}': ${e}. Using placeholder.`);
                // Create a 1x1 placeholder
                spineImage = new SpineImage(baseImagePath, 1, 1, 1, 0, 0, 0, 0);
            }
            context.global.imagesCache.set(baseImagePath, spineImage);
        }

        // 3. Calculate Required Offset for THIS instance (Variant Check)
        const element = context.element;
        const calcMatrix = context.matrixOverride || element.matrix;
        
        let regX = element.x;
        let regY = element.y;
        let transX = element.transformX;
        let transY = element.transformY;

        if (context.matrixOverride && context.positionOverride) {
            regX = calcMatrix.tx;
            regY = calcMatrix.ty;
            transX = context.positionOverride.x;
            transY = context.positionOverride.y;
        }

        const requiredOffset = ImageUtil.calculateAttachmentOffset(
            calcMatrix,
            regX, regY,
            transX, transY,
            spineImage.imageCenterOffsetX, spineImage.imageCenterOffsetY,
            baseImageName
        );

        const spineOffsetX = requiredOffset.x;
        const spineOffsetY = requiredOffset.y;
        
        // 4. Resolve Variant
        let finalAttachmentName = baseImageName;
        const TOLERANCE = 2.0; 
        
        let variants = context.global.attachmentVariants.get(baseImageName);
        if (!variants) {
            variants = [];
            variants.push({ x: spineImage.x, y: spineImage.y, name: baseImageName });
            context.global.attachmentVariants.set(baseImageName, variants);
        }
        
        let found = false;
        for (const v of variants) {
            const dx = Math.abs(v.x - spineOffsetX);
            const dy = Math.abs(v.y - spineOffsetY);

            if (dx < TOLERANCE && dy < TOLERANCE) {
                finalAttachmentName = v.name;
                found = true;
                break;
            }
        }
        
        if (!found) {
            finalAttachmentName = baseImageName + '_' + (variants.length + 1);
            variants.push({ x: spineOffsetX, y: spineOffsetY, name: finalAttachmentName });
        }

        const subcontext = context.createSlot(context.element);
        const slot = subcontext.slot;

        if (context.global.stageType === ConverterStageType.STRUCTURE) {
            if (context.clipping != null) {
                context.clipping.end = slot;
            }
            return;
        }

        const attachmentName = this.prepareImagesAttachmentName(context, finalAttachmentName);
        const attachment = slot.createAttachment(attachmentName, SpineAttachmentType.REGION) as SpineRegionAttachment;

        if (finalAttachmentName !== baseImageName) {
             attachment.path = this.prepareImagesAttachmentName(context, baseImageName);
        }

        attachment.width = spineImage.width;
        attachment.height = spineImage.height;
        attachment.scaleX = 1 / spineImage.scale;
        attachment.scaleY = 1 / spineImage.scale;
        attachment.x = spineOffsetX;
        attachment.y = spineOffsetY;

        SpineAnimationHelper.applySlotAttachment(
            context.global.animation,
            slot,
            context,
            attachment,
            context.time
        );
    }

    private createSelectionHints(context: ConverterContext): { layerIndex: number, frameIndex: number, elementIndex: number } | undefined {
        try {
            const el = context.element;
            const layer = el.layer;
            const frame = context.frame; 
            
            if (!layer || !frame) return undefined;

            // FlashLayer doesn't have .parent property in typings usually, but we have the timeline from context logic?
            // We can search for the layer in the current timeline if we assume we are in the right context or can access it via item.
            // But context.element.layer gives us the layer object.
            // We need to find this layer in the timeline.
            
            // We can get the timeline from the context.element.libraryItem's timeline if available, 
            // OR we iterate the timeline we are supposedly in.
            
            // Since we are creating hints BEFORE the context switch, we are holding the Data Objects.
            // We need the indices relative to THAT timeline.
            
            // If context.parent exists, it holds the loop state?
            // Actually, we can just grab the timeline from the library item of the parent context?
            
            // Let's use a safer approach:
            // We know 'layer' object. We need its index in its timeline.
            // We don't have a direct link from Layer to Timeline in standard JSFL typings (it's weird).
            // But we can scan the library item's timeline.
            
            let timeline: FlashTimeline | null = null;
            // Traverse up to find the library item that owns this element
            let curr = context.parent;
            while(curr) {
                 if (curr.element && curr.element.libraryItem && curr.element.libraryItem.timeline) {
                     // Check if this timeline contains our layer
                     const tl = curr.element.libraryItem.timeline;
                     for(let i=0; i<tl.layers.length; i++) {
                         if (tl.layers[i] === layer) {
                             timeline = tl;
                             break;
                         }
                     }
                 }
                 if (timeline) break;
                 curr = curr.parent;
            }
            
            if (!timeline) return undefined;

            let layerIndex = -1;
            for (let i = 0; i < timeline.layers.length; i++) {
                if (timeline.layers[i] === layer) {
                    layerIndex = i;
                    break;
                }
            }
            if (layerIndex === -1) return undefined;

            let elementIndex = -1;
            if (frame.elements) {
                for (let i = 0; i < frame.elements.length; i++) {
                     if (frame.elements[i] === el) {
                         elementIndex = i;
                         break;
                     }
                }
            }
            if (elementIndex === -1) return undefined;

            return {
                layerIndex: layerIndex,
                frameIndex: frame.startFrame, // Use the frame's start frame index
                elementIndex: elementIndex
            };
        } catch (e) {
            return undefined;
        }
    }

    private convertBitmapElementSlot(context:ConverterContext):void {
        this.convertElementSlot(
            context, context.element.libraryItem,
            (context, imagePath) => {
                return ImageUtil.exportBitmap(imagePath, context.element, this._config.exportImages);
            }
        );
    }

    private convertShapeMaskElementSlot(context:ConverterContext, matrix:FlashMatrix = null, controlOffset:{x:number, y:number} = null):void {
        let attachmentName = context.global.shapesCache.get(context.element);
        if (attachmentName == null) {
            attachmentName = ConvertUtil.createAttachmentName(context.element, context);
            context.global.shapesCache.set(context.element, attachmentName);
        }

        const subcontext = context.createSlot(context.element);
        const slot = subcontext.slot;
        const attachment = slot.createAttachment(attachmentName, SpineAttachmentType.CLIPPING) as SpineClippingAttachment;
        context.clipping = attachment;

        attachment.vertices = ShapeUtil.extractVertices(context.element, 32, matrix, controlOffset);
        attachment.vertexCount = attachment.vertices != null ? attachment.vertices.length / 2 : 0;

        if (context.global.stageType === ConverterStageType.STRUCTURE) {
            attachment.end = slot;
            return;
        }

        SpineAnimationHelper.applySlotAttachment(
            context.global.animation,
            slot,
            context,
            attachment,
            context.time
        );
    }

    private convertShapeElementSlot(context:ConverterContext):void {
        this.convertElementSlot(
            context, context.element,
            (context, imagePath) => {
                const hints = this.createSelectionHints(context);
                return ImageUtil.exportShape(imagePath, context.element, this._document, this._config.shapeExportScale, this._config.exportShapes, hints);
            }
        );
    }

    private composeElementMaskLayer(context:ConverterContext, convertLayer:FlashLayer, allowBaking:boolean):void {
        this.convertElementLayer(
            context.switchContextLayer(convertLayer), convertLayer,
            (subcontext) => {
                const type = subcontext.element.elementType;
                if (type === 'shape') {
                    const m = subcontext.element.matrix;
                    const localAnchorX = subcontext.element.transformationPoint.x;
                    const localAnchorY = subcontext.element.transformationPoint.y;
                    const offsetMatrix = {
                        a: m.a, b: m.b, c: m.c, d: m.d,
                        tx: m.tx - localAnchorX,
                        ty: m.ty - localAnchorY
                    };
                    this.convertShapeMaskElementSlot(subcontext, offsetMatrix, null);
                    context.clipping = subcontext.clipping;
                } else if (type === 'instance') {
                    const innerShape = this.findFirstShapeInSymbol(subcontext.element);
                    if (innerShape) {
                        const im = innerShape.matrix;
                        const localAnchorX = subcontext.element.transformationPoint.x;
                        const localAnchorY = subcontext.element.transformationPoint.y;
                        const offsetMatrix = {
                            a: im.a, b: im.b, c: im.c, d: im.d,
                            tx: im.tx - localAnchorX,
                            ty: im.ty - localAnchorY
                        };
                        const originalElement = subcontext.element;
                        subcontext.element = innerShape;
                        this.convertShapeMaskElementSlot(subcontext, offsetMatrix, null);
                        subcontext.element = originalElement;
                        context.clipping = subcontext.clipping;
                    }
                }
            },
            allowBaking
        );
    }

    private findFirstShapeInSymbol(instance: FlashElement): FlashElement | null {
        if (!instance.libraryItem || !instance.libraryItem.timeline) return null;
        const timeline = instance.libraryItem.timeline;
        for (const layer of timeline.layers) {
            if (layer.layerType !== 'normal') continue;
            for (const frame of layer.frames) {
                for (const element of frame.elements) {
                    if (element.elementType === 'shape') return element;
                }
            }
        }
        return null;
    }

    private disposeElementMaskLayer(context:ConverterContext):void {
        context.clipping = null;
    }

    private convertPrimitiveElement(context:ConverterContext):void {
        this.convertElementSlot(
            context, context.element.libraryItem,
            (context, imagePath) => {
                return ImageUtil.exportLibraryItem(imagePath, context.element, this._config.shapeExportScale, this._config.exportShapes);
            }
        );
    }

    private convertCompositeElementLayer(context:ConverterContext, convertLayer:FlashLayer, allowBaking:boolean):void {
        this.convertElementLayer(
            context.switchContextLayer(convertLayer), convertLayer,
            (subcontext) => {
                const { elementType, instanceType } = subcontext.element;
                if (elementType === 'shape') this.convertShapeElementSlot(subcontext);
                if (elementType === 'text' && this._config.exportTextAsShapes) this.convertShapeElementSlot(subcontext);
                if (elementType === 'instance') {
                    if (instanceType === 'bitmap') this.convertBitmapElementSlot(subcontext);
                    if (instanceType === 'symbol') this.convertElement(subcontext);
                }
            },
            allowBaking
        );
    }

    private convertCompositeElement(context:ConverterContext):void {
        const item = context.element.libraryItem;
        if (!item) return;

        // Prevent infinite recursion or stack overflow
        if (context.recursionDepth > 32) {
            Logger.warning(`[Converter] Max recursion depth reached for ${item.name}. Skipping.`);
            return;
        }

        // REMOVED: Processed Symbols check (it breaks nested animation flattening).
        // We rely on recursion depth limit and optimizing editItem calls to prevent crashes.

        // Context Switching Optimization:
        // Only call editItem if we are not already in the correct context.
        // And importantly, avoid editItem entirely for nested symbols if we can (to prevent UI storm).
        
        let canEdit = false;
        let mustRestoreContext = false;
        const currentTl = this._document.getTimeline();
        
        // If we are already in the correct timeline (e.g. recursion didn't leave it), we don't need to edit.
        // Note: item.name check is heuristic; timeline.name usually matches symbol name.
        if (currentTl.name !== item.name) {
            if (this._document.library.itemExists(item.name)) {
                // STABILITY FIX: For nested symbols (depth > 0), avoid editItem if possible.
                // However, we need editItem to support Baking (convertToKeyframes) and Layer Parenting logic.
                // If we skip editItem, we must assume no baking is needed or accept lower fidelity.
                // Given the crash reports, we prioritize stability for deep recursion.
                
                if (context.recursionDepth > 0) {
                    // For nested animations, use the Library Item's timeline directly without switching context.
                    // This prevents the UI refresh storm but disables Baking for nested components.
                    // "Animation in Animation" usually works with keyframes, so direct timeline access is sufficient.
                    canEdit = false;
                } else {
                    this._document.library.editItem(item.name);
                    canEdit = true;
                    mustRestoreContext = true;
                }
            }
        } else {
            // Already in context
            canEdit = true; 
        }

        try {
            // If we canEdit (active timeline), use it. Otherwise use the Library Item's timeline data.
            const timeline = canEdit ? this._document.getTimeline() : item.timeline;
            const layers = timeline.layers;

            for (let i = layers.length - 1; i >= 0; i--) {
                const layer = layers[i];
                if (!layer.visible) continue;

                if (layer.layerType === 'normal' || layer.layerType === 'guided') {
                    this.convertCompositeElementLayer(context, layer, canEdit);
                } else if (layer.layerType === 'masked') {
                    const mask = LayerMaskUtil.extractTargetMask(layers, i);
                    if (mask) this.composeElementMaskLayer(context, mask, canEdit);
                    this.convertCompositeElementLayer(context, layer, canEdit);
                } else if (layer.layerType === 'mask') {
                    this.disposeElementMaskLayer(context);
                }
            }
        } finally {
            if (mustRestoreContext) {
                this._document.exitEditMode();
            }
        }
    }

    private convertElementLayer(context:ConverterContext, layer:FlashLayer, factory:LayerConvertFactory, allowBaking:boolean = true):void {
        const { label, stageType, frameRate } = context.global;
        let start = 0, end = layer.frames.length - 1;

        // Optimization: Pre-calculate target frame for nested animations to avoid Loop Logic and overhead
        let isNestedFlattening = false;
        let targetFrame = 0;

        if (context.parent == null && label != null && stageType === ConverterStageType.ANIMATION) {
            start = label.startFrameIdx;
            end = label.endFrameIdx;
        } else if (context.parent != null && stageType === ConverterStageType.ANIMATION) {
            // NESTED ANIMATION SUPPORT (FLATTENING)
            try {
                const instance = context.element as any;
                
                // Only process if we have valid context
                if (instance && instance.libraryItem && instance.libraryItem.timeline && context.parent && context.parent.frame) {
                    const tl = instance.libraryItem.timeline;
                    const animationStartFrame = label ? label.startFrameIdx : 0;
                    const currentAbsFrame = animationStartFrame + Math.round(context.time * frameRate);
                    const parentKeyframeStart = context.parent.frame.startFrame;
                    const frameOffset = Math.max(0, currentAbsFrame - parentKeyframeStart);
                    
                    const firstFrame = (instance.firstFrame !== undefined) ? instance.firstFrame : 0;
                    const loopMode = (instance.loop !== undefined) ? instance.loop : 'loop'; 
                    const tlFrameCount = tl.frameCount;
                    
                    if (tlFrameCount <= 0) return; // Safety check
                    
                    if (loopMode === 'single frame') {
                        targetFrame = firstFrame;
                    } else if (loopMode === 'play once') {
                        targetFrame = firstFrame + frameOffset;
                        if (targetFrame >= tlFrameCount) targetFrame = tlFrameCount - 1;
                    } else { // loop
                        targetFrame = (firstFrame + frameOffset) % tlFrameCount;
                    }
                    
                    if (targetFrame >= 0 && targetFrame < layer.frames.length) {
                        isNestedFlattening = true;
                        // Restrict loop to just this frame
                        start = targetFrame;
                        end = targetFrame;
                    } else {
                        return; // Out of bounds
                    }
                }
            } catch (e) {
                // Fail safe
            }
        }
        
        // Fast Path for Nested Flattening (Avoids baking, selection, and complex logic)
        if (isNestedFlattening) {
            const frame = layer.frames[start];
            if (!frame) return;

            // Direct Export for Flattened Frame
            // We use 'context.time + context.timeOffset' logic indirectly via 'time' variable?
            // Actually, we want to export THIS child frame at the Parent's current time.
            // The parent loop determined 'context.time'. 
            // We just need to add 'timeOffset' if any (usually 0 for direct flattening, but let's keep consistent).
            
            // Note: time in the loop below is calculated as (i - start) / frameRate.
            // Since i == start, time = 0.
            // Final time = 0 + context.timeOffset.
            // context.timeOffset is usually set by the parent to align children.
            
            const time = context.timeOffset; // (start - start)/frameRate + offset

            if (frame.elements.length === 0) {
                // Handle empty slots logic if needed, or just skip
                const slots = context.global.layersCache.get(context.layer);
                if (slots) {
                    for (const s of slots) SpineAnimationHelper.applySlotAttachment(context.global.animation, s, context.switchContextFrame(frame), null, time);
                }
                return; 
            }

            for (let eIdx = 0; eIdx < frame.elements.length; eIdx++) {
                let el = frame.elements[eIdx];
                
                // No Parent Matrix calc for nested items (too heavy/unstable without editItem)
                // No Baking. Just direct access.
                
                const sub = context.switchContextFrame(frame).createBone(el, time, null, null);
                
                if (el.elementType === 'instance' && el.instanceType === 'symbol') {
                    const instance = el as any;
                    const firstFrameOffset = (instance.firstFrame || 0) / frameRate;
                    sub.timeOffset = time - firstFrameOffset;
                }

                factory(sub);
            }
            return; // DONE for nested
        }

        // Standard Loop for Root / Non-Flattened
        for (let i = start; i <= end; i++) {
            // Safety check for targetFrame out of bounds (e.g. if layer is shorter than timeline)
            if (i < 0 || i >= layer.frames.length) continue;

            const frame = layer.frames[i];
            if (!frame) continue;
            
            // Time calculation:
            // If Root: time = (i - start) / frameRate.
            // If Nested: start = targetFrame. i = targetFrame. time = 0.
            // This ensures keys are exported at 'context.time' (Parent Time + 0).
            let time = (i - start) / frameRate;
            if (context.parent != null) {
                 // For nested animations, we force the local time to be 0 (snapshot), 
                 // but we must preserve the inherited timeOffset so the key is placed correctly in the root timeline.
                 // Actually, wait - if we flatten, we want to export THIS frame of the child at the CURRENT parent time.
                 // The 'time' variable here represents the local time relative to the start of the export loop.
                 // If we restrict the loop to start=targetFrame, end=targetFrame, then (i-start) is 0.
                 // So time becomes 0.
                 // Then we add context.timeOffset.
            }
            time += context.timeOffset;
            
            if (this._config.exportFrameCommentsAsEvents && frame.labelType === 'comment') {
                context.global.skeleton.createEvent(frame.name);
                if (stageType === ConverterStageType.ANIMATION) SpineAnimationHelper.applyEventAnimation(context.global.animation, frame.name, time);
            }
            
            if (frame.elements.length === 0) {
                const slots = context.global.layersCache.get(context.layer);
                if (slots && stageType === ConverterStageType.ANIMATION) {
                    for (const s of slots) SpineAnimationHelper.applySlotAttachment(context.global.animation, s, context.switchContextFrame(frame), null, time);
                }
                continue;
            }
            
            for (let eIdx = 0; eIdx < frame.elements.length; eIdx++) {
                let el = frame.elements[eIdx];
                
                let parentMat: FlashMatrix = null;
                if (layer.parentLayer) {
                    this._document.getTimeline().currentFrame = i;
                    parentMat = this.getLayerParentMatrix(layer, i);
                }

                let bakedData: { matrix: FlashMatrix, transformX: number, transformY: number } | null = null;

                // INTERPOLATION HANDLING
                if (i !== frame.startFrame) {
                    // Optimized Skip for Classic Tweens to allow Spine Bezier Interpolation
                    // We skip "Baking" (frame-by-frame export) if the tween is simple enough for Spine to handle.
                    const isClassic = frame.tweenType === 'classic';
                    // We can check parentLayer on 'layer' even if we are not in edit mode (it's a property of the layer object)
                    // But accessing parentLayer from a non-active timeline might be flaky? Usually layer object has it.
                    const isGuided = (layer.parentLayer && layer.parentLayer.layerType === 'guide');
                    
                    let isSupportedEase = true;
                    // Force baking for any custom ease to ensure visual fidelity.
                    // Animate's custom ease curves often do not map 1:1 to Spine's cubic bezier, especially with weird handles.
                    // Baking is safer and we have optimized it to be fast on the temp file.
                    if (frame.hasCustomEase) {
                        isSupportedEase = false;
                    }

                    // If allowBaking is false (nested symbol optimization), we force skipping bake.
                    // This means nested tweens might lose fidelity (linear interpolation), but prevents crashes.
                    if (!allowBaking || (isClassic && !isGuided && isSupportedEase)) {
                        // Logger.trace(`[Interpolation] Frame ${i} (${layer.name}): Skipping Bake (Using Curve). Classic=${isClassic}, Guided=${isGuided}, Ease=${isSupportedEase}`);
                        continue; // Skip baking, let Spine interpolate from the keyframe
                    } else {
                        // Logger.trace(`[Interpolation] Frame ${i} (${layer.name}): BAKING. Classic=${isClassic}, Guided=${isGuided}, Ease=${isSupportedEase}`);
                    }

                    // Only perform baking if we are allowed (active timeline context)
                    if (allowBaking) {
                        this._document.getTimeline().currentFrame = i;
                        
                        const wasLocked = layer.locked;
                        const wasVisible = layer.visible;
                        layer.locked = false;
                        layer.visible = true;
                        
                        // Robust selection logic
                        const timeline = this._document.getTimeline();
                        let layerIdx = -1;
                        const layers = timeline.layers;
                        for (let k = 0; k < layers.length; k++) {
                            if (layers[k] === layer) { layerIdx = k; break; }
                        }
                        if (layerIdx === -1) {
                            for (let k = 0; k < layers.length; k++) {
                                if (layers[k].name === layer.name) { layerIdx = k; break; }
                            }
                        }

                        if (layerIdx !== -1) {
                            timeline.setSelectedLayers(layerIdx); 
                        }
                        timeline.setSelectedFrames(i, i + 1);

                        // FORCE BAKING via Keyframe Conversion
                        // This is the only reliable way to get the interpolated matrix for Motion Tweens and complex Eases in JSFL.
                        // Since we are working on a temporary file, this destructive operation is safe and doesn't need Undo.
                        try {
                            timeline.convertToKeyframes();
                            
                            // Re-fetch element from the new keyframe
                            const freshLayer = timeline.layers[layerIdx];
                            const freshFrame = freshLayer.frames[i];
                            if (freshFrame.elements.length > 0) {
                                const bakedEl = freshFrame.elements[0];
                                bakedData = {
                                    matrix: bakedEl.matrix,
                                    transformX: bakedEl.transformX,
                                    transformY: bakedEl.transformY
                                };
                            }
                        } catch (e) {
                             Logger.warning(`[Converter] Bake failed for frame ${i} (${layer.name}): ${e}`);
                        }
                        
                        if (!bakedData) {
                            // Fallback to selection proxy if baking failed (though unlikely on temp file)
                            this._document.selectNone();
                            el.selected = true;
                            if (this._document.selection.length > 0) {
                                const proxy = this._document.selection[0];
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
                } else {
                    // Start Frame: ensure timeline is at position if we are in active mode
                    if (allowBaking) {
                        this._document.getTimeline().currentFrame = i;
                    }
                }

                // Combine Parent Matrix with Child Matrix (which may have been updated to interpolated proxy)
                let finalMatrixOverride: FlashMatrix = null;
                let finalPositionOverride: {x:number, y:number} = null;

                const sourceMatrix = bakedData ? bakedData.matrix : el.matrix;
                const sourceTransX = bakedData ? bakedData.transformX : el.transformX;
                const sourceTransY = bakedData ? bakedData.transformY : el.transformY;

                if (parentMat) {
                    finalMatrixOverride = this.concatMatrix(sourceMatrix, parentMat);
                    finalPositionOverride = {
                        x: sourceTransX * parentMat.a + sourceTransY * parentMat.c + parentMat.tx,
                        y: sourceTransX * parentMat.b + sourceTransY * parentMat.d + parentMat.ty
                    };
                } else if (bakedData) {
                    // If we have baked data, we MUST use it as an override because 'el' is reverted to the static base state
                    finalMatrixOverride = sourceMatrix;
                    finalPositionOverride = {
                        x: sourceTransX,
                        y: sourceTransY
                    };
                }

                const sub = context.switchContextFrame(frame).createBone(el, time, finalMatrixOverride, finalPositionOverride);
                
                if (el.elementType === 'instance' && el.instanceType === 'symbol' && stageType === ConverterStageType.ANIMATION) {
                    const instance = el as any;
                    const firstFrameOffset = (instance.firstFrame || 0) / frameRate;
                    sub.timeOffset = time - firstFrameOffset;
                }

                factory(sub);
                
                if (context.element && context.element.libraryItem && allowBaking) {
                    const targetName = context.element.libraryItem.name;
                    const dom = this._document;
                    const currentTl = dom.getTimeline();
                    if (currentTl.name !== targetName) {
                        if (dom.library.itemExists(targetName)) {
                            dom.library.editItem(targetName);
                        }
                    }
                }

                if (allowBaking && this._document.getTimeline().currentFrame !== i) {
                    this._document.getTimeline().currentFrame = i;
                }
            }
        }
    }

    private convertElement(context:ConverterContext):void {
        if (LibraryUtil.isPrimitiveLibraryItem(context.element.libraryItem, this._config)) {
            this.convertPrimitiveElement(context);
        } else {
            this.convertCompositeElement(context);
        }
    }

    public prepareImagesExportPath(context:ConverterContext, image:string):string {
        const folder = this.resolveWorkingPath(context.global.skeleton.imagesPath);
        if (!FLfile.exists(folder)) FLfile.createFolder(folder);
        return PathUtil.joinPath(folder, image + '.png');
    }

    public prepareImagesAttachmentName(context:ConverterContext, image:string):string {
        return (this._config.appendSkeletonToImagesPath && this._config.mergeSkeletons) ? PathUtil.joinPath(context.global.skeleton.name, image) : image;
    }

    public resolveWorkingPath(path:string):string {
        return PathUtil.joinPath(this._workingPath, path);
    }

    public convertSymbolInstance(element:FlashElement, context:ConverterContext):boolean {
        if (element.elementType === 'instance' && element.instanceType === 'symbol') {
            try {
                context.global.stageType = ConverterStageType.STRUCTURE;
                this.convertElement(context);
                
                Logger.trace(`[Converter] Converting animations for symbol instance: ${element.name || element.libraryItem.name}. Found ${context.global.labels.length} labels.`);
                
                if (context.global.labels.length > 0) {
                    const isDefaultOnly = context.global.labels.length === 1 && context.global.labels[0].name === 'default';
                    
                    if (!isDefaultOnly) {
                        for (const l of context.global.labels) {
                            Logger.trace(`  - Processing label: ${l.name} (frames ${l.startFrameIdx}-${l.endFrameIdx})`);
                            context.global.processedSymbols.clear(); 
                            const sub = context.switchContextAnimation(l);
                            sub.global.stageType = ConverterStageType.ANIMATION;
                            this.convertElement(sub);
                        }
                    } else {
                        Logger.trace(`  - Processing default timeline animation (frames 0-${context.global.labels[0].endFrameIdx})`);
                        context.global.processedSymbols.clear();
                        const sub = context.switchContextAnimation(context.global.labels[0]);
                        sub.global.stageType = ConverterStageType.ANIMATION;
                        this.convertElement(sub);
                    }
                }
                
                return true;
            } catch (e) { Logger.error(JsonEncoder.stringify(e)); }
        }
        return false;
    }

    private concatMatrix(m1: FlashMatrix, m2: FlashMatrix): FlashMatrix {
        return {
            a: m1.a * m2.a + m1.b * m2.c,
            b: m1.a * m2.b + m1.b * m2.d,
            c: m1.c * m2.a + m1.d * m2.c,
            d: m1.c * m2.b + m1.d * m2.d,
            tx: m1.tx * m2.a + m1.ty * m2.c + m2.tx,
            ty: m1.tx * m2.b + m1.ty * m2.d + m2.ty
        };
    }

    private getLayerParentMatrix(layer: FlashLayer, frameIndex: number): FlashMatrix {
        if (!layer.parentLayer) return { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };

        const parentGlobal = this.getLayerParentMatrix(layer.parentLayer, frameIndex);
        const parentFrame = layer.parentLayer.frames[frameIndex];
        if (!parentFrame || parentFrame.elements.length === 0) {
            return parentGlobal;
        }

        const wasLocked = layer.parentLayer.locked;
        const wasVisible = layer.parentLayer.visible;
        layer.parentLayer.locked = false;
        layer.parentLayer.visible = true;

        const el = parentFrame.elements[0];
        
        let layerIdx = -1;
        const layers = this._document.getTimeline().layers;
        for (let k = 0; k < layers.length; k++) {
            if (layers[k] === layer.parentLayer) {
                layerIdx = k;
                break;
            }
        }

        if (layerIdx === -1) {
            const pName = layer.parentLayer.name;
            for (let k = 0; k < layers.length; k++) {
                if (layers[k].name === pName) {
                    layerIdx = k;
                    break;
                }
            }
        }
        
        if (layerIdx !== -1) {
            this._document.getTimeline().setSelectedLayers(layerIdx);
            this._document.getTimeline().setSelectedFrames(frameIndex, frameIndex + 1);
            this._document.selectNone();
            el.selected = true;
            
            let finalMat = el.matrix;
            if (this._document.selection.length > 0) {
                finalMat = this._document.selection[0].matrix;
            }
            
            layer.parentLayer.locked = wasLocked;
            layer.parentLayer.visible = wasVisible;
            
            return this.concatMatrix(finalMat, parentGlobal);
        }

        return parentGlobal;
    }

    public convertSelection():SpineSkeleton[] {
        const skeleton = (this._config.mergeSkeletons ? new SpineSkeleton() : null);
        const cache = (this._config.mergeSkeletons && this._config.mergeSkeletonsRootBone) ? ConverterContextGlobal.initializeCache() : null;
        const output:SpineSkeleton[] = [];
        for (const el of this._document.selection) {
            const context = ConverterContextGlobal.initializeGlobal(el, this._config, this._document.frameRate, skeleton, cache);
            if (this.convertSymbolInstance(el, context) && skeleton == null) output.push(context.skeleton);
        }
        if (skeleton) {
            skeleton.imagesPath = this._config.imagesExportPath;
            skeleton.name = StringUtil.simplify(PathUtil.fileBaseName(this._document.name));
            output.push(skeleton);
        }
        return output;
    }
}
