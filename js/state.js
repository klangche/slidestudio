export const layerState = {
    layers: [],
    selectedLayer: null,
    nextZIndex: 10,
    maxLayers: 1000
};

window.layerState = layerState;

export const canvasState = {
    width: 1080,
    height: 1920,
    sections: 1,
    minSections: 1,
    maxSections: 20
};

window.canvasState = canvasState;

export const guidanceState = {
    active: false,
    guidelines: {
        square: { width: 1080, height: 1080, ratio: '1:1', name: 'Square' },
        portrait: { width: 1080, height: 1350, ratio: '4:5', name: 'Portrait' },
        stories: { width: 1080, height: 1920, ratio: '9:16', name: 'Stories' }
    }
};

window.guidanceState = guidanceState;

export const magnetState = {
    active: true
};

window.magnetState = magnetState;

export const historyState = {
    undoStack: [],
    redoStack: [],
    maxHistory: 1000
};

window.historyState = historyState;

export const freeMoveState = {
    active: false,
    isMoving: false,
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    startScrollTop: 0
};

window.freeMoveState = freeMoveState;
