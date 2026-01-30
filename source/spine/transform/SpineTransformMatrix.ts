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

    public constructor(element:FlashElement, reference: { rotation: number, scaleX: number, scaleY: number } = null, matrixOverride: FlashMatrix = null, positionOverride: {x:number, y:number} = null, isTween: boolean = false) {
        // Position: The Spine bone must be positioned at the Transformation Point.
        if (positionOverride) {
            this.x = positionOverride.x;
            this.y = positionOverride.y;
        } else {
            this.x = element.transformX;
            this.y = element.transformY;
        }

        const name = element.name || element.libraryItem?.name || '<anon>';
        
        // Log transform points
        Logger.trace(`[MATRIX] '${name}' Transform: pos=(${this.x.toFixed(2)}, ${this.y.toFixed(2)}) registration=(${element.x.toFixed(2)}, ${element.y.toFixed(2)}) pivot=(${element.transformationPoint.x.toFixed(2)}, ${element.transformationPoint.y.toFixed(2)})`);

        // Decompose the matrix
        // Use override if provided (e.g. for Layer Parenting resolution)
        const mat = matrixOverride || element.matrix;
        const decomposed = SpineTransformMatrix.decomposeMatrix(mat, reference, name, isTween);
        
        this.rotation = decomposed.rotation;
        this.scaleX = decomposed.scaleX;
        this.scaleY = decomposed.scaleY;
        this.shearX = decomposed.shearX;
        this.shearY = decomposed.shearY;
    }

    /**
     * Decomposes an Animate Matrix into Spine components using a robust Basis Vector approach.
     * Accounts for coordinate system differences (Animate Y-Down vs Spine Y-Up).
     */
    public static decomposeMatrix(mat: FlashMatrix, reference: { rotation: number, scaleX: number, scaleY: number } = null, debugName: string = '', isTween: boolean = false): { rotation: number, scaleX: number, scaleY: number, shearX: number, shearY: number } {
        // Log raw matrix for debugging
        Logger.trace(`[DECOMPOSE] '${debugName}' Raw Flash Matrix: a=${mat.a.toFixed(4)} b=${mat.b.toFixed(4)} c=${mat.c.toFixed(4)} d=${mat.d.toFixed(4)} tx=${mat.tx.toFixed(2)} ty=${mat.ty.toFixed(2)}`);

        // Spine Basis Vectors derived from Animate Matrix (Y-Up conversion)
        // Assumption Check: Animate is Y-down. We flip 'b' and 'c' because they represent 
        // the cross-axis influence in the rotation/skew components.
        const a = mat.a;
        const b = -mat.b;
        const c = -mat.c;
        const d = mat.d;

        Logger.trace(`[DECOMPOSE] '${debugName}' Y-Up Basis: a=${a.toFixed(4)} b=${b.toFixed(4)} c=${c.toFixed(4)} d=${d.toFixed(4)}`);

        let scaleX = Math.sqrt(a * a + b * b);
        let scaleY = Math.sqrt(c * c + d * d);
        const det = a * d - b * c;

        Logger.trace(`[DECOMPOSE] '${debugName}' Magnitudes: scaleX_raw=${scaleX.toFixed(4)} scaleY_raw=${scaleY.toFixed(4)} det=${det.toFixed(6)}`);

        // Base angles for X and Y axes
        let angleX = Math.atan2(b, a) * (180 / Math.PI);
        let angleY = Math.atan2(d, c) * (180 / Math.PI);

        let rotation = angleX;
        let appliedScaleX = scaleX;
        let appliedScaleY = scaleY;

        if (det < 0) {
            // Negative determinant means a flip exists.
            // Option 1: Flip Y (Default basis)
            const rot1 = angleX;
            
            // Option 2: Flip X (Rotate 180 and Flip Y)
            let rot2 = angleX + 180;
            while (rot2 > 180) rot2 -= 360;
            while (rot2 <= -180) rot2 += 360;
            
            if (reference) {
                const diff1 = Math.abs(NumberUtil.deltaAngle(rot1, reference.rotation));
                const diff2 = Math.abs(NumberUtil.deltaAngle(rot2, reference.rotation));
                
                Logger.trace(`[DECOMPOSE] '${debugName}' Flip Detected. RefRot=${reference.rotation.toFixed(2)}. Opt1(FlipY): ${rot1.toFixed(2)} (diff ${diff1.toFixed(2)}). Opt2(FlipX): ${rot2.toFixed(2)} (diff ${diff2.toFixed(2)})`);

                // DISCONTINUITY PREVENTION:
                // If we are tweening, we MUST prioritize staying close to the reference.
                const threshold = isTween ? 90 : 10;
                
                if (diff2 < diff1 - threshold) { 
                    rotation = rot2;
                    appliedScaleX = -scaleX;
                    appliedScaleY = scaleY;
                    Logger.trace(`[DECOMPOSE] '${debugName}' Chosen Opt 2 (FlipX) - stability threshold: ${threshold}`);
                } else {
                    rotation = rot1;
                    appliedScaleX = scaleX;
                    appliedScaleY = -scaleY;
                    Logger.trace(`[DECOMPOSE] '${debugName}' Chosen Opt 1 (FlipY) - default.`);
                }
            } else {
                // NO REFERENCE (First frame of this bone)
                // Heuristic: Prefer the option with the smaller rotation.
                // Animate's "Flip Horizontal" often has 0 rotation and scaleX = -1.
                // Our angleX for a flipped basis is 180.
                // Option 1 (FlipY): 180 deg
                // Option 2 (FlipX): 0 deg
                // Choosing the smaller rotation (Option 2) matches Animate's visual properties better.
                if (Math.abs(rot2) < Math.abs(rot1) - 10) {
                    rotation = rot2;
                    appliedScaleX = -scaleX;
                    appliedScaleY = scaleY;
                    Logger.trace(`[DECOMPOSE] '${debugName}' Flip Detected. No reference. Heuristic: Chosen Opt 2 (FlipX) because rot ${rot2.toFixed(2)} is smaller than ${rot1.toFixed(2)}`);
                } else {
                    rotation = rot1;
                    appliedScaleX = scaleX;
                    appliedScaleY = -scaleY;
                    Logger.trace(`[DECOMPOSE] '${debugName}' Flip Detected. No reference. Defaulting to Flip Y.`);
                }
            }
        }

        // Recalculate shear based on the chosen rotation/scale signs
        // Spine Y-Axis angle = rotation + 90 + shearY
        let visualAngleY = angleY;
        if (appliedScaleY < 0) {
            visualAngleY = Math.atan2(-d, -c) * (180 / Math.PI);
        }
        
        let shearY = visualAngleY - rotation - 90;
        while (shearY <= -180) shearY += 360;
        while (shearY > 180) shearY -= 360;

        // Log intermediate decomposition steps
        Logger.trace(`[DECOMPOSE] '${debugName}' Decomposition: det=${det.toFixed(4)} angleX=${angleX.toFixed(2)} angleY=${angleY.toFixed(2)} chosenRot=${rotation.toFixed(2)}`);

        // Unwrap Rotation (Shortest path to reference)
        if (reference) {
            let diff = rotation - reference.rotation;
            while (diff > 180) {
                rotation -= 360;
                diff -= 360;
            }
            while (diff < -180) {
                rotation += 360;
                diff += 360;
            }
        } else {
            while (rotation <= -180) rotation += 360;
            while (rotation > 180) rotation -= 360;
        }

        const result = {
            rotation: Math.round(rotation * 10000) / 10000,
            scaleX: Math.round(appliedScaleX * 10000) / 10000,
            scaleY: Math.round(appliedScaleY * 10000) / 10000,
            shearX: 0,
            shearY: Math.round(shearY * 10000) / 10000
        };

        Logger.trace(`[DECOMPOSE] '${debugName}' Result: rot=${result.rotation.toFixed(2)} sx=${result.scaleX.toFixed(2)} sy=${result.scaleY.toFixed(2)} shY=${result.shearY.toFixed(2)}`);

        return result;
    }

}
