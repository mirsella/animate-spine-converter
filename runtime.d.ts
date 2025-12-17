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

    export interface FlashElement {
        transformationPoint:FlashPoint;
    }
}
