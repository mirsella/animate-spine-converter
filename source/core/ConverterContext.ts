import { SpineClippingAttachment } from '../spine/attachment/SpineClippingAttachment';
import { SpineAnimationHelper } from '../spine/SpineAnimationHelper';
import { SpineBone } from '../spine/SpineBone';
import { SpineSlot } from '../spine/SpineSlot';
import { SpineTransformMatrix } from '../spine/transform/SpineTransformMatrix';
import { SpineBlendMode } from '../spine/types/SpineBlendMode';
import { ConvertUtil } from '../utils/ConvertUtil';
import { Logger } from '../logger/Logger';
import { ConverterColor } from './ConverterColor';
import { ConverterContextGlobal } from './ConverterContextGlobal';
import { ConverterFrameLabel } from './ConverterFrameLabel';
import { ConverterStageType } from './ConverterStageType';

export class ConverterContext {
    public global:ConverterContextGlobal;
    public parent:ConverterContext;

    public color:ConverterColor;
    public blendMode:SpineBlendMode;
    public layer:FlashLayer;
    public element:FlashElement;
    public frame:FlashFrame;

    public bone:SpineBone;
    public clipping:SpineClippingAttachment;
    public slot:SpineSlot;
    public time:number;

    // Added for debug logging
    public absoluteFrameIndex: number = 0; 

    /**
     * Offset to shift children from Parent Registration Point to Parent Anchor Point.
     * Calculated as: -Parent.transformationPoint
     */
    public parentOffset:{ x:number, y:number } = { x: 0, y: 0 };

    public constructor() {
        // empty
    }

    public switchContextFrame(frame:FlashFrame):ConverterContext {
        this.frame = frame;
        return this;
    }

    public switchContextAnimation(label:ConverterFrameLabel):ConverterContext {
        const { skeleton, labels } = this.global;
        if (labels.indexOf(label) !== -1) {
            this.global.animation = skeleton.createAnimation(label.name);
            this.global.label = label;
        }
        return this;
    }

    public switchContextLayer(layer:FlashLayer):ConverterContext {
        this.layer = layer;
        if (this.global.layersCache.get(layer) == null) {
            this.global.layersCache.set(layer, []);
        }
        return this;
    }

    public createBone(element:FlashElement, time:number):ConverterContext {
        const boneName = ConvertUtil.createBoneName(element, this);
        const referenceTransform = this.global.assetTransforms.get(boneName);
        
        // Pass reference transform to constructor to handle flipping continuity
        const transform = new SpineTransformMatrix(element, referenceTransform);
        
        // Update the cache with the current transform for the next frame
        this.global.assetTransforms.set(boneName, transform);

        const context = new ConverterContext();

        context.bone = this.global.skeleton.createBone(boneName, this.bone);
        context.clipping = this.clipping;
        context.slot = null;
        context.time = this.time + time;

        context.global = this.global;
        context.parent = this;

        context.blendMode = ConvertUtil.obtainElementBlendMode(element);
        context.color = this.color.blend(element);
        context.layer = this.layer;
        context.element = element;
        context.frame = this.frame;

        if (this.blendMode !== SpineBlendMode.NORMAL && context.blendMode === SpineBlendMode.NORMAL) {
            context.blendMode = this.blendMode;
        }

        if (context.bone.initialized === false) {
            context.bone.initialized = true;

            // Shift position from Parent Registration Point to Parent Anchor Point
            const boneTransform = {
                ...transform,
                x: transform.x + this.parentOffset.x,
                y: transform.y + this.parentOffset.y
            };

            SpineAnimationHelper.applyBoneTransform(context.bone, boneTransform);
        }

        // Set parentOffset for children of this bone: shift from this bone's RP to this bone's Anchor
        // Both axes are negated symmetrically (Y flip happens at Spine output layer)
        context.parentOffset = {
            x: -element.transformationPoint.x,
            y: -element.transformationPoint.y
        };

        if (context.global.stageType === ConverterStageType.ANIMATION) {
            const boneTransform = {
                ...transform,
                x: transform.x + this.parentOffset.x,
                y: transform.y + this.parentOffset.y
            };

            SpineAnimationHelper.applyBoneAnimation(
                context.global.animation,
                context.bone,
                context,
                boneTransform,
                context.time
            );
        }

        return context;
    }

    public createSlot(element:FlashElement):ConverterContext {
        const context = new ConverterContext();

        context.bone = this.bone;
        context.clipping = this.clipping;
        context.slot = this.global.skeleton.createSlot(ConvertUtil.createSlotName(this), this.bone);
        context.time = this.time;

        context.global = this.global;
        context.parent = this;

        context.blendMode = ConvertUtil.obtainElementBlendMode(element);
        context.color = this.color;
        context.layer = this.layer;
        context.element = element;
        context.frame = this.frame;

        if (this.blendMode !== SpineBlendMode.NORMAL && context.blendMode === SpineBlendMode.NORMAL) {
            context.blendMode = this.blendMode;
        }

        if (context.slot.initialized === false) {
            context.slot.initialized = true;
            context.slot.color = context.color.merge();
            context.slot.blend = context.blendMode;

            if (context.layer != null) {
                const layerSlots = context.global.layersCache.get(context.layer);
                layerSlots.push(context.slot);
            }
        }

        if (context.global.stageType === ConverterStageType.ANIMATION) {
            SpineAnimationHelper.applySlotAnimation(
                context.global.animation,
                context.slot,
                context,
                context.color.merge(),
                context.time
            );
        }

        return context;
    }
}
