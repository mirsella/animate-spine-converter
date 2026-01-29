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

    private convertElementSlot(context:ConverterContext, exportTarget:FlashElement | FlashItem, imageExportFactory:ImageExportFactory):void {
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
                spineImage = imageExportFactory(context, baseImagePath);
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
                return ImageUtil.exportShape(imagePath, context.element, this._document, this._config.shapeExportScale, this._config.exportShapes);
            }
        );
    }

    private composeElementMaskLayer(context:ConverterContext, convertLayer:FlashLayer):void {
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
            }
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

    private convertCompositeElementLayer(context:ConverterContext, convertLayer:FlashLayer):void {
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
            }
        );
    }

    private convertCompositeElement(context:ConverterContext):void {
        const item = context.element.libraryItem;
        if (!item) return;

        // ANIMATION OPTIMIZATION:
        // Avoid entering the same symbol multiple times per animation to prevent UI refresh storm and crashes.
        if (context.global.stageType === ConverterStageType.ANIMATION) {
            if (context.global.processedSymbols.has(item.name)) return;
            context.global.processedSymbols.set(item.name, true);
        }

        const canEdit = this._document.library.itemExists(item.name);
        if (canEdit) {
            this._document.library.editItem(item.name);
        }

        try {
            const timeline = this._document.getTimeline(); 
            const layers = timeline.layers;

            for (let i = layers.length - 1; i >= 0; i--) {
                const layer = layers[i];
                if (!layer.visible) continue;

                if (layer.layerType === 'normal' || layer.layerType === 'guided') {
                    this.convertCompositeElementLayer(context, layer);
                } else if (layer.layerType === 'masked') {
                    const mask = LayerMaskUtil.extractTargetMask(layers, i);
                    if (mask) this.composeElementMaskLayer(context, mask);
                    this.convertCompositeElementLayer(context, layer);
                } else if (layer.layerType === 'mask') {
                    this.disposeElementMaskLayer(context);
                }
            }
        } finally {
            if (canEdit) {
                this._document.exitEditMode();
            }
        }
    }

    private convertElementLayer(context:ConverterContext, layer:FlashLayer, factory:LayerConvertFactory):void {
        const { label, stageType, frameRate } = context.global;
        let start = 0, end = layer.frames.length - 1;

        if (context.parent == null && label != null && stageType === ConverterStageType.ANIMATION) {
            start = label.startFrameIdx;
            end = label.endFrameIdx;
        } else if (context.parent != null && stageType === ConverterStageType.ANIMATION) {
            // NESTED ANIMATION SUPPORT (FLATTENING)
            // Instead of exporting the entire child timeline for every parent frame,
            // we calculate the EXACT frame of the child that corresponds to the parent's current time.
            
            try {
                const instance = context.element as any;
                
                // Safety checks to prevent crashes on non-symbol instances or missing data
                if (instance && instance.libraryItem && instance.libraryItem.timeline && context.parent && context.parent.frame) {
                    const tl = instance.libraryItem.timeline;
                    
                    // Calculate Current Global Frame (Absolute Index in Root Timeline)
                    const animationStartFrame = label ? label.startFrameIdx : 0;
                    // Use Math.round to avoid floating point drift from time division
                    const currentAbsFrame = animationStartFrame + Math.round(context.time * frameRate);
                    
                    // Calculate how many frames have elapsed since this instance's keyframe started
                    const parentKeyframeStart = context.parent.frame.startFrame;
                    const frameOffset = Math.max(0, currentAbsFrame - parentKeyframeStart);
                    
                    // Default properties for MovieClips (which don't have firstFrame/loop) or missing props
                    // Graphic symbols have these. MovieClips behave like 'loop' starting at 0.
                    const firstFrame = (instance.firstFrame !== undefined) ? instance.firstFrame : 0;
                    const loopMode = (instance.loop !== undefined) ? instance.loop : 'loop'; // 'loop', 'play once', 'single frame'
                    const tlFrameCount = tl.frameCount;
                    
                    let targetFrame = 0;
                    
                    if (loopMode === 'single frame') {
                        targetFrame = firstFrame;
                    } else if (loopMode === 'play once') {
                        targetFrame = firstFrame + frameOffset;
                        if (targetFrame >= tlFrameCount) targetFrame = tlFrameCount - 1;
                    } else { // loop
                        targetFrame = (firstFrame + frameOffset) % tlFrameCount;
                    }
                    
                    // Restrict the loop to ONLY this frame
                    start = targetFrame;
                    end = targetFrame;
                }
            } catch (e) {
                // If anything goes wrong in the calc (e.g. weird JSFL object state), 
                // silently fail and fall back to standard export (0 to end) to avoid crash.
            }
        }
        
        for (let i = start; i <= end; i++) {
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

                this._document.getTimeline().currentFrame = i;

                let finalMatrixOverride: FlashMatrix = null;
                let finalPositionOverride: {x:number, y:number} = null;

                let sourceMatrix = el.matrix;
                let sourceTransX = el.transformX;
                let sourceTransY = el.transformY;

                // FORCE BAKING: Select the element to read its interpolated properties (matrix/transform)
                // This is required because 'el' refers to the keyframe data, which is static for the duration of the tween.
                // To get the rotated/moved state at frame 'i', we must read from the stage selection.
                if (frame.tweenType !== 'none' && i > frame.startFrame) {
                    this._document.selectNone();
                    el.selected = true;
                    if (this._document.selection.length > 0) {
                        const proxy = this._document.selection[0];
                        sourceMatrix = proxy.matrix;
                        // Transform point usually doesn't tween, but Animate allows it. Safe to read.
                        sourceTransX = proxy.transformX; 
                        sourceTransY = proxy.transformY;
                    }
                }

                if (parentMat) {
                    finalMatrixOverride = this.concatMatrix(sourceMatrix, parentMat);
                    finalPositionOverride = {
                        x: sourceTransX * parentMat.a + sourceTransY * parentMat.c + parentMat.tx,
                        y: sourceTransX * parentMat.b + sourceTransY * parentMat.d + parentMat.ty
                    };
                }

                const sub = context.switchContextFrame(frame).createBone(el, time, finalMatrixOverride, finalPositionOverride);
                
                if (el.elementType === 'instance' && el.instanceType === 'symbol' && stageType === ConverterStageType.ANIMATION) {
                    const instance = el as any;
                    const firstFrameOffset = (instance.firstFrame || 0) / frameRate;
                    sub.timeOffset = time - firstFrameOffset;
                }

                factory(sub);
                
                if (context.element && context.element.libraryItem) {
                    const targetName = context.element.libraryItem.name;
                    const dom = this._document;
                    const currentTl = dom.getTimeline();
                    if (currentTl.name !== targetName) {
                        if (dom.library.itemExists(targetName)) {
                            dom.library.editItem(targetName);
                        }
                    }
                }

                if (this._document.getTimeline().currentFrame !== i) {
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
