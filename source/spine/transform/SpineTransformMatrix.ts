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

    public constructor(element:FlashElement, reference: { rotation: number, scaleX: number, scaleY: number } = null) {
        // Position: The Spine bone must be positioned at the Transformation Point.
        // element.transformX/Y are the global (parent) coordinates of the transformation point.
        this.x = element.transformX;
        this.y = element.transformY;

        const name = element.name || element.libraryItem?.name || '<anon>';

        // Decompose the matrix to get robust Rotation, Scale, and Shear
        const decomposed = SpineTransformMatrix.decomposeMatrix(element.matrix, reference, name);
        
        this.rotation = decomposed.rotation;
        this.scaleX = decomposed.scaleX;
        this.scaleY = decomposed.scaleY;
        this.shearX = decomposed.shearX;
        this.shearY = decomposed.shearY;

        // Debug extended transform info
        if (decomposed.scaleX < 0 || decomposed.scaleY < 0) {
            Logger.trace(`[SpineTransformMatrix] ${name}: MIRRORED -> rot=${this.rotation.toFixed(2)} sx=${this.scaleX.toFixed(2)} sy=${this.scaleY.toFixed(2)} shearX=${this.shearX.toFixed(2)}`);
        }
    }

    /**

     * Decomposes an Animate Matrix into Spine components (Rotation, Scale, Shear).
     * Based on the "Advanced Coordinate System Transformation" technical monograph.
     * @param mat The Flash Matrix
     * @param reference Optional previous transform to help disambiguate flip (handedness) choices.
     * @param debugName Optional name for logging
     */
    public static decomposeMatrix(mat: FlashMatrix, reference: { rotation: number, scaleX: number, scaleY: number } = null, debugName: string = ''): { rotation: number, scaleX: number, scaleY: number, shearX: number, shearY: number } {
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
        let shearX = 0;

        if (det < 0) {
            // Handedness flip (Mirroring)
            // We can achieve this by negating scaleX OR scaleY.
            
            // Option A: Flip Y (Standard QR decomposition preference)
            // rotY_logical = rotY + PI
            // rotation = -rotX (Animate is CW, so we negate)
            
            const rotY_flipY = rotYRad + Math.PI;
            let rot_flipY = -rotXRad * (180 / Math.PI);
            // Normalize to -180..180
            while (rot_flipY <= -180) rot_flipY += 360;
            while (rot_flipY > 180) rot_flipY -= 360;
            
            // Option B: Flip X
            // rotX_logical = rotX + PI
            // rotation = -rotX_logical = -(rotX + PI)
            
            const rotX_flipX = rotXRad + Math.PI;
            let rot_flipX = -rotX_flipX * (180 / Math.PI);
            // Normalize
            while (rot_flipX <= -180) rot_flipX += 360;
            while (rot_flipX > 180) rot_flipX -= 360;
            
            let useFlipX = false;
            let reason = "default heuristic";

            if (reference != null) {
                // Heuristic: Continuity with Reference (Previous Frame or Setup Pose)
                
                // Compare rotational distance
                let diffA = Math.abs(rot_flipY - reference.rotation);
                while (diffA > 180) diffA -= 360;
                while (diffA < -180) diffA += 360;
                diffA = Math.abs(diffA);

                let diffB = Math.abs(rot_flipX - reference.rotation);
                while (diffB > 180) diffB -= 360;
                while (diffB < -180) diffB += 360;
                diffB = Math.abs(diffB);
                
                // Compare scale signs (parity)
                // Option A implies ScaleY < 0. Option B implies ScaleX < 0.
                const scoreA = diffA + (NumberUtil.sign(reference.scaleY) !== -1 ? 1000 : 0) + (NumberUtil.sign(reference.scaleX) !== 1 ? 1000 : 0);
                const scoreB = diffB + (NumberUtil.sign(reference.scaleX) !== -1 ? 1000 : 0) + (NumberUtil.sign(reference.scaleY) !== 1 ? 1000 : 0);

                if (scoreB < scoreA) {
                    useFlipX = true;
                    reason = "continuity match (scoreB < scoreA)";
                } else {
                    reason = "continuity match (scoreA <= scoreB)";
                }
            } else {
                // Default Heuristic: Choose the smaller absolute rotation
                if (Math.abs(rot_flipX) < Math.abs(rot_flipY)) {
                    useFlipX = true;
                    reason = "smaller rotation";
                }
            }

            if (useFlipX) {
                // Use Flip X
                scaleX = -scaleX;
                rotation = rot_flipX;
                
                // Shear calc for Flip X
                let shearRaw = rotYRad - rotX_flipX - (Math.PI / 2);
                while (shearRaw <= -Math.PI) shearRaw += 2 * Math.PI;
                while (shearRaw > Math.PI) shearRaw -= 2 * Math.PI;
                shearX = -shearRaw * (180 / Math.PI); // Negate for CCW
                
                Logger.trace(`[Decompose] ${debugName}: Flip X chosen. Reason: ${reason}. Rot: ${rot_flipX.toFixed(2)}`);
            } else {
                // Use Flip Y
                scaleY = -scaleY;
                rotation = rot_flipY;
                
                // Shear calc for Flip Y
                let shearRaw = rotY_flipY - rotXRad - (Math.PI / 2);
                while (shearRaw <= -Math.PI) shearRaw += 2 * Math.PI;
                while (shearRaw > Math.PI) shearRaw -= 2 * Math.PI;
                shearX = -shearRaw * (180 / Math.PI);
                
                Logger.trace(`[Decompose] ${debugName}: Flip Y chosen. Reason: ${reason}. Rot: ${rot_flipY.toFixed(2)}`);
            }
            
        } else {
            // Normal (Positive Determinant)
            rotation = -rotXRad * (180 / Math.PI);
            
            // Shear
            // shear = rotY - rotX - PI/2
            let shearRaw = rotYRad - rotXRad - (Math.PI / 2);
            while (shearRaw <= -Math.PI) shearRaw += 2 * Math.PI;
            while (shearRaw > Math.PI) shearRaw -= 2 * Math.PI;
            shearX = -shearRaw * (180 / Math.PI);
        }

        return {
            rotation: rotation,
            scaleX: scaleX,
            scaleY: scaleY,
            shearX: shearX,
            shearY: 0
        };
    }
}
