// Zoom functionality: slider, wheel, pinch gestures and canvas scaling.
import { canvasState } from './state.js';

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
        sliderThumb.style.left = (position * 100) + '%';
        sliderFill.style.width = (position * 100) + '%';
        updateCanvasZoom();
    }
    
    slider.addEventListener('click', function(e) {
        const sliderRect = slider.getBoundingClientRect();
        let position = (e.clientX - sliderRect.left) / sliderRect.width;
        position = Math.max(0, Math.min(1, position));
        currentZoom = position;
        sliderThumb.style.left = (position * 100) + '%';
        sliderFill.style.width = (position * 100) + '%';
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
    const sliderThumb = document.getElementById('ss-sliderThumb');
    const sliderFill = document.getElementById('ss-sliderFill');
    const ticks = slider.querySelectorAll('.ss-tick');
    ticks.forEach(function(tick, index) {
        tick.addEventListener('click', function(e) {
            e.stopPropagation();
            const position = index / (ticks.length - 1);
            if (sliderThumb) sliderThumb.style.left = (position * 100) + '%';
            if (sliderFill) sliderFill.style.width = (position * 100) + '%';
            updateCanvasZoom();
        });
    });
}

function updateZoomVisuals(scale) {
    const sliderThumb = document.getElementById('ss-sliderThumb');
    const sliderFill = document.getElementById('ss-sliderFill');
    const zoomValue = document.getElementById('ss-zoomValue');
    
    if (!sliderThumb || !sliderFill) return;
    
    // The slider track maps the 0.05..0.5 scale range; values above 0.5
    // (reachable via wheel) saturate the thumb at the right end.
    const minScale = 0.05;
    const maxScale = 0.5;
    const sliderPosition = Math.max(0, Math.min(1, (scale - minScale) / (maxScale - minScale)));
    const thumbPosition = sliderPosition * 100;
    sliderThumb.style.left = thumbPosition + '%';
    sliderFill.style.width = thumbPosition + '%';
    
    if (zoomValue) {
        const displayValue = Math.round(scale * 100);
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

function getCanvasScale() {
    const designerCanvas = document.getElementById('ss-designer-canvas');
    if (!designerCanvas) return 1;
    const m = /scale\(([^)]+)\)/.exec(designerCanvas.style.transform || '');
    return m ? parseFloat(m[1]) : 1;
}

// Keep the designer canvas at its layout size and let the wrapper (ss-canvasScroll)
// define the scrollable area as the *scaled* canvas size, so scrolling and edge
// clamping always match the visible canvas edges.
function updateCanvasTransform(scale) {
    const designerCanvas = document.getElementById('ss-designer-canvas');
    const scrollWrapper = document.getElementById('ss-canvasScroll');
    if (!designerCanvas) return;
    const W = canvasState.width;
    const H = canvasState.height;
    designerCanvas.style.width = W + 'px';
    designerCanvas.style.height = H + 'px';
    designerCanvas.style.transform = 'scale(' + scale + ')';
    designerCanvas.style.setProperty('--ss-zoom', scale);
    if (scrollWrapper) {
        scrollWrapper.style.width = (W * scale) + 'px';
        scrollWrapper.style.height = (H * scale) + 'px';
    }
}

// Anchor point is in viewport coordinates relative to the container
// (0..rect.width, 0..rect.height). Zoom is always centered vertically:
// after a scale change the canvas is re-centered on the viewport, so its
// vertical middle never drifts. The horizontal axis follows the pointer
// when anchorX is provided, otherwise it is centered too. The browser
// clamps all scroll positions so canvas edges can never leave the view.
function applyScale(scale, anchorX) {
    const canvasContainer = document.getElementById('ss-canvasContainer');
    const currentScale = getCanvasScale();
    if (!canvasContainer) {
        updateCanvasTransform(scale);
        return;
    }
    
    const rect = canvasContainer.getBoundingClientRect();
    const ax = anchorX !== undefined ? anchorX : rect.width / 2;
    
    if (currentScale > 0 && currentScale !== scale) {
        const factor = scale / currentScale;
        const px = ax + canvasContainer.scrollLeft;
        updateCanvasTransform(scale);
        if (anchorX !== undefined) {
            // Keep the canvas point under the pointer horizontally fixed
            canvasContainer.scrollLeft = px * factor - ax;
        } else {
            centerCanvasHorizontal();
        }
    } else {
        updateCanvasTransform(scale);
        centerCanvasHorizontal();
    }
    
    centerCanvasVertical();
}

function centerCanvasHorizontal() {
    const canvasContainer = document.getElementById('ss-canvasContainer');
    if (!canvasContainer) return;
    canvasContainer.scrollLeft = (canvasContainer.scrollWidth - canvasContainer.clientWidth) / 2;
}

function centerCanvasVertical() {
    const canvasContainer = document.getElementById('ss-canvasContainer');
    if (!canvasContainer) return;
    canvasContainer.scrollTop = (canvasContainer.scrollHeight - canvasContainer.clientHeight) / 2;
}

function updateCanvasZoom() {
    const sliderThumb = document.getElementById('ss-sliderThumb');
    if (!sliderThumb) return;
    
    const thumbPosition = parseFloat(sliderThumb.style.left) / 100;
    const minScale = 0.05;
    const maxScale = 0.5;
    const scale = minScale + (thumbPosition * (maxScale - minScale));
    
    applyScale(scale);
    updateZoomVisuals(scale);
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
    
    updateZoomVisuals(clampedScale);
    updateCanvasTransform(clampedScale);
    canvasContainer.scrollLeft = 0;
    canvasContainer.scrollTop = 0;
    
    console.log('Initial zoom set to:', clampedScale);
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
    return getCanvasScale();
}

export function setZoomLevel(zoomLevel, mouseX, mouseY) {
    const canvasContainer = document.getElementById('ss-canvasContainer');
    if (!canvasContainer) return;
    
    zoomLevel = Math.max(0.05, Math.min(1, zoomLevel));
    
    const rect = canvasContainer.getBoundingClientRect();
    let anchorX;
    if (mouseX !== undefined && mouseY !== undefined) {
        // Horizontal zoom anchor follows the pointer
        anchorX = mouseX - rect.left;
    }
    // Vertical zoom anchor is always the vertical center of the canvas/viewport
    applyScale(zoomLevel, anchorX);
    
    updateZoomVisuals(zoomLevel);
}

function adjustZoomLevel(delta) {
    const currentZoom = getCurrentZoomLevel();
    let newZoom = Math.max(0.05, Math.min(1, currentZoom + delta));
    setZoomLevel(newZoom);
}
