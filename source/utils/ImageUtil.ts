import { Logger } from '../logger/Logger';
import { SpineImage } from '../spine/SpineImage';

export class ImageUtil {
    public static exportBitmap(imagePath:string, element:FlashElement, exportImages:boolean):SpineImage {
        const item = element.libraryItem;
        const w = (item as any).hPixels || (item as any).width;
        const h = (item as any).vPixels || (item as any).height;

        if (exportImages) {
            (item as any).exportToFile(imagePath);
        }

        return new SpineImage(imagePath, w, h, 1, 0, 0);
    }

    public static exportLibraryItem(imagePath:string, element:FlashElement, scale:number, exportImages:boolean):SpineImage {
        const dom = fl.getDocumentDOM();
        const item = element.libraryItem;
        
        dom.library.addItemToStage({x: 0, y: 0}, item.name);
        
        const result = ImageUtil.exportSelection(imagePath, dom, scale, exportImages);
        dom.deleteSelection();
        
        return result;
    }

    public static exportInstance(imagePath:string, element:FlashElement, document:FlashDocument, scale:number, exportImages:boolean):SpineImage {
        const dom = fl.getDocumentDOM();
        
        document.library.editItem(element.libraryItem.name);
        dom.selectAll();
        
        const result = ImageUtil.exportSelection(imagePath, dom, scale, exportImages);
        
        dom.selectNone();
        document.library.editItem(document.name);
        
        return result;
    }

    public static exportSelection(imagePath:string, dom:any, scale:number, exportImages:boolean):SpineImage {
        if (dom.selection.length === 0) {
            return new SpineImage(imagePath, 0, 0, scale, 0, 0);
        }

        const element = dom.selection[0];
        
        // Use transformationPoint for local Anchor Point relative to Registration Point (0,0)
        const localAnchorX = element.transformationPoint.x;
        const localAnchorY = element.transformationPoint.y;
        
        dom.resetTransform();
        const rect = dom.getSelectionRect();
        
        const w = Math.ceil((rect.right - rect.left) * scale);
        const h = Math.ceil((rect.bottom - rect.top) * scale);
        const centerX = (rect.left + rect.right) / 2;
        const centerY = (rect.top + rect.bottom) / 2;

        // Offset from Anchor Point to Center Point
        const offsetX = centerX - localAnchorX;
        const offsetY = centerY - localAnchorY;

        Logger.trace(`[ImageUtil] element: tp=(${localAnchorX.toFixed(2)}, ${localAnchorY.toFixed(2)}) rect=(${rect.left.toFixed(2)}, ${rect.top.toFixed(2)}, ${rect.right.toFixed(2)}, ${rect.bottom.toFixed(2)})`);
        Logger.trace(`[ImageUtil] exportSelection: w=${w}, h=${h}, offset=(${offsetX.toFixed(2)}, ${offsetY.toFixed(2)})`);

        if (exportImages) {
            dom.group();
            
            // Center the group in an oversized doc to avoid clipping
            const tempDoc = fl.createDocument();
            tempDoc.width = w + 100;
            tempDoc.height = h + 100;
            
            fl.selectActiveWindow(dom);
            dom.clipCopy();
            
            fl.selectActiveWindow(tempDoc);
            tempDoc.clipPaste();
            
            const pasted = tempDoc.selection[0];
            pasted.x = (tempDoc.width - pasted.width) / 2;
            pasted.y = (tempDoc.height - pasted.height) / 2;
            
            tempDoc.exportPNG(imagePath, true, true);
            tempDoc.close(false);
            
            fl.selectActiveWindow(dom);
            dom.unGroup();
        }

        return new SpineImage(imagePath, w, h, scale, offsetX, -offsetY);
    }
}
