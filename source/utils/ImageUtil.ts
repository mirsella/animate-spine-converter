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

        // Calculate offset from transformation point (bone) to image center
        // For a raw bitmap, the internal center is (w/2, h/2)
        const anchorX = element.transformationPoint.x;
        const anchorY = element.transformationPoint.y;
        const offsetX = (w / 2) - anchorX;
        const offsetY = (h / 2) - anchorY;

        return new SpineImage(imagePath, w, h, 1, offsetX, -offsetY);
    }

    public static exportLibraryItem(imagePath:string, element:FlashElement, scale:number, exportImages:boolean):SpineImage {
        Logger.assert(element.libraryItem != null, `exportLibraryItem: element has no libraryItem (element: ${element.name || element.layer?.name || 'unknown'})`);
        const dom = fl.getDocumentDOM();
        Logger.assert(dom != null, 'exportLibraryItem: fl.getDocumentDOM() returned null');
        const item = element.libraryItem;
        
        // Deselect everything first to ensure clean state
        dom.selectNone();
        
        // Place item at origin - the registration point (0,0) is where the bone will be
        dom.library.addItemToDocument({x: 0, y: 0}, item.name);
        Logger.assert(dom.selection.length > 0, `exportLibraryItem: selection empty after addItemToDocument (item: ${item.name})`);
        
        // Store reference to the added element before any other operations
        const addedElement = dom.selection[0];
        
        // The bone is at the registration point (0,0), so anchor for offset calculation is (0,0)
        const anchorX = 0;
        const anchorY = 0;
        
        Logger.trace(`[exportLibraryItem] ${item.name}: anchor at registration point (0, 0)`);
        
        const result = ImageUtil.exportSelectionOnly(imagePath, dom, scale, exportImages, anchorX, anchorY, addedElement);
        
        // Delete only the element we added
        dom.selectNone();
        addedElement.selected = true;
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
        
        // Use exportInstanceContents which doesn't modify the symbol contents
        const result = ImageUtil.exportInstanceContents(imagePath, dom, scale, exportImages, anchorX, anchorY);
        
        dom.selectNone();
        document.library.editItem(document.name);
        
        return result;
    }
    
    /**
     * Export the contents of a symbol without modifying them (no group/ungroup).
     * Used when editing inside a library item.
     */
    public static exportInstanceContents(imagePath:string, dom:FlashDocument, scale:number, exportImages:boolean, anchorX:number, anchorY:number):SpineImage {
        Logger.assert(dom.selection.length > 0, `exportInstanceContents: no selection available for export (imagePath: ${imagePath})`);

        const rect = dom.getSelectionRect();
        
        const width = rect.right - rect.left;
        const height = rect.bottom - rect.top;
        const w = Math.max(1, Math.ceil(width * scale));
        const h = Math.max(1, Math.ceil(height * scale));
        
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
            // Copy BEFORE creating temp doc to ensure we copy from correct context
            dom.clipCopy();
            
            const tempDoc = fl.createDocument();
            Logger.assert(tempDoc != null, `exportInstanceContents: fl.createDocument() returned null (imagePath: ${imagePath})`);
            tempDoc.width = w;
            tempDoc.height = h;
            
            tempDoc.clipPaste();
            
            if (tempDoc.selection.length > 0) {
                // Group all pasted elements to scale and center them as a single unit
                tempDoc.selectAll();
                tempDoc.group();
                const group = tempDoc.selection[0];
                
                group.scaleX *= scale;
                group.scaleY *= scale;

                const pastedRect = tempDoc.getSelectionRect();
                const pCenterX = (pastedRect.left + pastedRect.right) / 2;
                const pCenterY = (pastedRect.top + pastedRect.bottom) / 2;

                tempDoc.moveSelectionBy({
                    x: (tempDoc.width / 2) - pCenterX,
                    y: (tempDoc.height / 2) - pCenterY
                });
            }
            
            tempDoc.exportPNG(imagePath, true, true);
            tempDoc.close(false);
        }

        return new SpineImage(imagePath, w, h, scale, offsetX, -offsetY);
    }

    /**
     * Export selection using the provided anchor point for offset calculation.
     * The anchor point is where the bone is positioned, so the attachment offset
     * should be from anchor to image center.
     * NOTE: This method copies the current selection without modifying the source document.
     */
    public static exportSelectionWithAnchor(imagePath:string, dom:FlashDocument, scale:number, exportImages:boolean, anchorX:number, anchorY:number):SpineImage {
        Logger.assert(dom.selection.length > 0, `exportSelectionWithAnchor: no selection available for export (imagePath: ${imagePath})`);

        const rect = dom.getSelectionRect();
        
        const width = rect.right - rect.left;
        const height = rect.bottom - rect.top;
        const w = Math.max(1, Math.ceil(width * scale));
        const h = Math.max(1, Math.ceil(height * scale));
        
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
            // Copy BEFORE creating temp doc to ensure we copy from correct context
            dom.clipCopy();
            
            const tempDoc = fl.createDocument();
            Logger.assert(tempDoc != null, `exportSelectionWithAnchor: fl.createDocument() returned null (imagePath: ${imagePath})`);
            tempDoc.width = w;
            tempDoc.height = h;
            
            tempDoc.clipPaste();
            
            // Center the pasted content
            if (tempDoc.selection.length > 0) {
                tempDoc.selectAll();
                tempDoc.group();
                const group = tempDoc.selection[0];
                
                group.scaleX *= scale;
                group.scaleY *= scale;

                const pastedRect = tempDoc.getSelectionRect();
                const pCenterX = (pastedRect.left + pastedRect.right) / 2;
                const pCenterY = (pastedRect.top + pastedRect.bottom) / 2;

                tempDoc.moveSelectionBy({
                    x: (tempDoc.width / 2) - pCenterX,
                    y: (tempDoc.height / 2) - pCenterY
                });
            }
            
            tempDoc.exportPNG(imagePath, true, true);
            tempDoc.close(false);
        }

        return new SpineImage(imagePath, w, h, scale, offsetX, -offsetY);
    }

    /**
     * Export a specific element without affecting other elements on the stage.
     * Used for library item exports where we need to isolate the added element.
     */
    public static exportSelectionOnly(imagePath:string, dom:FlashDocument, scale:number, exportImages:boolean, anchorX:number, anchorY:number, element:FlashElement):SpineImage {
        dom.selectNone();
        element.selected = true;
        
        const rect = dom.getSelectionRect();
        
        const width = rect.right - rect.left;
        const height = rect.bottom - rect.top;
        const w = Math.max(1, Math.ceil(width * scale));
        const h = Math.max(1, Math.ceil(height * scale));
        
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
            // Copy BEFORE creating temp doc to ensure we copy from correct context
            dom.clipCopy();
            
            const tempDoc = fl.createDocument();
            Logger.assert(tempDoc != null, `exportSelectionOnly: fl.createDocument() returned null (imagePath: ${imagePath})`);
            tempDoc.width = w;
            tempDoc.height = h;
            
            // Paste into the new document (fl.createDocument makes it active)
            tempDoc.clipPaste();
            
            if (tempDoc.selection.length > 0) {
                tempDoc.selectAll();
                tempDoc.group();
                const group = tempDoc.selection[0];
                
                group.scaleX *= scale;
                group.scaleY *= scale;

                const pastedRect = tempDoc.getSelectionRect();
                const pCenterX = (pastedRect.left + pastedRect.right) / 2;
                const pCenterY = (pastedRect.top + pastedRect.bottom) / 2;

                tempDoc.moveSelectionBy({
                    x: (tempDoc.width / 2) - pCenterX,
                    y: (tempDoc.height / 2) - pCenterY
                });
            }
            
            tempDoc.exportPNG(imagePath, true, true);
            tempDoc.close(false);
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
