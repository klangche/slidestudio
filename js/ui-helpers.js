// Shared DOM helpers for layer elements (resize/rotation handles, text sizing).
// These were referenced by the old designer.js but never defined anywhere in
// the codebase, so selection and restore paths used to throw ReferenceError.
import { layerState } from './state.js';

function parseRotation(transform) {
    const match = /rotate\(([-.\d]+)deg\)/.exec(transform);
    return match ? parseFloat(match[1]) : 0;
}

function replaceRotation(transform, deg) {
    const normalized = Math.round(deg * 10) / 10;
    if (/rotate\(/.test(transform)) {
        return transform.replace(/rotate\([-.\d]+deg\)/, 'rotate(' + normalized + 'deg)');
    }
    return transform + ' rotate(' + normalized + 'deg)';
}

export function createResizeHandles() {
    const handles = document.createElement('div');
    handles.className = 'ss-resize-handles';
    ['nw', 'ne', 'sw', 'se'].forEach(function(corner) {
        const handle = document.createElement('div');
        handle.className = 'ss-resize-handle';
        handle.style.cursor = corner + '-resize';
        handles.appendChild(handle);
    });
    return handles;
}

export function getResizeHandlesForElement(element) {
    if (!element) return null;
    return element.querySelector('.ss-resize-handles');
}

export function setupRotationHandler(element) {
    if (!element) return;
    const rotationHandle = document.createElement('div');
    rotationHandle.className = 'ss-rotation-handle';
    element.appendChild(rotationHandle);

    rotationHandle.addEventListener('pointerdown', function(e) {
        e.preventDefault();
        e.stopPropagation();
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        const startAngle = Math.atan2(e.clientY - centerY, e.clientX - centerX) * 180 / Math.PI;
        const startTransform = element.style.transform || '';
        const startRotation = parseRotation(startTransform);

        function onMove(ev) {
            const angle = Math.atan2(ev.clientY - centerY, ev.clientX - centerX) * 180 / Math.PI;
            element.style.transform = replaceRotation(startTransform, startRotation + (angle - startAngle));
        }
        function onUp() {
            document.removeEventListener('pointermove', onMove);
            document.removeEventListener('pointerup', onUp);
            try {
                const layerIndex = layerState.layers.findIndex(function(l) { return l.element === element; });
                if (layerIndex !== -1) {
                    layerState.layers[layerIndex].rotation = parseRotation(element.style.transform);
                }
            } catch (err) {}
            if (typeof window.saveState === 'function') window.saveState();
        }
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
    });
}

export function adjustTextElementSize(element) {
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = element.scrollHeight + 'px';
}

function getTextFontSize(el) {
    const content = el.querySelector && el.querySelector('.ss-text-content');
    const target = content || el;
    return parseFloat(window.getComputedStyle(target).fontSize) || 12;
}

function setTextFontSize(el, size) {
    const content = el.querySelector && el.querySelector('.ss-text-content');
    (content || el).style.fontSize = size + 'px';
}

// Wires the corner resize handles of a text element so it behaves like an image:
// dragging a corner resizes the box and scales the font proportionally.
export function setupTextResizeHandlers(element) {
    if (!element) return;
    let handles = getResizeHandlesForElement(element);
    if (!handles) {
        handles = createResizeHandles();
        element.appendChild(handles);
    }

    const corners = handles.querySelectorAll('.ss-resize-handle');
    Array.prototype.forEach.call(corners, function(handle) {
        handle.addEventListener('pointerdown', function(e) {
            e.preventDefault();
            e.stopPropagation();
            startTextResize(element, handle, e);
        });
    });
}

function startTextResize(element, handle, e) {
    const rect = element.getBoundingClientRect();
    const startWidth = rect.width || element.offsetWidth || 100;
    const startHeight = rect.height || element.offsetHeight || 40;
    const startFontSize = getTextFontSize(element);
    const startX = e.clientX;
    const startY = e.clientY;
    const corner = (handle.style.cursor || 'se-resize').split('-')[0];

    function onMove(ev) {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        let newW = startWidth;
        let newH = startHeight;
        if (corner.indexOf('w') !== -1) newW = startWidth - dx;
        if (corner.indexOf('e') !== -1) newW = startWidth + dx;
        if (corner.indexOf('n') !== -1) newH = startHeight - dy;
        if (corner.indexOf('s') !== -1) newH = startHeight + dy;
        newW = Math.max(40, Math.round(newW));
        newH = Math.max(24, Math.round(newH));

        // Scale the font with the box width so proportions stay intact
        const newFontSize = Math.max(6, Math.round((startFontSize * newW / startWidth) * 10) / 10);
        setTextFontSize(element, newFontSize);

        element.style.width = newW + 'px';
        element.style.height = 'auto';
        element.style.height = element.scrollHeight + 'px';
    }

    function onUp() {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        try {
            const layerIndex = layerState.layers.findIndex(function(l) { return l.element === element; });
            if (layerIndex !== -1) {
                layerState.layers[layerIndex].size = {
                    width: element.offsetWidth,
                    height: element.offsetHeight
                };
                layerState.layers[layerIndex].fontSize = getTextFontSize(element);
            }
        } catch (err) {}
        if (typeof window.saveState === 'function') window.saveState();
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
}

export function addTextElement() {
    const designerCanvas = document.getElementById('ss-designer-canvas');
    if (!designerCanvas) return;

    const id = 'text_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const el = document.createElement('div');
    el.className = 'ss-text-element';
    el.id = id;
    el.contentEditable = true;
    el.textContent = 'Text';
    el.style.position = 'absolute';
    el.style.left = '40px';
    el.style.top = '40px';
    el.style.zIndex = String(layerState.nextZIndex++);
    el.style.fontFamily = 'Arial, sans-serif';
    el.style.fontSize = '24px';
    el.style.color = '#000000';
    el.style.padding = '10px';
    el.style.cursor = 'grab';
    el.style.outline = 'none';
    el.style.overflow = 'visible';
    el.style.whiteSpace = 'pre-wrap';
    el.style.wordWrap = 'break-word';
    el.style.lineHeight = '1.2';
    el.appendChild(createResizeHandles());
    designerCanvas.appendChild(el);

    const layer = {
        id: id,
        element: el,
        type: 'text',
        zIndex: parseInt(el.style.zIndex),
        position: { left: 40, top: 40 },
        fontSize: 24,
        rotation: 0,
        size: { width: 200, height: 44 },
        visible: true,
        disabled: false
    };
    layerState.layers.push(layer);

    if (typeof window.makeElementDraggable === 'function') window.makeElementDraggable(el);
    if (typeof window.makeElementSelectable === 'function') window.makeElementSelectable(el);
    if (window.SSText && typeof window.SSText.setupTextResizeHandlers === 'function') window.SSText.setupTextResizeHandlers(el);
    setupRotationHandler(el);

    el.addEventListener('input', function() {
        adjustTextElementSize(el);
        if (typeof window.saveState === 'function') window.saveState();
    });

    setTimeout(function() { adjustTextElementSize(el); }, 10);
}

window.createResizeHandles = createResizeHandles;
window.getResizeHandlesForElement = getResizeHandlesForElement;
window.setupRotationHandler = setupRotationHandler;
window.adjustTextElementSize = adjustTextElementSize;
window.addTextElement = addTextElement;
window.setupTextResizeHandlers = setupTextResizeHandlers;
window.SSText = window.SSText || {};
window.SSText.setupTextResizeHandlers = setupTextResizeHandlers;
