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
        const newY = -y;
        
        // Check for duplicate/extremely close points (min distance check)
        if (vertices.length >= 2) {
             const lastX = vertices[vertices.length - 2];
             const lastY = vertices[vertices.length - 1];
             const distSq = (lastX - x) * (lastX - x) + (lastY - newY) * (lastY - newY);
             // 0.05px tolerance (0.0025 sq) to prevent stacking
             if (distSq < 0.0025 && !force) {
                 Logger.debug(`    [addVertex] Skipping close vertex: (${x.toFixed(2)},${newY.toFixed(2)}) dist=${Math.sqrt(distSq).toFixed(4)}`);
                 return;
             }
        }

        if (vertices.length >= 4 && !force) {
            const lastX = vertices[vertices.length - 2];
            const lastY = vertices[vertices.length - 1]; // Already flipped -y
            const prevX = vertices[vertices.length - 4];
            const prevY = vertices[vertices.length - 3];

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
        Logger.debug(`    [addVertex] Push (${x.toFixed(2)},${newY.toFixed(2)})${force ? ' [forced]' : ''}`);
        vertices.push(x, newY);
    }

    private static extractVerticesFromContours(instance:FlashElement, tolerance:number, matrix:FlashMatrix, controlOffset:{x:number, y:number} = null):number[] {
        const vertices:number[] = [];
        let totalEdges = 0;
        
        // Use tolerance squared for faster distance checks
        const tolSq = tolerance * tolerance;

        // ===== STEP 1: Probe the cubic segment API =====
        // Animate's getCubicSegmentPoints() returns true cubic Bezier data.
        // We need to discover what's available before processing edges.
        const shape = instance as any;
        let cubicSegments: Record<number, any[]> = {};
        let hasCubicData = false;
        
        // Probe: try to read cubicSegmentIndex from first edge
        try {
            if (shape.contours && shape.contours.length > 0) {
                const probeHE = shape.contours[0].getHalfEdge();
                if (probeHE) {
                    const probeEdge = probeHE.getEdge();
                    const probeIdx = probeEdge.cubicSegmentIndex;
                    Logger.debug(`[ShapeUtil] Probing cubic API: edge.cubicSegmentIndex = ${probeIdx} (type: ${typeof probeIdx})`);
                    
                    if (probeIdx !== undefined && probeIdx !== null && probeIdx >= 0) {
                        // Try to get the cubic segment points
                        try {
                            const cubicPts = shape.getCubicSegmentPoints(probeIdx);
                            Logger.debug(`[ShapeUtil] getCubicSegmentPoints(${probeIdx}) returned: ${cubicPts} (type: ${typeof cubicPts}, isArray: ${cubicPts instanceof Array})`);
                            if (cubicPts) {
                                Logger.debug(`[ShapeUtil] cubicPts length: ${cubicPts.length}`);
                                for (let ci = 0; ci < cubicPts.length; ci++) {
                                    const cp = cubicPts[ci];
                                    Logger.debug(`[ShapeUtil]   cubicPt[${ci}]: x=${cp.x}, y=${cp.y}`);
                                }
                                hasCubicData = true;
                            }
                        } catch (cubicErr: any) {
                            Logger.debug(`[ShapeUtil] getCubicSegmentPoints failed: ${cubicErr.message || cubicErr}`);
                        }
                    } else {
                        Logger.debug(`[ShapeUtil] cubicSegmentIndex not available (${probeIdx}). Falling back to quadratic.`);
                    }
                }
            }
        } catch (probeErr: any) {
            Logger.debug(`[ShapeUtil] Cubic API probe failed: ${probeErr.message || probeErr}. Using quadratic fallback.`);
        }

        // ===== STEP 2: If cubic data is available, collect ALL cubic segments =====
        if (hasCubicData) {
            Logger.debug(`[ShapeUtil] === COLLECTING CUBIC SEGMENTS ===`);
            const seenSegments: Record<number, boolean> = {};
            
            for (let i = 0; i < instance.contours.length; i++) {
                const contour = instance.contours[i];
                if (contour.interior) continue;
                
                const startHE = contour.getHalfEdge();
                if (!startHE) continue;
                
                let he = startHE;
                let safety = 0;
                do {
                    if (safety++ > 5000) break;
                    const edge = he.getEdge();
                    const csIdx = edge.cubicSegmentIndex;
                    
                    if (csIdx !== undefined && csIdx !== null && csIdx >= 0 && !seenSegments[csIdx]) {
                        seenSegments[csIdx] = true;
                        try {
                            const pts = shape.getCubicSegmentPoints(csIdx);
                            if (pts && pts.length >= 4) {
                                cubicSegments[csIdx] = pts;
                                Logger.debug(`[ShapeUtil] CubicSegment[${csIdx}]: ${pts.length} points`);
                                for (let pi = 0; pi < pts.length; pi++) {
                                    Logger.debug(`  pt[${pi}] = (${pts[pi].x.toFixed(2)}, ${pts[pi].y.toFixed(2)})`);
                                }
                            }
                        } catch (e: any) {
                            Logger.debug(`[ShapeUtil] Failed to get cubic segment ${csIdx}: ${e.message || e}`);
                        }
                    }
                    
                    he = he.getNext();
                } while (he && he !== startHE);
            }
            let cubicCount = 0;
            for (let _k in cubicSegments) { if (cubicSegments.hasOwnProperty(_k)) { cubicCount++; } }
            Logger.debug(`[ShapeUtil] Collected ${cubicCount} cubic segments`);
        }

        // ===== STEP 3: Process contours =====
        for (let i = 0; i < instance.contours.length; i++) {
            const contour = instance.contours[i];
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

            const firstVertex = startHalfEdge.getVertex();
            const pStart = ShapeUtil.transformPoint(firstVertex.x, firstVertex.y, matrix);
            ShapeUtil.addVertex(vertices, pStart.x, pStart.y, true);

            let halfEdge = startHalfEdge;
            let safetyCounter = 0;
            const MAX_EDGES = 5000;
            const visitedEdges: Record<string, boolean> = {};
            // Track which cubic segments we've already processed to avoid duplication
            const processedCubicSegments: Record<number, boolean> = {};

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

                const edgeKey = rawStart.x.toFixed(2) + "_" + rawStart.y.toFixed(2) + "_" + rawEnd.x.toFixed(2) + "_" + rawEnd.y.toFixed(2);
                if (visitedEdges[edgeKey]) break;
                visitedEdges[edgeKey] = true;

                const p0 = ShapeUtil.transformPoint(rawStart.x, rawStart.y, matrix);
                const p3 = ShapeUtil.transformPoint(rawEnd.x, rawEnd.y, matrix);

                if (controlOffset) {
                    p0.x += controlOffset.x; p0.y += controlOffset.y;
                    p3.x += controlOffset.x; p3.y += controlOffset.y;
                }

                const isLastInLoop = (halfEdge.getNext() === startHalfEdge);

                Logger.debug(`[ShapeUtil] Edge ${totalEdges}: raw start=(${rawStart.x.toFixed(2)},${rawStart.y.toFixed(2)}) end=(${rawEnd.x.toFixed(2)},${rawEnd.y.toFixed(2)}) isLine=${edge.isLine}`);

                const vertsBefore = vertices.length;

                if (edge.isLine) {
                    if (!isLastInLoop) {
                        ShapeUtil.addVertex(vertices, p3.x, p3.y);
                    }
                } else {
                    // ===== Try cubic path first =====
                    const csIdx = edge.cubicSegmentIndex;
                    const cubicPts = (csIdx !== undefined && csIdx !== null && csIdx >= 0) ? cubicSegments[csIdx] : null;
                    
                    if (cubicPts && cubicPts.length >= 4 && !processedCubicSegments[csIdx]) {
                        processedCubicSegments[csIdx] = true;
                        
                        // getCubicSegmentPoints returns an array of points defining cubic Bezier(s).
                        // For a single cubic: [p0, cp1, cp2, p3] (4 points)
                        // For a multi-segment cubic: [p0, cp1, cp2, p3, cp1, cp2, p3, ...] (4 + 3n points)
                        Logger.debug(`  Using CUBIC segment ${csIdx}: ${cubicPts.length} control points`);
                        
                        // Process each cubic sub-segment (groups of 4, then 3)
                        // First segment: indices 0,1,2,3. Subsequent: 3+i*3, 4+i*3, 5+i*3, 6+i*3
                        let cp0 = ShapeUtil.transformPoint(cubicPts[0].x, cubicPts[0].y, matrix);
                        if (controlOffset) { cp0.x += controlOffset.x; cp0.y += controlOffset.y; }
                        
                        let numCubicSubs = 0;
                        for (let ci = 0; ci + 3 <= cubicPts.length - 1; ci += 3) {
                            const rawCp1 = cubicPts[ci + 1];
                            const rawCp2 = cubicPts[ci + 2];
                            const rawCp3 = cubicPts[ci + 3];
                            
                            let cp1 = ShapeUtil.transformPoint(rawCp1.x, rawCp1.y, matrix);
                            let cp2 = ShapeUtil.transformPoint(rawCp2.x, rawCp2.y, matrix);
                            let cp3 = ShapeUtil.transformPoint(rawCp3.x, rawCp3.y, matrix);
                            
                            if (controlOffset) {
                                cp1.x += controlOffset.x; cp1.y += controlOffset.y;
                                cp2.x += controlOffset.x; cp2.y += controlOffset.y;
                                cp3.x += controlOffset.x; cp3.y += controlOffset.y;
                            }
                            
                            // Check if this is the last sub-segment AND the last edge in the contour loop
                            const isLastSub = (ci + 3 >= cubicPts.length - 1);
                            // Only skip the endpoint if this is the last sub AND we're closing the loop
                            const skipEndpoint = isLastSub && isLastInLoop;
                            
                            Logger.debug(`    CubicSub[${ci/3}]: p0=(${cp0.x.toFixed(2)},${cp0.y.toFixed(2)}) cp1=(${cp1.x.toFixed(2)},${cp1.y.toFixed(2)}) cp2=(${cp2.x.toFixed(2)},${cp2.y.toFixed(2)}) p3=(${cp3.x.toFixed(2)},${cp3.y.toFixed(2)})`);
                            
                            ShapeUtil.adaptiveCubic(vertices, cp0, cp1, cp2, cp3, tolSq, 0, skipEndpoint);
                            
                            cp0 = cp3; // Next sub-segment starts where this one ends
                            numCubicSubs++;
                        }
                        Logger.debug(`    Processed ${numCubicSubs} cubic sub-segments`);
                        
                    } else if (cubicPts && processedCubicSegments[csIdx]) {
                        // This edge belongs to a cubic segment we already processed — skip it
                        Logger.debug(`  Skipping edge ${totalEdges} (cubic segment ${csIdx} already processed)`);
                    } else {
                        // ===== Quadratic fallback =====
                        const rawControl0 = edge.getControl(0);
                        const rawControl1 = edge.getControl(1);
                        const p1 = ShapeUtil.transformPoint(rawControl0.x, rawControl0.y, matrix);
                        const p2 = rawControl1 ? ShapeUtil.transformPoint(rawControl1.x, rawControl1.y, matrix) : null;
                        
                        if (controlOffset) {
                            if (p1) { p1.x += controlOffset.x; p1.y += controlOffset.y; }
                            if (p2) { p2.x += controlOffset.x; p2.y += controlOffset.y; }
                        }

                        const ctrl = p2 || p1;
                        Logger.debug(`  Using QUADRATIC fallback: p0=(${p0.x.toFixed(2)},${p0.y.toFixed(2)}) ctrl=(${ctrl.x.toFixed(2)},${ctrl.y.toFixed(2)}) p3=(${p3.x.toFixed(2)},${p3.y.toFixed(2)})`);

                        ShapeUtil.adaptiveQuadratic(vertices, p0, ctrl, p3, tolSq, 0, isLastInLoop);
                    }
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
        let indentStr = "      ";
        for (let li = 0; li < level; li++) { indentStr += "  "; }
        const indent = indentStr;
        // Stop if segment is microscopic (< 0.1px)
        const segDistSq = (p0.x - p2.x)**2 + (p0.y - p2.y)**2;
        if (segDistSq < 0.01) {
             Logger.debug(`${indent}[L${level}] MICRO: segDist=${Math.sqrt(segDistSq).toFixed(4)} => emit endpoint`);
             if (!isLastEdge) ShapeUtil.addVertex(vertices, p2.x, p2.y);
             return;
        }

        if (level > 20) {
            Logger.debug(`${indent}[L${level}] MAX LEVEL => emit endpoint`);
            if (!isLastEdge) ShapeUtil.addVertex(vertices, p2.x, p2.y);
            return;
        }

        const d1 = ShapeUtil.pointLineDistSq(p1, p0, p2);
        const segDist = Math.sqrt(segDistSq);
        Logger.debug(`${indent}[L${level}] p0=(${p0.x.toFixed(2)},${p0.y.toFixed(2)}) ctrl=(${p1.x.toFixed(2)},${p1.y.toFixed(2)}) p2=(${p2.x.toFixed(2)},${p2.y.toFixed(2)}) ctrlDev=${Math.sqrt(d1).toFixed(4)} tol=${Math.sqrt(tolSq).toFixed(4)} segLen=${segDist.toFixed(2)}`);

        if (d1 < tolSq) {
             Logger.debug(`${indent}  => FLAT (dev ${Math.sqrt(d1).toFixed(4)} < tol ${Math.sqrt(tolSq).toFixed(4)}) => emit endpoint (${p2.x.toFixed(2)},${p2.y.toFixed(2)})`);
             if (!isLastEdge) ShapeUtil.addVertex(vertices, p2.x, p2.y);
             return;
        }

        Logger.debug(`${indent}  => SPLIT (dev ${Math.sqrt(d1).toFixed(4)} >= tol ${Math.sqrt(tolSq).toFixed(4)})`);

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
        let indentStr = "      ";
        for (let li = 0; li < level; li++) { indentStr += "  "; }
        const indent = indentStr;

        // Stop if segment is microscopic (< 0.1px)
        const segDistSq = (p0.x - p3.x)**2 + (p0.y - p3.y)**2;
        if (segDistSq < 0.01) {
             Logger.debug(`${indent}[CL${level}] MICRO: segDist=${Math.sqrt(segDistSq).toFixed(4)} => emit endpoint`);
             if (!isLastEdge) ShapeUtil.addVertex(vertices, p3.x, p3.y);
             return;
        }

        if (level > 20) {
            Logger.debug(`${indent}[CL${level}] MAX LEVEL => emit endpoint`);
            if (!isLastEdge) ShapeUtil.addVertex(vertices, p3.x, p3.y);
            return;
        }

        // Check flatness
        const d1 = ShapeUtil.pointLineDistSq(p1, p0, p3);
        const d2 = ShapeUtil.pointLineDistSq(p2, p0, p3);
        const segDist = Math.sqrt(segDistSq);
        Logger.debug(`${indent}[CL${level}] p0=(${p0.x.toFixed(2)},${p0.y.toFixed(2)}) cp1=(${p1.x.toFixed(2)},${p1.y.toFixed(2)}) cp2=(${p2.x.toFixed(2)},${p2.y.toFixed(2)}) p3=(${p3.x.toFixed(2)},${p3.y.toFixed(2)}) d1=${Math.sqrt(d1).toFixed(4)} d2=${Math.sqrt(d2).toFixed(4)} tol=${Math.sqrt(tolSq).toFixed(4)} segLen=${segDist.toFixed(2)}`);

        if (d1 < tolSq && d2 < tolSq) {
            Logger.debug(`${indent}  => FLAT => emit endpoint (${p3.x.toFixed(2)},${p3.y.toFixed(2)})`);
            if (!isLastEdge) ShapeUtil.addVertex(vertices, p3.x, p3.y);
            return;
        }

        Logger.debug(`${indent}  => SPLIT`);

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
