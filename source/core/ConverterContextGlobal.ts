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
    public assetTransforms:ConverterMap<string, SpineTransformMatrix>;

    public labels:ConverterFrameLabel[];
    public stageType:ConverterStageType;
    public animation:SpineAnimation;
    public label:ConverterFrameLabel;
    public skeleton:SpineSkeleton;
    public frameRate:number;
    public config:ConverterConfig;

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
        context.color = new ConverterColor();
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

        Logger.trace(`[Global] Root: ${context.skeleton.name} anchor=(${element.transformationPoint.x.toFixed(2)}, ${element.transformationPoint.y.toFixed(2)})`);

        if (config.transformRootBone) {
            SpineAnimationHelper.applyBoneTransform(context.bone, transform);
        }

        return context;
    }

    public static initializeCache():ConverterContextGlobal {
        const context = new ConverterContextGlobal();
        context.imagesCache = new ConverterMap<string, SpineImage>();
        context.shapesCache = new ConverterMap<FlashElement | FlashItem, string>();
        context.layersCache = new ConverterMap<FlashLayer, SpineSlot[]>();
        context.assetTransforms = new ConverterMap<string, SpineTransformMatrix>();
        return context;
    }

    public constructor() {
        super();
    }
}
