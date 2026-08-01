// Export, backup and template utilities.
// Export renders the whole visible canvas once (background + image canvas snapshot
// + text boxes in z-order) and then splits that snapshot into the full-size image
// and the SoMe formats defined by the guides (9:16 Stories, 4:5 Post, 1:1 Square).
import { canvasState, layerState, historyState } from './state.js';
import { restoreState } from './history.js';

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

function canvasToBytes(canvas) {
    return new Promise(function(resolve, reject) {
        canvas.toBlob(function(blob) {
            if (!blob) { reject(new Error('Canvas conversion failed')); return; }
            blob.arrayBuffer().then(function(buf) { resolve(new Uint8Array(buf)); }, reject);
        }, 'image/png');
    });
}

// ============================================================================
// FULL-CANVAS RENDERING (snapshot of everything visible inside the canvas)
// ============================================================================

function parseRotateRad(transform) {
    if (!transform) return 0;
    const m = /rotate\(\s*([-+\d.]+)deg\s*\)/.exec(transform);
    return m ? parseFloat(m[1]) * Math.PI / 180 : 0;
}

function renderFullCanvasSync() {
    const W = Math.max(1, Math.round(canvasState.width));
    const H = Math.max(1, Math.round(canvasState.height));

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Background
    const designerCanvas = document.getElementById('ss-designer-canvas');
    const bg = (designerCanvas && designerCanvas.style.backgroundColor) ? designerCanvas.style.backgroundColor : '#ffffff';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Clip to canvas bounds to mirror the designer's overflow:hidden
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();

    // Images: snapshot the live image canvas for pixel-exact results
    const imgCanvas = document.getElementById('ss-image-canvas');
    if (imgCanvas) {
        const srcW = Math.min(imgCanvas.width, W);
        const srcH = Math.min(imgCanvas.height, H);
        ctx.drawImage(imgCanvas, 0, 0, srcW, srcH);
    }

    // Text layers in z-index order (text boxes render above the image canvas)
    const textLayers = layerState.layers
        .filter(function(l) { return l.type === 'text' && l.element && l.element.style.display !== 'none'; })
        .sort(function(a, b) { return (a.zIndex || 0) - (b.zIndex || 0); });
    for (let i = 0; i < textLayers.length; i++) {
        renderTextBox(ctx, textLayers[i]);
    }

    ctx.restore();

    return canvas;
}

async function renderFullCanvas() {
    let restore = null;
    if (window.SSImageTransform && typeof window.SSImageTransform.prepareSnapshot === 'function') {
        restore = window.SSImageTransform.prepareSnapshot();
    }
    try {
        return renderFullCanvasSync();
    } finally {
        if (restore) restore();
    }
}

// ============================================================================
// TEXT BOX RENDERING (rich runs: bold/italic/underline/strikethrough/color)
// ============================================================================

var TAG_STYLES = {
    'B': { fontWeight: 'bold' },
    'STRONG': { fontWeight: 'bold' },
    'I': { fontStyle: 'italic' },
    'EM': { fontStyle: 'italic' },
    'U': { textDecoration: 'underline' },
    'S': { textDecoration: 'line-through' },
    'STRIKE': { textDecoration: 'line-through' }
};

function mergeRunStyle(base, overrides) {
    if (!overrides) return base;
    return {
        fontFamily: overrides.fontFamily || base.fontFamily,
        fontSize: overrides.fontSize || base.fontSize,
        fontWeight: overrides.fontWeight || base.fontWeight,
        fontStyle: overrides.fontStyle || base.fontStyle,
        textDecoration: overrides.textDecoration || base.textDecoration,
        color: overrides.color || base.color,
        letterSpacing: (overrides.letterSpacing === undefined || overrides.letterSpacing === null) ? base.letterSpacing : overrides.letterSpacing,
        textTransform: base.textTransform
    };
}

function collectRuns(root, base) {
    const runs = [];
    function walk(node, style) {
        if (node.nodeType === 3) { // TEXT_NODE
            let text = node.nodeValue;
            if (text) {
                if (style.textTransform === 'uppercase') text = text.toUpperCase();
                runs.push({ text: text, style: style });
            }
            return;
        }
        if (node.nodeType !== 1) return; // ELEMENT_NODE
        if (node.tagName === 'BR') {
            runs.push({ text: '\n', style: style });
            return;
        }
        let overrides = TAG_STYLES[node.tagName] || null;
        const inline = node.style;
        if (inline) {
            const o = {};
            if (inline.fontWeight) o.fontWeight = inline.fontWeight;
            if (inline.fontStyle) o.fontStyle = inline.fontStyle;
            if (inline.textDecoration) o.textDecoration = inline.textDecoration;
            if (inline.color) o.color = inline.color;
            if (inline.fontSize) { const f = parseFloat(inline.fontSize); if (!isNaN(f)) o.fontSize = f; }
            if (inline.fontFamily) o.fontFamily = inline.fontFamily;
            overrides = mergeRunStyle(overrides || {}, o);
        }
        const next = mergeRunStyle(style, overrides);
        const children = node.childNodes;
        for (let i = 0; i < children.length; i++) walk(children[i], next);
    }
    const rootChildren = root.childNodes;
    for (let i = 0; i < rootChildren.length; i++) walk(rootChildren[i], base);
    return runs;
}

function splitRunsByLine(runs) {
    const lines = [];
    let current = [];
    const flush = function() { if (current.length) { lines.push(current); current = []; } };
    for (let r = 0; r < runs.length; r++) {
        const segments = String(runs[r].text).split('\n');
        for (let i = 0; i < segments.length; i++) {
            if (i > 0) flush();
            if (segments[i]) current.push({ text: segments[i], style: runs[r].style });
        }
    }
    flush();
    return lines;
}

function setFont(ctx, style) {
    const size = Math.max(1, style.fontSize || 24);
    let font = '';
    if (style.fontStyle && style.fontStyle !== 'normal') font += style.fontStyle + ' ';
    if (style.fontWeight && style.fontWeight !== 'normal') font += style.fontWeight + ' ';
    font += size + 'px ' + (style.fontFamily || 'Arial, sans-serif');
    ctx.font = font;
    ctx.fillStyle = style.color || '#000000';
    if (typeof ctx.letterSpacing === 'string' || 'letterSpacing' in ctx) {
        try { ctx.letterSpacing = (style.letterSpacing || 0) + 'px'; } catch (e) {}
    }
}

function measureToken(ctx, token) {
    setFont(ctx, token.style);
    return ctx.measureText(token.text).width;
}

function wrapRuns(runs, maxWidth, ctx) {
    const tokens = [];
    for (let r = 0; r < runs.length; r++) {
        const parts = String(runs[r].text).split(/(\s+)/);
        for (let p = 0; p < parts.length; p++) {
            const part = parts[p];
            if (part === '') continue;
            tokens.push({ text: part, style: runs[r].style, space: /^\s+$/.test(part) });
        }
    }
    const lines = [];
    let current = [];
    let currentWidth = 0;
    const flush = function() { if (current.length) { lines.push(current); current = []; currentWidth = 0; } };
    for (let t = 0; t < tokens.length; t++) {
        const token = tokens[t];
        const w = measureToken(ctx, token);
        if (token.space) {
            if (current.length === 0) continue; // skip leading whitespace on fresh lines
            current.push(token);
            currentWidth += w;
            continue;
        }
        if (currentWidth + w > maxWidth && current.length > 0) {
            flush();
        }
        current.push(token);
        currentWidth += measureToken(ctx, token);
    }
    flush();
    return lines;
}

function drawWrappedLine(ctx, tokens, lineX, maxWidth, align, y) {
    let end = tokens.length;
    while (end > 0 && tokens[end - 1].space) end--;
    const visible = tokens.slice(0, end);
    if (!visible.length) return;

    let totalWidth = 0;
    for (let i = 0; i < visible.length; i++) totalWidth += measureToken(ctx, visible[i]);

    let effectiveAlign = align;
    if (align === 'justify' && visible.length === 1) effectiveAlign = 'left';

    let x = lineX;
    if (effectiveAlign === 'center') x = lineX + (maxWidth - totalWidth) / 2;
    else if (effectiveAlign === 'right') x = lineX + maxWidth - totalWidth;

    const spaces = effectiveAlign === 'justify' ? visible.filter(function(t) { return t.space; }).length : 0;
    const extra = spaces > 0 ? (maxWidth - totalWidth) / spaces : 0;

    for (let i = 0; i < visible.length; i++) {
        const token = visible[i];
        setFont(ctx, token.style);
        const w = measureToken(ctx, token);
        if (token.space) {
            x += w + extra;
            continue;
        }
        ctx.fillText(token.text, x, y);
        const deco = token.style.textDecoration || 'none';
        const lineW = Math.max(1, (token.style.fontSize || 24) / 16);
        if (deco.indexOf('underline') !== -1) {
            ctx.strokeStyle = token.style.color || '#000000';
            ctx.lineWidth = lineW;
            ctx.beginPath();
            ctx.moveTo(x, y + 2);
            ctx.lineTo(x + w, y + 2);
            ctx.stroke();
        }
        if (deco.indexOf('line-through') !== -1) {
            ctx.strokeStyle = token.style.color || '#000000';
            ctx.lineWidth = lineW;
            ctx.beginPath();
            ctx.moveTo(x, y - (token.style.fontSize || 24) * 0.3);
            ctx.lineTo(x + w, y - (token.style.fontSize || 24) * 0.3);
            ctx.stroke();
        }
        x += w;
    }
}

function renderTextBox(ctx, layer) {
    const el = layer.element;
    if (!el || el.style.display === 'none') return;
    const contentEl = (el.querySelector && el.querySelector('.ss-text-content')) ? el.querySelector('.ss-text-content') : el;
    const cs = window.getComputedStyle(contentEl);
    const fontSize = parseFloat(cs.fontSize) || 24;

    const style = {
        fontFamily: cs.fontFamily || 'Arial, sans-serif',
        fontSize: fontSize,
        fontWeight: cs.fontWeight || 'normal',
        fontStyle: cs.fontStyle || 'normal',
        textDecoration: cs.textDecoration || 'none',
        color: cs.color || '#000000',
        letterSpacing: parseFloat(cs.letterSpacing) || 0,
        textTransform: cs.textTransform || 'none'
    };
    const align = cs.textAlign || 'left';
    const lineHeight = parseFloat(cs.lineHeight) || Math.round(fontSize * 1.2);

    if (!contentEl.textContent || !contentEl.textContent.trim()) return;

    const boxWidth = el.offsetWidth || (layer.size && layer.size.width) || 0;
    const boxHeight = el.offsetHeight || (layer.size && layer.size.height) || lineHeight;
    if (boxWidth <= 0) return;

    let relLeft = parseInt(el.style.left) || (layer.position && layer.position.left) || 0;
    let relTop = parseInt(el.style.top) || (layer.position && layer.position.top) || 0;
    const padLeft = el === contentEl ? (parseFloat(cs.paddingLeft) || 0) : (parseFloat(window.getComputedStyle(el).paddingLeft) || 0);
    const padTop = el === contentEl ? (parseFloat(cs.paddingTop) || 0) : (parseFloat(window.getComputedStyle(el).paddingTop) || 0);
    relLeft += padLeft;
    relTop += padTop;
    let groupRotate = 0;
    if (layer.parentGroup) {
        const groupLayer = layerState.layers.find(function(l) { return l.id === layer.parentGroup; });
        if (groupLayer && groupLayer.element) {
            relLeft += parseInt(groupLayer.element.style.left) || 0;
            relTop += parseInt(groupLayer.element.style.top) || 0;
            groupRotate = parseRotateRad(groupLayer.element.style.transform || '');
        }
    }
    const ownRotate = parseRotateRad(el.style.transform || '');

    const runs = collectRuns(contentEl, style);
    const logicalLines = splitRunsByLine(runs);
    const centerX = relLeft + boxWidth / 2;
    const centerY = relTop + boxHeight / 2;

    ctx.save();
    if (groupRotate) {
        ctx.translate(centerX, centerY);
        ctx.rotate(groupRotate);
        ctx.translate(-centerX, -centerY);
    }

    let y = relTop + Math.round(fontSize * 0.8);
    for (let li = 0; li < logicalLines.length; li++) {
        const visualLines = wrapRuns(logicalLines[li], boxWidth, ctx);
        for (let vi = 0; vi < visualLines.length; vi++) {
            const lastLine = (li === logicalLines.length - 1) && (vi === visualLines.length - 1);
            ctx.save();
            if (ownRotate) {
                ctx.translate(centerX, centerY);
                ctx.rotate(ownRotate);
                ctx.translate(-centerX, -centerY);
            }
            const effectiveAlign = (lastLine && align === 'justify') ? 'left' : align;
            drawWrappedLine(ctx, visualLines[vi], relLeft, boxWidth, effectiveAlign, y);
            ctx.restore();
            y += lineHeight;
        }
    }
    ctx.restore();
}

// ============================================================================
// ZIP WRITER (Stored, no compression, UTF-8 names)
// ============================================================================

var CRC_TABLE = (function() {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
        crc = CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(date) {
    const year = Math.max(1980, date.getFullYear());
    const time = (((date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)) & 0xFFFF);
    const dateBits = ((((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) & 0xFFFF);
    return { time: time, date: dateBits };
}

function makeZip(files) {
    const encoder = new TextEncoder();
    const now = new Date();
    const dt = dosDateTime(now);

    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (let f = 0; f < files.length; f++) {
        const file = files[f];
        const nameBytes = encoder.encode(file.name);
        const data = file.data || new Uint8Array(0);
        const crc = crc32(data);

        const local = new DataView(new ArrayBuffer(30));
        local.setUint32(0, 0x04034b50, true);
        local.setUint16(4, 20, true);
        local.setUint16(6, 0x0800, true);   // UTF-8 flag
        local.setUint16(8, 0, true);        // stored
        local.setUint16(10, dt.time, true);
        local.setUint16(12, dt.date, true);
        local.setUint32(14, crc, true);
        local.setUint32(18, data.length, true);
        local.setUint32(22, data.length, true);
        local.setUint16(26, nameBytes.length, true);
        local.setUint16(28, 0, true);
        localParts.push(new Uint8Array(local.buffer), nameBytes, data);

        const central = new DataView(new ArrayBuffer(46));
        central.setUint32(0, 0x02014b50, true);
        central.setUint16(4, 20, true);
        central.setUint16(6, 20, true);
        central.setUint16(8, 0x0800, true);
        central.setUint16(10, 0, true);
        central.setUint16(12, dt.time, true);
        central.setUint16(14, dt.date, true);
        central.setUint32(16, crc, true);
        central.setUint32(20, data.length, true);
        central.setUint32(24, data.length, true);
        central.setUint16(28, nameBytes.length, true);
        central.setUint16(30, 0, true);
        central.setUint16(32, 0, true);
        central.setUint16(34, 0, true);
        central.setUint16(36, 0, true);
        central.setUint32(38, 0, true);
        central.setUint32(42, offset, true);
        centralParts.push(new Uint8Array(central.buffer), nameBytes);

        offset += 30 + nameBytes.length + data.length;
    }

    const centralStart = offset;
    let centralSize = 0;
    for (let i = 0; i < centralParts.length; i++) centralSize += centralParts[i].length;

    const eocd = new DataView(new ArrayBuffer(22));
    eocd.setUint32(0, 0x06054b50, true);
    eocd.setUint16(4, 0, true);
    eocd.setUint16(6, 0, true);
    eocd.setUint16(8, files.length, true);
    eocd.setUint16(10, files.length, true);
    eocd.setUint32(12, centralSize, true);
    eocd.setUint32(16, centralStart, true);
    eocd.setUint16(20, 0, true);

    const all = localParts.concat(centralParts);
    let total = 22;
    for (let i = 0; i < all.length; i++) total += all[i].length;

    const out = new Uint8Array(total);
    let pos = 0;
    for (let i = 0; i < all.length; i++) {
        out.set(all[i], pos);
        pos += all[i].length;
    }
    out.set(new Uint8Array(eocd.buffer), pos);

    return new Blob([out], { type: 'application/zip' });
}

// ============================================================================
// EXPORT
// ============================================================================

export async function exportCanvasZip(filename) {
    filename = filename || ('slide_export_' + Date.now() + '.zip');

    // Render the whole canvas once, then crop from that snapshot so content
    // overlapping section borders is split exactly as it appears.
    const full = await renderFullCanvas();

    const formats = [
        { folder: '9-16 Stories', w: 1080, h: 1920 },
        { folder: '3-4 Post', w: 1080, h: 1350 },
        { folder: '1-1 Square', w: 1080, h: 1080 }
    ];
    const sections = Math.max(1, canvasState.sections || 1);

    const files = [];
    files.push({ name: 'fullsize.png', data: await canvasToBytes(full) });

    for (let fmtIndex = 0; fmtIndex < formats.length; fmtIndex++) {
        const fmt = formats[fmtIndex];
        files.push({ name: fmt.folder + '/', data: new Uint8Array(0) });
        for (let s = 0; s < sections; s++) {
            const crop = document.createElement('canvas');
            crop.width = fmt.w;
            crop.height = fmt.h;
            const cctx = crop.getContext('2d');
            const sx = s * 1080;
            const sy = (1920 - fmt.h) / 2; // centered crop within each 1080x1920 section
            cctx.drawImage(full, sx, sy, 1080, fmt.h, 0, 0, fmt.w, fmt.h);
            files.push({ name: fmt.folder + '/slide_' + (s + 1) + '.png', data: await canvasToBytes(crop) });
        }
    }

    const zip = makeZip(files);
    downloadBlob(zip, filename);
    console.log('Exported ZIP with', files.length, 'entries:', filename);
    return { sections: sections, files: files.length, filename: filename };
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
