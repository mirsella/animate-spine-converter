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
    public pivotX:number;
    public pivotY:number;
    public regX:number;
    public regY:number;

    public constructor(element:FlashElement) {
        const matrix = element.matrix;

        let baseX = matrix.tx;
        let baseY = matrix.ty * SpineTransformMatrix.Y_DIRECTION;

        if (element.elementType === 'shape') {
            if (element.layer.layerType !== 'mask') {
                baseY = element.y * SpineTransformMatrix.Y_DIRECTION;
                baseX = element.x;
            }
        }

        this.regX = baseX;
        this.regY = baseY;

        const tp = element.transformationPoint;
        this.pivotX = tp ? tp.x : 0;
        this.pivotY = tp ? tp.y : 0;

        if (tp && element.elementType !== 'shape') {
            const rotation = element.rotation * Math.PI / 180;
            const cos = Math.cos(rotation);
            const sin = Math.sin(rotation);
            const scaledX = tp.x * element.scaleX;
            const scaledY = tp.y * element.scaleY;
            const rotatedX = scaledX * cos - scaledY * sin;
            const rotatedY = scaledX * sin + scaledY * cos;
            baseX += rotatedX;
            baseY -= rotatedY;
        }

        this.x = baseX;
        this.y = baseY;

        this.rotation = 0;
        this.scaleX = element.scaleX;
        this.scaleY = element.scaleY;
        this.shearX = 0;
        this.shearY = 0;

        // More robust rotation detection
        const skewX = element.skewX;
        const skewY = element.skewY;
        
        if (NumberUtil.equals(skewX, skewY, 0.5)) { // Loosened tolerance even more
            this.rotation = -element.rotation;
        } else {
            this.shearX = -skewY;
            this.shearY = -skewX;
        }
    }
}
