import { ConverterContext } from '../core/ConverterContext';
import { ConverterFrameLabel } from '../core/ConverterFrameLabel';
import { Logger } from '../logger/Logger';
import { SpineBlendMode } from '../spine/types/SpineBlendMode';
import { JsonUtil } from './JsonUtil';
import { StringUtil } from './StringUtil';

export class ConvertUtil {
    public static createElementName(element:FlashElement, context:ConverterContext):string {
        let result = element.layer.name;

        if (element.elementType === 'instance') {
            if (JsonUtil.validString(element.name)) {
                result = element.name;
            } else if (JsonUtil.validString(element.layer.name)) {
                result = element.layer.name;
            } else {
                Logger.assert(element.libraryItem != null, `createElementName: instance element has no libraryItem and no valid name/layer.name (layer: ${element.layer?.name || 'unknown'})`);
                result = element.libraryItem.name;
            }
        } else {
            if (JsonUtil.validString(element.layer.name)) {
                result = element.layer.name;
            }
        }

        if (result === '' || result == null) {
            return ConvertUtil.createShapeName(context);
        } else {
            return StringUtil.simplify(result);
        }
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
        const item = (element as any).libraryItem;

        Logger.assert(item != null, `obtainElementLabels: element has no libraryItem. Only symbol instances can have frame labels. (element: ${element.name || element.layer?.name || 'unknown'}, elementType: ${element.elementType})`);
        Logger.assert(item.timeline != null, `obtainElementLabels: libraryItem has no timeline. (item: ${item.name})`);

        const timeline = item.timeline;
        const layers = timeline.layers;
        const potentialLabels: { idx: number, name: string }[] = [];

        // 1. Collect all labels from all layers
        for (const layer of layers) {
            // Optimization: Skip guide and mask layers if they shouldn't contain labels? 
            // Usually labels are on normal layers or folder layers (though folders are weird in JSFL).
            // Let's scan all.
            const frames = layer.frames;

            for (let frameIdx = 0; frameIdx < frames.length; frameIdx++) {
                const frame = frames[frameIdx];
                if (frame.startFrame !== frameIdx) continue;

                if (frame.labelType === 'name' && frame.name) {
                    potentialLabels.push({
                        idx: frame.startFrame,
                        name: frame.name
                    });
                }
            }
        }

        // 2. Sort labels by frame index
        potentialLabels.sort((a, b) => a.idx - b.idx);

        // 3. Convert to ranges (start to next_start - 1)
        if (potentialLabels.length > 0) {
            for (let i = 0; i < potentialLabels.length; i++) {
                const current = potentialLabels[i];
                const next = potentialLabels[i + 1];

                const startFrame = current.idx;
                const endFrame = next ? (next.idx - 1) : (timeline.frameCount - 1);

                // Filter out duplicates if multiple layers have the same label at the same frame
                // or if different labels exist at same frame (ambiguous, but we take the last one or skip?)
                // Simple dedup by name check or just push?
                // Let's push, but maybe check if we already added a label for this startFrame?
                // Actually, if there are two labels at the same frame on different layers, 
                // that's weird. We'll just process them.
                
                // Check if this specific label/range already exists (deduplication)
                const exists = labels.some(l => l.startFrameIdx === startFrame && l.name === current.name);
                if (!exists) {
                    labels.push({
                        name: current.name,
                        startFrameIdx: startFrame,
                        endFrameIdx: endFrame
                    });
                }
            }
        }

        if (labels.length === 0) {
            // Logger.trace(`No labels found for ${item.name}, using default full timeline.`);
            labels.push({
                endFrameIdx: item.timeline.frameCount - 1,
                startFrameIdx: 0,
                name: 'default'
            });
        } else {
            // Logger.trace(`Found ${labels.length} labels for ${item.name}: ${labels.map(l => `${l.name}(${l.startFrameIdx}-${l.endFrameIdx})`).join(', ')}`);
        }

        return labels;
    }

    public static createAttachmentName(element:FlashElement, context:ConverterContext):string {
        let result = '';

        if (element.instanceType === 'bitmap' || element.instanceType === 'symbol') {
            Logger.assert((element as any).libraryItem != null, `createAttachmentName: bitmap/symbol instance has no libraryItem (element: ${element.name || element.layer?.name || 'unknown'}, instanceType: ${element.instanceType})`);
            result = (element as any).libraryItem.name;
        }

        if (result === '' || result == null) {
            return ConvertUtil.createShapeName(context);
        } else {
            // Debugging naming collisions/issues
            // Logger.trace(`[Naming] Raw: '${result}' -> Simplified: '${StringUtil.simplify(result)}'`);
            return StringUtil.simplify(result);
        }
    }

    public static createBoneName(element:FlashElement, context:ConverterContext):string {
        const result = ConvertUtil.createElementName(element, context);

        if (context != null && context.bone != null && context.bone.name !== 'root') {
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
