const REQUIRED_BRIDGES = [
    ['layerState', 'object'],
    ['makeElementDraggable', 'function'],
    ['makeElementSelectable', 'function'],
    ['saveState', 'function'],
    ['updateImageToolButtons', 'function'],
    ['updateLayerOrderButtons', 'function'],
    ['selectLayer', 'function'],
    ['groupElements', 'function'],
    ['ungroupLayer', 'function'],
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
