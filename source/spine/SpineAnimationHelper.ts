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
        // Curve lookup is now per-timeline type

        const rotateTimeline = timeline.createTimeline(SpineTimelineType.ROTATE);
        
        // Rotation Unwrapping (Shortest Path)
        // Ensure that the new angle is continuous relative to the previous keyframe
        let angle = transform.rotation - bone.rotation;

        // Detailed Rotation Debug
        const isDebugBone = bone.name.indexOf('weapon') >= 0 || bone.name.indexOf('torso') >= 0 || bone.name.indexOf('arm') >= 0;
        if (isDebugBone) {
             Logger.trace(`[RotDetail] ${bone.name} T=${time.toFixed(3)} | MatrixRot=${transform.rotation.toFixed(2)} | BoneSetupRot=${bone.rotation.toFixed(2)} | Delta=${angle.toFixed(2)} | Pos=(${transform.x.toFixed(1)}, ${transform.y.toFixed(1)})`);
        }

        if (rotateTimeline.frames.length > 0) {
            const prevFrame = rotateTimeline.frames[rotateTimeline.frames.length - 1];
            // Only apply unwrapping if we are moving forward in time (sequential export)
            if (time >= prevFrame.time) {
                const prevAngle = prevFrame.angle;
                const originalAngle = angle;
                
                // Use a epsilon for time equality to avoid unwrapping the same keyframe twice
                if (time > prevFrame.time) {
                    while (angle - prevAngle > 180) angle -= 360;
                    while (angle - prevAngle < -180) angle += 360;

                    // Debug Logging for "Jump" detection or wrapping
                    if (isDebugBone && Math.abs(angle - prevAngle) > 30) {
                        Logger.trace(`[RotJump] ${bone.name} T=${time.toFixed(3)}: JUMP DETECTED! ${prevAngle.toFixed(1)} -> ${angle.toFixed(1)} (Orig: ${originalAngle.toFixed(1)})`);
                    } else if (isDebugBone && originalAngle !== angle) {
                         Logger.trace(`[RotWrap] ${bone.name} T=${time.toFixed(3)}: Wrapped ${originalAngle.toFixed(1)} -> ${angle.toFixed(1)}`);
                    }
                }
            }
        } else {
             // Initial frame check (if it's not 0)
             if (isDebugBone) Logger.trace(`[RotStart] ${bone.name} T=${time.toFixed(3)}: Start Angle ${angle.toFixed(1)} (Matrix: ${transform.rotation.toFixed(1)})`);
        }

        const rotateFrame = rotateTimeline.createFrame(time, SpineAnimationHelper.obtainFrameCurve(context, SpineTimelineType.ROTATE));
        rotateFrame.angle = angle;

        const translateTimeline = timeline.createTimeline(SpineTimelineType.TRANSLATE);
        const translateFrame = translateTimeline.createFrame(time, SpineAnimationHelper.obtainFrameCurve(context, SpineTimelineType.TRANSLATE));
        translateFrame.x = transform.x - bone.x;
        translateFrame.y = transform.y - bone.y;

        const scaleTimeline = timeline.createTimeline(SpineTimelineType.SCALE);
        const scaleFrame = scaleTimeline.createFrame(time, SpineAnimationHelper.obtainFrameCurve(context, SpineTimelineType.SCALE));
        scaleFrame.x = transform.scaleX / bone.scaleX;
        scaleFrame.y = transform.scaleY / bone.scaleY;

        const shearTimeline = timeline.createTimeline(SpineTimelineType.SHEAR);
        const shearFrame = shearTimeline.createFrame(time, SpineAnimationHelper.obtainFrameCurve(context, SpineTimelineType.SHEAR));
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
        const curve = SpineAnimationHelper.obtainFrameCurve(context, SpineTimelineType.ATTACHMENT);

        const attachmentTimeline = timeline.createTimeline(SpineTimelineType.ATTACHMENT);
        const attachmentFrame = attachmentTimeline.createFrame(time, curve);
        attachmentFrame.name = (attachment != null) ? attachment.name : null;

        if (context.frame != null && context.frame.startFrame === 0) {
            slot.attachment = attachment;
        }
    }

    public static applySlotAnimation(animation:SpineAnimation, slot:SpineSlot, context:ConverterContext, color:string, time:number):void {
        const timeline = animation.createSlotTimeline(slot);
        const curve = SpineAnimationHelper.obtainFrameCurve(context, SpineTimelineType.COLOR);

        const colorTimeline = timeline.createTimeline(SpineTimelineType.COLOR);
        const colorFrame = colorTimeline.createFrame(time, curve);
        colorFrame.color = color;
    }

    public static obtainFrameCurve(context:ConverterContext, timelineType:SpineTimelineType):SpineCurveType {
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

            // Motion Tween Support
            if (frame.tweenType === 'motion') {
                return SpineAnimationHelper.getMotionTweenCurve(frame, timelineType).curve;
            }

            // Classic Tween Support (only 'classic' type)
            if (frame.tweenType !== 'classic') {
                return null; // Force Linear for unsupported types (though Converter might force bake)
            }

            // 1. Check Custom Ease
            if (frame.hasCustomEase) {
                let points = null;
                try { points = frame.getCustomEase(); } catch (e) {}
                
                // Spine only supports 1 cubic bezier segment (4 points: P0, C1, C2, P3)
                // If points > 4, it's a complex curve -> requires baking -> Linear
                if (points && points.length === 4) {
                    Logger.trace(`[Curve] Frame ${frame.startFrame}: Custom Ease applied. P1=(${points[1].x.toFixed(3)}, ${points[1].y.toFixed(3)}) P2=(${points[2].x.toFixed(3)}, ${points[2].y.toFixed(3)})`);
                    return {
                        cx1: points[1].x,
                        cy1: points[1].y,
                        cx2: points[2].x,
                        cy2: points[2].y
                    };
                }
                Logger.trace(`[Curve] Frame ${frame.startFrame}: Custom Ease Rejected (Points: ${points ? points.length : 'null'}). Force Linear/Bake.`);
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

    public static checkMotionCurveComplexity(frame:any):{ complex: boolean, reason?: string } {
        if (frame.tweenType !== 'motion') return { complex: false };
        // Check all major properties
        const types = [SpineTimelineType.TRANSLATE, SpineTimelineType.ROTATE, SpineTimelineType.SCALE, SpineTimelineType.SHEAR];
        for (const t of types) {
            const result = SpineAnimationHelper.getMotionTweenCurve(frame, t);
            if (result.complex) return { complex: true, reason: `Complex curve on ${t}` };
        }
        return { complex: false };
    }

    private static getMotionTweenCurve(frame:any, timelineType:SpineTimelineType):{ curve: SpineCurveType, complex: boolean } {
        try {
            const xmlStr = frame.getMotionObjectXML();
            if (!xmlStr) return { curve: null, complex: false };

            // Simple XML Parsing via Regex
            // We look for specific PropertyCurve(s) based on the timelineType
            let targetProps:string[] = [];
            switch (timelineType) {
                case SpineTimelineType.TRANSLATE: targetProps = ['X', 'Y']; break;
                case SpineTimelineType.ROTATE:    targetProps = ['RotationZ']; break;
                case SpineTimelineType.SCALE:     targetProps = ['ScaleX', 'ScaleY']; break;
                case SpineTimelineType.SHEAR:     targetProps = ['SkewX', 'SkewY']; break;
                default: return { curve: null, complex: false };
            }

            let foundCurve:SpineCurveType = null;
            let isComplex = false;

            // Helper to parse points from a specific property block
            const extractCurveFromProp = (propName:string):SpineCurveType | 'invalid' => {
                const propRegex = new RegExp(`<PropertyCurve[^>]*name="${propName}"[^>]*>([\\s\\S]*?)<\\/PropertyCurve>`, 'i');
                const match = (xmlStr as string).match(propRegex);
                if (!match) return null; // Linear/Default

                const content = match[1];
                // Find <Curve> block
                const curveMatch = content.match(/<Curve[^>]*>([\s\S]*?)<\/Curve>/i);
                if (!curveMatch) return null;

                const pointRegex = /<Point\s+x="([^"]+)"\s+y="([^"]+)"/g;
                const points:{x:number, y:number}[] = [];
                
                let pMatch = pointRegex.exec(curveMatch[1]);
                while (pMatch !== null) {
                    points.push({ x: parseFloat(pMatch[1]), y: parseFloat(pMatch[2]) });
                    pMatch = pointRegex.exec(curveMatch[1]);
                }

                // Logic: Spine supports 1 Cubic Bezier segment (4 points: Start, C1, C2, End)
                // The points in XML are [Start, Handle1, Handle2, End] usually.
                // Or [Start, End] for Linear.
                
                if (points.length === 2) return null; // Linear (Start, End)
                
                if (points.length === 4) {
                    // Check if handles are valid (0 <= x <= 1)
                    // Spine handles are relative to the time duration (0-1).
                    // Animate handles might be absolute or relative. Usually relative in Motion XML.
                    return {
                        cx1: points[1].x,
                        cy1: points[1].y,
                        cx2: points[2].x,
                        cy2: points[2].y
                    };
                }
                
                // Debug log for rejected curve
                // Logger.trace(`[MotionXML] Property ${propName}: Rejected curve with ${points.length} points.`);
                return 'invalid'; // Too complex (multi-segment) -> Needs Baking
            };

            for (const prop of targetProps) {
                const result = extractCurveFromProp(prop);
                
                if (result === 'invalid') {
                    isComplex = true;
                    // We continue to see if we can find at least one valid curve for debug? 
                    // No, if any property is complex, we probably should bake the whole thing or at least return complex flag.
                    // But if we return complex=true, Converter will bake.
                    return { curve: null, complex: true };
                }
                
                if (result) {
                    if (foundCurve && JSON.stringify(foundCurve) !== JSON.stringify(result)) {
                        // Inconsistent curves for X vs Y -> Fallback to Linear (or ideally Bake, but too late)
                        // For now, use the first one found or Linear?
                        // If inconsistent, we flag complex?
                        isComplex = true;
                        return { curve: null, complex: true };
                    } else {
                        foundCurve = result;
                    }
                }
            }
            
            return { curve: foundCurve, complex: isComplex };

        } catch (e) {
            Logger.warning(`[SpineAnimationHelper] Failed to parse MotionXML for frame: ${e}`);
            return { curve: null, complex: true }; // Error -> Bake
        }
    }
}

