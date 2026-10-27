// Text Transform - a standalone rotate/crop/resize handle system for text2
// boxes. Functionally identical to the image transform widget (blue corner
// scale handles, orange edge crop handles, green rotation handle, blue
// outline) but implemented here in its own module. It does NOT import or touch
// image-transform.js in any way - the two systems are fully independent.
import { layerState } from './state.js';

(function () {
    'use strict';

    const MIN_SIZE = 20; // Minimum crop size in local coordinates
    const OVERLAY_ID = 'ss-text2-handles';

    let selectedElement = null;
    const models = new Map();

    // Interaction state
    const interaction = {
        active: false,
        mode: null,
        startMouse: { x: 0, y: 0 },
        startModel: null,
        startVisibleRect: null,
        anchorLocal: null,
        anchorWorld: null,
        initialActiveLocal: null,
        initialScale: 0,
        initialRotation: 0,
        rotationCenterWorld: null
    };

    // ============================================================================
    // UTILS
    // ============================================================================

    function getDesignerCanvas() {
        return document.getElementById('ss-designer-canvas');
    }

    function getCanvasRect() {
        const canvas = document.getElementById('ss-image-canvas') || getDesignerCanvas();
        return canvas.getBoundingClientRect();
    }

    // Account for the CSS zoom scale applied to the designer canvas
    function getCanvasScale() {
        const designerCanvas = getDesignerCanvas();
        if (designerCanvas && designerCanvas.style.transform && designerCanvas.style.transform.indexOf('scale(') !== -1) {
            const m = designerCanvas.style.transform.match(/scale\(([^)]+)\)/);
            if (m) {
                const parsed = parseFloat(m[1]);
                if (!isNaN(parsed) && parsed > 0) return parsed;
            }
        }
        return 1;
    }

    function round(v, n) {
        const f = Math.pow(10, n === undefined ? 3 : n);
        return Math.round(v * f) / f;
    }

    function isText2(el) {
        return !!(el && el.classList && el.classList.contains('ss-text2-element'));
    }

    // ============================================================================
    // MODEL (derived from the DOM + datasets; the DOM is the source of truth)
    // ============================================================================

    function parseScaleDataset(el) {
        const raw = el.dataset.text2Scale;
        if (!raw) return null;
        let s;
        if (raw.indexOf('|') !== -1) {
            // Backwards-compatible: old "sx|sy" format, use the x component.
            s = parseFloat(raw.split('|')[0]);
        } else {
            s = parseFloat(raw);
        }
        return isFinite(s) && s > 0 ? s : null;
    }

    function parseCropDataset(el, baseW, baseH) {
        const raw = el.dataset.text2Crop;
        if (raw) {
            const m = /^([-\d.]+)\|([-\d.]+)\|([-\d.]+)\|([-\d.]+)$/.exec(String(raw).trim());
            if (m) {
                let x = parseFloat(m[1]);
                let y = parseFloat(m[2]);
                let w = parseFloat(m[3]);
                let h = parseFloat(m[4]);
                if (isFinite(x) && isFinite(y) && isFinite(w) && isFinite(h) && w > 0 && h > 0) {
                    x = Math.max(0, Math.min(x, baseW - MIN_SIZE));
                    y = Math.max(0, Math.min(y, baseH - MIN_SIZE));
                    w = Math.min(w, baseW - x);
                    h = Math.min(h, baseH - y);
                    return { x: x, y: y, width: w, height: h };
                }
            }
        }
        return { x: 0, y: 0, width: baseW, height: baseH };
    }

    function buildModel(el) {
        const clip = el.querySelector ? el.querySelector('.ss-text2-clip') : null;
        const content = clip ? clip.querySelector('.ss-text-content') : null;
        const baseW = parseFloat(el.dataset.text2BaseW) ||
            (content ? parseFloat(content.style.width) : NaN) ||
            el.offsetWidth || 200;
        const baseH = parseFloat(el.dataset.text2BaseH) ||
            (content ? parseFloat(content.style.height) : NaN) ||
            el.offsetHeight || 60;
        const scale = parseScaleDataset(el) || 1;
        const deg = parseFloat(el.dataset.text2Rot) || 0;
        return {
            element: el,
            content: content,
            baseW: baseW,
            baseH: baseH,
            scale: scale,
            rotation: deg * Math.PI / 180,
            visibleRect: parseCropDataset(el, baseW, baseH),
            position: { x: parseInt(el.style.left) || 0, y: parseInt(el.style.top) || 0 },
            locked: el.dataset.text2Locked === '1',
            mo: null
        };
    }

    // ============================================================================
    // COORDINATE TRANSFORMS (identical math to the image widget)
    // ============================================================================

    function localToWorld(model, pLocal) {
        const cos = Math.cos(model.rotation);
        const sin = Math.sin(model.rotation);
        const sx = pLocal.x * model.scale;
        const sy = pLocal.y * model.scale;
        return {
            x: model.position.x + (cos * sx - sin * sy),
            y: model.position.y + (sin * sx + cos * sy)
        };
    }

    function worldToLocal(model, pWorld) {
        const dx = pWorld.x - model.position.x;
        const dy = pWorld.y - model.position.y;
        const cos = Math.cos(model.rotation);
        const sin = Math.sin(model.rotation);
        return {
            x: (dx * cos + dy * sin) / model.scale,
            y: (-dx * sin + dy * cos) / model.scale
        };
    }

    function distance(p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function worldToLocalAt(pWorld, position, scale, rotation) {
        const dx = pWorld.x - position.x;
        const dy = pWorld.y - position.y;
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        return {
            x: (dx * cos + dy * sin) / scale,
            y: (-dx * sin + dy * cos) / scale
        };
    }

    // ============================================================================
    // DOM SYNC
    // ============================================================================

    function syncLayerState(model) {
        const el = model.element;
        const idx = layerState.layers.findIndex(function (l) { return l.element === el; });
        if (idx === -1) return;
        const layer = layerState.layers[idx];
        layer.position = { left: model.position.x, top: model.position.y };
        layer.size = {
            width: model.visibleRect.width * model.scale,
            height: model.visibleRect.height * model.scale
        };
        layer.rotation = model.rotation * 180 / Math.PI;
        layerState.layers[idx] = layer;
    }

    // Write the model back into the text2 DOM:
    //   - the box is the visible (cropped) stage: vr.w*s x vr.h*s
    //   - the content is translated/scaled inside the clip so the crop shows
    //   - the box rotates around its own top-left corner (translate+rotate),
    //     which reproduces the model's localToWorld mapping exactly
    function applyModelToDom(model) {
        const el = model.element;
        const vr = model.visibleRect;
        const s = model.scale;
        const boxW = vr.width * s;
        const boxH = vr.height * s;

        el.style.left = round(model.position.x, 2) + 'px';
        el.style.top = round(model.position.y, 2) + 'px';
        el.style.width = round(boxW, 2) + 'px';
        el.style.height = round(boxH, 2) + 'px';

        if (model.content) {
            const tx = -vr.x * s;
            const ty = -vr.y * s;
            if (Math.abs(tx) < 0.01 && Math.abs(ty) < 0.01 && Math.abs(s - 1) < 0.001) {
                model.content.style.transform = '';
            } else {
                model.content.style.transform = 'translate(' + round(tx, 2) + 'px,' + round(ty, 2) + 'px) scale(' + round(s, 3) + ',' + round(s, 3) + ')';
            }
        }

        const rad = model.rotation;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);
        const dx = vr.x * s * cos - vr.y * s * sin;
        const dy = vr.x * s * sin + vr.y * s * cos;
        const deg = rad * 180 / Math.PI;
        if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01 && Math.abs(deg) < 0.001) {
            el.style.transform = '';
        } else {
            el.style.transform = 'translate(' + round(dx, 2) + 'px,' + round(dy, 2) + 'px) rotate(' + round(deg, 3) + 'deg)';
        }

        el.dataset.text2Scale = String(round(s, 3));
        el.dataset.text2Crop = round(vr.x, 1) + '|' + round(vr.y, 1) + '|' + round(vr.width, 1) + '|' + round(vr.height, 1);
        el.dataset.text2Rot = String(round(deg, 3));

        syncLayerState(model);
    }

    // ============================================================================
    // HANDLES OVERLAY
    // ============================================================================

    function getOverlay() {
        const designerCanvas = getDesignerCanvas();
        if (!designerCanvas) return null;
        let overlay = document.getElementById(OVERLAY_ID);
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = OVERLAY_ID;
            overlay.style.position = 'absolute';
            overlay.style.left = '0px';
            overlay.style.top = '0px';
            overlay.style.width = '100%';
            overlay.style.height = '100%';
            overlay.style.pointerEvents = 'none';
            overlay.style.zIndex = '5000';
            designerCanvas.appendChild(overlay);
        }
        return overlay;
    }

    function computeHandles(model) {
        const r = model.visibleRect;
        return [
            { id: 'scale-tl', type: 'corner', localX: r.x, localY: r.y },
            { id: 'scale-tr', type: 'corner', localX: r.x + r.width, localY: r.y },
            { id: 'scale-bl', type: 'corner', localX: r.x, localY: r.y + r.height },
            { id: 'scale-br', type: 'corner', localX: r.x + r.width, localY: r.y + r.height },

            { id: 'crop-top', type: 'crop', localX: r.x + r.width / 2, localY: r.y },
            { id: 'crop-bottom', type: 'crop', localX: r.x + r.width / 2, localY: r.y + r.height },
            { id: 'crop-left', type: 'crop', localX: r.x, localY: r.y + r.height / 2 },
            { id: 'crop-right', type: 'crop', localX: r.x + r.width, localY: r.y + r.height / 2 },

            { id: 'rotate', type: 'rotate', localX: r.x + r.width / 2, localY: r.y - 40 / model.scale }
        ];
    }

    function drawOutline(model, overlay, stroke) {
        const corners = {
            tl: localToWorld(model, { x: model.visibleRect.x, y: model.visibleRect.y }),
            tr: localToWorld(model, { x: model.visibleRect.x + model.visibleRect.width, y: model.visibleRect.y }),
            bl: localToWorld(model, { x: model.visibleRect.x, y: model.visibleRect.y + model.visibleRect.height }),
            br: localToWorld(model, { x: model.visibleRect.x + model.visibleRect.width, y: model.visibleRect.y + model.visibleRect.height })
        };

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.position = 'absolute';
        svg.style.left = '0';
        svg.style.top = '0';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.pointerEvents = 'none';

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M ' + corners.tl.x + ' ' + corners.tl.y +
            ' L ' + corners.tr.x + ' ' + corners.tr.y +
            ' L ' + corners.br.x + ' ' + corners.br.y +
            ' L ' + corners.bl.x + ' ' + corners.bl.y + ' Z');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', stroke);
        path.setAttribute('stroke-width', '2');
        svg.appendChild(path);
        overlay.appendChild(svg);
    }

    function getCornerCursor(id) {
        if (id === 'scale-tl' || id === 'scale-br') return 'nwse-resize';
        if (id === 'scale-tr' || id === 'scale-bl') return 'nesw-resize';
        return 'default';
    }

    function getCropCursor(id, rotation) {
        const isHorizontal = id.indexOf('top') !== -1 || id.indexOf('bottom') !== -1;
        const deg = (rotation * 180 / Math.PI) % 360;
        const normalizedDeg = ((deg % 360) + 360) % 360;
        if (isHorizontal) {
            if (normalizedDeg >= 45 && normalizedDeg < 135) return 'ew-resize';
            if (normalizedDeg >= 135 && normalizedDeg < 225) return 'ns-resize';
            if (normalizedDeg >= 225 && normalizedDeg < 315) return 'ew-resize';
            return 'ns-resize';
        } else {
            if (normalizedDeg >= 45 && normalizedDeg < 135) return 'ns-resize';
            if (normalizedDeg >= 135 && normalizedDeg < 225) return 'ew-resize';
            if (normalizedDeg >= 225 && normalizedDeg < 315) return 'ns-resize';
            return 'ew-resize';
        }
    }

    function renderHandles() {
        const overlay = getOverlay();
        if (!overlay) return;
        overlay.innerHTML = '';

        const model = selectedElement ? models.get(selectedElement) : null;
        if (!model) return;

        // Locked text2 boxes get a red ring, exactly like locked images.
        if (model.locked) {
            drawOutline(model, overlay, 'rgba(231, 76, 60, 0.85)');
            return;
        }

        computeHandles(model).forEach(function (h) {
            const worldPos = localToWorld(model, { x: h.localX, y: h.localY });
            const el = document.createElement('div');
            el.className = 'ss-text2-handle';
            el.style.position = 'absolute';
            el.style.pointerEvents = 'auto';
            el.dataset.handleId = h.id;

            if (h.type === 'corner') {
                const size = 18;
                el.style.width = size + 'px';
                el.style.height = size + 'px';
                el.style.borderRadius = '50%';
                el.style.background = '#1976d2';
                el.style.border = '2px solid #fff';
                el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.4)';
                el.style.left = (worldPos.x - size / 2) + 'px';
                el.style.top = (worldPos.y - size / 2) + 'px';
                el.style.cursor = getCornerCursor(h.id);
            } else if (h.type === 'crop') {
                const isHorizontal = h.id.indexOf('top') !== -1 || h.id.indexOf('bottom') !== -1;
                const w = isHorizontal ? 54 : 18;
                const ht = isHorizontal ? 18 : 54;
                el.style.width = w + 'px';
                el.style.height = ht + 'px';
                el.style.background = '#ff6600';
                el.style.border = '2px solid #fff';
                el.style.borderRadius = '9px';
                el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.4)';
                el.style.left = (worldPos.x - w / 2) + 'px';
                el.style.top = (worldPos.y - ht / 2) + 'px';
                el.style.transform = 'rotate(' + model.rotation + 'rad)';
                el.style.cursor = getCropCursor(h.id, model.rotation);
            } else if (h.type === 'rotate') {
                const size = 14;
                el.style.width = size + 'px';
                el.style.height = size + 'px';
                el.style.borderRadius = '50%';
                el.style.background = '#00cc66';
                el.style.border = '2px solid #fff';
                el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.4)';
                el.style.left = (worldPos.x - size / 2) + 'px';
                el.style.top = (worldPos.y - size / 2) + 'px';
                el.style.cursor = 'grab';
            }

            el.addEventListener('mousedown', onHandleMouseDown);
            overlay.appendChild(el);
        });

        drawOutline(model, overlay, '#1976d2');
    }

    // ============================================================================
    // INTERACTION HANDLERS
    // ============================================================================

    function onHandleMouseDown(e) {
        e.preventDefault();
        e.stopPropagation();

        const model = selectedElement ? models.get(selectedElement) : null;
        if (!model || model.locked) return;

        const rect = getCanvasRect();
        const canvasScale = getCanvasScale();

        interaction.active = true;
        interaction.mode = e.target.dataset.handleId;
        interaction.startMouse = {
            x: (e.clientX - rect.left) / canvasScale,
            y: (e.clientY - rect.top) / canvasScale
        };

        interaction.startModel = {
            position: { x: model.position.x, y: model.position.y },
            scale: model.scale,
            rotation: model.rotation
        };
        interaction.startVisibleRect = { x: model.visibleRect.x, y: model.visibleRect.y, width: model.visibleRect.width, height: model.visibleRect.height };
        interaction.initialScale = model.scale;
        interaction.initialRotation = model.rotation;

        if (interaction.mode.indexOf('scale-') === 0) {
            const corner = interaction.mode.split('-')[1];
            let activeX, activeY, anchorX, anchorY;
            const r = model.visibleRect;
            if (corner === 'tl') {
                activeX = r.x; activeY = r.y;
                anchorX = r.x + r.width; anchorY = r.y + r.height;
            } else if (corner === 'tr') {
                activeX = r.x + r.width; activeY = r.y;
                anchorX = r.x; anchorY = r.y + r.height;
            } else if (corner === 'bl') {
                activeX = r.x; activeY = r.y + r.height;
                anchorX = r.x + r.width; anchorY = r.y;
            } else {
                activeX = r.x + r.width; activeY = r.y + r.height;
                anchorX = r.x; anchorY = r.y;
            }
            interaction.initialActiveLocal = { x: activeX, y: activeY };
            interaction.anchorLocal = { x: anchorX, y: anchorY };
            interaction.anchorWorld = localToWorld(model, interaction.anchorLocal);
        }

        if (interaction.mode === 'rotate') {
            const centerLocal = {
                x: model.visibleRect.x + model.visibleRect.width / 2,
                y: model.visibleRect.y + model.visibleRect.height / 2
            };
            interaction.rotationCenterWorld = localToWorld(model, centerLocal);
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    function onMouseMove(e) {
        if (!interaction.active) return;
        const model = selectedElement ? models.get(selectedElement) : null;
        if (!model) return;

        const rect = getCanvasRect();
        const canvasScale = getCanvasScale();
        const mouseWorld = {
            x: (e.clientX - rect.left) / canvasScale,
            y: (e.clientY - rect.top) / canvasScale
        };

        if (interaction.mode.indexOf('crop-') === 0) {
            handleCrop(model, mouseWorld);
        } else if (interaction.mode.indexOf('scale-') === 0) {
            handleScale(model, mouseWorld);
        } else if (interaction.mode === 'rotate') {
            handleRotate(model, mouseWorld);
        }

        applyModelToDom(model);
        renderHandles();
    }

    function onMouseUp() {
        interaction.active = false;
        interaction.mode = null;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        const model = selectedElement ? models.get(selectedElement) : null;
        if (model) syncLayerState(model);
        if (typeof window.saveState === 'function') window.saveState();
    }

    // ============================================================================
    // CROP LOGIC
    // ============================================================================

    function handleCrop(model, mouseWorld) {
        const pLocal = worldToLocal(model, mouseWorld);

        if (interaction.mode === 'crop-left') {
            const rightEdge = model.visibleRect.x + model.visibleRect.width;
            const newX = Math.max(0, Math.min(pLocal.x, rightEdge - MIN_SIZE));
            model.visibleRect.x = newX;
            model.visibleRect.width = rightEdge - newX;
        } else if (interaction.mode === 'crop-right') {
            const newRight = Math.max(pLocal.x, model.visibleRect.x + MIN_SIZE);
            model.visibleRect.width = newRight - model.visibleRect.x;
        } else if (interaction.mode === 'crop-top') {
            const bottomEdge = model.visibleRect.y + model.visibleRect.height;
            const newY = Math.max(0, Math.min(pLocal.y, bottomEdge - MIN_SIZE));
            model.visibleRect.y = newY;
            model.visibleRect.height = bottomEdge - newY;
        } else if (interaction.mode === 'crop-bottom') {
            const newBottom = Math.max(pLocal.y, model.visibleRect.y + MIN_SIZE);
            model.visibleRect.height = newBottom - model.visibleRect.y;
        }

        model.visibleRect.x = Math.max(0, Math.min(model.visibleRect.x, model.baseW - MIN_SIZE));
        model.visibleRect.y = Math.max(0, Math.min(model.visibleRect.y, model.baseH - MIN_SIZE));
        model.visibleRect.width = Math.max(MIN_SIZE, Math.min(model.visibleRect.width, model.baseW - model.visibleRect.x));
        model.visibleRect.height = Math.max(MIN_SIZE, Math.min(model.visibleRect.height, model.baseH - model.visibleRect.y));
    }

    // ============================================================================
    // SCALE LOGIC
    // ============================================================================

    function handleScale(model, mouseWorld) {
        const start = interaction.startModel;
        if (!start) return;

        // Convert the cursor to local coordinates using the INITIAL transform
        // so the box tracks the mouse 1:1 (no feedback loop, no lag).
        const pLocalMouse = worldToLocalAt(mouseWorld, start.position, start.scale, start.rotation);

        const d0 = distance(interaction.initialActiveLocal, interaction.anchorLocal);
        const d1 = distance(pLocalMouse, interaction.anchorLocal);
        if (d0 === 0) return;

        const scaleRatio = Math.max(0.01, Math.min(d1 / d0, 100));
        const targetScale = start.scale * scaleRatio;
        model.scale = Math.max(0.05, Math.min(targetScale, 50));

        // Keep the anchor corner fixed in world coordinates
        const cos = Math.cos(start.rotation);
        const sin = Math.sin(start.rotation);
        const ax = interaction.anchorLocal.x * model.scale;
        const ay = interaction.anchorLocal.y * model.scale;
        model.position.x = interaction.anchorWorld.x - (cos * ax - sin * ay);
        model.position.y = interaction.anchorWorld.y - (sin * ax + cos * ay);
    }

    // ============================================================================
    // ROTATION LOGIC
    // ============================================================================

    function handleRotate(model, mouseWorld) {
        const centerLocal = {
            x: model.visibleRect.x + model.visibleRect.width / 2,
            y: model.visibleRect.y + model.visibleRect.height / 2
        };
        const centerWorld = interaction.rotationCenterWorld;

        const dx = mouseWorld.x - centerWorld.x;
        const dy = mouseWorld.y - centerWorld.y;
        const angle = Math.atan2(dy, dx);

        const initialDx = interaction.startMouse.x - centerWorld.x;
        const initialDy = interaction.startMouse.y - centerWorld.y;
        const initialAngle = Math.atan2(initialDy, initialDx);

        let newRotation = interaction.initialRotation + (angle - initialAngle);

        // Snap to 0, 90, 180, 270 degrees if close (within 5 degrees)
        const snapThreshold = 5 * Math.PI / 180;
        const snapAngles = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2];
        const normalizedRotation = ((newRotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        for (let i = 0; i < snapAngles.length; i++) {
            const snapAngle = snapAngles[i];
            if (Math.abs(normalizedRotation - snapAngle) < snapThreshold ||
                Math.abs(normalizedRotation - (snapAngle + 2 * Math.PI)) < snapThreshold) {
                const base = ((interaction.initialRotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
                newRotation = interaction.initialRotation + (snapAngle - base);
                break;
            }
        }

        model.rotation = newRotation;

        // Adjust position so the visible center stays in the same world position
        const newCenterWorld = localToWorld(model, centerLocal);
        model.position.x += centerWorld.x - newCenterWorld.x;
        model.position.y += centerWorld.y - newCenterWorld.y;
    }

    // ============================================================================
    // PUBLIC API
    // ============================================================================

    // Register (or re-register) a text2 box. Rebuilds the model from the DOM
    // and re-applies the canonical transform. Called at create/edit/restore.
    function register(element) {
        if (!isText2(element)) return element;
        const model = buildModel(element);
        models.set(element, model);
        applyModelToDom(model);
        if (selectedElement === element) renderHandles();
        return element;
    }

    // Select a text2 box: show its handles/outline and keep the model in sync
    // while the box is dragged around with the generic drag system.
    function select(element) {
        if (!isText2(element)) return;
        let model = models.get(element);
        if (!model) {
            model = buildModel(element);
            models.set(element, model);
        }
        model.position.x = parseInt(element.style.left) || 0;
        model.position.y = parseInt(element.style.top) || 0;
        model.locked = element.dataset.text2Locked === '1';
        if (!model.mo) {
            model.mo = new MutationObserver(function () {
                const m = models.get(element);
                if (!m || interaction.active) return;
                const left = parseInt(element.style.left) || 0;
                const top = parseInt(element.style.top) || 0;
                if (left !== m.position.x || top !== m.position.y) {
                    m.position.x = left;
                    m.position.y = top;
                }
                if (selectedElement === element) renderHandles();
            });
            model.mo.observe(element, { attributes: true, attributeFilter: ['style'] });
        }
        selectedElement = element;
        renderHandles();
        if (typeof window.updateImageToolUIForSelection === 'function') window.updateImageToolUIForSelection();
    }

    function deselectAll() {
        models.forEach(function (m) {
            if (m.mo) { try { m.mo.disconnect(); } catch (e) {} }
        });
        models.clear();
        selectedElement = null;
        const overlay = document.getElementById(OVERLAY_ID);
        if (overlay) overlay.innerHTML = '';
    }

    function getSelectedElement() {
        return selectedElement;
    }

    function hasSelected() {
        return !!selectedElement;
    }

    // Hide (soft-delete) the actively selected text2 box, like images.
    function deleteSelected() {
        const el = selectedElement;
        if (!el) return;
        if (typeof window.saveState === 'function') window.saveState();
        el.style.display = 'none';
        el.style.pointerEvents = 'none';
        const idx = layerState.layers.findIndex(function (l) { return l.element === el; });
        if (idx !== -1) {
            layerState.layers[idx].visible = false;
            layerState.layers[idx].disabled = true;
        }
        deselectAll();
        if (typeof window.updateLayerOrderButtons === 'function') window.updateLayerOrderButtons();
        if (typeof window.updateImageToolUIForSelection === 'function') window.updateImageToolUIForSelection();
        if (typeof window.saveState === 'function') window.saveState();
    }

    // Duplicate the actively selected text2 box (offset +20/+20).
    function duplicateSelected() {
        const el = selectedElement;
        if (!el) return;
        const designerCanvas = getDesignerCanvas();
        if (!designerCanvas) return;
        if (typeof window.saveState === 'function') window.saveState();

        const clone = el.cloneNode(true);
        clone.classList.remove('selected');
        clone.id = 'text2-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        const left = (parseInt(el.style.left) || 0) + 20;
        const top = (parseInt(el.style.top) || 0) + 20;
        clone.style.left = left + 'px';
        clone.style.top = top + 'px';
        if (!layerState.nextZIndex || layerState.nextZIndex < 200) layerState.nextZIndex = 200;
        const zIndex = layerState.nextZIndex++;
        clone.style.zIndex = String(zIndex);
        designerCanvas.appendChild(clone);

        const cloneModel = buildModel(clone);
        models.set(clone, cloneModel);
        applyModelToDom(cloneModel);

        const contentEl = clone.querySelector ? clone.querySelector('.ss-text-content') : null;
        const layer = {
            id: clone.id,
            element: clone,
            type: 'text',
            isText2: true,
            zIndex: zIndex,
            position: { left: left, top: top },
            size: {
                width: cloneModel.visibleRect.width * cloneModel.scale,
                height: cloneModel.visibleRect.height * cloneModel.scale
            },
            fontSize: parseFloat(clone.dataset.text2Size) || 24,
            rotation: cloneModel.rotation * 180 / Math.PI,
            visible: true,
            disabled: false,
            textContent: (contentEl && contentEl.textContent) || 'Text',
            style: {}
        };
        layerState.layers.push(layer);

        if (typeof window.makeElementDraggable === 'function') window.makeElementDraggable(clone);
        if (typeof window.makeElementSelectable === 'function') window.makeElementSelectable(clone);
        select(clone);
        if (typeof window.saveState === 'function') window.saveState();
    }

    // Toggle the lock state of the actively selected text2 box.
    function toggleLock() {
        const el = selectedElement;
        if (!el) return;
        const locked = el.dataset.text2Locked === '1';
        el.dataset.text2Locked = locked ? '0' : '1';
        const model = models.get(el);
        if (model) model.locked = !locked;
        renderHandles();
        if (typeof window.saveState === 'function') window.saveState();
        if (typeof window.updateImageToolUIForSelection === 'function') window.updateImageToolUIForSelection();
    }

    window.SSText2Transform = {
        register: register,
        select: select,
        deselectAll: deselectAll,
        getSelectedElement: getSelectedElement,
        hasSelected: hasSelected,
        isText2: isText2,
        deleteSelected: deleteSelected,
        duplicateSelected: duplicateSelected,
        toggleLock: toggleLock
    };
})();
