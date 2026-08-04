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

// ============================================================================
// MAGNET SNAPPING ENGINE
// ============================================================================
// Snaps an element to canvas edges, visible guide lines (only when SoMe Guides
// are turned on) and to every other object's sides/corners/center. Works with
// rotated objects by operating on their axis-aligned bounding box.

const SNAP_THRESHOLD = 8;
const SNAP_RELEASE_THRESHOLD = 12;

// Glue state for the current drag gesture: which target line each axis is
// currently snapped to and through which anchor. Once snapped, the element stays
// glued to that line until it is dragged beyond the release threshold, which
// prevents the box from oscillating between different anchors/lines.
const magnetSession = { x: null, y: null };

export function snapReset() {
    magnetSession.x = null;
    magnetSession.y = null;
}
window.snapReset = snapReset;

// Bounding box of a box rotated around its own center (radians).
function computeRotatedAABB(x, y, width, height, rotation) {
    if (!rotation) return { left: x, top: y, width: width, height: height };
    const cx = x + width / 2;
    const cy = y + height / 2;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const hw = width / 2;
    const hh = height / 2;
    const dxs = [
        -hw * cos + hh * sin,
         hw * cos + hh * sin,
         hw * cos - hh * sin,
        -hw * cos - hh * sin
    ];
    const dys = [
        -hw * sin - hh * cos,
         hw * sin - hh * cos,
         hw * sin + hh * cos,
        -hw * sin + hh * cos
    ];
    const minX = cx + Math.min.apply(null, dxs);
    const maxX = cx + Math.max.apply(null, dxs);
    const minY = cy + Math.min.apply(null, dys);
    const maxY = cy + Math.max.apply(null, dys);
    return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
}

// AABB of a DOM element in canvas coordinates (undoes the designer zoom scale).
function getCanvasSpaceRect(el) {
    const designerCanvas = document.getElementById('ss-designer-canvas');
    const canvasRect = designerCanvas ? designerCanvas.getBoundingClientRect() : { left: 0, top: 0, width: 1, height: 1 };
    const er = el.getBoundingClientRect();
    const scaleX = (designerCanvas && designerCanvas.offsetWidth > 0) ? canvasRect.width / designerCanvas.offsetWidth : 1;
    const scaleY = (designerCanvas && designerCanvas.offsetHeight > 0) ? canvasRect.height / designerCanvas.offsetHeight : 1;
    return {
        left: (er.left - canvasRect.left) / scaleX,
        top: (er.top - canvasRect.top) / scaleY,
        width: er.width / scaleX,
        height: er.height / scaleY
    };
}

// Axis-aligned bounding boxes of every other snappable object on the canvas.
function collectOtherBoxes(excludeEl, excludeImgId) {
    const boxes = [];
    layerState.layers.forEach(function(layer) {
        const el = layer.element;
        if (!el || el === excludeEl) return;
        if (el.style.display === 'none') return;
        const rect = getCanvasSpaceRect(el);
        if (rect.width > 0 && rect.height > 0) boxes.push(rect);
    });
    if (window.SSImageTransform && typeof window.SSImageTransform.getSnapRegions === 'function') {
        const regions = window.SSImageTransform.getSnapRegions(excludeImgId);
        if (regions && regions.length) {
            regions.forEach(function(r) { boxes.push(r); });
        }
    }
    return boxes;
}

// All vertical/horizontal snap target lines currently available.
function collectSnapLines(excludeEl, excludeImgId) {
    const vLines = [];
    const hLines = [];
    const addLine = function(arr, val) {
        const v = Math.round(val * 1000) / 1000;
        if (arr.indexOf(v) === -1) arr.push(v);
    };

    // Canvas edges are always snapped to
    addLine(vLines, 0);
    addLine(vLines, canvasState.width);
    addLine(hLines, 0);
    addLine(hLines, canvasState.height);

    // Slide separators are canvas sides too, so they always snap
    for (let section = 1; section < canvasState.sections; section++) {
        addLine(vLines, section * 1080);
    }

    // Guide lines only snap while SoMe Guides are turned on
    if (guidanceState.active) {
        addLine(hLines, canvasState.height / 2);
        for (let section = 0; section < canvasState.sections; section++) {
            const sectionStartX = section * 1080;

            addLine(vLines, sectionStartX + 540); // vertical center line

            // 1:1 Square guide (top/bottom)
            const squareTopY = (1920 - 1080) / 2;
            const squareBottomY = squareTopY + 1080;
            addLine(hLines, squareTopY);
            addLine(hLines, squareBottomY);

            // 4:5 Post guide (top/bottom)
            const postTopY = (1920 - 1350) / 2;
            const postBottomY = postTopY + 1350;
            addLine(hLines, postTopY);
            addLine(hLines, postBottomY);
        }
    }

    // Snap to other objects (sides, corners and center)
    collectOtherBoxes(excludeEl, excludeImgId).forEach(function(other) {
        addLine(vLines, other.left);
        addLine(vLines, other.left + other.width);
        addLine(hLines, other.top);
        addLine(hLines, other.top + other.height);
        addLine(vLines, other.left + other.width / 2);
        addLine(hLines, other.top + other.height / 2);
    });

    return { vLines: vLines, hLines: hLines };
}

// Best candidate for aligning one of three anchors (left/center/right) of a box
// with any of the given target lines, within the snap threshold.
function findXSnap(left, center, right, lines) {
    let best = null;
    const anchors = [
        { anchor: 'left', value: left },
        { anchor: 'center', value: center },
        { anchor: 'right', value: right }
    ];
    for (let a = 0; a < anchors.length; a++) {
        const anchor = anchors[a];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const d = Math.abs(line - anchor.value);
            if (d < SNAP_THRESHOLD && (!best || d < best.dist)) {
                best = { line: line, anchor: anchor.anchor, delta: line - anchor.value, dist: d };
            }
        }
    }
    return best;
}

function findYSnap(top, center, bottom, lines) {
    let best = null;
    const anchors = [
        { anchor: 'top', value: top },
        { anchor: 'center', value: center },
        { anchor: 'bottom', value: bottom }
    ];
    for (let a = 0; a < anchors.length; a++) {
        const anchor = anchors[a];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const d = Math.abs(line - anchor.value);
            if (d < SNAP_THRESHOLD && (!best || d < best.dist)) {
                best = { line: line, anchor: anchor.anchor, delta: line - anchor.value, dist: d };
            }
        }
    }
    return best;
}

// Snap an axis-aligned bounding box to the closest target lines, with hysteresis.
function snapAABB(aabb, excludeEl, excludeImgId) {
    const lines = collectSnapLines(excludeEl, excludeImgId);
    let deltaX = 0;
    let deltaY = 0;

    // ---- X axis ----
    const leftX = aabb.left;
    const centerX = aabb.left + aabb.width / 2;
    const rightX = aabb.left + aabb.width;
    const xAnchorPos = function(s) {
        if (s.anchor === 'center') return centerX;
        if (s.anchor === 'right') return rightX;
        return leftX;
    };
    if (magnetSession.x) {
        const s = magnetSession.x;
        if (Math.abs(xAnchorPos(s) - s.line) < SNAP_RELEASE_THRESHOLD) {
            deltaX = s.line - xAnchorPos(s); // stay glued to the same line
        } else {
            const cand = findXSnap(leftX, centerX, rightX, lines.vLines);
            if (cand) {
                magnetSession.x = { line: cand.line, anchor: cand.anchor };
                deltaX = cand.delta;
            } else {
                magnetSession.x = null;
            }
        }
    } else {
        const cand = findXSnap(leftX, centerX, rightX, lines.vLines);
        if (cand) {
            magnetSession.x = { line: cand.line, anchor: cand.anchor };
            deltaX = cand.delta;
        }
    }

    // ---- Y axis ----
    const topY = aabb.top;
    const centerY = aabb.top + aabb.height / 2;
    const bottomY = aabb.top + aabb.height;
    const yAnchorPos = function(s) {
        if (s.anchor === 'center') return centerY;
        if (s.anchor === 'bottom') return bottomY;
        return topY;
    };
    if (magnetSession.y) {
        const s = magnetSession.y;
        if (Math.abs(yAnchorPos(s) - s.line) < SNAP_RELEASE_THRESHOLD) {
            deltaY = s.line - yAnchorPos(s); // stay glued to the same line
        } else {
            const cand = findYSnap(topY, centerY, bottomY, lines.hLines);
            if (cand) {
                magnetSession.y = { line: cand.line, anchor: cand.anchor };
                deltaY = cand.delta;
            } else {
                magnetSession.y = null;
            }
        }
    } else {
        const cand = findYSnap(topY, centerY, bottomY, lines.hLines);
        if (cand) {
            magnetSession.y = { line: cand.line, anchor: cand.anchor };
            deltaY = cand.delta;
        }
    }

    return {
        left: aabb.left + deltaX,
        top: aabb.top + deltaY,
        width: aabb.width,
        height: aabb.height
    };
}

// Legacy wrapper: snap an unrotated (or rotated) box, returns adjusted origin.
export function snapToGuidelines(x, y, width, height, rotation) {
    if (!magnetState.active) return { x: x, y: y };
    snapReset();
    const aabb = computeRotatedAABB(x, y, width, height, rotation || 0);
    const snapped = snapAABB(aabb, null, null);
    return { x: x + (snapped.left - aabb.left), y: y + (snapped.top - aabb.top) };
}

// Snap a DOM element whose target position is (x, y). Rotation-aware via AABB.
export function snapElementAt(x, y, el) {
    if (!magnetState.active || !el) return { x: x, y: y };
    const currentLeft = parseInt(el.style.left) || 0;
    const currentTop = parseInt(el.style.top) || 0;
    const base = getCanvasSpaceRect(el);
    const targetBox = {
        left: base.left + (x - currentLeft),
        top: base.top + (y - currentTop),
        width: base.width,
        height: base.height
    };
    const snapped = snapAABB(targetBox, el, null);
    return { x: x + (snapped.left - targetBox.left), y: y + (snapped.top - targetBox.top) };
}

window.snapToGuidelines = snapToGuidelines;
window.snapElementAt = snapElementAt;
window.snapBox = snapAABB;

export { snapAABB as snapBox };