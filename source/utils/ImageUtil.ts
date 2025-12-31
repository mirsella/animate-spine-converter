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
        
        // Place item at origin - the registration point (0,0) is where the bone will be
        dom.library.addItemToDocument({x: 0, y: 0}, item.name);
        Logger.assert(dom.selection.length > 0, `exportLibraryItem: selection empty after addItemToDocument (item: ${item.name})`);
        
        // The bone is at the registration point (0,0), so anchor for offset calculation is (0,0)
        // The attachment offset = imageCenter - anchor = imageCenter - (0,0) = imageCenter
        const anchorX = 0;
        const anchorY = 0;
        
        Logger.trace(`[exportLibraryItem] ${item.name}: anchor at registration point (0, 0)`);
        
        const result = ImageUtil.exportSelectionWithAnchor(imagePath, dom, scale, exportImages, anchorX, anchorY);
        dom.deleteSelection();
        
        return result;
    }

    public static exportInstance(imagePath:string, element:FlashElement, document:FlashDocument, scale:number, exportImages:boolean):SpineImage {
        Logger.assert(element.libraryItem != null, `exportInstance: element has no libraryItem. Raw shapes must be converted to symbols first. (element: ${element.name || element.layer?.name || 'unknown'}, elementType: ${element.elementType}, instanceType: ${(element as any).instanceType || 'none'})`);
        const dom = fl.getDocumentDOM();
        Logger.assert(dom != null, 'exportInstance: fl.getDocumentDOM() returned null');
        const item = element.libraryItem;
        
        // Enter the symbol to export its contents
        document.library.editItem(item.name);
        dom.selectAll();
        
        // The bone is at the symbol's registration point (0,0), so anchor is (0,0)
        const anchorX = 0;
        const anchorY = 0;
        
        Logger.trace(`[exportInstance] ${item.name}: anchor at registration point (0, 0)`);
        
        const result = ImageUtil.exportSelectionWithAnchor(imagePath, dom, scale, exportImages, anchorX, anchorY);
        
        dom.selectNone();
        document.library.editItem(document.name);
        
        return result;
    }

    /**
     * Export selection using the provided anchor point for offset calculation.
     * The anchor point is where the bone is positioned, so the attachment offset
     * should be from anchor to image center.
     */
    public static exportSelectionWithAnchor(imagePath:string, dom:FlashDocument, scale:number, exportImages:boolean, anchorX:number, anchorY:number):SpineImage {
        Logger.assert(dom.selection.length > 0, `exportSelectionWithAnchor: no selection available for export (imagePath: ${imagePath})`);

        dom.resetTransformation();
        const rect = dom.getSelectionRect();
        
        const width = rect.right - rect.left;
        const height = rect.bottom - rect.top;
        const w = Math.ceil(width * scale);
        const h = Math.ceil(height * scale);
        
        // Image center in local coordinates (relative to registration point at 0,0)
        const centerX = rect.left + width / 2;
        const centerY = rect.top + height / 2;

        // Offset from Anchor Point (bone position) to Image Center
        const offsetX = centerX - anchorX;
        const offsetY = centerY - anchorY;
        
        // Debug: trace attachment offset calculation
        const pathParts = imagePath.split('/');
        const imageName = pathParts[pathParts.length - 1];
        Logger.trace(`[Attachment] ${imageName}:`);
        Logger.trace(`  rect: left=${rect.left.toFixed(2)} top=${rect.top.toFixed(2)} right=${rect.right.toFixed(2)} bottom=${rect.bottom.toFixed(2)}`);
        Logger.trace(`  size: ${width.toFixed(2)} x ${height.toFixed(2)}`);
        Logger.trace(`  imageCenter: (${centerX.toFixed(2)}, ${centerY.toFixed(2)})`);
        Logger.trace(`  anchorPoint: (${anchorX.toFixed(2)}, ${anchorY.toFixed(2)})`);
        Logger.trace(`  offset: (${offsetX.toFixed(2)}, ${offsetY.toFixed(2)}) -> spine: (${offsetX.toFixed(2)}, ${(-offsetY).toFixed(2)})`);

        if (exportImages) {
            dom.selectAll();
            dom.group();
            
            const tempDoc = fl.createDocument();
            Logger.assert(tempDoc != null, `exportSelectionWithAnchor: fl.createDocument() returned null (imagePath: ${imagePath})`);
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

    /**
     * Export selection using the first selected element's transformationPoint as anchor.
     * Used for shape exports where we don't have a separate anchor reference.
     */
    public static exportSelection(imagePath:string, dom:FlashDocument, scale:number, exportImages:boolean):SpineImage {
        Logger.assert(dom.selection.length > 0, `exportSelection: no selection available for export (imagePath: ${imagePath})`);
        Logger.assert(dom.selection[0] != null, `exportSelection: selection[0] is null (imagePath: ${imagePath})`);

        const element = dom.selection[0];
        const anchorX = element.transformationPoint.x;
        const anchorY = element.transformationPoint.y;
        
        return ImageUtil.exportSelectionWithAnchor(imagePath, dom, scale, exportImages, anchorX, anchorY);
    }
}
