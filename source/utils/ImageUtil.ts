import { SpineImage } from '../spine/SpineImage';
import { Logger } from '../logger/Logger';

export class ImageUtil {
    /**
     * Exports the current selection in the document as a PNG.
     * Calculates the offset from the reference element's Anchor Point (Transformation Point)
     * to the center of the bounding box of the entire selection.
     */
    public static exportSelection(path:string, document:FlashDocument, scale:number, autoExport:boolean, autoClose:boolean = false):SpineImage {
        if (document.selection.length === 0) {
            throw new Error('ImageUtil.exportSelection: Nothing selected!');
        }

        const [ firstElement ] = document.selection;
        
        // Flash element.transformX/Y represent the position of the Anchor Point (Circle)
        // In the exporter document, after resetTransform, these are the local coordinates of the anchor.
        const originX = firstElement.transformX;
        const originY = firstElement.transformY;

        Logger.trace(`[ImageUtil] firstElement: x=${firstElement.x}, y=${firstElement.y}, transformX=${firstElement.transformX}, transformY=${firstElement.transformY}`);

        // Get bounding box in original Flash coordinates.
        const rect = document.getSelectionRect(); 
        const centerX = (rect.left + rect.right) / 2;
        const centerY = (rect.top + rect.bottom) / 2;

        // Relative offset from Anchor to Center (in original pixels)
        const offsetX = centerX - originX;
        const offsetY = centerY - originY;

        // Group everything to scale and move it safely.
        document.group();
        
        const [ group ] = document.selection;
        
        // Scale the asset for export
        group.scaleX = scale;
        group.scaleY = scale;
        
        // Get scaled bounding box
        const scaledRect = document.getSelectionRect();
        const width = scaledRect.right - scaledRect.left;
        const height = scaledRect.bottom - scaledRect.top;
        
        // Prepare document size with margin.
        const margin = 10;
        const docWidth = Math.ceil(width) + margin * 2;
        const docHeight = Math.ceil(height) + margin * 2;

        document.width = docWidth;
        document.height = docHeight;
        
        // Move selection so its bounding box center is exactly at the document center.
        document.moveSelectionBy({
            x: (docWidth / 2) - (scaledRect.left + scaledRect.right) / 2,
            y: (docHeight / 2) - (scaledRect.top + scaledRect.bottom) / 2
        });

        if (autoExport) {
            document.exportPNG(path, false, true);
        }

        if (autoClose) {
            document.close(false);
        }

        Logger.trace(`[ImageUtil] exportSelection: w=${docWidth}, h=${docHeight}, scale=${scale}, offset=(${offsetX.toFixed(2)}, ${(-offsetY).toFixed(2)})`);

        return {
            width: docWidth,
            height: docHeight,
            scale: scale,
            x: offsetX, // Attachment x in Spine is in original bone-relative pixels
            y: -offsetY // Flip Y for Spine
        };
    }

    public static exportInstance(path:string, instance:FlashElement, document:FlashDocument, scale:number, autoExport:boolean):SpineImage {
        const exporter = fl.createDocument('timeline');

        instance.layer.visible = true;
        instance.layer.locked = false;

        document.selectNone();
        document.selection = [ instance ];
        document.clipCopy();
        exporter.clipPaste();

        const [ element ] = exporter.selection;
        ImageUtil.resetTransform(element);
        exporter.selectAll();

        return ImageUtil.exportSelection(
            path, exporter,
            scale, autoExport,
            true
        );
    }

    public static exportLibraryItem(path:string, instance:FlashElement, scale:number, autoExport:boolean):SpineImage {
        const exporter = fl.createDocument('timeline');

        // addItem places registration point at (0,0)
        exporter.addItem({ x: 0, y: 0 }, instance.libraryItem);
        exporter.selectAll();

        return ImageUtil.exportSelection(
            path, exporter,
            scale, autoExport,
            true
        );
    }

    public static exportBitmap(path:string, instance:FlashElement, autoExport:boolean):SpineImage {
        if (autoExport) {
            instance.libraryItem.exportToFile(path);
        }

        return {
            width: instance.libraryItem.hPixels,
            height: instance.libraryItem.vPixels,
            x: instance.libraryItem.hPixels / 2,
            y: -instance.libraryItem.vPixels / 2,
            scale: 1
        };
    }

    public static resetTransform(element:FlashElement):void {
        element.rotation = 0;
        element.scaleX = 1;
        element.scaleY = 1;
        element.skewX = 0;
        element.skewY = 0;
        element.x = 0;
        element.y = 0;
    }
}
