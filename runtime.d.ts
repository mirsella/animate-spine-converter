export {};

declare global {
    interface FlashPoint {
        x: number;
        y: number;
    }

    interface FlashRect {
        top: number;
        left: number;
        bottom: number;
        right: number;
    }

    interface FlashMatrix {
        a: number;
        b: number;
        c: number;
        d: number;
        tx: number;
        ty: number;
    }

    interface FlashLayer {
        name: string;
        layerType: string;
        visible: boolean;
        locked: boolean;
        frames: FlashFrame[];
    }

    interface FlashFrame {
        elements: FlashElement[];
        startFrame: number;
        duration: number;
        tweenType: string;
        tweenEasing: any;
        labelType: string;
        name: string;
        getCustomEase(): FlashPoint[];
    }

    interface FlashItem {
        name: string;
        itemType: string;
        timeline: FlashTimeline;
        exportToFile(path: string): boolean;
        hPixels: number;
        vPixels: number;
    }

    interface FlashLibrary {
        items: FlashItem[];
        findItemIndex(name: string): number | undefined;
        editItem(name: string): boolean;
        findItem(name: string): FlashItem;
    }

    interface FlashTimeline {
        layers: FlashLayer[];
        currentFrame: number;
    }

    interface FlashDocument {
        name: string;
        pathURI: string;
        selection: FlashElement[];
        width: number;
        height: number;
        frameRate: number;
        library: FlashLibrary;
        getTimeline(): FlashTimeline;
        selectAll(): void;
        selectNone(): void;
        group(): void;
        unGroup(): void;
        clipCopy(): void;
        clipPaste(): void;
        exportPNG(path: string, selectionOnly: boolean, transparency: boolean): boolean;
        close(save: boolean): void;
        getSelectionRect(): FlashRect;
        addItem(pos: FlashPoint, item: FlashItem): boolean;
        moveSelectionBy(delta: FlashPoint): void;
    }

    interface FlashElement {
        name: string;
        elementType: string;
        instanceType?: string;
        libraryItem?: FlashItem;
        x: number;
        y: number;
        width: number;
        height: number;
        rotation: number;
        scaleX: number;
        scaleY: number;
        skewX: number;
        skewY: number;
        transformX: number;
        transformY: number;
        transformationPoint: FlashPoint;
        matrix: FlashMatrix;
        layer: FlashLayer;
        edges: any[];
        contours: any[];
    }

    interface FlashFL {
        createDocument(type: string): FlashDocument;
        getDocumentDOM(): FlashDocument;
    }

    interface FlashFLfile {
        exists(path: string): boolean;
        createFolder(path: string): boolean;
        read(path: string): string;
        write(path: string, content: string): boolean;
    }

    // These names match @types/jsfl to avoid conflicts
    var fl: FlashFL;
    var FLfile: FlashFLfile;
}
