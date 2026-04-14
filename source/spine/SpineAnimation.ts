import { SpineBone } from './SpineBone';
import { SpineSlot } from './SpineSlot';
import { SpineTimeline } from './timeline/SpineTimeline';
import { SpineTimelineFrame } from './timeline/SpineTimelineFrame';
import { SpineTimelineGroupBone } from './timeline/SpineTimelineGroupBone';
import { SpineTimelineGroupSlot } from './timeline/SpineTimelineGroupSlot';

export class SpineAnimation {
    public readonly bones:SpineTimelineGroupBone[];
    public readonly events:SpineTimeline;
    public readonly slots:SpineTimelineGroupSlot[];

    public name:string;

    public constructor() {
        this.bones = [];
        this.events = new SpineTimeline();
        this.slots = [];
    }

    //-----------------------------------

    public createBoneTimeline(bone:SpineBone):SpineTimelineGroupBone {
        let timeline = this.findBoneTimeline(bone);

        if (timeline != null) {
            return timeline;
        }

        timeline = new SpineTimelineGroupBone();
        timeline.bone = bone;
        this.bones.push(timeline);

        return timeline;
    }

    public createEvent(name:string, time:number):void {
        this.events.createFrame(time, null, false).name = name;
    }

    public createSlotTimeline(slot:SpineSlot):SpineTimelineGroupSlot {
        let timeline = this.findSlotTimeline(slot);

        if (timeline != null) {
            return timeline;
        }

        timeline = new SpineTimelineGroupSlot();
        timeline.slot = slot;
        this.slots.push(timeline);

        return timeline;
    }

    public extendToTime(time:number):void {
        if (!(time > 0)) {
            return;
        }

        for (const group of this.bones) {
            this.extendGroupTimelines(group.timelines, time);
        }

        for (const group of this.slots) {
            this.extendGroupTimelines(group.timelines, time);
        }
    }

    //-----------------------------------

    private extendGroupTimelines(timelines:SpineTimeline[], time:number):void {
        for (const timeline of timelines) {
            this.extendTimeline(timeline, time);
        }
    }

    private extendTimeline(timeline:SpineTimeline, time:number):void {
        const last = timeline.frames.length > 0 ? timeline.frames[timeline.frames.length - 1] : null;
        if (last == null || last.time >= time) {
            return;
        }

        this.copyFrame(timeline.createFrame(time, null, false), last);
    }

    private copyFrame(target:SpineTimelineFrame, source:SpineTimelineFrame):void {
        target.angle = source.angle;
        target.name = source.name;
        target.color = source.color;
        target.x = source.x;
        target.y = source.y;
    }

    //-----------------------------------

    public findBoneTimeline(bone:SpineBone):SpineTimelineGroupBone {
        for (const timeline of this.bones) {
            if (timeline.bone === bone) {
                return timeline;
            }
        }

        return null;
    }

    public findSlotTimeline(slot:SpineSlot):SpineTimelineGroupSlot {
        for (const timeline of this.slots) {
            if (timeline.slot === slot) {
                return timeline;
            }
        }

        return null;
    }
}
