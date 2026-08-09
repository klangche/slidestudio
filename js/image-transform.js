// Mathematically Correct Image Transform System
import { layerState, magnetState } from './state.js';
import { snapBox, snapReset } from './guidance.js';

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
        moved: false,
        lipClickPending: false,
        startMouse: { x: 0, y: 0 },
        startImage: null,
        startText: null,
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

    // World-space axis-aligned bounding box of an image's visible (cropped) stage.
    function getImageAABB(img) {
        if (!img || !img.visibleRect) return { left: 0, top: 0, width: 0, height: 0 };
        // A polaroid frame extends beyond the photo, so its bounds include the
        // white border and the writing lip.  The frame rect is expressed with
        // left/top keys (matching the canvas drawing code), so normalize it to
        // x/y before feeding the corner points below.
        const fr = img.polaroid ? getPolaroidRects(img).frame : img.visibleRect;
        const r = {
            x: fr.x !== undefined ? fr.x : fr.left,
            y: fr.y !== undefined ? fr.y : fr.top,
            width: fr.width,
            height: fr.height
        };
        const pts = [
            localToWorld(img, { x: r.x, y: r.y }),
            localToWorld(img, { x: r.x + r.width, y: r.y }),
            localToWorld(img, { x: r.x, y: r.y + r.height }),
            localToWorld(img, { x: r.x + r.width, y: r.y + r.height })
        ];
        const left = Math.min(pts[0].x, pts[1].x, pts[2].x, pts[3].x);
        const top = Math.min(pts[0].y, pts[1].y, pts[2].y, pts[3].y);
        const right = Math.max(pts[0].x, pts[1].x, pts[2].x, pts[3].x);
        const bottom = Math.max(pts[0].y, pts[1].y, pts[2].y, pts[3].y);
        return { left: left, top: top, width: right - left, height: bottom - top };
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
        if (typeof window.refreshBackgroundPalette === 'function') {
            window.refreshBackgroundPalette();
        }
    }

    // ============================================================================
    // POLAROID FRAME
    // ============================================================================

    // Frame proportions are fractions of the photo (the visible crop) size:
    // sidePad/topPad are the white border around the photo, lipH is the bottom
    // writing strip that is always present on a real polaroid.
    const POLAROID_TYPES = {
        wide:     { sidePad: 0.05, topPad: 0.05, lipH: 0.16 },  // Fuji Instax Wide
        portrait: { sidePad: 0.065, topPad: 0.06, lipH: 0.28 }, // Polaroid 600
        square:   { sidePad: 0.07, topPad: 0.07, lipH: 0.17 }   // Instax Square
    };

    // Photo transform helpers for framed photos.
    //
    // A framed photo has its own free transform inside the fixed frame window:
    //   photoX/photoY  -> translation (frame-local px)
    //   photoScale     -> uniform scale
    //   photoRot       -> rotation (radians)
    // photoSourceToFrame maps a source (bitmap/crop) point to frame-local
    // coordinates; photoFrameToSource is its inverse.
    function photoSourceToFrame(im, p) {
        const pol = im.polaroid || im;
        const ps = pol.photoScale || 1;
        const pr = pol.photoRot || 0;
        const cos = Math.cos(pr), sin = Math.sin(pr);
        return {
            x: (pol.photoX || 0) + (cos * p.x - sin * p.y) * ps,
            y: (pol.photoY || 0) + (sin * p.x + cos * p.y) * ps
        };
    }

    function photoFrameToSource(im, q) {
        const pol = im.polaroid || im;
        const ps = pol.photoScale || 1;
        const pr = pol.photoRot || 0;
        const cos = Math.cos(pr), sin = Math.sin(pr);
        const dx = q.x - (pol.photoX || 0);
        const dy = q.y - (pol.photoY || 0);
        return { x: (dx * cos + dy * sin) / ps, y: (-dx * sin + dy * cos) / ps };
    }

    // Inverse of photoSourceToFrame using a frozen snapshot of the photo
    // transform, so interactions track the mouse without a feedback loop.
    function inversePhotoTransform(sp, q) {
        const cos = Math.cos(sp.photoRot), sin = Math.sin(sp.photoRot);
        const dx = q.x - sp.photoX, dy = q.y - sp.photoY;
        return { x: (dx * cos + dy * sin) / sp.photoScale, y: (-dx * sin + dy * cos) / sp.photoScale };
    }

    function photoSnapshot(img) {
        return {
            photoX: img.polaroid.photoX || 0,
            photoY: img.polaroid.photoY || 0,
            photoScale: img.polaroid.photoScale || 1,
            photoRot: img.polaroid.photoRot || 0
        };
    }

    function getPolaroidConfig(img) {
        const cfg = (img && img.polaroid && POLAROID_TYPES[img.polaroid.type]) || POLAROID_TYPES.square;
        // The frame geometry is frozen when the frame is created, so photo
        // edits (move/scale/rotate/crop) never resize the frame.
        const vr = (img && img.polaroid && img.polaroid.baseWindow) || img.visibleRect;
        return {
            cfg: cfg,
            padX: vr.width * cfg.sidePad,
            padY: vr.height * cfg.topPad,
            lipH: vr.height * cfg.lipH
        };
    }

    // Outer frame rect and writing-lip rect, in frame-local coordinates.
    function getPolaroidRects(img) {
        const vr = (img && img.polaroid && img.polaroid.baseWindow) || img.visibleRect;
        const { padX, padY, lipH } = getPolaroidConfig(img);
        return {
            frame: {
                left: vr.x - padX,
                top: vr.y - padY,
                width: vr.width + padX * 2,
                height: vr.height + padY + lipH
            },
            lip: {
                left: vr.x - padX,
                top: vr.y + vr.height,
                width: vr.width + padX * 2,
                height: lipH
            }
        };
    }

    // ============================================================================
    // POLAROID LIP TEXT (movable object inside the frame)
    // ============================================================================
    // The writing-lip text is stored as polaroid.textPayload (produced by the
    // existing text editor) plus a frame-local position polaroid.textX/textY.
    // It can be dragged anywhere but is clamped so it never leaves the frame.

    function polaroidTextLines(img) {
        const pol = img.polaroid;
        const payload = pol.textPayload;
        const raw = (payload && payload.lines && payload.lines.length)
            ? payload.lines
            : (pol.text || '').split('\n').map(function (t) { return { text: t }; });
        return raw.map(function (l) {
            return (l && l.text !== undefined && l.text !== null) ? String(l.text) : '';
        });
    }

    function parseFontNameSafe(family) {
        if (!family) return null;
        const first = String(family).split(',')[0].trim().replace(/['"]/g, '');
        return first || null;
    }

    function polaroidTextBase(img) {
        const pol = img.polaroid;
        const b = (pol.textPayload && pol.textPayload.base) || {};
        if (!pol.textPayload) {
            // Legacy handwriting style from before the editor integration.
            return {
                family: '"Segoe Script", "Brush Script MT", cursive',
                size: 12,
                color: 'rgba(25, 25, 65, 0.9)',
                weight: 'normal',
                style: 'normal',
                decoration: 'none',
                transform: 'none',
                spacing: 0,
                lineHeight: 16
            };
        }
        const fs = parseFloat(b.fontSize) || 48;
        return {
            family: pol.textPayload.font || parseFontNameSafe(b.fontFamily) || 'Trebuchet MS',
            size: fs,
            color: b.color || '#121212',
            weight: (b.fontWeight === 'bold' || parseFloat(b.fontWeight) >= 600) ? 'bold' : 'normal',
            style: b.fontStyle === 'italic' ? 'italic' : 'normal',
            decoration: b.textDecoration || 'none',
            transform: b.textTransform === 'uppercase' ? 'uppercase' : 'none',
            spacing: parseFloat(b.letterSpacing) || 0,
            // The editor stores lineHeight as a ratio of the font size.
            lineHeight: (parseFloat(b.lineHeight) || 1.2) * fs
        };
    }

    // Measure the text block and fit it inside the frame. Returns the fitted
    // box (frame-local) plus per-line font sizes. Sets the default position
    // (centred on the lip) the first time the text is measured.
    function getPolaroidTextMetrics(img) {
        const pol = img.polaroid;
        const lines = polaroidTextLines(img);
        const base = polaroidTextBase(img);
        const { frame, lip } = getPolaroidRects(img);
        const ctx = ensureCanvas().getContext('2d');

        const caps = base.transform === 'uppercase';
        const font = function (size) {
            return base.style + ' ' + base.weight + ' ' + size + 'px ' + base.family;
        };
        const sizes = lines.map(function () { return base.size; });
        const spacings = lines.map(function () { return base.spacing; });

        let contentW = 1;
        lines.forEach(function (l, i) {
            ctx.font = font(sizes[i]);
            const t = caps ? l.toUpperCase() : l;
            let w = ctx.measureText(t).width;
            if (spacings[i] && t.length > 1) w += (t.length - 1) * spacings[i];
            if (w > contentW) contentW = w;
        });
        const contentH = lines.reduce(function (acc) { return acc + base.lineHeight; }, 0);

        const pad = 4;
        const maxW = Math.max(20, frame.width - pad * 2);
        const maxH = Math.max(12, frame.height - pad * 2);
        const fit = Math.min(1, maxW / contentW, maxH / contentH);

        if (pol.textX == null || pol.textY == null) {
            pol.textX = frame.left + (frame.width - contentW * fit) / 2;
            pol.textY = lip.top + (lip.height - contentH * fit) / 2;
        }

        return {
            lines: lines,
            sizes: sizes,
            spacings: spacings,
            family: base.family,
            color: base.color,
            weight: base.weight,
            style: base.style,
            transform: base.transform,
            decoration: base.decoration,
            lineHeight: base.lineHeight,
            contentW: contentW,
            contentH: contentH,
            fit: fit,
            x: pol.textX,
            y: pol.textY,
            width: contentW * fit,
            height: contentH * fit
        };
    }

    function drawPolaroidText(ctx, img) {
        const pol = img.polaroid;
        if (!pol || !(pol.text || (pol.textPayload && pol.textPayload.text))) return;
        const m = getPolaroidTextMetrics(img);
        if (!m.lines.length) return;
        const { frame } = getPolaroidRects(img);

        ctx.save();
        // The text is a movable object but never leaves the frame.
        ctx.beginPath();
        ctx.rect(frame.left, frame.top, frame.width, frame.height);
        ctx.clip();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = m.color;
        const caps = m.transform === 'uppercase';
        let y = m.y + m.lineHeight * m.fit / 2;
        for (let i = 0; i < m.lines.length; i++) {
            const size = m.sizes[i] * m.fit;
            if (size <= 0) continue;
            ctx.font = m.style + ' ' + m.weight + ' ' + size + 'px ' + m.family;
            ctx.letterSpacing = String(m.spacings[i] * m.fit) + 'px';
            const t = caps ? m.lines[i].toUpperCase() : m.lines[i];
            ctx.fillText(t, m.x + m.width / 2, y);
            y += m.lineHeight * m.fit;
        }
        ctx.letterSpacing = '0px';
        ctx.restore();
    }

    // Show the draggable text box on the selected polaroid.
    function drawPolaroidTextBox(ctx, img) {
        if (state.selectedImageId !== img.id) return;
        const pol = img.polaroid;
        if (!pol || !(pol.text || (pol.textPayload && pol.textPayload.text))) return;
        const m = getPolaroidTextMetrics(img);
        ctx.save();
        ctx.strokeStyle = 'rgba(25, 25, 65, 0.35)';
        ctx.lineWidth = Math.max(0.5, 1 / img.scale);
        ctx.setLineDash([4 / img.scale, 3 / img.scale]);
        ctx.strokeRect(m.x, m.y, m.width, m.height);
        ctx.setLineDash([]);
        ctx.restore();
    }

    // Edit the lip text with the existing text editor popup.
    function openPolaroidTextEditor(img) {
        if (!img || !img.polaroid) return;
        if (window.SSTextEditor2 && typeof window.SSTextEditor2.openForPolaroid === 'function') {
            window.SSTextEditor2.openForPolaroid(img);
        }
    }

    function roundedRectPath(ctx, x, y, w, h, r) {
        const rr = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.lineTo(x + w - rr, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
        ctx.lineTo(x + w, y + h - rr);
        ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
        ctx.lineTo(x + rr, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
        ctx.lineTo(x, y + rr);
        ctx.quadraticCurveTo(x, y, x + rr, y);
        ctx.closePath();
    }

    function drawPolaroidFrame(ctx, img) {
        const vr = (img.polaroid && img.polaroid.baseWindow) || img.visibleRect;
        const { frame, lip } = getPolaroidRects(img);

        // Soft drop shadow under the whole frame (used when drop-shadow is on).
        if (img.shadow) {
            ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
            ctx.shadowBlur = vr.height * 0.035;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = vr.height * 0.02;
        }

        ctx.fillStyle = '#fafafa';
        roundedRectPath(ctx, frame.left, frame.top, frame.width, frame.height, frame.width * 0.012);
        ctx.fill();

        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // Subtle inner edge around the photo.
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.10)';
        ctx.lineWidth = Math.max(0.5, 1 / img.scale);
        ctx.strokeRect(vr.x + ctx.lineWidth / 2, vr.y + ctx.lineWidth / 2, vr.width - ctx.lineWidth, vr.height - ctx.lineWidth);

        // Faint tint on the writing lip.
        ctx.fillStyle = 'rgba(0, 0, 0, 0.015)';
        ctx.fillRect(lip.left, lip.top, lip.width, lip.height);
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

            const vr = img.visibleRect;

            ctx.save();
            ctx.translate(img.position.x, img.position.y);
            ctx.rotate(img.rotation);
            ctx.scale(img.scale, img.scale);

            // Polaroid frame sits behind the photo.
            if (img.polaroid) {
                drawPolaroidFrame(ctx, img);
            }

            if (img.polaroid) {
                // A framed photo is clipped to the fixed frame window and drawn
                // with its own free transform, so it can move/scale/rotate
                // inside the frame without ever moving the frame itself.
                const win = img.polaroid.baseWindow;
                ctx.save();
                ctx.beginPath();
                ctx.rect(win.x, win.y, win.width, win.height);
                ctx.clip();

                const px = img.polaroid.photoX || 0;
                const py = img.polaroid.photoY || 0;
                const ps = img.polaroid.photoScale || 1;
                const pr = img.polaroid.photoRot || 0;
                if (px !== 0 || py !== 0 || ps !== 1 || pr !== 0) {
                    ctx.translate(px, py);
                    ctx.rotate(pr);
                    ctx.scale(ps, ps);
                }

                if (img.grayscale) {
                    ctx.filter = 'grayscale(100%)';
                }
                // Draw the visible (cropped) region of the bitmap at its source
                // coordinates; the photo transform maps it into the frame.
                ctx.drawImage(img.bitmap, vr.x, vr.y, vr.width, vr.height, vr.x, vr.y, vr.width, vr.height);
                ctx.filter = 'none';
                ctx.restore();
            } else {
                // Clip to the photo area (the visible crop) and draw the bitmap.
                ctx.save();
                ctx.beginPath();
                ctx.rect(vr.x, vr.y, vr.width, vr.height);
                ctx.clip();

                if (img.shadow) {
                    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
                    ctx.shadowBlur = 20;
                    ctx.shadowOffsetX = 0;
                    ctx.shadowOffsetY = 8;
                }
                if (img.grayscale) {
                    ctx.filter = 'grayscale(100%)';
                }

                // Draw only the visible (cropped) region of the bitmap. Flips
                // are applied once to the bitmap itself (see flipHorizontal/
                // flipVertical), so the crop window lives in the already-flipped
                // source space and always hides from the edge the user drags.
                ctx.drawImage(img.bitmap, vr.x, vr.y, vr.width, vr.height, vr.x, vr.y, vr.width, vr.height);

                // Reset effects
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.filter = 'none';
                ctx.restore();
            }

            // Locked selected images get a red border hugging the inside edge.
            // toggleLock redraws immediately, so it appears the instant the
            // image is clicked and vanishes on deselect. Thickness is
            // counter-scaled by the image scale and the CSS zoom so it is
            // always 5.25px on screen, regardless of zoom.
            if (img.locked && state.selectedImageId === img.id) {
                const designerCanvas = document.getElementById('ss-designer-canvas');
                let zoom = 1;
                if (designerCanvas && designerCanvas.style.transform && designerCanvas.style.transform.includes('scale(')) {
                    const m = designerCanvas.style.transform.match(/scale\(([^)]+)\)/);
                    if (m) {
                        const parsed = parseFloat(m[1]);
                        if (!isNaN(parsed) && parsed > 0) zoom = parsed;
                    }
                }
                const lockWidth = 5.25 / (img.scale * zoom);
                const r = (img.polaroid && img.polaroid.baseWindow) || img.visibleRect;
                ctx.strokeStyle = 'rgba(231, 76, 60, 0.85)';
                ctx.lineWidth = lockWidth;
                ctx.strokeRect(r.x + lockWidth / 2, r.y + lockWidth / 2, r.width - lockWidth, r.height - lockWidth);
            }

            // Lip text sits on top of the frame as a movable object.
            if (img.polaroid) {
                drawPolaroidText(ctx, img);
                drawPolaroidTextBox(ctx, img);
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

        // For a framed photo the handles wrap the transformed photo content
        // (source crop mapped through the photo transform), exactly like a
        // plain image's handles wrap its visible rect.
        const handles = [];
        if (img.polaroid) {
            const tl = photoSourceToFrame(img, { x: r.x, y: r.y });
            const tr = photoSourceToFrame(img, { x: r.x + r.width, y: r.y });
            const bl = photoSourceToFrame(img, { x: r.x, y: r.y + r.height });
            const br = photoSourceToFrame(img, { x: r.x + r.width, y: r.y + r.height });
            const t = photoSourceToFrame(img, { x: r.x + r.width / 2, y: r.y });
            const b = photoSourceToFrame(img, { x: r.x + r.width / 2, y: r.y + r.height });
            const l = photoSourceToFrame(img, { x: r.x, y: r.y + r.height / 2 });
            const rt = photoSourceToFrame(img, { x: r.x + r.width, y: r.y + r.height / 2 });

            // Corner handles for scaling the photo inside the frame
            handles.push(
                { id: 'scale-tl', type: 'corner', localX: tl.x, localY: tl.y },
                { id: 'scale-tr', type: 'corner', localX: tr.x, localY: tr.y },
                { id: 'scale-bl', type: 'corner', localX: bl.x, localY: bl.y },
                { id: 'scale-br', type: 'corner', localX: br.x, localY: br.y },

                // Edge handles for cropping the photo
                { id: 'crop-top', type: 'crop', localX: t.x, localY: t.y },
                { id: 'crop-bottom', type: 'crop', localX: b.x, localY: b.y },
                { id: 'crop-left', type: 'crop', localX: l.x, localY: l.y },
                { id: 'crop-right', type: 'crop', localX: rt.x, localY: rt.y },

                // Rotation handle for the photo
                { id: 'rotate', type: 'rotate', localX: t.x, localY: t.y - 40 / img.scale }
            );
        } else {
            // Corner handles for scaling
            handles.push(
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
            );
        }
        state.handles = handles;

        // Polaroid frames get their own scale + rotation handles wrapping the
        // whole frame; the handles above scale/rotate the photo inside it.
        if (img.polaroid) {
            const f = getPolaroidRects(img).frame;
            state.handles.push(
                { id: 'frame-scale-tl', type: 'frame-corner', localX: f.left, localY: f.top },
                { id: 'frame-scale-tr', type: 'frame-corner', localX: f.left + f.width, localY: f.top },
                { id: 'frame-scale-bl', type: 'frame-corner', localX: f.left, localY: f.top + f.height },
                { id: 'frame-scale-br', type: 'frame-corner', localX: f.left + f.width, localY: f.top + f.height },
                { id: 'frame-rotate', type: 'frame-rotate', localX: f.left + f.width / 2, localY: f.top - 60 / img.scale }
            );
        }

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
        if (!img || img.locked) return;

        state.handles.forEach(h => {
            const worldPos = localToWorld(img, { x: h.localX, y: h.localY });
            const el = document.createElement('div');
            el.className = 'ss-handle';
            el.style.position = 'absolute';
            el.style.pointerEvents = 'auto';
            el.dataset.handleId = h.id;

            if (h.type === 'corner') {
                // Blue corner handles for scaling the photo inside the frame
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
            } else if (h.type === 'frame-corner') {
                // Amber corner handles for scaling the frame itself
                const size = 18;
                el.style.width = size + 'px';
                el.style.height = size + 'px';
                el.style.borderRadius = '50%';
                el.style.background = '#ffb300';
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
                // Rotate handle with the photo (frame + photo rotation)
                const cropRot = img.rotation + (img.polaroid ? (img.polaroid.photoRot || 0) : 0);
                el.style.transform = `rotate(${cropRot}rad)`;
                el.style.cursor = getCropCursor(h.id, cropRot);
            } else if (h.type === 'rotate') {
                // Green rotation handle for the photo inside the frame
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
            } else if (h.type === 'frame-rotate') {
                // Amber diamond rotation handle for the frame
                const size = 16;
                el.style.width = size + 'px';
                el.style.height = size + 'px';
                el.style.borderRadius = '2px';
                el.style.background = '#ffb300';
                el.style.border = '2px solid #fff';
                el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.4)';
                el.style.transform = `rotate(45deg)`;
                el.style.left = (worldPos.x - size / 2) + 'px';
                el.style.top = (worldPos.y - size / 2) + 'px';
                el.style.cursor = 'grab';
            }

            el.addEventListener('mousedown', onHandleMouseDown);
            hc.appendChild(el);
        });

        // Draw outline around the photo content (source crop mapped through the
        // photo transform for framed photos).
        const r0 = img.visibleRect;
        const ppts = img.polaroid
            ? [photoSourceToFrame(img, { x: r0.x, y: r0.y }),
               photoSourceToFrame(img, { x: r0.x + r0.width, y: r0.y }),
               photoSourceToFrame(img, { x: r0.x + r0.width, y: r0.y + r0.height }),
               photoSourceToFrame(img, { x: r0.x, y: r0.y + r0.height })]
            : [{ x: r0.x, y: r0.y },
               { x: r0.x + r0.width, y: r0.y },
               { x: r0.x + r0.width, y: r0.y + r0.height },
               { x: r0.x, y: r0.y + r0.height }];
        const corners = {
            tl: localToWorld(img, ppts[0]),
            tr: localToWorld(img, ppts[1]),
            br: localToWorld(img, ppts[2]),
            bl: localToWorld(img, ppts[3])
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

        // Polaroid: also trace the frame outline in amber.
        if (img.polaroid) {
            const f = getPolaroidRects(img).frame;
            const fc = {
                tl: localToWorld(img, { x: f.left, y: f.top }),
                tr: localToWorld(img, { x: f.left + f.width, y: f.top }),
                bl: localToWorld(img, { x: f.left, y: f.top + f.height }),
                br: localToWorld(img, { x: f.left + f.width, y: f.top + f.height })
            };
            const fpath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            fpath.setAttribute('d', `M ${fc.tl.x} ${fc.tl.y} L ${fc.tr.x} ${fc.tr.y} L ${fc.br.x} ${fc.br.y} L ${fc.bl.x} ${fc.bl.y} Z`);
            fpath.setAttribute('fill', 'none');
            fpath.setAttribute('stroke', '#ffb300');
            fpath.setAttribute('stroke-width', '2');
            svg.appendChild(fpath);
        }

        hc.appendChild(svg);
    }

    function getCornerCursor(id) {
        const parts = id.split('-');
        const corner = parts[parts.length - 1];
        if (corner === 'tl' || corner === 'br') return 'nwse-resize';
        if (corner === 'tr' || corner === 'bl') return 'nesw-resize';
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

            // A framed photo scales like a plain image: the anchor corner of the
            // photo content is pinned in the world and the photo transform is
            // scaled, leaving the frozen frame untouched.  The corner coords are
            // in source space, so map them into the frame before going to world.
            if (img.polaroid) {
                interaction.startPolaroid = photoSnapshot(img);
                interaction.anchorFrame = photoSourceToFrame(img, interaction.anchorLocal);
                interaction.anchorWorld = localToWorld(img, interaction.anchorFrame);
            } else {
                interaction.anchorWorld = localToWorld(img, interaction.anchorLocal);
            }
        }

        // Setup for frame scaling (polaroid only): anchor on the frame corners.
        if (interaction.mode.startsWith('frame-scale-')) {
            const corner = interaction.mode.split('-')[2];
            const f = getPolaroidRects(img).frame;
            const sx = f.left, sy = f.top;
            
            let activeX, activeY, anchorX, anchorY;
            
            if (corner === 'tl') {
                activeX = sx;
                activeY = sy;
                anchorX = sx + f.width;
                anchorY = sy + f.height;
            } else if (corner === 'tr') {
                activeX = sx + f.width;
                activeY = sy;
                anchorX = sx;
                anchorY = sy + f.height;
            } else if (corner === 'bl') {
                activeX = sx;
                activeY = sy + f.height;
                anchorX = sx + f.width;
                anchorY = sy;
            } else { // 'br'
                activeX = sx + f.width;
                activeY = sy + f.height;
                anchorX = sx;
                anchorY = sy;
            }
            
            interaction.initialActiveLocal = { x: activeX, y: activeY };
            interaction.anchorLocal = { x: anchorX, y: anchorY };
            interaction.anchorWorld = localToWorld(img, interaction.anchorLocal);
        }
        
        // Setup for rotation
        if (interaction.mode === 'rotate') {
            if (img.polaroid) {
                // The photo rotates about its own centre (a source point mapped
                // into the frame), never about the frame window centre.
                interaction.startPolaroid = photoSnapshot(img);
                interaction.centerSource = {
                    x: img.visibleRect.x + img.visibleRect.width / 2,
                    y: img.visibleRect.y + img.visibleRect.height / 2
                };
                interaction.centerFrame = photoSourceToFrame(img, interaction.centerSource);
                interaction.centerLocal = interaction.centerFrame;
                interaction.rotationCenterWorld = localToWorld(img, interaction.centerFrame);
            } else {
                const centerLocal = {
                    x: img.visibleRect.x + img.visibleRect.width / 2,
                    y: img.visibleRect.y + img.visibleRect.height / 2
                };
                interaction.centerLocal = centerLocal;
                interaction.rotationCenterWorld = localToWorld(img, centerLocal);
            }
        }

        // Setup for frame rotation (polaroid only): pivot on the frame centre.
        if (interaction.mode === 'frame-rotate') {
            const f = getPolaroidRects(img).frame;
            const centerLocal = { x: f.left + f.width / 2, y: f.top + f.height / 2 };
            interaction.centerLocal = centerLocal;
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

        // A drag that moves beyond the click threshold cancels the pending
        // lip click so the frame moves instead of opening the text editor.
        if (interaction.lipClickPending && !interaction.moved) {
            const ddx = mouseWorld.x - interaction.startMouse.x;
            const ddy = mouseWorld.y - interaction.startMouse.y;
            if (Math.abs(ddx) + Math.abs(ddy) > 3) interaction.moved = true;
        }
        
        if (interaction.mode === 'drag') {
            handleDrag(img, mouseWorld);
        } else if (interaction.mode === 'photo-drag') {
            handlePhotoDrag(img, mouseWorld);
        } else if (interaction.mode === 'text-drag') {
            handleTextDrag(img, mouseWorld);
        } else if (interaction.mode.startsWith('crop-')) {
            handleCrop(img, mouseWorld);
        } else if (interaction.mode.startsWith('frame-scale-')) {
            handleFrameScale(img, mouseWorld);
        } else if (interaction.mode.startsWith('scale-')) {
            handleScale(img, mouseWorld);
        } else if (interaction.mode === 'rotate') {
            if (img.polaroid) {
                handlePhotoRotate(img, mouseWorld);
            } else {
                handleRotate(img, mouseWorld);
            }
        } else if (interaction.mode === 'frame-rotate') {
            handleRotate(img, mouseWorld);
        }
        
        draw();
        computeHandles();
    }

    function onMouseUp(e) {
        interaction.active = false;
        interaction.mode = null;
        const openLipEditor = interaction.lipClickPending && !interaction.moved;
        interaction.lipClickPending = false;
        interaction.moved = false;
        snapReset();
        
        const canvas = ensureCanvas();
        if (canvas) canvas.style.cursor = 'default';
        
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        if (typeof window.refreshBackgroundPalette === 'function') {
            window.refreshBackgroundPalette();
        }
        // A lip click (no drag) opens the text editor.
        if (openLipEditor) {
            const img = getSelectedImage();
            if (img && img.polaroid) openPolaroidTextEditor(img);
        }
    }

    // ============================================================================
    // DRAG LOGIC
    // ============================================================================

    function handleDrag(img, mouseWorld) {
        const dx = mouseWorld.x - interaction.startMouse.x;
        const dy = mouseWorld.y - interaction.startMouse.y;
        
        img.position.x = interaction.startImage.position.x + dx;
        img.position.y = interaction.startImage.position.y + dy;
        
        // Magnet snapping (rotation-aware bounding box)
        if (magnetState.active) {
            const aabb = getImageAABB(img);
            const snapped = snapBox(aabb, null, img.id);
            img.position.x += snapped.left - aabb.left;
            img.position.y += snapped.top - aabb.top;
        }
    }

    // Drag the polaroid lip text. The text stays inside the frame: the fitted
    // box is clamped to the outer frame bounds.
    function handleTextDrag(img, mouseWorld) {
        const dx = mouseWorld.x - interaction.startMouse.x;
        const dy = mouseWorld.y - interaction.startMouse.y;
        // Convert the world delta into the frame's local space.
        const cos = Math.cos(-img.rotation), sin = Math.sin(-img.rotation);
        const ldx = (dx * cos - dy * sin) / img.scale;
        const ldy = (dx * sin + dy * cos) / img.scale;

        const m = getPolaroidTextMetrics(img);
        const { frame } = getPolaroidRects(img);
        const minX = frame.left + 2;
        const minY = frame.top + 2;
        const maxX = frame.left + frame.width - m.width - 2;
        const maxY = frame.top + frame.height - m.height - 2;
        img.polaroid.textX = Math.max(minX, Math.min(maxX, interaction.startText.x + ldx));
        img.polaroid.textY = Math.max(minY, Math.min(maxY, interaction.startText.y + ldy));
    }

    // ============================================================================
    // CROP LOGIC
    // ============================================================================

    function handleCrop(img, mouseWorld) {
        let pLocal = worldToLocal(img, mouseWorld);
        // Cropping a framed photo edits the photo's source crop, never the
        // frozen frame window.
        if (img.polaroid) pLocal = photoFrameToSource(img, pLocal);
        
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

    function handleScale(img, mouseWorld) {
        // A framed photo scales about its window centre, inside the fixed frame.
        if (img.polaroid) {
            handlePhotoScale(img, mouseWorld);
            return;
        }
        const start = interaction.startImage;
        if (!start) return;

        // Convert the cursor to local coordinates using the INITIAL transform so
        // the image tracks the mouse 1:1 (no feedback loop, no lag).
        const pLocalMouse = worldToLocalAt(mouseWorld, start.position, start.scale, start.rotation);

        const d0 = distance(interaction.initialActiveLocal, interaction.anchorLocal);
        const d1 = distance(pLocalMouse, interaction.anchorLocal);
        if (d0 === 0) return;

        // Clamp ratio to prevent extreme jumps
        const scaleRatio = Math.max(0.01, Math.min(d1 / d0, 100));
        const targetScale = start.scale * scaleRatio;

        // Prevent scale from going too small or too large
        img.scale = Math.max(0.05, Math.min(targetScale, 50));

        // Keep the anchor corner fixed in world coordinates
        const cos = Math.cos(start.rotation);
        const sin = Math.sin(start.rotation);
        const ax = interaction.anchorLocal.x * img.scale;
        const ay = interaction.anchorLocal.y * img.scale;
        img.position.x = interaction.anchorWorld.x - (cos * ax - sin * ay);
        img.position.y = interaction.anchorWorld.y - (sin * ax + cos * ay);
    }

    // Scale the photo exactly like a plain image: keep the opposite corner of
    // the photo content anchored in the world and scale the photo transform.
    function handlePhotoScale(img, mouseWorld) {
        const start = interaction.startImage;
        const sp = interaction.startPolaroid;
        if (!start || !img.polaroid || !sp) return;

        // World mouse -> frame-local (via the INITIAL frame transform) ->
        // source coords (via the INITIAL photo transform).
        const pFrame = worldToLocalAt(mouseWorld, start.position, start.scale, start.rotation);
        const pSrc = inversePhotoTransform(sp, pFrame);

        const d0 = distance(interaction.initialActiveLocal, interaction.anchorLocal);
        const d1 = distance(pSrc, interaction.anchorLocal);
        if (d0 === 0) return;

        const ratio = Math.max(0.01, Math.min(d1 / d0, 100));
        const ps = Math.max(0.05, Math.min(sp.photoScale * ratio, 50));
        img.polaroid.photoScale = ps;

        // Keep the anchor source corner fixed in frame-local (hence world)
        // coordinates - identical behaviour to a plain image.
        const cos = Math.cos(sp.photoRot);
        const sin = Math.sin(sp.photoRot);
        const ax = interaction.anchorLocal.x * ps;
        const ay = interaction.anchorLocal.y * ps;
        img.polaroid.photoX = interaction.anchorFrame.x - (cos * ax - sin * ay);
        img.polaroid.photoY = interaction.anchorFrame.y - (sin * ax + cos * ay);
    }

    // Move the photo freely inside the fixed frame.
    function handlePhotoDrag(img, mouseWorld) {
        const start = interaction.startImage;
        const sp = interaction.startPolaroid;
        if (!start || !img.polaroid || !sp) return;

        const m0 = worldToLocalAt(interaction.startMouse, start.position, start.scale, start.rotation);
        const m1 = worldToLocalAt(mouseWorld, start.position, start.scale, start.rotation);
        img.polaroid.photoX = sp.photoX + (m1.x - m0.x);
        img.polaroid.photoY = sp.photoY + (m1.y - m0.y);
    }

    // Scale the whole polaroid frame about the opposite frame corner.
    function handleFrameScale(img, mouseWorld) {
        const start = interaction.startImage;
        if (!start) return;

        const pLocalMouse = worldToLocalAt(mouseWorld, start.position, start.scale, start.rotation);

        const d0 = distance(interaction.initialActiveLocal, interaction.anchorLocal);
        const d1 = distance(pLocalMouse, interaction.anchorLocal);
        if (d0 === 0) return;

        const scaleRatio = Math.max(0.01, Math.min(d1 / d0, 100));
        const targetScale = start.scale * scaleRatio;
        img.scale = Math.max(0.05, Math.min(targetScale, 50));

        const cos = Math.cos(start.rotation);
        const sin = Math.sin(start.rotation);
        const ax = interaction.anchorLocal.x * img.scale;
        const ay = interaction.anchorLocal.y * img.scale;
        img.position.x = interaction.anchorWorld.x - (cos * ax - sin * ay);
        img.position.y = interaction.anchorWorld.y - (sin * ax + cos * ay);
    }

    // Rotate the photo about its own centre, exactly like a plain image. The
    // centre (a source point) is kept fixed in frame-local (hence world) space.
    function handlePhotoRotate(img, mouseWorld) {
        const sp = interaction.startPolaroid;
        const centerWorld = interaction.rotationCenterWorld;
        if (!centerWorld || !img.polaroid || !sp) return;

        const angle = Math.atan2(mouseWorld.y - centerWorld.y, mouseWorld.x - centerWorld.x);
        const initialAngle = Math.atan2(interaction.startMouse.y - centerWorld.y, interaction.startMouse.x - centerWorld.x);

        const pr = sp.photoRot + (angle - initialAngle);
        img.polaroid.photoRot = pr;

        // Keep the photo centre fixed in frame-local space.
        const cos = Math.cos(pr);
        const sin = Math.sin(pr);
        const ps = img.polaroid.photoScale || sp.photoScale;
        img.polaroid.photoX = interaction.centerFrame.x - (cos * interaction.centerSource.x * ps - sin * interaction.centerSource.y * ps);
        img.polaroid.photoY = interaction.centerFrame.y - (sin * interaction.centerSource.x * ps + cos * interaction.centerSource.y * ps);
    }

    // ============================================================================
    // ROTATION LOGIC
    // ============================================================================

    function handleRotate(img, mouseWorld) {
        const centerLocal = interaction.centerLocal;
        
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

            // Check if point is on the photo content. For a framed photo the
            // photo is transformed inside the frame, so test in source space.
            // The photo is drawn clipped to the fixed frame window, so a point
            // only counts as "on the photo" inside that window; anywhere else on
            // the frame the white border wins and dragging moves the whole
            // polaroid.
            let inPhoto;
            if (img.polaroid) {
                const win = img.polaroid.baseWindow;
                const inWin = pLocal.x >= win.x && pLocal.x <= win.x + win.width &&
                    pLocal.y >= win.y && pLocal.y <= win.y + win.height;
                if (inWin) {
                    const pSrc = photoFrameToSource(img, pLocal);
                    inPhoto = pSrc.x >= img.visibleRect.x &&
                        pSrc.x <= img.visibleRect.x + img.visibleRect.width &&
                        pSrc.y >= img.visibleRect.y &&
                        pSrc.y <= img.visibleRect.y + img.visibleRect.height;
                } else {
                    inPhoto = false;
                }
            } else {
                inPhoto = pLocal.x >= img.visibleRect.x &&
                    pLocal.x <= img.visibleRect.x + img.visibleRect.width &&
                    pLocal.y >= img.visibleRect.y &&
                    pLocal.y <= img.visibleRect.y + img.visibleRect.height;
            }

            // Polaroid frames also catch clicks on their white border / lip.
            let inFrame = false;
            let inLip = false;
            let inLipText = false;
            if (img.polaroid) {
                const rects = getPolaroidRects(img);
                inFrame = pLocal.x >= rects.frame.left && pLocal.x <= rects.frame.left + rects.frame.width &&
                    pLocal.y >= rects.frame.top && pLocal.y <= rects.frame.top + rects.frame.height;
                inLip = pLocal.x >= rects.lip.left && pLocal.x <= rects.lip.left + rects.lip.width &&
                    pLocal.y >= rects.lip.top && pLocal.y <= rects.lip.top + rects.lip.height;
                const pol = img.polaroid;
                const hasText = !!(pol.text || (pol.textPayload && pol.textPayload.text));
                if (hasText) {
                    const t = getPolaroidTextMetrics(img);
                    inLipText = pLocal.x >= t.x && pLocal.x <= t.x + t.width &&
                        pLocal.y >= t.y && pLocal.y <= t.y + t.height;
                }
            }

            if (inPhoto || inFrame || inLipText) {

                state.selectedImageId = img.id;
                computeHandles();
                draw();
                notifySelectionChange();

                // Don't allow dragging if image is locked
                if (!img.locked) {
                    const startInteraction = function(mode) {
                        interaction.active = true;
                        interaction.mode = mode;
                        interaction.moved = false;
                        interaction.lipClickPending = false;
                        interaction.startMouse = { x: mouseWorld.x, y: mouseWorld.y };
                        interaction.startImage = {
                            position: { ...img.position },
                            scale: img.scale,
                            rotation: img.rotation
                        };
                        if (img.polaroid && img.polaroid.textX !== null) {
                            interaction.startText = {
                                x: img.polaroid.textX,
                                y: img.polaroid.textY
                            };
                        } else {
                            interaction.startText = null;
                        }
                        if (img.polaroid) interaction.startPolaroid = photoSnapshot(img);
                        snapReset();

                        document.addEventListener('mousemove', onMouseMove);
                        document.addEventListener('mouseup', onMouseUp);
                        canvas.style.cursor = 'move';
                    };

                    if (img.polaroid && inLipText && !img.locked) {
                        // The lip text is a movable object drawn on top of the frame.
                        startInteraction('text-drag');
                    } else if (img.polaroid && inLip && !inPhoto) {
                        // A press on the lip can move the frame, but a plain click
                        // (released without moving) opens the text editor.
                        startInteraction('drag');
                        interaction.lipClickPending = true;
                    } else if (img.polaroid && inPhoto) {
                        // Clicking the photo moves the photo inside the frame;
                        // the frame itself stays put.
                        startInteraction('photo-drag');
                    } else {
                        // Clicking the frame (or a plain image) drags the whole
                        // thing: the frame moves and the photo follows.
                        startInteraction('drag');
                    }
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

    window.ImageTransform.getSnapRegions = function(excludeImgId) {
        return state.images
            .filter(img => img.visible !== false && img.id !== excludeImgId)
            .map(img => getImageAABB(img));
    };

    window.ImageTransform.importFromElement = function(element, layer) { 
        return createImageFromLayer(element, layer); 
    };

    window.SSImage = window.SSImage || {};
    
    window.SSImage.setupImageResizeHandlers = function(element) {
        if (!element) return;
        
const layer = layerState && layerState.layers ?
    layerState.layers.find(l => l.element === element) : null;
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

    // Bake a flip into the bitmap itself (returns a new canvas; the original
    // bitmap is left untouched so duplicates/undo keep their own reference).
    function mirrorBitmap(bitmap, flipX, flipY) {
        if (!bitmap || (!flipX && !flipY)) return bitmap;
        const c = document.createElement('canvas');
        c.width = bitmap.width;
        c.height = bitmap.height;
        const ctx = c.getContext('2d');
        ctx.translate(flipX ? c.width : 0, flipY ? c.height : 0);
        ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
        ctx.drawImage(bitmap, 0, 0);
        return c;
    }

    function flipHorizontal() {
        const img = getSelectedImage();
        if (!img || !img.bitmap) return;
        const w = img.originalWidth;
        const vr = img.visibleRect;
        // Keep the crop window anchored in world space while the bitmap and
        // window mirror about the image center - otherwise an off-center crop
        // would visually nudge the whole image.
        const oldCenter = localToWorld(img, { x: vr.x + vr.width / 2, y: vr.y + vr.height / 2 });
        img.visibleRect.x = w - vr.x - vr.width;
        img.bitmap = mirrorBitmap(img.bitmap, true, false);
        const newCenter = localToWorld(img, {
            x: img.visibleRect.x + img.visibleRect.width / 2,
            y: img.visibleRect.y + img.visibleRect.height / 2
        });
        img.position.x -= (newCenter.x - oldCenter.x);
        img.position.y -= (newCenter.y - oldCenter.y);
        img.flipX = !img.flipX;
        draw();
        computeHandles();
    }

    function flipVertical() {
        const img = getSelectedImage();
        if (!img || !img.bitmap) return;
        const h = img.originalHeight;
        const vr = img.visibleRect;
        // See flipHorizontal: keep the crop window anchored in world space.
        const oldCenter = localToWorld(img, { x: vr.x + vr.width / 2, y: vr.y + vr.height / 2 });
        img.visibleRect.y = h - vr.y - vr.height;
        img.bitmap = mirrorBitmap(img.bitmap, false, true);
        const newCenter = localToWorld(img, {
            x: img.visibleRect.x + img.visibleRect.width / 2,
            y: img.visibleRect.y + img.visibleRect.height / 2
        });
        img.position.x -= (newCenter.x - oldCenter.x);
        img.position.y -= (newCenter.y - oldCenter.y);
        img.flipY = !img.flipY;
        draw();
        computeHandles();
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
            grayscale: img.grayscale || false,
            polaroid: img.polaroid ? JSON.parse(JSON.stringify(img.polaroid)) : null
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
        draw();
        notifySelectionChange();
        return img.locked;
    }

    function detectPolaroidType(width, height) {
        if (!width || !height) return 'square';
        const aspect = width / height;
        if (aspect > 1.15) return 'wide';      // landscape -> Fuji Instax Wide
        if (aspect < 0.87) return 'portrait';  // portrait  -> Polaroid 600
        return 'square';                       // square    -> Instax Square
    }

    function togglePolaroid() {
        const img = getSelectedImage();
        if (!img || !img.bitmap) return false;
        if (img.polaroid) {
            img.polaroid = null;
        } else {
            img.polaroid = {
                type: detectPolaroidType(img.originalWidth, img.originalHeight),
                text: '',
                textPayload: null,
                textX: null,
                textY: null,
                // The frame window is captured once and frozen: photo edits
                // move/scale/rotate/crop the photo, never the frame.
                baseWindow: {
                    x: img.visibleRect.x,
                    y: img.visibleRect.y,
                    width: img.visibleRect.width,
                    height: img.visibleRect.height
                },
                photoX: 0,
                photoY: 0,
                photoScale: 1,
                photoRot: 0
            };
        }
        draw();
        computeHandles();
        notifySelectionChange();
        return !!img.polaroid;
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
                    // The new bitmap is a fresh, unflipped image.
                    img.flipX = false;
                    img.flipY = false;
                    
                    // Re-pick the polaroid type for the new aspect ratio.
                    if (img.polaroid) {
                        img.polaroid.type = detectPolaroidType(img.originalWidth, img.originalHeight);
                    }
                    
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

    // Temporarily deselect (removes selection outlines from the image canvas)
    // so external snapshotting (export) captures only the artwork. Returns a
    // restore function that reselects and redraws.
    function prepareSnapshot() {
        const prev = state.selectedImageId;
        state.selectedImageId = null;
        draw();
        return function restore() {
            state.selectedImageId = prev;
            draw();
            computeHandles();
        };
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
        togglePolaroid: togglePolaroid,
        toggleShadow: toggleShadow,
        toggleGrayscale: toggleGrayscale,
        updatePolaroidText: openPolaroidTextEditor,
        replaceImage: replaceImage,
        hasSelectedImage: function() { return !!getSelectedImage(); },
        getSelectedImage: getSelectedImage,
        prepareSnapshot: prepareSnapshot,
        getSnapRegions: function(excludeImgId) {
            return state.images
                .filter(img => img.visible !== false && img.id !== excludeImgId)
                .map(img => getImageAABB(img));
        },
        // Expose the source bitmaps (with their visible crop and world AABB)
        // for color sampling. Sampling reads the bitmap directly at a fixed
        // resolution, so moving/scaling/rotating an image never changes the
        // palette - only cropping or moving it off-canvas does.
        getSampleableImages: function() {
            return state.images
                .filter(img => img.visible !== false && img.bitmap)
                .map(img => ({
                    id: img.id,
                    bitmap: img.bitmap,
                    visibleRect: {
                        x: img.visibleRect.x,
                        y: img.visibleRect.y,
                        width: img.visibleRect.width,
                        height: img.visibleRect.height
                    },
                    aabb: getImageAABB(img),
                    grayscale: !!img.grayscale
                }));
        }
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
