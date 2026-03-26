import { SpineAnimation } from '../spine/SpineAnimation';
import { Logger } from '../logger/Logger';
import { SpineAnimationHelper } from '../spine/SpineAnimationHelper';
import { SpineImage } from '../spine/SpineImage';
import { SpineSkeleton } from '../spine/SpineSkeleton';
import { SpineSlot } from '../spine/SpineSlot';
import { SpineTransformMatrix } from '../spine/transform/SpineTransformMatrix';
import { SpineBlendMode } from '../spine/types/SpineBlendMode';
import { ConvertUtil } from '../utils/ConvertUtil';
import { PathUtil } from '../utils/PathUtil';
import { StringUtil } from '../utils/StringUtil';
import { ConverterColor } from './ConverterColor';
import { ConverterConfig } from './ConverterConfig';
import { ConverterContext } from './ConverterContext';
import { ConverterFrameLabel } from './ConverterFrameLabel';
import { ConverterMap } from './ConverterMap';
import { ConverterStageType } from './ConverterStageType';

export class ConverterContextGlobal extends ConverterContext {
    public imagesCache:ConverterMap<string, SpineImage>;
    public shapesCache:ConverterMap<FlashElement | FlashItem, string>;
    public layersCache:ConverterMap<FlashLayer, SpineSlot[]>;
    public layerBonesCache:ConverterMap<FlashLayer, any[]>; // Cache for bones associated with a layer (e.g. nested symbols)
    public assetTransforms:ConverterMap<string, SpineTransformMatrix>;
    public attachmentVariants:ConverterMap<string, Array<{x:number, y:number, name:string}>>;
    public processedSymbols:ConverterMap<string, boolean>;

    // Ensure stable, unique bone names when multiple instances share the same name.
    // Key: element signature (parentBone|elementName|layerName|libraryItemName)
    // Val: resolved unique bone name
    public boneNameBySignature:ConverterMap<string, string>;
    // Key: base bone name (before suffix), Val: next numeric suffix to try
    public boneNameSuffixCounter:ConverterMap<string, number>;

    public labels:ConverterFrameLabel[];
    public stageType:ConverterStageType;
    public animation:SpineAnimation;
    public label:ConverterFrameLabel;
    public skeleton:SpineSkeleton;
    public frameRate:number;
    public config:ConverterConfig;

    private static formatLogNumber(value:any):string {
        return typeof value === 'number' && isFinite(value) ? value.toFixed(2) : 'n/a';
    }

    public static initializeGlobal(element:FlashElement, config:ConverterConfig, frameRate:number, skeleton:SpineSkeleton = null, cache:ConverterContextGlobal = null):ConverterContextGlobal {
        const transform = new SpineTransformMatrix(element);
        const libraryItem = (element as any).libraryItem;
        Logger.assert(libraryItem || element.name || element.layer?.name, 
            `Root element must have a libraryItem, name, or layer name. Got elementType=${element.elementType}`);
        const name = libraryItem ? StringUtil.simplify(libraryItem.name) : (element.name ? StringUtil.simplify(element.name) : StringUtil.simplify(element.layer.name));
        const context = (cache == null) ? ConverterContextGlobal.initializeCache() : cache;

        context.global = context;
        context.stageType = ConverterStageType.ANIMATION;
        context.parent = null;

        context.labels = ConvertUtil.obtainElementLabels(element);
        context.animation = null;
        context.frameRate = frameRate;
        context.label = null;
        context.config = config;

        context.skeleton = (skeleton == null) ? new SpineSkeleton() : skeleton;
        context.skeleton.imagesPath = (config.appendSkeletonToImagesPath ? PathUtil.joinPath(config.imagesExportPath, name) : config.imagesExportPath);
        context.skeleton.name = name;

        context.bone = context.skeleton.createBone('root');
        context.clipping = null;
        context.slot = null;

        context.blendMode = SpineBlendMode.NORMAL;
        context.color = new ConverterColor(ConverterColor.fromElement(element));
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

        if (Logger.isTraceEnabled()) {
            Logger.trace(`[Global] Root: ${context.skeleton.name} anchor=(${element.transformationPoint.x.toFixed(2)}, ${element.transformationPoint.y.toFixed(2)})`);
        }

        const preserveRootScale = !config.transformRootBone && (transform.scaleX !== 1 || transform.scaleY !== 1);
        const timeline = libraryItem && (libraryItem as any).timeline;
        const timelineLayers = timeline && timeline.layers ? timeline.layers.length : 0;
        const timelineFrames = timeline && typeof (timeline as any).frameCount === 'number' ? (timeline as any).frameCount : 0;
        const matrix = element.matrix;
        const instanceType = (element as any).instanceType || '<none>';
        Logger.status(
            `[RootExport] skeleton='${context.skeleton.name}' source='${libraryItem ? libraryItem.name : (element.name || '<anon>')}'` +
            ` type=${element.elementType}/${instanceType}` +
            ` anchor=(${ConverterContextGlobal.formatLogNumber(element.transformationPoint.x)}, ${ConverterContextGlobal.formatLogNumber(element.transformationPoint.y)})` +
            ` transform=(${ConverterContextGlobal.formatLogNumber(element.transformX)}, ${ConverterContextGlobal.formatLogNumber(element.transformY)})` +
            ` reg=(${ConverterContextGlobal.formatLogNumber(element.x)}, ${ConverterContextGlobal.formatLogNumber(element.y)})` +
            ` matrix=[a=${ConverterContextGlobal.formatLogNumber(matrix.a)}, b=${ConverterContextGlobal.formatLogNumber(matrix.b)}, c=${ConverterContextGlobal.formatLogNumber(matrix.c)}, d=${ConverterContextGlobal.formatLogNumber(matrix.d)}, tx=${ConverterContextGlobal.formatLogNumber(matrix.tx)}, ty=${ConverterContextGlobal.formatLogNumber(matrix.ty)}]` +
            ` decomposed=(rot=${ConverterContextGlobal.formatLogNumber(transform.rotation)}, sx=${ConverterContextGlobal.formatLogNumber(transform.scaleX)}, sy=${ConverterContextGlobal.formatLogNumber(transform.scaleY)}, shY=${ConverterContextGlobal.formatLogNumber(transform.shearY)})` +
            ` parentOffset=(${ConverterContextGlobal.formatLogNumber(context.parentOffset.x)}, ${ConverterContextGlobal.formatLogNumber(context.parentOffset.y)})` +
            ` transformRootBone=${!!config.transformRootBone} preserveRootScale=${preserveRootScale}` +
            ` timelineLayers=${timelineLayers} timelineFrames=${timelineFrames}`
        );

        if (config.transformRootBone) {
            SpineAnimationHelper.applyBoneTransform(context.bone, transform);
        } else if (transform.scaleX !== 1 || transform.scaleY !== 1) {
            SpineAnimationHelper.applyBoneTransform(context.bone, {
                rotation: 0,
                scaleX: transform.scaleX,
                scaleY: transform.scaleY,
                shearX: 0,
                shearY: 0,
                x: 0,
                y: 0,
            });
            Logger.status(
                `[RootExport] preservedScale skeleton='${context.skeleton.name}'` +
                ` scale=(${ConverterContextGlobal.formatLogNumber(transform.scaleX)}, ${ConverterContextGlobal.formatLogNumber(transform.scaleY)})`
            );
        }

        return context;
    }

    public static initializeCache():ConverterContextGlobal {
        const context = new ConverterContextGlobal();
        context.imagesCache = new ConverterMap<string, SpineImage>();
        context.shapesCache = new ConverterMap<FlashElement | FlashItem, string>();
        context.layersCache = new ConverterMap<FlashLayer, SpineSlot[]>();
        context.layerBonesCache = new ConverterMap<FlashLayer, any[]>();
        context.assetTransforms = new ConverterMap<string, SpineTransformMatrix>();
        context.attachmentVariants = new ConverterMap<string, Array<{x:number, y:number, name:string}>>();
        context.processedSymbols = new ConverterMap<string, boolean>();

        context.boneNameBySignature = new ConverterMap<string, string>();
        context.boneNameSuffixCounter = new ConverterMap<string, number>();
        return context;
    }

    public constructor() {
        super();
    }
}
