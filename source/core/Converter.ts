import { Logger } from '../logger/Logger';
import { SpineClippingAttachment } from '../spine/attachment/SpineClippingAttachment';
import { SpineRegionAttachment } from '../spine/attachment/SpineRegionAttachment';
import { SpineAnimationHelper } from '../spine/SpineAnimationHelper';
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

    //-----------------------------------

    private convertElementSlot(context:ConverterContext, exportTarget:FlashElement | FlashItem, imageExportFactory:ImageExportFactory):void {
        let imageName = context.global.shapesCache.get(exportTarget);

        Logger.trace(`[Slot] Converting slot for ${context.element.name || '<anon>'} (Image: ${imageName || 'new'})`);

        if (imageName == null) {
            imageName = ConvertUtil.createAttachmentName(context.element, context);
            context.global.shapesCache.set(exportTarget, imageName);
        }

        //-----------------------------------

        const { slot } = context.createSlot(context.element);

        if (context.global.stageType === ConverterStageType.STRUCTURE) {
            if (context.clipping != null) {
                context.clipping.end = slot;
            }

            return;
        }

        //-----------------------------------

        const imagePath = this.prepareImagesExportPath(context, imageName);
        const attachmentName = this.prepareImagesAttachmentName(context, imageName);
        const attachment = slot.createAttachment(attachmentName, SpineAttachmentType.REGION) as SpineRegionAttachment;

        //-----------------------------------

        let spineImage = context.global.imagesCache.get(imagePath);

        if (spineImage == null) {
            spineImage = imageExportFactory(context, imagePath);
            context.global.imagesCache.set(imagePath, spineImage);
        }

        //-----------------------------------

        attachment.width = spineImage.width;
        attachment.height = spineImage.height;
        attachment.scaleX = 1 / spineImage.scale;
        attachment.scaleY = 1 / spineImage.scale;

        const tp = context.element.transformationPoint;
        const pivotX = tp ? tp.x : 0;
        const pivotY = tp ? tp.y : 0;
        attachment.x = spineImage.x - pivotX;
        attachment.y = spineImage.y + pivotY;

        Logger.trace(`  Image Pos: (${spineImage.x.toFixed(2)}, ${spineImage.y.toFixed(2)}) Size: ${spineImage.width}x${spineImage.height}`);
        Logger.trace(`  Pivot: (${pivotX.toFixed(2)}, ${pivotY.toFixed(2)})`);
        Logger.trace(`  Attachment Offset: (${attachment.x.toFixed(2)}, ${attachment.y.toFixed(2)})`);

        //-----------------------------------

        SpineAnimationHelper.applySlotAttachment(
            context.global.animation,
            slot,
            context,
            attachment,
            context.time
        );
    }

    //-----------------------------------

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

        //-----------------------------------

        const { slot } = context.createSlot(context.element);
        const attachment = slot.createAttachment(attachmentName, SpineAttachmentType.CLIPPING) as SpineClippingAttachment;
        context.clipping = attachment;

        //-----------------------------------

        attachment.vertices = ShapeUtil.extractVertices(context.element, 32, matrix, controlOffset); // Use 32 segments for resolution
        attachment.vertexCount = attachment.vertices != null ? attachment.vertices.length / 2 : 0;

        if (attachment.vertexCount === 0) {
            Logger.warning('Mask has no vertices: ' + slot.name);
        }

        //-----------------------------------

        if (context.global.stageType === ConverterStageType.STRUCTURE) {
            const endSlot = context.global.skeleton.findSlot(slot.name);
            attachment.end = endSlot;
            return;
        }

        //-----------------------------------

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
                return ImageUtil.exportInstance(imagePath, context.element, this._document, this._config.shapeExportScale, this._config.exportShapes);
            }
        );
    }

    //-----------------------------------

    private composeElementMaskLayer(context:ConverterContext, convertLayer:FlashLayer):void {
        this.convertElementLayer(
            context.switchContextLayer(convertLayer), convertLayer,
            (subcontext) => {
                const type = subcontext.element.elementType;
                
                if (type === 'shape') {
                    // For raw shapes on stage, they are relative to (0,0) of the stage/timeline.
                    // If the bone uses the shape's transform, we might need to adjust, 
                    // but usually raw shapes just work if they don't have a matrix.
                    // However, if the shape has been moved, it has a matrix.
                    // Vertices are relative to the shape's origin.
                    this.convertShapeMaskElementSlot(subcontext, subcontext.element.matrix, null);
                    context.clipping = subcontext.clipping;
                } else if (type === 'instance') {
                    const innerShape = this.findFirstShapeInSymbol(subcontext.element);
                    
                    if (innerShape) {
                        // Temporarily swap the element to the inner shape to extract vertices
                        const originalElement = subcontext.element;
                        
                        // Calculate offset matrix
                        // Vertices from innerShape are relative to Symbol Origin (Registration Point, 0,0)
                        // Bone is at Symbol Transformation Point (TP)
                        // We need Vertices relative to Bone = Vertices - (TP - RegPoint)
                        // RegPoint is at (matrix.tx, matrix.ty)
                        // TP is at (element.x, element.y)
                        // So Offset = RegPoint - TP
                        // Final Vertex = InnerVertex + Offset
                        
                        const maskMatrix = originalElement.matrix;
                        const tp = originalElement.transformationPoint; // .x, .y same as element.x, element.y
                        
                        // Default inner matrix (if raw shape) is identity
                        const im = innerShape.matrix || { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
                        
                        // Calculate the delta between RegPoint and TransPoint
                        const deltaX = maskMatrix.tx - tp.x;
                        const deltaY = maskMatrix.ty - tp.y;
                        
                        // Combine: InnerShape.tx + Delta - MaskPosition (to make it relative to Bone)
                        const offsetMatrix = {
                            a: im.a,
                            b: im.b,
                            c: im.c,
                            d: im.d,
                            tx: im.tx + deltaX - maskMatrix.tx,
                            ty: im.ty + deltaY - maskMatrix.ty
                        };

                        const controlOffset: {x: number, y: number} = null;

                        subcontext.element = innerShape;
                        this.convertShapeMaskElementSlot(subcontext, offsetMatrix, controlOffset);
                        subcontext.element = originalElement;
                        
                        context.clipping = subcontext.clipping;
                    } else {
                        Logger.warning(`Mask symbol "${subcontext.element.name}" contains no vector shapes! Masking will fail.`);
                    }
                } else {
                    Logger.warning(`Mask element is not a shape! Type: ${type}. Masking may fail. Ensure mask layer contains only raw vector shapes or a simple graphic symbol.`);
                }
            }
        );
    }

    private findFirstShapeInSymbol(instance: FlashElement): FlashElement | null {
        if (!instance.libraryItem || !instance.libraryItem.timeline) return null;
        
        const timeline = instance.libraryItem.timeline;
        for (const layer of timeline.layers) {
            // Only check normal layers
            if (layer.layerType !== 'normal') continue;
            
            for (const frame of layer.frames) {
                for (const element of frame.elements) {
                    if (element.elementType === 'shape') {
                        return element;
                    }
                }
            }
        }
        return null;
    }

    private disposeElementMaskLayer(context:ConverterContext):void {
        context.clipping = null;
    }

    //-----------------------------------

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

                if (elementType === 'shape') {
                    this.convertShapeElementSlot(subcontext);
                }

                if (elementType === 'text') {
                    if (this._config.exportTextAsShapes) {
                        this.convertShapeElementSlot(subcontext);
                    }
                }

                if (elementType === 'instance') {
                    if (instanceType === 'bitmap') {
                        this.convertBitmapElementSlot(subcontext);
                    }

                    if (instanceType === 'symbol') {
                        this.convertElement(subcontext);
                    }
                }
            }
        );
    }

    private convertCompositeElement(context:ConverterContext):void {
        const timeline = context.element.libraryItem.timeline;
        const layers = timeline.layers;

        for (let layerIdx = layers.length - 1; layerIdx >= 0; layerIdx--) {
            const layer = layers[layerIdx];

            if (layer.layerType === 'normal') {
                this.convertCompositeElementLayer(context, layer);
                continue;
            }

            if (layer.layerType === 'masked') {
                const maskLayer = LayerMaskUtil.extractTargetMask(layers, layerIdx);

                if (maskLayer == null) {
                    Logger.warning('No mask layer found for masked layer: ' + layer.name);
                } else {
                    this.composeElementMaskLayer(context, maskLayer);
                }

                this.convertCompositeElementLayer(context, layer);
                continue;
            }

            if (layer.layerType === 'mask') {
                this.disposeElementMaskLayer(context);
            }
        }
    }

    //-----------------------------------

    private convertElementLayer(context:ConverterContext, convertLayer:FlashLayer, layerConvertFactory:LayerConvertFactory):void {
        const { label, stageType } = context.global;
        const frames = convertLayer.frames;

        let startFrameIdx = 0;
        let endFrameIdx = frames.length - 1;

        if (context.parent == null && label != null && stageType === ConverterStageType.ANIMATION) {
            startFrameIdx = label.startFrameIdx;
            endFrameIdx = label.endFrameIdx;
        }

        for (let frameIdx = startFrameIdx; frameIdx <= endFrameIdx; frameIdx++) {
            const frameTime = (frameIdx - startFrameIdx) / context.global.frameRate;
            const frame = frames[frameIdx];

            if (frame == null || frame.startFrame !== frameIdx) {
                continue;
            }

            if (this._config.exportFrameCommentsAsEvents && frame.labelType === 'comment') {
                context.global.skeleton.createEvent(frame.name);

                if (stageType === ConverterStageType.ANIMATION) {
                    SpineAnimationHelper.applyEventAnimation(
                        context.global.animation,
                        frame.name,
                        frameTime
                    );
                }
            }

            if (frame.elements.length === 0) {
                const layerSlots = context.global.layersCache.get(context.layer);

                if (layerSlots != null && stageType === ConverterStageType.ANIMATION) {
                    const subcontext = context.switchContextFrame(frame);

                    for (const slot of layerSlots) {
                        SpineAnimationHelper.applySlotAttachment(
                            subcontext.global.animation,
                            slot,
                            subcontext,
                            null,
                            frameTime
                        );
                    }
                }

                continue;
            }

            for (const element of frame.elements) {
                const subcontext = context.switchContextFrame(frame).createBone(element, frameTime);
                this._document.library.editItem(context.element.libraryItem.name);
                this._document.getTimeline().currentFrame = frame.startFrame;
                layerConvertFactory(subcontext);
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

    //-----------------------------------

    public prepareImagesExportPath(context:ConverterContext, image:string):string {
        const imagesFolder = this.resolveWorkingPath(context.global.skeleton.imagesPath);
        const imagePath = PathUtil.joinPath(imagesFolder, image + '.png');

        if (FLfile.exists(imagesFolder) === false) {
            FLfile.createFolder(imagesFolder);
        }

        return imagePath;
    }

    public prepareImagesAttachmentName(context:ConverterContext, image:string):string {
        if (this._config.appendSkeletonToImagesPath && this._config.mergeSkeletons) {
            return PathUtil.joinPath(context.global.skeleton.name, image);
        }

        return image;
    }

    public resolveWorkingPath(path:string):string {
        return PathUtil.joinPath(this._workingPath, path);
    }

    private extractAssetTransforms(context:ConverterContext):void {
        const assetItem = this._document.library.findItemIndex('ASSET');
        
        if (assetItem === undefined) {
            Logger.trace('No ASSET MovieClip found in library');
            return;
        }

        const assetLibItem = this._document.library.items[assetItem];
        
        if (!assetLibItem || assetLibItem.itemType !== 'movie clip') {
            Logger.trace('ASSET item is not a movie clip');
            return;
        }

        Logger.trace('=== ASSET MovieClip found - extracting base transforms ===');

        const timeline = assetLibItem.timeline;
        const layers = timeline.layers;
        
        Logger.trace("ASSET has " + layers.length + " layers");

        for (let layerIdx = layers.length - 1; layerIdx >= 0; layerIdx--) {
            const layer = layers[layerIdx];
            
            if (layer.layerType !== 'normal') {
                continue;
            }

            const frames = layer.frames;
            
            if (frames.length === 0 || frames[0].elements.length === 0) {
                continue;
            }

            for (const element of frames[0].elements) {
                if (element.libraryItem) {
                    const uniqueKey = StringUtil.simplify(element.libraryItem.name);
                    const transform = new SpineTransformMatrix(element);
                    context.global.assetTransforms.set(uniqueKey, transform);
                    Logger.trace("    ✓ Stored transform for: " + uniqueKey);
                }
            }
        }
        
        Logger.trace("=== Total ASSET transforms stored: " + context.global.assetTransforms.size() + " ===");
    }

    public convertSymbolInstance(element:FlashElement, context:ConverterContext):boolean {
        if (element.elementType === 'instance' && element.instanceType === 'symbol') {
            try {
                this.extractAssetTransforms(context);

                context.global.stageType = ConverterStageType.STRUCTURE;
                this.convertElement(context);

                for (const label of context.global.labels) {
                    const subcontext = context.switchContextAnimation(label);
                    subcontext.global.stageType = ConverterStageType.ANIMATION;
                    this.convertElement(subcontext);
                }

                return true;
            } catch (error) {
                Logger.error(JsonEncoder.stringify(error));
            }
        }

        return false;
    }

    public convertSelection():SpineSkeleton[] {
        const skeleton = (this._config.mergeSkeletons ? new SpineSkeleton() : null);
        const cache = ((this._config.mergeSkeletons && this._config.mergeSkeletonsRootBone) ? ConverterContextGlobal.initializeCache() : null);
        const selection = this._document.selection;
        const output:SpineSkeleton[] = [];

        //-----------------------------------

        if (cache != null) {
            if (this._config.appendSkeletonToImagesPath) {
                Logger.trace('Option "appendSkeletonToImagesPath" has been disabled to convert with "mergeSkeletonsRootBone" mode.');
                this._config.appendSkeletonToImagesPath = false;
            }
        }

        //-----------------------------------

        for (const element of selection) {
            const context = ConverterContextGlobal.initializeGlobal(element, this._config, this._document.frameRate, skeleton, cache);
            const result = this.convertSymbolInstance(element, context);

            if (result && skeleton == null) {
                output.push(context.skeleton);
            }
        }

        //-----------------------------------

        if (skeleton != null) {
            skeleton.imagesPath = this._config.imagesExportPath;
            skeleton.name = StringUtil.simplify(PathUtil.fileBaseName(this._document.name));
            output.push(skeleton);
        }

        //-----------------------------------

        return output;
    }
}
