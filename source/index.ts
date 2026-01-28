import { Converter } from './core/Converter';
import { ConverterConfig } from './core/ConverterConfig';
import { Logger } from './logger/Logger';
import { SpineFormatV4_2_00 } from './spine/formats/SpineFormatV4_2_00';
import { SpineSkeletonHelper } from './spine/SpineSkeletonHelper';
import { PathUtil } from './utils/PathUtil';

//-----------------------------------

fl.showIdleMessage(false);

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

interface SelectionPath {
    layerIndex: number;
    frameIndex: number;
    elementIndex: number;
}

const getSelectionPaths = (doc: FlashDocument): { paths: SelectionPath[], currentFrame: number } => {
    const paths: SelectionPath[] = [];
    const timeline = doc.getTimeline();
    // Default to frame 0 if undefined, though it should be defined
    const currentFrame = timeline.currentFrame || 0;
    const layers = timeline.layers;

    for (let l = 0; l < layers.length; l++) {
        const layer = layers[l];
        // Get the frame object active at the current playhead
        // layers[i].frames[j] returns the frame object starting at or before j
        const frame = layer.frames[currentFrame];
        
        if (!frame) continue;

        // Check elements on this frame
        if (frame.elements) {
            for (let e = 0; e < frame.elements.length; e++) {
                if (frame.elements[e].selected) {
                    paths.push({
                        layerIndex: l,
                        frameIndex: currentFrame,
                        elementIndex: e
                    });
                }
            }
        }
    }
    
    return { paths, currentFrame };
};

const applySelectionPaths = (doc: FlashDocument, data: { paths: SelectionPath[], currentFrame: number }) => {
    const timeline = doc.getTimeline();
    
    // 1. Restore Playhead
    timeline.currentFrame = data.currentFrame;
    
    // 2. Clear current selection to be safe
    doc.selectNone();
    
    const layers = timeline.layers;
    const newSelection: FlashElement[] = [];

    // 3. Find and select elements
    for (const path of data.paths) {
        if (path.layerIndex >= layers.length) continue;
        
        const layer = layers[path.layerIndex];
        const frame = layer.frames[data.currentFrame];
        
        // Ensure we are targeting the same relative element index
        if (frame && frame.elements && path.elementIndex < frame.elements.length) {
            const el = frame.elements[path.elementIndex];
            el.selected = true; // Mark as selected
            newSelection.push(el);
        }
    }
    
    // 4. Update document selection (JSFL often requires setting the array explicitly)
    if (newSelection.length > 0) {
        doc.selection = newSelection;
    }
};

const run = () => {
    const originalDoc = fl.getDocumentDOM();
    if (!originalDoc) {
        Logger.error("No document open.");
        return;
    }

    if (!originalDoc.pathURI) {
        Logger.error("Please save the document before exporting.");
        return;
    }

    // --- CAPTURE STATE FROM ORIGINAL DOC ---
    const selectionData = getSelectionPaths(originalDoc);
    
    if (selectionData.paths.length === 0) {
        Logger.warning("No elements selected. Please select the Symbol(s) you wish to export.");
        // We could return here, but maybe the user wants to run on 'nothing' (though unlikely)?
        // The original logic would have run with empty selection and done nothing.
        // Let's return to be helpful.
        return; 
    }
    
    Logger.trace(`Selected ${selectionData.paths.length} items for export.`);

    const originalPath = originalDoc.pathURI;
    const workingDir = PathUtil.parentPath(originalPath);
    const baseName = PathUtil.fileBaseName(originalPath);
    const tempPath = PathUtil.joinPath(workingDir, baseName + "_export_tmp.fla");

    // Check if we are already in the temp file (prevent infinite recursion if user runs script on temp)
    if (originalPath.indexOf("_export_tmp.fla") !== -1) {
        Logger.warning("Running directly on temporary export file.");
        processDocument(originalDoc);
        return;
    }

    // Clean up any stale temp file
    if (FLfile.exists(tempPath)) {
        FLfile.remove(tempPath);
    }

    // Copy the current file to temp
    if (!FLfile.copy(originalPath, tempPath)) {
        Logger.error("Failed to create temporary export file.");
        return;
    }

    const tempDoc = fl.openDocument(tempPath);
    if (!tempDoc) {
        Logger.error("Failed to open temporary export file.");
        return;
    }

    try {
        // --- RESTORE STATE IN TEMP DOC ---
        applySelectionPaths(tempDoc, selectionData);
        
        processDocument(tempDoc);
    } catch (e) {
        Logger.error(`An error occurred during conversion: ${e}`);
    } finally {
        // Close temp doc without saving changes
        tempDoc.close(false);
        
        // Remove temp file
        if (FLfile.exists(tempPath)) {
            FLfile.remove(tempPath);
        }

        // Restore focus to original document
        fl.openDocument(originalPath);
    }
};

const processDocument = (document: FlashDocument) => {
    const converter = new Converter(document, config);
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

//-----------------------------------

Logger.flush();
