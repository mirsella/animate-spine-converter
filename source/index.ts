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
