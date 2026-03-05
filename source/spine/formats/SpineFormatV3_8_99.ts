import { JsonFormatUtil } from '../../utils/JsonFormatUtil';
import { Logger } from '../../logger/Logger';
import { SpineAttachment } from '../attachment/SpineAttachment';
import { SpineClippingAttachment } from '../attachment/SpineClippingAttachment';
import { SpinePointAttachment } from '../attachment/SpinePointAttachment';
import { SpineRegionAttachment } from '../attachment/SpineRegionAttachment';
import { SpineAnimation } from '../SpineAnimation';
import { SpineBone } from '../SpineBone';
import { SpineEvent } from '../SpineEvent';
import { SpineSkeleton } from '../SpineSkeleton';
import { SpineSlot } from '../SpineSlot';
import { SpineTimeline } from '../timeline/SpineTimeline';
import { SpineTimelineFrame } from '../timeline/SpineTimelineFrame';
import { SpineTimelineGroup } from '../timeline/SpineTimelineGroup';
import { SpineAttachmentType } from '../types/SpineAttachmentType';
import { SpineTimelineType } from '../types/SpineTimelineType';
import { SpineFormat } from './SpineFormat';
import { SpineFormatOptimizer } from './SpineFormatOptimizer';

interface SpineBounds {
    x:number;
    y:number;
    width:number;
    height:number;
}

interface SpineBoundsAccumulator {
    initialized:boolean;
    minX:number;
    minY:number;
    maxX:number;
    maxY:number;
}

interface SpineBoneWorldTransform {
    a:number;
    b:number;
    c:number;
    d:number;
    worldX:number;
    worldY:number;
}

export class SpineFormatV3_8_99 implements SpineFormat {
    public readonly optimizer:SpineFormatOptimizer;
    public readonly version:string = '3.8.99';

    // Y-axis direction: Animate uses Y-down, Spine uses Y-up
    protected static readonly Y_FLIP:number = -1;
    protected static readonly DEG_TO_RAD:number = Math.PI / 180;

    public constructor() {
        this.optimizer = new SpineFormatOptimizer();
    }

    //-----------------------------------

    public convertSkeleton(skeleton:SpineSkeleton):any {
        const bounds = this.calculateSkeletonBounds(skeleton);

        if (bounds == null) {
            Logger.warning(
                'Skeleton metadata bounds could not be calculated. Using 0-sized bounds for skeleton:',
                skeleton.name
            );
        }

        return {
            spine: this.version,
            images: skeleton.imagesPath,
            hash: 'unknown',
            x: bounds != null ? bounds.x : 0,
            y: bounds != null ? bounds.y : 0,
            width: bounds != null ? bounds.width : 0,
            height: bounds != null ? bounds.height : 0
        };
    }

    protected calculateSkeletonBounds(skeleton:SpineSkeleton):SpineBounds | null {
        const worldTransformsByBoneName:{ [name:string]:SpineBoneWorldTransform } = {};
        const visitingByBoneName:{ [name:string]:boolean } = {};

        for (const bone of skeleton.bones) {
            this.resolveBoneWorldTransform(bone, worldTransformsByBoneName, visitingByBoneName);
        }

        const setupBounds = this.createEmptyBoundsAccumulator();
        for (const slot of skeleton.slots) {
            const attachment = slot.attachment;

            if (attachment == null || attachment.type !== SpineAttachmentType.REGION) {
                continue;
            }

            this.expandBoundsWithRegionAttachment(
                setupBounds,
                slot,
                attachment as SpineRegionAttachment,
                worldTransformsByBoneName,
                skeleton.name
            );
        }

        if (setupBounds.initialized) {
            return this.toSpineBounds(setupBounds, skeleton.name);
        }

        Logger.warning(
            'No setup pose region attachments found while calculating skeleton bounds for skeleton:',
            skeleton.name,
            'Falling back to all region attachments in slots.'
        );

        const fallbackBounds = this.createEmptyBoundsAccumulator();
        for (const slot of skeleton.slots) {
            for (const attachment of slot.attachments) {
                if (attachment.type !== SpineAttachmentType.REGION) {
                    continue;
                }

                this.expandBoundsWithRegionAttachment(
                    fallbackBounds,
                    slot,
                    attachment as SpineRegionAttachment,
                    worldTransformsByBoneName,
                    skeleton.name
                );
            }
        }

        if (!fallbackBounds.initialized) {
            Logger.warning(
                'No valid region attachments found for skeleton bounds metadata in skeleton:',
                skeleton.name
            );
            return null;
        }

        return this.toSpineBounds(fallbackBounds, skeleton.name);
    }

    protected resolveBoneWorldTransform(
        bone:SpineBone,
        worldTransformsByBoneName:{ [name:string]:SpineBoneWorldTransform },
        visitingByBoneName:{ [name:string]:boolean }
    ):SpineBoneWorldTransform {
        const boneName = this.requireName(bone.name, 'bone');

        const cached = worldTransformsByBoneName[boneName];
        if (cached != null) {
            return cached;
        }

        if (visitingByBoneName[boneName] === true) {
            Logger.warning('Bone hierarchy cycle detected while calculating skeleton bounds at bone:', boneName);
            throw new Error('Bone hierarchy cycle detected while calculating skeleton bounds at bone: ' + boneName);
        }

        visitingByBoneName[boneName] = true;

        const localX = this.numberOrDefault(bone.x, 0);
        const localY = this.numberOrDefault(bone.y, 0) * SpineFormatV3_8_99.Y_FLIP;
        const localRotation = this.numberOrDefault(bone.rotation, 0);
        const localShearX = this.numberOrDefault(bone.shearX, 0);
        const localShearY = this.numberOrDefault(bone.shearY, 0);
        const localScaleX = this.numberOrDefault(bone.scaleX, 1);
        const localScaleY = this.numberOrDefault(bone.scaleY, 1);

        const rotationX = (localRotation + localShearX) * SpineFormatV3_8_99.DEG_TO_RAD;
        const rotationY = (localRotation + 90 + localShearY) * SpineFormatV3_8_99.DEG_TO_RAD;
        const localA = Math.cos(rotationX) * localScaleX;
        const localB = Math.cos(rotationY) * localScaleY;
        const localC = Math.sin(rotationX) * localScaleX;
        const localD = Math.sin(rotationY) * localScaleY;

        let worldTransform:SpineBoneWorldTransform;

        if (bone.parent == null) {
            worldTransform = {
                a: localA,
                b: localB,
                c: localC,
                d: localD,
                worldX: localX,
                worldY: localY
            };
        } else {
            const parentName = this.requireName(bone.parent.name, 'parent bone');
            const parentWorldTransform = this.resolveBoneWorldTransform(
                bone.parent,
                worldTransformsByBoneName,
                visitingByBoneName
            );

            worldTransform = {
                a: parentWorldTransform.a * localA + parentWorldTransform.b * localC,
                b: parentWorldTransform.a * localB + parentWorldTransform.b * localD,
                c: parentWorldTransform.c * localA + parentWorldTransform.d * localC,
                d: parentWorldTransform.c * localB + parentWorldTransform.d * localD,
                worldX: parentWorldTransform.a * localX + parentWorldTransform.b * localY + parentWorldTransform.worldX,
                worldY: parentWorldTransform.c * localX + parentWorldTransform.d * localY + parentWorldTransform.worldY
            };

            if (parentName === boneName) {
                Logger.warning('Bone has itself as parent while calculating bounds:', boneName);
                throw new Error('Invalid bone parent relation for bone: ' + boneName);
            }
        }

        this.validateFiniteBoneWorldTransform(worldTransform, boneName);

        visitingByBoneName[boneName] = false;
        worldTransformsByBoneName[boneName] = worldTransform;

        return worldTransform;
    }

    protected expandBoundsWithRegionAttachment(
        bounds:SpineBoundsAccumulator,
        slot:SpineSlot,
        attachment:SpineRegionAttachment,
        worldTransformsByBoneName:{ [name:string]:SpineBoneWorldTransform },
        skeletonName:string
    ):void {
        if (slot.bone == null) {
            Logger.warning(
                'Slot has no parent bone while calculating skeleton bounds:',
                slot.name,
                'in skeleton:',
                skeletonName
            );
            throw new Error('Slot has no parent bone while calculating bounds: ' + slot.name);
        }

        const boneName = this.requireName(slot.bone.name, 'slot bone');
        const worldTransform = worldTransformsByBoneName[boneName];
        if (worldTransform == null) {
            Logger.warning(
                'Missing bone world transform while calculating skeleton bounds. Skeleton:',
                skeletonName,
                'slot:',
                slot.name,
                'bone:',
                boneName
            );
            throw new Error('Missing bone world transform for bone: ' + boneName);
        }

        const width = this.numberOrDefault(attachment.width, 0);
        const height = this.numberOrDefault(attachment.height, 0);
        if (width <= 0 || height <= 0) {
            Logger.warning(
                'Skipping region attachment with non-positive size while calculating skeleton bounds. Skeleton:',
                skeletonName,
                'slot:',
                slot.name,
                'attachment:',
                attachment.name,
                'width:',
                width,
                'height:',
                height
            );
            return;
        }

        const attachmentX = this.numberOrDefault(attachment.x, 0);
        const attachmentY = this.numberOrDefault(attachment.y, 0) * SpineFormatV3_8_99.Y_FLIP;
        const attachmentRotation = this.numberOrDefault(attachment.rotation, 0) * SpineFormatV3_8_99.DEG_TO_RAD;
        const attachmentScaleX = this.numberOrDefault(attachment.scaleX, 1);
        const attachmentScaleY = this.numberOrDefault(attachment.scaleY, 1);

        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const localCornerX:number[] = [-halfWidth, halfWidth, halfWidth, -halfWidth];
        const localCornerY:number[] = [-halfHeight, -halfHeight, halfHeight, halfHeight];
        const cos = Math.cos(attachmentRotation);
        const sin = Math.sin(attachmentRotation);

        for (let index = 0; index < 4; index++) {
            const scaledX = localCornerX[index] * attachmentScaleX;
            const scaledY = localCornerY[index] * attachmentScaleY;

            const rotatedX = scaledX * cos - scaledY * sin + attachmentX;
            const rotatedY = scaledX * sin + scaledY * cos + attachmentY;

            const worldX = worldTransform.a * rotatedX + worldTransform.b * rotatedY + worldTransform.worldX;
            const worldY = worldTransform.c * rotatedX + worldTransform.d * rotatedY + worldTransform.worldY;

            this.expandBoundsWithPoint(bounds, worldX, worldY);
        }
    }

    protected expandBoundsWithPoint(bounds:SpineBoundsAccumulator, x:number, y:number):void {
        if (!this.isFiniteNumber(x) || !this.isFiniteNumber(y)) {
            Logger.warning('Non-finite region vertex detected while calculating skeleton bounds. x:', x, 'y:', y);
            throw new Error('Invalid region vertex while calculating skeleton bounds.');
        }

        if (!bounds.initialized) {
            bounds.initialized = true;
            bounds.minX = x;
            bounds.maxX = x;
            bounds.minY = y;
            bounds.maxY = y;
            return;
        }

        if (x < bounds.minX) {
            bounds.minX = x;
        }
        if (x > bounds.maxX) {
            bounds.maxX = x;
        }
        if (y < bounds.minY) {
            bounds.minY = y;
        }
        if (y > bounds.maxY) {
            bounds.maxY = y;
        }
    }

    protected createEmptyBoundsAccumulator():SpineBoundsAccumulator {
        return {
            initialized: false,
            minX: 0,
            maxX: 0,
            minY: 0,
            maxY: 0
        };
    }

    protected toSpineBounds(bounds:SpineBoundsAccumulator, skeletonName:string):SpineBounds | null {
        if (!bounds.initialized) {
            return null;
        }

        const width = bounds.maxX - bounds.minX;
        const height = bounds.maxY - bounds.minY;
        if (width <= 0 || height <= 0) {
            Logger.warning(
                'Calculated skeleton bounds are non-positive. Skeleton:',
                skeletonName,
                'x:',
                bounds.minX,
                'y:',
                bounds.minY,
                'width:',
                width,
                'height:',
                height
            );
            return null;
        }

        return {
            x: this.roundBound(bounds.minX),
            y: this.roundBound(bounds.minY),
            width: this.roundBound(width),
            height: this.roundBound(height)
        };
    }

    protected validateFiniteBoneWorldTransform(transform:SpineBoneWorldTransform, boneName:string):void {
        if (
            !this.isFiniteNumber(transform.a)
            || !this.isFiniteNumber(transform.b)
            || !this.isFiniteNumber(transform.c)
            || !this.isFiniteNumber(transform.d)
            || !this.isFiniteNumber(transform.worldX)
            || !this.isFiniteNumber(transform.worldY)
        ) {
            Logger.warning('Non-finite bone world transform detected while calculating bounds. Bone:', boneName);
            throw new Error('Invalid bone world transform while calculating bounds. Bone: ' + boneName);
        }
    }

    protected requireName(name:string, label:string):string {
        if (name == null || name === '') {
            Logger.warning('Encountered', label, 'with empty name while calculating skeleton bounds metadata.');
            throw new Error('Encountered ' + label + ' with empty name while calculating skeleton bounds metadata.');
        }

        return name;
    }

    protected numberOrDefault(value:number, defaultValue:number):number {
        if (this.isFiniteNumber(value)) {
            return value;
        }

        return defaultValue;
    }

    protected isFiniteNumber(value:any):boolean {
        return typeof value === 'number' && !isNaN(value) && isFinite(value);
    }

    protected roundBound(value:number):number {
        return Math.round(value * 10000) / 10000;
    }

    public convertBone(bone:SpineBone):any {
        return JsonFormatUtil.cleanObject({
            name: bone.name,
            parent: (bone.parent != null) ? bone.parent.name : null,
            length: bone.length,
            transform: bone.transform,
            skin: bone.skin,
            x: bone.x,
            y: bone.y * SpineFormatV3_8_99.Y_FLIP,
            rotation: bone.rotation,
            scaleX: bone.scaleX,
            scaleY: bone.scaleY,
            shearX: bone.shearX,
            shearY: bone.shearY,
            color: bone.color
        });
    }

    public convertBones(skeleton:SpineSkeleton):any[] {
        const result:any[] = [];

        for (const bone of skeleton.bones) {
            result.push(this.convertBone(bone));
        }

        return result;
    }

    //-----------------------------------

    public convertTimelineFrameCurve(frame:SpineTimelineFrame):any {
        const curve = frame.curve;

        if (curve === 'stepped') {
            return { curve: 'stepped' };
        }

        if (curve != null) {
            return JsonFormatUtil.cleanObject({
                curve: curve.cx1,
                c2: curve.cy1,
                c3: curve.cx2,
                c4: curve.cy2
            });
        }

        // IMPORTANT: this return value is spread into an object literal.
        // Returning null/undefined can crash older JS engines when using the TS __assign helper.
        return {};
    }

    public convertTimelineFrame(frame:SpineTimelineFrame, flipY:boolean = false):any {
        const curve = this.convertTimelineFrameCurve(frame);

        return JsonFormatUtil.cleanObject({
            ...curve,

            time: frame.time,
            angle: frame.angle,
            name: frame.name,
            color: frame.color,
            x: frame.x,
            y: frame.y != null && flipY ? frame.y * SpineFormatV3_8_99.Y_FLIP : frame.y
        });
    }

    public convertTimeline(timeline:SpineTimeline):any[] {
        const length = timeline.frames.length;
        const result:any[] = [];
        const flipY = timeline.type === SpineTimelineType.TRANSLATE;

        for (let index = 0; index < length; index++) {
            const frame = this.convertTimelineFrame(timeline.frames[index], flipY);

            if (index === (length - 1)) {
                // last frame cannot contain curve property
                delete frame.curve;
            }

            result.push(frame);
        }

        return result;
    }

    public convertTimelineGroup(group:SpineTimelineGroup):any {
        this.optimizer.optimizeTimeline(group);

        const result:any = {};

        for (const timeline of group.timelines) {
            result[timeline.type] = this.convertTimeline(timeline);
        }

        return result;
    }

    public convertBonesTimeline(animation:SpineAnimation):any {
        const result:any = {};

        for (const group of animation.bones) {
            result[group.bone.name] = this.convertTimelineGroup(group);
        }

        return result;
    }

    public convertSlotsTimeline(animation:SpineAnimation):any {
        const result:any = {};

        for (const group of animation.slots) {
            result[group.slot.name] = this.convertTimelineGroup(group);
        }

        return result;
    }

    public convertAnimation(animation:SpineAnimation):any {
        return JsonFormatUtil.cleanObject({
            bones: this.convertBonesTimeline(animation),
            events: this.convertTimeline(animation.events),
            slots: this.convertSlotsTimeline(animation)
        });
    }

    public convertAnimations(skeleton:SpineSkeleton):any {
        const result:any = {};

        for (const animation of skeleton.animations) {
            result[animation.name] = this.convertAnimation(animation);
        }

        return result;
    }

    //-----------------------------------

    public convertClippingAttachment(attachment:SpineClippingAttachment):any {
        return JsonFormatUtil.cleanObject({
            type: attachment.type,
            name: attachment.name,
            end: (attachment.end != null) ? attachment.end.name : null,
            vertexCount: attachment.vertexCount,
            vertices: attachment.vertices,
            color: attachment.color
        });
    }

    public convertPointAttachment(attachment:SpinePointAttachment):any {
        return JsonFormatUtil.cleanObject({
            type: attachment.type,
            name: attachment.name,
            x: attachment.x,
            y: attachment.y != null ? attachment.y * SpineFormatV3_8_99.Y_FLIP : undefined,
            rotation: attachment.rotation,
            color: attachment.color
        });
    }

    public convertRegionAttachment(attachment:SpineRegionAttachment):any {
        return JsonFormatUtil.cleanObject({
            type: attachment.type,
            name: attachment.name,
            path: attachment.path,
            x: attachment.x,
            y: attachment.y != null ? attachment.y * SpineFormatV3_8_99.Y_FLIP : undefined,
            rotation: attachment.rotation,
            scaleX: attachment.scaleX,
            scaleY: attachment.scaleY,
            width: attachment.width,
            height: attachment.height,
            color: attachment.color
        });
    }

    public convertAttachment(attachment:SpineAttachment):any {
        switch (attachment.type) {
            case SpineAttachmentType.CLIPPING:
                return this.convertClippingAttachment(attachment as SpineClippingAttachment);
            case SpineAttachmentType.POINT:
                return this.convertPointAttachment(attachment as SpinePointAttachment);
            case SpineAttachmentType.REGION:
                return this.convertRegionAttachment(attachment as SpineRegionAttachment);
        }

        return null;
    }

    public convertSlotAttachments(slot:SpineSlot):any {
        const result:any = {};

        for (const attachment of slot.attachments) {
            result[attachment.name] = this.convertAttachment(attachment);
        }

        return result;
    }

    public convertSlot(slot:SpineSlot):any {
        return JsonFormatUtil.cleanObject({
            name: slot.name,
            bone: (slot.bone != null) ? slot.bone.name : null,
            attachment: (slot.attachment != null) ? slot.attachment.name : null,
            blend: slot.blend,
            color: slot.color
        });
    }

    public convertSlots(skeleton:SpineSkeleton):any[] {
        const result:any[] = [];

        for (const slot of skeleton.slots) {
            result.push(this.convertSlot(slot));
        }

        return result;
    }

    //-----------------------------------

    public convertEvent(event:SpineEvent):any {
        return JsonFormatUtil.cleanObject({
            name: event.name,
            int: event.int,
            float: event.float,
            string: event.string
        });
    }

    public convertEvents(skeleton:SpineSkeleton):any {
        const result:any = {};

        for (const event of skeleton.events) {
            result[event.name] = this.convertEvent(event);
        }

        return result;
    }

    //-----------------------------------

    public convertSkinAttachments(skeleton:SpineSkeleton):any {
        const result:any = {};

        for (const slot of skeleton.slots) {
            result[slot.name] = this.convertSlotAttachments(slot);
        }

        return result;
    }

    public convertSkins(skeleton:SpineSkeleton):any[] {
        return [
            {
                attachments: this.convertSkinAttachments(skeleton),
                name: 'default'
            }
        ];
    }

    //-----------------------------------

    public convert(skeleton:SpineSkeleton):any {
        return JsonFormatUtil.cleanObject({
            skeleton: this.convertSkeleton(skeleton),
            bones: this.convertBones(skeleton),
            animations: this.convertAnimations(skeleton),
            slots: this.convertSlots(skeleton),
            events: this.convertEvents(skeleton),
            skins: this.convertSkins(skeleton)
        });
    }
}
