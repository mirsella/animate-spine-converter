import { JsonFormatUtil } from '../../utils/JsonFormatUtil';
import { SpineTimeline } from '../timeline/SpineTimeline';
import { SpineTimelineFrame } from '../timeline/SpineTimelineFrame';
import { SpineTimelineGroup } from '../timeline/SpineTimelineGroup';
import { SpineTimelineType } from '../types/SpineTimelineType';
import { SpineFormatV3_8_99 } from './SpineFormatV3_8_99';

export class SpineFormatV4_0_00 extends SpineFormatV3_8_99 {
    public override readonly version:string = '4.0.64';

    public override convertTimelineFrameCurve(frame:SpineTimelineFrame):any {
        const curve = frame.curve;

        if (curve === 'stepped') {
            return { curve: 'stepped' };
        }

        if (curve != null) {
            return {
                curve: [curve.cx1, curve.cy1, curve.cx2, curve.cy2]
            };
        }

        return null;
    }

    public override convertTimeline(timeline:SpineTimeline):any[] {
        const length = timeline.frames.length;
        const result:any[] = [];

        for (let index = 0; index < length; index++) {
            const frameData = timeline.frames[index];
            const curve = this.convertTimelineFrameCurve(frameData);
            const isRotate = timeline.type === SpineTimelineType.ROTATE;
            const isTranslate = timeline.type === SpineTimelineType.TRANSLATE;
            const isScale = timeline.type === SpineTimelineType.SCALE;
            const isShear = timeline.type === SpineTimelineType.SHEAR;
            const isColor = timeline.type === SpineTimelineType.COLOR;
            const isAttachment = timeline.type === SpineTimelineType.ATTACHMENT;

            const frame:any = {
                time: frameData.time,
                ...curve
            };

            if (isRotate) {
                frame.value = frameData.angle;
            } else if (isTranslate || isScale || isShear) {
                frame.x = frameData.x;
                frame.y = frameData.y;
            } else if (isColor) {
                frame.color = frameData.color;
            } else if (isAttachment) {
                frame.name = frameData.name;
            }

            if (index === (length - 1)) {
                delete frame.curve;
            }

            result.push(JsonFormatUtil.cleanObject(frame));
        }

        return result;
    }

    public override convertTimelineGroup(group:SpineTimelineGroup):any {
        this.optimizer.optimizeTimeline(group);

        const result:any = {};

        for (const timeline of group.timelines) {
            result[this.convertTimelineType(timeline.type)] = this.convertTimeline(timeline);
        }

        return result;
    }

    public convertTimelineType(type:string):string {
        if (type === SpineTimelineType.COLOR) {
            return 'rgba';
        }

        return type;
    }
}
