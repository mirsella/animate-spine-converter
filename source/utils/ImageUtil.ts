import { Logger } from '../logger/Logger';
import { SpineImage } from '../spine/SpineImage';

export class ImageUtil {
    public static exportBitmap(imagePath:string, element:FlashElement, exportImages:boolean):SpineImage {
        const item = element.libraryItem as any;
        const w = item.hPixels || item.width || 0;
        const h = item.vPixels || item.height || 0;

        if (exportImages) {
            item.exportToFile(imagePath);
        }

        return new SpineImage(imagePath, w, h, 1, 0, 0);
    }

    public static exportLibraryItem(imagePath:string, element:FlashElement, scale:number, exportImages:boolean):SpineImage {
        const dom = fl.getDocumentDOM();
        const item = element.libraryItem;
        
        dom.library.addItemToDocument({x: 0, y: 0}, item.name);
        
        const result = ImageUtil.exportSelection(imagePath, dom, scale, exportImages);
        if (dom.selection.length > 0) {
            dom.deleteSelection();
        }
        
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

    public static exportSelection(imagePath:string, dom:FlashDocument, scale:number, exportImages:boolean):SpineImage {
        if (dom.selection.length === 0) {
            return new SpineImage(imagePath, 0, 0, scale, 0, 0);
        }

        const element = dom.selection[0];
        
        // Use transformationPoint for local Anchor Point relative to Registration Point (0,0)
        const localAnchorX = element.transformationPoint.x;
        const localAnchorY = element.transformationPoint.y;
        
        dom.resetTransformation();
        const rect = dom.getSelectionRect();
        
        const width = rect.right - rect.left;
        const height = rect.bottom - rect.top;
        const w = Math.ceil(width * scale);
        const h = Math.ceil(height * scale);
        
        const centerX = rect.left + width / 2;
        const centerY = rect.top + height / 2;

        // Offset from Anchor Point to Center Point
        const offsetX = centerX - localAnchorX;
        const offsetY = centerY - localAnchorY;

        if (exportImages) {
            dom.group();
            
            const tempDoc = fl.createDocument();
            tempDoc.width = w + 100;
            tempDoc.height = h + 100;
            
            if ((fl as any).selectActiveWindow) (fl as any).selectActiveWindow(dom);
            dom.clipCopy();
            
            if ((fl as any).selectActiveWindow) (fl as any).selectActiveWindow(tempDoc);
            tempDoc.clipPaste();
            
            const pasted = tempDoc.selection[0];
            pasted.x = (tempDoc.width - pasted.width) / 2;
            pasted.y = (tempDoc.height - pasted.height) / 2;
            
            tempDoc.exportPNG(imagePath, true, true);
            tempDoc.close(false);
            
            if ((fl as any).selectActiveWindow) (fl as any).selectActiveWindow(dom);
            dom.unGroup();
        }

        return new SpineImage(imagePath, w, h, scale, offsetX, -offsetY);
    }
}
