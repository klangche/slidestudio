// Designer Canvas Core - workspace bootstrap, canvas creation and event wiring.
import { canvasState, guidanceState, magnetState, layerState, historyState } from './state.js';
import { initializeZoomFunctionality, setInitialZoom } from './zoom.js';
import { updateSectionCount, updateResolutionDisplay, updateButtonStates, addSection, removeSection, initializeMagnetButton } from './sections.js';
import { initializeColorPicker, initializeUploadFunctionality, initializeTransparencySlider, moveLayerToTop, moveLayerUp, moveLayerDown, moveLayerToBottom, updateImageToolButtons, cleanupImagesOutsideCanvas } from './layers.js';
import { updateUndoRedoButtons, undo, redo, saveState } from './history.js';
import { initializeGlobalClickHandler, toggleFreeMove, updateLayerOrderButtons, updateImageToolUIForSelection, initializeFreeMoveShortcuts } from './selection.js';
import { toggleGuidance, createEnhancedGuidanceOverlay } from './guidance.js';
import { initializeKeyboardMovement } from './keyboard.js';
import { exportCanvasZip, downloadBackup, saveTemplate, listTemplates, loadTemplateByName, loadBackupFromFile, openLoadBackupDialog, openLoadTemplateDialog } from './export.js';

document.addEventListener('DOMContentLoaded', function() {
    initializeDesignerWorkspace();
});

function initializeDesignerWorkspace() {
    console.log('Initializing designer workspace...');
    
    const workspace = document.getElementById('ss-workspace');
    const workspacePlaceholder = document.getElementById('ss-workspacePlaceholder');
    const canvasContainer = document.getElementById('ss-canvasContainer');
    
    if (!workspace || !workspacePlaceholder || !canvasContainer) {
        console.error('Required DOM elements not found');
        return;
    }
    
    workspacePlaceholder.style.display = 'none';
    canvasContainer.style.display = 'flex';
    canvasContainer.style.overflow = 'hidden';
    
    createDesignerCanvas();
    initializeZoomFunctionality();
    initializeDesignerEventListeners();
    setInitialZoom();
    updateSectionCount();
    updateResolutionDisplay();
    updateButtonStates();
    initializeColorPicker();
    initializeUploadFunctionality();
    updateUndoRedoButtons();
    initializeTransparencySlider();
    initializeMagnetButton();
    initializeKeyboardMovement();
    initializeGlobalClickHandler();
    initializeFreeMoveShortcuts();
    
    // So-Me Guides and Snap are enabled by default on page load
    const guidanceBtn = document.getElementById('ss-guidanceBtn');
    if (guidanceBtn) guidanceBtn.classList.add('ss-active');
    guidanceState.active = true;
    createEnhancedGuidanceOverlay();
    
    // Enable transparency slider (guides are active by default)
    const transparencySliderContainer = document.querySelector('#ss-transparencySlider').closest('.ss-slider-container');
    if (transparencySliderContainer) {
        transparencySliderContainer.classList.remove('ss-disabled');
    }
    
    saveState();
    
    console.log('Designer workspace initialized successfully');
}

function createDesignerCanvas() {
    const canvasContainer = document.getElementById('ss-canvasContainer');
    
    if (!canvasContainer) {
        console.error('Canvas container not found');
        return;
    }
    
    const existingCanvas = document.getElementById('ss-designer-canvas');
    if (existingCanvas) {
        existingCanvas.remove();
    }
    
    const designerCanvas = document.createElement('div');
    designerCanvas.id = 'ss-designer-canvas';
    designerCanvas.className = 'ss-designer-canvas';
    
    designerCanvas.style.width = canvasState.width + 'px';
    designerCanvas.style.height = canvasState.height + 'px';
    designerCanvas.style.backgroundColor = '#ffffff';
    designerCanvas.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.15)';
    designerCanvas.style.border = '1px solid var(--ss-border-color)';
    designerCanvas.style.position = 'relative';
    designerCanvas.style.transformOrigin = 'center center';
    designerCanvas.style.flexShrink = '0';
    designerCanvas.style.zIndex = '1';
    designerCanvas.style.overflow = 'hidden';
    
    canvasContainer.appendChild(designerCanvas);
    console.log('Designer canvas created with dimensions:', canvasState.width, 'x', canvasState.height);
    // If other modules were waiting for canvas, notify via event
    document.dispatchEvent(new CustomEvent('ss-designer-canvas-ready'));
}

function initializeDesignerEventListeners() {
    console.log('Initializing designer event listeners...');
    
    const fitAllBtn = document.getElementById('ss-fitAllBtn');
    if (fitAllBtn) {
        fitAllBtn.addEventListener('click', function() {
            setInitialZoom();
        });
    }
    
    const freeMoveBtn = document.getElementById('ss-freeMoveBtn');
    if (freeMoveBtn) {
        freeMoveBtn.addEventListener('click', function() {
            toggleFreeMove();
        });
    }
    
    const addSectionBtn = document.getElementById('ss-addSection');
    if (addSectionBtn) {
        addSectionBtn.addEventListener('click', function() {
            if (!this.classList.contains('ss-disabled')) {
                addSection();
            }
        });
    }
    
    const removeSectionBtn = document.getElementById('ss-removeSection');
    if (removeSectionBtn) {
        removeSectionBtn.addEventListener('click', function() {
            if (!this.classList.contains('ss-disabled')) {
                removeSection();
            }
        });
    }
    
    const guidanceBtn = document.getElementById('ss-guidanceBtn');
    if (guidanceBtn) {
        guidanceBtn.addEventListener('click', function() {
            toggleGuidance();
        });
    }
    
    const moveToTopBtn = document.getElementById('ss-moveToTopBtn');
    const moveUpBtn = document.getElementById('ss-moveUpBtn');
    const moveDownBtn = document.getElementById('ss-moveDownBtn');
    const moveToBottomBtn = document.getElementById('ss-moveToBottomBtn');
    
    if (moveToTopBtn) moveToTopBtn.addEventListener('click', moveLayerToTop);
    if (moveUpBtn) moveUpBtn.addEventListener('click', moveLayerUp);
    if (moveDownBtn) moveDownBtn.addEventListener('click', moveLayerDown);
    if (moveToBottomBtn) moveToBottomBtn.addEventListener('click', moveLayerToBottom);
    
    // Initialize image tool and layer-order buttons state
    updateImageToolButtons();
    if (typeof updateLayerOrderButtons === 'function') updateLayerOrderButtons();
    
    const undoBtn = document.getElementById('ss-undoBtn');
    const redoBtn = document.getElementById('ss-redoBtn');
    
    if (undoBtn) undoBtn.addEventListener('click', undo);
    if (redoBtn) redoBtn.addEventListener('click', redo);
    
    const deleteImageBtn = document.getElementById('ss-deleteImageBtn');
    const duplicateImageBtn = document.getElementById('ss-duplicateImageBtn');
    const flipHorizontalBtn = document.getElementById('ss-flipHorizontalBtn');
    const flipVerticalBtn = document.getElementById('ss-flipVerticalBtn');
    const replaceImageBtn = document.getElementById('ss-replaceImageBtn');
    const lockImageBtn = document.getElementById('ss-lockImageBtn');
    const dropShadowBtn = document.getElementById('ss-dropShadowBtn');
    const grayscaleBtn = document.getElementById('ss-grayscaleBtn');
    
    if (deleteImageBtn) deleteImageBtn.addEventListener('click', function() {
        if (window.SSImageTransform && window.SSImageTransform.deleteImage) {
            window.SSImageTransform.deleteImage();
        }
    });
    if (duplicateImageBtn) duplicateImageBtn.addEventListener('click', function() {
        if (window.SSImageTransform && window.SSImageTransform.duplicateImage) {
            window.SSImageTransform.duplicateImage();
        }
    });
    if (flipHorizontalBtn) flipHorizontalBtn.addEventListener('click', function() {
        if (window.SSImageTransform && window.SSImageTransform.flipHorizontal) {
            window.SSImageTransform.flipHorizontal();
        }
    });
    if (flipVerticalBtn) flipVerticalBtn.addEventListener('click', function() {
        if (window.SSImageTransform && window.SSImageTransform.flipVertical) {
            window.SSImageTransform.flipVertical();
        }
    });
    if (replaceImageBtn) replaceImageBtn.addEventListener('click', function() {
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        fileInput.addEventListener('change', function(e) {
            const file = e.target.files && e.target.files[0];
            if (file && window.SSImageTransform && window.SSImageTransform.replaceImage) {
                window.SSImageTransform.replaceImage(file);
            }
            document.body.removeChild(fileInput);
        });
        document.body.appendChild(fileInput);
        fileInput.click();
    });
    if (lockImageBtn) lockImageBtn.addEventListener('click', function() {
        if (window.SSImageTransform && window.SSImageTransform.toggleLock) {
            window.SSImageTransform.toggleLock();
            updateImageToolUIForSelection();
        }
    });
    if (dropShadowBtn) dropShadowBtn.addEventListener('click', function() {
        if (window.SSImageTransform && window.SSImageTransform.toggleShadow) {
            window.SSImageTransform.toggleShadow();
        }
    });
    if (grayscaleBtn) grayscaleBtn.addEventListener('click', function() {
        if (window.SSImageTransform && window.SSImageTransform.toggleGrayscale) {
            window.SSImageTransform.toggleGrayscale();
        }
    });
    
    let resizeTimeout;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(function() {
            setInitialZoom();
        }, 250);
    });
    
    setInterval(cleanupImagesOutsideCanvas, 5000);
    
    console.log('Designer event listeners initialized successfully');
}

// Export functions for potential use elsewhere
window.Designer = {
    initializeDesignerWorkspace: initializeDesignerWorkspace,
    addSection: addSection,
    removeSection: removeSection,
    updateSectionCount: updateSectionCount,
    updateResolutionDisplay: updateResolutionDisplay,
    updateButtonStates: updateButtonStates,
    toggleGuidance: toggleGuidance,
    getCanvasState: function() { return canvasState; },
    getGuidanceState: function() { return guidanceState; },
    getMagnetState: function() { return magnetState; },
    getLayerState: function() { return layerState; },
    getHistoryState: function() { return historyState; }
};
// Expose export/backup/template functions
window.Designer.exportCanvasZip = exportCanvasZip;
window.Designer.downloadBackup = downloadBackup;
window.Designer.saveTemplate = saveTemplate;
window.Designer.listTemplates = listTemplates;
window.Designer.loadTemplateByName = loadTemplateByName;
window.Designer.loadBackupFromFile = loadBackupFromFile;
window.Designer.openLoadBackupDialog = openLoadBackupDialog;
window.Designer.openLoadTemplateDialog = openLoadTemplateDialog;
