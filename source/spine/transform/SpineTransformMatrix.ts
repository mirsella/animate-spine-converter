import { Logger } from '../../logger/Logger';
import { NumberUtil } from '../../utils/NumberUtil';
import { SpineTransform } from './SpineTransform';

export class SpineTransformMatrix implements SpineTransform {
    public static readonly Y_DIRECTION:number = -1;

    public x:number;
    public y:number;
    public rotation:number;
    public scaleX:number;
    public scaleY:number;
    public shearX:number;
    public shearY:number;

    public constructor(element:FlashElement) {
        // We use the Transformation Point (Anchor) for the bone position.
        // element.transformX/Y represent the position of the Anchor Point in the parent timeline.
        this.x = element.transformX;
        this.y = element.transformY * SpineTransformMatrix.Y_DIRECTION;

        Logger.trace(`[SpineTransformMatrix] ${element.name || element.libraryItem?.name || '<anon>'}: x=${element.x}, y=${element.y}, transformX=${element.transformX}, transformY=${element.transformY}`);

        this.rotation = 0;
        this.scaleX = element.scaleX;
        this.scaleY = element.scaleY;
        this.shearX = 0;
        this.shearY = 0;

        if (NumberUtil.equals(element.skewX, element.skewY)) {
            this.rotation = -element.rotation;
        } else {
            this.shearX = -element.skewY;
            this.shearY = -element.skewX;
        }

        Logger.trace(`[SpineTransformMatrix] ${element.name || element.libraryItem?.name || '<anon>'}: pos=(${this.x.toFixed(2)}, ${this.y.toFixed(2)}) rot=${this.rotation.toFixed(2)}`);
    }
}
