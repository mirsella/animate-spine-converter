import { Logger } from '../logger/Logger';
import { SpineImage } from '../spine/SpineImage';

export class ImageUtil {
    public static exportBitmap(imagePath:string, element:FlashElement, exportImages:boolean):SpineImage {
        Logger.assert(element.libraryItem != null, `exportBitmap: element has no libraryItem (element: ${element.name || element.layer?.name || 'unknown'})`);
        const item = element.libraryItem as any;
        const w = item.hPixels || item.width || 0;
        const h = item.vPixels || item.height || 0;

        if (exportImages) {
            item.exportToFile(imagePath);
        }

        return new SpineImage(imagePath, w, h, 1, 0, 0);
    }

    public static exportLibraryItem(imagePath:string, element:FlashElement, scale:number, exportImages:boolean):SpineImage {
        Logger.assert(element.libraryItem != null, `exportLibraryItem: element has no libraryItem (element: ${element.name || element.layer?.name || 'unknown'})`);
        const dom = fl.getDocumentDOM();
        Logger.assert(dom != null, 'exportLibraryItem: fl.getDocumentDOM() returned null');
        const item = element.libraryItem;
        
        dom.library.addItemToDocument({x: 0, y: 0}, item.name);
        
        const result = ImageUtil.exportSelection(imagePath, dom, scale, exportImages);
        Logger.assert(dom.selection.length > 0, `exportLibraryItem: selection empty after addItemToDocument (item: ${item.name})`);
        dom.deleteSelection();
        
        return result;
    }

    public static exportInstance(imagePath:string, element:FlashElement, document:FlashDocument, scale:number, exportImages:boolean):SpineImage {
        Logger.assert(element.libraryItem != null, `exportInstance: element has no libraryItem. Raw shapes must be converted to symbols first. (element: ${element.name || element.layer?.name || 'unknown'}, elementType: ${element.elementType}, instanceType: ${(element as any).instanceType || 'none'})`);
        const dom = fl.getDocumentDOM();
        Logger.assert(dom != null, 'exportInstance: fl.getDocumentDOM() returned null');
        const item = element.libraryItem;
        
        document.library.editItem(item.name);
        dom.selectAll();
        
        const result = ImageUtil.exportSelection(imagePath, dom, scale, exportImages);
        
        dom.selectNone();
        document.library.editItem(document.name);
        
        return result;
    }

    public static exportSelection(imagePath:string, dom:FlashDocument, scale:number, exportImages:boolean):SpineImage {
        Logger.assert(dom.selection.length > 0, `exportSelection: no selection available for export (imagePath: ${imagePath})`);
        Logger.assert(dom.selection[0] != null, `exportSelection: selection[0] is null (imagePath: ${imagePath})`);

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
            Logger.assert(tempDoc != null, `exportSelection: fl.createDocument() returned null (imagePath: ${imagePath})`);
            tempDoc.width = w + 100;
            tempDoc.height = h + 100;
            
            dom.clipCopy();
            tempDoc.clipPaste();
            
            const pasted = tempDoc.selection[0];
            pasted.x = (tempDoc.width - pasted.width) / 2;
            pasted.y = (tempDoc.height - pasted.height) / 2;
            
            tempDoc.exportPNG(imagePath, true, true);
            tempDoc.close(false);
            
            dom.unGroup();
        }

        return new SpineImage(imagePath, w, h, scale, offsetX, -offsetY);
    }
}
