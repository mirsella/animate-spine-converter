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

    public constructor(element:FlashElement, reference: { rotation: number, scaleX: number, scaleY: number } = null, matrixOverride: FlashMatrix = null, positionOverride: {x:number, y:number} = null) {
        // Position: The Spine bone must be positioned at the Transformation Point.
        if (positionOverride) {
            this.x = positionOverride.x;
            this.y = positionOverride.y;
        } else {
            this.x = element.transformX;
            this.y = element.transformY;
        }

        const name = element.name || element.libraryItem?.name || '<anon>';

        // Decompose the matrix
        // Use override if provided (e.g. for Layer Parenting resolution)
        const mat = matrixOverride || element.matrix;
        const decomposed = SpineTransformMatrix.decomposeMatrix(mat, reference, name);
        
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
    public static decomposeMatrix(mat: FlashMatrix, reference: { rotation: number, scaleX: number, scaleY: number } = null, debugName: string = ''): { rotation: number, scaleX: number, scaleY: number, shearX: number, shearY: number } {
        // Animate Matrix (Y-Down):
        // [a  c  tx]
        // [b  d  ty]
        // [0  0  1 ]
        //
        // Basis Vectors in Animate:
        // U_anim = (a, b)
        // V_anim = (c, d)
        
        // Convert to Spine Space (Y-Up):
        // P_spine = (x, -y)
        // Transform Matrix M_spine:
        // [ a  -c  tx]
        // [-b   d -ty]
        //
        // Basis Vectors in Spine:
        // U_spine = (a, -b)
        // V_spine = (-c, d)

        const a = mat.a;
        const b = -mat.b; // Negate Y component of U
        const c = -mat.c; // Negate X component of V (from M_spine derivation)
        const d = mat.d;  // D stays positive (d -> d)

        // 1. Scale
        let scaleX = Math.sqrt(a * a + b * b);
        let scaleY = Math.sqrt(c * c + d * d);

        // 2. Determinant (Signed Area)
        const det = a * d - b * c;

        // 3. Flip Handling
        // If determinant is negative, the basis is flipped (handedness change).
        // We handle this by negating ScaleY.
        if (det < 0) {
            scaleY = -scaleY;
        }

        // 4. Angles
        // Angle of X-Axis
        let angleX = Math.atan2(b, a) * (180 / Math.PI);
        // Angle of Y-Axis (Use the sign-corrected basis if flipped?)
        // Actually, if det < 0, we flip Y scale. 
        // The "Geometric" Y axis we want to represent is V_spine.
        // If scaleY is negative, Spine will render -Y_local.
        // We want -Y_local to align with V_spine.
        // So Y_local should align with -V_spine.
        // So we calculate angle of V_spine, and if scaleY < 0, we treat it as...
        // Wait, standard decomposition:
        // angleX = atan2(u)
        // angleY = atan2(v)
        // shear = angleY - angleX - 90
        // If det < 0, shear will be around 180 or -180.
        // We don't want massive shears for simple flips. We want negative scale.
        // If we set scaleY = -1.
        // Then standard Spine Y axis is inverted.
        // Angle relation: Y_actual = Y_basis * scaleY.
        // If scaleY = -1, Y_actual = -Y_basis.
        // So Y_basis = -Y_actual = -V_spine.
        // So we should calculate angle of -V_spine if flipped.
        
        let angleY_rad = Math.atan2(d, c);
        if (scaleY < 0) {
            // If flipped, the "basis" Y is opposite to the visual vector
            angleY_rad = Math.atan2(-d, -c);
        }
        let angleY = angleY_rad * (180 / Math.PI);

        // 5. Rotation & Shear
        let rotation = angleX;
        
        // ShearY: Deviation of Y-Axis from Orthogonality relative to X-Axis
        // Spine: y_angle = rotation + 90 + shearY
        // shearY = y_angle - rotation - 90
        let shearY = angleY - rotation - 90;

        // Sign Inversion for Spine Compatibility
        // Empirical testing:
        // V1: shearY = -shearY (User reported "skewed the right amount but to the other direction")
        // V2: Removed negation.
        // shearY = -shearY;

        // Unwrap Rotation using Reference (Continuity)
        const rotRaw = rotation;
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
            // Default Normalize
            while (rotation <= -180) rotation += 360;
            while (rotation > 180) rotation -= 360;
        }
        
        while (shearY <= -180) shearY += 360;
        while (shearY > 180) shearY -= 360;

        return {
            rotation: Math.round(rotation * 10000) / 10000,
            scaleX: Math.round(scaleX * 10000) / 10000,
            scaleY: Math.round(scaleY * 10000) / 10000,
            shearX: 0,
            shearY: Math.round(shearY * 10000) / 10000
        };
    }

}
