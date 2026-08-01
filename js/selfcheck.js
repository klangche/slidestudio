const REQUIRED_BRIDGES = [
    ['layerState', 'object'],
    ['canvasState', 'object'],
    ['guidanceState', 'object'],
    ['magnetState', 'object'],
    ['historyState', 'object'],
    ['freeMoveState', 'object'],
    ['makeElementDraggable', 'function'],
    ['makeElementSelectable', 'function'],
    ['createResizeHandles', 'function'],
    ['getResizeHandlesForElement', 'function'],
    ['setupRotationHandler', 'function'],
    ['adjustTextElementSize', 'function'],
    ['addTextElement', 'function'],
    ['snapToGuidelines', 'function'],
    ['saveState', 'function'],
    ['updateImageToolButtons', 'function'],
    ['updateLayerOrderButtons', 'function'],
    ['updateImageToolUIForSelection', 'function'],
    ['selectLayer', 'function'],
    ['toggleMultiSelectMode', 'function'],
    ['groupElements', 'function'],
    ['ungroupLayer', 'function'],
    ['toggleGroupSelected', 'function'],
    ['Designer', 'object'],
    ['SSImageTransform', 'object'],
    ['SSTextEditor', 'object']
];

function runModuleSelfcheck() {
    const missing = REQUIRED_BRIDGES.filter(([name]) => typeof window[name] === 'undefined');
    if (missing.length === 0) {
        console.info('[selfcheck] All module bridges present.');
    } else {
        console.error('[selfcheck] MISSING window bridges:', missing.map(([name]) => name).join(', '));
    }
}

if (document.readyState === 'loading' || document.readyState === 'interactive') {
    document.addEventListener('DOMContentLoaded', runModuleSelfcheck);
} else {
    runModuleSelfcheck();
}
