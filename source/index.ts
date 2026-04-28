import { Converter } from './core/Converter';
import { ConverterConfig } from './core/ConverterConfig';
import { Logger } from './logger/Logger';
import { SpineFormatV4_2_00 } from './spine/formats/SpineFormatV4_2_00';
import { SpineSkeletonHelper } from './spine/SpineSkeletonHelper';
import { PathUtil } from './utils/PathUtil';
import { JsonEncoder } from './utils/JsonEncoder';

//-----------------------------------

fl.showIdleMessage(false);

// Verbose logs are opt-in because JSFL file I/O is expensive on large exports.
const LOG_FILE_SUFFIX = '_export.log.txt';
const STATUS_FILE_SUFFIX = '_export.status.txt';
const OUTPUT_PANEL_MAX_LINES = 200;
let verboseDebugLogs = false;

const config:ConverterConfig = {
    outputFormat: new SpineFormatV4_2_00(),
    imagesExportPath: './images/',
    rasterExportScale: 1,
    rootScaleMultiplier: 1,
    appendSkeletonToImagesPath: false,
    mergeSkeletons: false,
    mergeSkeletonsRootBone: false,
    transformRootBone: false,
    simplifyBonesAndSlots: false,
    exportFrameCommentsAsEvents: true,
    exportShapes: true,
    exportTextAsShapes: true,
    mergeShapes: true,
    exportImages: true,
    mergeImages: true,
    maskTolerance: 0.5
};

type NumberSettingKey = 'rasterExportScale' | 'rootScaleMultiplier';
type ConfigBooleanSettingKey =
    | 'exportImages'
    | 'exportShapes'
    | 'mergeImages'
    | 'mergeShapes'
    | 'transformRootBone'
    | 'mergeSkeletons'
    | 'mergeSkeletonsRootBone';

interface NumberSettingDefinition {
    key:string;
    label:string;
    getValue:() => number;
    setValue:(value:number) => void;
}

interface BooleanSettingDefinition {
    key:string;
    label:string;
    getValue:() => boolean;
    setValue:(value:boolean) => void;
}

interface BooleanSettingGroup {
    title:string;
    settings:BooleanSettingDefinition[];
}

const numberSetting = (key:NumberSettingKey, label:string, defaultValue:number):NumberSettingDefinition => ({
    key,
    label,
    getValue: () => {
        const value = config[key];
        return typeof value === 'number' && isFinite(value) && value > 0 ? value : defaultValue;
    },
    setValue: (value:number) => { config[key] = value; }
});

const booleanSetting = (key:ConfigBooleanSettingKey, label:string, defaultValue:boolean):BooleanSettingDefinition => ({
    key,
    label,
    getValue: () => {
        const value = config[key];
        return typeof value === 'boolean' ? value : defaultValue;
    },
    setValue: (value:boolean) => { config[key] = value; }
});

const NUMBER_SETTINGS:NumberSettingDefinition[] = [
    numberSetting('rasterExportScale', 'Raster export scale', 1),
    numberSetting('rootScaleMultiplier', 'Root/world scale multiplier', 1)
];

const BOOLEAN_SETTING_GROUPS:BooleanSettingGroup[] = [
    {
        title: 'Export content',
        settings: [
            booleanSetting('exportImages', 'Export bitmap/images', true),
            booleanSetting('exportShapes', 'Export vector shapes', true),
            booleanSetting('mergeImages', 'Merge duplicate images', true),
            booleanSetting('mergeShapes', 'Merge duplicate shapes', true)
        ]
    },
    {
        title: 'Structure and transforms',
        settings: [
            booleanSetting('transformRootBone', 'Apply full root transform', false),
            booleanSetting('mergeSkeletons', 'Merge selected skeletons', false),
            booleanSetting('mergeSkeletonsRootBone', 'Keep root bone when merging skeletons', false)
        ]
    },
    {
        title: 'Diagnostics',
        settings: [
            {
                key: 'verboseDebugLogs',
                label: 'Debug/profiling logs (slow)',
                getValue: () => verboseDebugLogs,
                setValue: (value:boolean) => { verboseDebugLogs = value; }
            }
        ]
    }
];

const buildExportSettingsPanelXml = ():string => {
    const lines:string[] = [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<dialog title="Spine Export Settings" buttons="accept,cancel">',
        '  <vbox>',
        '    <label value="Adjust export settings for this export run." />',
        '    <label value="Raster export scale changes PNG density only." />',
        '    <label value="Root/world scale multiplier changes final skeleton size." />',
        '    <separator />'
    ];

    for (let i = 0; i < NUMBER_SETTINGS.length; i++) {
        const setting = NUMBER_SETTINGS[i];
        lines.push('    <hbox>');
        lines.push(`      <label value="${setting.label}" width="180" />`);
        lines.push(`      <textbox id="${setting.key}" value="${setting.getValue()}" size="8" />`);
        lines.push('    </hbox>');
    }

    for (let groupIndex = 0; groupIndex < BOOLEAN_SETTING_GROUPS.length; groupIndex++) {
        lines.push('    <separator />');
        const group = BOOLEAN_SETTING_GROUPS[groupIndex];
        lines.push(`    <label value="${group.title}" />`);
        for (let i = 0; i < group.settings.length; i++) {
            const setting = group.settings[i];
            lines.push(`    <checkbox id="${setting.key}" label="${setting.label}" checked="${setting.getValue() ? 'true' : 'false'}" />`);
        }
    }

    lines.push('  </vbox>');
    lines.push('</dialog>');
    return lines.join('');
};

const parsePanelNumber = (value:any, fallback:number, label:string):number => {
    const parsed = parseFloat(value);
    if (!isFinite(parsed) || parsed <= 0) {
        Logger.warning(`[Config] Invalid ${label}='${value}', keeping ${fallback}`);
        return fallback;
    }
    return parsed;
};

const parsePanelBoolean = (value:any, fallback:boolean):boolean => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
    }
    return fallback;
};

const applyExportSettingsDialog = (dialog:any):void => {
    for (let i = 0; i < NUMBER_SETTINGS.length; i++) {
        const setting = NUMBER_SETTINGS[i];
        setting.setValue(parsePanelNumber(dialog[setting.key], setting.getValue(), setting.key));
    }

    for (let groupIndex = 0; groupIndex < BOOLEAN_SETTING_GROUPS.length; groupIndex++) {
        const group = BOOLEAN_SETTING_GROUPS[groupIndex];
        for (let i = 0; i < group.settings.length; i++) {
            const setting = group.settings[i];
            setting.setValue(parsePanelBoolean(dialog[setting.key], setting.getValue()));
        }
    }
};

const promptExportSettings = ():boolean => {
    const flashHost = fl as any;
    if (!flashHost.xmlPanelFromString) {
        Logger.error('This Animate version does not support xmlPanelFromString.');
        return false;
    }

    const dialog = flashHost.xmlPanelFromString(buildExportSettingsPanelXml());

    if (!dialog || dialog.dismiss !== 'accept') {
        return false;
    }

    applyExportSettingsDialog(dialog);
    return true;
};

const configureLogging = (workingDir:string, baseName:string, originalPath:string):void => {
    try {
        Logger.setPanelEnabled(true);
        Logger.setPanelTraceEnabled(false);
        Logger.setDebugEnabled(verboseDebugLogs);
        Logger.setMaxBufferLines(OUTPUT_PANEL_MAX_LINES);
        Logger.setFileTraceEnabled(verboseDebugLogs);
        Logger.setLogFile(null);
        Logger.setStatusFile(null);

        if (!verboseDebugLogs) return;

        const logPath = PathUtil.joinPath(workingDir, baseName + LOG_FILE_SUFFIX);
        const statusPath = PathUtil.joinPath(workingDir, baseName + STATUS_FILE_SUFFIX);

        Logger.setLogFile(logPath, true);
        Logger.setStatusFile(statusPath, true);
        Logger.warning(`Debug export log: ${logPath}`);
        Logger.warning(`Debug export status: ${statusPath}`);
        Logger.status(`Original: ${originalPath}`);
    } catch (e) {
        Logger.warning(`[Logger] Failed to configure export logging: ${e}`);
    }
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

    if (!promptExportSettings()) {
        return;
    }

    const originalPath = originalDoc.pathURI;
    const workingDir = PathUtil.parentPath(originalPath);
    const baseName = PathUtil.fileBaseName(originalPath);
    configureLogging(workingDir, baseName, originalPath);

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

const logSkeletonStats = (skeleton:any):void => {
    if (!Logger.isStatusEnabled()) return;

    try {
        const anims:any[] = skeleton.animations || [];
        const bones:any[] = skeleton.bones || [];
        const slots:any[] = skeleton.slots || [];
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

            for (let bi = 0; bi < boneGroups.length; bi++) {
                const timelines:any[] = boneGroups[bi] && boneGroups[bi].timelines ? boneGroups[bi].timelines : [];
                boneTimelines += timelines.length;
                for (let ti = 0; ti < timelines.length; ti++) {
                    const timeline:any = timelines[ti];
                    const frames:any[] = timeline && timeline.frames ? timeline.frames : [];
                    boneFrames += frames.length;
                    if (timeline.type === 'rotate') rotateFrames += frames.length;
                    else if (timeline.type === 'translate') translateFrames += frames.length;
                    else if (timeline.type === 'scale') scaleFrames += frames.length;
                    else if (timeline.type === 'shear') shearFrames += frames.length;
                }
            }

            for (let si = 0; si < slotGroups.length; si++) {
                const timelines:any[] = slotGroups[si] && slotGroups[si].timelines ? slotGroups[si].timelines : [];
                slotTimelines += timelines.length;
                for (let ti = 0; ti < timelines.length; ti++) {
                    const timeline:any = timelines[ti];
                    const frames:any[] = timeline && timeline.frames ? timeline.frames : [];
                    slotFrames += frames.length;
                    if (timeline.type === 'attachment') attachmentFrames += frames.length;
                    else if (timeline.type === 'color') rgbaFrames += frames.length;
                }
            }

            Logger.status(`[Stats] anim='${anim.name}' boneGroups=${boneGroups.length} boneTimelines=${boneTimelines} boneFrames=${boneFrames} (rot=${rotateFrames} pos=${translateFrames} scale=${scaleFrames} shear=${shearFrames}) slotGroups=${slotGroups.length} slotTimelines=${slotTimelines} slotFrames=${slotFrames} (attach=${attachmentFrames} rgba=${rgbaFrames}) events=${eventFrames}`);
        }
    } catch (e) {
        Logger.status('[Stats] failed: ' + e);
    }
};

const logConvertedStats = (converted:any):void => {
    if (!Logger.isStatusEnabled()) return;

    try {
        const anims = converted && converted.animations ? converted.animations : null;
        if (!anims) {
            Logger.status('[OutStats] no animations object in converted JSON');
            return;
        }

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

            try {
                for (const boneName in bones) {
                    const rotate = bones[boneName] && bones[boneName].rotate ? bones[boneName].rotate : null;
                    if (rotate && rotate.length) {
                        const first = rotate[0];
                        const last = rotate[rotate.length - 1];
                        Logger.status(`[OutSnip] rotate bone='${boneName}' n=${rotate.length} first(t=${first.time || 0}, v=${first.value}) last(t=${last.time || 0}, v=${last.value})`);
                        break;
                    }
                }
                for (const slotName in slots) {
                    const attachment = slots[slotName] && slots[slotName].attachment ? slots[slotName].attachment : null;
                    if (attachment && attachment.length) {
                        const first = attachment[0];
                        const last = attachment[attachment.length - 1];
                        Logger.status(`[OutSnip] attach slot='${slotName}' n=${attachment.length} first(t=${first.time || 0}, name=${first.name}) last(t=${last.time || 0}, name=${last.name})`);
                        break;
                    }
                }
            } catch (eSnip) {
                Logger.status('[OutSnip] failed: ' + eSnip);
            }
        }
    } catch (e) {
        Logger.status('[OutStats] failed: ' + e);
    }
};

const processDocument = (document: FlashDocument) => {
    const converter = new Converter(document, config);
    Logger.status('Converter created');
    const result = converter.convertSelection();

    for (const skeleton of result) {
        Logger.status('Exporting skeleton: ' + skeleton.name);
        logSkeletonStats(skeleton);

        if (config.simplifyBonesAndSlots) {
            SpineSkeletonHelper.simplifySkeletonNames(skeleton);
        }

        if (skeleton.bones.length === 0) {
            Logger.error('Nothing to export.');
            continue;
        }

        const skeletonPath = converter.resolveWorkingPath(skeleton.name + '.json');
        Logger.status('Writing skeleton: ' + skeletonPath);

        const converted = config.outputFormat.convert(skeleton);
        logConvertedStats(converted);
        FLfile.write(skeletonPath, JsonEncoder.stringify(converted));
        Logger.status('Skeleton export completed');
    }
};

run();

//-----------------------------------

Logger.flush();
