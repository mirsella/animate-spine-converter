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
        // Re-calculate using current matrix and the cached image's local center
        const requiredOffset = ImageUtil.calculateAttachmentOffset(
            element.matrix,
            element.x, element.y,
            element.transformX, element.transformY,
            spineImage.imageCenterOffsetX, spineImage.imageCenterOffsetY,
            element.name 
        );
        
        // Consistent Inversion for Spine Y-Up
        // Derivation: 
        // 1. requiredOffset.y is in Animate Y-Down space (positive = visually Down).
        // 2. SpineFormat negates the value: JSON.y = attachment.y * -1.
        // 3. Goal for Normal Bone: Visually Down -> JSON.y should be negative (e.g. -50).
        //    So attachment.y should be 50. (attachment.y = requiredOffset.y).
        // 4. Goal for Flipped Bone (ScaleY = -1): Bone axis points Down. Visually Down -> local Y should be POSITIVE relative to bone.
        //    So JSON.y should be positive (e.g. 50).
        //    So attachment.y should be -50. (attachment.y = -requiredOffset.y).
        // const det = element.matrix.a * element.matrix.d - element.matrix.b * element.matrix.c;
        const spineOffsetX = requiredOffset.x;
        // const spineOffsetY = (det < 0) ? -requiredOffset.y : requiredOffset.y; 
        const spineOffsetY = requiredOffset.y;
        
        // 4. Resolve Variant
        let finalAttachmentName = baseImageName;
        // Increase tolerance to avoid micro-variants due to floating point jitter
        const TOLERANCE = 2.0; 
        
        let variants = context.global.attachmentVariants.get(baseImageName);
        if (!variants) {
            variants = [];
            // Add the default one (from the image export) as the first variant
            variants.push({ x: spineImage.x, y: spineImage.y, name: baseImageName });
            context.global.attachmentVariants.set(baseImageName, variants);
        }
        
        let found = false;
        let closestDelta = { dx: 0, dy: 0, dist: 99999 };

        for (const v of variants) {
            const dx = Math.abs(v.x - spineOffsetX);
            const dy = Math.abs(v.y - spineOffsetY);
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            if (dist < closestDelta.dist) {
                closestDelta = { dx, dy, dist };
            }

            if (dx < TOLERANCE && dy < TOLERANCE) {
                finalAttachmentName = v.name;
                found = true;
                break;
            }
        }
        
        if (!found) {
            // Create new variant
            finalAttachmentName = baseImageName + '_' + (variants.length + 1);
            variants.push({ x: spineOffsetX, y: spineOffsetY, name: finalAttachmentName });
            
            // Detailed Logging for Debugging
            const isInteresting = baseImageName.indexOf('weapon') >= 0 || baseImageName.indexOf('dash') >= 0 || baseImageName.indexOf('torso') >= 0 || baseImageName.indexOf('skin_1') >= 0;
            if (isInteresting) {
                Logger.warning(`[Variant] Created new attachment variant: ${finalAttachmentName}`);
                Logger.warning(`   > Input Element: ${element.name} (Lib: ${element.libraryItem?.name})`);
                Logger.warning(`   > Matrix: a=${element.matrix.a.toFixed(4)}, b=${element.matrix.b.toFixed(4)}, c=${element.matrix.c.toFixed(4)}, d=${element.matrix.d.toFixed(4)}, tx=${element.matrix.tx}, ty=${element.matrix.ty}`);
                Logger.warning(`   > Calculated Offset: x=${spineOffsetX.toFixed(2)}, y=${spineOffsetY.toFixed(2)}`);
                Logger.warning(`   > Delta from closest existing variant: dist=${closestDelta.dist.toFixed(2)} (dx=${closestDelta.dx.toFixed(2)}, dy=${closestDelta.dy.toFixed(2)})`);
                Logger.warning(`   > Tolerance was: ${TOLERANCE}`);
            }
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

        // Force path to reuse the PNG if variant
        if (finalAttachmentName !== baseImageName) {
             attachment.path = this.prepareImagesAttachmentName(context, baseImageName);
        }

        attachment.width = spineImage.width;
        attachment.height = spineImage.height;
        attachment.scaleX = 1 / spineImage.scale;
        attachment.scaleY = 1 / spineImage.scale;
        attachment.x = spineOffsetX;
        attachment.y = spineOffsetY;

        // Debug logging for Dash scaling issues
        if (baseImageName.indexOf('dash') >= 0) {
            Logger.trace(`[DashDebug] Exporting ${attachmentName}`);
            Logger.trace(`   > SpineImage Scale: ${spineImage.scale}`);
            Logger.trace(`   > Attachment Scale: ${attachment.scaleX.toFixed(3)}, ${attachment.scaleY.toFixed(3)}`);
            Logger.trace(`   > Attachment Pos: ${attachment.x.toFixed(2)}, ${attachment.y.toFixed(2)}`);
            const em = element.matrix;
            const elemScaleX = Math.sqrt(em.a*em.a + em.b*em.b);
            const elemScaleY = Math.sqrt(em.c*em.c + em.d*em.d);
            Logger.trace(`   > Element Matrix Scale: Sx=${elemScaleX.toFixed(3)}, Sy=${elemScaleY.toFixed(3)}`);
        }

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

        // Enter the symbol to ensure we are in the correct context for selection and interpolation
        // We only do this if we can actually edit the item
        const canEdit = this._document.library.itemExists(item.name);
        if (canEdit) {
            this._document.library.editItem(item.name);
        }

        try {
            const layers = item.timeline.layers;
            for (let i = layers.length - 1; i >= 0; i--) {
                const layer = layers[i];
                
                // Detailed debug for missing skin_1 weapon
                const isSkin1Weapon = item.name.indexOf('skin_1') >= 0 && (layer.name.toLowerCase().indexOf('weapon') >= 0);
                if (isSkin1Weapon) {
                     Logger.trace(`[LayerCheck] Found weapon layer '${layer.name}' in symbol '${item.name}'`);
                     Logger.trace(`   > Type: ${layer.layerType}`);
                     Logger.trace(`   > Visible: ${layer.visible}`);
                     Logger.trace(`   > Frame Count: ${layer.frames.length}`);
                }

                // Skip hidden layers to prevent exporting reference art or disabled content
                if (!layer.visible) {
                    if (isSkin1Weapon) {
                        Logger.warning(`[LayerCheck] SKIPPING HIDDEN WEAPON LAYER in ${item.name}!`);
                    }
                    // Logger.trace(`[Converter] Skipping hidden layer: '${layer.name}' in symbol '${item.name}'`);
                    continue;
                }

                // Treat 'guided' layers (layers being guided by a motion guide) as normal layers
                if (layer.layerType === 'normal' || layer.layerType === 'guided') {
                    this.convertCompositeElementLayer(context, layer);
                } else if (layer.layerType === 'masked') {
                    const mask = LayerMaskUtil.extractTargetMask(layers, i);
                    if (mask) this.composeElementMaskLayer(context, mask);
                    this.convertCompositeElementLayer(context, layer);
                } else if (layer.layerType === 'mask') {
                    this.disposeElementMaskLayer(context);
                } else {
                    // Logger.trace(`[Converter] Skipping layer '${layer.name}' with type '${layer.layerType}' in symbol '${item.name}'`);
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
        }
        
        for (let i = start; i <= end; i++) {
            const frame = layer.frames[i];
            if (!frame) continue;
            
            const time = (i - start) / frameRate;
            
            // Export events from comments
            if (this._config.exportFrameCommentsAsEvents && frame.labelType === 'comment') {
                context.global.skeleton.createEvent(frame.name);
                if (stageType === ConverterStageType.ANIMATION) SpineAnimationHelper.applyEventAnimation(context.global.animation, frame.name, time);
            }
            
            // Handle empty keyframes (end of visibility) by setting attachment to null
            if (frame.elements.length === 0) {
                // Debug logging for missing weapon in idle
                if (layer.name.toLowerCase().indexOf('weapon') >= 0 && context.element?.libraryItem?.name.indexOf('skin_1') >= 0) {
                     Logger.trace(`[FrameCheck] Empty/Null frame encountered for skin_1 weapon on layer '${layer.name}' at frame ${i}.`);
                }

                const slots = context.global.layersCache.get(context.layer);
                if (slots && stageType === ConverterStageType.ANIMATION) {
                    for (const s of slots) SpineAnimationHelper.applySlotAttachment(context.global.animation, s, context.switchContextFrame(frame), null, time);
                }
                continue;
            }
            
            // Iterate elements on the frame
            for (let eIdx = 0; eIdx < frame.elements.length; eIdx++) {
                let el = frame.elements[eIdx];
                
                // INTERPOLATION HANDLING
                if (i !== frame.startFrame) {
                    this._document.getTimeline().currentFrame = i;
                    
                    const wasLocked = layer.locked;
                    const wasVisible = layer.visible;
                    layer.locked = false;
                    layer.visible = true;
                    
                    // Robust selection logic
                    const timeline = this._document.getTimeline();
                    
                    // Find correct layer index
                    let layerIdx = -1;
                    const layers = timeline.layers;
                    // Try reference match first
                    for (let k = 0; k < layers.length; k++) {
                        if (layers[k] === layer) {
                            layerIdx = k;
                            break;
                        }
                    }
                    // Fallback to name match if reference fails (JSFL quirk)
                    if (layerIdx === -1) {
                        for (let k = 0; k < layers.length; k++) {
                            if (layers[k].name === layer.name) {
                                layerIdx = k;
                                break;
                            }
                        }
                    }

                    if (layerIdx !== -1) {
                        timeline.setSelectedLayers(layerIdx); 
                    }
                    
                    timeline.setSelectedFrames(i, i + 1); // Focus the specific frame
                    
                    this._document.selectNone();
                    // Selecting the keyframe element while playhead is at 'i' selects the interpolated instance
                    el.selected = true;
                    
                    if (this._document.selection.length > 0) {
                        el = this._document.selection[0];
                    }
                    
                    layer.locked = wasLocked;
                    layer.visible = wasVisible;
                } else {
                    this._document.getTimeline().currentFrame = i;
                }

                const sub = context.switchContextFrame(frame).createBone(el, time);
                
                // Recurse into symbol if needed
                // Note: We do NOT need to call editItem here; factory() -> convertElement -> convertCompositeElement handles recursion logic.
                // However, we must ensure we don't lose our place in the current timeline loop.
                factory(sub);
                
                // RESTORE CONTEXT CHECK
                // If the factory call (e.g. ImageUtil.exportSymbol) changed the active edit context (returned to parent/root),
                // we must re-enter the current symbol to continue processing its timeline correctly.
                if (context.element && context.element.libraryItem) {
                    const targetName = context.element.libraryItem.name;
                    const dom = this._document;
                    // Check if current timeline matches our expected context
                    // Note: timeline.name matches the Symbol name for symbols.
                    const currentTl = dom.getTimeline();
                    if (currentTl.name !== targetName) {
                        // Logger.trace(`[Converter] Context lost (Current: '${currentTl.name}', Expected: '${targetName}'). Restoring...`);
                        if (dom.library.itemExists(targetName)) {
                            dom.library.editItem(targetName);
                        }
                    }
                }

                // Restore timeline frame in case recursion changed it
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
                // Logger.trace(`[Converter] Converting animations for symbol instance: ${element.name || element.libraryItem.name}. Found ${context.global.labels.length} labels.`);
                for (const l of context.global.labels) {
                    // Logger.trace(`  - Processing label: ${l.name} (frames ${l.startFrameIdx}-${l.endFrameIdx})`);
                    const sub = context.switchContextAnimation(l);
                    sub.global.stageType = ConverterStageType.ANIMATION;
                    this.convertElement(sub);
                }
                return true;
            } catch (e) { Logger.error(JsonEncoder.stringify(e)); }
        }
        return false;
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
