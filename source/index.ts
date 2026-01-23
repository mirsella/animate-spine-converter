import { Converter } from './core/Converter';
import { ConverterConfig } from './core/ConverterConfig';
import { Logger } from './logger/Logger';
import { SpineFormatV4_2_00 } from './spine/formats/SpineFormatV4_2_00';
import { SpineSkeletonHelper } from './spine/SpineSkeletonHelper';

//-----------------------------------

const config:ConverterConfig = {
    outputFormat: new SpineFormatV4_2_00(),
    imagesExportPath: './images/',
    appendSkeletonToImagesPath: false,
    mergeSkeletons: false,
    mergeSkeletonsRootBone: false,
    transformRootBone: false,
    simplifyBonesAndSlots: false,
    exportFrameCommentsAsEvents: true,
    exportShapes: true,
    exportTextAsShapes: true,
    shapeExportScale: 2,
    mergeShapes: true,
    exportImages: true,
    mergeImages: true
};

//-----------------------------------

const captureSelection = (doc: FlashDocument): any => {
    const sel = doc.selection;
    if (!sel || sel.length === 0) return null;

    const tl = doc.getTimeline();
    const targets = [];
    const layers = tl.layers;
    const curFrame = tl.currentFrame;

    for (let i = 0; i < layers.length; i++) {
        const layer = layers[i];
        const frame = layer.frames[curFrame];
        if (!frame) continue;

        for (let j = 0; j < frame.elements.length; j++) {
            const el = frame.elements[j];
            for (let k = 0; k < sel.length; k++) {
                if (sel[k] === el) {
                    targets.push({ l: i, f: curFrame, e: j });
                    break;
                }
            }
        }
    }

    return {
        timelineName: tl.name,
        targets: targets
    };
};

const restoreSelection = (doc: FlashDocument, state: any): void => {
    if (!state) return;

    // Restore Timeline Context
    const currentTl = doc.getTimeline();
    if (currentTl.name !== state.timelineName) {
        if (doc.library.itemExists(state.timelineName)) {
            doc.library.editItem(state.timelineName);
        }
    }

    const tl = doc.getTimeline();
    const newSel: FlashElement[] = [];

    for (const t of state.targets) {
        const layer = tl.layers[t.l];
        if (layer) {
            const frame = layer.frames[t.f];
            if (frame && frame.elements[t.e]) {
                newSel.push(frame.elements[t.e]);
            }
        }
    }

    if (newSel.length > 0) {
        tl.currentFrame = state.targets[0].f;
        doc.selection = newSel;
    }
};

const run = () => {
    const document = fl.getDocumentDOM();
    if (!document) {
        Logger.error('No document open.');
        return;
    }

    if (!document.pathURI) {
        Logger.error('Document must be saved before exporting.');
        return;
    }

    // 1. Capture Selection & Context from Original
    const selectionState = captureSelection(document);

    // 2. Save Original (to ensure disk state matches memory)
    fl.saveDocument(document);

    // 3. Create Temp Path
    const originalPath = document.pathURI;
    const tempPath = originalPath.replace(/(\.fla|\.xfl)$/i, '_spine_temp$1');
    const finalTempPath = (tempPath === originalPath) ? originalPath + '_spine_temp.fla' : tempPath;

    // 4. Clone File
    if (FLfile.exists(finalTempPath)) {
        FLfile.remove(finalTempPath);
    }
    
    if (!FLfile.copy(originalPath, finalTempPath)) {
        Logger.error('Failed to create temporary export file: ' + finalTempPath);
        return;
    }

    // 5. Open Temp File
    const tempDoc = fl.openDocument(finalTempPath);
    if (!tempDoc) {
        Logger.error('Failed to open temporary export file.');
        return;
    }

    // 6. Restore Selection in Temp File
    restoreSelection(tempDoc, selectionState);

    // 7. Run Conversion
    const converter = new Converter(tempDoc, config);
    const result = converter.convertSelection();

    for (const skeleton of result) {
        Logger.trace('Exporting skeleton: ' + skeleton.name + '...');

        if (config.simplifyBonesAndSlots) {
            SpineSkeletonHelper.simplifySkeletonNames(skeleton);
        }

        if (skeleton.bones.length > 0) {
            const skeletonPath = converter.resolveWorkingPath(skeleton.name + '.json');
            FLfile.write(skeletonPath, skeleton.convert(config.outputFormat));
            Logger.trace('Skeleton export completed.');
        } else {
            Logger.error('Nothing to export.');
        }
    }
};

run();
Logger.flush();
