import { Converter } from './core/Converter';
import { ConverterConfig } from './core/ConverterConfig';
import { Logger } from './logger/Logger';
import { SpineFormatV4_2_00 } from './spine/formats/SpineFormatV4_2_00';
import { SpineSkeletonHelper } from './spine/SpineSkeletonHelper';
import { PathUtil } from './utils/PathUtil';
import { JsonEncoder } from './utils/JsonEncoder';

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

        // Minimal stats to diagnose "no animation" exports.
        try {
            const anims:any[] = (skeleton as any).animations || [];
            const bones:any[] = (skeleton as any).bones || [];
            const slots:any[] = (skeleton as any).slots || [];
            Logger.status(`[Stats] bones=${bones.length} slots=${slots.length} animations=${anims.length}`);

            for (let ai = 0; ai < anims.length; ai++) {
                const anim:any = anims[ai];
                const boneGroups:any[] = anim.bones || [];
                const slotGroups:any[] = anim.slots || [];
                const eventTimeline:any = anim.events;
                const eventFrames = (eventTimeline && eventTimeline.frames) ? eventTimeline.frames.length : 0;

                let boneTimelines = 0;
                let boneFrames = 0;
                let slotTimelines = 0;
                let slotFrames = 0;

                let rotateFrames = 0;
                let translateFrames = 0;
                let scaleFrames = 0;
                let shearFrames = 0;
                let attachmentFrames = 0;
                let rgbaFrames = 0;

                // Bone timelines
                for (let bi = 0; bi < boneGroups.length; bi++) {
                    const g:any = boneGroups[bi];
                    const tls:any[] = (g && g.timelines) ? g.timelines : [];
                    boneTimelines += tls.length;
                    for (let ti = 0; ti < tls.length; ti++) {
                        const tl:any = tls[ti];
                        const frames:any[] = tl && tl.frames ? tl.frames : [];
                        boneFrames += frames.length;
                        if (tl.type === 'rotate') rotateFrames += frames.length;
                        else if (tl.type === 'translate') translateFrames += frames.length;
                        else if (tl.type === 'scale') scaleFrames += frames.length;
                        else if (tl.type === 'shear') shearFrames += frames.length;
                    }
                }

                // Slot timelines
                for (let si = 0; si < slotGroups.length; si++) {
                    const g:any = slotGroups[si];
                    const tls:any[] = (g && g.timelines) ? g.timelines : [];
                    slotTimelines += tls.length;
                    for (let ti = 0; ti < tls.length; ti++) {
                        const tl:any = tls[ti];
                        const frames:any[] = tl && tl.frames ? tl.frames : [];
                        slotFrames += frames.length;
                        if (tl.type === 'attachment') attachmentFrames += frames.length;
                        else if (tl.type === 'color') rgbaFrames += frames.length;
                    }
                }

                Logger.status(`[Stats] anim='${anim.name}' boneGroups=${boneGroups.length} boneTimelines=${boneTimelines} boneFrames=${boneFrames} (rot=${rotateFrames} pos=${translateFrames} scale=${scaleFrames} shear=${shearFrames}) slotGroups=${slotGroups.length} slotTimelines=${slotTimelines} slotFrames=${slotFrames} (attach=${attachmentFrames} rgba=${rgbaFrames}) events=${eventFrames}`);
            }
        } catch (e) {
            Logger.status('[Stats] failed: ' + e);
        }

        if (config.simplifyBonesAndSlots) {
            SpineSkeletonHelper.simplifySkeletonNames(skeleton);
        }

        if (skeleton.bones.length > 0) {
            const skeletonPath = converter.resolveWorkingPath(skeleton.name + '.json');
            Logger.status('Writing skeleton: ' + skeletonPath);

            // Convert once so we can inspect what survives optimization.
            let converted:any = null;
            try {
                converted = (config.outputFormat as any).convert(skeleton);

                const anims = converted && converted.animations ? converted.animations : null;
                if (anims) {
                    for (const animName in anims) {
                        const anim = anims[animName];
                        const bones = anim && anim.bones ? anim.bones : {};
                        const slots = anim && anim.slots ? anim.slots : {};

                        let boneTimelines = 0;
                        let boneFrames = 0;
                        for (const boneName in bones) {
                            const group = bones[boneName];
                            for (const tlName in group) {
                                const frames = group[tlName];
                                boneTimelines++;
                                if (frames && frames.length) boneFrames += frames.length;
                            }
                        }

                        let slotTimelines = 0;
                        let slotFrames = 0;
                        for (const slotName in slots) {
                            const group = slots[slotName];
                            for (const tlName in group) {
                                const frames = group[tlName];
                                slotTimelines++;
                                if (frames && frames.length) slotFrames += frames.length;
                            }
                        }

                        Logger.status(`[OutStats] anim='${animName}' boneTimelines=${boneTimelines} boneFrames=${boneFrames} slotTimelines=${slotTimelines} slotFrames=${slotFrames}`);

                        // Print a tiny snippet of the first rotate + attachment timelines.
                        try {
                            let printed = false;
                            for (const bName in bones) {
                                const g = bones[bName];
                                const rot = g && g.rotate ? g.rotate : null;
                                if (rot && rot.length) {
                                    const first = rot[0];
                                    const last = rot[rot.length - 1];
                                    Logger.status(`[OutSnip] rotate bone='${bName}' n=${rot.length} first(t=${first.time || 0}, v=${first.value}) last(t=${last.time || 0}, v=${last.value})`);
                                    printed = true;
                                    break;
                                }
                            }
                            for (const sName in slots) {
                                const g = slots[sName];
                                const att = g && g.attachment ? g.attachment : null;
                                if (att && att.length) {
                                    const first = att[0];
                                    const last = att[att.length - 1];
                                    Logger.status(`[OutSnip] attach slot='${sName}' n=${att.length} first(t=${first.time || 0}, name=${first.name}) last(t=${last.time || 0}, name=${last.name})`);
                                    break;
                                }
                            }
                        } catch (eSnip) {
                            Logger.status('[OutSnip] failed: ' + eSnip);
                        }
                    }
                } else {
                    Logger.status('[OutStats] no animations object in converted JSON');
                }
            } catch (e) {
                Logger.status('[OutStats] failed: ' + e);
            }

            if (converted) {
                FLfile.write(skeletonPath, JsonEncoder.stringify(converted));
            } else {
                // Fallback (should behave the same but keeps exporter working if debug convert fails).
                FLfile.write(skeletonPath, skeleton.convert(config.outputFormat));
            }
            Logger.status('Skeleton export completed');
        } else {
            Logger.error('Nothing to export.');
        }
    }
};

run();

//-----------------------------------

Logger.flush();
