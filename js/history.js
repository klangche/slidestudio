// State persistence and history: save/undo/redo plus layer restore helpers.
import { layerState, canvasState, historyState, guidanceState } from './state.js';
import { updateSectionCount, updateResolutionDisplay, updateButtonStates } from './sections.js';
import { setInitialZoom } from './zoom.js';
import { updateGuidanceOverlay } from './guidance.js';
import { createResizeHandles, setupRotationHandler, adjustTextElementSize } from './ui-helpers.js';

// ENHANCED: Complete state saving function
export function saveState() {
    const state = {
        canvasState: JSON.parse(JSON.stringify(canvasState)),
        layers: [],
        timestamp: Date.now()
    };
    
    // Save all layers including their complete state
    state.layers = layerState.layers.map(function(layer) {
        const layerCopy = {
            id: layer.id,
            type: layer.type,
            zIndex: parseInt(layer.element.style.zIndex) || layer.zIndex,
            position: {
                left: parseInt(layer.element.style.left) || layer.position.left,
                top: parseInt(layer.element.style.top) || layer.position.top
            },
            rotation: layer.rotation || 0,
            visible: layer.element.style.display !== 'none',
            disabled: layer.element.style.pointerEvents === 'none'
        };
        
        if (layer.type === 'image') {
            layerCopy.size = {
                width: parseInt(layer.element.style.width) || layer.size.width,
                height: parseInt(layer.element.style.height) || layer.size.height
            };
            layerCopy.src = layer.src;
            layerCopy.naturalSize = JSON.parse(JSON.stringify(layer.naturalSize || layerCopy.size));
            layerCopy.aspectRatio = layer.aspectRatio || (layerCopy.size.width / layerCopy.size.height);
            layerCopy.transform = layer.element.style.transform;
            
            // Store crop data if present
            if (layer.cropData) {
                layerCopy.cropData = JSON.parse(JSON.stringify(layer.cropData));
            }
            
            // Store the actual image data for proper restoration
            const imgElement = layer.imageElement || layer.element.querySelector('img');
            if (imgElement && imgElement.src) {
                layerCopy.imageData = imgElement.src;
            }
        }
        
        if (layer.type === 'text') {
            layerCopy.textContent = layer.element.textContent || 'Text';
            layerCopy.fontSize = parseFloat(layer.element.style.fontSize) || layer.fontSize || 24;
            layerCopy.style = {
                fontFamily: layer.element.style.fontFamily || 'Arial',
                fontSize: layer.element.style.fontSize || '24px',
                color: layer.element.style.color || '#000000',
                fontWeight: layer.element.style.fontWeight || 'normal',
                fontStyle: layer.element.style.fontStyle || 'normal',
                textDecoration: layer.element.style.textDecoration || 'none',
                textAlign: layer.element.style.textAlign || 'left',
                backgroundColor: layer.element.style.backgroundColor || 'transparent'
            };
            layerCopy.size = {
                width: layer.element.offsetWidth || layer.size?.width || 100,
                height: layer.element.offsetHeight || layer.size?.height || 40
            };
        }
        
        return layerCopy;
    });
    
    // Only save if state has actually changed
    const lastState = historyState.undoStack[historyState.undoStack.length - 1];
    if (!lastState || JSON.stringify(state) !== JSON.stringify(lastState)) {
        historyState.undoStack.push(state);
        
        if (historyState.undoStack.length > historyState.maxHistory) {
            historyState.undoStack.shift();
        }
        
        historyState.redoStack = [];
        updateUndoRedoButtons();
    }
}

// Expose saveState globally so other modules can call it
window.saveState = saveState;

export function undo() {
    if (historyState.undoStack.length < 2) return;
    
    const currentState = historyState.undoStack.pop();
    historyState.redoStack.push(currentState);
    const previousState = historyState.undoStack[historyState.undoStack.length - 1];
    restoreState(previousState);
    updateUndoRedoButtons();
}

export function redo() {
    if (historyState.redoStack.length === 0) return;
    
    const nextState = historyState.redoStack.pop();
    historyState.undoStack.push(nextState);
    restoreState(nextState);
    updateUndoRedoButtons();
}

export function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('ss-undoBtn');
    const redoBtn = document.getElementById('ss-redoBtn');
    
    if (undoBtn) {
        if (historyState.undoStack.length > 1) {
            undoBtn.disabled = false;
            undoBtn.style.opacity = '0.7';
            undoBtn.style.cursor = 'pointer';
        } else {
            undoBtn.disabled = true;
            undoBtn.style.opacity = '0.3';
            undoBtn.style.cursor = 'not-allowed';
        }
    }
    
    if (redoBtn) {
        if (historyState.redoStack.length > 0) {
            redoBtn.disabled = false;
            redoBtn.style.opacity = '0.7';
            redoBtn.style.cursor = 'pointer';
        } else {
            redoBtn.disabled = true;
            redoBtn.style.opacity = '0.3';
            redoBtn.style.cursor = 'not-allowed';
        }
    }
}

// ENHANCED: Complete state restoration function
export function restoreState(state) {
    if (!state) return;
    
    // Restore canvas dimensions
    const parsedCanvasState = JSON.parse(JSON.stringify(state.canvasState));
    Object.keys(canvasState).forEach(function(key) { delete canvasState[key]; });
    Object.assign(canvasState, parsedCanvasState);
    
    updateSectionCount();
    updateResolutionDisplay();
    updateButtonStates();
    
    const designerCanvas = document.getElementById('ss-designer-canvas');
    if (designerCanvas) {
        designerCanvas.style.width = canvasState.width + 'px';
        designerCanvas.style.height = canvasState.height + 'px';
    }
    
    // Clear current layers
    layerState.layers = [];
    layerState.selectedLayer = null;
    layerState.nextZIndex = 10;
    
    // Clear canvas
    if (designerCanvas) {
        while (designerCanvas.firstChild) {
            if (designerCanvas.firstChild.id !== 'ss-guidance-overlay') {
                designerCanvas.removeChild(designerCanvas.firstChild);
            }
        }
    }
    
    // Restore layers
    if (state.layers && state.layers.length > 0) {
        state.layers.forEach(function(layerData) {
            if (layerData.type === 'image') {
                restoreImageLayer(layerData);
            } else if (layerData.type === 'text') {
                restoreTextLayer(layerData);
            }
        });
    }
    
    setInitialZoom();
    updateUndoRedoButtons();
    
    // Restore guidance if it was active
    if (guidanceState.active) {
        updateGuidanceOverlay();
    }
}

function restoreImageLayer(layerData) {
    const img = new Image();
    img.onload = function() {
        const imageContainer = document.createElement('div');
        imageContainer.className = 'ss-image-element';
        imageContainer.id = layerData.id;
        
        imageContainer.style.position = 'absolute';
        imageContainer.style.left = layerData.position.left + 'px';
        imageContainer.style.top = layerData.position.top + 'px';
        imageContainer.style.width = layerData.size.width + 'px';
        imageContainer.style.height = layerData.size.height + 'px';
        imageContainer.style.zIndex = layerData.zIndex;
        imageContainer.style.transform = layerData.transform || '';
        imageContainer.style.transformOrigin = 'center center';
        imageContainer.style.cursor = 'grab';
        imageContainer.style.overflow = 'visible';
        
        // Handle visibility and disabled state
        if (!layerData.visible) {
            imageContainer.style.display = 'none';
        }
        if (layerData.disabled) {
            imageContainer.style.pointerEvents = 'none';
        }
        
        const imageElement = document.createElement('img');
        imageElement.src = layerData.imageData || layerData.src;
        imageElement.style.width = '100%';
        imageElement.style.height = '100%';
        imageElement.style.objectFit = 'cover';
        imageElement.style.display = 'block';
        imageElement.style.pointerEvents = 'none';
        imageElement.style.position = 'absolute';
        imageElement.style.top = '0';
        imageElement.style.left = '0';
        
        const resizeHandles = createResizeHandles();
        
        imageContainer.appendChild(imageElement);
        imageContainer.appendChild(resizeHandles);
        
        const designerCanvas = document.getElementById('ss-designer-canvas');
        if (designerCanvas) {
            designerCanvas.appendChild(imageContainer);
        }
        
        const layer = {
            id: layerData.id,
            element: imageContainer,
            imageElement: imageElement,
            type: 'image',
            zIndex: layerData.zIndex,
            position: layerData.position,
            size: layerData.size,
            rotation: layerData.rotation,
            naturalSize: layerData.naturalSize,
            aspectRatio: layerData.aspectRatio,
            src: layerData.imageData || layerData.src,
            visible: layerData.visible,
            disabled: layerData.disabled,
            cropData: layerData.cropData ? JSON.parse(JSON.stringify(layerData.cropData)) : null
        };
        
        layerState.layers.push(layer);
        
        if (typeof window.makeElementDraggable === 'function') window.makeElementDraggable(imageContainer);
        if (typeof window.makeElementSelectable === 'function') window.makeElementSelectable(imageContainer);
        setupImageResizeHandlers(imageContainer);
        setupRotationHandler(imageContainer);
        
        // Apply crop data if present using SSImage utility
        if (typeof SSImage !== 'undefined' && SSImage.applyImageEffectsToElement) {
            SSImage.applyImageEffectsToElement(imageContainer, layer);
        }
        
        // Update nextZIndex if needed
        if (layerData.zIndex >= layerState.nextZIndex) {
            layerState.nextZIndex = layerData.zIndex + 1;
        }
    };
    
    img.onerror = function() {
        console.warn('Failed to load image for layer:', layerData.id);
        // Create a placeholder if image fails to load
        createImagePlaceholder(layerData);
    };
    
    img.src = layerData.imageData || layerData.src;
}

function createImagePlaceholder(layerData) {
    const placeholder = document.createElement('div');
    placeholder.className = 'ss-image-element ss-image-placeholder';
    placeholder.id = layerData.id;
    
    placeholder.style.position = 'absolute';
    placeholder.style.left = layerData.position.left + 'px';
    placeholder.style.top = layerData.position.top + 'px';
    placeholder.style.width = layerData.size.width + 'px';
    placeholder.style.height = layerData.size.height + 'px';
    placeholder.style.zIndex = layerData.zIndex;
    placeholder.style.backgroundColor = '#f0f0f0';
    placeholder.style.border = '2px dashed #ccc';
    placeholder.style.display = 'flex';
    placeholder.style.alignItems = 'center';
    placeholder.style.justifyContent = 'center';
    placeholder.style.color = '#999';
    placeholder.style.fontSize = '12px';
    placeholder.style.textAlign = 'center';
    placeholder.innerHTML = 'Image<br>Not Found';
    
    const resizeHandles = createResizeHandles();
    placeholder.appendChild(resizeHandles);
    
    const designerCanvas = document.getElementById('ss-designer-canvas');
    if (designerCanvas) {
        designerCanvas.appendChild(placeholder);
    }
    
    const layer = {
        id: layerData.id,
        element: placeholder,
        type: 'image',
        zIndex: layerData.zIndex,
        position: layerData.position,
        size: layerData.size,
        rotation: layerData.rotation,
        visible: layerData.visible,
        disabled: layerData.disabled
    };
    
    layerState.layers.push(layer);
    
    if (typeof window.makeElementDraggable === 'function') window.makeElementDraggable(placeholder);
    if (typeof window.makeElementSelectable === 'function') window.makeElementSelectable(placeholder);
    setupImageResizeHandlers(placeholder);
    setupRotationHandler(placeholder);
}

function restoreTextLayer(layerData) {
    const textElement = document.createElement('div');
    textElement.className = 'ss-text-element';
    textElement.id = layerData.id;
    textElement.contentEditable = true;
    
    textElement.textContent = layerData.textContent || 'Text';
    textElement.style.position = 'absolute';
    textElement.style.left = layerData.position.left + 'px';
    textElement.style.top = layerData.position.top + 'px';
    textElement.style.zIndex = layerData.zIndex;
    textElement.style.fontFamily = layerData.style.fontFamily || 'Arial';
    textElement.style.fontSize = layerData.fontSize + 'px';
    textElement.style.color = layerData.style.color || '#000000';
    textElement.style.fontWeight = layerData.style.fontWeight || 'normal';
    textElement.style.fontStyle = layerData.style.fontStyle || 'normal';
    textElement.style.textDecoration = layerData.style.textDecoration || 'none';
    textElement.style.textAlign = layerData.style.textAlign || 'left';
    textElement.style.backgroundColor = layerData.style.backgroundColor || 'transparent';
    textElement.style.padding = '10px';
    textElement.style.cursor = 'grab';
    textElement.style.width = layerData.size.width + 'px';
    textElement.style.height = layerData.size.height + 'px';
    textElement.style.outline = 'none';
    textElement.style.overflow = 'visible';
    textElement.style.transformOrigin = 'center center';
    textElement.style.transform = layerData.transform || '';
    textElement.style.whiteSpace = 'pre-wrap'; // Multi-line support
    textElement.style.wordWrap = 'break-word'; // Word breaking
    textElement.style.lineHeight = '1.2'; // Better multi-line spacing
    
    // Handle visibility and disabled state
    if (!layerData.visible) {
        textElement.style.display = 'none';
    }
    if (layerData.disabled) {
        textElement.style.pointerEvents = 'none';
    }
    
    const resizeHandles = createResizeHandles();
    textElement.appendChild(resizeHandles);
    
    const designerCanvas = document.getElementById('ss-designer-canvas');
    if (designerCanvas) {
        designerCanvas.appendChild(textElement);
    }
    
    const layer = {
        id: layerData.id,
        element: textElement,
        type: 'text',
        zIndex: layerData.zIndex,
        position: layerData.position,
        fontSize: layerData.fontSize,
        rotation: layerData.rotation,
        size: layerData.size,
        visible: layerData.visible,
        disabled: layerData.disabled
    };
    
    layerState.layers.push(layer);
    
    if (typeof window.makeElementDraggable === 'function') window.makeElementDraggable(textElement);
    if (typeof window.makeElementSelectable === 'function') window.makeElementSelectable(textElement);
    if (window.SSText && typeof SSText.setupTextResizeHandlers === 'function') SSText.setupTextResizeHandlers(textElement); else if (typeof setupTextResizeHandlers === 'function') setupTextResizeHandlers(textElement);
    setupRotationHandler(textElement);
    
    // Update nextZIndex if needed
    if (layerData.zIndex >= layerState.nextZIndex) {
        layerState.nextZIndex = layerData.zIndex + 1;
    }
    
    // Add input listener for text changes
    textElement.addEventListener('input', function() {
        adjustTextElementSize(textElement);
        saveState();
    });
    
    // Initial size adjustment
    setTimeout(() => adjustTextElementSize(textElement), 10);
}
