interface FlashMatrix {
    a: number;
    b: number;
    c: number;
    d: number;
    tx: number;
    ty: number;
}

interface FlashPoint {
    x: number;
    y: number;
}

interface FlashRect {
    left: number;
    top: number;
    right: number;
    bottom: number;
}

interface FlashDocument {
    pathURI: string;
    name: string;
    frameRate: number;
    width: number;
    height: number;
    selection: FlashElement[];
    library: FlashLibrary;
    getTimeline(): FlashTimeline;
    getTransformationPoint(): FlashPoint;
    setTransformationPoint(pt: FlashPoint): void;
    selectAll(): void;
    selectNone(): void;
    resetTransformation(): void;
    getSelectionRect(): FlashRect;
    group(): void;
    unGroup(): void;
    clipCopy(): void;
    clipPaste(): void;
    exportPNG(path: string, b1?: boolean, b2?: boolean): void;
    close(b: boolean): void;
    deleteSelection(): void;
}

interface FlashFL {
    getDocumentDOM(): FlashDocument;
    createDocument(): FlashDocument;
    setActiveWindow(doc: FlashDocument): void;
    selectActiveWindow(doc: FlashDocument): void;
    trace(msg: string): void;
}

interface FlashLibrary {
    items: FlashItem[];
    editItem(name?: string): void;
    getSelectedItems(): FlashItem[];
    addItemToDocument(position: FlashPoint, namePath?: string): boolean;
}

interface FlashItem {
    name: string;
    itemType: string;
    timeline?: FlashTimeline;
    exportToFile(path: string): boolean;
}

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
    transformationPoint: FlashPoint;
    rotation: number;
    scaleX: number;
    scaleY: number;
    skewX: number;
    skewY: number;
    width: number;
    height: number;
    getTransformationPoint(): FlashPoint;
    setTransformationPoint(pt: FlashPoint): void;
}

declare const fl: FlashFL;
declare const FLfile: {
    exists(path: string): boolean;
    createFolder(path: string): void;
    write(path: string, data: string): boolean;
};
