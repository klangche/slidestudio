// Layer manipulation, layer-order tools and designer UI initializers (color/upload/transparency).
import { layerState, canvasState, guidanceState } from './state.js';
import { saveState } from './history.js';
import { updateSlideSeparatorColors, updateGuidanceTransparency } from './guidance.js';
import { makeElementDraggable, makeElementSelectable, selectLayer, updateLayerOrderButtons } from './selection.js';
import { setupRotationHandler, getResizeHandlesForElement } from './ui-helpers.js';

// ENHANCED: Delete function that hides instead of removes
export function deleteSelectedLayer() {
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

export function getSelectedImageLayer() {
    const el = layerState.selectedLayer;
    if (!el) return null;
    const idx = layerState.layers.findIndex(l => l.element === el);
    if (idx === -1) return null;
    const layer = layerState.layers[idx];
    if (layer.type !== 'image') return null;
    return { layer, idx };
}

export function flipSelectedImageHorizontal() {
    const sel = getSelectedImageLayer();
    if (!sel) return;
    const { layer } = sel;
    const current = layer.element.style.transform || '';
    const hasScaleXNeg = /scaleX\(-1\)/.test(current);
    const newTransform = hasScaleXNeg ? current.replace(/scaleX\(-1\)/, '').trim() : (current + ' scaleX(-1)').trim();
    layer.element.style.transform = newTransform;
    saveState();
}

export function flipSelectedImageVertical() {
    const sel = getSelectedImageLayer();
    if (!sel) return;
    const { layer } = sel;
    const current = layer.element.style.transform || '';
    const hasScaleYNeg = /scaleY\(-1\)/.test(current);
    const newTransform = hasScaleYNeg ? current.replace(/scaleY\(-1\)/, '').trim() : (current + ' scaleY(-1)').trim();
    layer.element.style.transform = newTransform;
    saveState();
}

export function duplicateSelectedImageLayer() {
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

export function replaceSelectedImage() {
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

export function toggleLockSelectedImage() {
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

export function toggleDropShadowSelectedImage() {
    const sel = getSelectedImageLayer();
    if (!sel) return;
    const { layer } = sel;
    const el = layer.element;
    const hasShadow = el.style.boxShadow && el.style.boxShadow !== '';
    el.style.boxShadow = hasShadow ? '' : '0 8px 24px rgba(0,0,0,0.25)';
    saveState();
}

export function toggleGrayscaleSelectedImage() {
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

export function moveLayerToTop() {
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

export function moveLayerUp() {
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

export function moveLayerDown() {
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

export function moveLayerToBottom() {
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

export function updateImageToolButtons() {
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
    
    // text2 boxes are image-like: delete/duplicate/lock work on the active box,
    // the image-only tools (flips, replace, frames, shadow, ...) stay disabled.
    const sel = layerState.selectedLayer;
    const isText2Selected = !!(sel && sel.classList && sel.classList.contains('ss-text2-element'));
    const isText2Locked = isText2Selected && sel.dataset && sel.dataset.text2Locked === '1';
    const text2Allowed = ['ss-duplicateImageBtn', 'ss-deleteImageBtn', 'ss-lockImageBtn'];
    
    imageToolButtons.forEach(function(btnId) {
        const btn = document.getElementById(btnId);
        if (btn) {
            // Remove any background styling
            btn.style.background = 'none';
            
            if (isText2Selected) {
                const enabled = btnId === 'ss-lockImageBtn' || (text2Allowed.indexOf(btnId) !== -1 && !isText2Locked);
                btn.disabled = !enabled;
                btn.style.opacity = enabled ? '1' : '0.3';
                btn.style.cursor = enabled ? 'pointer' : 'not-allowed';
                return;
            }
            
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

export function updateCanvasColor(hexColor) {
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

export function initializeUploadFunctionality() {
    const uploadImagesBtn = document.getElementById('ss-uploadImagesBtn');
    
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
}

export function initializeTransparencySlider() {
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

export function cleanupImagesOutsideCanvas() {
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
