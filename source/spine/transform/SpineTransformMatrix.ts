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
        // Position: The Spine bone must be positioned at the Transformation Point.
        // element.transformX/Y are the global (parent) coordinates of the transformation point.
        this.x = element.transformX;
        this.y = element.transformY;

        // Decompose the matrix to get robust Rotation, Scale, and Shear
        const decomposed = SpineTransformMatrix.decomposeMatrix(element.matrix);
        
        this.rotation = decomposed.rotation;
        this.scaleX = decomposed.scaleX;
        this.scaleY = decomposed.scaleY;
        this.shearX = decomposed.shearX;
        this.shearY = decomposed.shearY;

        // Debug extended transform info
        const name = element.name || element.libraryItem?.name || '<anon>';
        Logger.trace(`[SpineTransformMatrix] ${name}: decomposed rot=${this.rotation.toFixed(2)} sx=${this.scaleX.toFixed(2)} sy=${this.scaleY.toFixed(2)} shearY=${this.shearY.toFixed(2)}`);
    }

    /**
     * Decomposes an Animate Matrix into Spine components (Rotation, Scale, Shear).
     * Based on the "Advanced Coordinate System Transformation" technical monograph.
     */
    public static decomposeMatrix(mat: FlashMatrix): { rotation: number, scaleX: number, scaleY: number, shearX: number, shearY: number } {
        const a = mat.a;
        const b = mat.b;
        const c = mat.c;
        const d = mat.d;

        // 1. Scale Extraction
        // Scale is the magnitude of the basis vectors.
        let scaleX = Math.sqrt(a * a + b * b);
        let scaleY = Math.sqrt(c * c + d * d);

        // 2. Rotation and Shear Extraction
        const rotXRad = Math.atan2(b, a);
        const rotYRad = Math.atan2(d, c);
        
        const det = a * d - b * c;
        
        let rotation = 0;
        let shearY = 0;

        if (det < 0) {
            // Handedness flip (Mirroring)
            // We can achieve this by negating scaleX OR scaleY.
            // We choose the one that results in a simpler rotation (closer to 0).
            
            // Option A: Flip Y (Standard QR decomposition preference)
            // If we flip Y, the logical Y axis is opposite to physical Y.
            // rotY_logical = rotY + PI
            // rotation = -rotX (Animate is CW, so we negate)
            // shear = (rotY + PI) - rotX - PI/2
            
            const rotY_flipY = rotYRad + Math.PI;
            let rot_flipY = -rotXRad * (180 / Math.PI);
            // Normalize to -180..180
            while (rot_flipY <= -180) rot_flipY += 360;
            while (rot_flipY > 180) rot_flipY -= 360;
            
            // Option B: Flip X
            // If we flip X, the logical X axis is opposite to physical X.
            // rotX_logical = rotX + PI
            // rotation = -rotX_logical = -(rotX + PI)
            // shear = rotY - (rotX + PI) - PI/2
            
            const rotX_flipX = rotXRad + Math.PI;
            let rot_flipX = -rotX_flipX * (180 / Math.PI);
            // Normalize
            while (rot_flipX <= -180) rot_flipX += 360;
            while (rot_flipX > 180) rot_flipX -= 360;
            
            // Decision: Choose the smaller absolute rotation
            if (Math.abs(rot_flipX) < Math.abs(rot_flipY)) {
                // Use Flip X
                scaleX = -scaleX;
                rotation = rot_flipX;
                
                // Shear calc for Flip X
                let shearRaw = rotYRad - rotX_flipX - (Math.PI / 2);
                while (shearRaw <= -Math.PI) shearRaw += 2 * Math.PI;
                while (shearRaw > Math.PI) shearRaw -= 2 * Math.PI;
                shearY = -shearRaw * (180 / Math.PI); // Negate for CCW
            } else {
                // Use Flip Y
                scaleY = -scaleY;
                rotation = rot_flipY;
                
                // Shear calc for Flip Y
                let shearRaw = rotY_flipY - rotXRad - (Math.PI / 2);
                while (shearRaw <= -Math.PI) shearRaw += 2 * Math.PI;
                while (shearRaw > Math.PI) shearRaw -= 2 * Math.PI;
                shearY = -shearRaw * (180 / Math.PI);
            }
            
        } else {
            // Standard non-flipped
            rotation = -rotXRad * (180 / Math.PI);
            
            let shearRaw = rotYRad - rotXRad - (Math.PI / 2);
            while (shearRaw <= -Math.PI) shearRaw += 2 * Math.PI;
            while (shearRaw > Math.PI) shearRaw -= 2 * Math.PI;
            shearY = -shearRaw * (180 / Math.PI);
        }

        return {
            rotation: rotation,
            scaleX: scaleX,
            scaleY: scaleY,
            shearX: 0,
            shearY: shearY
        };
    }
}
