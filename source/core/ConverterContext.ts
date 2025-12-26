import { SpineClippingAttachment } from '../spine/attachment/SpineClippingAttachment';
import { SpineAnimationHelper } from '../spine/SpineAnimationHelper';
import { SpineBone } from '../spine/SpineBone';
import { SpineSlot } from '../spine/SpineSlot';
import { SpineTransformMatrix } from '../spine/transform/SpineTransformMatrix';
import { SpineBlendMode } from '../spine/types/SpineBlendMode';
import { ConvertUtil } from '../utils/ConvertUtil';
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

    /**
     * Offset to reconcile Flash's Registration Point hierarchy with Spine's Anchor Point hierarchy.
     * parentOffset = parent.RegPoint - parent.AnchorPoint
     */
    public parentOffset:{ x:number, y:number } = { x: 0, y: 0 };

    public constructor() {
        // empty
    }

    //-----------------------------------

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

    //-----------------------------------

    public createBone(element:FlashElement, time:number):ConverterContext {
        const transform = new SpineTransformMatrix(element);
        const context = new ConverterContext();

        //-----------------------------------

        context.bone = this.global.skeleton.createBone(ConvertUtil.createBoneName(element, this), this.bone);
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

        //-----------------------------------

        if (context.bone.initialized === false) {
            context.bone.initialized = true;

            // Bone position in Spine must be relative to the parent bone (Anchor).
            // Flash element.x/y are relative to the parent Registration Point.
            // localX = element.x + (parent.RegPoint.x - parent.Anchor.x)
            const boneTransform = {
                ...transform,
                x: transform.x + this.parentOffset.x,
                y: transform.y + this.parentOffset.y
            };

            SpineAnimationHelper.applyBoneTransform(
                context.bone,
                boneTransform
            );
        }

        // Calculate the offset for children: delta between Registration Point and Anchor Point
        context.parentOffset = {
            x: element.x - element.transformX,
            y: (element.y - element.transformY) * SpineTransformMatrix.Y_DIRECTION
        };

        //-----------------------------------

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

        //-----------------------------------

        return context;
    }

    public createSlot(element:FlashElement):ConverterContext {
        const context = new ConverterContext();

        //-----------------------------------

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

        //-----------------------------------

        if (context.slot.initialized === false) {
            context.slot.initialized = true;

            context.slot.color = context.color.merge();
            context.slot.blend = context.blendMode;

            if (context.layer != null) {
                const layerSlots = context.global.layersCache.get(context.layer);
                layerSlots.push(context.slot);
            }
        }

        //-----------------------------------

        if (context.global.stageType === ConverterStageType.ANIMATION) {
            SpineAnimationHelper.applySlotAnimation(
                context.global.animation,
                context.slot,
                context,
                context.color.merge(),
                context.time
            );
        }

        //-----------------------------------

        return context;
    }
}
