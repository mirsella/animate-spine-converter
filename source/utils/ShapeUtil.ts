import { Logger } from '../logger/Logger';

const DEFAULT_CURVE_SEGMENTS = 20;

export class ShapeUtil {
    public static extractVertices(instance:FlashElement, segmentsPerCurve:number = DEFAULT_CURVE_SEGMENTS, matrix:FlashMatrix = null):number[] {
        if (instance.elementType !== 'shape') {
            return null;
        }

        if (instance.contours && instance.contours.length > 0) {
            Logger.trace("Extracting vertices from " + instance.contours.length + " contours (segmentsPerCurve=" + segmentsPerCurve + ")");
            return ShapeUtil.extractVerticesFromContours(instance, segmentsPerCurve, matrix);
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

    private static extractVerticesFromContours(instance:FlashElement, segmentsPerCurve:number, matrix:FlashMatrix):number[] {
        const vertices:number[] = [];
        let totalEdges = 0;

        for (let i = 0; i < instance.contours.length; i++) {
            const contour = instance.contours[i];
            if (contour.interior) {
                continue;
            }

            const startHalfEdge = contour.getHalfEdge();
            if (startHalfEdge == null) {
                continue;
            }

            let halfEdge = startHalfEdge;
            let safetyCounter = 0;
            const MAX_EDGES = 5000;
            
            const visitedEdges: Record<string, boolean> = {};

            do {
                if (safetyCounter++ > MAX_EDGES) {
                    Logger.warning("Contour " + i + " exceeded MAX_EDGES (" + MAX_EDGES + "). Breaking loop.");
                    break;
                }

                const edge = halfEdge.getEdge();
                const rawStart = halfEdge.getVertex();
                const nextHalfEdge = halfEdge.getNext();
                if (!nextHalfEdge) break;
                
                const rawEnd = nextHalfEdge.getVertex();

                // Geometry key to detect loops
                const edgeKey = rawStart.x + "_" + rawStart.y + "_" + rawEnd.x + "_" + rawEnd.y;
                if (visitedEdges[edgeKey]) {
                     break;
                }
                visitedEdges[edgeKey] = true;

                const p0 = ShapeUtil.transformPoint(rawStart.x, rawStart.y, matrix);
                const p3 = ShapeUtil.transformPoint(rawEnd.x, rawEnd.y, matrix);

                if (edge.isLine) {
                    vertices.push(p0.x, -p0.y);
                } else {
                    const rawControl0 = edge.getControl(0);
                    let rawControl1 = null;
                    try {
                        rawControl1 = edge.getControl(1);
                    } catch(e) {}

                    // Determine traversal direction by comparing with edge's canonical half-edge
                    // Edge control points are defined relative to getHalfEdge(0)
                    const canonicalHalfEdge = edge.getHalfEdge(0);
                    const canonicalVertex = canonicalHalfEdge ? canonicalHalfEdge.getVertex() : null;
                    const isReverse = canonicalVertex && 
                        (canonicalVertex.x !== rawStart.x || canonicalVertex.y !== rawStart.y);

                    const p1 = ShapeUtil.transformPoint(rawControl0.x, rawControl0.y, matrix);

                    if (rawControl1) {
                        const p2 = ShapeUtil.transformPoint(rawControl1.x, rawControl1.y, matrix);
                        if (isReverse) {
                            ShapeUtil.tessellateCubicBezier(vertices, p0, p2, p1, p3, segmentsPerCurve);
                        } else {
                            ShapeUtil.tessellateCubicBezier(vertices, p0, p1, p2, p3, segmentsPerCurve);
                        }
                    } else {
                        // Quadratic: control point order matters too when reversed
                        ShapeUtil.tessellateQuadraticBezier(vertices, p0, p1, p3, segmentsPerCurve);
                    }
                }

                halfEdge = nextHalfEdge;
                totalEdges++;
            } while (halfEdge !== startHalfEdge && halfEdge != null);
        }
        
        Logger.trace("Total extracted vertices: " + (vertices.length / 2) + " (from " + totalEdges + " edges)");
        return vertices;
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
                ShapeUtil.tessellateQuadraticBezier(vertices, p0, p1, p3, segmentsPerCurve);
            }
        }
        return vertices;
    }

    private static tessellateQuadraticBezier(
        vertices:number[],
        p0:{x:number, y:number},
        p1:{x:number, y:number},
        p2:{x:number, y:number},
        segments:number
    ):void {
        for (let i = 0; i < segments; i++) {
            const t = i / segments;
            const mt = 1 - t;
            const x = mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x;
            const y = mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y;
            vertices.push(x, -y);
        }
    }

    private static tessellateCubicBezier(
        vertices:number[],
        p0:{x:number, y:number},
        p1:{x:number, y:number},
        p2:{x:number, y:number},
        p3:{x:number, y:number},
        segments:number
    ):void {
        for (let i = 0; i < segments; i++) {
            const t = i / segments;
            const mt = 1 - t;
            const mt2 = mt * mt;
            const mt3 = mt2 * mt;
            const t2 = t * t;
            const t3 = t2 * t;

            const x = mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x;
            const y = mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y;
            vertices.push(x, -y);
        }
    }
}
