import { Converter } from './core/Converter';
import { ConverterConfig } from './core/ConverterConfig';
import { Logger } from './logger/Logger';
import { SpineFormatV4_2_00 } from './spine/formats/SpineFormatV4_2_00';
import { SpineSkeletonHelper } from './spine/SpineSkeletonHelper';
import { PathUtil } from './utils/PathUtil';

//-----------------------------------

fl.showIdleMessage(false);

// Logging:
// - Write a persistent log file next to the .fla so we can inspect the last step before a crash.
// - Keep the Output panel quiet (trace logs are file-only).
const LOG_TO_FILE = true;
const LOG_FILE_SUFFIX = '_export.log.txt';
const STATUS_FILE_SUFFIX = '_export.status.txt';
// If false: trace logs won't write to the log file (safer for large exports).
const TRACE_TO_LOG_FILE = false;
const TRACE_TO_OUTPUT_PANEL = false;
const DEBUG_VERBOSE_LOGS = false;
const OUTPUT_PANEL_MAX_LINES = 200;

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

    // Configure logging as early as possible.
    try {
        Logger.setPanelTraceEnabled(TRACE_TO_OUTPUT_PANEL);
        Logger.setDebugEnabled(DEBUG_VERBOSE_LOGS);
        Logger.setMaxBufferLines(OUTPUT_PANEL_MAX_LINES);
        Logger.setFileTraceEnabled(TRACE_TO_LOG_FILE);

        if (LOG_TO_FILE) {
            const logPath = PathUtil.joinPath(workingDir, baseName + LOG_FILE_SUFFIX);
            Logger.setLogFile(logPath, true);
            Logger.warning(`Export log: ${logPath}`);
        }

        const statusPath = PathUtil.joinPath(workingDir, baseName + STATUS_FILE_SUFFIX);
        Logger.setStatusFile(statusPath, true);
        Logger.warning(`Export status: ${statusPath}`);
        Logger.status(`Original: ${originalPath}`);
    } catch (e) {
        // ignore logger init errors
    }
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

    Logger.status(`Temp copy ok: ${tempPath}`);

    const tempDoc = fl.openDocument(tempPath);
    if (!tempDoc) {
        Logger.error("Failed to open temporary export file.");
        return;
    }

    Logger.status(`Temp opened: ${tempPath}`);

    // Disable UI updates during heavy export process to prevent crashes and race conditions
    const wasLivePreview = tempDoc.livePreview;
    tempDoc.livePreview = false;

    try {
        // --- RESTORE STATE IN TEMP DOC ---
        applySelectionPaths(tempDoc, selectionData);

        Logger.status('Starting conversion in temp doc');
        
        processDocument(tempDoc);

        Logger.status('Conversion finished');
    } catch (e) {
        Logger.error(`An error occurred during conversion: ${e}`);
    } finally {
        // Restore UI updates
        tempDoc.livePreview = wasLivePreview;

        // Safety: closing a document while still in symbol edit mode can crash Animate.
        // Ensure we return to the main timeline before closing the temp doc.
        try {
            for (let i = 0; i < 16; i++) {
                try {
                    (tempDoc as any).exitEditMode();
                    Logger.status('exitEditMode');
                } catch (eExit) {
                    break;
                }
            }
        } catch (e) {
            // ignore
        }
        
        // Close temp doc without saving changes
        Logger.status('Closing temp doc');
        tempDoc.close(false);
        
        // Remove temp file
        Logger.status('Removing temp file');
        if (FLfile.exists(tempPath)) {
            FLfile.remove(tempPath);
        }

        // Restore focus to original document
        Logger.status('Reopening original doc');
        fl.openDocument(originalPath);
    }
};

const processDocument = (document: FlashDocument) => {
    const converter = new Converter(document, config);
    Logger.status('Converter created');
    const result = converter.convertSelection();

    for (const skeleton of result) {
        Logger.status('Exporting skeleton: ' + skeleton.name);

        if (config.simplifyBonesAndSlots) {
            SpineSkeletonHelper.simplifySkeletonNames(skeleton);
        }

        if (skeleton.bones.length > 0) {
            const skeletonPath = converter.resolveWorkingPath(skeleton.name + '.json');
            Logger.status('Writing skeleton: ' + skeletonPath);
            FLfile.write(skeletonPath, skeleton.convert(config.outputFormat));
            Logger.status('Skeleton export completed');
        } else {
            Logger.error('Nothing to export.');
        }
    }
};

run();

//-----------------------------------

Logger.flush();
