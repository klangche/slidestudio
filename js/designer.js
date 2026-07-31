// Designer Canvas Implementation - FIXED VERSION
import { layerState } from './state.js';

document.addEventListener('DOMContentLoaded', function() {
    initializeDesignerWorkspace();
});

// Global state for canvas dimensions and sections
let canvasState = {
    width: 1080,
    height: 1920,
    sections: 1,
    minSections: 1,
    maxSections: 20 // Changed from 1000 to 20
};

// Guidance system state
let guidanceState = {
    active: false,
    guidelines: {
        square: { width: 1080, height: 1080, ratio: '1:1', name: 'Square' },
        portrait: { width: 1080, height: 1350, ratio: '4:5', name: 'Portrait' },
        stories: { width: 1080, height: 1920, ratio: '9:16', name: 'Stories' }
    }
};

// Magnet state
let magnetState = {
    active: true
};

// Zoom state
let zoomState = {
    isOver50Percent: false
};

// Undo/Redo state
let historyState = {
    undoStack: [],
    redoStack: [],
    maxHistory: 1000
};

// Free Move State
let freeMoveState = {
    active: false,
    isMoving: false,
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    startScrollTop: 0
};

// Guidance overlay reference
let guidanceOverlay = null;

// Simple drag state
let dragState = {
    isDragging: false,
    dragElement: null,
    startX: 0,
    startY: 0,
    elementStartX: 0,
    elementStartY: 0
};

// Keyboard movement state
let keyboardMoveState = {
    active: false,
    interval: null,
    acceleration: false,
    accelerationTimeout: null,
    baseSpeed: 1,
    acceleratedSpeed: 2
};

// Multi-select state (moved from imgtxt.js here so selection logic is centralized)
let multiSelectState = {
    active: false,
    selected: []
};

function initializeDesignerWorkspace() {
    console.log('Initializing designer workspace...');
    
    const workspace = document.getElementById('ss-workspace');
    const workspacePlaceholder = document.getElementById('ss-workspacePlaceholder');
    const canvasContainer = document.getElementById('ss-canvasContainer');
    
    if (!workspace || !workspacePlaceholder || !canvasContainer) {
        console.error('Required DOM elements not found');
        return;
    }
    
    workspacePlaceholder.style.display = 'none';
    canvasContainer.style.display = 'flex';
    canvasContainer.style.overflow = 'hidden';
    
    createDesignerCanvas();
    initializeZoomFunctionality();
    initializeDesignerEventListeners();
    setInitialZoom();
    updateSectionCount();
    updateResolutionDisplay();
    updateButtonStates();
    initializeColorPicker();
    initializeUploadFunctionality();
    updateUndoRedoButtons();
    initializeTransparencySlider();
    initializeMagnetButton();
    initializeKeyboardMovement();
    initializeGlobalClickHandler();
    
    // So-Me Guides and Snap are enabled by default on page load
    const guidanceBtn = document.getElementById('ss-guidanceBtn');
    if (guidanceBtn) guidanceBtn.classList.add('ss-active');
    guidanceState.active = true;
    createEnhancedGuidanceOverlay();
    
    // Enable transparency slider (guides are active by default)
    const transparencySliderContainer = document.querySelector('#ss-transparencySlider').closest('.ss-slider-container');
    if (transparencySliderContainer) {
        transparencySliderContainer.classList.remove('ss-disabled');
    }
    
    saveState();
    
    console.log('Designer workspace initialized successfully');
}

// Drag functions migrated from imgtxt.js to central designer module
function handleDragMove(e) {
    if (!dragState.isDragging || !dragState.dragElement) return;
    const deltaX = e.clientX - dragState.startX;
    const deltaY = e.clientY - dragState.startY;
    const designerCanvas = document.getElementById('ss-designer-canvas');
    let canvasScale = 1;
    try {
        const computedTransform = window.getComputedStyle(designerCanvas).transform || '';
        if (computedTransform && computedTransform !== 'none') {
            const values = computedTransform.split('(')[1].split(')')[0].split(',');
            // matrix(a, b, c, d, e, f) -> scaleX is a, scaleY is d
            const a = parseFloat(values[0]);
            const d = parseFloat(values[3]);
            if (!isNaN(a) && a !== 0) canvasScale = a;
            else if (!isNaN(d) && d !== 0) canvasScale = d;
        }
    } catch (err) { canvasScale = 1; }
    let newX = dragState.elementStartX + (deltaX / canvasScale);
    let newY = dragState.elementStartY + (deltaY / canvasScale);
    if (magnetState.active) {
        const elementWidth = dragState.dragElement.offsetWidth;
        const elementHeight = dragState.dragElement.offsetHeight;
        const snapped = snapToGuidelines(newX, newY, elementWidth, elementHeight);
        newX = snapped.x;
        newY = snapped.y;
    }
    dragState.dragElement.style.left = newX + 'px';
    dragState.dragElement.style.top = newY + 'px';
    const layerIndex = layerState.layers.findIndex(function(layer) { return layer.element === dragState.dragElement; });
    if (layerIndex !== -1) {
        const layer = layerState.layers[layerIndex];
        if (layer.parentPolaroid) {
            const pol = layerState.layers.find(l => l.id === layer.parentPolaroid);
            if (pol) {
                const windowOffsetLeft = 45;
                const windowOffsetTop = 90;
                try {
                    const polEl = pol.element;
                    const win = polEl ? polEl.querySelector('.ss-polaroid-window') : null;
                    if (win) {
                        const winW = parseInt(win.style.width || win.offsetWidth) || 790;
                        const winH = parseInt(win.style.height || win.offsetHeight) || 790;
                        const innerW = dragState.dragElement.offsetWidth || 0;
                        const innerH = dragState.dragElement.offsetHeight || 0;
                        const pad = 10;
                        const minLeft = Math.min(0, winW - innerW) - pad;
                        const maxLeft = Math.max(0, winW - 10) + pad;
                        const minTop = Math.min(0, winH - innerH) - pad;
                        const maxTop = Math.max(0, winH - 10) + pad;
                        newX = Math.max(minLeft, Math.min(maxLeft, newX));
                        newY = Math.max(minTop, Math.min(maxTop, newY));
                    }
                } catch (err) {}
                const absLeft = (pol.position && pol.position.left ? pol.position.left : 0) + windowOffsetLeft + newX;
                const absTop = (pol.position && pol.position.top ? pol.position.top : 0) + windowOffsetTop + newY;
                layerState.layers[layerIndex].position = { left: absLeft, top: absTop };
            } else {
                layerState.layers[layerIndex].position = { left: newX, top: newY };
            }
        } else {
            layerState.layers[layerIndex].position = { left: newX, top: newY };
        }
        try {
            if (layer && layer.type === 'group' && Array.isArray(layer.children)) {
                layerState.layers[layerIndex].position = { left: newX, top: newY };
                layer.children.forEach(function(childId) {
                    const cIdx = layerState.layers.findIndex(l => l.id === childId);
                    if (cIdx === -1) return;
                    const childLayer = layerState.layers[cIdx];
                    const childEl = childLayer.element;
                    if (!childEl) return;
                    const relLeft = parseInt(childEl.style.left) || 0;
                    const relTop = parseInt(childEl.style.top) || 0;
                    const absLeft = newX + relLeft;
                    const absTop = newY + relTop;
                    childLayer.position = { left: absLeft, top: absTop };
                    layerState.layers[cIdx] = childLayer;
                });
            }
        } catch (err) {
            if (window.SS_DEBUG_POLAROID) console.debug('Error updating group child positions', err);
        }
    }
}

function handleDragEnd(e) {
    if (!dragState.isDragging) return;
    if (magnetState.active && dragState.dragElement) {
        const element = dragState.dragElement;
        const currentX = parseInt(element.style.left) || 0;
        const currentY = parseInt(element.style.top) || 0;
        const elementWidth = element.offsetWidth;
        const elementHeight = element.offsetHeight;
        const snapped = snapToGuidelines(currentX, currentY, elementWidth, elementHeight);
        element.style.left = snapped.x + 'px';
        element.style.top = snapped.y + 'px';
        const layerIndex = layerState.layers.findIndex(function(layer) { return layer.element === element; });
        if (layerIndex !== -1) layerState.layers[layerIndex].position = { left: snapped.x, top: snapped.y };
    }
    if (dragState.dragElement) {
        dragState.dragElement.style.cursor = 'grab';
        dragState.dragElement.style.boxShadow = '';
        if (dragState.dragElement.classList.contains('selected')) {
            const resizeHandles = getResizeHandlesForElement(dragState.dragElement);
            if (resizeHandles) resizeHandles.style.display = 'block';
        }
        try { if (e && typeof e.pointerId !== 'undefined') dragState.dragElement.releasePointerCapture && dragState.dragElement.releasePointerCapture(e.pointerId); } catch (err) {}
    }
    dragState.isDragging = false;
    dragState.dragElement = null;
    // Remove both pointer and mouse listeners (fallback)
    document.removeEventListener('pointermove', handleDragMove);
    document.removeEventListener('pointerup', handleDragEnd);
    document.removeEventListener('pointercancel', handleDragEnd);
    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('mouseup', handleDragEnd);
    document.body.style.userSelect = '';
    if (typeof window.saveState === 'function') saveState();
}

function createDesignerCanvas() {
    const canvasContainer = document.getElementById('ss-canvasContainer');
    
    if (!canvasContainer) {
        console.error('Canvas container not found');
        return;
    }
    
    const existingCanvas = document.getElementById('ss-designer-canvas');
    if (existingCanvas) {
        existingCanvas.remove();
    }
    
    const designerCanvas = document.createElement('div');
    designerCanvas.id = 'ss-designer-canvas';
    designerCanvas.className = 'ss-designer-canvas';
    
    designerCanvas.style.width = canvasState.width + 'px';
    designerCanvas.style.height = canvasState.height + 'px';
    designerCanvas.style.backgroundColor = '#ffffff';
    designerCanvas.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.15)';
    designerCanvas.style.border = '1px solid var(--ss-border-color)';
    designerCanvas.style.position = 'relative';
    designerCanvas.style.transformOrigin = 'center center';
    designerCanvas.style.flexShrink = '0';
    designerCanvas.style.zIndex = '1';
    designerCanvas.style.overflow = 'hidden';
    
    canvasContainer.appendChild(designerCanvas);
    console.log('Designer canvas created with dimensions:', canvasState.width, 'x', canvasState.height);
    // If other modules were waiting for canvas, notify via event
    document.dispatchEvent(new CustomEvent('ss-designer-canvas-ready'));
}

function initializeZoomFunctionality() {
    console.log('Initializing zoom functionality...');
    
    const sliderThumb = document.getElementById('ss-sliderThumb');
    const sliderFill = document.getElementById('ss-sliderFill');
    const slider = document.getElementById('ss-slider');
    
    if (!sliderThumb || !sliderFill || !slider) {
        console.error('Zoom slider elements not found');
        return;
    }
    
    let zoomLevel = 0.5;
    updateZoomVisuals(zoomLevel);
    setupSliderInteraction(sliderThumb, sliderFill, slider, zoomLevel);
    setupSliderTicks(slider, zoomLevel);
    initializeGestureZoom();
}

function setupSliderInteraction(sliderThumb, sliderFill, slider, initialZoom) {
    let isDragging = false;
    let currentZoom = initialZoom;
    
    sliderThumb.addEventListener('mousedown', startDrag);
    sliderThumb.addEventListener('touchstart', function(e) {
        e.preventDefault();
        startDrag(e.touches[0]);
    });
    
    function startDrag(e) {
        isDragging = true;
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('touchmove', onTouchDrag);
        document.addEventListener('mouseup', stopDrag);
        document.addEventListener('touchend', stopDrag);
        e.preventDefault();
    }
    
    function onDrag(e) {
        if (!isDragging) return;
        updateZoomFromPosition(e.clientX);
    }
    
    function onTouchDrag(e) {
        if (!isDragging) return;
        updateZoomFromPosition(e.touches[0].clientX);
    }
    
    function stopDrag() {
        isDragging = false;
        document.removeEventListener('mousemove', onDrag);
        document.removeEventListener('touchmove', onTouchDrag);
        document.removeEventListener('mouseup', stopDrag);
        document.removeEventListener('touchend', stopDrag);
    }
    
    function updateZoomFromPosition(clientX) {
        const sliderRect = slider.getBoundingClientRect();
        let position = (clientX - sliderRect.left) / sliderRect.width;
        position = Math.max(0, Math.min(1, position));
        currentZoom = position;
        updateZoomVisuals(currentZoom);
        updateCanvasZoom();
    }
    
    slider.addEventListener('click', function(e) {
        const sliderRect = slider.getBoundingClientRect();
        let position = (e.clientX - sliderRect.left) / sliderRect.width;
        position = Math.max(0, Math.min(1, position));
        currentZoom = position;
        updateZoomVisuals(currentZoom);
        updateCanvasZoom();
    });
    
    slider.addEventListener('wheel', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const zoomDelta = e.deltaY > 0 ? -0.05 : 0.05;
        adjustZoomLevel(zoomDelta);
    });
}

function setupSliderTicks(slider, currentZoom) {
    const ticks = slider.querySelectorAll('.ss-tick');
    ticks.forEach(function(tick, index) {
        tick.addEventListener('click', function(e) {
            e.stopPropagation();
            const zoomLevel = index / (ticks.length - 1);
            updateZoomVisuals(zoomLevel);
            updateCanvasZoom();
        });
    });
}

function updateZoomVisuals(zoomLevel) {
    const sliderThumb = document.getElementById('ss-sliderThumb');
    const sliderFill = document.getElementById('ss-sliderFill');
    const zoomValue = document.getElementById('ss-zoomValue');
    
    if (!sliderThumb || !sliderFill) return;
    
    const thumbPosition = zoomLevel * 100;
    sliderThumb.style.left = thumbPosition + '%';
    sliderFill.style.width = thumbPosition + '%';
    
    if (zoomValue) {
        const minScale = 0.05;
        const maxScale = 0.5;
        const displayValue = Math.round((minScale + (zoomLevel * (maxScale - minScale))) * 100);
        zoomValue.textContent = displayValue + '%';
        
        const isOver50 = displayValue > 50;
        if (isOver50 !== zoomState.isOver50Percent) {
            zoomState.isOver50Percent = isOver50;
            if (isOver50) {
                zoomValue.style.color = '#e74c3c';
                sliderFill.style.background = '#e74c3c';
                sliderThumb.style.background = '#e74c3c';
            } else {
                zoomValue.style.color = '';
                sliderFill.style.background = '';
                sliderThumb.style.background = '';
            }
        }
    }
}

function updateCanvasZoom() {
    const designerCanvas = document.getElementById('ss-designer-canvas');
    const sliderThumb = document.getElementById('ss-sliderThumb');
    
    if (!designerCanvas || !sliderThumb) return;
    
    const thumbPosition = parseFloat(sliderThumb.style.left) / 100;
    const minScale = 0.05;
    const maxScale = 0.5;
    const scale = minScale + (thumbPosition * (maxScale - minScale));
    
    designerCanvas.style.transform = 'scale(' + scale + ')';
    designerCanvas.style.width = canvasState.width + 'px';
    designerCanvas.style.height = canvasState.height + 'px';
}

function setInitialZoom() {
    const canvasContainer = document.getElementById('ss-canvasContainer');
    const designerCanvas = document.getElementById('ss-designer-canvas');
    
    if (!canvasContainer || !designerCanvas) {
        console.error('Canvas container or designer canvas not found for zoom');
        return;
    }
    
    const containerWidth = canvasContainer.clientWidth;
    const containerHeight = canvasContainer.clientHeight;
    
    if (containerWidth === 0 || containerHeight === 0) {
        console.warn('Canvas container has zero dimensions, retrying...');
        setTimeout(setInitialZoom, 100);
        return;
    }
    
    const canvasWidth = canvasState.width;
    const canvasHeight = canvasState.height;
    const padding = 40;
    const availableWidth = containerWidth - padding;
    const availableHeight = containerHeight - padding;
    const scaleX = availableWidth / canvasWidth;
    const scaleY = availableHeight / canvasHeight;
    const initialScale = Math.min(scaleX, scaleY);
    const clampedScale = Math.max(0.05, Math.min(initialScale, 0.5));
    const minScale = 0.05;
    const maxScale = 0.5;
    const sliderPosition = (clampedScale - minScale) / (maxScale - minScale);
    
    updateZoomVisuals(sliderPosition);
    designerCanvas.style.transform = 'scale(' + clampedScale + ')';
    
    console.log('Initial zoom set to:', clampedScale, 'slider position:', sliderPosition);
}

function initializeGestureZoom() {
    const canvasContainer = document.getElementById('ss-canvasContainer');
    const designerCanvas = document.getElementById('ss-designer-canvas');
    
    if (!canvasContainer || !designerCanvas) return;
    
    let initialDistance = null;
    let lastZoomLevel = getCurrentZoomLevel();
    
    // Always zoom to pointer location on wheel when over canvas
    [canvasContainer, designerCanvas].forEach(function(element) {
        element.addEventListener('wheel', function(e) {
            e.preventDefault();
            e.stopPropagation();
            // Use a sensible delta and snap to slider range
            const zoomDelta = e.deltaY > 0 ? -0.05 : 0.05;
            const currentZoom = getCurrentZoomLevel();
            const newZoom = Math.max(0.05, Math.min(1, currentZoom + zoomDelta));
            // Zoom centered at mouse pointer
            setZoomLevel(newZoom, e.clientX, e.clientY);
        }, { passive: false });
    });
    
    [canvasContainer, designerCanvas].forEach(function(element) {
        element.addEventListener('touchstart', function(e) {
            if (e.touches.length === 2) {
                initialDistance = getTouchDistance(e.touches);
                lastZoomLevel = getCurrentZoomLevel();
                e.preventDefault();
            }
        });
        
        element.addEventListener('touchmove', function(e) {
            if (e.touches.length === 2) {
                const currentDistance = getTouchDistance(e.touches);
                if (initialDistance !== null) {
                    const scale = currentDistance / initialDistance;
                    const zoomDelta = (scale - 1) * 0.3;
                    let newZoomLevel = Math.max(0, Math.min(1, lastZoomLevel + zoomDelta));
                    // compute midpoint of the two touches so we zoom to that focal point
                    const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
                    const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
                    setZoomLevel(newZoomLevel, midX, midY);
                }
                e.preventDefault();
            }
        });
        
        element.addEventListener('touchend', function(e) {
            if (e.touches.length < 2) {
                initialDistance = null;
            }
        });
    });
    
    [canvasContainer, designerCanvas].forEach(function(element) {
        element.addEventListener('touchstart', function(e) {
            if (e.touches.length === 1) {
                e.preventDefault();
            }
        }, { passive: false });
        
        element.addEventListener('touchmove', function(e) {
            if (e.touches.length === 1) {
                e.preventDefault();
            }
        }, { passive: false });
    });
}

function getTouchDistance(touches) {
    const touch1 = touches[0];
    const touch2 = touches[1];
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function getCurrentZoomLevel() {
    const sliderThumb = document.getElementById('ss-sliderThumb');
    if (!sliderThumb) return 0.5;
    const thumbPosition = parseFloat(sliderThumb.style.left) / 100;
    return isNaN(thumbPosition) ? 0.5 : thumbPosition;
}

function setZoomLevel(zoomLevel, mouseX, mouseY) {
    const canvasContainer = document.getElementById('ss-canvasContainer');
    const designerCanvas = document.getElementById('ss-designer-canvas');
    
    if (!canvasContainer || !designerCanvas) return;
    
    zoomLevel = Math.max(0.05, Math.min(1, zoomLevel));
    
    // If we have mouse coordinates and free move is active, zoom to that point
    if (freeMoveState.active && mouseX !== undefined && mouseY !== undefined) {
        const rect = canvasContainer.getBoundingClientRect();
        const scrollX = mouseX - rect.left + canvasContainer.scrollLeft;
        const scrollY = mouseY - rect.top + canvasContainer.scrollTop;
        
        const currentScale = parseFloat(designerCanvas.style.transform.replace('scale(', '').replace(')', '')) || 1;
        const scaleFactor = zoomLevel / currentScale;
        
        canvasContainer.scrollLeft = scrollX * scaleFactor - (mouseX - rect.left);
        canvasContainer.scrollTop = scrollY * scaleFactor - (mouseY - rect.top);
    }
    
    updateZoomVisuals(zoomLevel);
    designerCanvas.style.transform = 'scale(' + zoomLevel + ')';
}

function adjustZoomLevel(delta) {
    const currentZoom = getCurrentZoomLevel();
    let newZoom = Math.max(0.05, Math.min(1, currentZoom + delta));
    setZoomLevel(newZoom);
}

function initializeDesignerEventListeners() {
    console.log('Initializing designer event listeners...');
    
    const fitAllBtn = document.getElementById('ss-fitAllBtn');
    if (fitAllBtn) {
        fitAllBtn.addEventListener('click', function() {
            setInitialZoom();
        });
    }
    
    const freeMoveBtn = document.getElementById('ss-freeMoveBtn');
    if (freeMoveBtn) {
        freeMoveBtn.addEventListener('click', function() {
            toggleFreeMove();
        });
    }
    
    const addSectionBtn = document.getElementById('ss-addSection');
    if (addSectionBtn) {
        addSectionBtn.addEventListener('click', function() {
            if (!this.classList.contains('ss-disabled')) {
                addSection();
            }
        });
    }
    
    const removeSectionBtn = document.getElementById('ss-removeSection');
    if (removeSectionBtn) {
        removeSectionBtn.addEventListener('click', function() {
            if (!this.classList.contains('ss-disabled')) {
                removeSection();
            }
        });
    }
    
    const guidanceBtn = document.getElementById('ss-guidanceBtn');
    if (guidanceBtn) {
        guidanceBtn.addEventListener('click', function() {
            toggleGuidance();
        });
    }
    
    const moveToTopBtn = document.getElementById('ss-moveToTopBtn');
    const moveUpBtn = document.getElementById('ss-moveUpBtn');
    const moveDownBtn = document.getElementById('ss-moveDownBtn');
    const moveToBottomBtn = document.getElementById('ss-moveToBottomBtn');
    
    if (moveToTopBtn) moveToTopBtn.addEventListener('click', moveLayerToTop);
    if (moveUpBtn) moveUpBtn.addEventListener('click', moveLayerUp);
    if (moveDownBtn) moveDownBtn.addEventListener('click', moveLayerDown);
    if (moveToBottomBtn) moveToBottomBtn.addEventListener('click', moveLayerToBottom);
    
    // Initialize image tool and layer-order buttons state
    updateImageToolButtons();
    if (typeof updateLayerOrderButtons === 'function') updateLayerOrderButtons();
    
    const undoBtn = document.getElementById('ss-undoBtn');
    const redoBtn = document.getElementById('ss-redoBtn');
    
    if (undoBtn) undoBtn.addEventListener('click', undo);
    if (redoBtn) redoBtn.addEventListener('click', redo);
    
    const deleteImageBtn = document.getElementById('ss-deleteImageBtn');
    const duplicateImageBtn = document.getElementById('ss-duplicateImageBtn');
    const flipHorizontalBtn = document.getElementById('ss-flipHorizontalBtn');
    const flipVerticalBtn = document.getElementById('ss-flipVerticalBtn');
    const replaceImageBtn = document.getElementById('ss-replaceImageBtn');
    const lockImageBtn = document.getElementById('ss-lockImageBtn');
    const dropShadowBtn = document.getElementById('ss-dropShadowBtn');
    const grayscaleBtn = document.getElementById('ss-grayscaleBtn');
    
    if (deleteImageBtn) deleteImageBtn.addEventListener('click', function() {
        if (window.SSImageTransform && window.SSImageTransform.deleteImage) {
            window.SSImageTransform.deleteImage();
        }
    });
    if (duplicateImageBtn) duplicateImageBtn.addEventListener('click', function() {
        if (window.SSImageTransform && window.SSImageTransform.duplicateImage) {
            window.SSImageTransform.duplicateImage();
        }
    });
    if (flipHorizontalBtn) flipHorizontalBtn.addEventListener('click', function() {
        if (window.SSImageTransform && window.SSImageTransform.flipHorizontal) {
            window.SSImageTransform.flipHorizontal();
        }
    });
    if (flipVerticalBtn) flipVerticalBtn.addEventListener('click', function() {
        if (window.SSImageTransform && window.SSImageTransform.flipVertical) {
            window.SSImageTransform.flipVertical();
        }
    });
    if (replaceImageBtn) replaceImageBtn.addEventListener('click', function() {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        fileInput.addEventListener('change', function(e) {
            const file = e.target.files && e.target.files[0];
            if (file && window.SSImageTransform && window.SSImageTransform.replaceImage) {
                window.SSImageTransform.replaceImage(file);
            }
            document.body.removeChild(fileInput);
        });
        document.body.appendChild(fileInput);
        fileInput.click();
    });
    if (lockImageBtn) lockImageBtn.addEventListener('click', function() {
        if (window.SSImageTransform && window.SSImageTransform.toggleLock) {
            window.SSImageTransform.toggleLock();
            updateImageToolUIForSelection();
        }
    });
    if (dropShadowBtn) dropShadowBtn.addEventListener('click', function() {
        if (window.SSImageTransform && window.SSImageTransform.toggleShadow) {
            window.SSImageTransform.toggleShadow();
        }
    });
    if (grayscaleBtn) grayscaleBtn.addEventListener('click', function() {
        if (window.SSImageTransform && window.SSImageTransform.toggleGrayscale) {
            window.SSImageTransform.toggleGrayscale();
        }
    });
    
    let resizeTimeout;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(function() {
            setInitialZoom();
        }, 250);
    });
    
    setInterval(cleanupImagesOutsideCanvas, 5000);
    
    console.log('Designer event listeners initialized successfully');
}

// Selection and dragging helpers (migrated from imgtxt.js)
function makeElementDraggable(element) {
    element.addEventListener('pointerdown', function(e) {
        if (e.target.classList && (e.target.classList.contains('ss-resize-handle') || e.target.classList.contains('ss-rotation-handle') || (e.target.parentElement && e.target.parentElement.classList.contains('ss-resize-handles')))) {
            return;
        }
        e.preventDefault();
        e.stopPropagation();
        let actualDragElement = element;
        let draggingFromChild = false;
        try {
            const lIdx = layerState.layers.findIndex(l => l.element === element);
            if (lIdx !== -1) {
                const l = layerState.layers[lIdx];
                if (l.parentGroup) {
                    const groupLayer = layerState.layers.find(gl => gl.id === l.parentGroup);
                    if (groupLayer && groupLayer.element) {
                        actualDragElement = groupLayer.element;
                        draggingFromChild = true;
                    }
                }
            }
        } catch (err) {}

        dragState.isDragging = true;
        dragState.dragElement = actualDragElement;
        dragState.draggingFromChild = draggingFromChild;
        dragState.draggedChild = draggingFromChild ? element : null;
        dragState.startX = e.clientX;
        dragState.startY = e.clientY;
        dragState.elementStartX = parseInt(actualDragElement.style.left) || 0;
        dragState.elementStartY = parseInt(actualDragElement.style.top) || 0;

        element.style.cursor = 'grabbing';
        element.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';

        // Use pointer events where available to ensure proper pointer capture
        try { element.setPointerCapture && element.setPointerCapture(e.pointerId); } catch (err) {}
        document.addEventListener('pointermove', handleDragMove);
        document.addEventListener('pointerup', handleDragEnd);
        document.addEventListener('pointercancel', handleDragEnd);
        // Fallback for non-pointer events
        document.addEventListener('mousemove', handleDragMove);
        document.addEventListener('mouseup', handleDragEnd);
        document.body.style.userSelect = 'none';
    });
}

function makeElementSelectable(element) {
    element.addEventListener('click', function(e) {
        if (e.target.classList && (e.target.classList.contains('ss-resize-handle') || e.target.classList.contains('ss-rotation-handle') || (e.target.parentElement && e.target.parentElement.classList && e.target.parentElement.classList.contains('ss-resize-handles')))) {
            return;
        }
        e.stopPropagation();
        if (multiSelectState && multiSelectState.active) {
            const already = multiSelectState.selected.indexOf(element) !== -1;
            if (already) {
                element.classList.remove('multi-selected');
                multiSelectState.selected = multiSelectState.selected.filter(function(el) { return el !== element; });
            } else {
                element.classList.add('multi-selected');
                multiSelectState.selected.push(element);
            }
            updateImageToolUIForSelection();
            return;
        }

        if (element.classList.contains('ss-text-element')) {
            const textContent = element.querySelector('.ss-text-content');
            if (textContent && element.classList.contains('selected')) {
                textContent.focus();
                if (typeof selectAllText === 'function') selectAllText(textContent);
            } else {
                selectLayer(element);
            }
        } else {
            selectLayer(element);
        }
    });
}

// Backwards compatible exports
window.makeElementDraggable = makeElementDraggable;
window.makeElementSelectable = makeElementSelectable;
function selectLayer(element) {
    if (!element) return;
    const currentLeft = parseInt(element.style.left) || 0;
    const currentTop = parseInt(element.style.top) || 0;
    document.querySelectorAll('.ss-image-element, .ss-text-element').forEach(function(el) {
        el.classList.remove('selected');
        const resizeHandles = getResizeHandlesForElement(el);
        if (resizeHandles) resizeHandles.style.display = 'none';
    });
    element.classList.add('selected');
    const resizeHandles = getResizeHandlesForElement(element);
    if (resizeHandles) resizeHandles.style.display = 'block';
    layerState.selectedLayer = element;
    element.style.left = currentLeft + 'px';
    element.style.top = currentTop + 'px';
    if (typeof updateFontSizeInputForSelectedText === 'function') setTimeout(updateFontSizeInputForSelectedText, 10);
    updateLayerOrderButtons();
    if (typeof window.updateImageToolUIForSelection === 'function') window.updateImageToolUIForSelection(); else try { updateImageToolUIForSelection(); } catch (e) {}
}
window.selectLayer = selectLayer;

function updateImageToolUIForSelection() {
    const btnIds = ['ss-flipHorizontalBtn','ss-flipVerticalBtn','ss-duplicateImageBtn','ss-deleteImageBtn','ss-replaceImageBtn','ss-lockImageBtn','ss-dropShadowBtn','ss-grayscaleBtn'];
    const isImageSelected = (window.SSImageTransform && window.SSImageTransform.hasSelectedImage && window.SSImageTransform.hasSelectedImage()) || (!!layerState.selectedLayer && layerState.selectedLayer.classList.contains('ss-image-element'));
    btnIds.forEach(function(id){
        const btn = document.getElementById(id);
        if (btn) btn.disabled = !isImageSelected;
    });
    
    // Update lock button visual state based on current lock status
    const lockBtn = document.getElementById('ss-lockImageBtn');
    if (lockBtn && window.SSImageTransform && window.SSImageTransform.getSelectedImage) {
        const selectedImg = window.SSImageTransform.getSelectedImage();
        if (selectedImg && selectedImg.locked) {
            lockBtn.style.color = '#e74c3c';
            lockBtn.style.opacity = '1';
        } else {
            lockBtn.style.color = '';
            lockBtn.style.opacity = '';
        }
    }
}
window.updateImageToolUIForSelection = updateImageToolUIForSelection;

// Toggle multi-select mode and support in designer (was previously in imgtxt.js)
function toggleMultiSelectMode() {
    multiSelectState.active = !multiSelectState.active;
    const btn = document.getElementById('ss-selectMultipleBtn');
    if (btn) btn.classList.toggle('ss-active', multiSelectState.active);
    if (!multiSelectState.active) {
        multiSelectState.selected.forEach(function(el) { el.classList.remove('multi-selected'); });
        multiSelectState.selected = [];
    }
}
window.toggleMultiSelectMode = toggleMultiSelectMode;

// Grouping/ungrouping functions (originally in imgtxt.js)
function groupElements(elements) {
    const canvas = document.getElementById('ss-designer-canvas');
    if (!canvas) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    elements.forEach(function(el) {
        const left = parseInt(el.style.left) || 0;
        const top = parseInt(el.style.top) || 0;
        minX = Math.min(minX, left);
        minY = Math.min(minY, top);
        maxX = Math.max(maxX, left + el.offsetWidth);
        maxY = Math.max(maxY, top + el.offsetHeight);
    });
    const group = document.createElement('div');
    group.className = 'ss-group ss-image-element';
    group.style.position = 'absolute';
    group.style.left = minX + 'px';
    group.style.top = minY + 'px';
    group.style.width = (maxX - minX) + 'px';
    group.style.height = (maxY - minY) + 'px';
    group.style.zIndex = layerState.nextZIndex++;
    const groupId = 'group_' + Date.now() + '_' + Math.random().toString(36).substr(2,9);
    const childIds = [];
    elements.forEach(function(el) {
        const idx = layerState.layers.findIndex(l => l.element === el);
        if (idx === -1) return;
        const layer = layerState.layers[idx];
        const relLeft = (parseInt(el.style.left) || 0) - minX;
        const relTop = (parseInt(el.style.top) || 0) - minY;
        el.style.left = relLeft + 'px';
        el.style.top = relTop + 'px';
        group.appendChild(el);
        childIds.push(layer.id);
        layer.parentGroup = groupId;
        layerState.layers[idx] = layer;
    });
    canvas.appendChild(group);
    const groupLayer = {
        id: groupId,
        element: group,
        type: 'group',
        zIndex: group.style.zIndex,
        position: { left: minX, top: minY },
        size: { width: maxX - minX, height: maxY - minY },
        children: childIds,
        baseChildren: (function() {
            const arr = [];
            elements.forEach(function(el) {
                const w = el.offsetWidth || (parseInt(el.style.width) || 0);
                const h = el.offsetHeight || (parseInt(el.style.height) || 0);
                const left = parseInt(el.style.left) || 0;
                const top = parseInt(el.style.top) || 0;
                arr.push({ id: (layerState.layers.find(l => l.element === el) || {}).id, left: left, top: top, width: w, height: h });
            });
            return arr;
        })(),
        locked: false
    };
    layerState.layers.push(groupLayer);
    makeElementDraggable(group);
    makeElementSelectable(group);
    if (typeof SSImage !== 'undefined' && typeof SSImage.setupImageResizeHandlers === 'function') SSImage.setupImageResizeHandlers(group); else if (typeof setupImageResizeHandlers === 'function') setupImageResizeHandlers(group);
    const groupBtn = document.getElementById('ss-groupBtn');
    if (groupBtn) groupBtn.classList.add('ss-locked');
    elements.forEach(function(el) { el.classList.remove('multi-selected'); });
    multiSelectState.selected = [];
    multiSelectState.active = false;
    const selBtn = document.getElementById('ss-selectMultipleBtn');
    if (selBtn) selBtn.classList.remove('ss-active');
    selectLayer(group);
    if (typeof saveState === 'function') saveState();
}
window.groupElements = groupElements;

function ungroupLayer(groupLayer) {
    if (!groupLayer || groupLayer.type !== 'group') return;
    const groupEl = groupLayer.element;
    const canvas = document.getElementById('ss-designer-canvas');
    if (!canvas) return;
    const childIds = groupLayer.children || [];
    childIds.forEach(function(cid) {
        const child = layerState.layers.find(l => l.id === cid);
        if (!child) return;
        const childEl = child.element;
        if (!childEl) return;
        const relLeft = parseInt(childEl.style.left) || 0;
        const relTop = parseInt(childEl.style.top) || 0;
        const absLeft = (groupLayer.position && groupLayer.position.left ? groupLayer.position.left : parseInt(groupEl.style.left) || 0) + relLeft;
        const absTop = (groupLayer.position && groupLayer.position.top ? groupLayer.position.top : parseInt(groupEl.style.top) || 0) + relTop;
        childEl.style.left = absLeft + 'px';
        childEl.style.top = absTop + 'px';
        canvas.appendChild(childEl);
        child.position = { left: absLeft, top: absTop };
        child.parentGroup = null;
        const idx = layerState.layers.findIndex(l => l.id === cid);
        if (idx !== -1) layerState.layers[idx] = child;
    });
    try { groupEl.remove(); } catch (e) {}
    const gidx = layerState.layers.findIndex(l => l.id === groupLayer.id);
    if (gidx !== -1) layerState.layers.splice(gidx, 1);
    const groupBtn = document.getElementById('ss-groupBtn');
    if (groupBtn) groupBtn.classList.remove('ss-locked');
    if (typeof saveState === 'function') saveState();
    if (childIds.length > 0) {
        const firstChild = layerState.layers.find(l => l.id === childIds[0]);
        if (firstChild && firstChild.element) selectLayer(firstChild.element);
    }
}
window.ungroupLayer = ungroupLayer;

function toggleGroupSelected() {
    const sel = layerState.selectedLayer;
    if (sel) {
        const layer = layerState.layers.find(l => l.element === sel);
        if (layer && layer.type === 'group') {
            ungroupLayer(layer);
            return;
        }
        if (layer && layer.parentGroup) {
            const parent = layerState.layers.find(l => l.id === layer.parentGroup);
            if (parent && parent.type === 'group') {
                ungroupLayer(parent);
                return;
            }
        }
    }
    if (!multiSelectState || multiSelectState.selected.length < 2) return;
    groupElements(multiSelectState.selected);
}
window.toggleGroupSelected = toggleGroupSelected;

// Free Move functionality
function toggleFreeMove() {
    const freeMoveBtn = document.getElementById('ss-freeMoveBtn');
    const canvasContainer = document.getElementById('ss-canvasContainer');
    
    if (!freeMoveBtn || !canvasContainer) return;
    
    freeMoveState.active = !freeMoveState.active;
    freeMoveBtn.classList.toggle('ss-active', freeMoveState.active);
    
    if (freeMoveState.active) {
        canvasContainer.style.cursor = 'grab';
        canvasContainer.classList.add('ss-free-move-active');
        canvasContainer.addEventListener('mousedown', startFreeMove);
        document.addEventListener('mouseup', stopFreeMove);
        
        // Zoom to 100% when free move is activated
        setZoomLevel(1.0);
    } else {
        canvasContainer.style.cursor = '';
        canvasContainer.classList.remove('ss-free-move-active');
        canvasContainer.removeEventListener('mousedown', startFreeMove);
        document.removeEventListener('mouseup', stopFreeMove);
    }
}

function startFreeMove(e) {
    if (!freeMoveState.active) return;
    
    const canvasContainer = document.getElementById('ss-canvasContainer');
    if (!canvasContainer) return;
    
    freeMoveState.isMoving = true;
    freeMoveState.startX = e.clientX;
    freeMoveState.startY = e.clientY;
    freeMoveState.startScrollLeft = canvasContainer.scrollLeft;
    freeMoveState.startScrollTop = canvasContainer.scrollTop;
    
    canvasContainer.style.cursor = 'grabbing';
    document.addEventListener('mousemove', doFreeMove);
}

function doFreeMove(e) {
    if (!freeMoveState.active || !freeMoveState.isMoving) return;
    
    const canvasContainer = document.getElementById('ss-canvasContainer');
    if (!canvasContainer) return;
    
    const dx = e.clientX - freeMoveState.startX;
    const dy = e.clientY - freeMoveState.startY;
    
    canvasContainer.scrollLeft = freeMoveState.startScrollLeft - dx;
    canvasContainer.scrollTop = freeMoveState.startScrollTop - dy;
}

function stopFreeMove() {
    if (!freeMoveState.active) return;
    
    const canvasContainer = document.getElementById('ss-canvasContainer');
    if (canvasContainer) {
        canvasContainer.style.cursor = 'grab';
    }
    
    freeMoveState.isMoving = false;
    document.removeEventListener('mousemove', doFreeMove);
}

function addSection() {
    if (canvasState.sections >= canvasState.maxSections) return;
    
    const canvasContainer = document.getElementById('ss-canvasContainer');
    if (canvasContainer) {
        canvasContainer.classList.add('ss-slide-animating', 'ss-slide-enter');
    }
    saveState();
    canvasState.width += 1080;
    canvasState.sections += 1;
    
    const designerCanvas = document.getElementById('ss-designer-canvas');
    if (designerCanvas) {
        designerCanvas.style.width = canvasState.width + 'px';
    }
    
    // Update image canvas width
    if (window.SSImageTransform && window.SSImageTransform.setCanvasSteps) {
        window.SSImageTransform.setCanvasSteps(canvasState.sections);
    }
    
    updateSectionCount();
    updateResolutionDisplay();
    updateButtonStates();
    setInitialZoom();
    
    if (guidanceState.active) {
        updateGuidanceOverlay();
    }

    // activate transition and clean up after it runs
    if (canvasContainer) {
        // Force reflow then trigger activation class for transition
        void canvasContainer.offsetWidth;
        canvasContainer.classList.add('ss-activate');
        const handler = function(e) {
            if (e.target && e.target.id === 'ss-designer-canvas') {
                canvasContainer.classList.remove('ss-slide-animating', 'ss-slide-enter', 'ss-activate');
                canvasContainer.removeEventListener('transitionend', handler);
            }
        };
        canvasContainer.addEventListener('transitionend', handler);
    }
}

function removeSection() {
    if (canvasState.sections <= canvasState.minSections) return;
    
    const canvasContainer = document.getElementById('ss-canvasContainer');
    if (canvasContainer) {
        canvasContainer.classList.add('ss-slide-animating', 'ss-slide-exit');
    }
    saveState();
    canvasState.width -= 1080;
    canvasState.sections -= 1;
    
    const designerCanvas = document.getElementById('ss-designer-canvas');
    if (designerCanvas) {
        designerCanvas.style.width = canvasState.width + 'px';
    }
    
    // Update image canvas width
    if (window.SSImageTransform && window.SSImageTransform.setCanvasSteps) {
        window.SSImageTransform.setCanvasSteps(canvasState.sections);
    }
    
    updateSectionCount();
    updateResolutionDisplay();
    updateButtonStates();
    setInitialZoom();
    
    if (guidanceState.active) {
        updateGuidanceOverlay();
    }

    // activate transition and clean up
    if (canvasContainer) {
        void canvasContainer.offsetWidth;
        canvasContainer.classList.add('ss-activate');
        const handler = function(e) {
            if (e.target && e.target.id === 'ss-designer-canvas') {
                canvasContainer.classList.remove('ss-slide-animating', 'ss-slide-exit', 'ss-activate');
                canvasContainer.removeEventListener('transitionend', handler);
            }
        };
        canvasContainer.addEventListener('transitionend', handler);
    }
}

function updateSectionCount() {
    const sectionCountElement = document.getElementById('ss-sectionCount');
    if (sectionCountElement) {
        sectionCountElement.textContent = canvasState.sections.toString();
        if (document.body.classList.contains('ss-dark-mode')) {
            sectionCountElement.style.color = '#f0f0f0';
        } else {
            sectionCountElement.style.color = '#333333';
        }
    }
}

function updateResolutionDisplay() {
    const resolutionDisplay = document.getElementById('ss-resolutionDisplay');
    if (resolutionDisplay) {
        resolutionDisplay.textContent = canvasState.width + ' × ' + canvasState.height;
    }
}

function updateButtonStates() {
    const addSectionBtn = document.getElementById('ss-addSection');
    const removeSectionBtn = document.getElementById('ss-removeSection');
    
    if (addSectionBtn) {
        if (canvasState.sections >= canvasState.maxSections) {
            addSectionBtn.classList.add('ss-disabled');
            addSectionBtn.style.opacity = '0.3';
            addSectionBtn.style.cursor = 'not-allowed';
            addSectionBtn.style.color = '#dddddd';
        } else {
            addSectionBtn.classList.remove('ss-disabled');
            addSectionBtn.style.opacity = '1';
            addSectionBtn.style.cursor = 'pointer';
            addSectionBtn.style.color = '#333333';
        }
    }
    
    if (removeSectionBtn) {
        if (canvasState.sections <= canvasState.minSections) {
            removeSectionBtn.classList.add('ss-disabled');
            removeSectionBtn.style.opacity = '0.3';
            removeSectionBtn.style.cursor = 'not-allowed';
            removeSectionBtn.style.color = '#dddddd';
        } else {
            removeSectionBtn.classList.remove('ss-disabled');
            removeSectionBtn.style.opacity = '1';
            removeSectionBtn.style.cursor = 'pointer';
            removeSectionBtn.style.color = '#333333';
        }
    }
}

function initializeMagnetButton() {
    const magnetBtn = document.getElementById('ss-magnetBtn');
    
    if (!magnetBtn) return;
    
    // Start with magnet active by default
    magnetState.active = true;
    magnetBtn.classList.add('ss-active');
    
    magnetBtn.addEventListener('click', function() {
        magnetState.active = !magnetState.active;
        this.classList.toggle('ss-active', magnetState.active);
        
        // Visual feedback
        if (magnetState.active) {
            console.log('Magnet snapping enabled');
        } else {
            console.log('Magnet snapping disabled');
        }
    });
    
    console.log('Magnet button initialized - active by default');
}

function initializeKeyboardMovement() {
    document.addEventListener('keydown', function(e) {
        if (!layerState.selectedLayer) return;
        
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
            return;
        }
        
        const key = e.key;
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
            e.preventDefault();
            moveSelectedLayerWithKeyboard(key);
        }
    });
}

function moveSelectedLayerWithKeyboard(key) {
    const element = layerState.selectedLayer;
    const currentLeft = parseInt(element.style.left) || 0;
    const currentTop = parseInt(element.style.top) || 0;
    
    let newLeft = currentLeft;
    let newTop = currentTop;
    const moveAmount = 1;
    
    switch(key) {
        case 'ArrowUp': newTop -= moveAmount; break;
        case 'ArrowDown': newTop += moveAmount; break;
        case 'ArrowLeft': newLeft -= moveAmount; break;
        case 'ArrowRight': newLeft += moveAmount; break;
    }
    
    const elementRect = element.getBoundingClientRect();
    const minX = 0;
    const minY = 0;
    const maxX = canvasState.width - elementRect.width;
    const maxY = canvasState.height - elementRect.height;
    
    newLeft = Math.max(minX, Math.min(maxX, newLeft));
    newTop = Math.max(minY, Math.min(maxY, newTop));
    
    // Always apply magnet snapping when active
    if (magnetState.active) {
        const snapped = snapToGuidelines(newLeft, newTop, elementRect.width, elementRect.height);
        newLeft = snapped.x;
        newTop = snapped.y;
    }
    
    element.style.left = newLeft + 'px';
    element.style.top = newTop + 'px';
    
    const layerIndex = layerState.layers.findIndex(function(layer) {
        return layer.element === element;
    });
    if (layerIndex !== -1) {
        layerState.layers[layerIndex].position = { left: newLeft, top: newTop };
    }
    
    saveState();
}

function cleanupImagesOutsideCanvas() {
    const designerCanvas = document.getElementById('ss-designer-canvas');
    if (!designerCanvas) return;
    
    let removedCount = 0;
    
    layerState.layers.forEach(function(layer, index) {
        if (layer.type === 'image') {
            const rect = layer.element.getBoundingClientRect();
            const canvasRect = designerCanvas.getBoundingClientRect();
            const elementX = rect.left - canvasRect.left;
            const elementY = rect.top - canvasRect.top;
            
            const isOutside = 
                elementX + rect.width < -100 || 
                elementX > canvasState.width + 100 ||
                elementY + rect.height < -100 || 
                elementY > canvasState.height + 100;
            
            if (isOutside) {
                layer.element.remove();
                layerState.layers.splice(index, 1);
                removedCount++;
            }
        }
    });
    
    if (removedCount > 0) {
        console.log('Removed ' + removedCount + ' images outside canvas');
        saveState();
    }
}

// ENHANCED: Complete state saving function
function saveState() {
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

function undo() {
    if (historyState.undoStack.length < 2) return;
    
    const currentState = historyState.undoStack.pop();
    historyState.redoStack.push(currentState);
    const previousState = historyState.undoStack[historyState.undoStack.length - 1];
    restoreState(previousState);
    updateUndoRedoButtons();
}

function redo() {
    if (historyState.redoStack.length === 0) return;
    
    const nextState = historyState.redoStack.pop();
    historyState.undoStack.push(nextState);
    restoreState(nextState);
    updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
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

// ENHANCED: Delete function that hides instead of removes
function deleteSelectedLayer() {
    if (!layerState.selectedLayer) return;
    
    saveState();
    
    const element = layerState.selectedLayer;
    
    // Instead of removing, hide and disable the element
    element.style.display = 'none';
    element.style.pointerEvents = 'none';
    
    // Update layer state
    const layerIndex = layerState.layers.findIndex(function(layer) {
        return layer.element === element;
    });
    
    if (layerIndex !== -1) {
        layerState.layers[layerIndex].visible = false;
        layerState.layers[layerIndex].disabled = true;
    }
    
    layerState.selectedLayer = null;
    updateLayerOrderButtons();
}

function getSelectedImageLayer() {
    const el = layerState.selectedLayer;
    if (!el) return null;
    const idx = layerState.layers.findIndex(l => l.element === el);
    if (idx === -1) return null;
    const layer = layerState.layers[idx];
    if (layer.type !== 'image') return null;
    return { layer, idx };
}

function flipSelectedImageHorizontal() {
    const sel = getSelectedImageLayer();
    if (!sel) return;
    const { layer } = sel;
    const current = layer.element.style.transform || '';
    const hasScaleXNeg = /scaleX\(-1\)/.test(current);
    const newTransform = hasScaleXNeg ? current.replace(/scaleX\(-1\)/, '').trim() : (current + ' scaleX(-1)').trim();
    layer.element.style.transform = newTransform;
    saveState();
}

function flipSelectedImageVertical() {
    const sel = getSelectedImageLayer();
    if (!sel) return;
    const { layer } = sel;
    const current = layer.element.style.transform || '';
    const hasScaleYNeg = /scaleY\(-1\)/.test(current);
    const newTransform = hasScaleYNeg ? current.replace(/scaleY\(-1\)/, '').trim() : (current + ' scaleY(-1)').trim();
    layer.element.style.transform = newTransform;
    saveState();
}

function duplicateSelectedImageLayer() {
    const sel = getSelectedImageLayer();
    if (!sel) return;
    const { layer } = sel;
    const designerCanvas = document.getElementById('ss-designer-canvas');
    if (!designerCanvas) return;
    // Save before duplicate
    saveState();
    const cloneEl = layer.element.cloneNode(true);
    cloneEl.id = 'img_' + Date.now() + '_' + Math.random().toString(36).slice(2,8);
    const left = (parseInt(layer.element.style.left) || 0) + 20;
    const top = (parseInt(layer.element.style.top) || 0) + 20;
    cloneEl.style.left = left + 'px';
    cloneEl.style.top = top + 'px';
    cloneEl.style.zIndex = String(layerState.nextZIndex++);
    designerCanvas.appendChild(cloneEl);
    const imgEl = cloneEl.querySelector('img');
    const newLayer = {
        id: cloneEl.id,
        element: cloneEl,
        imageElement: imgEl,
        type: 'image',
        zIndex: parseInt(cloneEl.style.zIndex) || (layer.zIndex + 1),
        position: { left, top },
        size: { width: layer.element.offsetWidth, height: layer.element.offsetHeight },
        rotation: layer.rotation || 0,
        naturalSize: layer.naturalSize,
        aspectRatio: layer.aspectRatio,
        src: imgEl ? imgEl.src : layer.src,
        visible: true,
        disabled: false,
        cropData: layer.cropData ? JSON.parse(JSON.stringify(layer.cropData)) : null
    };
    layerState.layers.push(newLayer);
    makeElementDraggable(cloneEl);
    makeElementSelectable(cloneEl);
    setupImageResizeHandlers(cloneEl);
    setupRotationHandler(cloneEl);
    selectLayer(cloneEl);
    saveState();
}

function replaceSelectedImage() {
    const sel = getSelectedImageLayer();
    if (!sel) return;
    const { layer } = sel;
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) { document.body.removeChild(fileInput); return; }
        const reader = new FileReader();
        reader.onload = function(evt) {
            const src = evt.target.result;
            const img = new Image();
            img.onload = function() {
                saveState();
                const container = layer.element;
                const imageEl = layer.imageElement || container.querySelector('img');
                const containerW = container.offsetWidth;
                const containerH = container.offsetHeight;
                const newAR = img.width / img.height;
                const containerAR = containerW / containerH;
                imageEl.src = src;
                // Adjust fit: if aspect differs, fit to widest or tallest keeping cover containment
                // Use object-fit cover by default; adjust transform scale to fill if needed
                imageEl.style.objectFit = 'cover';
                // Optionally adjust container size to maintain primary dimension
                if (Math.abs(newAR - containerAR) > 0.01) {
                    if (newAR > containerAR) {
                        // Wider: keep height, scale width
                        container.style.height = containerH + 'px';
                        // width remains the same to keep layout, content will crop by cover
                    } else {
                        // Taller: keep width, scale height
                        container.style.width = containerW + 'px';
                    }
                }
                // Update layer state
                layer.src = src;
                layer.naturalSize = { width: img.width, height: img.height };
                layer.aspectRatio = newAR;
                saveState();
            };
            img.src = src;
        };
        reader.readAsDataURL(file);
        document.body.removeChild(fileInput);
    });
    document.body.appendChild(fileInput);
    fileInput.click();
}

function toggleLockSelectedImage() {
    const sel = getSelectedImageLayer();
    if (!sel) return;
    const { layer } = sel;
    const el = layer.element;
    const isLocked = el.classList.toggle('ss-locked');
    // Lock prevents dragging/resizing but allows selection
    el.style.pointerEvents = isLocked ? 'auto' : 'auto';
    // Disable resize handles when locked
    const handles = getResizeHandlesForElement(el);
    if (handles) handles.style.display = isLocked ? 'none' : (el.classList.contains('selected') ? 'block' : 'none');
    layer.locked = isLocked;
    saveState();
}

function toggleDropShadowSelectedImage() {
    const sel = getSelectedImageLayer();
    if (!sel) return;
    const { layer } = sel;
    const el = layer.element;
    const hasShadow = el.style.boxShadow && el.style.boxShadow !== '';
    el.style.boxShadow = hasShadow ? '' : '0 8px 24px rgba(0,0,0,0.25)';
    saveState();
}

function toggleGrayscaleSelectedImage() {
    const sel = getSelectedImageLayer();
    if (!sel) return;
    const { layer } = sel;
    const imageEl = layer.imageElement || layer.element.querySelector('img');
    if (!imageEl) return;
    const currentFilter = imageEl.style.filter || '';
    const hasGray = /grayscale\(1\)/.test(currentFilter) || /grayscale\(100%\)/.test(currentFilter);
    imageEl.style.filter = hasGray ? currentFilter.replace(/grayscale\(1\)|grayscale\(100%\)/, '').trim() : (currentFilter + ' grayscale(1)').trim();
    saveState();
}
    

// ENHANCED: Complete state restoration function
function restoreState(state) {
    if (!state) return;
    
    // Restore canvas dimensions
    canvasState = JSON.parse(JSON.stringify(state.canvasState));
    
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
        
        makeElementDraggable(imageContainer);
        makeElementSelectable(imageContainer);
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
    
    makeElementDraggable(placeholder);
    makeElementSelectable(placeholder);
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
    
    makeElementDraggable(textElement);
    makeElementSelectable(textElement);
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

function initializeColorPicker() {
    const colorPicker = document.getElementById('ss-slideColorPicker');
    const colorHex = document.getElementById('ss-slideColorHex');
    
    if (!colorPicker || !colorHex) return;
    
    colorPicker.addEventListener('input', function() {
        const hexValue = this.value;
        colorHex.value = hexValue.replace('#', '');
        updateCanvasColor(hexValue);
    });
    
    colorHex.addEventListener('input', function() {
        let hexValue = this.value;
        
        // Remove any existing # and ensure it's a valid hex
        hexValue = hexValue.replace('#', '');
        
        // Only allow hex characters
        hexValue = hexValue.replace(/[^0-9A-F]/gi, '');
        
        // Limit to 6 characters
        if (hexValue.length > 6) {
            hexValue = hexValue.substring(0, 6);
        }
        
        // Update the input field
        this.value = hexValue;
        
        // Add # for the color picker
        const fullHexValue = '#' + hexValue;
        
        // Only update if we have a valid hex (3 or 6 characters)
        if (hexValue.length === 3 || hexValue.length === 6) {
            colorPicker.value = fullHexValue;
            updateCanvasColor(fullHexValue);
        }
    });
    
    colorHex.addEventListener('blur', function() {
        let hexValue = this.value.replace('#', '');
        
        // If empty, set to white
        if (hexValue === '') {
            hexValue = 'ffffff';
            this.value = hexValue;
            colorPicker.value = '#' + hexValue;
            updateCanvasColor('#' + hexValue);
        }
        // If 3 characters, expand to 6
        else if (hexValue.length === 3) {
            hexValue = hexValue.split('').map(char => char + char).join('');
            this.value = hexValue;
            colorPicker.value = '#' + hexValue;
            updateCanvasColor('#' + hexValue);
        }
        // If invalid length, pad with zeros or truncate
        else if (hexValue.length > 0 && hexValue.length !== 6) {
            hexValue = hexValue.padEnd(6, '0').substring(0, 6);
            this.value = hexValue;
            colorPicker.value = '#' + hexValue;
            updateCanvasColor('#' + hexValue);
        }
    });
}

function updateCanvasColor(hexColor) {
    const designerCanvas = document.getElementById('ss-designer-canvas');
    if (designerCanvas) {
        designerCanvas.style.backgroundColor = hexColor;
        saveState();
        
        // Update slide separator colors when background changes
        if (guidanceState.active) {
            updateSlideSeparatorColors();
        }
    }
}

function initializeUploadFunctionality() {
    const uploadImagesBtn = document.getElementById('ss-uploadImagesBtn');
    const addTextBtn = document.getElementById('ss-addTextBtn');
    
    if (uploadImagesBtn) {
        uploadImagesBtn.addEventListener('click', function() {
            if (layerState.layers.length >= layerState.maxLayers) {
                alert('Maximum number of layers reached (' + layerState.maxLayers + '). Please remove some elements before adding more.');
                return;
            }
            
            const fileInput = document.createElement('input');
            fileInput.type = 'file';
            fileInput.accept = 'image/*';
            fileInput.multiple = true;
            fileInput.style.display = 'none';
            
            fileInput.addEventListener('change', function(e) {
                console.log('initializeUploadFunctionality: file input change event', e.target.files && e.target.files.length);
                const files = e.target.files;
                if (files.length > 0) {
                    saveState();
                    Array.from(files).forEach(function(file) {
                        if (layerState.layers.length < layerState.maxLayers) {
                            if (typeof importImageToCanvas === 'function') {
                                console.log('designer.js: calling importImageToCanvas for', file && file.name);
                                try { importImageToCanvas(file); } catch (err) { console.error('designer.js: importImageToCanvas threw error', err); }
                            } else if (window && typeof window.importImageToCanvas === 'function') {
                                console.log('designer.js: calling window.importImageToCanvas for', file && file.name);
                                try { window.importImageToCanvas(file); } catch (err) { console.error('designer.js: window.importImageToCanvas threw error', err); }
                            } else {
                                console.warn('designer.js: importImageToCanvas is not available - queuing at window._pendingUploads', window.importImageToCanvas);
                                window._pendingUploads = window._pendingUploads || [];
                                try { window._pendingUploads.push(file); } catch (e) { console.error('designer.js: failed to push to window._pendingUploads', e); }
                            }
                        } else {
                            alert('Maximum number of layers reached (' + layerState.maxLayers + '). Cannot add more images.');
                        }
                    });
                }
                document.body.removeChild(fileInput);
            });
    
            console.log('initializeUploadFunctionality: open file dialog (triggered)');
            document.body.appendChild(fileInput);
            fileInput.click();
        });
    }
    
    if (addTextBtn) {
        addTextBtn.addEventListener('click', function() {
            if (layerState.layers.length >= layerState.maxLayers) {
                alert('Maximum number of layers reached (' + layerState.maxLayers + '). Please remove some elements before adding more.');
                return;
            }
            // Prefer the text editor modal if present
            if (window.SSTextEditor && typeof window.SSTextEditor.open === 'function') {
                window.SSTextEditor.open();
            } else {
                // Fallback: directly add a text element
                saveState();
                if (typeof addTextElement === 'function') addTextElement();
            }
        });
    }
}

function initializeTransparencySlider() {
    const transparencyThumb = document.getElementById('ss-transparencyThumb');
    const transparencyFill = document.getElementById('ss-transparencyFill');
    const transparencySlider = document.getElementById('ss-transparencySlider');
    const transparencyValue = document.getElementById('ss-transparencyValue');
    
    if (!transparencyThumb || !transparencyFill || !transparencySlider || !transparencyValue) return;
    
    let isDragging = false;
    let currentTransparency = 75;
    
    transparencyValue.textContent = '75%';
    transparencyFill.style.width = '75%';
    transparencyThumb.style.left = '75%';
    
    transparencyThumb.addEventListener('mousedown', startDrag);
    
    function startDrag(e) {
        isDragging = true;
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mouseup', stopDrag);
        e.preventDefault();
    }
    
    function onDrag(e) {
        if (!isDragging) return;
        updateTransparencyFromPosition(e.clientX);
    }
    
    function stopDrag() {
        isDragging = false;
        document.removeEventListener('mousemove', onDrag);
        document.removeEventListener('mouseup', stopDrag);
    }
    
    function updateTransparencyFromPosition(clientX) {
        const sliderRect = transparencySlider.getBoundingClientRect();
        let position = (clientX - sliderRect.left) / sliderRect.width;
        position = Math.max(0, Math.min(1, position));
        currentTransparency = Math.round(position * 98) + 1;
        transparencyValue.textContent = currentTransparency + '%';
        transparencyFill.style.width = currentTransparency + '%';
        transparencyThumb.style.left = currentTransparency + '%';
        updateGuidanceTransparency();
    }
    
    transparencySlider.addEventListener('click', function(e) {
        const sliderRect = transparencySlider.getBoundingClientRect();
        let position = (e.clientX - sliderRect.left) / sliderRect.width;
        position = Math.max(0, Math.min(1, position));
        currentTransparency = Math.round(position * 98) + 1;
        transparencyValue.textContent = currentTransparency + '%';
        transparencyFill.style.width = currentTransparency + '%';
        transparencyThumb.style.left = currentTransparency + '%';
        updateGuidanceTransparency();
    });
}

function toggleGuidance() {
    const guidanceBtn = document.getElementById('ss-guidanceBtn');
    const transparencySliderContainer = document.querySelector('#ss-transparencySlider').closest('.ss-slider-container');
    
    if (!guidanceState.active) {
        guidanceState.active = true;
        guidanceBtn.classList.add('ss-active');
        createEnhancedGuidanceOverlay();
        
        // Enable transparency slider
        if (transparencySliderContainer) {
            transparencySliderContainer.classList.remove('ss-disabled');
        }
    } else {
        guidanceState.active = false;
        guidanceBtn.classList.remove('ss-active');
        removeGuidanceOverlay();
        
        // Disable transparency slider
        if (transparencySliderContainer) {
            transparencySliderContainer.classList.add('ss-disabled');
        }
    }
}

function createEnhancedGuidanceOverlay() {
    removeGuidanceOverlay();
    
    const designerCanvas = document.getElementById('ss-designer-canvas');
    if (!designerCanvas) return;
    
    guidanceOverlay = document.createElement('div');
    guidanceOverlay.id = 'ss-guidance-overlay';
    guidanceOverlay.style.position = 'absolute';
    guidanceOverlay.style.top = '0';
    guidanceOverlay.style.left = '0';
    guidanceOverlay.style.width = '100%';
    guidanceOverlay.style.height = '100%';
    guidanceOverlay.style.pointerEvents = 'none';
    guidanceOverlay.style.zIndex = '100000';
    guidanceOverlay.style.overflow = 'visible';
    
    createSlideSeparators();
    createCenterLines();
    createSocialMediaGuides();
    designerCanvas.appendChild(guidanceOverlay);
    updateGuidanceTransparency();
    
    console.log('Enhanced guidance overlay created');
}

function createSlideSeparators() {
    if (!guidanceOverlay) return;
    
    // Only create slide separators if there are multiple sections
    if (canvasState.sections > 1) {
        for (let i = 1; i < canvasState.sections; i++) {
            const separatorX = i * 1080;
            
            // Slide separator - dynamic color based on background
            const separator = document.createElement('div');
            separator.className = 'ss-slide-separator';
            separator.style.position = 'absolute';
            separator.style.left = separatorX + 'px';
            separator.style.top = '0';
            separator.style.width = '1px';
            separator.style.height = '100%';
            separator.style.zIndex = '100001';
            guidanceOverlay.appendChild(separator);
        }
    }
    
    // Update separator colors based on background
    updateSlideSeparatorColors();
}

function updateSlideSeparatorColors() {
    const designerCanvas = document.getElementById('ss-designer-canvas');
    if (!designerCanvas || !guidanceOverlay) return;
    
    const backgroundColor = designerCanvas.style.backgroundColor || '#ffffff';
    const isDark = isColorDark(backgroundColor);
    const separatorColor = isDark ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)';
    
    const separators = guidanceOverlay.querySelectorAll('.ss-slide-separator');
    separators.forEach(separator => {
        separator.style.backgroundColor = separatorColor;
    });
}

function isColorDark(color) {
    // Convert hex color to RGB
    let r, g, b;
    
    if (color.startsWith('#')) {
        r = parseInt(color.substr(1, 2), 16);
        g = parseInt(color.substr(3, 2), 16);
        b = parseInt(color.substr(5, 2), 16);
    } else if (color.startsWith('rgb')) {
        const rgb = color.match(/\d+/g);
        r = parseInt(rgb[0]);
        g = parseInt(rgb[1]);
        b = parseInt(rgb[2]);
    } else {
        // Default to light if unknown format
        return false;
    }
    
    // Calculate luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5;
}

function createCenterLines() {
    if (!guidanceOverlay) return;
    
    // Single horizontal center line at exact center
    const horizontalCenter = document.createElement('div');
    horizontalCenter.className = 'ss-horizontal-center-line';
    horizontalCenter.style.position = 'absolute';
    horizontalCenter.style.left = '0';
    horizontalCenter.style.top = '960px'; // 1920 / 2
    horizontalCenter.style.width = '100%';
    horizontalCenter.style.height = '1px';
    horizontalCenter.style.backgroundColor = 'rgba(0, 100, 255, 0.6)'; // Blue
    horizontalCenter.style.zIndex = '100001';
    guidanceOverlay.appendChild(horizontalCenter);
    
    // Vertical center lines for each slide
    for (let section = 0; section < canvasState.sections; section++) {
        const sectionStartX = section * 1080;
        
        const verticalCenter = document.createElement('div');
        verticalCenter.className = 'ss-vertical-center-line';
        verticalCenter.style.position = 'absolute';
        verticalCenter.style.left = (sectionStartX + 540) + 'px'; // 1080 / 2
        verticalCenter.style.top = '0';
        verticalCenter.style.width = '1px';
        verticalCenter.style.height = '100%';
        verticalCenter.style.backgroundColor = 'rgba(0, 100, 255, 0.6)'; // Blue
        verticalCenter.style.zIndex = '100001';
        guidanceOverlay.appendChild(verticalCenter);
    }
}

function createSocialMediaGuides() {
    if (!guidanceOverlay) return;
    
    // Create guides for each slide
    for (let section = 0; section < canvasState.sections; section++) {
        const sectionStartX = section * 1080;
        
        // 1:1 Square Guide (1080x1080px) - Instagram gradient colors
        const squareTopY = (1920 - 1080) / 2;
        const squareBottomY = squareTopY + 1080;
        
        // Top horizontal line for 1:1
        const squareTopLine = document.createElement('div');
        squareTopLine.className = 'ss-social-guide-line ss-square-line';
        squareTopLine.style.position = 'absolute';
        squareTopLine.style.left = sectionStartX + 'px';
        squareTopLine.style.top = squareTopY + 'px';
        squareTopLine.style.width = '1080px';
        squareTopLine.style.height = '2px';
        squareTopLine.style.background = 'linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)';
        squareTopLine.style.zIndex = '100001';
        guidanceOverlay.appendChild(squareTopLine);
        
        // Bottom horizontal line for 1:1
        const squareBottomLine = document.createElement('div');
        squareBottomLine.className = 'ss-social-guide-line ss-square-line';
        squareBottomLine.style.position = 'absolute';
        squareBottomLine.style.left = sectionStartX + 'px';
        squareBottomLine.style.top = squareBottomY + 'px';
        squareBottomLine.style.width = '1080px';
        squareBottomLine.style.height = '2px';
        squareBottomLine.style.background = 'linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)';
        squareBottomLine.style.zIndex = '100001';
        guidanceOverlay.appendChild(squareBottomLine);
        
        // 1:1 Label - placed ABOVE the top line (moved from below)
        const squareLabel = document.createElement('div');
        squareLabel.className = 'ss-guide-label';
        squareLabel.textContent = '1:1 Square';
        squareLabel.style.position = 'absolute';
        squareLabel.style.left = (sectionStartX + 10) + 'px';
        squareLabel.style.top = (squareTopY - 25) + 'px'; // Moved above the top line
        squareLabel.style.color = 'white';
        squareLabel.style.fontSize = '14px';
        squareLabel.style.fontWeight = 'bold';
        squareLabel.style.fontFamily = 'Arial, sans-serif';
        squareLabel.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        squareLabel.style.padding = '4px 8px';
        squareLabel.style.borderRadius = '4px';
        squareLabel.style.zIndex = '100002';
        guidanceOverlay.appendChild(squareLabel);
        
        // 4:5 Post Guide (1080x1350px) - Instagram purple color
        const postTopY = (1920 - 1350) / 2;
        const postBottomY = postTopY + 1350;
        
        // Top horizontal line for 4:5
        const postTopLine = document.createElement('div');
        postTopLine.className = 'ss-social-guide-line ss-post-line';
        postTopLine.style.position = 'absolute';
        postTopLine.style.left = sectionStartX + 'px';
        postTopLine.style.top = postTopY + 'px';
        postTopLine.style.width = '1080px';
        postTopLine.style.height = '2px';
        postTopLine.style.backgroundColor = '#833AB4'; // Instagram purple
        postTopLine.style.zIndex = '100001';
        guidanceOverlay.appendChild(postTopLine);
        
        // Bottom horizontal line for 4:5
        const postBottomLine = document.createElement('div');
        postBottomLine.className = 'ss-social-guide-line ss-post-line';
        postBottomLine.style.position = 'absolute';
        postBottomLine.style.left = sectionStartX + 'px';
        postBottomLine.style.top = postBottomY + 'px';
        postBottomLine.style.width = '1080px';
        postBottomLine.style.height = '2px';
        postBottomLine.style.backgroundColor = '#833AB4'; // Instagram purple
        postBottomLine.style.zIndex = '100001';
        guidanceOverlay.appendChild(postBottomLine);
        
        // 4:5 Label - placed ABOVE the top line (moved from below)
        const postLabel = document.createElement('div');
        postLabel.className = 'ss-guide-label';
        postLabel.textContent = '4:5 Post';
        postLabel.style.position = 'absolute';
        postLabel.style.left = (sectionStartX + 10) + 'px';
        postLabel.style.top = (postTopY - 25) + 'px'; // Moved above the top line
        postLabel.style.color = 'white';
        postLabel.style.fontSize = '14px';
        postLabel.style.fontWeight = 'bold';
        postLabel.style.fontFamily = 'Arial, sans-serif';
        postLabel.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        postLabel.style.padding = '4px 8px';
        postLabel.style.borderRadius = '4px';
        postLabel.style.zIndex = '100002';
        guidanceOverlay.appendChild(postLabel);
        
        // 9:16 Stories Guide (1080x1920px) - Page number at top
        const storiesLabel = document.createElement('div');
        storiesLabel.className = 'ss-guide-label';
        storiesLabel.textContent = `9:16 Stories #${section + 1}`; // Added page number
        storiesLabel.style.position = 'absolute';
        storiesLabel.style.left = (sectionStartX + 10) + 'px';
        storiesLabel.style.top = '10px';
        storiesLabel.style.color = 'white';
        storiesLabel.style.fontSize = '14px';
        storiesLabel.style.fontWeight = 'bold';
        storiesLabel.style.fontFamily = 'Arial, sans-serif';
        storiesLabel.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        storiesLabel.style.padding = '4px 8px';
        storiesLabel.style.borderRadius = '4px';
        storiesLabel.style.zIndex = '100002';
        guidanceOverlay.appendChild(storiesLabel);
    }
}

function removeGuidanceOverlay() {
    const designerCanvas = document.getElementById('ss-designer-canvas');
    if (designerCanvas) {
        const existingOverlay = document.getElementById('ss-guidance-overlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }
    }
    guidanceOverlay = null;
}

function updateGuidanceTransparency() {
    if (guidanceState.active && guidanceOverlay) {
        const transparencyValue = document.getElementById('ss-transparencyValue');
        if (transparencyValue) {
            const transparency = parseInt(transparencyValue.textContent);
            const opacity = transparency / 100;
            guidanceOverlay.style.opacity = opacity.toString();
        }
    }
}

function updateGuidanceOverlay() {
    if (!guidanceState.active) return;
    createEnhancedGuidanceOverlay();
}

// ENHANCED: Complete magnet snapping to ALL guides including light blue center lines
function snapToGuidelines(x, y, width, height) {
    if (!magnetState.active) return { x: x, y: y };
    
    const snapThreshold = 10;
    let snappedX = x;
    let snappedY = y;
    
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    
    // Snap to canvas edges
    if (Math.abs(x) < snapThreshold) snappedX = 0;
    if (Math.abs(y) < snapThreshold) snappedY = 0;
    if (Math.abs(x + width - canvasState.width) < snapThreshold) snappedX = canvasState.width - width;
    if (Math.abs(y + height - canvasState.height) < snapThreshold) snappedY = canvasState.height - height;
    
    // Snap to canvas center (light blue center lines)
    const canvasCenterX = canvasState.width / 2;
    const canvasCenterY = canvasState.height / 2;
    
    if (Math.abs(centerX - canvasCenterX) < snapThreshold) {
        snappedX = canvasCenterX - width / 2;
    }
    
    if (Math.abs(centerY - canvasCenterY) < snapThreshold) {
        snappedY = canvasCenterY - height / 2;
    }
    
    // Snap to light blue horizontal center line (edges and center)
    if (Math.abs(y - canvasCenterY) < snapThreshold) snappedY = canvasCenterY; // Top edge to horizontal center
    if (Math.abs(y + height - canvasCenterY) < snapThreshold) snappedY = canvasCenterY - height; // Bottom edge to horizontal center
    if (Math.abs(centerY - canvasCenterY) < snapThreshold) snappedY = canvasCenterY - height / 2; // Center to horizontal center
    
    // Snap to slide centers (for multi-section canvases) - light blue vertical center lines
    for (let section = 0; section < canvasState.sections; section++) {
        const sectionCenterX = (section * 1080) + 540; // 1080 / 2
        
        // Snap to light blue vertical center lines (edges and center)
        if (Math.abs(x - sectionCenterX) < snapThreshold) snappedX = sectionCenterX; // Left edge to vertical center
        if (Math.abs(x + width - sectionCenterX) < snapThreshold) snappedX = sectionCenterX - width; // Right edge to vertical center
        if (Math.abs(centerX - sectionCenterX) < snapThreshold) snappedX = sectionCenterX - width / 2; // Center to vertical center
        
        // SoMe Guide dimensions
        const sectionStartX = section * 1080;
        const sectionEndX = sectionStartX + 1080;
        
        const squareTopY = (1920 - 1080) / 2;        // 420
        const squareBottomY = squareTopY + 1080;      // 1500
        const squareCenterY = squareTopY + 540;       // 960
        const squareLeftX = sectionStartX;            // section left
        const squareRightX = sectionEndX;             // section right
        const squareCenterX = sectionStartX + 540;    // section center
        
        const postTopY = (1920 - 1350) / 2;          // 285
        const postBottomY = postTopY + 1350;          // 1635
        const postCenterY = postTopY + 675;           // 960
        const postLeftX = sectionStartX;              // section left
        const postRightX = sectionEndX;               // section right
        const postCenterX = sectionStartX + 540;      // section center
        
        // 1:1 SQUARE GUIDE SNAPPING
        
        // Snap to square guide edges (top, bottom, left, right)
        if (Math.abs(y - squareTopY) < snapThreshold) snappedY = squareTopY;
        if (Math.abs(y + height - squareBottomY) < snapThreshold) snappedY = squareBottomY - height;
        if (Math.abs(x - squareLeftX) < snapThreshold) snappedX = squareLeftX;
        if (Math.abs(x + width - squareRightX) < snapThreshold) snappedX = squareRightX - width;
        
        // Snap to square guide centers (vertical and horizontal)
        if (Math.abs(centerX - squareCenterX) < snapThreshold) snappedX = squareCenterX - width / 2;
        if (Math.abs(centerY - squareCenterY) < snapThreshold) snappedY = squareCenterY - height / 2;
        
        // Snap to square guide corners (all four corners)
        if (Math.abs(x - squareLeftX) < snapThreshold && Math.abs(y - squareTopY) < snapThreshold) {
            snappedX = squareLeftX;
            snappedY = squareTopY;
        }
        if (Math.abs(x + width - squareRightX) < snapThreshold && Math.abs(y - squareTopY) < snapThreshold) {
            snappedX = squareRightX - width;
            snappedY = squareTopY;
        }
        if (Math.abs(x - squareLeftX) < snapThreshold && Math.abs(y + height - squareBottomY) < snapThreshold) {
            snappedX = squareLeftX;
            snappedY = squareBottomY - height;
        }
        if (Math.abs(x + width - squareRightX) < snapThreshold && Math.abs(y + height - squareBottomY) < snapThreshold) {
            snappedX = squareRightX - width;
            snappedY = squareBottomY - height;
        }
        
        // Snap element centers to square guide edges
        if (Math.abs(centerX - squareLeftX) < snapThreshold) snappedX = squareLeftX - width / 2;
        if (Math.abs(centerX - squareRightX) < snapThreshold) snappedX = squareRightX - width / 2;
        if (Math.abs(centerY - squareTopY) < snapThreshold) snappedY = squareTopY - height / 2;
        if (Math.abs(centerY - squareBottomY) < snapThreshold) snappedY = squareBottomY - height / 2;
        
        // ENHANCED: Snap to bottom side of upper square guide and top side of lower square guide
        // This means object bottom to square top, and object top to square bottom
        if (Math.abs(y + height - squareTopY) < snapThreshold) snappedY = squareTopY - height; // Object bottom to top of square guide
        if (Math.abs(y - squareBottomY) < snapThreshold) snappedY = squareBottomY; // Object top to bottom of square guide
        
        // 4:5 POST GUIDE SNAPPING
        
        // Snap to post guide edges (top, bottom, left, right)
        if (Math.abs(y - postTopY) < snapThreshold) snappedY = postTopY;
        if (Math.abs(y + height - postBottomY) < snapThreshold) snappedY = postBottomY - height;
        if (Math.abs(x - postLeftX) < snapThreshold) snappedX = postLeftX;
        if (Math.abs(x + width - postRightX) < snapThreshold) snappedX = postRightX - width;
        
        // Snap to post guide centers (vertical and horizontal)
        if (Math.abs(centerX - postCenterX) < snapThreshold) snappedX = postCenterX - width / 2;
        if (Math.abs(centerY - postCenterY) < snapThreshold) snappedY = postCenterY - height / 2;
        
        // Snap to post guide corners (all four corners)
        if (Math.abs(x - postLeftX) < snapThreshold && Math.abs(y - postTopY) < snapThreshold) {
            snappedX = postLeftX;
            snappedY = postTopY;
        }
        if (Math.abs(x + width - postRightX) < snapThreshold && Math.abs(y - postTopY) < snapThreshold) {
            snappedX = postRightX - width;
            snappedY = postTopY;
        }
        if (Math.abs(x - postLeftX) < snapThreshold && Math.abs(y + height - postBottomY) < snapThreshold) {
            snappedX = postLeftX;
            snappedY = postBottomY - height;
        }
        if (Math.abs(x + width - postRightX) < snapThreshold && Math.abs(y + height - postBottomY) < snapThreshold) {
            snappedX = postRightX - width;
            snappedY = postBottomY - height;
        }
        
        // Snap element centers to post guide edges
        if (Math.abs(centerX - postLeftX) < snapThreshold) snappedX = postLeftX - width / 2;
        if (Math.abs(centerX - postRightX) < snapThreshold) snappedX = postRightX - width / 2;
        if (Math.abs(centerY - postTopY) < snapThreshold) snappedY = postTopY - height / 2;
        if (Math.abs(centerY - postBottomY) < snapThreshold) snappedY = postBottomY - height / 2;
        
        // ENHANCED: Snap to bottom side of upper post guide and top side of lower post guide
        if (Math.abs(y + height - postTopY) < snapThreshold) snappedY = postTopY - height; // Object bottom to top of post guide
        if (Math.abs(y - postBottomY) < snapThreshold) snappedY = postBottomY; // Object top to bottom of post guide
        
        // 9:16 STORIES GUIDE SNAPPING (entire slide)
        // Note: Stories guide uses the entire slide, so we already snap to its edges above
        // But we can add specific center snapping for stories
        
        const storiesCenterY = 960; // 1920 / 2
        
        if (Math.abs(centerY - storiesCenterY) < snapThreshold) {
            snappedY = storiesCenterY - height / 2;
        }
        
        // ENHANCED: Snap to stories guide edges (top and bottom of entire slide)
        if (Math.abs(y + height - 0) < snapThreshold) snappedY = 0 - height; // Object bottom to top of stories guide
        if (Math.abs(y - 1920) < snapThreshold) snappedY = 1920; // Object top to bottom of stories guide
    }
    
    // ENHANCED: Snap to other elements (images and text) - ALL edges, centers, and corners
    const otherElements = layerState.layers.filter(layer => 
        layer.element !== layerState.selectedLayer && 
        layer.element.style.display !== 'none'
    );
    
    otherElements.forEach(otherLayer => {
        const otherElement = otherLayer.element;
        const otherX = parseInt(otherElement.style.left) || 0;
        const otherY = parseInt(otherElement.style.top) || 0;
        const otherWidth = otherElement.offsetWidth;
        const otherHeight = otherElement.offsetHeight;
        const otherCenterX = otherX + otherWidth / 2;
        const otherCenterY = otherY + otherHeight / 2;
        
        // Snap to other element's edges (left, right, top, bottom)
        if (Math.abs(x - otherX) < snapThreshold) snappedX = otherX; // Left edge
        if (Math.abs(x + width - (otherX + otherWidth)) < snapThreshold) snappedX = otherX + otherWidth - width; // Right edge
        if (Math.abs(y - otherY) < snapThreshold) snappedY = otherY; // Top edge
        if (Math.abs(y + height - (otherY + otherHeight)) < snapThreshold) snappedY = otherY + otherHeight - height; // Bottom edge
        
        // Snap to other element's center
        if (Math.abs(centerX - otherCenterX) < snapThreshold) snappedX = otherCenterX - width / 2;
        if (Math.abs(centerY - otherCenterY) < snapThreshold) snappedY = otherCenterY - height / 2;
        
        // Snap to other element's corners (all four corners)
        if (Math.abs(x - otherX) < snapThreshold && Math.abs(y - otherY) < snapThreshold) {
            snappedX = otherX;
            snappedY = otherY;
        }
        if (Math.abs(x + width - (otherX + otherWidth)) < snapThreshold && Math.abs(y - otherY) < snapThreshold) {
            snappedX = otherX + otherWidth - width;
            snappedY = otherY;
        }
        if (Math.abs(x - otherX) < snapThreshold && Math.abs(y + height - (otherY + otherHeight)) < snapThreshold) {
            snappedX = otherX;
            snappedY = otherY + otherHeight - height;
        }
        if (Math.abs(x + width - (otherX + otherWidth)) < snapThreshold && Math.abs(y + height - (otherY + otherHeight)) < snapThreshold) {
            snappedX = otherX + otherWidth - width;
            snappedY = otherY + otherHeight - height;
        }
        
        // Snap element centers to other element's edges
        if (Math.abs(centerX - otherX) < snapThreshold) snappedX = otherX - width / 2;
        if (Math.abs(centerX - (otherX + otherWidth)) < snapThreshold) snappedX = otherX + otherWidth - width / 2;
        if (Math.abs(centerY - otherY) < snapThreshold) snappedY = otherY - height / 2;
        if (Math.abs(centerY - (otherY + otherHeight)) < snapThreshold) snappedY = otherY + otherHeight - height / 2;
        
        // Snap element corners to other element's centers
        if (Math.abs(x - otherCenterX) < snapThreshold) snappedX = otherCenterX;
        if (Math.abs(x + width - otherCenterX) < snapThreshold) snappedX = otherCenterX - width;
        if (Math.abs(y - otherCenterY) < snapThreshold) snappedY = otherCenterY;
        if (Math.abs(y + height - otherCenterY) < snapThreshold) snappedY = otherCenterY - height;
        
        // ENHANCED: Snap to bottom side of upper element and top side of lower element
        if (Math.abs(y + height - otherY) < snapThreshold) snappedY = otherY - height; // Object bottom to top of other element
        if (Math.abs(y - (otherY + otherHeight)) < snapThreshold) snappedY = otherY + otherHeight; // Object top to bottom of other element
    });
    
    return { x: snappedX, y: snappedY };
}
// ENHANCED: Layer order functions with state saving
function moveLayerToTop() {
    if (!layerState.selectedLayer) return;
    saveState();
    
    const newZIndex = layerState.nextZIndex++;
    layerState.selectedLayer.style.zIndex = newZIndex;
    
    const layerIndex = layerState.layers.findIndex(function(layer) {
        return layer.element === layerState.selectedLayer;
    });
    if (layerIndex !== -1) {
        layerState.layers[layerIndex].zIndex = newZIndex;
    }
}

function moveLayerUp() {
    if (!layerState.selectedLayer) return;
    saveState();
    
    const currentZIndex = parseInt(layerState.selectedLayer.style.zIndex);
    const newZIndex = currentZIndex + 1;
    layerState.selectedLayer.style.zIndex = newZIndex;
    
    const layerIndex = layerState.layers.findIndex(function(layer) {
        return layer.element === layerState.selectedLayer;
    });
    if (layerIndex !== -1) {
        layerState.layers[layerIndex].zIndex = newZIndex;
    }
}

function moveLayerDown() {
    if (!layerState.selectedLayer) return;
    saveState();
    
    const currentZIndex = parseInt(layerState.selectedLayer.style.zIndex);
    if (currentZIndex > 10) {
        const newZIndex = currentZIndex - 1;
        layerState.selectedLayer.style.zIndex = newZIndex;
        
        const layerIndex = layerState.layers.findIndex(function(layer) {
            return layer.element === layerState.selectedLayer;
        });
        if (layerIndex !== -1) {
            layerState.layers[layerIndex].zIndex = newZIndex;
        }
    }
}

function moveLayerToBottom() {
    if (!layerState.selectedLayer) return;
    saveState();
    
    layerState.selectedLayer.style.zIndex = '10';
    
    const layerIndex = layerState.layers.findIndex(function(layer) {
        return layer.element === layerState.selectedLayer;
    });
    if (layerIndex !== -1) {
        layerState.layers[layerIndex].zIndex = 10;
    }
}

function updateLayerOrderButtons() {
    const moveToTopBtn = document.getElementById('ss-moveToTopBtn');
    const moveUpBtn = document.getElementById('ss-moveUpBtn');
    const moveDownBtn = document.getElementById('ss-moveDownBtn');
    const moveToBottomBtn = document.getElementById('ss-moveToBottomBtn');
    
    if (!layerState.selectedLayer) {
        [moveToTopBtn, moveUpBtn, moveDownBtn, moveToBottomBtn].forEach(function(btn) {
            if (btn) {
                btn.disabled = true;
                btn.style.opacity = '0.3';
                btn.style.cursor = 'not-allowed';
            }
        });
        return;
    }
    
    [moveToTopBtn, moveUpBtn, moveDownBtn, moveToBottomBtn].forEach(function(btn) {
        if (btn) {
            btn.disabled = false;
            btn.style.opacity = '0.7';
            btn.style.cursor = 'pointer';
        }
    });
}

// Expose for cross-module updates (e.g., image selection changes)
window.updateLayerOrderButtons = updateLayerOrderButtons;

function updateImageToolButtons() {
    const imageToolButtons = [
        'ss-flipHorizontalBtn',
        'ss-flipVerticalBtn',
        'ss-duplicateImageBtn',
        'ss-deleteImageBtn',
        'ss-replaceImageBtn',
        'ss-lockImageBtn',
        'ss-polaroidFrameBtn',
        'ss-addFrameBtn',
        'ss-dropShadowBtn',
        'ss-grayscaleBtn',
        'ss-copyStyleBtn',
        'ss-adjustImageBtn',
        'ss-pasteStyleBtn',
        'ss-selectMultipleBtn',
        'ss-groupBtn'
    ];
    
    const selectedImage = window.SSImageTransform && window.SSImageTransform.getSelectedImage && window.SSImageTransform.getSelectedImage();
    const hasSelectedImage = !!selectedImage;
    const isLocked = selectedImage && selectedImage.locked;
    
    imageToolButtons.forEach(function(btnId) {
        const btn = document.getElementById(btnId);
        if (btn) {
            // Remove any background styling
            btn.style.background = 'none';
            
            // Lock button is always available when image is selected
            if (btnId === 'ss-lockImageBtn' && hasSelectedImage) {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
            }
            // When locked, only lock button is available
            else if (isLocked) {
                btn.disabled = true;
                btn.style.opacity = '0.3';
                btn.style.cursor = 'not-allowed';
            }
            // When no image selected, all disabled
            else if (!hasSelectedImage) {
                btn.disabled = true;
                btn.style.opacity = '0.3';
                btn.style.cursor = 'not-allowed';
            }
            // When image selected and not locked, all enabled
            else {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
            }
        }
    });
}

// Make updateImageToolButtons globally accessible
window.updateImageToolButtons = updateImageToolButtons;

function initializeGlobalClickHandler() {
    document.addEventListener('click', function(e) {
        const designerCanvas = document.getElementById('ss-designer-canvas');
        const sidebar = document.getElementById('ss-sidebar');
        
        if (!designerCanvas || !sidebar) return;
        
        const isClickOnCanvas = designerCanvas.contains(e.target);
        const isClickOnSidebar = sidebar.contains(e.target);
        const isClickOnCanvasBackground = e.target === designerCanvas;
        
        if (!isClickOnCanvas && !isClickOnSidebar) {
            deselectAllLayers();
        } else if (isClickOnCanvasBackground) {
            deselectAllLayers();
        }
    });
}

function deselectAllLayers() {
    document.querySelectorAll('.ss-image-element, .ss-text-element').forEach(function(el) {
        el.classList.remove('selected');
        const resizeHandles = getResizeHandlesForElement(el);
        if (resizeHandles) {
            resizeHandles.style.display = 'none';
        }
    });
    // Also clear multi-select mode when global deselect happens
    try { clearMultiSelectMode(); } catch (err) {}
    layerState.selectedLayer = null;
    updateLayerOrderButtons();
}

// Ensure multi-select mode is cleared when clicking outside or deselecting
function clearMultiSelectMode() {
    if (typeof multiSelectState !== 'undefined' && multiSelectState && multiSelectState.active) {
        multiSelectState.selected.forEach(function(el) { el.classList.remove('multi-selected'); });
        multiSelectState.selected = [];
        multiSelectState.active = false;
        const selBtn = document.getElementById('ss-selectMultipleBtn');
        if (selBtn) selBtn.classList.remove('ss-active');
    }
}

// --- Export / Backup / Template Utilities ---
function loadScript(url) {
    return new Promise(function(resolve, reject) {
        if (document.querySelector('script[src="' + url + '"]')) return resolve();
        const s = document.createElement('script');
        s.src = url;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function generateSlideCanvasBlob(slideIndex, targetW, targetH) {
    return new Promise(function(resolve) {
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');

        // Fill background
        const designerCanvas = document.getElementById('ss-designer-canvas');
        const bg = (designerCanvas && designerCanvas.style.backgroundColor) ? designerCanvas.style.backgroundColor : '#ffffff';
        ctx.fillStyle = bg;
        ctx.fillRect(0,0,canvas.width, canvas.height);

        const slideLeft = slideIndex * 1080;
        const slideWidth = 1080;
        const scaleX = targetW / slideWidth;
        const scaleY = targetH / (targetH ? targetH : targetW);
        const scale = scaleX; // preserve x-based scaling for consistency

        const layersToDraw = layerState.layers.filter(l => l.element && l.element.style.display !== 'none');

        // Draw images and text simply (no rotation)
        const drawNext = function(i) {
            if (i >= layersToDraw.length) {
                canvas.toBlob(function(blob) { resolve(blob); }, 'image/png');
                return;
            }
            const layer = layersToDraw[i];
            try {
                const left = (layer.position && typeof layer.position.left === 'number') ? layer.position.left : (parseInt(layer.element.style.left) || 0);
                const top = (layer.position && typeof layer.position.top === 'number') ? layer.position.top : (parseInt(layer.element.style.top) || 0);
                const width = (layer.size && layer.size.width) ? layer.size.width : (layer.element.offsetWidth || parseInt(layer.element.style.width) || 0);
                const height = (layer.size && layer.size.height) ? layer.size.height : (layer.element.offsetHeight || parseInt(layer.element.style.height) || 0);

                const relLeft = left - slideLeft;
                const relTop = top;

                // Skip if not visible in this slide
                if (relLeft + width < 0 || relLeft > slideWidth) {
                    drawNext(i+1);
                    return;
                }

                if (layer.type === 'image') {
                    const imgEl = layer.imageElement || layer.element.querySelector('img');
                    if (imgEl && imgEl.src) {
                        const img = new Image();
                        img.onload = function() {
                            ctx.drawImage(img, Math.round(relLeft * scale), Math.round(relTop * scale), Math.round(width * scale), Math.round(height * scale));
                            drawNext(i+1);
                        };
                        img.onerror = function() { drawNext(i+1); };
                        img.src = imgEl.src;
                        return;
                    }
                } else if (layer.type === 'polaroid') {
                    // Draw a simple frame then draw inner image(s)
                    // draw frame as white rect with slight shadow
                    ctx.save();
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(Math.round(relLeft * scale), Math.round(relTop * scale), Math.round(width * scale), Math.round(height * scale));
                    ctx.restore();
                    // Find inner image layer
                    const inner = layerState.layers.find(l => l.parentPolaroid === layer.id);
                    if (inner && inner.imageElement && inner.imageElement.src) {
                        const img = new Image();
                        img.onload = function() {
                            // compute inner position relative to polaroid window base (we assume base.windowLeft/windowTop)
                            const base = layer.base || { windowLeft:45, windowTop:90 };
                            const winLeft = (base.windowLeft || 45);
                            const winTop = (base.windowTop || 90);
                            const innerRelLeft = relLeft + winLeft;
                            const innerRelTop = relTop + winTop;
                            ctx.drawImage(img, Math.round(innerRelLeft * scale), Math.round(innerRelTop * scale), Math.round((inner.size.width||img.width) * scale), Math.round((inner.size.height||img.height) * scale));
                            drawNext(i+1);
                        };
                        img.onerror = function() { drawNext(i+1); };
                        img.src = inner.imageElement.src;
                        return;
                    }
                } else if (layer.type === 'text') {
                    const text = layer.element.textContent || '';
                    const fontSize = parseInt(layer.element.style.fontSize) || (layer.fontSize || 24);
                    ctx.save();
                    ctx.fillStyle = layer.element.style.color || '#000';
                    ctx.font = (fontSize * scale) + 'px ' + (layer.element.style.fontFamily || 'Arial');
                    ctx.textAlign = layer.element.style.textAlign || 'left';
                    // simple single-line draw at top-left
                    const x = Math.round(relLeft * scale) + 10;
                    const y = Math.round(relTop * scale) + Math.round((fontSize * scale));
                    wrapText(ctx, text, x, y, Math.round(width * scale) - 20, Math.round(fontSize * scale));
                    ctx.restore();
                    drawNext(i+1);
                    return;
                }
            } catch (err) {
                // ignore drawing errors per layer
            }
            drawNext(i+1);
        };

        drawNext(0);
    });
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(/\s+/);
    let line = '';
    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
            ctx.fillText(line, x, y);
            line = words[n] + ' ';
            y += lineHeight;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line, x, y);
}

function exportCanvasZip(filename) {
    return (async function() {
        filename = filename || ('slide_export_' + Date.now() + '.zip');
        const jszipUrl = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
        try {
            await loadScript(jszipUrl);
        } catch (err) {
            console.error('Failed to load JSZip:', err);
            throw err;
        }

        if (typeof JSZip === 'undefined') {
            throw new Error('JSZip not available');
        }

        const zip = new JSZip();
        const sizes = [
            { name: 'Square', w:1080, h:1080 },
            { name: 'Post', w:1080, h:1350 },
            { name: 'Stories', w:1080, h:1920 },
            { name: 'Fullwidth', w: canvasState.width, h: canvasState.height }
        ];

        const sections = Math.max(1, canvasState.sections || 1);

        for (const size of sizes) {
            const folder = zip.folder(size.name);
            for (let s = 0; s < sections; s++) {
                if (size.name === 'Fullwidth' && s > 0) break; // only one fullwidth export
                const slideIndex = (size.name === 'Fullwidth') ? 0 : s;
                try {
                    const blob = await generateSlideCanvasBlob(slideIndex, size.w, size.h);
                    const arrayBuffer = await blob.arrayBuffer();
                    const fileName = 'slide_' + (s+1) + '.png';
                    folder.file(fileName, arrayBuffer);
                } catch (err) {
                    console.warn('Skipping slide export for', size.name, 'slide', s+1, err);
                }
            }
        }

        const content = await zip.generateAsync({ type: 'blob' });
        downloadBlob(content, filename);
    })();
}

// Backup: download JSON of current state (includes image src data URLs when available)
function downloadBackup(filename) {
    filename = filename || ('slide_backup_' + Date.now() + '.json');
    const exportState = {
        canvasState: canvasState,
        layers: layerState.layers.map(function(l) {
            const copy = Object.assign({}, l);
            // include element-specific state and image data if available
            copy.elementState = {
                left: l.element ? parseInt(l.element.style.left) || 0 : (l.position && l.position.left) || 0,
                top: l.element ? parseInt(l.element.style.top) || 0 : (l.position && l.position.top) || 0,
                width: l.element ? (l.element.offsetWidth || parseInt(l.element.style.width) || 0) : (l.size && l.size.width) || 0,
                height: l.element ? (l.element.offsetHeight || parseInt(l.element.style.height) || 0) : (l.size && l.size.height) || 0,
                display: l.element ? (l.element.style.display || '') : ''
            };
            if (l.imageElement && l.imageElement.src) copy.imageData = l.imageElement.src;
            return copy;
        }),
        history: {
            undoStack: historyState.undoStack || [],
            redoStack: historyState.redoStack || []
        }
    };
    const blob = new Blob([JSON.stringify(exportState, null, 2)], { type: 'application/json' });
    downloadBlob(blob, filename);
}

// Templates: save to localStorage and load
function saveTemplate(name) {
    // prompt for name if not provided
    if (!name) name = window.prompt('Enter template name', 'template_' + Date.now());
    if (!name) {
        console.warn('Template save cancelled - no name provided');
        return;
    }
    const templates = JSON.parse(localStorage.getItem('ss_templates') || '[]');
    const exportState = {
        canvasState: canvasState,
        layers: layerState.layers.map(function(l) {
            const copy = Object.assign({}, l);
            if (l.imageElement && l.imageElement.src) copy.imageData = l.imageElement.src;
            // persist element style/visibility
            copy.elementState = {
                left: l.element ? parseInt(l.element.style.left) || 0 : (l.position && l.position.left) || 0,
                top: l.element ? parseInt(l.element.style.top) || 0 : (l.position && l.position.top) || 0,
                width: l.element ? (l.element.offsetWidth || parseInt(l.element.style.width) || 0) : (l.size && l.size.width) || 0,
                height: l.element ? (l.element.offsetHeight || parseInt(l.element.style.height) || 0) : (l.size && l.size.height) || 0,
                display: l.element ? (l.element.style.display || '') : ''
            };
            return copy;
        })
    };
    templates.push({ name: name, state: exportState, created: Date.now() });
    localStorage.setItem('ss_templates', JSON.stringify(templates));
}

function listTemplates() {
    return JSON.parse(localStorage.getItem('ss_templates') || '[]');
}

function loadTemplateByName(name) {
    const templates = listTemplates();
    const t = templates.find(x => x.name === name);
    if (t && t.state) {
        restoreState(t.state);
    }
}

function loadBackupFromFile(file) {
    return new Promise(function(resolve, reject) {
        const reader = new FileReader();
        reader.onload = function(ev) {
            try {
                const json = JSON.parse(ev.target.result);
                restoreState(json);
                resolve();
            } catch (err) { reject(err); }
        };
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

// Open file dialog to load a backup JSON and restore it
function openLoadBackupDialog() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.addEventListener('change', function(e) {
        const file = input.files && input.files[0];
        if (!file) return;
        loadBackupFromFile(file).then(function() {
            console.log('Backup loaded');
        }).catch(function(err) {
            console.error('Failed to load backup', err);
        });
    });
    input.click();
}

// Open file dialog to load a template JSON and restore it
function openLoadTemplateDialog() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.addEventListener('change', function(e) {
        const file = input.files && input.files[0];
        if (!file) return;
        loadBackupFromFile(file).then(function() {
            console.log('Template loaded');
        }).catch(function(err) {
            console.error('Failed to load template', err);
        });
    });
    input.click();
}

// Export functions for potential use elsewhere
window.Designer = {
    initializeDesignerWorkspace: initializeDesignerWorkspace,
    addSection: addSection,
    removeSection: removeSection,
    updateSectionCount: updateSectionCount,
    updateResolutionDisplay: updateResolutionDisplay,
    updateButtonStates: updateButtonStates,
    toggleGuidance: toggleGuidance,
    getCanvasState: function() { return canvasState; },
    getGuidanceState: function() { return guidanceState; },
    getMagnetState: function() { return magnetState; },
    getLayerState: function() { return layerState; },
    getHistoryState: function() { return historyState; }
};
// Expose export/backup/template functions
window.Designer.exportCanvasZip = exportCanvasZip;
window.Designer.downloadBackup = downloadBackup;
window.Designer.saveTemplate = saveTemplate;
window.Designer.listTemplates = listTemplates;
window.Designer.loadTemplateByName = loadTemplateByName;
window.Designer.loadBackupFromFile = loadBackupFromFile;
window.Designer.openLoadBackupDialog = openLoadBackupDialog;
window.Designer.openLoadTemplateDialog = openLoadTemplateDialog;