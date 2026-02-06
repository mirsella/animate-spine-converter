import { Logger } from '../logger/Logger';

export class ShapeUtil {
    public static extractVertices(instance:FlashElement, tolerance:number = 2.0, matrix:FlashMatrix = null, controlOffset:{x:number, y:number} = null):number[] {
        if (instance.elementType !== 'shape') {
            Logger.debug(`[ShapeUtil] Skipping non-shape element: ${instance.elementType}`);
            return null;
        }

        const mode = (instance.contours && instance.contours.length > 0) ? 'contours' : 'edges';
        Logger.debug(`[ShapeUtil] extractVertices start. Mode=${mode} Tolerance=${tolerance} Matrix=${!!matrix}`);

        if (mode === 'contours') {
            const result = ShapeUtil.extractVerticesFromContours(instance, tolerance, matrix, controlOffset);
            Logger.debug(`[ShapeUtil] extractVertices complete. Generated ${result.length/2} points from ${instance.contours.length} contours.`);
            return result;
        }

        const result = ShapeUtil.extractVerticesFromEdges(instance, tolerance, matrix);
        Logger.debug(`[ShapeUtil] extractVertices complete. Generated ${result.length/2} points from ${instance.edges.length} edges.`);
        return result;
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
     * Multiplies two matrices: m1 * m2 (apply m1 then m2)
     */
    public static multiplyMatrices(m1: FlashMatrix, m2: FlashMatrix): FlashMatrix {
        return {
            a: m1.a * m2.a + m1.b * m2.c,
            b: m1.a * m2.b + m1.b * m2.d,
            c: m1.c * m2.a + m1.d * m2.c,
            d: m1.c * m2.b + m1.d * m2.d,
            tx: m1.tx * m2.a + m1.ty * m2.c + m2.tx,
            ty: m1.tx * m2.b + m1.ty * m2.d + m2.ty
        };
    }

    private static addVertex(vertices:number[], x:number, y:number, force:boolean = false):void {
        if (vertices.length >= 4 && !force) {
            const lastX = vertices[vertices.length - 2];
            const lastY = vertices[vertices.length - 1]; // Already flipped -y
            const prevX = vertices[vertices.length - 4];
            const prevY = vertices[vertices.length - 3];

            // Current point to add (flipping Y here to match stored format)
            const newY = -y;

            // Check if last point is redundant (collinear with prev and new)
            // Area of triangle method: |x1(y2-y3) + x2(y3-y1) + x3(y1-y2)| / 2
            // If area is ~0, they are collinear.
            const area = Math.abs(prevX * (lastY - newY) + lastX * (newY - prevY) + x * (prevY - lastY));
            
            // Tolerance for collinearity (0.1 seems safe for pixels)
            if (area < 0.1) {
                // Replace last vertex with new one
                Logger.debug(`    [addVertex] Merging collinear: replacing (${lastX.toFixed(2)},${lastY.toFixed(2)}) with (${x.toFixed(2)},${newY.toFixed(2)})`);
                vertices[vertices.length - 2] = x;
                vertices[vertices.length - 1] = newY;
                return;
            }
        }
        Logger.debug(`    [addVertex] Push (${x.toFixed(2)},${(-y).toFixed(2)})${force ? ' [forced]' : ''}`);
        vertices.push(x, -y);
    }

    private static extractVerticesFromContours(instance:FlashElement, tolerance:number, matrix:FlashMatrix, controlOffset:{x:number, y:number} = null):number[] {
        const vertices:number[] = [];
        let totalEdges = 0;
        
        // Use tolerance squared for faster distance checks
        const tolSq = tolerance * tolerance;

        for (let i = 0; i < instance.contours.length; i++) {
            const contour = instance.contours[i];
            // Skip interior contours (holes) for now as Spine clipping doesn't support them natively 
            // without complex triangulation/bridging. 
            // TODO: Implement keyhole/bridge technique if hole support is critical.
            if (contour.interior) {
                Logger.debug(`[ShapeUtil] Skipping interior contour ${i}`);
                continue;
            }

            const startHalfEdge = contour.getHalfEdge();
            if (startHalfEdge == null) {
                Logger.warning(`[ShapeUtil] Contour ${i} has no startHalfEdge`);
                continue;
            }

            Logger.debug(`[ShapeUtil] Processing Contour ${i}. Start Vertex: ${startHalfEdge.getVertex().x},${startHalfEdge.getVertex().y}`);

            // Push the very first vertex of the contour
            const firstVertex = startHalfEdge.getVertex();
            const pStart = ShapeUtil.transformPoint(firstVertex.x, firstVertex.y, matrix);
            // Always force the start point of a contour
            ShapeUtil.addVertex(vertices, pStart.x, pStart.y, true);

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
                    const lastY = -vertices[vertices.length - 1]; // Unflip for distance check
                    const distSq = Math.pow(lastX - p0.x, 2) + Math.pow(lastY - p0.y, 2);
                    if (distSq > 0.01) {
                        Logger.warning("Contour GAP at Edge " + totalEdges + ": [" + lastX.toFixed(2) + "," + lastY.toFixed(2) + "] -> [" + p0.x.toFixed(2) + "," + p0.y.toFixed(2) + "]");
                    }
                }

                // Get control points
                const rawControl0 = edge.getControl(0);
                const rawControl1 = edge.getControl(1);
                
                const p1 = ShapeUtil.transformPoint(rawControl0.x, rawControl0.y, matrix);
                const p2 = rawControl1 ? ShapeUtil.transformPoint(rawControl1.x, rawControl1.y, matrix) : null;

                if (controlOffset) {
                    if (p0) { p0.x += controlOffset.x; p0.y += controlOffset.y; }
                    if (p1) { p1.x += controlOffset.x; p1.y += controlOffset.y; }
                    if (p2) { p2.x += controlOffset.x; p2.y += controlOffset.y; }
                    if (p3) { p3.x += controlOffset.x; p3.y += controlOffset.y; }
                }

                const isLastInLoop = (halfEdge.getNext() === startHalfEdge);

                // Log raw JSFL data BEFORE transformation for debugging
                Logger.debug(`[ShapeUtil] Edge ${totalEdges}: raw start=(${rawStart.x.toFixed(2)},${rawStart.y.toFixed(2)}) end=(${rawEnd.x.toFixed(2)},${rawEnd.y.toFixed(2)})`);
                Logger.debug(`  raw ctrl0=(${rawControl0.x.toFixed(2)},${rawControl0.y.toFixed(2)}) ctrl1=${rawControl1 ? '(' + rawControl1.x.toFixed(2) + ',' + rawControl1.y.toFixed(2) + ')' : 'null'}`);
                Logger.debug(`  transformed p0=(${p0.x.toFixed(2)},${p0.y.toFixed(2)}) p3=(${p3.x.toFixed(2)},${p3.y.toFixed(2)})`);
                Logger.debug(`  transformed p1=(${p1.x.toFixed(2)},${p1.y.toFixed(2)}) p2=${p2 ? '(' + p2.x.toFixed(2) + ',' + p2.y.toFixed(2) + ')' : 'null'}`);
                Logger.debug(`  isLine=${edge.isLine} isLastInLoop=${isLastInLoop}`);

                const vertsBefore = vertices.length;

                if (edge.isLine) {
                    // Straight line - just add the endpoint
                    if (!isLastInLoop) {
                        ShapeUtil.addVertex(vertices, p3.x, p3.y);
                    }
                } else if (p1 && p2) {
                    // Cubic bezier
                    // Check for backward handles (loops/cusps) and clamp them
                    const dx = p3.x - p0.x;
                    const dy = p3.y - p0.y;
                    
                    // Handle 1 (p1 relative to p0)
                    const h1x = p1.x - p0.x;
                    const h1y = p1.y - p0.y;
                    const dot1 = h1x * dx + h1y * dy;
                    if (dot1 < 0) {
                        Logger.debug(`  [ShapeUtil] Clamping backward handle 1: dot=${dot1.toFixed(2)}`);
                        p1.x = p0.x;
                        p1.y = p0.y;
                    }

                    // Handle 2 (p2 relative to p3)
                    const h2x = p2.x - p3.x;
                    const h2y = p2.y - p3.y;
                    // Vector from p3 to p0 is (-dx, -dy)
                    const dot2 = h2x * (-dx) + h2y * (-dy);
                    if (dot2 < 0) {
                        Logger.debug(`  [ShapeUtil] Clamping backward handle 2: dot=${dot2.toFixed(2)}`);
                        p2.x = p3.x;
                        p2.y = p3.y;
                    }

                    ShapeUtil.adaptiveCubic(vertices, p0, p1, p2, p3, tolSq, 0, isLastInLoop);
                } else {
                    // Quadratic bezier
                    ShapeUtil.adaptiveQuadratic(vertices, p0, p1, p3, tolSq, 0, isLastInLoop);
                }

                const vertsAfter = vertices.length;
                const pointsAdded = (vertsAfter - vertsBefore) / 2;
                Logger.debug(`  => Added ${pointsAdded} points. Total vertices now: ${vertsAfter / 2}`);

                halfEdge = nextHalfEdge;
                totalEdges++;
            } while (halfEdge !== startHalfEdge && halfEdge != null);
        }

        // Dump final vertex list for debugging
        Logger.debug(`[ShapeUtil] === FINAL VERTEX DUMP (${vertices.length / 2} points) ===`);
        for (let vi = 0; vi < vertices.length; vi += 2) {
            Logger.debug(`  [${vi/2}] (${vertices[vi].toFixed(2)}, ${vertices[vi+1].toFixed(2)})`);
        }
        Logger.debug(`[ShapeUtil] === END VERTEX DUMP ===`);
        
        return vertices;
    }

    private static extractVerticesFromEdges(instance:FlashElement, tolerance:number, matrix:FlashMatrix):number[] {
        const vertices:number[] = [];
        const tolSq = tolerance * tolerance;

        for (let i = 0; i < instance.edges.length; i++) {
            const edge = instance.edges[i];
            const halfEdge = edge.getHalfEdge(0);
            if (!halfEdge) continue;

            const rawStart = halfEdge.getVertex();
            const nextHalfEdge = halfEdge.getOppositeHalfEdge();
            if (!nextHalfEdge) {
                // Isolated point or incomplete edge? Just push start.
                const p = ShapeUtil.transformPoint(rawStart.x, rawStart.y, matrix);
                ShapeUtil.addVertex(vertices, p.x, p.y, true);
                continue;
            }
            
            const rawEnd = nextHalfEdge.getVertex();
            const p0 = ShapeUtil.transformPoint(rawStart.x, rawStart.y, matrix);
            const p3 = ShapeUtil.transformPoint(rawEnd.x, rawEnd.y, matrix);
            
            // In edge mode, we usually push start and then the curve points.
            ShapeUtil.addVertex(vertices, p0.x, p0.y, true);

            if (edge.isLine) {
                ShapeUtil.addVertex(vertices, p3.x, p3.y);
            } else {
                const rawControl0 = edge.getControl(0);
                const p1 = ShapeUtil.transformPoint(rawControl0.x, rawControl0.y, matrix);
                ShapeUtil.adaptiveQuadratic(vertices, p0, p1, p3, tolSq, 0, false);
            }
        }
        return vertices;
    }

    private static pointLineDistSq(p: {x:number, y:number}, v: {x:number, y:number}, w: {x:number, y:number}): number {
        // Distance from point p to line segment vw.
        // If segment is a point
        const l2 = (w.x - v.x)**2 + (w.y - v.y)**2;
        if (l2 === 0) return (p.x - v.x)**2 + (p.y - v.y)**2;
        
        // Project p onto line
        let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
        
        // Clamp to segment
        t = Math.max(0, Math.min(1, t));
        
        const projX = v.x + t * (w.x - v.x);
        const projY = v.y + t * (w.y - v.y);
        
        return (p.x - projX)**2 + (p.y - projY)**2;
    }

    private static adaptiveQuadratic(
        vertices:number[],
        p0:{x:number, y:number},
        p1:{x:number, y:number},
        p2:{x:number, y:number},
        tolSq:number,
        level:number,
        isLastEdge:boolean
    ):void {
        if (level > 20) {
            Logger.debug(`[ShapeUtil] Max recursion level (20) reached at ${p2.x},${p2.y}`);
            if (!isLastEdge) ShapeUtil.addVertex(vertices, p2.x, p2.y);
            return;
        }

        const d1 = ShapeUtil.pointLineDistSq(p1, p0, p2);
        if (d1 < tolSq) {
             if (!isLastEdge) ShapeUtil.addVertex(vertices, p2.x, p2.y);
             return;
        }

        // Split at t=0.5
        const q0 = p0;
        const q1 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
        const r1 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const q2 = { x: (q1.x + r1.x) / 2, y: (q1.y + r1.y) / 2 };
        const r2 = p2;
        const r0 = q2;

        ShapeUtil.adaptiveQuadratic(vertices, q0, q1, q2, tolSq, level + 1, false);
        ShapeUtil.adaptiveQuadratic(vertices, r0, r1, r2, tolSq, level + 1, isLastEdge);
    }

    private static adaptiveCubic(
        vertices:number[],
        p0:{x:number, y:number},
        p1:{x:number, y:number},
        p2:{x:number, y:number},
        p3:{x:number, y:number},
        tolSq:number,
        level:number,
        isLastEdge:boolean
    ):void {
        if (level > 20) {
            Logger.debug(`[ShapeUtil] Max recursion level (20) reached (Cubic) at ${p3.x},${p3.y}`);
            if (!isLastEdge) ShapeUtil.addVertex(vertices, p3.x, p3.y);
            return;
        }

        // Check flatness
        const d1 = ShapeUtil.pointLineDistSq(p1, p0, p3);
        const d2 = ShapeUtil.pointLineDistSq(p2, p0, p3);

        if (d1 < tolSq && d2 < tolSq) {
            if (!isLastEdge) ShapeUtil.addVertex(vertices, p3.x, p3.y);
            return;
        }

        // Split at t=0.5
        const q0 = p0;
        const q1 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
        const tmp = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const r2 = { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 };
        
        const q2 = { x: (q1.x + tmp.x) / 2, y: (q1.y + tmp.y) / 2 };
        const r1 = { x: (tmp.x + r2.x) / 2, y: (tmp.y + r2.y) / 2 };
        
        const q3 = { x: (q2.x + r1.x) / 2, y: (q2.y + r1.y) / 2 };
        const r0 = q3;
        const r3 = p3;

        ShapeUtil.adaptiveCubic(vertices, q0, q1, q2, q3, tolSq, level + 1, false);
        ShapeUtil.adaptiveCubic(vertices, r0, r1, r2, r3, tolSq, level + 1, isLastEdge);
    }
}
