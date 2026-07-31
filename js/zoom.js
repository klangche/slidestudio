// Zoom functionality: slider, wheel, pinch gestures and canvas scaling.
import { canvasState, freeMoveState } from './state.js';

let zoomState = {
    isOver50Percent: false
};

export function initializeZoomFunctionality() {
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

export function setInitialZoom() {
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

export function setZoomLevel(zoomLevel, mouseX, mouseY) {
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
