import { Logger } from '../logger/Logger';

const DEFAULT_CURVE_SEGMENTS = 20;

export class ShapeUtil {
    public static extractVertices(instance:FlashElement, segmentsPerCurve:number = DEFAULT_CURVE_SEGMENTS, matrix:FlashMatrix = null, controlOffset:{x:number, y:number} = null):number[] {
        if (instance.elementType !== 'shape') {
            return null;
        }

        if (instance.contours && instance.contours.length > 0) {
            Logger.trace("Extracting vertices from " + instance.contours.length + " contours (segmentsPerCurve=" + segmentsPerCurve + ")");
            return ShapeUtil.extractVerticesFromContours(instance, segmentsPerCurve, matrix, controlOffset);
        }

        Logger.trace("Extracting vertices from " + instance.edges.length + " edges (fallback mode)");
        return ShapeUtil.extractVerticesFromEdges(instance, segmentsPerCurve, matrix);
    }

    /**
     * Transforms a point by a 2D affine matrix.
     */
    public static transformPoint(x:number, y:number, matrix:FlashMatrix):{x:number, y:number} {
        if (!matrix) return {x: x, y: y};
        return {
            x: x * matrix.a + y * matrix.c + matrix.tx,
            y: x * matrix.b + y * matrix.d + matrix.ty
        };
    }

    /**
     * Multiplies two matrices: m1 * m2
     */
    public static multiplyMatrices(m1: FlashMatrix, m2: FlashMatrix): FlashMatrix {
        return {
            a: m1.a * m2.a + m1.c * m2.b,
            b: m1.b * m2.a + m1.d * m2.b,
            c: m1.a * m2.c + m1.c * m2.d,
            d: m1.b * m2.c + m1.d * m2.d,
            tx: m1.a * m2.tx + m1.c * m2.ty + m1.tx,
            ty: m1.b * m2.tx + m1.d * m2.ty + m1.ty
        };
    }

    private static extractVerticesFromContours(instance:FlashElement, segmentsPerCurve:number, matrix:FlashMatrix, controlOffset:{x:number, y:number} = null):number[] {
        const vertices:number[] = [];
        let totalEdges = 0;

        if (instance.contours.length > 1) {
            Logger.trace("Shape has " + instance.contours.length + " contours. Multiple contours might cause 'jumps' in the clipping path.");
        }

        if (matrix) {
            Logger.trace("Matrix: a=" + matrix.a.toFixed(4) + " b=" + matrix.b.toFixed(4) + " c=" + matrix.c.toFixed(4) + " d=" + matrix.d.toFixed(4) + " tx=" + matrix.tx.toFixed(2) + " ty=" + matrix.ty.toFixed(2));
        }

        for (let i = 0; i < instance.contours.length; i++) {
            const contour = instance.contours[i];
            if (contour.interior) {
                continue;
            }

            const startHalfEdge = contour.getHalfEdge();
            if (startHalfEdge == null) {
                continue;
            }

            // Push the very first vertex of the contour
            const firstVertex = startHalfEdge.getVertex();
            const pStart = ShapeUtil.transformPoint(firstVertex.x, firstVertex.y, matrix);
            vertices.push(pStart.x, -pStart.y);

            let halfEdge = startHalfEdge;
            let safetyCounter = 0;
            const MAX_EDGES = 5000;
            const visitedEdges: Record<string, boolean> = {};

            do {
                if (safetyCounter++ > MAX_EDGES) {
                    Logger.warning("Contour " + i + " exceeded MAX_EDGES. Breaking loop.");
                    break;
                }

                const edge = halfEdge.getEdge();
                const rawStart = halfEdge.getVertex();
                const nextHalfEdge = halfEdge.getNext();
                if (!nextHalfEdge) break;
                
                const rawEnd = nextHalfEdge.getVertex();

                // Loop detection
                const edgeKey = rawStart.x.toFixed(2) + "_" + rawStart.y.toFixed(2) + "_" + rawEnd.x.toFixed(2) + "_" + rawEnd.y.toFixed(2);
                if (visitedEdges[edgeKey]) break;
                visitedEdges[edgeKey] = true;

                const p0 = ShapeUtil.transformPoint(rawStart.x, rawStart.y, matrix);
                const p3 = ShapeUtil.transformPoint(rawEnd.x, rawEnd.y, matrix);

                // Check for sequence continuity
                if (vertices.length >= 2) {
                    const lastX = vertices[vertices.length - 2];
                    const lastY = -vertices[vertices.length - 1];
                    const distSq = Math.pow(lastX - p0.x, 2) + Math.pow(lastY - p0.y, 2);
                    if (distSq > 0.01) {
                        Logger.warning("Contour GAP at Edge " + totalEdges + ": [" + lastX.toFixed(2) + "," + lastY.toFixed(2) + "] -> [" + p0.x.toFixed(2) + "," + p0.y.toFixed(2) + "]");
                    }
                }

                const canonicalHalfEdge = edge.getHalfEdge(0);
                const canonicalVertex = canonicalHalfEdge ? canonicalHalfEdge.getVertex() : null;
                const isReverse = canonicalVertex && 
                    (Math.abs(canonicalVertex.x - rawStart.x) > 0.01 || Math.abs(canonicalVertex.y - rawStart.y) > 0.01);

                Logger.trace("Edge " + totalEdges + " " + (edge.isLine ? "LINE" : "CURVE") + " isReverse=" + isReverse + " [" + p0.x.toFixed(2) + "," + p0.y.toFixed(2) + "] -> [" + p3.x.toFixed(2) + "," + p3.y.toFixed(2) + "]");

                if (edge.isLine) {
                    if (halfEdge.getNext() !== startHalfEdge) {
                        vertices.push(p3.x, -p3.y);
                    }
                } else {
                    const rawControl0 = edge.getControl(0);
                    if (controlOffset) {
                        rawControl0.x += controlOffset.x;
                        rawControl0.y += controlOffset.y;
                    }

                    let rawControl1 = null;
                    try { 
                        rawControl1 = edge.getControl(1); 
                        if (rawControl1 && controlOffset) {
                            rawControl1.x += controlOffset.x;
                            rawControl1.y += controlOffset.y;
                        }
                    } catch(e) {}

                    const p1 = ShapeUtil.transformPoint(rawControl0.x, rawControl0.y, matrix);

                    if (totalEdges < 20) {
                        Logger.trace("  C0: [" + rawControl0.x.toFixed(2) + "," + rawControl0.y.toFixed(2) + "]");
                        if (rawControl1) Logger.trace("  C1: [" + rawControl1.x.toFixed(2) + "," + rawControl1.y.toFixed(2) + "]");
                    }

                    if (rawControl1) {
                        if (totalEdges < 20) Logger.trace("  => CUBIC");
                        const p2 = ShapeUtil.transformPoint(rawControl1.x, rawControl1.y, matrix);
                        
                        if (isReverse) {
                            // Reverse traversal: p0 -> p3. Controls are p2 (near p0) and p1 (near p3).
                            const validP2 = ShapeUtil.clampControlPoint(p0, p3, p2);
                            const validP1 = ShapeUtil.clampControlPoint(p3, p0, p1);
                            ShapeUtil.tessellateCubicBezierPart(vertices, p0, validP2, validP1, p3, segmentsPerCurve, halfEdge.getNext() === startHalfEdge);
                        } else {
                            // Forward traversal: p0 -> p3. Controls are p1 (near p0) and p2 (near p3).
                            const validP1 = ShapeUtil.clampControlPoint(p0, p3, p1);
                            const validP2 = ShapeUtil.clampControlPoint(p3, p0, p2);
                            ShapeUtil.tessellateCubicBezierPart(vertices, p0, validP1, validP2, p3, segmentsPerCurve, halfEdge.getNext() === startHalfEdge);
                        }
                    } else {
                        if (totalEdges < 20) Logger.trace("  => QUADRATIC");
                        const validP1 = ShapeUtil.clampControlPoint(p0, p3, p1);
                        ShapeUtil.tessellateQuadraticBezierPart(vertices, p0, validP1, p3, segmentsPerCurve, halfEdge.getNext() === startHalfEdge);
                    }
                }

                halfEdge = nextHalfEdge;
                totalEdges++;
            } while (halfEdge !== startHalfEdge && halfEdge != null);
        }
        
        Logger.trace("Total extracted vertices: " + (vertices.length / 2) + " (from " + totalEdges + " edges)");
        return vertices;
    }

    private static clampControlPoint(pAnchor: {x:number, y:number}, pOpposite: {x:number, y:number}, pControl: {x:number, y:number}): {x:number, y:number} {
        const dx = pOpposite.x - pAnchor.x;
        const dy = pOpposite.y - pAnchor.y;
        const lenSq = dx*dx + dy*dy;
        if (lenSq < 0.0001) return pAnchor;

        const cx = pControl.x - pAnchor.x;
        const cy = pControl.y - pAnchor.y;
        
        // Project onto edge vector: t = (c . d) / (d . d)
        const t = (cx * dx + cy * dy) / lenSq;

        if (t < 0) {
            // Pulls backward
            return { x: pAnchor.x, y: pAnchor.y };
        }
        if (t > 1) {
            // Overshoots
            return { x: pOpposite.x, y: pOpposite.y };
        }
        
        return pControl;
    }

    private static extractVerticesFromEdges(instance:FlashElement, segmentsPerCurve:number, matrix:FlashMatrix):number[] {
        const vertices:number[] = [];
        for (let i = 0; i < instance.edges.length; i++) {
            const edge = instance.edges[i];
            const halfEdge = edge.getHalfEdge(0);
            if (!halfEdge) continue;

            const rawStart = halfEdge.getVertex();
            const nextHalfEdge = halfEdge.getOppositeHalfEdge();
            if (!nextHalfEdge) {
                const p = ShapeUtil.transformPoint(rawStart.x, rawStart.y, matrix);
                vertices.push(p.x, -p.y);
                continue;
            }
            
            const rawEnd = nextHalfEdge.getVertex();
            const p0 = ShapeUtil.transformPoint(rawStart.x, rawStart.y, matrix);
            const p3 = ShapeUtil.transformPoint(rawEnd.x, rawEnd.y, matrix);

            if (edge.isLine) {
                vertices.push(p0.x, -p0.y);
            } else {
                const rawControl0 = edge.getControl(0);
                const p1 = ShapeUtil.transformPoint(rawControl0.x, rawControl0.y, matrix);
                ShapeUtil.tessellateQuadraticBezierPart(vertices, p0, p1, p3, segmentsPerCurve, false);
            }
        }
        return vertices;
    }

    private static tessellateQuadraticBezierPart(
        vertices:number[],
        p0:{x:number, y:number},
        p1:{x:number, y:number},
        p2:{x:number, y:number},
        segments:number,
        isLast:boolean
    ):void {
        // Start point p0 is already pushed. We push from t = 1/seg to 1.0 (if not last)
        const endLimit = isLast ? segments : segments + 1;
        for (let i = 1; i < endLimit; i++) {
            const t = i / segments;
            const mt = 1 - t;
            const x = mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x;
            const y = mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y;
            
            // Avoid duplicate of start if it's the very last point
            if (isLast && i === segments) continue; 

            vertices.push(x, -y);
        }
    }

    private static tessellateCubicBezierPart(
        vertices:number[],
        p0:{x:number, y:number},
        p1:{x:number, y:number},
        p2:{x:number, y:number},
        p3:{x:number, y:number},
        segments:number,
        isLast:boolean
    ):void {
        const endLimit = isLast ? segments : segments + 1;
        for (let i = 1; i < endLimit; i++) {
            const t = i / segments;
            const mt = 1 - t;
            const mt2 = mt * mt;
            const mt3 = mt2 * mt;
            const t2 = t * t;
            const t3 = t2 * t;

            const x = mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x;
            const y = mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y;

            if (isLast && i === segments) continue;

            vertices.push(x, -y);
        }
    }
}
