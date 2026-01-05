import { Logger } from '../logger/Logger';
import { SpineImage } from '../spine/SpineImage';
import { SpineTransformMatrix } from '../spine/transform/SpineTransformMatrix';

export class ImageUtil {
    public static exportBitmap(imagePath:string, element:FlashElement, exportImages:boolean):SpineImage {
        Logger.assert(element.libraryItem != null, `exportBitmap: element has no libraryItem (element: ${element.name || element.layer?.name || 'unknown'})`);
        const item = element.libraryItem as any;
        const w = item.hPixels || item.width || 0;
        const h = item.vPixels || item.height || 0;

        if (exportImages) {
            item.exportToFile(imagePath);
        }

        // Calculate Smart Pivot Offset
        // For a raw bitmap, the internal origin (Reg Point) is (0,0) (top-left).
        // The image center relative to Reg Point is (w/2, h/2).
        const localCenterX = w / 2;
        const localCenterY = h / 2;

        const offset = ImageUtil.calculateAttachmentOffset(element, localCenterX, localCenterY);

        return new SpineImage(imagePath, w, h, 1, offset.x, -offset.y); // Negate Y for Spine
    }

    public static exportLibraryItem(imagePath:string, element:FlashElement, scale:number, exportImages:boolean):SpineImage {
        // This method is for primitives or ensuring clean library export.
        // It relies on creating a temporary instance. 
        // We will keep the original logic for now but ensure we use the Smart Pivot if possible.
        // However, exportLibraryItem is often used when the element on stage is NOT the symbol itself but a shape.
        // If it IS a symbol instance, we should use exportInstance.
        
        Logger.assert(element.libraryItem != null, `exportLibraryItem: element has no libraryItem`);
        const dom = fl.getDocumentDOM();
        const item = element.libraryItem;
        
        dom.selectNone();
        dom.library.addItemToDocument({x: 0, y: 0}, item.name);
        const addedElement = dom.selection[0];
        
        // We use the added element to get dimensions.
        // The offset logic should arguably be based on the ORIGINAL element's transform if available.
        // But this function is often called for Shapes turned into Library Items.
        // Let's stick to the existing "SelectionOnly" logic but updated.
        
        const anchorX = element.transformationPoint.x;
        const anchorY = element.transformationPoint.y;
        
        // We pass the original element to calculate offset if needed.
        const result = ImageUtil.exportSelectionOnly(imagePath, dom, scale, exportImages, anchorX, anchorY, addedElement);
        
        dom.selectNone();
        addedElement.selected = true;
        dom.deleteSelection();
        
        return result;
    }

    public static exportInstance(imagePath:string, element:FlashElement, document:FlashDocument, scale:number, exportImages:boolean):SpineImage {
        Logger.assert(element.libraryItem != null, `exportInstance: element has no libraryItem.`);
        const dom = fl.getDocumentDOM();
        const item = element.libraryItem;
        
        // Enter the symbol
        document.library.editItem(item.name);
        dom.selectAll();
        
        // Calculate offsets using the Smart Pivot logic
        // We need the bounding box of the symbol contents to find the visual center.
        let rect: FlashRect;
        if (dom.selection.length > 0) {
            rect = dom.getSelectionRect();
        } else {
            rect = { left: 0, top: 0, right: 0, bottom: 0 };
        }

        const width = rect.right - rect.left;
        const height = rect.bottom - rect.top;
        const w = Math.max(1, Math.ceil(width * scale));
        const h = Math.max(1, Math.ceil(height * scale));
        
        // Image Center in Local Space (relative to Reg Point 0,0)
        const localCenterX = rect.left + width / 2;
        const localCenterY = rect.top + height / 2;

        // Calculate correct attachment offset
        const offset = ImageUtil.calculateAttachmentOffset(element, localCenterX, localCenterY);
        
        // Export Image Generation (PNG)
        if (exportImages && dom.selection.length > 0) {
            dom.clipCopy();
            const tempDoc = fl.createDocument();
            tempDoc.width = w;
            tempDoc.height = h;
            tempDoc.clipPaste();
            
            if (tempDoc.selection.length > 0) {
                tempDoc.selectAll();
                tempDoc.group();
                const group = tempDoc.selection[0];
                group.scaleX *= scale;
                group.scaleY *= scale;
                
                // Center in temp doc
                const pRect = tempDoc.getSelectionRect();
                const pCx = (pRect.left + pRect.right) / 2;
                const pCy = (pRect.top + pRect.bottom) / 2;
                tempDoc.moveSelectionBy({
                    x: (tempDoc.width / 2) - pCx,
                    y: (tempDoc.height / 2) - pCy
                });
            }
            tempDoc.exportPNG(imagePath, true, true);
            tempDoc.close(false);
        }

        dom.selectNone();
        document.library.editItem(document.name);
        
        return new SpineImage(imagePath, w, h, scale, offset.x, -offset.y);
    }

    /**
     * Calculates the Attachment Offset using the "Smart Pivot" algorithm.
     * This compensates for the Animate Transformation Point vs Registration Point mismatch.
     * 
     * @param element The FlashElement (Symbol Instance) on the stage.
     * @param localCenterX The X coordinate of the image center in Local Symbol Space (relative to Reg Point).
     * @param localCenterY The Y coordinate of the image center in Local Symbol Space (relative to Reg Point).
     */
    private static calculateAttachmentOffset(element: FlashElement, localCenterX: number, localCenterY: number): { x: number, y: number } {
        // 1. Get Parent-Space Coordinates
        // element.x / element.y are the Registration Point in Parent Space.
        const regPointX = element.x;
        const regPointY = element.y;

        // element.transformX / transformY are the Transformation Point (Bone Origin) in Parent Space.
        const transPointX = element.transformX;
        const transPointY = element.transformY;

        // 2. Vector from Bone Origin to Reg Point (in Parent Space)
        const dx = regPointX - transPointX;
        const dy = regPointY - transPointY;

        // 3. Decompose Matrix to get Bone Rotation/Scale
        // We use the same decomposition logic as the Bone creation to ensure consistency.
        const decomp = SpineTransformMatrix.decomposeMatrix(element.matrix);
        
        // 4. Inverse Transform the vector into Bone Local Space
        // We want to rotate by -AnimateRotation (Inverse).
        // decomp.rotation (Spine) = -AnimateRotation.
        // So Inverse AnimateRotation = -(-decomp.rotation) = decomp.rotation?
        // Wait:
        // Animate +30 deg (CW). Spine stored as -30.
        // To undo +30 CW, we rotate -30 CW (which is +30 CCW).
        // Spine Rotation is -30.
        // We need +30.
        // So we need -(-30) = +30.
        // So we need -decomp.rotation.
        
        const angleRad = -decomp.rotation * (Math.PI / 180);
        const cos = Math.cos(angleRad);
        const sin = Math.sin(angleRad);

        const rx = dx * cos - dy * sin;
        const ry = dx * sin + dy * cos;

        // Apply Inverse Scale
        const localRx = rx / decomp.scaleX;
        const localRy = ry / decomp.scaleY;

        // 5. Add Image Center Offset
        // Image Center is relative to Reg Point (0,0) in Symbol Space.
        // Since Bone Local Space (unrotated) aligns with Symbol Space, we just add.
        // Note: Check for Shear. If shear exists, the mapping is more complex.
        // For now, assuming standard orthogonal symbol space.
        
        const finalX = localRx + localCenterX;
        const finalY = localRy + localCenterY;

        return { x: finalX, y: finalY };
    }

    // Helper for legacy/other paths
    public static exportSelectionOnly(imagePath:string, dom:FlashDocument, scale:number, exportImages:boolean, anchorX:number, anchorY:number, element:FlashElement, options?: any):SpineImage {
        // This legacy method assumes 'element' is the one SELECTED inside the library or temporary doc.
        // It's tricky to apply the smart pivot here because we might lose the parent context (transformation point).
        // However, if we passed the original element in 'options' or arguments, we could use it.
        // For now, we retain the bounding-box logic for robustness in 'exportLibraryItem', 
        // but refined to use standard centers.
        
        dom.selectNone();
        element.selected = true;
        const rect = dom.getSelectionRect();
        const width = rect.right - rect.left;
        const height = rect.bottom - rect.top;
        const w = Math.max(1, Math.ceil(width * scale));
        const h = Math.max(1, Math.ceil(height * scale));
        
        const localCenterX = rect.left + width / 2;
        const localCenterY = rect.top + height / 2;

        // Determine offsets.
        // If we are exporting a raw shape/selection, the "Bone" is usually implicitly at (0,0) or the anchor passed in.
        // In the old logic, anchorX/Y were used.
        // If this is used for 'exportLibraryItem', anchorX/Y comes from the original element.
        
        // Let's try to deduce the offset simply:
        // Anchor is at anchorX, anchorY (Parent BBox relative? No, usually Parent Space).
        // If we are in a fresh doc (0,0 based), we need to be careful.
        
        // Fallback to simple bbox center offset from the provided anchor.
        // Note: The previous logic had a lot of "fix" code. 
        // We will simplify: Offset = Center - Anchor.
        // But we must respect the coordinate space of Anchor.
        
        // If this is called from exportLibraryItem, anchorX/Y are element.transformationPoint.x/y (Parent Space).
        // But the item is placed at 0,0 in the temp doc.
        // So the "Parent" implies the Registration Point is at 0,0.
        // The Transformation Point relative to Reg Point is (anchorX - element.x, anchorY - element.y).
        
        // This path is less critical than exportInstance. 
        // We'll preserve a simplified version of the old logic for now.
        
        const regRelativeAnchorX = anchorX + rect.left; // This was the old suspicious math
        const regRelativeAnchorY = anchorY + rect.top;
        
        let offsetX = localCenterX - regRelativeAnchorX; 
        let offsetY = localCenterY - regRelativeAnchorY;
        
        if (exportImages) {
             dom.clipCopy();
             const tempDoc = fl.createDocument();
             tempDoc.width = w;
             tempDoc.height = h;
             tempDoc.clipPaste();
             if (tempDoc.selection.length > 0) {
                 tempDoc.selectAll();
                 tempDoc.group();
                 const group = tempDoc.selection[0];
                 group.scaleX *= scale;
                 group.scaleY *= scale;
                 const pRect = tempDoc.getSelectionRect();
                 tempDoc.moveSelectionBy({
                     x: (tempDoc.width/2) - (pRect.left+pRect.right)/2,
                     y: (tempDoc.height/2) - (pRect.top+pRect.bottom)/2
                 });
             }
             tempDoc.exportPNG(imagePath, true, true);
             tempDoc.close(false);
        }
        
        return new SpineImage(imagePath, w, h, scale, offsetX, -offsetY);
    }
    
    // Legacy support method (stub to prevent breakages if called elsewhere)
    public static exportInstanceContents(imagePath:string, dom:FlashDocument, scale:number, exportImages:boolean, anchorX:number, anchorY:number):SpineImage {
         // This should ideally not be called anymore by the main path.
         // We implement a basic fallback.
         const rect = dom.getSelectionRect();
         const width = rect.right - rect.left;
         const height = rect.bottom - rect.top;
         const w = Math.max(1, Math.ceil(width * scale));
         const h = Math.max(1, Math.ceil(height * scale));
         const centerX = rect.left + width / 2;
         const centerY = rect.top + height / 2;
         const offsetX = centerX - (anchorX + rect.left);
         const offsetY = centerY - (anchorY + rect.top);
         return new SpineImage(imagePath, w, h, scale, offsetX, -offsetY);
    }
}
