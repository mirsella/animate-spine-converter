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
        const scaleX = Math.sqrt(a * a + b * b);
        let scaleY = Math.sqrt(c * c + d * d);

        // 2. Determinant Check (Flipping)
        // If det < 0, the coordinate system is inverted (handedness change).
        const det = a * d - b * c;
        if (det < 0) {
            scaleY = -scaleY;
        }

        // 3. Rotation Extraction
        // Rotation is the angle of the primary basis vector (X) relative to global axes.
        const rotXRad = Math.atan2(b, a);
        const rotYRad = Math.atan2(d, c);

        // Convert to Degrees
        // Animate is CW, Spine is CCW. We negate the rotation.
        const rotation = -rotXRad * (180 / Math.PI);

        // 4. Shear Extraction
        // Shear is defined by the angle between X and Y basis vectors.
        // Ideally they are 90 degrees (PI/2) apart.
        // shear = rotY - rotX - PI/2
        // We convert to degrees and negate for Spine's CCW system if necessary,
        // but typically Spine shear is added to rotation. 
        // Logic from paper: shear_spine = (phi_rad - theta_rad - PI/2) * 180/PI
        // Note: Paper says "shearY: -shear" to match CCW logic.
        
        let shearRaw = rotYRad - rotXRad - (Math.PI / 2);
        
        // Normalize shear to -PI...PI range mostly to avoid large wrapping, though not strictly required for math
        while (shearRaw <= -Math.PI) shearRaw += 2 * Math.PI;
        while (shearRaw > Math.PI) shearRaw -= 2 * Math.PI;

        const shearDeg = shearRaw * (180 / Math.PI);
        
        // Spine 4.x shear convention: positive shear leans the Y axis to the right (relative to X).
        // In Animate (Y down), positive rotation is CW.
        // If we have Y-down to Y-up conversion involved, signs get tricky.
        // Per paper: shearY = -shear
        const shearY = -shearDeg;

        return {
            rotation: rotation,
            scaleX: scaleX,
            scaleY: scaleY,
            shearX: 0,
            shearY: shearY
        };
    }
}
