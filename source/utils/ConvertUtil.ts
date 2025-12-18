import { ConverterContext } from '../core/ConverterContext';
import { ConverterFrameLabel } from '../core/ConverterFrameLabel';
import { ConverterMap } from '../core/ConverterMap';
import { SpineBlendMode } from '../spine/types/SpineBlendMode';
import { JsonUtil } from './JsonUtil';
import { StringUtil } from './StringUtil';

export class ConvertUtil {
    public static createElementName(element:FlashElement, context:ConverterContext):string {
        let result = '';

        if (element.elementType === 'instance') {
            if (JsonUtil.validString(element.name)) {
                result = element.name;
            } else if (JsonUtil.validString(element.layer.name)) {
                result = element.layer.name;
            } else if (element.libraryItem && JsonUtil.validString(element.libraryItem.name)) {
                result = element.libraryItem.name;
            }
        } else {
            if (JsonUtil.validString(element.layer.name)) {
                result = element.layer.name;
            }
        }

        if (result === '' || result == null) {
            result = ConvertUtil.createShapeName(context);
        }

        const simplified = StringUtil.simplify(result);
        
        // Ensure uniqueness using per-frame counters
        if (context && context.global && context.global.nameCounters) {
            const frameIdx = (context.frame != null) ? context.frame.startFrame : 0;
            let frameCounters = context.global.nameCounters.get(frameIdx);
            
            if (frameCounters == null) {
                frameCounters = new ConverterMap<string, number>();
                context.global.nameCounters.set(frameIdx, frameCounters);
            }

            const count = frameCounters.get(simplified) || 0;
            frameCounters.set(simplified, count + 1);
            
            if (count > 0) {
                return simplified + "_" + count;
            }
        }

        return simplified;
    }

    public static obtainElementBlendMode(element:FlashElement):SpineBlendMode {
        if (element.blendMode === 'multiply') {
            return SpineBlendMode.MULTIPLY;
        } else if (element.blendMode === 'screen') {
            return SpineBlendMode.SCREEN;
        } else if (element.blendMode === 'add') {
            return SpineBlendMode.ADDITIVE;
        } else {
            return SpineBlendMode.NORMAL;
        }
    }

    public static obtainElementLabels(element:FlashElement):ConverterFrameLabel[] {
        const labels:ConverterFrameLabel[] = [];
        const timeline = element.libraryItem.timeline;
        const layers = timeline.layers;

        for (const layer of layers) {
            const frames = layer.frames;

            for (let frameIdx = 0; frameIdx < frames.length; frameIdx++) {
                const frame = frames[frameIdx];

                if (frame.startFrame !== frameIdx) {
                    continue;
                }

                if (frame.labelType === 'name') {
                    labels.push({
                        endFrameIdx: frame.startFrame + (frame.duration - 1),
                        startFrameIdx: frame.startFrame,
                        name: frame.name
                    });
                }
            }
        }

        if (labels.length === 0) {
            labels.push({
                endFrameIdx: element.libraryItem.timeline.frameCount - 1,
                startFrameIdx: 0,
                name: 'default'
            });
        }

        return labels;
    }

    public static createAttachmentName(element:FlashElement, context:ConverterContext):string {
        let result = '';

        if (element.instanceType === 'bitmap' || element.instanceType === 'symbol') {
            result = element.libraryItem.name;
        }

        if (result === '' || result == null) {
            return ConvertUtil.createShapeName(context);
        } else {
            return StringUtil.simplify(result);
        }
    }

    public static createBoneName(element:FlashElement, context:ConverterContext):string {
        const result = ConvertUtil.createElementName(element, context);

        if (context != null && context.bone.name !== 'root') {
            return context.bone.name + '/' + result;
        }

        return result;
    }

    public static createSlotName(context:ConverterContext):string {
        return context.bone.name + '_slot';
    }

    public static createShapeName(context:ConverterContext):string {
        for (let index = 0; index < Number.MAX_VALUE; index++) {
            const name = 'shape_' + index;

            if (context.global.shapesCache.values.indexOf(name) === -1) {
                return name;
            }
        }

        return 'shape';
    }
}
