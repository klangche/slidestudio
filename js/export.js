// Export, backup and template utilities.
import { canvasState, layerState, historyState } from './state.js';
import { restoreState } from './history.js';

function loadScript(url) {
    return new Promise(function(resolve, reject) {
        if (document.querySelector('script[src="' + url + '"]')) return resolve();
        const s = document.createElement('script');
        s.src = url;
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
    });
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

function generateSlideCanvasBlob(slideIndex, targetW, targetH) {
    return new Promise(function(resolve) {
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');

        // Fill background
        const designerCanvas = document.getElementById('ss-designer-canvas');
        const bg = (designerCanvas && designerCanvas.style.backgroundColor) ? designerCanvas.style.backgroundColor : '#ffffff';
        ctx.fillStyle = bg;
        ctx.fillRect(0,0,canvas.width, canvas.height);

        const slideLeft = slideIndex * 1080;
        const slideWidth = 1080;
        const scaleX = targetW / slideWidth;
        const scaleY = targetH / (targetH ? targetH : targetW);
        const scale = scaleX; // preserve x-based scaling for consistency

        const layersToDraw = layerState.layers.filter(l => l.element && l.element.style.display !== 'none');

        // Draw images and text simply (no rotation)
        const drawNext = function(i) {
            if (i >= layersToDraw.length) {
                canvas.toBlob(function(blob) { resolve(blob); }, 'image/png');
                return;
            }
            const layer = layersToDraw[i];
            try {
                const left = (layer.position && typeof layer.position.left === 'number') ? layer.position.left : (parseInt(layer.element.style.left) || 0);
                const top = (layer.position && typeof layer.position.top === 'number') ? layer.position.top : (parseInt(layer.element.style.top) || 0);
                const width = (layer.size && layer.size.width) ? layer.size.width : (layer.element.offsetWidth || parseInt(layer.element.style.width) || 0);
                const height = (layer.size && layer.size.height) ? layer.size.height : (layer.element.offsetHeight || parseInt(layer.element.style.height) || 0);

                const relLeft = left - slideLeft;
                const relTop = top;

                // Skip if not visible in this slide
                if (relLeft + width < 0 || relLeft > slideWidth) {
                    drawNext(i+1);
                    return;
                }

                if (layer.type === 'image') {
                    const imgEl = layer.imageElement || layer.element.querySelector('img');
                    if (imgEl && imgEl.src) {
                        const img = new Image();
                        img.onload = function() {
                            ctx.drawImage(img, Math.round(relLeft * scale), Math.round(relTop * scale), Math.round(width * scale), Math.round(height * scale));
                            drawNext(i+1);
                        };
                        img.onerror = function() { drawNext(i+1); };
                        img.src = imgEl.src;
                        return;
                    }
                } else if (layer.type === 'polaroid') {
                    // Draw a simple frame then draw inner image(s)
                    // draw frame as white rect with slight shadow
                    ctx.save();
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(Math.round(relLeft * scale), Math.round(relTop * scale), Math.round(width * scale), Math.round(height * scale));
                    ctx.restore();
                    // Find inner image layer
                    const inner = layerState.layers.find(l => l.parentPolaroid === layer.id);
                    if (inner && inner.imageElement && inner.imageElement.src) {
                        const img = new Image();
                        img.onload = function() {
                            // compute inner position relative to polaroid window base (we assume base.windowLeft/windowTop)
                            const base = layer.base || { windowLeft:45, windowTop:90 };
                            const winLeft = (base.windowLeft || 45);
                            const winTop = (base.windowTop || 90);
                            const innerRelLeft = relLeft + winLeft;
                            const innerRelTop = relTop + winTop;
                            ctx.drawImage(img, Math.round(innerRelLeft * scale), Math.round(innerRelTop * scale), Math.round((inner.size.width||img.width) * scale), Math.round((inner.size.height||img.height) * scale));
                            drawNext(i+1);
                        };
                        img.onerror = function() { drawNext(i+1); };
                        img.src = inner.imageElement.src;
                        return;
                    }
                } else if (layer.type === 'text') {
                    const text = layer.element.textContent || '';
                    const fontSize = parseInt(layer.element.style.fontSize) || (layer.fontSize || 24);
                    ctx.save();
                    ctx.fillStyle = layer.element.style.color || '#000';
                    ctx.font = (fontSize * scale) + 'px ' + (layer.element.style.fontFamily || 'Arial');
                    ctx.textAlign = layer.element.style.textAlign || 'left';
                    // simple single-line draw at top-left
                    const x = Math.round(relLeft * scale) + 10;
                    const y = Math.round(relTop * scale) + Math.round((fontSize * scale));
                    wrapText(ctx, text, x, y, Math.round(width * scale) - 20, Math.round(fontSize * scale));
                    ctx.restore();
                    drawNext(i+1);
                    return;
                }
            } catch (err) {
                // ignore drawing errors per layer
            }
            drawNext(i+1);
        };

        drawNext(0);
    });
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(/\s+/);
    let line = '';
    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
            ctx.fillText(line, x, y);
            line = words[n] + ' ';
            y += lineHeight;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line, x, y);
}

export function exportCanvasZip(filename) {
    return (async function() {
        filename = filename || ('slide_export_' + Date.now() + '.zip');
        const jszipUrl = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
        try {
            await loadScript(jszipUrl);
        } catch (err) {
            console.error('Failed to load JSZip:', err);
            throw err;
        }

        if (typeof JSZip === 'undefined') {
            throw new Error('JSZip not available');
        }

        const zip = new JSZip();
        const sizes = [
            { name: 'Square', w:1080, h:1080 },
            { name: 'Post', w:1080, h:1350 },
            { name: 'Stories', w:1080, h:1920 },
            { name: 'Fullwidth', w: canvasState.width, h: canvasState.height }
        ];

        const sections = Math.max(1, canvasState.sections || 1);

        for (const size of sizes) {
            const folder = zip.folder(size.name);
            for (let s = 0; s < sections; s++) {
                if (size.name === 'Fullwidth' && s > 0) break; // only one fullwidth export
                const slideIndex = (size.name === 'Fullwidth') ? 0 : s;
                try {
                    const blob = await generateSlideCanvasBlob(slideIndex, size.w, size.h);
                    const arrayBuffer = await blob.arrayBuffer();
                    const fileName = 'slide_' + (s+1) + '.png';
                    folder.file(fileName, arrayBuffer);
                } catch (err) {
                    console.warn('Skipping slide export for', size.name, 'slide', s+1, err);
                }
            }
        }

        const content = await zip.generateAsync({ type: 'blob' });
        downloadBlob(content, filename);
    })();
}

// Backup: download JSON of current state (includes image src data URLs when available)
export function downloadBackup(filename) {
    filename = filename || ('slide_backup_' + Date.now() + '.json');
    const exportState = {
        canvasState: canvasState,
        layers: layerState.layers.map(function(l) {
            const copy = Object.assign({}, l);
            // include element-specific state and image data if available
            copy.elementState = {
                left: l.element ? parseInt(l.element.style.left) || 0 : (l.position && l.position.left) || 0,
                top: l.element ? parseInt(l.element.style.top) || 0 : (l.position && l.position.top) || 0,
                width: l.element ? (l.element.offsetWidth || parseInt(l.element.style.width) || 0) : (l.size && l.size.width) || 0,
                height: l.element ? (l.element.offsetHeight || parseInt(l.element.style.height) || 0) : (l.size && l.size.height) || 0,
                display: l.element ? (l.element.style.display || '') : ''
            };
            if (l.imageElement && l.imageElement.src) copy.imageData = l.imageElement.src;
            return copy;
        }),
        history: {
            undoStack: historyState.undoStack || [],
            redoStack: historyState.redoStack || []
        }
    };
    const blob = new Blob([JSON.stringify(exportState, null, 2)], { type: 'application/json' });
    downloadBlob(blob, filename);
}

// Templates: save to localStorage and load
export function saveTemplate(name) {
    // prompt for name if not provided
    if (!name) name = window.prompt('Enter template name', 'template_' + Date.now());
    if (!name) {
        console.warn('Template save cancelled - no name provided');
        return;
    }
    const templates = JSON.parse(localStorage.getItem('ss_templates') || '[]');
    const exportState = {
        canvasState: canvasState,
        layers: layerState.layers.map(function(l) {
            const copy = Object.assign({}, l);
            if (l.imageElement && l.imageElement.src) copy.imageData = l.imageElement.src;
            // persist element style/visibility
            copy.elementState = {
                left: l.element ? parseInt(l.element.style.left) || 0 : (l.position && l.position.left) || 0,
                top: l.element ? parseInt(l.element.style.top) || 0 : (l.position && l.position.top) || 0,
                width: l.element ? (l.element.offsetWidth || parseInt(l.element.style.width) || 0) : (l.size && l.size.width) || 0,
                height: l.element ? (l.element.offsetHeight || parseInt(l.element.style.height) || 0) : (l.size && l.size.height) || 0,
                display: l.element ? (l.element.style.display || '') : ''
            };
            return copy;
        })
    };
    templates.push({ name: name, state: exportState, created: Date.now() });
    localStorage.setItem('ss_templates', JSON.stringify(templates));
}

export function listTemplates() {
    return JSON.parse(localStorage.getItem('ss_templates') || '[]');
}

export function loadTemplateByName(name) {
    const templates = listTemplates();
    const t = templates.find(x => x.name === name);
    if (t && t.state) {
        restoreState(t.state);
    }
}

export function loadBackupFromFile(file) {
    return new Promise(function(resolve, reject) {
        const reader = new FileReader();
        reader.onload = function(ev) {
            try {
                const json = JSON.parse(ev.target.result);
                restoreState(json);
                resolve();
            } catch (err) { reject(err); }
        };
        reader.onerror = reject;
        reader.readAsText(file);
    });
}

// Open file dialog to load a backup JSON and restore it
export function openLoadBackupDialog() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.addEventListener('change', function(e) {
        const file = input.files && input.files[0];
        if (!file) return;
        loadBackupFromFile(file).then(function() {
            console.log('Backup loaded');
        }).catch(function(err) {
            console.error('Failed to load backup', err);
        });
    });
    input.click();
}

// Open file dialog to load a template JSON and restore it
export function openLoadTemplateDialog() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.addEventListener('change', function(e) {
        const file = input.files && input.files[0];
        if (!file) return;
        loadBackupFromFile(file).then(function() {
            console.log('Template loaded');
        }).catch(function(err) {
            console.error('Failed to load template', err);
        });
    });
    input.click();
}
