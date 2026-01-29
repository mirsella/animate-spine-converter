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
        const localCenterX = w / 2;
        const localCenterY = h / 2;

        const offset = ImageUtil.calculateAttachmentOffset(
            matrix,
            regPointX, regPointY,
            transPointX, transPointY,
            localCenterX, localCenterY,
            element.name || element.libraryItem?.name
        );

        return new SpineImage(imagePath, w, h, 1, offset.x, offset.y, localCenterX, localCenterY);
    }

    public static exportLibraryItem(imagePath:string, element:FlashElement, scale:number, exportImages:boolean):SpineImage {
        Logger.assert(element.libraryItem != null, `exportLibraryItem: element has no libraryItem`);
        return ImageUtil.exportSymbol(imagePath, element, fl.getDocumentDOM(), scale, exportImages);
    }

    public static exportInstance(imagePath:string, element:FlashElement, document:FlashDocument, scale:number, exportImages:boolean):SpineImage {
        // If the instance has filters, color effects, or is a specific "baking" candidate, we export from Stage.
        // Otherwise, we export from Library to handle reusability better.
        // For now, we prefer Stage export if there are ANY visual overrides, to ensure fidelity (e.g. Dash effects).
        const hasFilters = element.filters && element.filters.length > 0;
        const hasColor = element.colorMode && element.colorMode !== 'none';
        
        if (hasFilters || hasColor) {
            return ImageUtil.exportInstanceFromStage(imagePath, element, document, scale, exportImages);
        }
        
        Logger.assert(element.libraryItem != null, `exportInstance: element has no libraryItem. (type: ${element.elementType})`);
        return ImageUtil.exportSymbol(imagePath, element, document, scale, exportImages);
    }



    private static sleep(ms: number) {
        const start = new Date().getTime();
        while (new Date().getTime() < start + ms);
    }

    private static clearClipboard(): void {
        try {
            const blankDoc = fl.createDocument();
            blankDoc.width = 1;
            blankDoc.height = 1;
            blankDoc.addNewRectangle({left:0, top:0, right:1, bottom:1}, 0);
            blankDoc.selectAll();
            blankDoc.clipCopy();
            // Use try-catch for close to handle EDAPT or other plugin errors
            try {
                blankDoc.close(false);
            } catch (e) { /* ignore */ }
        } catch (e) {
            Logger.warning(`[ImageUtil] Failed to clear clipboard: ${e}`);
        }
    }

    private static regainFocus(dom: FlashDocument): void {
        try {
            // Strategy 1: Explicitly make the target document active
            if ((dom as any).makeActive) {
                try {
                    (dom as any).makeActive();
                } catch (e) { /* ignore */ }
            }
            
            // Strategy 2: If the active DOM is not our target, try to switch
            const current = fl.getDocumentDOM();
            if (current && current.name !== dom.name) {
                // Try to focus by opening/closing a dummy if makeActive didn't work effectively? 
                // Or just rely on the retry.
            }
        } catch (e) {
            Logger.warning(`[ImageUtil] regainFocus failed: ${e}`);
        }
    }

    private static exportInstanceFromStage(imagePath:string, element:FlashElement, document:FlashDocument, scale:number, exportImages:boolean):SpineImage {
        const matrix = element.matrix;
        const transPointX = element.transformX;
        const transPointY = element.transformY;
        const regPointX = matrix.tx;
        const regPointY = matrix.ty;

        const dom = document; 
        const layer = element.layer;
        const wasLocked = layer.locked;
        const wasVisible = layer.visible;
        
        layer.locked = false;
        layer.visible = true;

        // Ensure we are focused on the right document before selection
        ImageUtil.regainFocus(dom);

        // Explicitly clear frame selection to ensure we are in Object Selection mode
        try {
            dom.getTimeline().setSelectedFrames([]);
        } catch (e) {
            try { dom.getTimeline().setSelectedFrames(0, 0); dom.selectNone(); } catch(e2) {}
        }

        dom.selectNone();
        element.selected = true;
        
        let copySuccess = false;
        
        // Retry loop for clipCopy
        for (let attempt = 0; attempt < 4; attempt++) {
            try {
                // Ensure selection is fresh
                if (attempt > 0) {
                    ImageUtil.regainFocus(dom);
                    // Force re-selection sequence
                    dom.selectNone();
                    try { dom.getTimeline().setSelectedFrames([]); } catch(e) {}
                    
                    // Try alternative selection method
                    if (attempt % 2 === 1) {
                        dom.selection = [element];
                    } else {
                        element.selected = true;
                    }
                    
                    // Verify selection
                    if (dom.selection.length === 0) {
                         // Force frame selection reset again
                         try { 
                             const tl = dom.getTimeline();
                             // Refresh frame (assignment to itself forces update in JSFL)
                             const cf = tl.currentFrame;
                             tl.currentFrame = cf;
                         } catch(e) {}
                         
                         // Try assignment again if element.selected = true failed
                         try { dom.selection = [element]; } catch(e) { element.selected = true; }
                    }
                    
                    ImageUtil.sleep(200 + (attempt * 100)); // Increased backoff
                }
                
                        if (dom.selection.length > 0) {
                            dom.clipCopy();
                            copySuccess = true;
                            // Logger.trace(`[ImageUtil] exportInstanceFromStage: Success on attempt ${attempt+1}`);
                            break;
                        } else {
                            if (attempt === 0) {
                                 // First attempt failed. Try assignment fallback immediately
                                try { dom.selection = [element]; } catch(e){}
                                if (dom.selection.length > 0) {
                                    dom.clipCopy();
                                    copySuccess = true;
                                    break;
                                }
                                Logger.warning(`[ImageUtil] exportInstanceFromStage: Selection empty (attempt ${attempt+1}). Layer: ${layer.name}`);
                            }
                        }
            } catch (e) {
                Logger.warning(`[ImageUtil] exportInstanceFromStage: clipCopy failed (attempt ${attempt+1}/4): ${e}.`);
                ImageUtil.clearClipboard();
            }
        }
        
        element.selected = false;
        layer.locked = wasLocked;
        layer.visible = wasVisible;

        if (!copySuccess) {
            Logger.error(`[ImageUtil] exportInstanceFromStage: Failed to copy element after retries. Element: ${element.name}`);
            return new SpineImage(imagePath, 1, 1, scale, 0, 0);
        }

        try {
            const tempDoc = fl.createDocument();
            try {
                tempDoc.clipPaste(true);
                
                let w = 1;
                let h = 1;
                let localCenterX = 0;
                let localCenterY = 0;

                if (tempDoc.selection.length > 0) {
                    const pasted = tempDoc.selection[0];
                    
                    // --- SANITIZATION STEP ---
                    // If the pasted element is a Symbol Instance, we must clean its internal timeline 
                    // (remove hidden layers) to prevent "Full Asset" glitches where hidden reference layers appear.
                    if (pasted.elementType === 'instance' && pasted.instanceType === 'symbol' && pasted.libraryItem) {
                        try {
                            // Ensure the temp document is active for editing
                            if ((tempDoc as any).makeActive) {
                                try { (tempDoc as any).makeActive(); } catch (e) {}
                            }
                            
                            // Select the instance to ensure context
                            tempDoc.selectNone();
                            pasted.selected = true;
                            
                            // Enter the symbol in place
                            const libItem = pasted.libraryItem;
                            const itemName = libItem.name;
                            // Note: We use the library item name to edit.
                            tempDoc.library.editItem(itemName);
                            
                            const subTimeline = tempDoc.getTimeline();
                            // Iterate backwards to delete hidden/guide layers
                            let modified = false;
                            for (let i = subTimeline.layers.length - 1; i >= 0; i--) {
                                const lay = subTimeline.layers[i];
                                const shouldDelete = lay.layerType === 'guide' || !lay.visible;
                                if (shouldDelete) {
                                    // Logger.trace(`[ImageUtil] Sanitizing: Deleting layer '${lay.name}' (visible=${lay.visible}, type=${lay.layerType}) in '${itemName}'`);
                                    subTimeline.deleteLayer(i);
                                    modified = true;
                                }
                            }
                            
                            // Exit editing mode to return to Main Timeline of temp doc
                            tempDoc.exitEditMode();
                            
                            // Re-select the pasted instance if edit mode cleared selection
                            if (modified) {
                                tempDoc.selectAll();
                            } else {
                                // If nothing was modified, ensure selection is active
                                if (tempDoc.selection.length === 0) {
                                    pasted.selected = true;
                                }
                            }
                        } catch (eSanitize) {
                            Logger.warning(`[ImageUtil] Failed to sanitize temp symbol: ${eSanitize}`);
                            try { tempDoc.exitEditMode(); } catch(e) {}
                        }
                    }
                    // -------------------------

                    // Re-fetch selection[0] as editing might have changed reference
                    if (tempDoc.selection.length > 0) {
                        const finalPasted = tempDoc.selection[0];
                        
                        // Disable cacheAsBitmap on the final instance too
                        if (finalPasted.elementType === 'instance') {
                             (finalPasted as any).cacheAsBitmap = false;
                        }

                        // RESET MATRIX TO IDENTITY (removes skew/scale/rotation, BUT keeps filters/color effects)
                        finalPasted.matrix = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
                        
                        const rect = tempDoc.getSelectionRect();
                        const width = rect.right - rect.left;
                        const height = rect.bottom - rect.top;
                        
                        w = Math.max(1, Math.ceil(width * scale));
                        h = Math.max(1, Math.ceil(height * scale));
                        
                        localCenterX = rect.left + width / 2;
                        localCenterY = rect.top + height / 2;

                        if (exportImages) {
                            tempDoc.width = w;
                            tempDoc.height = h;
                            
                            if (scale !== 1) {
                                finalPasted.scaleX = scale;
                                finalPasted.scaleY = scale;
                            }
                            
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
                }
                
                const offset = ImageUtil.calculateAttachmentOffset(
                    matrix, 
                    regPointX, regPointY, 
                    transPointX, transPointY, 
                    localCenterX, localCenterY,
                    element.name || element.libraryItem?.name
                );

                return new SpineImage(imagePath, w, h, scale, offset.x, offset.y, localCenterX, localCenterY);

            } finally {
                try {
                    tempDoc.close(false);
                } catch (eClose) {
                    Logger.warning(`[ImageUtil] Failed to close temp document (exportInstanceFromStage): ${eClose}`);
                }
            }
        } catch (eDoc) {
            Logger.error(`[ImageUtil] Error during temp document processing: ${eDoc}`);
            return new SpineImage(imagePath, 1, 1, scale, 0, 0);
        }
    }

    public static exportShape(imagePath:string, element:FlashElement, document:FlashDocument, scale:number, exportImages:boolean):SpineImage {
        const matrix = element.matrix;
        const transPointX = element.transformX;
        const transPointY = element.transformY;
        const regPointX = matrix.tx;
        const regPointY = matrix.ty;

        const dom = document; 
        const timeline = dom.getTimeline();
        const originalFrame = timeline.currentFrame;
        const layer = element.layer;
        const wasLocked = layer.locked;
        const wasVisible = layer.visible;
        
        layer.locked = false;
        layer.visible = true;

        ImageUtil.regainFocus(dom);
        
        // Explicitly clear frame selection
        try {
            timeline.setSelectedFrames([]);
        } catch (e) { 
            try { timeline.setSelectedFrames(0, 0); dom.selectNone(); } catch(e2) {}
        }

        dom.selectNone();
        element.selected = true;
        
        let copySuccess = false;
        
        // Retry loop for clipCopy
        for (let attempt = 0; attempt < 4; attempt++) {
            try {
                if (attempt > 0) {
                    ImageUtil.regainFocus(dom);
                    // Ensure we are still on the correct frame
                    if (timeline.currentFrame !== originalFrame) {
                        timeline.currentFrame = originalFrame;
                    }
                    try { timeline.setSelectedFrames([]); } catch(e) {}
                    dom.selectNone();
                    
                    // Try alternative selection method
                    if (attempt % 2 === 1) {
                        dom.selection = [element];
                    } else {
                        element.selected = true;
                    }
                    
                    // If selection is still empty and it's a shape on a specific layer, 
                    // and it's likely the only thing there or we are desperate:
                    if (dom.selection.length === 0 && element.elementType === 'shape') {
                         // Try selecting the layer's frame content?
                         // Careful not to select whole frame duration
                    }

                    ImageUtil.sleep(100 + (attempt * 100));
                }

                if (dom.selection.length > 0) {
                    dom.clipCopy();
                    copySuccess = true;
                    // Logger.trace(`[ImageUtil] exportShape: Success on attempt ${attempt+1}`);
                    break;
                } else {
                    if (attempt === 0) {
                        // First attempt failed. Try assignment fallback immediately before logging/sleeping
                        try { dom.selection = [element]; } catch(e){}
                        if (dom.selection.length > 0) {
                            dom.clipCopy();
                            copySuccess = true;
                            break;
                        }
                        Logger.warning(`[ImageUtil] exportShape: Selection empty on layer '${layer.name}' (attempt ${attempt+1}). Element type: ${element.elementType}`);
                    }
                }
            } catch (e) {
                Logger.warning(`[ImageUtil] exportShape: clipCopy failed (attempt ${attempt+1}/4): ${e}.`);
                ImageUtil.clearClipboard();
            }
        }
        
        element.selected = false;
        layer.locked = wasLocked;
        layer.visible = wasVisible;

        if (!copySuccess) {
            Logger.error(`[ImageUtil] exportShape: Failed to copy element after retries. Layer: '${layer.name}'`);
            return new SpineImage(imagePath, 1, 1, scale, 0, 0);
        }

        // Paste into a temp document
        const tempDoc = fl.createDocument();
        try {
            tempDoc.clipPaste(true);
            
            let w = 1;
            let h = 1;
            let localCenterX = 0;
            let localCenterY = 0;

            if (tempDoc.selection.length > 0) {
                const pasted = tempDoc.selection[0];
                
                // RESET MATRIX TO IDENTITY
                pasted.matrix = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
                
                // Measure the normalized shape
                const rect = tempDoc.getSelectionRect();
                const width = rect.right - rect.left;
                const height = rect.bottom - rect.top;
                
                w = Math.max(1, Math.ceil(width * scale));
                h = Math.max(1, Math.ceil(height * scale));
                
                localCenterX = rect.left + width / 2;
                localCenterY = rect.top + height / 2;
                
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
            
            const offset = ImageUtil.calculateAttachmentOffset(
                matrix, 
                regPointX, regPointY, 
                transPointX, transPointY, 
                localCenterX, localCenterY
            );

            return new SpineImage(imagePath, w, h, scale, offset.x, offset.y, localCenterX, localCenterY);
        } finally {
            try {
                tempDoc.close(false);
            } catch (e) { /* ignore */ }
        }
    }



    private static exportSymbol(imagePath:string, element:FlashElement, document:FlashDocument, scale:number, exportImages:boolean):SpineImage {
        const item = element.libraryItem;

        // Capture geometric properties BEFORE switching context
        const regPointX = element.x;
        const regPointY = element.y;
        const transPointX = element.transformX;
        const transPointY = element.transformY;
        const matrix = element.matrix;

        // SAFE EXPORT STRATEGY: Duplicate the symbol, clean it up (delete hidden layers), export, then delete duplicate.
        // This avoids modifying the original symbol's layer visibility/locking state and ensures 'selectAll' only grabs what we want.
        
        const lib = document.library;
        const originalName = item.name;
        
        // 1. Select and Duplicate
        lib.selectItem(originalName);
        if (!lib.duplicateItem(originalName)) {
            Logger.error(`[ImageUtil] Failed to duplicate symbol '${originalName}' for export.`);
            return new SpineImage(imagePath, 1, 1, scale, 0, 0);
        }
        
        // The duplicate is now selected and named "Copy of ..." or similar.
        const duplicateItem = lib.getSelectedItems()[0];
        const tempSymbolName = duplicateItem.name;
        
        // 2. Edit the Duplicate
        lib.editItem(tempSymbolName);
        const dom = fl.getDocumentDOM();
        const timeline = dom.getTimeline();
        
        // 3. Clean up Layers (Delete hidden/guide layers)
        // Iterate backwards to avoid index issues when deleting
        for (let i = timeline.layers.length - 1; i >= 0; i--) {
            const layer = timeline.layers[i];
            if (layer.layerType === 'guide' || !layer.visible) {
                timeline.deleteLayer(i);
            } else {
                // Ensure remaining visible layers are unlocked
                layer.locked = false;
            }
        }
        
        // 4. Select All (Now safe because only visible renderable content remains)
        dom.selectAll();
        
        // Calculate offsets
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
        
        const localCenterX = rect.left + width / 2;
        const localCenterY = rect.top + height / 2;

        const offset = ImageUtil.calculateAttachmentOffset(
            matrix, 
            regPointX, regPointY, 
            transPointX, transPointY, 
            localCenterX, localCenterY
        );

        if (exportImages && dom.selection.length > 0) {
            let copySuccess = false;
            // Retry loop
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    if (attempt > 0) ImageUtil.sleep(50);
                    dom.clipCopy();
                    copySuccess = true;
                    break;
                } catch (e) {
                    Logger.warning(`[ImageUtil] exportSymbol: clipCopy failed (attempt ${attempt+1}/3): ${e}`);
                    ImageUtil.clearClipboard();
                    // Select again just in case
                    dom.selectAll();
                }
            }

            if (copySuccess) {
                const tempDoc = fl.createDocument();
                try {
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
                } finally {
                    try { tempDoc.close(false); } catch(e) {}
                }
            }
        }

        // 5. Cleanup
        dom.exitEditMode();
        lib.deleteItem(tempSymbolName);
        
        return new SpineImage(imagePath, w, h, scale, offset.x, offset.y, localCenterX, localCenterY);
    }

    /**
     * Calculates the Attachment Offset using the "Smart Pivot" algorithm.
     * Uses explicit matrix inversion to map the World Space offset vector back into the
     * Bone's Local Space.
     */
    public static calculateAttachmentOffset(
        matrix: FlashMatrix,
        regPointX: number, regPointY: number,
        transPointX: number, transPointY: number,
        localCenterX: number, localCenterY: number,
        debugName?: string
    ): { x: number, y: number } {
        // 1. Vector from Bone Origin (Trans Point) to Reg Point (in Parent Space)
        const dx = regPointX - transPointX;
        const dy = regPointY - transPointY;

        // 2. Inverse Matrix Calculation
        const a = matrix.a;
        const b = matrix.b;
        const c = matrix.c;
        const d = matrix.d;
        
        const det = a * d - b * c;
        
        if (Math.abs(det) < 0.000001) {
            Logger.warning(`[ImageUtil] Singular matrix for ${debugName || 'unknown'}. Using center.`);
            return { x: localCenterX, y: localCenterY };
        }

        const invDet = 1.0 / det;
        
        // Apply Inverse Matrix
        const localRx = (d * dx - c * dy) * invDet;
        const localRy = (-b * dx + a * dy) * invDet;

        // 3. Add Image Center Offset
        const finalX = localRx + localCenterX;
        const finalY = localRy + localCenterY;

        return { x: finalX, y: finalY };
    }

    // Helper for legacy/other paths
    public static exportSelectionOnly(imagePath:string, dom:FlashDocument, scale:number, exportImages:boolean, anchorX:number, anchorY:number, element:FlashElement, options?: any):SpineImage {
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
        
        return new SpineImage(imagePath, w, h, scale, offsetX, offsetY, localCenterX, localCenterY);
    }
    
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
         return new SpineImage(imagePath, w, h, scale, offsetX, offsetY, centerX, centerY);
    }
}
