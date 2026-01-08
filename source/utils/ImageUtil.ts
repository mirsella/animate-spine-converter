import { Logger } from '../logger/Logger';
import { SpineImage } from '../spine/SpineImage';
import { SpineTransformMatrix } from '../spine/transform/SpineTransformMatrix';

export class ImageUtil {
    public static exportBitmap(imagePath:string, element:FlashElement, exportImages:boolean):SpineImage {
        Logger.assert(element.libraryItem != null, `exportBitmap: element has no libraryItem (element: ${element.name || element.layer?.name || 'unknown'})`);
        
        // Capture geometric properties immediately
        const regPointX = element.x;
        const regPointY = element.y;
        const transPointX = element.transformX;
        const transPointY = element.transformY;
        const matrix = element.matrix;

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

        const offset = ImageUtil.calculateAttachmentOffset(
            matrix,
            regPointX, regPointY,
            transPointX, transPointY,
            localCenterX, localCenterY
        );

        return new SpineImage(imagePath, w, h, 1, offset.x, offset.y); // Negate Y handled by SpineFormat
    }

    public static exportLibraryItem(imagePath:string, element:FlashElement, scale:number, exportImages:boolean):SpineImage {
        Logger.assert(element.libraryItem != null, `exportLibraryItem: element has no libraryItem`);
        // Use the shared export logic
        return ImageUtil.exportSymbol(imagePath, element, fl.getDocumentDOM(), scale, exportImages);
    }

    public static exportInstance(imagePath:string, element:FlashElement, document:FlashDocument, scale:number, exportImages:boolean):SpineImage {
        Logger.assert(element.libraryItem != null, `exportInstance: element has no libraryItem. (type: ${element.elementType})`);
        // Use the shared export logic
        return ImageUtil.exportSymbol(imagePath, element, document, scale, exportImages);
    }

    public static exportShape(imagePath:string, element:FlashElement, document:FlashDocument, scale:number, exportImages:boolean):SpineImage {
        // Shapes don't have a library item, so we export them directly from the current context.
        // The Converter ensures we are in the correct parent context.
        
        const matrix = element.matrix;
        const transPointX = element.transformX;
        const transPointY = element.transformY;

        // CRITICAL: For Shapes, element.x/y is the Bounding Box Left/Top, NOT the transformation origin.
        // We must use the matrix translation (tx, ty) as the effective "Registration Point" (Origin)
        // because that matches the coordinate system where the shape's geometry is defined relative to (0,0).
        const regPointX = matrix.tx;
        const regPointY = matrix.ty;

        const dom = document; 
        
        // 2. Copy the shape
        // Ensure layer is unlocked/visible to allow selection/copy
        const layer = element.layer;
        const wasLocked = layer.locked;
        const wasVisible = layer.visible;
        
        layer.locked = false;
        layer.visible = true;

        dom.selectNone();
        element.selected = true;
        
        try {
            dom.clipCopy();
        } catch (e) {
            Logger.warning(`[ImageUtil] clipCopy failed for shape on layer '${layer.name}': ${e}`);
        }

        
        element.selected = false;
        
        // Restore layer state
        layer.locked = wasLocked;
        layer.visible = wasVisible;

        // 3. Paste into a temp document to isolate and normalize it

        const tempDoc = fl.createDocument();
        // Use inPlace=true to keep coordinates consistent with source stage (though we reset matrix anyway)
        tempDoc.clipPaste(true);
        
        let w = 1;
        let h = 1;
        let localCenterX = 0;
        let localCenterY = 0;

        if (tempDoc.selection.length > 0) {
            const pasted = tempDoc.selection[0];
            
            // 4. RESET MATRIX TO IDENTITY
            // This is the critical fix for skewed/rotated shapes. 
            // We want the image to be the "neutral" pose. The Bone in Spine will handle the skew/rotation.
            // When matrix is identity, the shape's geometry is positioned relative to the Stage Origin (0,0)
            // exactly as it is defined relative to its own internal origin.
            pasted.matrix = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
            
            // 5. Measure the normalized shape
            const rect = tempDoc.getSelectionRect();
            const width = rect.right - rect.left;
            const height = rect.bottom - rect.top;
            
            w = Math.max(1, Math.ceil(width * scale));
            h = Math.max(1, Math.ceil(height * scale));
            
            // Local Center: The vector from the Shape's Origin (which is 0,0 now) to the Center of its Bounding Box.
            // Since we reset matrix to identity (tx=0, ty=0), the "Origin" is at Stage (0,0).
            // rect.left/top are coordinates on this stage.
            // So rect.left IS the x-distance from Origin to Left Edge.
            localCenterX = rect.left + width / 2;
            localCenterY = rect.top + height / 2;
            
            Logger.trace(`[ImageUtil] Shape ${element.name || 'shape'}: IdentityRect=(${rect.left.toFixed(2)},${rect.top.toFixed(2)},${width.toFixed(2)}x${height.toFixed(2)})`);

            if (exportImages) {
                tempDoc.width = w;
                tempDoc.height = h;
                
                // Apply Export Scale
                if (scale !== 1) {
                    pasted.scaleX = scale;
                    pasted.scaleY = scale;
                }
                
                // Center in the Temp Canvas
                const finalRect = tempDoc.getSelectionRect();
                const fx = (finalRect.left + finalRect.right) / 2;
                const fy = (finalRect.top + finalRect.bottom) / 2;
                
                tempDoc.moveSelectionBy({
                    x: (w / 2) - fx,
                    y: (h / 2) - fy
                });
                
                tempDoc.exportPNG(imagePath, true, true);
            }
        }
        
        tempDoc.close(false);

        // 6. Calculate Offset using the ORIGINAL transform 
        // We pass regPoint = matrix.tx/ty because that's the "Origin" in parent space.
        // We pass localCenter calculated from the identity shape relative to (0,0).
        const offset = ImageUtil.calculateAttachmentOffset(
            matrix, 
            regPointX, regPointY, 
            transPointX, transPointY, 
            localCenterX, localCenterY
        );

        return new SpineImage(imagePath, w, h, scale, offset.x, offset.y);
    }

    private static exportSymbol(imagePath:string, element:FlashElement, document:FlashDocument, scale:number, exportImages:boolean):SpineImage {
        const item = element.libraryItem;

        // Capture geometric properties BEFORE switching context
        const regPointX = element.x;
        const regPointY = element.y;
        const transPointX = element.transformX;
        const transPointY = element.transformY;
        const matrix = element.matrix;

        // Enter the symbol
        document.library.editItem(item.name);
        
        const dom = fl.getDocumentDOM();
        const timeline = dom.getTimeline();
        
        // Unlock, unhide, and select all frames/layers
        timeline.selectAllFrames();
        for (const layer of timeline.layers) {
            if (layer.layerType === 'guide') continue;
            layer.locked = false;
            layer.visible = true;
        }
        
        dom.selectAll();
        
        // Calculate offsets using the Smart Pivot logic
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

        const offset = ImageUtil.calculateAttachmentOffset(
            matrix, 
            regPointX, regPointY, 
            transPointX, transPointY, 
            localCenterX, localCenterY
        );

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
        dom.exitEditMode();
        
        return new SpineImage(imagePath, w, h, scale, offset.x, offset.y);
    }

    /**
     * Calculates the Attachment Offset using the "Smart Pivot" algorithm.
     * This compensates for the Animate Transformation Point vs Registration Point mismatch.
     */
    private static calculateAttachmentOffset(
        matrix: FlashMatrix,
        regPointX: number, regPointY: number,
        transPointX: number, transPointY: number,
        localCenterX: number, localCenterY: number
    ): { x: number, y: number } {
        // 1. Get Parent-Space Coordinates passed in

        // 2. Vector from Bone Origin to Reg Point (in Parent Space)
        const dx = regPointX - transPointX;
        const dy = regPointY - transPointY;

        // 3. Decompose Matrix to get Bone Rotation/Scale
        const decomp = SpineTransformMatrix.decomposeMatrix(matrix);
        
        // 4. Inverse Transform the vector into Bone Local Space
        // We want to rotate by -AnimateRotation (Inverse).
        // decomp.rotation (Spine) = -AnimateRotation.
        // So Inverse AnimateRotation = decomp.rotation.
        
        const angleRad = decomp.rotation * (Math.PI / 180);
        const cos = Math.cos(angleRad);
        const sin = Math.sin(angleRad);

        const rx = dx * cos - dy * sin;
        const ry = dx * sin + dy * cos;

        // Apply Inverse Shear and Scale
        // Basis vectors in local space (after removing rotation):
        // X-axis: (scaleX, 0)
        // Y-axis: (-scaleY * sin(shear), scaleY * cos(shear))
        // We solve: rx = x * scaleX - y * scaleY * sin(shear)
        //           ry = y * scaleY * cos(shear)
        
        // Use shearX because Spine uses X-shear (shear of Y axis relative to X)
        const shearRad = decomp.shearX * (Math.PI / 180);
        const shearCos = Math.cos(shearRad);
        const shearTan = Math.tan(shearRad);

        // Solve for y (localRy) first
        const localRy = ry / (decomp.scaleY * shearCos);
        
        // Solve for x (localRx)
        // x = (rx + y * scaleY * sin(shear)) / scaleX
        // y * scaleY * sin(shear) = (ry / cos) * sin = ry * tan
        const localRx = (rx - ry * shearTan) / decomp.scaleX;

        // 5. Add Image Center Offset
        // Image Center is relative to Reg Point (0,0) in Symbol Space.
        
        const finalX = localRx + localCenterX;
        const finalY = localRy + localCenterY;

        return { x: finalX, y: finalY };
    }

    // Helper for legacy/other paths
    public static exportSelectionOnly(imagePath:string, dom:FlashDocument, scale:number, exportImages:boolean, anchorX:number, anchorY:number, element:FlashElement, options?: any):SpineImage {
        // This legacy method assumes 'element' is the one SELECTED inside the library or temporary doc.
        dom.selectNone();
        element.selected = true;
        const rect = dom.getSelectionRect();
        const width = rect.right - rect.left;
        const height = rect.bottom - rect.top;
        const w = Math.max(1, Math.ceil(width * scale));
        const h = Math.max(1, Math.ceil(height * scale));
        
        const localCenterX = rect.left + width / 2;
        const localCenterY = rect.top + height / 2;

        const regRelativeAnchorX = anchorX + rect.left; 
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
        
        return new SpineImage(imagePath, w, h, scale, offsetX, offsetY);
    }
    
    // Legacy support method (stub to prevent breakages if called elsewhere)
    public static exportInstanceContents(imagePath:string, dom:FlashDocument, scale:number, exportImages:boolean, anchorX:number, anchorY:number):SpineImage {
         const rect = dom.getSelectionRect();
         const width = rect.right - rect.left;
         const height = rect.bottom - rect.top;
         const w = Math.max(1, Math.ceil(width * scale));
         const h = Math.max(1, Math.ceil(height * scale));
         const centerX = rect.left + width / 2;
         const centerY = rect.top + height / 2;
         const offsetX = centerX - (anchorX + rect.left);
         const offsetY = centerY - (anchorY + rect.top);
         return new SpineImage(imagePath, w, h, scale, offsetX, offsetY);
    }
}
