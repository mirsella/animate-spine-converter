export {};

declare global {
    export interface FlashBitmapItem {
        hPixels:number;
        vPixels:number;
    }

    export interface FlashPoint {
        x:number;
        y:number;
    }

    export interface FlashVertex {
        x:number;
        y:number;
    }

    export interface FlashHalfEdge {
        getVertex():FlashVertex;
        getNext():FlashHalfEdge;
        getPrev():FlashHalfEdge;
        getOppositeHalfEdge():FlashHalfEdge;
        getEdge():FlashEdge;
    }

    export interface FlashEdge {
        isLine:boolean;
        getControl(index:number):FlashVertex;
        getHalfEdge(index:number):FlashHalfEdge;
    }

    export interface FlashContour {
        getHalfEdge():FlashHalfEdge;
        interior:boolean;
    }

    export interface FlashMatrix {
        a:number;
        b:number;
        c:number;
        d:number;
        tx:number;
        ty:number;
    }

    export interface FlashElement {
        transformationPoint:FlashPoint;
        matrix:FlashMatrix;
        edges:FlashEdge[];
        contours:FlashContour[];
    }
}
