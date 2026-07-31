// Mathematically Correct Image Transform System
(function(window){
    if (!window) return;

    const BASE_CANVAS_WIDTH = 1080;
    const CANVAS_HEIGHT = 1920;
    const MIN_SIZE = 20; // Minimum crop size in local coordinates

    const state = {
        images: [], // Array of { id, position, scale, rotation, originalWidth, originalHeight, bitmap, visibleRect, domId }
        canvasSteps: 1,
        handles: [],
        dragging: null,
        selectedImageId: null,
        nextImageId: 1
    };

    // Interaction state
    const interaction = {
        active: false,
        mode: null,
        startMouse: { x: 0, y: 0 },
        startImage: null,
        startVisibleRect: null,
        anchorLocal: null,
        anchorWorld: null,
        initialActiveLocal: null,
        initialScale: 0,
        initialRotation: 0,
        rotationCenterWorld: null
    };

    // ============================================================================
    // COORDINATE TRANSFORMS
    // ============================================================================

    function localToWorld(img, pLocal) {
        const cos = Math.cos(img.rotation);
        const sin = Math.sin(img.rotation);
        
        const scaledX = pLocal.x * img.scale;
        const scaledY = pLocal.y * img.scale;
        
        return {
            x: img.position.x + (cos * scaledX - sin * scaledY),
            y: img.position.y + (sin * scaledX + cos * scaledY)
        };
    }

    function worldToLocal(img, pWorld) {
        const dx = pWorld.x - img.position.x;
        const dy = pWorld.y - img.position.y;
        
        const cos = Math.cos(img.rotation);
        const sin = Math.sin(img.rotation);
        
        const rotatedX = dx * cos + dy * sin;
        const rotatedY = -dx * sin + dy * cos;
        
        return {
            x: rotatedX / img.scale,
            y: rotatedY / img.scale
        };
    }

    function distance(p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    // ============================================================================
    // CANVAS MANAGEMENT
    // ============================================================================

    function ensureCanvas() {
        const designerCanvas = document.getElementById('ss-designer-canvas');
        if (!designerCanvas) return null;
        let c = document.getElementById('ss-image-canvas');
        if (!c) {
            c = document.createElement('canvas');
            c.id = 'ss-image-canvas';
            c.width = BASE_CANVAS_WIDTH * state.canvasSteps;
            c.height = CANVAS_HEIGHT;
            c.style.position = 'absolute';
            c.style.left = '0px';
            c.style.top = '0px';
            c.style.pointerEvents = 'auto';
            c.style.zIndex = '100';
            c.style.cursor = 'default';
            designerCanvas.appendChild(c);
            
            c.addEventListener('mousedown', onCanvasMouseDown);
            c.addEventListener('mousemove', onCanvasMouseMove);
        } else {
            // Update canvas width if canvasSteps changed
            const expectedWidth = BASE_CANVAS_WIDTH * state.canvasSteps;
            if (c.width !== expectedWidth) {
                c.width = expectedWidth;
            }
        }
        return c;
    }

    function setCanvasSteps(steps) {
        state.canvasSteps = Math.max(1, Math.round(steps || 1));
        const designerCanvas = document.getElementById('ss-designer-canvas');
        if (designerCanvas) {
            designerCanvas.style.width = (BASE_CANVAS_WIDTH * state.canvasSteps) + 'px';
            designerCanvas.style.height = CANVAS_HEIGHT + 'px';
            designerCanvas.style.overflow = 'visible';
        }
        const c = ensureCanvas();
        if (c) {
            c.width = BASE_CANVAS_WIDTH * state.canvasSteps;
            c.height = CANVAS_HEIGHT;
        }
        // Redraw after canvas size changes
        draw();
        computeHandles();
    }

    function getSelectedImage() {
        return state.images.find(img => img.id === state.selectedImageId);
    }
    
    function notifySelectionChange() {
        if (window.updateImageToolButtons) {
            window.updateImageToolButtons();
        }
        if (window.updateLayerOrderButtons) {
            window.updateLayerOrderButtons();
        }
    }

    // ============================================================================
    // RENDERING
    // ============================================================================

    function draw() {
        let c = ensureCanvas();
        if (!c) {
            setCanvasSteps(state.canvasSteps || 1);
            c = ensureCanvas();
            if (!c) return;
        }
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, c.width, c.height);

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, BASE_CANVAS_WIDTH * state.canvasSteps, CANVAS_HEIGHT);
        ctx.clip();

        // Draw all images
        state.images.forEach(img => {
            if (!img.bitmap) return;
            if (img.visible === false) return;

            ctx.save();

            // Calculate the four corners of visibleRect in world coordinates
            const corners = {
                tl: localToWorld(img, { x: img.visibleRect.x, y: img.visibleRect.y }),
                tr: localToWorld(img, { x: img.visibleRect.x + img.visibleRect.width, y: img.visibleRect.y }),
                bl: localToWorld(img, { x: img.visibleRect.x, y: img.visibleRect.y + img.visibleRect.height }),
                br: localToWorld(img, { x: img.visibleRect.x + img.visibleRect.width, y: img.visibleRect.y + img.visibleRect.height })
            };

            // Create clip path for the actual image
            ctx.beginPath();
            ctx.moveTo(corners.tl.x, corners.tl.y);
            ctx.lineTo(corners.tr.x, corners.tr.y);
            ctx.lineTo(corners.br.x, corners.br.y);
            ctx.lineTo(corners.bl.x, corners.bl.y);
            ctx.closePath();
            ctx.clip();

            // Transform and draw image
            ctx.translate(img.position.x, img.position.y);
            ctx.rotate(img.rotation);
            ctx.scale(img.scale, img.scale);
            
            // Apply shadow and grayscale effects
            if (img.shadow) {
                ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                ctx.shadowBlur = 20;
                ctx.shadowOffsetX = 0;
                ctx.shadowOffsetY = 8;
            }
            
            if (img.grayscale) {
                ctx.filter = 'grayscale(100%)';
            }
            
            // Handle flips by translating and scaling appropriately
            if (img.flipX || img.flipY) {
                ctx.save();
                if (img.flipX) {
                    ctx.translate(img.originalWidth, 0);
                    ctx.scale(-1, 1);
                }
                if (img.flipY) {
                    ctx.translate(0, img.originalHeight);
                    ctx.scale(1, -1);
                }
                ctx.drawImage(img.bitmap, 0, 0, img.originalWidth, img.originalHeight);
                ctx.restore();
            } else {
                ctx.drawImage(img.bitmap, 0, 0, img.originalWidth, img.originalHeight);
            }
            
            // Reset effects
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.filter = 'none';

            // Locked selected images get a red border on the inside of the image
            if (img.locked && state.selectedImageId === img.id) {
                ctx.strokeStyle = '#e74c3c';
                ctx.lineWidth = 6 / img.scale;
                ctx.strokeRect(img.visibleRect.x, img.visibleRect.y, img.visibleRect.width, img.visibleRect.height);
            }

            ctx.restore();
        });

        ctx.restore();
    }

    function computeHandles() {
        const img = getSelectedImage();
        if (!img || img.locked) {
            state.handles = [];
            renderHandles();
            return;
        }

        const r = img.visibleRect;
        
        // Corner handles for scaling
        state.handles = [
            { id: 'scale-tl', type: 'corner', localX: r.x, localY: r.y },
            { id: 'scale-tr', type: 'corner', localX: r.x + r.width, localY: r.y },
            { id: 'scale-bl', type: 'corner', localX: r.x, localY: r.y + r.height },
            { id: 'scale-br', type: 'corner', localX: r.x + r.width, localY: r.y + r.height },
            
            // Edge handles for cropping
            { id: 'crop-top', type: 'crop', localX: r.x + r.width / 2, localY: r.y },
            { id: 'crop-bottom', type: 'crop', localX: r.x + r.width / 2, localY: r.y + r.height },
            { id: 'crop-left', type: 'crop', localX: r.x, localY: r.y + r.height / 2 },
            { id: 'crop-right', type: 'crop', localX: r.x + r.width, localY: r.y + r.height / 2 },
            
            // Rotation handle
            { id: 'rotate', type: 'rotate', localX: r.x + r.width / 2, localY: r.y - 40 / img.scale }
        ];

        renderHandles();
    }

    function renderHandles() {
        let hc = document.getElementById('ss-image-handles');
        const designerCanvas = document.getElementById('ss-designer-canvas');
        if (!designerCanvas) return;
        
        if (!hc) {
            hc = document.createElement('div');
            hc.id = 'ss-image-handles';
            hc.style.position = 'absolute';
            hc.style.left = '0px';
            hc.style.top = '0px';
            hc.style.width = '100%';
            hc.style.height = '100%';
            hc.style.pointerEvents = 'none';
            hc.style.zIndex = '101';
            designerCanvas.appendChild(hc);
        }
        hc.innerHTML = '';

        const img = getSelectedImage();
        if (!img) return;

        state.handles.forEach(h => {
            const worldPos = localToWorld(img, { x: h.localX, y: h.localY });
            const el = document.createElement('div');
            el.className = 'ss-handle';
            el.style.position = 'absolute';
            el.style.pointerEvents = 'auto';
            el.dataset.handleId = h.id;

            if (h.type === 'corner') {
                // Blue corner handles for scaling
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
                // Orange edge handles for cropping
                const isHorizontal = h.id.includes('top') || h.id.includes('bottom');
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
                // Rotate handle with the image
                el.style.transform = `rotate(${img.rotation}rad)`;
                el.style.cursor = getCropCursor(h.id, img.rotation);
            } else if (h.type === 'rotate') {
                // Green rotation handle
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
            hc.appendChild(el);
        });

        // Draw outline around visible rect
        const corners = {
            tl: localToWorld(img, { x: img.visibleRect.x, y: img.visibleRect.y }),
            tr: localToWorld(img, { x: img.visibleRect.x + img.visibleRect.width, y: img.visibleRect.y }),
            bl: localToWorld(img, { x: img.visibleRect.x, y: img.visibleRect.y + img.visibleRect.height }),
            br: localToWorld(img, { x: img.visibleRect.x + img.visibleRect.width, y: img.visibleRect.y + img.visibleRect.height })
        };

        // Create SVG for outline
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.style.position = 'absolute';
        svg.style.left = '0';
        svg.style.top = '0';
        svg.style.width = '100%';
        svg.style.height = '100%';
        svg.style.pointerEvents = 'none';

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', `M ${corners.tl.x} ${corners.tl.y} L ${corners.tr.x} ${corners.tr.y} L ${corners.br.x} ${corners.br.y} L ${corners.bl.x} ${corners.bl.y} Z`);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#1976d2');
        path.setAttribute('stroke-width', '2');
        svg.appendChild(path);
        hc.appendChild(svg);
    }

    function getCornerCursor(id) {
        if (id === 'scale-tl' || id === 'scale-br') return 'nwse-resize';
        if (id === 'scale-tr' || id === 'scale-bl') return 'nesw-resize';
        return 'default';
    }

    function getCropCursor(id, rotation) {
        // Determine base direction
        const isHorizontal = id.includes('top') || id.includes('bottom');
        
        // Convert rotation to degrees and normalize
        const deg = (rotation * 180 / Math.PI) % 360;
        const normalizedDeg = ((deg % 360) + 360) % 360;
        
        // Determine cursor based on rotation
        if (isHorizontal) {
            // Top/bottom edges
            if (normalizedDeg >= 45 && normalizedDeg < 135) return 'ew-resize';
            if (normalizedDeg >= 135 && normalizedDeg < 225) return 'ns-resize';
            if (normalizedDeg >= 225 && normalizedDeg < 315) return 'ew-resize';
            return 'ns-resize';
        } else {
            // Left/right edges
            if (normalizedDeg >= 45 && normalizedDeg < 135) return 'ns-resize';
            if (normalizedDeg >= 135 && normalizedDeg < 225) return 'ew-resize';
            if (normalizedDeg >= 225 && normalizedDeg < 315) return 'ns-resize';
            return 'ew-resize';
        }
    }

    // ============================================================================
    // INTERACTION HANDLERS
    // ============================================================================

    function onHandleMouseDown(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const img = getSelectedImage();
        if (!img || img.locked) return;

        const canvas = ensureCanvas();
        if (!canvas) return;
        
        const rect = canvas.getBoundingClientRect();
        const designerCanvas = document.getElementById('ss-designer-canvas');
        // Account for CSS zoom scale applied to designer canvas
        let canvasScale = 1;
        if (designerCanvas && designerCanvas.style.transform && designerCanvas.style.transform.includes('scale(')) {
            const m = designerCanvas.style.transform.match(/scale\(([^)]+)\)/);
            if (m) {
                const parsed = parseFloat(m[1]);
                if (!isNaN(parsed) && parsed > 0) canvasScale = parsed;
            }
        }

        interaction.active = true;
        interaction.mode = e.target.dataset.handleId;
        interaction.startMouse = { 
            x: (e.clientX - rect.left) / canvasScale, 
            y: (e.clientY - rect.top) / canvasScale 
        };
        
        // Save initial state
        interaction.startImage = {
            position: { ...img.position },
            scale: img.scale,
            rotation: img.rotation
        };
        interaction.startVisibleRect = { ...img.visibleRect };
        interaction.initialScale = img.scale;
        interaction.initialRotation = img.rotation;
        
        // Setup for scale operations
        if (interaction.mode.startsWith('scale-')) {
            const corner = interaction.mode.split('-')[1];
            
            let activeX, activeY, anchorX, anchorY;
            
            if (corner === 'tl') {
                activeX = img.visibleRect.x;
                activeY = img.visibleRect.y;
                anchorX = img.visibleRect.x + img.visibleRect.width;
                anchorY = img.visibleRect.y + img.visibleRect.height;
            } else if (corner === 'tr') {
                activeX = img.visibleRect.x + img.visibleRect.width;
                activeY = img.visibleRect.y;
                anchorX = img.visibleRect.x;
                anchorY = img.visibleRect.y + img.visibleRect.height;
            } else if (corner === 'bl') {
                activeX = img.visibleRect.x;
                activeY = img.visibleRect.y + img.visibleRect.height;
                anchorX = img.visibleRect.x + img.visibleRect.width;
                anchorY = img.visibleRect.y;
            } else { // 'br'
                activeX = img.visibleRect.x + img.visibleRect.width;
                activeY = img.visibleRect.y + img.visibleRect.height;
                anchorX = img.visibleRect.x;
                anchorY = img.visibleRect.y;
            }
            
            interaction.initialActiveLocal = { x: activeX, y: activeY };
            interaction.anchorLocal = { x: anchorX, y: anchorY };
            interaction.anchorWorld = localToWorld(img, interaction.anchorLocal);
        }
        
        // Setup for rotation
        if (interaction.mode === 'rotate') {
            const centerLocal = {
                x: img.visibleRect.x + img.visibleRect.width / 2,
                y: img.visibleRect.y + img.visibleRect.height / 2
            };
            interaction.rotationCenterWorld = localToWorld(img, centerLocal);
        }
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }

    function onMouseMove(e) {
        if (!interaction.active) return;
        
        const canvas = ensureCanvas();
        if (!canvas) return;
        
        const rect = canvas.getBoundingClientRect();
        const designerCanvas = document.getElementById('ss-designer-canvas');
        // Account for CSS zoom scale applied to designer canvas
        let canvasScale = 1;
        if (designerCanvas && designerCanvas.style.transform && designerCanvas.style.transform.includes('scale(')) {
            const m = designerCanvas.style.transform.match(/scale\(([^)]+)\)/);
            if (m) {
                const parsed = parseFloat(m[1]);
                if (!isNaN(parsed) && parsed > 0) canvasScale = parsed;
            }
        }
        
        const mouseWorld = { 
            x: (e.clientX - rect.left) / canvasScale, 
            y: (e.clientY - rect.top) / canvasScale 
        };
        const img = getSelectedImage();
        if (!img) return;
        
        if (interaction.mode === 'drag') {
            handleDrag(img, mouseWorld);
        } else if (interaction.mode.startsWith('crop-')) {
            handleCrop(img, mouseWorld);
        } else if (interaction.mode.startsWith('scale-')) {
            handleScale(img, mouseWorld);
        } else if (interaction.mode === 'rotate') {
            handleRotate(img, mouseWorld);
        }
        
        draw();
        computeHandles();
    }

    function onMouseUp(e) {
        interaction.active = false;
        interaction.mode = null;
        
        const canvas = ensureCanvas();
        if (canvas) canvas.style.cursor = 'default';
        
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }

    // ============================================================================
    // DRAG LOGIC
    // ============================================================================

    function handleDrag(img, mouseWorld) {
        const dx = mouseWorld.x - interaction.startMouse.x;
        const dy = mouseWorld.y - interaction.startMouse.y;
        
        img.position.x = interaction.startImage.position.x + dx;
        img.position.y = interaction.startImage.position.y + dy;
    }

    // ============================================================================
    // CROP LOGIC
    // ============================================================================

    function handleCrop(img, mouseWorld) {
        const pLocal = worldToLocal(img, mouseWorld);
        
        if (interaction.mode === 'crop-left') {
            // Store the right edge position
            const rightEdge = img.visibleRect.x + img.visibleRect.width;
            // Update left edge, ensuring minimum width
            const newX = Math.max(0, Math.min(pLocal.x, rightEdge - MIN_SIZE));
            img.visibleRect.x = newX;
            img.visibleRect.width = rightEdge - newX;
        } else if (interaction.mode === 'crop-right') {
            const newRight = Math.max(pLocal.x, img.visibleRect.x + MIN_SIZE);
            img.visibleRect.width = newRight - img.visibleRect.x;
        } else if (interaction.mode === 'crop-top') {
            // Store the bottom edge position
            const bottomEdge = img.visibleRect.y + img.visibleRect.height;
            // Update top edge, ensuring minimum height
            const newY = Math.max(0, Math.min(pLocal.y, bottomEdge - MIN_SIZE));
            img.visibleRect.y = newY;
            img.visibleRect.height = bottomEdge - newY;
        } else if (interaction.mode === 'crop-bottom') {
            const newBottom = Math.max(pLocal.y, img.visibleRect.y + MIN_SIZE);
            img.visibleRect.height = newBottom - img.visibleRect.y;
        }
        
        // Clamp to image bounds
        img.visibleRect.x = Math.max(0, Math.min(img.visibleRect.x, img.originalWidth - MIN_SIZE));
        img.visibleRect.y = Math.max(0, Math.min(img.visibleRect.y, img.originalHeight - MIN_SIZE));
        img.visibleRect.width = Math.max(MIN_SIZE, Math.min(img.visibleRect.width, img.originalWidth - img.visibleRect.x));
        img.visibleRect.height = Math.max(MIN_SIZE, Math.min(img.visibleRect.height, img.originalHeight - img.visibleRect.y));
    }

    // ============================================================================
    // SCALE LOGIC
    // ============================================================================

    function handleScale(img, mouseWorld) {
        const pLocalMouse = worldToLocal(img, mouseWorld);
        
        const d0 = distance(interaction.initialActiveLocal, interaction.anchorLocal);
        const d1 = distance(pLocalMouse, interaction.anchorLocal);
        
        if (d0 === 0) return;
        
        // Calculate target scale with ratio clamping to prevent extreme jumps
        let scaleRatio = d1 / d0;
        // Clamp scale ratio to reasonable range per frame to avoid jittering
        scaleRatio = Math.max(0.01, Math.min(scaleRatio, 100));
        
        const targetScale = interaction.initialScale * scaleRatio;
        
        // Prevent scale from going too small or too large
        const clampedScale = Math.max(0.05, Math.min(targetScale, 50));
        
        // Apply smoothing factor for smoother scaling (interpolation)
        const smoothingFactor = 0.15;
        img.scale = img.scale + (clampedScale - img.scale) * smoothingFactor;
        
        // Adjust position so anchor stays in same world position
        const newAnchorWorld = localToWorld(img, interaction.anchorLocal);
        const delta = {
            x: interaction.anchorWorld.x - newAnchorWorld.x,
            y: interaction.anchorWorld.y - newAnchorWorld.y
        };
        
        img.position.x += delta.x;
        img.position.y += delta.y;
    }

    // ============================================================================
    // ROTATION LOGIC
    // ============================================================================

    function handleRotate(img, mouseWorld) {
        const centerLocal = {
            x: img.visibleRect.x + img.visibleRect.width / 2,
            y: img.visibleRect.y + img.visibleRect.height / 2
        };
        
        const centerWorld = interaction.rotationCenterWorld;
        
        // Calculate angle from center to mouse
        const dx = mouseWorld.x - centerWorld.x;
        const dy = mouseWorld.y - centerWorld.y;
        const angle = Math.atan2(dy, dx);
        
        // Calculate initial angle
        const initialDx = interaction.startMouse.x - centerWorld.x;
        const initialDy = interaction.startMouse.y - centerWorld.y;
        const initialAngle = Math.atan2(initialDy, initialDx);
        
        // Update rotation
        const deltaAngle = angle - initialAngle;
        let newRotation = interaction.initialRotation + deltaAngle;
        
        // Snap to 0, 90, 180, 270 degrees if close (within 5 degrees)
        const snapThreshold = 5 * Math.PI / 180; // 5 degrees in radians
        const snapAngles = [0, Math.PI / 2, Math.PI, 3 * Math.PI / 2]; // 0, 90, 180, 270 degrees
        
        // Normalize angle to 0-2π range
        const normalizedRotation = ((newRotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        
        // Check if close to any snap angle
        for (let snapAngle of snapAngles) {
            if (Math.abs(normalizedRotation - snapAngle) < snapThreshold) {
                newRotation = interaction.initialRotation + (snapAngle - ((interaction.initialRotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
                break;
            }
            // Also check wrap-around at 2π
            if (Math.abs(normalizedRotation - (snapAngle + 2 * Math.PI)) < snapThreshold) {
                newRotation = interaction.initialRotation + (snapAngle - ((interaction.initialRotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
                break;
            }
        }
        
        img.rotation = newRotation;
        
        // Adjust position so center stays in same world position
        const newCenterWorld = localToWorld(img, centerLocal);
        const delta = {
            x: centerWorld.x - newCenterWorld.x,
            y: centerWorld.y - newCenterWorld.y
        };
        
        img.position.x += delta.x;
        img.position.y += delta.y;
    }

    // ============================================================================
    // CANVAS MOUSE HANDLERS (for selecting and dragging images)
    // ============================================================================

    function onCanvasMouseDown(e) {
        const canvas = ensureCanvas();
        if (!canvas) return;
        
        const rect = canvas.getBoundingClientRect();
        const designerCanvas = document.getElementById('ss-designer-canvas');
        // Account for CSS zoom scale applied to designer canvas
        let canvasScale = 1;
        if (designerCanvas && designerCanvas.style.transform && designerCanvas.style.transform.includes('scale(')) {
            const m = designerCanvas.style.transform.match(/scale\(([^)]+)\)/);
            if (m) {
                const parsed = parseFloat(m[1]);
                if (!isNaN(parsed) && parsed > 0) canvasScale = parsed;
            }
        }
        
        const mouseWorld = { 
            x: (e.clientX - rect.left) / canvasScale, 
            y: (e.clientY - rect.top) / canvasScale 
        };
        
        // Check if clicking on an image
        let clickedOnImage = false;
        for (let i = state.images.length - 1; i >= 0; i--) {
            const img = state.images[i];
            const pLocal = worldToLocal(img, mouseWorld);
            
            // Check if point is inside visibleRect
            if (pLocal.x >= img.visibleRect.x && 
                pLocal.x <= img.visibleRect.x + img.visibleRect.width &&
                pLocal.y >= img.visibleRect.y && 
                pLocal.y <= img.visibleRect.y + img.visibleRect.height) {
                
                state.selectedImageId = img.id;
                computeHandles();
                draw();
                notifySelectionChange();
                
                // Don't allow dragging if image is locked
                if (!img.locked) {
                    // Start drag mode
                    interaction.active = true;
                    interaction.mode = 'drag';
                    interaction.startMouse = { x: mouseWorld.x, y: mouseWorld.y };
                    interaction.startImage = {
                        position: { ...img.position },
                        scale: img.scale,
                        rotation: img.rotation
                    };
                    
                    document.addEventListener('mousemove', onMouseMove);
                    document.addEventListener('mouseup', onMouseUp);
                    canvas.style.cursor = 'move';
                }
                
                clickedOnImage = true;
                break;
            }
        }
        
        // If clicked outside all images, deselect
        if (!clickedOnImage) {
            state.selectedImageId = null;
            computeHandles();
            draw();
            notifySelectionChange();
        }
    }

    function onCanvasMouseMove(e) {
        // Handle cursor changes, etc.
    }

    // ============================================================================
    // IMAGE LOADING
    // ============================================================================

    function loadImageFromFile(file) {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            // Calculate center position of the latest (rightmost) slide
            const numSlides = state.canvasSteps;
            const lastSlideLeft = (numSlides - 1) * BASE_CANVAS_WIDTH;
            const centerX = lastSlideLeft + BASE_CANVAS_WIDTH / 2;
            const centerY = CANVAS_HEIGHT / 2;
            
            // Position image so its center is at the slide center
            const x = centerX - (img.width / 2);
            const y = centerY - (img.height / 2);
            
            const newImage = {
                id: state.nextImageId++,
                position: { x: x, y: y },
                scale: 1.0,
                rotation: 0,
                originalWidth: img.width,
                originalHeight: img.height,
                bitmap: img,
                visibleRect: { x: 0, y: 0, width: img.width, height: img.height },
                domId: null
            };
            
            state.images.push(newImage);
            state.selectedImageId = newImage.id;
            draw();
            computeHandles();
            notifySelectionChange();
        };
        img.src = url;
    }

    // ============================================================================
    // ADAPTER FOR OLD SSImage API COMPATIBILITY
    // ============================================================================

    function createImageFromLayer(element, layer) {
        const existing = state.images.find(i => i.domId === element.id);
        if (existing) return existing;
        
        const imgEl = element.querySelector('img');
        const src = (layer && layer.imageData) || (imgEl && imgEl.src);
        if (!src) return null;
        
        const img = new Image();
        img.onload = function() {
            const posLeft = parseInt(element.style.left, 10) || (layer && layer.position && layer.position.left) || 0;
            const posTop = parseInt(element.style.top, 10) || (layer && layer.position && layer.position.top) || 0;
            const cw = parseInt(element.style.width) || (layer && layer.size && layer.size.width) || img.width;
            const ch = parseInt(element.style.height) || (layer && layer.size && layer.size.height) || img.height;
            
            // Compute uniform scale to fit the container
            const scaleX = cw / img.width;
            const scaleY = ch / img.height;
            const scale = Math.min(scaleX, scaleY);
            
            const newImage = {
                id: state.nextImageId++,
                domId: element.id,
                position: { x: posLeft, y: posTop },
                scale: scale || 1,
                rotation: layer && (typeof layer.rotation === 'number') ? (layer.rotation * Math.PI / 180) : 0,
                originalWidth: img.width,
                originalHeight: img.height,
                bitmap: img,
                visibleRect: { x: 0, y: 0, width: img.width, height: img.height }
            };
            
            state.images.push(newImage);
            state.selectedImageId = newImage.id;
            draw();
            computeHandles();
            notifySelectionChange();
        };
        img.onerror = function() {
            console.warn('SSImage adapter failed to load image:', src);
        };
        img.src = src;
        return img;
    }

    function findImageByDomId(domId) {
        return state.images.find(i => i.domId === domId) || null;
    }

    // ============================================================================
    // GLOBAL API EXPORTS
    // ============================================================================

    window.ImageTransform = window.ImageTransform || {};
    
    window.ImageTransform.getState = function() {
        return {
            images: state.images.map(img => ({
                id: img.id,
                position: { ...img.position },
                scale: img.scale,
                rotation: img.rotation,
                originalWidth: img.originalWidth,
                originalHeight: img.originalHeight,
                visibleRect: { ...img.visibleRect }
            })),
            selectedImageId: state.selectedImageId
        };
    };

    window.ImageTransform.importFromElement = function(element, layer) { 
        return createImageFromLayer(element, layer); 
    };

    window.SSImage = window.SSImage || {};
    
    window.SSImage.setupImageResizeHandlers = function(element) {
        if (!element) return;
        
        const layer = window.layerState && window.layerState.layers ? 
            window.layerState.layers.find(l => l.element === element) : null;
        const existing = findImageByDomId(element.id);
        
        if (!existing) createImageFromLayer(element, layer);
        
        try {
            const imgEl = element.querySelector('img');
            if (imgEl) imgEl.style.visibility = 'hidden';
        } catch (e) {}
        
        element.addEventListener('click', (ev) => {
            const imgEntry = findImageByDomId(element.id);
            if (imgEntry) {
                state.selectedImageId = imgEntry.id;
                computeHandles();
                draw();
                notifySelectionChange();
            }
        }, false);

        try {
            const mo = new MutationObserver(muts => {
                const imgEntry = findImageByDomId(element.id);
                if (!imgEntry) return;
                
                const posLeft = parseInt(element.style.left, 10) || imgEntry.position.x;
                const posTop = parseInt(element.style.top, 10) || imgEntry.position.y;
                const cw = parseInt(element.style.width, 10) || (imgEntry.originalWidth * imgEntry.scale);
                const ch = parseInt(element.style.height, 10) || (imgEntry.originalHeight * imgEntry.scale);
                
                imgEntry.position.x = posLeft;
                imgEntry.position.y = posTop;
                imgEntry.scale = (imgEntry.originalWidth > 0) ? (cw / imgEntry.originalWidth) : imgEntry.scale;
                
                computeHandles();
                draw();
            });
            mo.observe(element, { attributes: true, attributeFilter: ['style','class'] });
        } catch (e) {}
        
        return true;
    };

    window.SSImage.applyImageEffectsToElement = function(element, layer) {
        if (!element) return;
        const entry = findImageByDomId(element.id);
        if (!entry) {
            createImageFromLayer(element, layer);
            return;
        }
        
        if (layer && layer.cropData) {
            const cd = layer.cropData;
            entry.visibleRect = {
                x: cd.clipLeft || 0,
                y: cd.clipTop || 0,
                width: entry.originalWidth - (cd.clipLeft || 0) - (cd.clipRight || 0),
                height: entry.originalHeight - (cd.clipTop || 0) - (cd.clipBottom || 0)
            };
            draw();
            computeHandles();
        }
    };

    window.SSImage.getImageForElement = function(element) {
        return findImageByDomId(element.id);
    };

    window.SSImage.updateLayerVisibleRect = function(layer, visibleLeft, visibleTop, visibleWidth, visibleHeight, imgOffset) {
        const entry = state.images.find(i => i.id === (layer && layer.id));
        if (!entry) return;
        
        if (typeof visibleLeft === 'number') entry.visibleRect.x = visibleLeft;
        if (typeof visibleTop === 'number') entry.visibleRect.y = visibleTop;
        if (typeof visibleWidth === 'number') entry.visibleRect.width = visibleWidth;
        if (typeof visibleHeight === 'number') entry.visibleRect.height = visibleHeight;
        
        draw();
        computeHandles();
    };

    window.SSImage.resetCrop = function(element) {
        const entry = findImageByDomId(element.id);
        if (!entry) return;
        
        entry.visibleRect = {
            x: 0,
            y: 0,
            width: entry.originalWidth,
            height: entry.originalHeight
        };
        
        draw();
        computeHandles();
    };

    window.SSImage.updateHandlePositions = function(container, cropData) {
        if (!container) return;
        const entry = findImageByDomId(container.id);
        if (!entry) return;
        
        if (cropData) {
            entry.visibleRect = {
                x: cropData.clipLeft || 0,
                y: cropData.clipTop || 0,
                width: entry.originalWidth - (cropData.clipLeft || 0) - (cropData.clipRight || 0),
                height: entry.originalHeight - (cropData.clipTop || 0) - (cropData.clipBottom || 0)
            };
        }
        
        draw();
        computeHandles();
    };

    // Global wrappers for backward compatibility
    window.setupImageResizeHandlers = function(el) { 
        try { return window.SSImage.setupImageResizeHandlers(el); } 
        catch(e) { return null; } 
    };
    
    window.applyImageEffectsToElement = function(el, layer) { 
        try { return window.SSImage.applyImageEffectsToElement(el, layer); } 
        catch(e) { return null; } 
    };
    
    window.updateLayerVisibleRect = function(layer, left, top, w, h, imgOffset) { 
        try { return window.SSImage.updateLayerVisibleRect(layer, left, top, w, h, imgOffset); } 
        catch(e) { return null; } 
    };
    
    window.resetCrop = function(el) { 
        try { return window.SSImage.resetCrop(el); } 
        catch(e) { return null; } 
    };
    
    window.updateHandlePositions = function(container, cropData) { 
        try { return window.SSImage.updateHandlePositions(container, cropData); } 
        catch(e) { return null; } 
    };

    window.importImageToCanvas = function(file) {
        try { loadImageFromFile(file); } 
        catch (e) { console.error('importImageToCanvas failed', e); }
    };

    // Image manipulation functions
    function flipHorizontal() {
        const img = getSelectedImage();
        if (!img) return;
        img.flipX = !img.flipX;
        draw();
    }

    function flipVertical() {
        const img = getSelectedImage();
        if (!img) return;
        img.flipY = !img.flipY;
        draw();
    }

    function duplicateImage() {
        const img = getSelectedImage();
        if (!img) return;
        const newImg = {
            id: state.nextImageId++,
            position: { x: img.position.x + 20, y: img.position.y + 20 },
            scale: img.scale,
            rotation: img.rotation,
            originalWidth: img.originalWidth,
            originalHeight: img.originalHeight,
            bitmap: img.bitmap,
            visibleRect: { ...img.visibleRect },
            flipX: img.flipX || false,
            flipY: img.flipY || false,
            locked: false,
            visible: true,
            shadow: img.shadow || false,
            grayscale: img.grayscale || false
        };
        state.images.push(newImg);
        state.selectedImageId = newImg.id;
        draw();
        computeHandles();
        notifySelectionChange();
    }

    function deleteImage() {
        const img = getSelectedImage();
        if (!img) return;
        const idx = state.images.findIndex(i => i.id === img.id);
        if (idx !== -1) {
            state.images.splice(idx, 1);
        }
        state.selectedImageId = null;
        draw();
        computeHandles();
        notifySelectionChange();
    }

    function toggleLock() {
        const img = getSelectedImage();
        if (!img) return false;
        img.locked = !img.locked;
        if (img.locked) {
            state.handles = [];
            renderHandles();
        } else {
            computeHandles();
        }
        notifySelectionChange();
        return img.locked;
    }

    function toggleShadow() {
        const img = getSelectedImage();
        if (!img) return;
        img.shadow = !img.shadow;
        draw();
    }

    function toggleGrayscale() {
        const img = getSelectedImage();
        if (!img) return;
        img.grayscale = !img.grayscale;
        draw();
    }

    function replaceImage(file) {
        const img = getSelectedImage();
        if (!img || !file) return;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const imgEl = new Image();
            imgEl.onload = function() {
                createImageBitmap(imgEl).then(bitmap => {
                    const oldAspect = img.originalWidth / img.originalHeight;
                    const newAspect = bitmap.width / bitmap.height;
                    
                    img.bitmap = bitmap;
                    img.originalWidth = bitmap.width;
                    img.originalHeight = bitmap.height;
                    
                    // Reset visible rect to full image
                    img.visibleRect = {
                        x: 0,
                        y: 0,
                        width: bitmap.width,
                        height: bitmap.height
                    };
                    
                    // Adjust scale to maintain similar visual size
                    if (Math.abs(newAspect - oldAspect) > 0.01) {
                        if (newAspect > oldAspect) {
                            // Wider image
                            img.scale = img.scale * (oldAspect / newAspect);
                        } else {
                            // Taller image
                            img.scale = img.scale * (newAspect / oldAspect);
                        }
                    }
                    
                    draw();
                    computeHandles();
                });
            };
            imgEl.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // Export SSImageTransform for integration with other modules
    window.SSImageTransform = {
        setCanvasSteps: setCanvasSteps,
        draw: draw,
        computeHandles: computeHandles,
        flipHorizontal: flipHorizontal,
        flipVertical: flipVertical,
        duplicateImage: duplicateImage,
        deleteImage: deleteImage,
        toggleLock: toggleLock,
        toggleShadow: toggleShadow,
        toggleGrayscale: toggleGrayscale,
        replaceImage: replaceImage,
        hasSelectedImage: function() { return !!getSelectedImage(); },
        getSelectedImage: getSelectedImage
    };

    // Initialize on DOM ready
    document.addEventListener('DOMContentLoaded', () => {
        setCanvasSteps(1);
        if (Array.isArray(window._pendingUploads) && window._pendingUploads.length) {
            const q = window._pendingUploads.slice();
            window._pendingUploads.length = 0;
            q.forEach(f => { 
                try { window.importImageToCanvas(f); } 
                catch (e) { console.error('Failed handling queued upload', e); } 
            });
        }
    });
})(window);
