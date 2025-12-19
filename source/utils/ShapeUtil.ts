import { Logger } from '../logger/Logger';

const DEFAULT_CURVE_SEGMENTS = 5;

export class ShapeUtil {
    public static extractVertices(instance:FlashElement, segmentsPerCurve:number = DEFAULT_CURVE_SEGMENTS):number[] {
        if (instance.elementType !== 'shape') {
            return null;
        }

        if (instance.contours && instance.contours.length > 0) {
            Logger.trace(`Extracting vertices from ${instance.contours.length} contours (segmentsPerCurve=${segmentsPerCurve})`);
            return this.extractVerticesFromContours(instance, segmentsPerCurve);
        }

        Logger.trace(`Extracting vertices from ${instance.edges.length} edges (fallback mode)`);
        return this.extractVerticesFromEdges(instance, segmentsPerCurve);
    }

    private static extractVerticesFromContours(instance:FlashElement, segmentsPerCurve:number):number[] {
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
            const MAX_EDGES = 5000; // Reduced max edges
            let contourEdges = 0;
            
            // To detect loops when object equality fails (common in JSFL), we track visited edge geometry
            // Key format: "x1_y1_x2_y2"
            // Use plain object instead of Set because JSFL environment is old
            const visitedEdges: Record<string, boolean> = {};

            do {
                if (safetyCounter++ > MAX_EDGES) {
                    Logger.warning(`Contour ${i} exceeded MAX_EDGES (${MAX_EDGES}). Breaking loop to prevent freeze.`);
                    break;
                }

                // Log progress less frequently to reduce overhead
                if (safetyCounter % 2000 === 0) {
                    Logger.trace(`  > Contour ${i}: processed ${safetyCounter} edges...`);
                }
                
                const edge = halfEdge.getEdge();
                const startVertex = halfEdge.getVertex();
                // Determine end vertex (start of next half edge)
                const nextHalfEdge = halfEdge.getNext();
                if (!nextHalfEdge) break;
                
                const endVertex = nextHalfEdge.getVertex();

                // Unique ID for this half-edge geometry
                const edgeKey = `${startVertex.x}_${startVertex.y}_${endVertex.x}_${endVertex.y}`;
                
                // If we've seen this exact edge geometry in this contour before, we've completed the loop
                // (This handles cases where JSFL object identity fails)
                if (visitedEdges[edgeKey]) {
                     // Logger.trace(`  > Contour ${i}: Loop detected via geometry check at edge ${safetyCounter}.`);
                     break;
                }
                visitedEdges[edgeKey] = true;

                if (edge.isLine) {
                    vertices.push(startVertex.x, -startVertex.y);
                } else {
                    const control = edge.getControl(0);
                    this.tessellateQuadraticBezier(vertices, startVertex, control, endVertex, segmentsPerCurve);
                }

                halfEdge = nextHalfEdge;
                contourEdges++;
                totalEdges++;
            } while (halfEdge !== startHalfEdge && halfEdge != null);
        }
        
        Logger.trace(`Total extracted vertices: ${vertices.length / 2} (from ${totalEdges} edges)`);
        return vertices;
    }

    private static extractVerticesFromEdges(instance:FlashElement, segmentsPerCurve:number):number[] {
        const vertices:number[] = [];

        for (const edge of instance.edges) {
            const halfEdge = edge.getHalfEdge(0);
            if (halfEdge == null) {
                continue;
            }

            const startVertex = halfEdge.getVertex();

            if (edge.isLine) {
                vertices.push(startVertex.x, -startVertex.y);
            } else {
                const oppositeHalfEdge = halfEdge.getOppositeHalfEdge();
                if (oppositeHalfEdge == null) {
                    vertices.push(startVertex.x, -startVertex.y);
                    continue;
                }

                const endVertex = oppositeHalfEdge.getVertex();
                const control = edge.getControl(0);

                this.tessellateQuadraticBezier(vertices, startVertex, control, endVertex, segmentsPerCurve);
            }
        }

        return vertices;
    }

    private static tessellateQuadraticBezier(
        vertices:number[],
        p0:FlashVertex,
        p1:FlashVertex,
        p2:FlashVertex,
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
}
