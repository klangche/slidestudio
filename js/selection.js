// Selection, dragging, multi-select, grouping and free-move behavior.
import { layerState, magnetState, freeMoveState } from './state.js';
import { saveState } from './history.js';
import { snapToGuidelines } from './guidance.js';
import { getResizeHandlesForElement } from './ui-helpers.js';

// Simple drag state
let dragState = {
    isDragging: false,
    dragElement: null,
    startX: 0,
    startY: 0,
    elementStartX: 0,
    elementStartY: 0
};

// Multi-select state (moved from imgtxt.js here so selection logic is centralized)
let multiSelectState = {
    active: false,
    selected: []
};

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

export function makeElementDraggable(element) {
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

export function makeElementSelectable(element) {
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

export function selectLayer(element) {
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

export function updateImageToolUIForSelection() {
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
export function toggleMultiSelectMode() {
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
export function groupElements(elements) {
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

export function ungroupLayer(groupLayer) {
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

export function toggleGroupSelected() {
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
function applyFreeMoveUI(active) {
    const freeMoveBtn = document.getElementById('ss-freeMoveBtn');
    const canvasContainer = document.getElementById('ss-canvasContainer');
    if (freeMoveBtn) freeMoveBtn.classList.toggle('ss-active', active);
    if (canvasContainer) {
        canvasContainer.style.cursor = active ? 'grab' : '';
        canvasContainer.classList.toggle('ss-free-move-active', active);
    }
}

export function enableFreeMove() {
    if (freeMoveState.active) return;
    const canvasContainer = document.getElementById('ss-canvasContainer');
    if (!canvasContainer) return;
    freeMoveState.active = true;
    canvasContainer.addEventListener('mousedown', startFreeMove);
    document.addEventListener('mouseup', stopFreeMove);
    applyFreeMoveUI(true);
}

export function disableFreeMove() {
    if (!freeMoveState.active) return;
    const canvasContainer = document.getElementById('ss-canvasContainer');
    if (canvasContainer) {
        canvasContainer.removeEventListener('mousedown', startFreeMove);
        canvasContainer.style.cursor = '';
        canvasContainer.classList.remove('ss-free-move-active');
    }
    document.removeEventListener('mouseup', stopFreeMove);
    freeMoveState.active = false;
    const freeMoveBtn = document.getElementById('ss-freeMoveBtn');
    if (freeMoveBtn) freeMoveBtn.classList.remove('ss-active');
}

export function toggleFreeMove() {
    if (freeMoveState.active) disableFreeMove(); else enableFreeMove();
}

function startFreeMove(e) {
    if (!freeMoveState.active) return;
    if (e.button !== 0) return; // left button only; middle button has its own pan
    
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

// ============================================================================
// FREE MOVE SHORTCUTS (space bar + middle mouse button pan)
// ============================================================================

let spacePanActive = false;

const middlePan = {
    active: false,
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    startScrollTop: 0
};

function isTypingTarget(target) {
    return !!(target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable));
}

function hasSelection() {
    if (layerState.selectedLayer) return true;
    if (window.SSImageTransform && typeof window.SSImageTransform.hasSelectedImage === 'function' && window.SSImageTransform.hasSelectedImage()) return true;
    const textPopup = document.getElementById('ss-textPopup');
    if (textPopup && textPopup.style.display !== 'none') return true;
    return false;
}

export function initializeFreeMoveShortcuts() {
    const canvasContainer = document.getElementById('ss-canvasContainer');

    // Space (hold) to temporarily enable free move when nothing is selected.
    document.addEventListener('keydown', function(e) {
        if (e.code !== 'Space') return;
        if (isTypingTarget(e.target)) return;
        if (e.target.tagName === 'BUTTON') return; // let space activate buttons
        if (!freeMoveState.active && !hasSelection()) {
            e.preventDefault();
            enableFreeMove();
            spacePanActive = true;
        } else if (!isTypingTarget(e.target)) {
            e.preventDefault(); // stop page/container scroll while space is held
        }
    });

    document.addEventListener('keyup', function(e) {
        if (e.code !== 'Space') return;
        if (spacePanActive) {
            spacePanActive = false;
            disableFreeMove();
        }
    });

    // Middle mouse button (button 1) pans the canvas without activating free move.
    // Capture phase so it wins over image/text drag handlers.
    if (canvasContainer) {
        canvasContainer.addEventListener('mousedown', function(e) {
            if (e.button !== 1) return;
            e.preventDefault();
            e.stopPropagation();
            middlePan.active = true;
            middlePan.startX = e.clientX;
            middlePan.startY = e.clientY;
            middlePan.startScrollLeft = canvasContainer.scrollLeft;
            middlePan.startScrollTop = canvasContainer.scrollTop;
            canvasContainer.style.cursor = 'grabbing';
            document.addEventListener('mousemove', onMiddlePanMove);
            document.addEventListener('mouseup', onMiddlePanUp);
        }, true);

        document.addEventListener('mouseup', onMiddlePanUp);
    }
}

function onMiddlePanMove(e) {
    if (!middlePan.active) return;
    const canvasContainer = document.getElementById('ss-canvasContainer');
    if (!canvasContainer) return;
    canvasContainer.scrollLeft = middlePan.startScrollLeft - (e.clientX - middlePan.startX);
    canvasContainer.scrollTop = middlePan.startScrollTop - (e.clientY - middlePan.startY);
}

function onMiddlePanUp() {
    if (!middlePan.active) return;
    middlePan.active = false;
    const canvasContainer = document.getElementById('ss-canvasContainer');
    if (canvasContainer && !freeMoveState.active) {
        canvasContainer.style.cursor = '';
    }
    document.removeEventListener('mousemove', onMiddlePanMove);
    document.removeEventListener('mouseup', onMiddlePanUp);
}

export function initializeGlobalClickHandler() {
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

export function deselectAllLayers() {
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
export function clearMultiSelectMode() {
    if (typeof multiSelectState !== 'undefined' && multiSelectState && multiSelectState.active) {
        multiSelectState.selected.forEach(function(el) { el.classList.remove('multi-selected'); });
        multiSelectState.selected = [];
        multiSelectState.active = false;
        const selBtn = document.getElementById('ss-selectMultipleBtn');
        if (selBtn) selBtn.classList.remove('ss-active');
    }
}

export function updateLayerOrderButtons() {
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
