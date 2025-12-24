import { NumberUtil } from '../../utils/NumberUtil';
import { Logger } from '../../logger/Logger';
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
        
        Logger.trace(`[SpineTransformMatrix] Init for ${element.name || '<anon>'} (${element.elementType})`);
        Logger.trace(`  Raw Matrix: a=${matrix.a.toFixed(4)} b=${matrix.b.toFixed(4)} c=${matrix.c.toFixed(4)} d=${matrix.d.toFixed(4)} tx=${matrix.tx.toFixed(2)} ty=${matrix.ty.toFixed(2)}`);

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

        Logger.trace(`  Result: pos=(${this.x.toFixed(2)}, ${this.y.toFixed(2)}) rot=${this.rotation.toFixed(2)} scale=(${this.scaleX.toFixed(2)}, ${this.scaleY.toFixed(2)}) shear=(${this.shearX.toFixed(2)}, ${this.shearY.toFixed(2)}) pivot=(${this.pivotX.toFixed(2)}, ${this.pivotY.toFixed(2)}) reg=(${this.regX.toFixed(2)}, ${this.regY.toFixed(2)})`);
    }
}
