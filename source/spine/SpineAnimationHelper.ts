import { ConverterContext } from '../core/ConverterContext';
import { Logger } from '../logger/Logger';
import { SpineAttachment } from './attachment/SpineAttachment';
import { SpineAnimation } from './SpineAnimation';
import { SpineBone } from './SpineBone';
import { SpineSlot } from './SpineSlot';
import { SpineCurveType } from './timeline/SpineCurveType';
import { SpineTransform } from './transform/SpineTransform';
import { SpineTimelineType } from './types/SpineTimelineType';

export class SpineAnimationHelper {
    public static applyBoneAnimation(animation:SpineAnimation, bone:SpineBone, context:ConverterContext, transform:SpineTransform, time:number):void {
        const timeline = animation.createBoneTimeline(bone);
        const curve = SpineAnimationHelper.obtainFrameCurve(context);

        const rotateTimeline = timeline.createTimeline(SpineTimelineType.ROTATE);
        
        // Rotation Unwrapping (Shortest Path)
        // Ensure that the new angle is continuous relative to the previous keyframe
        let angle = transform.rotation - bone.rotation;
        if (rotateTimeline.frames.length > 0) {
            const prevFrame = rotateTimeline.frames[rotateTimeline.frames.length - 1];
            // Only apply unwrapping if we are moving forward in time (sequential export)
            if (time > prevFrame.time) {
                const prevAngle = prevFrame.angle;
                const originalAngle = angle;
                
                while (angle - prevAngle > 180) angle -= 360;
                while (angle - prevAngle < -180) angle += 360;

                // Debug Logging for "Jump" detection
                if (Math.abs(angle - originalAngle) > 0.01 && bone.name.indexOf('weapon') >= 0) {
                    Logger.trace(`[RotationUnwrap] Bone: ${bone.name} | Time: ${time.toFixed(3)} | Prev: ${prevAngle.toFixed(1)} | Raw: ${originalAngle.toFixed(1)} -> Unwrapped: ${angle.toFixed(1)}`);
                }
            }
        } else {
             // Initial frame check (if it's not 0)
             if (Math.abs(angle) > 180 && bone.name.indexOf('weapon') >= 0) {
                  Logger.trace(`[RotationStart] Bone: ${bone.name} | Time: ${time.toFixed(3)} | Initial Angle Large: ${angle.toFixed(1)}`);
             }
        }

        const rotateFrame = rotateTimeline.createFrame(time, curve);
        rotateFrame.angle = angle;

        const translateTimeline = timeline.createTimeline(SpineTimelineType.TRANSLATE);
        const translateFrame = translateTimeline.createFrame(time, curve);
        translateFrame.x = transform.x - bone.x;
        translateFrame.y = transform.y - bone.y;

        const scaleTimeline = timeline.createTimeline(SpineTimelineType.SCALE);
        const scaleFrame = scaleTimeline.createFrame(time, curve);
        scaleFrame.x = transform.scaleX / bone.scaleX;
        scaleFrame.y = transform.scaleY / bone.scaleY;

        const shearTimeline = timeline.createTimeline(SpineTimelineType.SHEAR);
        const shearFrame = shearTimeline.createFrame(time, curve);
        shearFrame.x = transform.shearX - bone.shearX;
        shearFrame.y = transform.shearY - bone.shearY;
    }

    public static applyBoneTransform(bone:SpineBone, transform:SpineTransform):void {
        bone.x = transform.x;
        bone.y = transform.y;
        bone.rotation = transform.rotation;
        bone.scaleX = transform.scaleX;
        bone.scaleY = transform.scaleY;
        bone.shearX = transform.shearX;
        bone.shearY = transform.shearY;
    }

    public static applySlotAttachment(animation:SpineAnimation, slot:SpineSlot, context:ConverterContext, attachment:SpineAttachment, time:number):void {
        const timeline = animation.createSlotTimeline(slot);
        const curve = SpineAnimationHelper.obtainFrameCurve(context);

        const attachmentTimeline = timeline.createTimeline(SpineTimelineType.ATTACHMENT);
        const attachmentFrame = attachmentTimeline.createFrame(time, curve);
        attachmentFrame.name = (attachment != null) ? attachment.name : null;

        if (context.frame != null && context.frame.startFrame === 0) {
            slot.attachment = attachment;
        }
    }

    public static applySlotAnimation(animation:SpineAnimation, slot:SpineSlot, context:ConverterContext, color:string, time:number):void {
        const timeline = animation.createSlotTimeline(slot);
        const curve = SpineAnimationHelper.obtainFrameCurve(context);

        const colorTimeline = timeline.createTimeline(SpineTimelineType.COLOR);
        const colorFrame = colorTimeline.createFrame(time, curve);
        colorFrame.color = color;
    }

    public static obtainFrameCurve(context:ConverterContext):SpineCurveType {
        let frame = context.frame;

        //-----------------------------------

        while (frame != null && frame.tweenType === 'none') {
            context = context.parent;

            if (context != null) {
                frame = context.frame;
            } else {
                break;
            }
        }

        //-----------------------------------

        if (frame != null) {
            // const points = frame.getCustomEase();

            if (frame.tweenType === 'none') {
                return 'stepped';
            }

            // Force Linear for baked animations (frame-by-frame export)
            // We are sampling the matrix at every frame, so the interpolation is already "baked" into the keyframe values.
            // Applying a Bezier curve to a 1-frame interval causes stuttering (scalloped motion).
            return null;

            /*
            if (frame.tweenEasing === 0 || points == null || points.length !== 4) {
                return null;
            }

            return {
                cx1: points[1].x,
                cy1: points[1].y,
                cx2: points[2].x,
                cy2: points[2].y
            };
            */
        }

        //-----------------------------------

        return null;
    }

    public static applyEventAnimation(animation:SpineAnimation, event:string, time:number):void {
        animation.createEvent(event, time);
    }
}
