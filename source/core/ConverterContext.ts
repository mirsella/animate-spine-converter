import { Logger } from '../logger/Logger';
import { SpineClippingAttachment } from '../spine/attachment/SpineClippingAttachment';
import { SpineAnimationHelper } from '../spine/SpineAnimationHelper';
import { SpineBone } from '../spine/SpineBone';
import { SpineSlot } from '../spine/SpineSlot';
import { SpineTransformMatrix } from '../spine/transform/SpineTransformMatrix';
import { SpineBlendMode } from '../spine/types/SpineBlendMode';
import { ConvertUtil } from '../utils/ConvertUtil';
import { StringUtil } from '../utils/StringUtil';
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
        
        Logger.trace(`[Bone] Creating for element: ${element.name || '<anon>'} (${element.elementType})`);
        Logger.trace(`  Flash Matrix: tx=${element.matrix.tx} ty=${element.matrix.ty}`);
        Logger.trace(`  Transform: pos=(${transform.x.toFixed(2)}, ${transform.y.toFixed(2)}) rot=${(transform.rotation * 180 / Math.PI).toFixed(1)} scale=(${transform.scaleX.toFixed(2)}, ${transform.scaleY.toFixed(2)}) pivot=(${transform.pivotX.toFixed(2)}, ${transform.pivotY.toFixed(2)}) reg=(${transform.regX.toFixed(2)}, ${transform.regY.toFixed(2)})`);

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

            const lookupName = element.libraryItem ? StringUtil.simplify(element.libraryItem.name) : ConvertUtil.createElementName(element, this);
            const isMaskLayer = this.layer && this.layer.layerType === 'mask';
            const hasAssetClip = context.global.assetTransforms.size() > 0;
            const assetTransform = (hasAssetClip && !isMaskLayer) 
                ? context.global.assetTransforms.get(lookupName) 
                : null;
            
            if (hasAssetClip && !assetTransform && !isMaskLayer) {
                Logger.error(`Asset "${lookupName}" not found in ASSET MovieClip!`);
                Logger.error(`Available assets: ${context.global.assetTransforms.keys.join(', ')}`);
                throw new Error(`Asset "${lookupName}" not found in ASSET MovieClip. Please add it to the ASSET MovieClip with its neutral base pose.`);
            }
            
            if (assetTransform) {
                Logger.trace(`  [Asset Match] Found ASSET for ${lookupName}`);
                Logger.trace(`    Asset: pos=(${assetTransform.x.toFixed(2)}, ${assetTransform.y.toFixed(2)}) rot=${(assetTransform.rotation).toFixed(1)} scale=(${assetTransform.scaleX.toFixed(2)}, ${assetTransform.scaleY.toFixed(2)}) reg=(${assetTransform.regX.toFixed(2)}, ${assetTransform.regY.toFixed(2)})`);

                // Hybrid Pivot Calculation:
                // Use ASSET Rotation/Scale/RegPoint (Neutral Pose)
                // Use ANIMATION Pivot (Correct Axis)
                
                let hybridX = assetTransform.x;
                let hybridY = assetTransform.y;

                if (element.elementType !== 'shape') {
                    // assetTransform.rotation is negative of Flash rotation (Spine convention).
                    // We need Flash rotation to calculate the pivot offset in Flash space.
                    const rotation = -assetTransform.rotation * Math.PI / 180;
                    const cos = Math.cos(rotation);
                    const sin = Math.sin(rotation);
                    
                    // Calculate offset using ANIMATION pivot but ASSET scale
                    const scaledX = transform.pivotX * assetTransform.scaleX;
                    const scaledY = transform.pivotY * assetTransform.scaleY;
                    
                    const rotatedX = scaledX * cos - scaledY * sin;
                    const rotatedY = scaledX * sin + scaledY * cos;
                    
                    // Reconstruct bone position: ASSET RegPoint + Rotated Animation Pivot
                    hybridX = assetTransform.regX + rotatedX;
                    hybridY = assetTransform.regY - rotatedY;

                    Logger.trace(`    Hybrid Calc: pivot=(${transform.pivotX.toFixed(2)}, ${transform.pivotY.toFixed(2)}) rot=${(rotation * 180 / Math.PI).toFixed(1)}`);
                    Logger.trace(`    Rotated Offset: (${rotatedX.toFixed(2)}, ${rotatedY.toFixed(2)})`);
                    Logger.trace(`    Final Pos: (${hybridX.toFixed(2)}, ${hybridY.toFixed(2)})`);
                }

                SpineAnimationHelper.applyBoneTransform(
                    context.bone,
                    {
                        x: hybridX,
                        y: hybridY,
                        rotation: assetTransform.rotation,
                        scaleX: assetTransform.scaleX,
                        scaleY: assetTransform.scaleY,
                        shearX: assetTransform.shearX,
                        shearY: assetTransform.shearY,
                        pivotX: transform.pivotX,
                        pivotY: transform.pivotY,
                        regX: assetTransform.regX,
                        regY: assetTransform.regY
                    }
                );
            } else {
                SpineAnimationHelper.applyBoneTransform(
                    context.bone,
                    transform
                );
            }
        }

        //-----------------------------------

        if (context.global.stageType === ConverterStageType.ANIMATION) {
            SpineAnimationHelper.applyBoneAnimation(
                context.global.animation,
                context.bone,
                context,
                transform,
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
