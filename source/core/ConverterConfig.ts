import { SpineFormat } from '../spine/formats/SpineFormat';

export interface ConverterConfig {
    outputFormat:SpineFormat;
    imagesExportPath?:string;
    rasterExportScale?:number;
    rootScaleMultiplier?:number;
    appendSkeletonToImagesPath?:boolean;
    mergeSkeletons?:boolean;
    mergeSkeletonsRootBone?:boolean;
    transformRootBone?:boolean;
    simplifyBonesAndSlots?:boolean;
    exportFrameCommentsAsEvents?:boolean;
    exportShapes?:boolean;
    exportTextAsShapes?:boolean;
    mergeShapes?:boolean;
    exportImages?:boolean;
    mergeImages?:boolean;
    maskTolerance?:number; // Default 0.5
}
