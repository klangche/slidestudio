// Guidance system: SoMe guide overlays, slide separators, center lines and snapping.
import { guidanceState, magnetState, canvasState, layerState } from './state.js';

let guidanceOverlay = null;

export function toggleGuidance() {
    const guidanceBtn = document.getElementById('ss-guidanceBtn');
    const transparencySliderContainer = document.querySelector('#ss-transparencySlider').closest('.ss-slider-container');
    
    if (!guidanceState.active) {
        guidanceState.active = true;
        guidanceBtn.classList.add('ss-active');
        createEnhancedGuidanceOverlay();
        
        // Enable transparency slider
        if (transparencySliderContainer) {
            transparencySliderContainer.classList.remove('ss-disabled');
        }
    } else {
        guidanceState.active = false;
        guidanceBtn.classList.remove('ss-active');
        removeGuidanceOverlay();
        
        // Disable transparency slider
        if (transparencySliderContainer) {
            transparencySliderContainer.classList.add('ss-disabled');
        }
    }
}

export function createEnhancedGuidanceOverlay() {
    removeGuidanceOverlay();
    
    const designerCanvas = document.getElementById('ss-designer-canvas');
    if (!designerCanvas) return;
    
    guidanceOverlay = document.createElement('div');
    guidanceOverlay.id = 'ss-guidance-overlay';
    guidanceOverlay.style.position = 'absolute';
    guidanceOverlay.style.top = '0';
    guidanceOverlay.style.left = '0';
    guidanceOverlay.style.width = '100%';
    guidanceOverlay.style.height = '100%';
    guidanceOverlay.style.pointerEvents = 'none';
    guidanceOverlay.style.zIndex = '100000';
    guidanceOverlay.style.overflow = 'visible';
    
    createSlideSeparators();
    createCenterLines();
    createSocialMediaGuides();
    designerCanvas.appendChild(guidanceOverlay);
    updateGuidanceTransparency();
    
    console.log('Enhanced guidance overlay created');
}

function createSlideSeparators() {
    if (!guidanceOverlay) return;
    
    // Only create slide separators if there are multiple sections
    if (canvasState.sections > 1) {
        for (let i = 1; i < canvasState.sections; i++) {
            const separatorX = i * 1080;
            
            // Slide separator - dynamic color based on background
            const separator = document.createElement('div');
            separator.className = 'ss-slide-separator';
            separator.style.position = 'absolute';
            separator.style.left = separatorX + 'px';
            separator.style.top = '0';
            separator.style.width = '1px';
            separator.style.height = '100%';
            separator.style.zIndex = '100001';
            guidanceOverlay.appendChild(separator);
        }
    }
    
    // Update separator colors based on background
    updateSlideSeparatorColors();
}

export function updateSlideSeparatorColors() {
    const designerCanvas = document.getElementById('ss-designer-canvas');
    if (!designerCanvas || !guidanceOverlay) return;
    
    const backgroundColor = designerCanvas.style.backgroundColor || '#ffffff';
    const isDark = isColorDark(backgroundColor);
    const separatorColor = isDark ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.8)';
    
    const separators = guidanceOverlay.querySelectorAll('.ss-slide-separator');
    separators.forEach(separator => {
        separator.style.backgroundColor = separatorColor;
    });
}

function isColorDark(color) {
    // Convert hex color to RGB
    let r, g, b;
    
    if (color.startsWith('#')) {
        r = parseInt(color.substr(1, 2), 16);
        g = parseInt(color.substr(3, 2), 16);
        b = parseInt(color.substr(5, 2), 16);
    } else if (color.startsWith('rgb')) {
        const rgb = color.match(/\d+/g);
        r = parseInt(rgb[0]);
        g = parseInt(rgb[1]);
        b = parseInt(rgb[2]);
    } else {
        // Default to light if unknown format
        return false;
    }
    
    // Calculate luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5;
}

function createCenterLines() {
    if (!guidanceOverlay) return;
    
    // Single horizontal center line at exact center
    const horizontalCenter = document.createElement('div');
    horizontalCenter.className = 'ss-horizontal-center-line';
    horizontalCenter.style.position = 'absolute';
    horizontalCenter.style.left = '0';
    horizontalCenter.style.top = '960px'; // 1920 / 2
    horizontalCenter.style.width = '100%';
    horizontalCenter.style.height = '1px';
    horizontalCenter.style.backgroundColor = 'rgba(0, 100, 255, 0.6)'; // Blue
    horizontalCenter.style.zIndex = '100001';
    guidanceOverlay.appendChild(horizontalCenter);
    
    // Vertical center lines for each slide
    for (let section = 0; section < canvasState.sections; section++) {
        const sectionStartX = section * 1080;
        
        const verticalCenter = document.createElement('div');
        verticalCenter.className = 'ss-vertical-center-line';
        verticalCenter.style.position = 'absolute';
        verticalCenter.style.left = (sectionStartX + 540) + 'px'; // 1080 / 2
        verticalCenter.style.top = '0';
        verticalCenter.style.width = '1px';
        verticalCenter.style.height = '100%';
        verticalCenter.style.backgroundColor = 'rgba(0, 100, 255, 0.6)'; // Blue
        verticalCenter.style.zIndex = '100001';
        guidanceOverlay.appendChild(verticalCenter);
    }
}

function createSocialMediaGuides() {
    if (!guidanceOverlay) return;
    
    // Create guides for each slide
    for (let section = 0; section < canvasState.sections; section++) {
        const sectionStartX = section * 1080;
        
        // 1:1 Square Guide (1080x1080px) - Instagram gradient colors
        const squareTopY = (1920 - 1080) / 2;
        const squareBottomY = squareTopY + 1080;
        
        // Top horizontal line for 1:1
        const squareTopLine = document.createElement('div');
        squareTopLine.className = 'ss-social-guide-line ss-square-line';
        squareTopLine.style.position = 'absolute';
        squareTopLine.style.left = sectionStartX + 'px';
        squareTopLine.style.top = squareTopY + 'px';
        squareTopLine.style.width = '1080px';
        squareTopLine.style.height = '2px';
        squareTopLine.style.background = 'linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)';
        squareTopLine.style.zIndex = '100001';
        guidanceOverlay.appendChild(squareTopLine);
        
        // Bottom horizontal line for 1:1
        const squareBottomLine = document.createElement('div');
        squareBottomLine.className = 'ss-social-guide-line ss-square-line';
        squareBottomLine.style.position = 'absolute';
        squareBottomLine.style.left = sectionStartX + 'px';
        squareBottomLine.style.top = squareBottomY + 'px';
        squareBottomLine.style.width = '1080px';
        squareBottomLine.style.height = '2px';
        squareBottomLine.style.background = 'linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)';
        squareBottomLine.style.zIndex = '100001';
        guidanceOverlay.appendChild(squareBottomLine);
        
        // 1:1 Label - placed ABOVE the top line (moved from below)
        const squareLabel = document.createElement('div');
        squareLabel.className = 'ss-guide-label';
        squareLabel.textContent = '1:1 Square';
        squareLabel.style.position = 'absolute';
        squareLabel.style.left = (sectionStartX + 10) + 'px';
        squareLabel.style.top = (squareTopY - 25) + 'px'; // Moved above the top line
        squareLabel.style.color = 'white';
        squareLabel.style.fontSize = '14px';
        squareLabel.style.fontWeight = 'bold';
        squareLabel.style.fontFamily = 'Arial, sans-serif';
        squareLabel.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        squareLabel.style.padding = '4px 8px';
        squareLabel.style.borderRadius = '4px';
        squareLabel.style.zIndex = '100002';
        guidanceOverlay.appendChild(squareLabel);
        
        // 4:5 Post Guide (1080x1350px) - Instagram purple color
        const postTopY = (1920 - 1350) / 2;
        const postBottomY = postTopY + 1350;
        
        // Top horizontal line for 4:5
        const postTopLine = document.createElement('div');
        postTopLine.className = 'ss-social-guide-line ss-post-line';
        postTopLine.style.position = 'absolute';
        postTopLine.style.left = sectionStartX + 'px';
        postTopLine.style.top = postTopY + 'px';
        postTopLine.style.width = '1080px';
        postTopLine.style.height = '2px';
        postTopLine.style.backgroundColor = '#833AB4'; // Instagram purple
        postTopLine.style.zIndex = '100001';
        guidanceOverlay.appendChild(postTopLine);
        
        // Bottom horizontal line for 4:5
        const postBottomLine = document.createElement('div');
        postBottomLine.className = 'ss-social-guide-line ss-post-line';
        postBottomLine.style.position = 'absolute';
        postBottomLine.style.left = sectionStartX + 'px';
        postBottomLine.style.top = postBottomY + 'px';
        postBottomLine.style.width = '1080px';
        postBottomLine.style.height = '2px';
        postBottomLine.style.backgroundColor = '#833AB4'; // Instagram purple
        postBottomLine.style.zIndex = '100001';
        guidanceOverlay.appendChild(postBottomLine);
        
        // 4:5 Label - placed ABOVE the top line (moved from below)
        const postLabel = document.createElement('div');
        postLabel.className = 'ss-guide-label';
        postLabel.textContent = '4:5 Post';
        postLabel.style.position = 'absolute';
        postLabel.style.left = (sectionStartX + 10) + 'px';
        postLabel.style.top = (postTopY - 25) + 'px'; // Moved above the top line
        postLabel.style.color = 'white';
        postLabel.style.fontSize = '14px';
        postLabel.style.fontWeight = 'bold';
        postLabel.style.fontFamily = 'Arial, sans-serif';
        postLabel.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        postLabel.style.padding = '4px 8px';
        postLabel.style.borderRadius = '4px';
        postLabel.style.zIndex = '100002';
        guidanceOverlay.appendChild(postLabel);
        
        // 9:16 Stories Guide (1080x1920px) - Page number at top
        const storiesLabel = document.createElement('div');
        storiesLabel.className = 'ss-guide-label';
        storiesLabel.textContent = `9:16 Stories #${section + 1}`; // Added page number
        storiesLabel.style.position = 'absolute';
        storiesLabel.style.left = (sectionStartX + 10) + 'px';
        storiesLabel.style.top = '10px';
        storiesLabel.style.color = 'white';
        storiesLabel.style.fontSize = '14px';
        storiesLabel.style.fontWeight = 'bold';
        storiesLabel.style.fontFamily = 'Arial, sans-serif';
        storiesLabel.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        storiesLabel.style.padding = '4px 8px';
        storiesLabel.style.borderRadius = '4px';
        storiesLabel.style.zIndex = '100002';
        guidanceOverlay.appendChild(storiesLabel);
    }
}

function removeGuidanceOverlay() {
    const designerCanvas = document.getElementById('ss-designer-canvas');
    if (designerCanvas) {
        const existingOverlay = document.getElementById('ss-guidance-overlay');
        if (existingOverlay) {
            existingOverlay.remove();
        }
    }
    guidanceOverlay = null;
}

export function updateGuidanceTransparency() {
    if (guidanceState.active && guidanceOverlay) {
        const transparencyValue = document.getElementById('ss-transparencyValue');
        if (transparencyValue) {
            const transparency = parseInt(transparencyValue.textContent);
            const opacity = transparency / 100;
            guidanceOverlay.style.opacity = opacity.toString();
        }
    }
}

export function updateGuidanceOverlay() {
    if (!guidanceState.active) return;
    createEnhancedGuidanceOverlay();
}

// ENHANCED: Complete magnet snapping to ALL guides including light blue center lines
export function snapToGuidelines(x, y, width, height) {
    if (!magnetState.active) return { x: x, y: y };
    
    const snapThreshold = 10;
    let snappedX = x;
    let snappedY = y;
    
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    
    // Snap to canvas edges
    if (Math.abs(x) < snapThreshold) snappedX = 0;
    if (Math.abs(y) < snapThreshold) snappedY = 0;
    if (Math.abs(x + width - canvasState.width) < snapThreshold) snappedX = canvasState.width - width;
    if (Math.abs(y + height - canvasState.height) < snapThreshold) snappedY = canvasState.height - height;
    
    // Snap to canvas center (light blue center lines)
    const canvasCenterX = canvasState.width / 2;
    const canvasCenterY = canvasState.height / 2;
    
    if (Math.abs(centerX - canvasCenterX) < snapThreshold) {
        snappedX = canvasCenterX - width / 2;
    }
    
    if (Math.abs(centerY - canvasCenterY) < snapThreshold) {
        snappedY = canvasCenterY - height / 2;
    }
    
    // Snap to light blue horizontal center line (edges and center)
    if (Math.abs(y - canvasCenterY) < snapThreshold) snappedY = canvasCenterY; // Top edge to horizontal center
    if (Math.abs(y + height - canvasCenterY) < snapThreshold) snappedY = canvasCenterY - height; // Bottom edge to horizontal center
    if (Math.abs(centerY - canvasCenterY) < snapThreshold) snappedY = canvasCenterY - height / 2; // Center to horizontal center
    
    // Snap to slide centers (for multi-section canvases) - light blue vertical center lines
    for (let section = 0; section < canvasState.sections; section++) {
        const sectionCenterX = (section * 1080) + 540; // 1080 / 2
        
        // Snap to light blue vertical center lines (edges and center)
        if (Math.abs(x - sectionCenterX) < snapThreshold) snappedX = sectionCenterX; // Left edge to vertical center
        if (Math.abs(x + width - sectionCenterX) < snapThreshold) snappedX = sectionCenterX - width; // Right edge to vertical center
        if (Math.abs(centerX - sectionCenterX) < snapThreshold) snappedX = sectionCenterX - width / 2; // Center to vertical center
        
        // SoMe Guide dimensions
        const sectionStartX = section * 1080;
        const sectionEndX = sectionStartX + 1080;
        
        const squareTopY = (1920 - 1080) / 2;        // 420
        const squareBottomY = squareTopY + 1080;      // 1500
        const squareCenterY = squareTopY + 540;       // 960
        const squareLeftX = sectionStartX;            // section left
        const squareRightX = sectionEndX;             // section right
        const squareCenterX = sectionStartX + 540;    // section center
        
        const postTopY = (1920 - 1350) / 2;          // 285
        const postBottomY = postTopY + 1350;          // 1635
        const postCenterY = postTopY + 675;           // 960
        const postLeftX = sectionStartX;              // section left
        const postRightX = sectionEndX;               // section right
        const postCenterX = sectionStartX + 540;      // section center
        
        // 1:1 SQUARE GUIDE SNAPPING
        
        // Snap to square guide edges (top, bottom, left, right)
        if (Math.abs(y - squareTopY) < snapThreshold) snappedY = squareTopY;
        if (Math.abs(y + height - squareBottomY) < snapThreshold) snappedY = squareBottomY - height;
        if (Math.abs(x - squareLeftX) < snapThreshold) snappedX = squareLeftX;
        if (Math.abs(x + width - squareRightX) < snapThreshold) snappedX = squareRightX - width;
        
        // Snap to square guide centers (vertical and horizontal)
        if (Math.abs(centerX - squareCenterX) < snapThreshold) snappedX = squareCenterX - width / 2;
        if (Math.abs(centerY - squareCenterY) < snapThreshold) snappedY = squareCenterY - height / 2;
        
        // Snap to square guide corners (all four corners)
        if (Math.abs(x - squareLeftX) < snapThreshold && Math.abs(y - squareTopY) < snapThreshold) {
            snappedX = squareLeftX;
            snappedY = squareTopY;
        }
        if (Math.abs(x + width - squareRightX) < snapThreshold && Math.abs(y - squareTopY) < snapThreshold) {
            snappedX = squareRightX - width;
            snappedY = squareTopY;
        }
        if (Math.abs(x - squareLeftX) < snapThreshold && Math.abs(y + height - squareBottomY) < snapThreshold) {
            snappedX = squareLeftX;
            snappedY = squareBottomY - height;
        }
        if (Math.abs(x + width - squareRightX) < snapThreshold && Math.abs(y + height - squareBottomY) < snapThreshold) {
            snappedX = squareRightX - width;
            snappedY = squareBottomY - height;
        }
        
        // Snap element centers to square guide edges
        if (Math.abs(centerX - squareLeftX) < snapThreshold) snappedX = squareLeftX - width / 2;
        if (Math.abs(centerX - squareRightX) < snapThreshold) snappedX = squareRightX - width / 2;
        if (Math.abs(centerY - squareTopY) < snapThreshold) snappedY = squareTopY - height / 2;
        if (Math.abs(centerY - squareBottomY) < snapThreshold) snappedY = squareBottomY - height / 2;
        
        // ENHANCED: Snap to bottom side of upper square guide and top side of lower square guide
        // This means object bottom to square top, and object top to square bottom
        if (Math.abs(y + height - squareTopY) < snapThreshold) snappedY = squareTopY - height; // Object bottom to top of square guide
        if (Math.abs(y - squareBottomY) < snapThreshold) snappedY = squareBottomY; // Object top to bottom of square guide
        
        // 4:5 POST GUIDE SNAPPING
        
        // Snap to post guide edges (top, bottom, left, right)
        if (Math.abs(y - postTopY) < snapThreshold) snappedY = postTopY;
        if (Math.abs(y + height - postBottomY) < snapThreshold) snappedY = postBottomY - height;
        if (Math.abs(x - postLeftX) < snapThreshold) snappedX = postLeftX;
        if (Math.abs(x + width - postRightX) < snapThreshold) snappedX = postRightX - width;
        
        // Snap to post guide centers (vertical and horizontal)
        if (Math.abs(centerX - postCenterX) < snapThreshold) snappedX = postCenterX - width / 2;
        if (Math.abs(centerY - postCenterY) < snapThreshold) snappedY = postCenterY - height / 2;
        
        // Snap to post guide corners (all four corners)
        if (Math.abs(x - postLeftX) < snapThreshold && Math.abs(y - postTopY) < snapThreshold) {
            snappedX = postLeftX;
            snappedY = postTopY;
        }
        if (Math.abs(x + width - postRightX) < snapThreshold && Math.abs(y - postTopY) < snapThreshold) {
            snappedX = postRightX - width;
            snappedY = postTopY;
        }
        if (Math.abs(x - postLeftX) < snapThreshold && Math.abs(y + height - postBottomY) < snapThreshold) {
            snappedX = postLeftX;
            snappedY = postBottomY - height;
        }
        if (Math.abs(x + width - postRightX) < snapThreshold && Math.abs(y + height - postBottomY) < snapThreshold) {
            snappedX = postRightX - width;
            snappedY = postBottomY - height;
        }
        
        // Snap element centers to post guide edges
        if (Math.abs(centerX - postLeftX) < snapThreshold) snappedX = postLeftX - width / 2;
        if (Math.abs(centerX - postRightX) < snapThreshold) snappedX = postRightX - width / 2;
        if (Math.abs(centerY - postTopY) < snapThreshold) snappedY = postTopY - height / 2;
        if (Math.abs(centerY - postBottomY) < snapThreshold) snappedY = postBottomY - height / 2;
        
        // ENHANCED: Snap to bottom side of upper post guide and top side of lower post guide
        if (Math.abs(y + height - postTopY) < snapThreshold) snappedY = postTopY - height; // Object bottom to top of post guide
        if (Math.abs(y - postBottomY) < snapThreshold) snappedY = postBottomY; // Object top to bottom of post guide
        
        // 9:16 STORIES GUIDE SNAPPING (entire slide)
        // Note: Stories guide uses the entire slide, so we already snap to its edges above
        // But we can add specific center snapping for stories
        
        const storiesCenterY = 960; // 1920 / 2
        
        if (Math.abs(centerY - storiesCenterY) < snapThreshold) {
            snappedY = storiesCenterY - height / 2;
        }
        
        // ENHANCED: Snap to stories guide edges (top and bottom of entire slide)
        if (Math.abs(y + height - 0) < snapThreshold) snappedY = 0 - height; // Object bottom to top of stories guide
        if (Math.abs(y - 1920) < snapThreshold) snappedY = 1920; // Object top to bottom of stories guide
    }
    
    // ENHANCED: Snap to other elements (images and text) - ALL edges, centers, and corners
    const otherElements = layerState.layers.filter(layer => 
        layer.element !== layerState.selectedLayer && 
        layer.element.style.display !== 'none'
    );
    
    otherElements.forEach(otherLayer => {
        const otherElement = otherLayer.element;
        const otherX = parseInt(otherElement.style.left) || 0;
        const otherY = parseInt(otherElement.style.top) || 0;
        const otherWidth = otherElement.offsetWidth;
        const otherHeight = otherElement.offsetHeight;
        const otherCenterX = otherX + otherWidth / 2;
        const otherCenterY = otherY + otherHeight / 2;
        
        // Snap to other element's edges (left, right, top, bottom)
        if (Math.abs(x - otherX) < snapThreshold) snappedX = otherX; // Left edge
        if (Math.abs(x + width - (otherX + otherWidth)) < snapThreshold) snappedX = otherX + otherWidth - width; // Right edge
        if (Math.abs(y - otherY) < snapThreshold) snappedY = otherY; // Top edge
        if (Math.abs(y + height - (otherY + otherHeight)) < snapThreshold) snappedY = otherY + otherHeight - height; // Bottom edge
        
        // Snap to other element's center
        if (Math.abs(centerX - otherCenterX) < snapThreshold) snappedX = otherCenterX - width / 2;
        if (Math.abs(centerY - otherCenterY) < snapThreshold) snappedY = otherCenterY - height / 2;
        
        // Snap to other element's corners (all four corners)
        if (Math.abs(x - otherX) < snapThreshold && Math.abs(y - otherY) < snapThreshold) {
            snappedX = otherX;
            snappedY = otherY;
        }
        if (Math.abs(x + width - (otherX + otherWidth)) < snapThreshold && Math.abs(y - otherY) < snapThreshold) {
            snappedX = otherX + otherWidth - width;
            snappedY = otherY;
        }
        if (Math.abs(x - otherX) < snapThreshold && Math.abs(y + height - (otherY + otherHeight)) < snapThreshold) {
            snappedX = otherX;
            snappedY = otherY + otherHeight - height;
        }
        if (Math.abs(x + width - (otherX + otherWidth)) < snapThreshold && Math.abs(y + height - (otherY + otherHeight)) < snapThreshold) {
            snappedX = otherX + otherWidth - width;
            snappedY = otherY + otherHeight - height;
        }
        
        // Snap element centers to other element's edges
        if (Math.abs(centerX - otherX) < snapThreshold) snappedX = otherX - width / 2;
        if (Math.abs(centerX - (otherX + otherWidth)) < snapThreshold) snappedX = otherX + otherWidth - width / 2;
        if (Math.abs(centerY - otherY) < snapThreshold) snappedY = otherY - height / 2;
        if (Math.abs(centerY - (otherY + otherHeight)) < snapThreshold) snappedY = otherY + otherHeight - height / 2;
        
        // Snap element corners to other element's centers
        if (Math.abs(x - otherCenterX) < snapThreshold) snappedX = otherCenterX;
        if (Math.abs(x + width - otherCenterX) < snapThreshold) snappedX = otherCenterX - width;
        if (Math.abs(y - otherCenterY) < snapThreshold) snappedY = otherCenterY;
        if (Math.abs(y + height - otherCenterY) < snapThreshold) snappedY = otherCenterY - height;
        
        // ENHANCED: Snap to bottom side of upper element and top side of lower element
        if (Math.abs(y + height - otherY) < snapThreshold) snappedY = otherY - height; // Object bottom to top of other element
        if (Math.abs(y - (otherY + otherHeight)) < snapThreshold) snappedY = otherY + otherHeight; // Object top to bottom of other element
    });
    
    return { x: snappedX, y: snappedY };
}

window.snapToGuidelines = snapToGuidelines;
