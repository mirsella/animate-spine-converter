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
import { IColorData } from './ConverterColor';
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

    private getIndent(depth: number): string {
        let indent = "";
        for (let i = 0; i < depth; i++) indent += "  ";
        return indent;
    }

    // Debug helpers (kept lightweight; logs can get very large in JSFL).
    private isDebugName(name: string | null | undefined): boolean {
        if (!name) return false;
        const n = String(name).toLowerCase();
        // Focus on the current reported issue: yellow glow animation + attachment variants.
        // Keep this conservative to avoid flooding output for unrelated exports.
        return (n.indexOf('yellow') !== -1 && n.indexOf('glow') !== -1) || (n.indexOf('yellow_glow') !== -1);
    }

    private getElementDebugName(el: FlashElement | null | undefined): string {
        if (!el) return '<null>';
        const n = (el as any).name;
        const lib = (el as any).libraryItem ? (el as any).libraryItem.name : '';
        return (n && n.length) ? n : (lib && lib.length ? lib : '<anon>');
    }

    private shouldDebugElement(context: ConverterContext, el: FlashElement, baseImageName?: string): boolean {
        if (this.isDebugName(baseImageName)) return true;
        if (this.isDebugName(this.getElementDebugName(el))) return true;
        if (this.isDebugName((el as any).libraryItem?.name)) return true;
        if (context && this.isDebugName(context.symbolPath)) return true;
        return false;
    }

    private safelyExportImage(context: ConverterContext, exportAction: () => SpineImage): SpineImage {
        let containerItem: FlashItem | null = null;
        let curr = context.parent;
        
        while (curr != null) {
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
            if (dom.library.itemExists(containerItem.name)) {
                mustEdit = true;
            }
        }

        if (mustEdit) {
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
        let baseImageName = context.global.shapesCache.get(exportTarget);
        if (baseImageName == null) {
            baseImageName = ConvertUtil.createAttachmentName(context.element, context);
            context.global.shapesCache.set(exportTarget, baseImageName);
        }

        const baseImagePath = this.prepareImagesExportPath(context, baseImageName);
        let spineImage = context.global.imagesCache.get(baseImagePath);
        if (spineImage == null) {
            try {
                const hints = this.createSelectionHints(context);
                Logger.trace(`[IMAGE] Exporting new image: ${baseImageName} (Path: ${baseImagePath})`);
                spineImage = this.safelyExportImage(context, () => {
                    return imageExportFactory(context, baseImagePath);
                });
            } catch (e) {
                Logger.error(`[Converter] Image export error for '${baseImageName}': ${e}. Using placeholder.`);
                spineImage = new SpineImage(baseImagePath, 1, 1, 1, 0, 0, 0, 0);
            }
            context.global.imagesCache.set(baseImagePath, spineImage);
        } else {
            // Logger.trace(`[IMAGE] Cache hit for: ${baseImageName}`);
        }

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

        const debug = this.shouldDebugElement(context, element, baseImageName);
        const elDebugName = this.getElementDebugName(element);
        if (debug) {
            const cm:any = calcMatrix as any;
            const e:any = element as any;
            Logger.trace(`[ATTACH_DBG] '${elDebugName}' Base='${baseImageName}' Stage=${context.global.stageType} Depth=${context.recursionDepth} T=${context.time.toFixed(3)} Path='${context.symbolPath}'`);
            Logger.trace(`[ATTACH_DBG]   Overrides: matrix=${context.matrixOverride ? 'Y' : 'N'} pos=${context.positionOverride ? 'Y' : 'N'} color=${context.colorOverride ? 'Y' : 'N'}`);
            Logger.trace(`[ATTACH_DBG]   RegUsed=(${regX.toFixed(2)}, ${regY.toFixed(2)}) TransUsed=(${transX.toFixed(2)}, ${transY.toFixed(2)}) TP_Local=(${e.transformationPoint?.x?.toFixed ? e.transformationPoint.x.toFixed(2) : 'NA'}, ${e.transformationPoint?.y?.toFixed ? e.transformationPoint.y.toFixed(2) : 'NA'})`);
            Logger.trace(`[ATTACH_DBG]   ElementReg=(${e.x?.toFixed ? e.x.toFixed(2) : 'NA'}, ${e.y?.toFixed ? e.y.toFixed(2) : 'NA'}) ElementTrans=(${e.transformX?.toFixed ? e.transformX.toFixed(2) : 'NA'}, ${e.transformY?.toFixed ? e.transformY.toFixed(2) : 'NA'})`);
            Logger.trace(`[ATTACH_DBG]   MatUsed: a=${cm.a.toFixed(4)} b=${cm.b.toFixed(4)} c=${cm.c.toFixed(4)} d=${cm.d.toFixed(4)} tx=${cm.tx.toFixed(2)} ty=${cm.ty.toFixed(2)}`);
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
        
        let finalAttachmentName = baseImageName;
        const TOLERANCE = 2.0; 
        
        let variants = context.global.attachmentVariants.get(baseImageName);
        if (!variants) {
            variants = [];
            // FIX: Initialize with the newly calculated offset, NOT the spineImage defaults.
            // spineImage.x/y are usually 0 unless set elsewhere.
            // We want the first encounter of this asset to define the "canonical" offset.
            variants.push({ x: spineOffsetX, y: spineOffsetY, name: baseImageName });
            context.global.attachmentVariants.set(baseImageName, variants);

            if (debug) {
                Logger.trace(`[VARIANT_DBG] Init '${baseImageName}': canonicalOffset=(${spineOffsetX.toFixed(2)}, ${spineOffsetY.toFixed(2)}) tol=${TOLERANCE}`);
            }
        }
        
        let found = false;
        let bestDx = Number.POSITIVE_INFINITY;
        let bestDy = Number.POSITIVE_INFINITY;
        let bestName = '';
        for (const v of variants) {
            const dx = Math.abs(v.x - spineOffsetX);
            const dy = Math.abs(v.y - spineOffsetY);
            if (dx + dy < bestDx + bestDy) {
                bestDx = dx;
                bestDy = dy;
                bestName = v.name;
            }

            if (dx < TOLERANCE && dy < TOLERANCE) {
                finalAttachmentName = v.name;
                found = true;
                break;
            }
        }
        
        if (!found) {
            finalAttachmentName = baseImageName + '_' + (variants.length + 1);
            variants.push({ x: spineOffsetX, y: spineOffsetY, name: finalAttachmentName });

            if (debug) {
                Logger.trace(`[VARIANT_DBG] New '${finalAttachmentName}' for '${baseImageName}': offset=(${spineOffsetX.toFixed(2)}, ${spineOffsetY.toFixed(2)}) nearest='${bestName}' dx=${bestDx.toFixed(2)} dy=${bestDy.toFixed(2)} tol=${TOLERANCE} totalVariants=${variants.length}`);
            }
        } else {
            if (debug) {
                Logger.trace(`[VARIANT_DBG] Match '${finalAttachmentName}' for '${baseImageName}': offset=(${spineOffsetX.toFixed(2)}, ${spineOffsetY.toFixed(2)}) nearest='${bestName}' dx=${bestDx.toFixed(2)} dy=${bestDy.toFixed(2)} tol=${TOLERANCE} totalVariants=${variants.length}`);
            }
        }

        if (debug) {
            Logger.trace(`[ATTACH_DBG]   SpineOffset=(${spineOffsetX.toFixed(2)}, ${spineOffsetY.toFixed(2)}) FinalAttachment='${finalAttachmentName}' Variants=${variants.length}`);
        }

        const subcontext = context.createSlot(context.element);
        const slot = subcontext.slot;

        Logger.trace(`[SLOT] Created/Retrieved slot '${slot.name}' for '${baseImageName}' (Stage: ${context.global.stageType})`);

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

            let timeline: FlashTimeline | null = null;

            // Prefer the active (live) timeline: this works both on stage and in edit mode.
            // It also fixes nested symbol sampling where walking parent.libraryItem.timeline
            // cannot ever contain the child's layer object.
            try {
                const activeTl = this._document.getTimeline();
                if (activeTl && activeTl.layers) {
                    for (let i = 0; i < activeTl.layers.length; i++) {
                        if (activeTl.layers[i] === layer) {
                            timeline = activeTl;
                            break;
                        }
                    }
                }
            } catch (e) {
                // ignore
            }

            // Fallback: attempt to locate the layer in an ancestor's library timeline.
            // This path is useful if we are not in edit mode for some reason.
            if (!timeline) {
                let curr = context.parent;
                while(curr) {
                    if (curr.element && curr.element.libraryItem && curr.element.libraryItem.timeline) {
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
                // Prefer the active timeline frame when available. This is important for
                // sampling tweened (in-between) frames.
                frameIndex: (timeline && typeof (timeline as any).currentFrame === 'number') ? (timeline as any).currentFrame : frame.startFrame,
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

    private getLiveTransform(context: ConverterContext, frameIndex: number): { matrix: FlashMatrix, transformX: number, transformY: number, colorAlpha?: number, colorRed?: number, colorMode?: string } | null {
        const dom = this._document;
        const timeline = dom.getTimeline();
        
        try {
            timeline.currentFrame = frameIndex;
            const hints = this.createSelectionHints(context);
            if (!hints) {
                const dn = this.getElementDebugName(context.element);
                if (this.isDebugName(dn) || this.isDebugName(context.symbolPath)) {
                    Logger.trace(`    [LIVE_DBG] No selection hints for '${dn}' at frame ${frameIndex}. Path='${context.symbolPath}'`);
                }
                return null;
            }

            const isDbg = this.shouldDebugElement(context, context.element, undefined);
            if (isDbg) {
                Logger.trace(`    [LIVE_DBG] Hints for '${this.getElementDebugName(context.element)}' @${frameIndex}: layerIdx=${hints.layerIndex} frameIdx=${hints.frameIndex} elIdx=${hints.elementIndex} tl='${timeline.name}'`);
            }

            // Aggressively ensure the layer is visible and unlocked for selection
            const layer = timeline.layers[hints.layerIndex];
            const wasLocked = layer.locked;
            const wasVisible = layer.visible;
            layer.locked = false;
            layer.visible = true;

            dom.selectNone();
            const frame = layer.frames[frameIndex];
            if (!frame) {
                layer.locked = wasLocked;
                layer.visible = wasVisible;
                return null;
            }

            const el = frame.elements[hints.elementIndex];
            if (!el) {
                Logger.trace(`    [LIVE] No element at index ${hints.elementIndex} on layer ${hints.layerIndex} frame ${frameIndex}`);
                layer.locked = wasLocked;
                layer.visible = wasVisible;
                return null;
            }

            // In some Animate tween setups, the element index can shift in in-between frames
            // (e.g. additional helper instances). If we are debugging and selection is failing,
            // try to locate by name within the frame.
            if (isDbg && this.isDebugName(this.getElementDebugName(context.element))) {
                const expectedName = this.getElementDebugName(context.element);
                if (expectedName && expectedName !== '<anon>' && expectedName !== this.getElementDebugName(el) && frame.elements && frame.elements.length > 1) {
                    for (let i = 0; i < frame.elements.length; i++) {
                        const cand = frame.elements[i];
                        if (this.getElementDebugName(cand) === expectedName) {
                            // Override the target element for selection.
                            (hints as any).elementIndex = i;
                            if (isDbg) Logger.trace(`    [LIVE_DBG] elementIndex remap: ${hints.elementIndex} -> ${i} (name match '${expectedName}')`);
                            break;
                        }
                    }
                }
            }

            if (isDbg) {
                const elName = this.getElementDebugName(el);
                Logger.trace(`    [LIVE_DBG] FrameEl '${elName}' type=${(el as any).elementType}/${(el as any).instanceType || ''} layer='${layer.name}' frame.start=${frame.startFrame} tween='${frame.tweenType}'`);
            }
            
            el.selected = true;
            
            // Selection sometimes fails in JSFL if not forced
            if (dom.selection.length === 0) {
                dom.selection = [el];
            }

            if (isDbg) {
                Logger.trace(`    [LIVE_DBG] Selection count=${dom.selection.length} after select for '${this.getElementDebugName(el)}' @${frameIndex}`);
            }

            if (dom.selection.length > 0) {
                const selected = dom.selection[0];
                if (isDbg) {
                    const sm:any = selected.matrix as any;
                    Logger.trace(`    [LIVE_DBG] Selected '${this.getElementDebugName(selected)}' @${frameIndex}: tx=${sm.tx.toFixed(2)} ty=${sm.ty.toFixed(2)} a=${sm.a.toFixed(4)} d=${sm.d.toFixed(4)} alpha=${(selected as any).colorAlphaPercent}`);
                }
                const res = {
                    matrix: selected.matrix,
                    transformX: selected.transformX,
                    transformY: selected.transformY,
                    // Capture live color data for debugging
                    colorAlpha: selected.colorAlphaPercent,
                    colorRed: selected.colorRedPercent,
                    colorMode: selected.colorMode
                };
                layer.locked = wasLocked;
                layer.visible = wasVisible;
                return res;
            } else {
                Logger.trace(`    [LIVE] Selection failed for '${el.name || '<anon>'}' at frame ${frameIndex} even after forcing.`);
            }

            layer.locked = wasLocked;
            layer.visible = wasVisible;
        } catch (e) {
            Logger.warning(`[Converter] LiveTransform failed for frame ${frameIndex} (Layer ${context.layer?.name}): ${e}`);
        }
        return null;
    }

    private convertCompositeElement(context:ConverterContext):void {
        const item = context.element.libraryItem;
        if (!item) return;

        const indent = this.getIndent(context.recursionDepth);
        Logger.trace(`${indent}[STRUCT] Symbol: ${item.name} (Depth: ${context.recursionDepth})`);

        if (context.recursionDepth > 32) {
            Logger.warning(`${indent}[WARN] Max recursion depth reached for ${item.name}. Skipping.`);
            return;
        }
        
        let canEdit = false;
        let mustRestoreContext = false;
        const currentTl = this._document.getTimeline();
        
        if (currentTl.name !== item.name) {
            if (this._document.library.itemExists(item.name)) {
                // ALWAYS enter edit mode to enable "Live" matrix sampling for all depths.
                // This ensures nested tweens are correctly interpolated.
                this._document.library.editItem(item.name);
                canEdit = true;
                mustRestoreContext = true;
            }
        } else {
            canEdit = true; 
        }

        try {
            const timeline = canEdit ? this._document.getTimeline() : item.timeline;
            const layers = timeline.layers;

            // SAVE CONTEXT FRAME: Prevent frame leaks between layers
            const savedFrame = context.frame;

            for (let i = layers.length - 1; i >= 0; i--) {
                const layer = layers[i];
                
                // RESTORE CONTEXT FRAME: Ensure each layer starts with the correct parent frame context
                context.frame = savedFrame;

                if (!layer.visible) {
                    Logger.trace(`${indent}  [LAYER] Skipping Hidden Layer: ${layer.name}`);
                    continue;
                }

                Logger.trace(`${indent}  [LAYER] Processing: ${layer.name} (Type: ${layer.layerType})`);

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

    private hideLayerSlots(context: ConverterContext, layer: FlashLayer, time: number): void {
        const slots = context.global.layersCache.get(layer);
        const indent = this.getIndent(context.recursionDepth);
        if (slots && slots.length > 0) {
            for (const s of slots) {
                Logger.trace(`${indent}    [Visibility] Hiding slot '${s.name}' at Time ${time.toFixed(3)} (Layer: ${layer.name})`);
                SpineAnimationHelper.applySlotAttachment(context.global.animation, s, context, null, time);
                
                // Also hide all children slots recursively
                this.hideChildSlots(context, s.bone, time);
            }
        }

        // Fix: Also hide slots associated with bones on this layer (for nested symbols)
        const bones = context.global.layerBonesCache.get(layer);
        if (bones && bones.length > 0) {
            for (const b of bones) {
                Logger.trace(`${indent}    [Visibility] Hiding children of bone '${b.name}' at Time ${time.toFixed(3)} (Layer: ${layer.name})`);
                this.hideChildSlots(context, b, time);
            }
        }
    }

    private hideChildSlots(context: ConverterContext, parentBone: any, time: number): void {
        const skeleton = context.global.skeleton;
        const animation = context.global.animation;
        for (let i = 0; i < skeleton.slots.length; i++) {
            const slot = skeleton.slots[i];
            
            // Optimization: slot.bone.name.indexOf(parentBone.name + "/") === 0 
            // would also work if we used naming conventions strictly.
            // But checking the actual parent reference is safer.
            
            let curr = slot.bone;
            while (curr) {
                if (curr === parentBone) {
                    SpineAnimationHelper.applySlotAttachment(animation, slot, context, null, time);
                    break;
                }
                curr = curr.parent;
            }
        }
    }

    private convertElementLayer(context:ConverterContext, layer:FlashLayer, factory:LayerConvertFactory, allowBaking:boolean = true):void {
        const { label, stageType, frameRate } = context.global;
        let start = 0, end = layer.frames.length - 1;
        
        const indent = this.getIndent(context.recursionDepth);

        let isNestedFlattening = false;
        let targetFrame = 0;

        if (context.parent == null && label != null && stageType === ConverterStageType.ANIMATION) {
            start = label.startFrameIdx;
            end = label.endFrameIdx;
        } else if (context.parent != null && stageType === ConverterStageType.ANIMATION) {
            try {
                const instance = context.element as any;
                // FIX: Check context.frame instead of context.parent.frame
                // We rely on the current context's frame/internalFrame to determine state relative to parent
                if (instance && instance.libraryItem && instance.libraryItem.timeline && context.frame) {
                    const tl = instance.libraryItem.timeline;
                    
                    // NESTED TIME RESOLUTION:
                    // Use THIS context's internal frame (passed from parent's loop) to determine playhead position.
                    // This ensures "Animations in Animations" stay in sync because context.internalFrame IS the parent's current frame index.
                    const parentInternalFrame = (context.internalFrame !== undefined) ? context.internalFrame : 0;
                    const parentKeyframeStart = context.frame.startFrame;
                    const frameOffset = Math.max(0, parentInternalFrame - parentKeyframeStart);
                    
                    const firstFrame = (instance.firstFrame !== undefined) ? instance.firstFrame : 0;
                    const loopMode = (instance.loop !== undefined) ? instance.loop : 'loop'; 
                    const tlFrameCount = tl.frameCount;
                    
                    if (tlFrameCount <= 0) return;
                    
                    if (loopMode === 'single frame') {
                        targetFrame = firstFrame;
                    } else if (loopMode === 'play once') {
                        targetFrame = firstFrame + frameOffset;
                        if (targetFrame >= tlFrameCount) targetFrame = tlFrameCount - 1;
                    } else { // loop
                        targetFrame = (firstFrame + frameOffset) % tlFrameCount;
                    }
                    
                    Logger.trace(`${indent}    [NESTED] Instance: ${instance.name || instance.libraryItem.name} Loop: ${loopMode} FirstFrame: ${firstFrame} ParentFrame: ${parentInternalFrame} Offset: ${frameOffset} Target: ${targetFrame}/${tlFrameCount}`);

                    if (targetFrame >= 0 && targetFrame < layer.frames.length) {
                        isNestedFlattening = true;
                        start = targetFrame;
                        end = targetFrame;
                    } else {
                        return;
                    }
                }
            } catch (e) {}
        }
        
        if (isNestedFlattening) {
            const frame = layer.frames[start];
            if (!frame) return;

            const time = context.timeOffset;
            Logger.trace(`${indent}  [FLATTEN] ${layer.name} Frame: ${start} (Time: ${time.toFixed(3)}) (context.time: ${context.time.toFixed(3)})`);
            if (frame.elements.length === 0) {
                if (stageType === ConverterStageType.ANIMATION) {
                    this.hideLayerSlots(context, layer, time);
                }
                return; 
            }

            for (let eIdx = 0; eIdx < frame.elements.length; eIdx++) {
                let el = frame.elements[eIdx];
                
                let matrixOverride: FlashMatrix = null;
                let positionOverride: {x:number, y:number} = null;
                
                if (stageType === ConverterStageType.ANIMATION) {
                    const elName = el.name || el.libraryItem?.name || '<anon>';
                    
                    // SAVE CONTEXT STATE: getLiveTransform uses switchContext... which mutates the context
                    const savedElement = context.element;
                    const savedFrame = context.frame;
                    
                    const live = this.getLiveTransform(context.switchContextFrame(frame).switchContextElement(el), start);
                    
                    // RESTORE CONTEXT STATE
                    context.element = savedElement;
                    context.frame = savedFrame;

                    if (live) {
                        Logger.trace(`${indent}    [LIVE] Sampled '${elName}' at frame ${start}: tx=${live.matrix.tx.toFixed(2)} ty=${live.matrix.ty.toFixed(2)}`);
                        matrixOverride = live.matrix;
                        positionOverride = { x: live.transformX, y: live.transformY };
                    } else {
                        Logger.trace(`${indent}    [LIVE] Sampling failed for '${elName}' at frame ${start}. Using context matrix.`);
                    }
                }

                // FIX: When flattening, we pass 0 as time because context.time is already absolute for Spine.
                const sub = context.switchContextFrame(frame).createBone(el, 0, matrixOverride, positionOverride);
                sub.internalFrame = start; // Store the calculated internal frame for child symbols
                if (el.elementType === 'instance' && el.instanceType === 'symbol' && stageType === ConverterStageType.ANIMATION) {
                    const instance = el as any;
                    const firstFrameOffset = (instance.firstFrame || 0) / frameRate;
                    // timeOffset must be set relative to the new sub-context's absolute time
                    sub.timeOffset = sub.time - firstFrameOffset;
                }
                factory(sub);
            }
            return;
        }

        Logger.trace(`${indent}  [LOOP] ${layer.name}: Start=${start} End=${end}`);
        for (let i = start; i <= end; i++) {
            let time = (i - start) / frameRate;
            time += context.timeOffset;

            if (i < 0 || i >= layer.frames.length || !layer.frames[i]) {
                if (stageType === ConverterStageType.ANIMATION) {
                    this.hideLayerSlots(context, layer, time);
                }
                continue;
            }

            const frame = layer.frames[i];
            if (!frame) continue;
            
            Logger.trace(`${indent}  [STEP] Frame: ${i} (Time: ${time.toFixed(3)})`);
            if (this._config.exportFrameCommentsAsEvents && frame.labelType === 'comment') {
                context.global.skeleton.createEvent(frame.name);
                if (stageType === ConverterStageType.ANIMATION) SpineAnimationHelper.applyEventAnimation(context.global.animation, frame.name, time);
            }
            
            if (frame.elements.length === 0) {
                if (stageType === ConverterStageType.ANIMATION) {
                    this.hideLayerSlots(context, layer, time);
                }
                continue;
            }
            
            const activeSlots: any[] = [];
            for (let eIdx = 0; eIdx < frame.elements.length; eIdx++) {
                let el = frame.elements[eIdx];
                const elName = el.name || el.libraryItem?.name || '<anon>';
                if (stageType === ConverterStageType.ANIMATION) {
                    Logger.trace(`${indent}    [ELEM] Processing element '${elName}' at Frame ${i} (Start: ${frame.startFrame})`);
                }

                let parentMat: FlashMatrix = null;
                if (layer.parentLayer) {
                    this._document.getTimeline().currentFrame = i;
                    parentMat = this.getLayerParentMatrix(layer, i);
                }

                let bakedData: { matrix: FlashMatrix, transformX: number, transformY: number, colorAlpha?: number, colorRed?: number, colorMode?: string } | null = null;

                if (i !== frame.startFrame) {
                    const isClassic = frame.tweenType === 'classic';
                    const isGuided = (layer.parentLayer && layer.parentLayer.layerType === 'guide');
                    let isSupportedEase = !frame.hasCustomEase;

                    // DEBUG: Detailed Logging for Yellow/Glow/Dash elements
                    if (elName.toLowerCase().indexOf('yellow') !== -1 || elName.toLowerCase().indexOf('glow') !== -1 || elName.toLowerCase().indexOf('dash') !== -1) {
                         const shouldBake = !(!allowBaking || (isClassic && !isGuided && isSupportedEase));
                         Logger.trace(`[DEBUG_ANIM] Element '${elName}' Frame ${i} (Start: ${frame.startFrame}): TweenType='${frame.tweenType}' Classic=${isClassic} Guided=${isGuided} SupportedEase=${isSupportedEase} -> BAKING=${shouldBake}`);
                         Logger.trace(`[DEBUG_ANIM]   Frame Values: Alpha=${el.colorAlphaPercent} Matrix=[a:${el.matrix.a.toFixed(2)}, tx:${el.matrix.tx.toFixed(2)}]`);
                    }

                    if (!allowBaking || (isClassic && !isGuided && isSupportedEase)) {
                        // Skip baking, let Spine interpolate
                        // But we MUST still mark the slot as active!
                        // Recursively discover the slot name
                        const sub = context.switchContextFrame(frame).createBone(el, time, null, null);
                        if (el.elementType === 'instance' && el.instanceType === 'symbol' && stageType === ConverterStageType.ANIMATION) {
                             const instance = el as any;
                             const firstFrameOffset = (instance.firstFrame || 0) / frameRate;
                             sub.timeOffset = time - firstFrameOffset;
                        }
                        
                        let tempSlot: any = null;
                        const originalCreateSlot = sub.createSlot;
                        sub.createSlot = (element: FlashElement) => {
                            const res = originalCreateSlot.call(sub, element);
                            tempSlot = res.slot;
                            return res;
                        };
                        
                        // We need to call factory to ensure the slot is created/retrieved
                        factory(sub);
                        if (tempSlot) activeSlots.push(tempSlot);
                        continue;
                    }

                    if (allowBaking) {
                        if (context.recursionDepth > 0) {
                            // SAVE CONTEXT STATE
                            const savedElement = context.element;
                            const savedFrame = context.frame;

                            bakedData = this.getLiveTransform(context.switchContextFrame(frame).switchContextElement(el), i);
                            
                            if (bakedData && (elName.toLowerCase().indexOf('yellow') !== -1 || elName.toLowerCase().indexOf('glow') !== -1)) {
                                Logger.trace(`[DEBUG_ANIM]   BAKED Live Transform: Alpha=${bakedData.colorAlpha} Matrix=[a:${bakedData.matrix.a.toFixed(2)}, tx:${bakedData.matrix.tx.toFixed(2)}]`);
                            }

                            // RESTORE CONTEXT STATE
                            context.element = savedElement;
                            context.frame = savedFrame;
                        } else {
                            // ... depth 0 baking ...
                            this._document.getTimeline().currentFrame = i;
                            const wasLocked = layer.locked;
                            const wasVisible = layer.visible;
                            layer.locked = false;
                            layer.visible = true;
                            
                            const timeline = this._document.getTimeline();
                            // Force update "Live" view before baking
                            if (this._document.livePreview !== undefined) this._document.livePreview = true;

                            let layerIdx = -1;
                            for (let k = 0; k < timeline.layers.length; k++) {
                                if (timeline.layers[k] === layer) { layerIdx = k; break; }
                            }
                            if (layerIdx === -1) {
                                for (let k = 0; k < timeline.layers.length; k++) {
                                    if (timeline.layers[k].name === layer.name) { layerIdx = k; break; }
                                }
                            }

                            if (layerIdx !== -1) {
                                timeline.setSelectedLayers(layerIdx); 
                            }
                            timeline.setSelectedFrames(i, i + 1);

                            try {
                                timeline.convertToKeyframes();
                                const freshLayer = timeline.layers[layerIdx];
                                const freshFrame = freshLayer.frames[i];
                                if (freshFrame.elements.length > 0) {
                                    const bakedEl = freshFrame.elements[0];
                                    
                                    // EXTENDED DEBUGGING FOR DEPTH 0 BAKING
                                    if (elName.toLowerCase().indexOf('yellow') !== -1 || elName.toLowerCase().indexOf('glow') !== -1) {
                                        let filtersLog = "None";
                                        if (bakedEl.filters && bakedEl.filters.length > 0) {
                                            filtersLog = bakedEl.filters.map((f:any) => f.name).join(",");
                                        }
                                        
                                        // Check if it's a Symbol Instance
                                        const typeLog = (bakedEl.elementType === 'instance') ? `Instance(${bakedEl.instanceType})` : bakedEl.elementType;
                                        
                                        Logger.trace(`[BAKE_D0] Frame ${i}: Type=${typeLog} Mode=${bakedEl.colorMode} Alpha%=${bakedEl.colorAlphaPercent} Filters=[${filtersLog}]`);
                                        
                                        // Dump Motion XML if Alpha is static 100 but expected to change
                                        if (bakedEl.colorAlphaPercent === 100 && bakedEl.colorMode === 'none') {
                                            if (frame.hasCustomEase || frame.tweenType === 'motion') {
                                                // JSFL API for Motion Object is notoriously weird.
                                                // Try checking if there's a Motion Object on the ORIGINAL frame
                                                // (which we can't access easily here as we just destroyed it with convertToKeyframes)
                                                // But we can check if the NEW element has anything.
                                            }
                                        }
                                    }

                                    bakedData = {
                                        matrix: bakedEl.matrix,
                                        transformX: bakedEl.transformX,
                                        transformY: bakedEl.transformY,
                                        colorAlpha: bakedEl.colorAlphaPercent,
                                        colorMode: bakedEl.colorMode,
                                        colorRed: bakedEl.colorRedPercent // Capture red for tint checks
                                    };
                                }
                            } catch (e) {
                                Logger.warning(`[Converter] Bake failed for frame ${i} (${layer.name}): ${e}`);
                            }
                            
                            if (!bakedData) {
                                this._document.selectNone();
                                el.selected = true;
                                if (this._document.selection.length > 0) {
                                    const proxy = this._document.selection[0];
                                    bakedData = {
                                        matrix: proxy.matrix,
                                        transformX: proxy.transformX,
                                        transformY: proxy.transformY,
                                        colorAlpha: proxy.colorAlphaPercent,
                                        colorMode: proxy.colorMode
                                    };
                                }
                            }
                            
                            layer.locked = wasLocked;
                            layer.visible = wasVisible;
                        }
                    } 
                } else {
                    if (allowBaking) {
                        this._document.getTimeline().currentFrame = i;
                    }
                }

                let finalMatrixOverride: FlashMatrix = null;
                let finalPositionOverride: {x:number, y:number} = null;
                // Capture Color Override from Baked Data
                let finalColorOverride: IColorData = null;

                const sourceMatrix = bakedData ? bakedData.matrix : el.matrix;
                const sourceTransX = bakedData ? bakedData.transformX : el.transformX;
                const sourceTransY = bakedData ? bakedData.transformY : el.transformY;

                if (bakedData && bakedData.colorMode) {
                     // Normalize Color Data
                     finalColorOverride = {
                         visible: el.visible, // Baked element should be visible
                         alphaPercent: bakedData.colorAlpha !== undefined ? bakedData.colorAlpha : 100,
                         alphaAmount: 0, // JSFL live selection doesn't easily expose advanced color amounts, assume 0 for amount if unavailable
                         redPercent: bakedData.colorRed !== undefined ? bakedData.colorRed : 100,
                         redAmount: 0,
                         greenPercent: 100, // Partial capture in getLiveTransform, assuming uniformed tint if RGB not fully exposed
                         greenAmount: 0,
                         bluePercent: 100,
                         blueAmount: 0
                     };
                     
                     // If we have full color mode support (alpha/tint), refine above. 
                     // For now, mapping alpha is the critical part for the reported bug.
                }

                if (parentMat) {
                    finalMatrixOverride = this.concatMatrix(sourceMatrix, parentMat);
                    finalPositionOverride = {
                        x: sourceTransX * parentMat.a + sourceTransY * parentMat.c + parentMat.tx,
                        y: sourceTransX * parentMat.b + sourceTransY * parentMat.d + parentMat.ty
                    };
                } else if (bakedData) {
                    finalMatrixOverride = sourceMatrix;
                    finalPositionOverride = { x: sourceTransX, y: sourceTransY };
                }

                // Pass finalColorOverride to createBone
                const sub = context.switchContextFrame(frame).createBone(el, time, finalMatrixOverride, finalPositionOverride, finalColorOverride);
                // Register bone to layer for visibility tracking (Structure Phase or Animation Phase if missed)
                if (sub.bone) {
                    let bones = context.global.layerBonesCache.get(layer);
                    if (!bones) {
                        bones = [];
                        context.global.layerBonesCache.set(layer, bones);
                    }
                    if (bones.indexOf(sub.bone) === -1) {
                        bones.push(sub.bone);
                    }
                }

                sub.internalFrame = i; // Fix: Pass current loop index as internal frame for nested time resolution
                Logger.trace(`${indent}    [INTERNAL] Passed internal frame ${i} to child '${el.name || el.libraryItem?.name || '<anon>'}'`);
                
                if (el.elementType === 'instance' && el.instanceType === 'symbol' && stageType === ConverterStageType.ANIMATION) {
                    const instance = el as any;
                    const firstFrameOffset = (instance.firstFrame || 0) / frameRate;
                    sub.timeOffset = time - firstFrameOffset;
                }

                let frameSlot: any = null;
                const originalCreateSlot = sub.createSlot;
                sub.createSlot = (element: FlashElement) => {
                    const res = originalCreateSlot.call(sub, element);
                    frameSlot = res.slot;
                    return res;
                };

                factory(sub);
                if (frameSlot) activeSlots.push(frameSlot);
                
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

            // VISIBILITY FIX: Hide inactive slots on this layer
            if (stageType === ConverterStageType.ANIMATION) {
                const allLayerSlots = context.global.layersCache.get(layer);
                if (allLayerSlots) {
                    for (let sIdx = 0; sIdx < allLayerSlots.length; sIdx++) {
                        const s = allLayerSlots[sIdx];
                        let isActive = false;
                        for (let aIdx = 0; aIdx < activeSlots.length; aIdx++) {
                            if (activeSlots[aIdx] === s) { isActive = true; break; }
                        }
                        
                        if (!isActive) {
                            Logger.trace(`${indent}    [Visibility] Auto-hiding inactive slot '${s.name}' at Time ${time.toFixed(3)} (Layer: ${layer.name})`);
                            SpineAnimationHelper.applySlotAttachment(context.global.animation, s, context, null, time);
                            this.hideChildSlots(context, s.bone, time);
                        }
                    }
                }
            }
        }
    }

    private convertElement(context:ConverterContext):void {
        const indent = this.getIndent(context.recursionDepth);
        Logger.trace(`${indent}[CONVERT] Path: ${context.symbolPath} (Depth: ${context.recursionDepth})`);

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

        const parentLayer = layer.parentLayer;
        const parentGlobal = this.getLayerParentMatrix(parentLayer, frameIndex);
        const parentFrame = parentLayer.frames[frameIndex];
        
        if (!parentFrame || parentFrame.elements.length === 0) {
            Logger.trace(`    [PARENTING] Layer '${layer.name}' has empty parent layer '${parentLayer.name}' at frame ${frameIndex}.`);
            return parentGlobal;
        }

        const wasLocked = parentLayer.locked;
        const wasVisible = parentLayer.visible;
        parentLayer.locked = false;
        parentLayer.visible = true;

        const el = parentFrame.elements[0];
        const elName = el.name || el.libraryItem?.name || '<anon>';
        
        let layerIdx = -1;
        const layers = this._document.getTimeline().layers;
        for (let k = 0; k < layers.length; k++) {
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
                
                let finalMat = el.matrix;
                if (this._document.selection.length > 0) {
                    finalMat = this._document.selection[0].matrix;
                }
                
                Logger.trace(`    [PARENTING] Resolved parent '${parentLayer.name}' (${elName}) at frame ${frameIndex}. Raw Child Mat: a=${el.matrix.a.toFixed(2)} tx=${el.matrix.tx.toFixed(2)}. Final Mat: a=${finalMat.a.toFixed(2)} tx=${finalMat.tx.toFixed(2)} ty=${finalMat.ty.toFixed(2)}`);

                parentLayer.locked = wasLocked;

            parentLayer.visible = wasVisible;
            
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
