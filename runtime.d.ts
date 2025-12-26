interface FlashDocument {
    pathURI: string;
    name: string;
    frameRate: number;
    selection: FlashElement[];
    library: FlashLibrary;
    getTimeline(): FlashTimeline;
    getTransformationPoint(): { x: number, y: number };
    setTransformationPoint(pt: { x: number, y: number }): void;
    selectAll(): void;
    selectNone(): void;
    resetTransform(): void;
    getSelectionRect(): { left: number, top: number, right: number, bottom: number };
    group(): void;
    unGroup(): void;
    clipCopy(): void;
    clipPaste(): void;
    exportPNG(path: string, b1?: boolean, b2?: boolean): void;
    close(b: boolean): void;
    width: number;
    height: number;
}

interface FlashFL {
    getDocumentDOM(): FlashDocument;
    createDocument(): FlashDocument;
    setActiveWindow(doc: FlashDocument): void;
    selectActiveWindow(doc: FlashDocument): void;
    trace(msg: string): void;
}

interface FlashLibrary {
    editItem(name?: string): void;
    addItemToStage(pt: { x: number, y: number }, name: string): void;
}

interface FlashItem {
    name: string;
    timeline: FlashTimeline;
    exportToFile(path: string): boolean;
}

interface FlashBitmapItem extends FlashItem {
    hPixels: number;
    vPixels: number;
}

interface FlashSoundItem extends FlashItem {}

interface FlashTimeline {
    name: string;
    layers: FlashLayer[];
    currentFrame: number;
}

interface FlashLayer {
    name: string;
    layerType: string;
    frames: FlashFrame[];
}

interface FlashFrame {
    startFrame: number;
    duration: number;
    tweenType: string;
    labelType: string;
    name: string;
    elements: FlashElement[];
}

interface FlashElement {
    name: string;
    elementType: string;
    instanceType?: string;
    libraryItem?: FlashItem;
    matrix: FlashMatrix;
    x: number;
    y: number;
    transformX: number;
    transformY: number;
    transformationPoint: { x: number, y: number };
    rotation: number;
    scaleX: number;
    scaleY: number;
    skewX: number;
    skewY: number;
    getTransformationPoint(): { x: number, y: number };
    setTransformationPoint(pt: { x: number, y: number }): void;
}

interface FlashMatrix {
    a: number;
    b: number;
    c: number;
    d: number;
    tx: number;
    ty: number;
}

declare const fl: FlashFL;
declare const FLfile: {
    exists(path: string): boolean;
    createFolder(path: string): void;
    write(path: string, data: string): boolean;
};
