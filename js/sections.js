// Section handling: add/remove slides, counters, resolution and button states, magnet toggle.
import { canvasState, magnetState, guidanceState } from './state.js';
import { updateGuidanceOverlay } from './guidance.js';
import { setInitialZoom } from './zoom.js';

export function addSection() {
    if (canvasState.sections >= canvasState.maxSections) return;
    
    const canvasContainer = document.getElementById('ss-canvasContainer');
    if (canvasContainer) {
        canvasContainer.classList.add('ss-slide-animating', 'ss-slide-enter');
    }
    if (typeof window.saveState === 'function') window.saveState();
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

export function removeSection() {
    if (canvasState.sections <= canvasState.minSections) return;
    
    const canvasContainer = document.getElementById('ss-canvasContainer');
    if (canvasContainer) {
        canvasContainer.classList.add('ss-slide-animating', 'ss-slide-exit');
    }
    if (typeof window.saveState === 'function') window.saveState();
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

export function updateSectionCount() {
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

export function updateResolutionDisplay() {
    const resolutionDisplay = document.getElementById('ss-resolutionDisplay');
    if (resolutionDisplay) {
        resolutionDisplay.textContent = canvasState.width + ' × ' + canvasState.height;
    }
}

export function updateButtonStates() {
    const addSectionBtn = document.getElementById('ss-addSection');
    const removeSectionBtn = document.getElementById('ss-removeSection');
    const sections = canvasState.sections;
    const maxSections = canvasState.maxSections;
    const minSections = canvasState.minSections;

    if (addSectionBtn) {
        if (sections >= maxSections) {
            addSectionBtn.classList.add('ss-disabled');
            addSectionBtn.style.opacity = '';
            addSectionBtn.style.cursor = '';
        } else {
            addSectionBtn.classList.remove('ss-disabled');
            // Fade progressively from full opacity at the minimum slide count
            // down toward the disabled look as we approach the maximum.
            const remaining = maxSections - sections;
            const range = maxSections - minSections;
            const ratio = range > 0 ? remaining / range : 0;
            addSectionBtn.style.opacity = String(0.35 + 0.65 * ratio);
            addSectionBtn.style.cursor = 'pointer';
        }
    }

    if (removeSectionBtn) {
        if (sections <= minSections) {
            removeSectionBtn.classList.add('ss-disabled');
            removeSectionBtn.style.opacity = '';
            removeSectionBtn.style.cursor = '';
        } else {
            removeSectionBtn.classList.remove('ss-disabled');
            removeSectionBtn.style.opacity = '';
            removeSectionBtn.style.cursor = 'pointer';
        }
    }
}

export function initializeMagnetButton() {
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
