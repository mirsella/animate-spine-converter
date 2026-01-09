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
        this.x = element.transformX;
        this.y = element.transformY;

        const name = element.name || element.libraryItem?.name || '<anon>';

        // Decompose the matrix
        const decomposed = SpineTransformMatrix.decomposeMatrix(element.matrix, reference, name);
        
        this.rotation = decomposed.rotation;
        this.scaleX = decomposed.scaleX;
        this.scaleY = decomposed.scaleY;
        this.shearX = decomposed.shearX;
        this.shearY = decomposed.shearY;
    }

    /**
     * Decomposes an Animate Matrix into Spine components.
     * Handles Scale, Rotation, Shear, and Mirroring (Flipping).
     */
    public static decomposeMatrix(mat: FlashMatrix, reference: { rotation: number, scaleX: number, scaleY: number } = null, debugName: string = ''): { rotation: number, scaleX: number, scaleY: number, shearX: number, shearY: number } {
        const a = mat.a;
        const b = mat.b;
        const c = mat.c;
        const d = mat.d;

        // Basis Vectors
        // U = (a, b)
        // V = (c, d)

        // 1. Scale X and Rotation (from Vector U)
        let scaleX = Math.sqrt(a * a + b * b);
        
        // Rotation (CCW for Spine)
        // Animate (Y-Down): atan2(b, a) is angle from X-axis.
        // Spine (Y-Up): We negate the angle.
        const rotXRad = Math.atan2(b, a);
        let rotation = -rotXRad * (180 / Math.PI);

        // 2. Determinant
        const det = a * d - b * c;
        
        // 3. Scale Y
        // Use det / scaleX.
        // - Preserves flipping sign (if det < 0, scaleY < 0).
        // - Preserves Animate's visual skew squashing (Area = det).
        let scaleY = (scaleX > 0.00001) ? (det / scaleX) : 0;

        // 4. Shear X
        // Angle of Vector V
        const rotYRad = Math.atan2(d, c);
        
        // Shear is the angular deviation of V from orthogonality.
        // In standard frame: V should be U + 90deg.
        // Shear = Angle(V) - Angle(U) - 90.
        let shearRad = rotYRad - rotXRad - (Math.PI / 2);
        
        // 5. Flip Correction
        // If we are flipped (ScaleY < 0), the "visual" Y-axis (V) is flipped relative to the "local" Y-axis.
        // Local Y-axis (before scale) is U + 90.
        // Flipped Y-axis (after scale) is -(U + 90).
        // The angle 'rotYRad' is the angle of V.
        // If V is roughly opposite to U+90, 'shearRad' will be roughly 180 degrees (PI).
        // This visual 180 flip is accounted for by 'scaleY = -1'.
        // So we subtract PI from shear to get the "shear relative to the flipped basis".
        if (scaleY < 0) {
            shearRad -= Math.PI;
        }

        // Normalize Shear to -180..180
        while (shearRad <= -Math.PI) shearRad += 2 * Math.PI;
        while (shearRad > Math.PI) shearRad -= 2 * Math.PI;
        
        // Convert to Degrees and Negate for Spine (CCW)
        let shearX = -shearRad * (180 / Math.PI);

        // Normalize Rotation to -180..180
        while (rotation <= -180) rotation += 360;
        while (rotation > 180) rotation -= 360;
        
        // Normalize ShearX to -180..180
        while (shearX <= -180) shearX += 360;
        while (shearX > 180) shearX -= 360;

        // --- Continuity Heuristic (Optional) ---
        // If we have a reference (previous frame), and the current solution involves a flip (scaleY < 0),
        // we check if an "X-Flip" solution (scaleX < 0) would be closer in rotation.
        // Current Solution (S1): Rot, Sx, Sy<0, Shear
        // Alternative Solution (S2): X-Flip
        // Rot2 = Rot + 180
        // Sx2 = -Sx
        // Sy2 = -Sy (so Sy2 > 0)
        // Shear2 = Shear (roughly? depends on basis)
        
        if (reference) {
            // Only consider alternatives if we are flipped or reference is flipped
            const isFlipped = scaleY < 0;
            const refScaleX = reference.scaleX;
            
            // If current is Y-Flip (Sx>0, Sy<0), but Ref has Sx<0 (X-Flip):
            // We might want to switch to X-Flip to avoid Rotation popping by 180.
            
            // Or simply: Generate Candidate 2 (Flip X) and compare scores.
            
            // Cand 2: Flip X
            const angleX_flip = Math.atan2(-b, -a);
            let rot2 = -angleX_flip * (180 / Math.PI);
            while (rot2 <= -180) rot2 += 360; while (rot2 > 180) rot2 -= 360;
            
            let diff1 = Math.abs(rotation - reference.rotation);
            if (diff1 > 180) diff1 = 360 - diff1;
            
            let diff2 = Math.abs(rot2 - reference.rotation);
            if (diff2 > 180) diff2 = 360 - diff2;
            
            // If Rot2 is significantly closer, use it.
            // But prefer preserving ScaleX sign.
            const signMatch1 = NumberUtil.sign(scaleX) === NumberUtil.sign(refScaleX);
            const signMatch2 = NumberUtil.sign(-scaleX) === NumberUtil.sign(refScaleX);
            
            // Add penalty for sign mismatch
            const penalty = 1000;
            const score1 = diff1 + (signMatch1 ? 0 : penalty);
            const score2 = diff2 + (signMatch2 ? 0 : penalty);
            
            if (score2 < score1) {
                // Adopt Flip X
                rotation = rot2;
                scaleX = -scaleX;
                // ScaleY must also flip sign to maintain Determinant?
                // det = sx * sy ... if sx flips, sy must flip?
                // No, det is fixed. det = sx * sy. 
                // If we flip sx, we must flip sy to keep det same.
                scaleY = -scaleY;
                
                // Recalculate shear for Flip X?
                // Visual Y is (c,d). Local Y is now orthogonal to FLIPPED X.
                // Rot2 is angle of -U.
                // Orthogonal Y to -U is (-U) + 90.
                // Shear = Angle(V) - Angle(-U + 90).
                // Let's re-run shear math relative to Rot2.
                // ... Or just assume shear is similar? 
                // Actually, if we flip both axes (Rot 180), Shear is unchanged.
                // If we flip X and Y, we rotated 180.
                // Wait, S2 is Flip X. S1 was Flip Y.
                // S2 = S1 * Rot(180)?
                // Scale(1, -1) * Rot(180) = Scale(1, -1) * [[-1, 0], [0, -1]] = [[-1, 0], [0, 1]] = Scale(-1, 1).
                // Yes! Flip Y + Rot 180 == Flip X.
                // So Shear should be preserved?
                // Spine applies Scale -> Shear -> Rot.
                // If we switch from Flip Y to Flip X, we added 180 to rotation.
                // Shear X is angle between Y and X-normal.
                // If we rotate 180, Y and X-normal both rotate 180. Angle diff preserves.
                // So ShearX is likely preserved.
                
                Logger.trace(`[Decompose] ${debugName}: Switched to Flip X for continuity. Rot=${rotation.toFixed(1)}`);
            }
        }

        // Final normalization just in case
        while (shearX <= -180) shearX += 360;
        while (shearX > 180) shearX -= 360;

        // Debug logging: Only log on significant frames or errors to reduce noise
        // We identify "significant" as containing shear or negative scale (flipping)
        if (debugName.indexOf('arm') >= 0 || debugName.indexOf('weapon') >= 0) {
             if (scaleY > 0 || Math.abs(shearX) > 1) { // ScaleY > 0 is "Flipped" in our -det/sx logic (Y points Up)
                 Logger.trace(`[Decompose] ${debugName}: Det=${det.toFixed(3)} Rot=${rotation.toFixed(1)} Sx=${scaleX.toFixed(2)} Sy=${scaleY.toFixed(2)} Shear=${shearX.toFixed(1)}`);
             }
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
