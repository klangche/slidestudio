// Arrow-key movement of the selected layer.
import { layerState, canvasState, magnetState } from './state.js';
import { snapElementAt, snapReset } from './guidance.js';
import { saveState } from './history.js';

// Keyboard movement state
let keyboardMoveState = {
    active: false,
    interval: null,
    acceleration: false,
    accelerationTimeout: null,
    baseSpeed: 1,
    acceleratedSpeed: 2
};

export function initializeKeyboardMovement() {
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
    const maxX = canvasState.width - element.offsetWidth;
    const maxY = canvasState.height - element.offsetHeight;
    
    newLeft = Math.max(minX, Math.min(maxX, newLeft));
    newTop = Math.max(minY, Math.min(maxY, newTop));
    
    // Always apply magnet snapping when active
    if (magnetState.active) {
        snapReset();
        const snapped = snapElementAt(newLeft, newTop, element);
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
