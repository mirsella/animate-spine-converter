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
            if (time >= prevFrame.time) {
                const prevAngle = prevFrame.angle;
                
                // Use a epsilon for time equality to avoid unwrapping the same keyframe twice
                if (time > prevFrame.time) {
                    const originalAngle = angle;
                    while (angle - prevAngle > 180) angle -= 360;
                    while (angle - prevAngle < -180) angle += 360;
                    
                    if (Math.abs(angle - originalAngle) > 0.1) {
                        Logger.trace(`[UNWRAP] Bone '${bone.name}' T=${time.toFixed(2)}: ${originalAngle.toFixed(2)} -> ${angle.toFixed(2)} (relative to prev ${prevAngle.toFixed(2)})`);
                    }

                    if (Math.abs(angle - prevAngle) > 170) {
                        Logger.trace(`[DEBUG] RotJump: ${prevAngle.toFixed(1)} -> ${angle.toFixed(1)} (Bone: ${bone.name}, T=${time.toFixed(2)})`);
                    }
                }
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

        Logger.trace(`[KEY] Bone '${bone.name}' at T=${time.toFixed(3)}: rot=${angle.toFixed(2)} pos=(${translateFrame.x.toFixed(2)}, ${translateFrame.y.toFixed(2)}) scale=(${scaleFrame.x.toFixed(2)}, ${scaleFrame.y.toFixed(2)}) shearY=${shearFrame.y.toFixed(2)}`);
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
        
        // VISIBILITY FIX: Start of Animation
        if (attachmentTimeline.frames.length === 0 && time > 0) {
            Logger.trace(`[VISIBILITY] Auto-hiding slot '${slot.name}' at frame 0 (First key is at ${time.toFixed(3)})`);
            const hiddenFrame = attachmentTimeline.createFrame(0, 'stepped');
            hiddenFrame.name = null;
        }

        const attachmentFrame = attachmentTimeline.createFrame(time, curve);
        attachmentFrame.name = (attachment != null) ? attachment.name : null;
        
        Logger.trace(`[VISIBILITY] Slot '${slot.name}' -> ${attachmentFrame.name ? attachmentFrame.name : 'HIDDEN'} at Time ${time.toFixed(3)} (Frame: ${context.frame?.startFrame})`);

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
            if (frame.tweenType === 'none') {
                return 'stepped';
            }

            // If it's not a Classic Tween, we assume baking is required (Linear)
            if (frame.tweenType !== 'classic') {
                return null;
            }

            // 1. Check Custom Ease
        if (frame.hasCustomEase) {
            let points = null;
            try { points = frame.getCustomEase(); } catch (e) {
                Logger.warning(`[Curve] Frame ${frame.startFrame}: getCustomEase failed: ${e}`);
            }
            
            // Spine only supports 1 cubic bezier segment (4 points: P0, C1, C2, P3)
            // If points > 4, it's a complex curve -> requires baking -> Linear
            if (points && points.length === 4) {
                Logger.trace(`[Curve] Frame ${frame.startFrame}: Custom Ease applied. P0=(${points[0].x}, ${points[0].y}) P1=(${points[1].x.toFixed(3)}, ${points[1].y.toFixed(3)}) P2=(${points[2].x.toFixed(3)}, ${points[2].y.toFixed(3)}) P3=(${points[3].x}, ${points[3].y})`);
                return {
                    cx1: points[1].x,
                    cy1: points[1].y,
                    cx2: points[2].x,
                    cy2: points[2].y
                };
            }
            if (points) {
                Logger.trace(`[Curve] Frame ${frame.startFrame}: Custom Ease Rejected (Points: ${points.length}). Logic: Spine 4.2 only supports single-segment beziers via JSON. Multi-segment requires sampling.`);
            }
            return null; // Force bake for complex custom ease
        }


            // 2. Check Standard Easing (-100 to 100)
            if (frame.tweenEasing !== 0) {
                const intensity = frame.tweenEasing; // -100 to 100
                const k = Math.abs(intensity) / 100;
                
                // Animate uses a Quadratic Bezier (1 control point Q1)
                // We must elevate it to Cubic Bezier (2 control points C1, C2)
                
                let q1y = 0.5;
                if (intensity < 0) { // Ease In
                    q1y = 0.5 * (1 - k);
                } else { // Ease Out
                    q1y = 0.5 + 0.5 * k;
                }
                
                // Degree Elevation: Quadratic to Cubic
                const c1x = (2/3) * 0.5; // 0.333...
                const c1y = (2/3) * q1y;
                
                const c2x = 1 - (1/3); // 0.666...
                const c2y = 1 + (2/3) * (q1y - 1);
                
                Logger.trace(`[Curve] Frame ${frame.startFrame}: Standard Ease ${intensity} -> Q1y=${q1y.toFixed(3)} -> C1=(${c1x.toFixed(3)}, ${c1y.toFixed(3)}) C2=(${c2x.toFixed(3)}, ${c2y.toFixed(3)})`);

                return {
                    cx1: c1x,
                    cy1: c1y,
                    cx2: c2x,
                    cy2: c2y
                };
            }

            // Default Linear
            Logger.trace(`[Curve] Frame ${frame.startFrame}: No Easing (Linear).`);
            return null; 
        }

        //-----------------------------------

        return null;
    }

    public static applyEventAnimation(animation:SpineAnimation, event:string, time:number):void {
        animation.createEvent(event, time);
    }
}
