// Shared color math for the text editor and the slide background picker.
// Pure functions only - no DOM wiring, no module state beyond the constants.
// The palette helpers sample the canvas and turn it into a row of distinct
// dominant colors plus generated intermediates, so a palette never shows the
// same color twice (no looping / padding with duplicates).
import { canvasState } from './state.js';

export const DEFAULT_PALETTE = ['#ffffff', '#121212', '#e74c3c', '#2ecc71', '#3498db'];

export const MIN_PALETTE_SIZE = 3;
export const MAX_PALETTE_SIZE = 11;

export function normalizeHex(color) {
    if (!color) return '#000000';
    color = String(color).trim();
    if (color.charAt(0) === '#') {
        if (color.length === 4) {
            return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
        }
        return color.length === 7 ? color.toLowerCase() : '#000000';
    }
    const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (m) {
        return '#' + [1, 2, 3].map(function (i) {
            return parseInt(m[i], 10).toString(16).padStart(2, '0');
        }).join('').toLowerCase();
    }
    return '#000000';
}

export function hexToRgb(hex) {
    const h = normalizeHex(hex);
    return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)];
}

export function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(function (v) {
        return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    }).join('');
}

export function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
        else if (max === g) h = ((b - r) / d + 2);
        else h = ((r - g) / d + 4);
        h /= 6;
    }
    return [h * 360, s, l];
}

export function hslToRgb(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    if (s === 0) {
        const v = Math.round(l * 255);
        return [v, v, v];
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = function (t) {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };
    return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}

export function hslToHex(h, s, l) {
    const rgb = hslToRgb(h, s, l);
    return rgbToHex(rgb[0], rgb[1], rgb[2]);
}

export function hsvToRgb(h, s, v) {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let rgb;
    if (h < 60) rgb = [c, x, 0];
    else if (h < 120) rgb = [x, c, 0];
    else if (h < 180) rgb = [0, c, x];
    else if (h < 240) rgb = [0, x, c];
    else if (h < 300) rgb = [x, 0, c];
    else rgb = [c, 0, x];
    return [Math.round((rgb[0] + m) * 255), Math.round((rgb[1] + m) * 255), Math.round((rgb[2] + m) * 255)];
}

export function hsvToHex(h, s, v) {
    const rgb = hsvToRgb(h, s, v);
    return rgbToHex(rgb[0], rgb[1], rgb[2]);
}

// Achromatic colors (white, black, grays) rotate to themselves, which would
// stack white over white. For those, the complement is the inverted
// lightness: white gets black under it, black gets white, gray gets its
// mirror gray - the pair is always visible.
export function complementOf(hex) {
    const rgb = hexToRgb(hex);
    const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    if (hsl[1] < 0.08) {
        const v = Math.round((1 - hsl[2]) * 255);
        return rgbToHex(v, v, v);
    }
    const comp = hslToRgb(hsl[0] + 180, hsl[1], hsl[2]);
    return rgbToHex(comp[0], comp[1], comp[2]);
}

export function colorDistHex(a, b) {
    const ca = hexToRgb(a), cb = hexToRgb(b);
    return Math.sqrt(Math.pow(ca[0] - cb[0], 2) + Math.pow(ca[1] - cb[1], 2) + Math.pow(ca[2] - cb[2], 2));
}

export function rgbStringToHex(cssColor) {
    if (!cssColor) return null;
    const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(cssColor);
    if (!m) return null;
    return rgbToHex(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10));
}

// ------------------------------------------------------------------
// Palette generation
// ------------------------------------------------------------------

// Midpoint blend between two hex colors (t = 0 -> a, 1 -> b).
export function blendHex(a, b, t) {
    const ca = hexToRgb(a), cb = hexToRgb(b);
    return rgbToHex(
        ca[0] + (cb[0] - ca[0]) * t,
        ca[1] + (cb[1] - ca[1]) * t,
        ca[2] + (cb[2] - ca[2]) * t
    );
}

// A lighter (positive shift) or darker (negative shift) version of a color.
export function tintShadeHex(hex, shift) {
    const rgb = hexToRgb(hex);
    const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    const l = Math.max(0.04, Math.min(0.96, hsl[2] + shift));
    return hslToHex(hsl[0], hsl[1], l);
}

// Grow a palette of real colors to exactly `want` swatches WITHOUT ever
// repeating a color: midway blends between neighboring colors first, then
// quarter blends, then tints/shades of the real colors. The real colors
// always come first and keep their order (most dominant first). A fine,
// even step ladder of tints/shades guarantees the row reaches `want` even for
// an all-white/all-black canvas (which only yields a few gray levels with a
// coarse ladder).
export function expandPalette(unique, want) {
    if (unique.length >= want) return unique.slice(0, want);
    const out = unique.slice();
    const NEAR = 20;
    const addIfNew = function (c) {
        if (out.length >= want) return true;
        if (out.some(function (p) { return colorDistHex(p, c) < NEAR; })) return false;
        out.push(c);
        return out.length >= want;
    };
    if (unique.length > 1) {
        for (let i = 0; i < unique.length && out.length < want; i++) {
            addIfNew(blendHex(unique[i], unique[(i + 1) % unique.length], 0.5));
        }
        for (let i = 0; i < unique.length && out.length < want; i++) {
            addIfNew(blendHex(unique[i], unique[(i + 1) % unique.length], 0.25));
            addIfNew(blendHex(unique[i], unique[(i + 1) % unique.length], 0.75));
        }
    }
    const shifts = [0.4, -0.4, 0.24, -0.24, 0.12, -0.12, 0.5, -0.5,
                    0.75, -0.75, 0.88, -0.88, 0.62, -0.62, 0.16, -0.16,
                    0.96, -0.96, 0.32, -0.32];
    let progress = true;
    while (out.length < want && progress) {
        progress = false;
        for (let i = 0; i < unique.length && out.length < want; i++) {
            for (let s = 0; s < shifts.length && out.length < want; s++) {
                const c = tintShadeHex(unique[i], shifts[s]);
                if (out.some(function (p) { return colorDistHex(p, c) < NEAR; })) continue;
                out.push(c);
                progress = true;
            }
        }
    }
    // A purely achromatic palette (white/black/gray canvas) has few naturally
    // distinct gray levels, so the tint ladder above can stall below `want`.
    // Fill the remainder with an even black-to-white ramp to always reach it.
    if (out.length < want && out.every(function (c) {
        const rgb = hexToRgb(c);
        return Math.abs(rgb[0] - rgb[1]) < 12 && Math.abs(rgb[1] - rgb[2]) < 12;
    })) {
        for (let i = 0; i < want && out.length < want; i++) {
            const v = Math.round((i / Math.max(1, want - 1)) * 255);
            const rampColor = rgbToHex(v, v, v);
            if (out.some(function (p) { return colorDistHex(p, rampColor) < NEAR; })) continue;
            out.push(rampColor);
        }
    }
    return out.slice(0, want);
}

// Make sure the palette is always exactly `want` swatches. Achromatic colors
// (white, black, grays) are snapped to neutral grayscale so an all-white
// canvas yields an all-white palette and an all-black canvas an all-black
// palette. The row is then filled with generated intermediate colors - never
// with repeats of an existing color.
export function padPalette(result, k) {
    const want = Math.min(MAX_PALETTE_SIZE, Math.max(MIN_PALETTE_SIZE, k || MIN_PALETTE_SIZE));
    const unique = [];
    result.forEach(function (p) {
        const rgb = hexToRgb(p);
        let c = p;
        const diff = Math.max(rgb[0], rgb[1], rgb[2]) - Math.min(rgb[0], rgb[1], rgb[2]);
        if (diff < 16) {
            const v = Math.round((rgb[0] + rgb[1] + rgb[2]) / 3);
            c = rgbToHex(v, v, v);
        }
        if (!unique.some(function (u) { return colorDistHex(u, c) < 45; })) unique.push(c);
    });
    return expandPalette(unique.length ? unique : DEFAULT_PALETTE.slice(), want);
}

export function kmeansTopK(samples, k) {
    const want = Math.min(MAX_PALETTE_SIZE, Math.max(MIN_PALETTE_SIZE, k || MIN_PALETTE_SIZE));
    if (!samples.length) return padPalette([], want);
    const K = Math.min(want, samples.length);
    const centroids = [];
    for (let c = 0; c < K; c++) {
        centroids.push(samples[Math.floor(c * (samples.length - 1) / Math.max(1, K - 1))].slice());
    }
    const assign = new Array(samples.length).fill(0);
    for (let iter = 0; iter < 8; iter++) {
        for (let i = 0; i < samples.length; i++) {
            let best = 0, bd = Infinity;
            for (let c = 0; c < K; c++) {
                const d = Math.pow(samples[i][0] - centroids[c][0], 2) + Math.pow(samples[i][1] - centroids[c][1], 2) + Math.pow(samples[i][2] - centroids[c][2], 2);
                if (d < bd) { bd = d; best = c; }
            }
            assign[i] = best;
        }
        const sums = [];
        const counts = new Array(K).fill(0);
        for (let c = 0; c < K; c++) sums.push([0, 0, 0]);
        for (let i = 0; i < samples.length; i++) {
            sums[assign[i]][0] += samples[i][0];
            sums[assign[i]][1] += samples[i][1];
            sums[assign[i]][2] += samples[i][2];
            counts[assign[i]]++;
        }
        for (let c = 0; c < K; c++) {
            if (counts[c]) {
                centroids[c] = [sums[c][0] / counts[c], sums[c][1] / counts[c], sums[c][2] / counts[c]];
            }
        }
    }
    const finalCounts = new Array(K).fill(0);
    for (let i = 0; i < assign.length; i++) finalCounts[assign[i]]++;
    const order = [];
    for (let c = 0; c < K; c++) order.push(c);
    order.sort(function (a, b) { return finalCounts[b] - finalCounts[a]; });

    const result = [];
    order.forEach(function (c) {
        const col = rgbToHex(centroids[c][0], centroids[c][1], centroids[c][2]);
        if (result.some(function (p) { return colorDistHex(p, col) < 45; })) return;
        result.push(col);
    });
    return result.length ? padPalette(result, want) : padPalette(DEFAULT_PALETTE.slice(), want);
}

// ------------------------------------------------------------------
// Canvas sampling
// ------------------------------------------------------------------

// Sample the source bitmap of every visible image at a fixed resolution and
// add it to the sample stream. Sampling reads the image's own bitmap (the
// visible crop only), never the composited canvas, so moving, scaling or
// rotating an image cannot shift the sampled colors - the palette only changes
// when the image's content actually changes (crop) or leaves the slide
// (moved off-canvas / off the slide strip entirely).
function addImageColorSamples(samples, regionLeft, regionRight, canvasH) {
    const it = window.SSImageTransform;
    if (!it || typeof it.getSampleableImages !== 'function') return;
    const images = it.getSampleableImages();
    for (let i = 0; i < images.length; i++) {
        const img = images[i];
        const aabb = img.aabb;
        const right = aabb ? aabb.left + aabb.width : 0;
        const bottom = aabb ? aabb.top + aabb.height : 0;
        if (!aabb || right <= regionLeft || aabb.left >= regionRight ||
            bottom <= 0 || aabb.top >= canvasH) continue;
        const r = img.visibleRect;
        if (!r || !img.bitmap || r.width <= 0 || r.height <= 0) continue;
        // Fixed-resolution grid over the visible crop - independent of the
        // on-canvas scale/position, so resize/move never changes the samples.
        const ratio = r.width / r.height;
        let bw, bh;
        if (ratio >= 1) { bw = 48; bh = Math.max(1, Math.round(48 / ratio)); }
        else { bh = 48; bw = Math.max(1, Math.round(48 * ratio)); }
        let c;
        try {
            c = document.createElement('canvas');
            c.width = bw;
            c.height = bh;
            const ctx = c.getContext('2d');
            ctx.drawImage(img.bitmap, r.x, r.y, r.width, r.height, 0, 0, bw, bh);
        } catch (e) { continue; }
        let data;
        try { data = c.getContext('2d').getImageData(0, 0, bw, bh).data; }
        catch (e) { continue; }
        for (let p = 0; p < data.length; p += 4) {
            if (data[p + 3] <= 40) continue;
            let rr = data[p], gg = data[p + 1], bb = data[p + 2];
            if (img.grayscale) {
                const gv = Math.round(0.299 * rr + 0.587 * gg + 0.114 * bb);
                rr = gg = bb = gv;
            }
            samples.push([rr, gg, bb]);
        }
    }
}

// Each visible text box contributes a fixed number of samples of its color, so
// resizing or moving a box (while it stays on the slide) does not change how
// it is weighted. Boxes moved entirely off the slide are skipped.
function addTextColorSamples(samples, slideIndex, slideW, slideH) {
    const designerCanvas = document.getElementById('ss-designer-canvas');
    if (!designerCanvas || !samples) return;
    const boxes = designerCanvas.querySelectorAll('.ss-text2-element');
    if (!boxes.length) return;
    const sections = Math.max(1, canvasState.sections || 1);
    const idx = Math.max(0, Math.min(slideIndex, sections - 1));
    // The visible region of this slide in canvas coordinates. Text boxes that
    // were moved entirely outside it (off the slide, cropped away by another
    // slide's bounds) must not leak their color into the palette.
    const regionLeft = idx * slideW;
    const regionRight = regionLeft + slideW;
    const regionTop = 0;
    const regionBottom = slideH;
    const perBox = 16;
    for (let i = 0; i < boxes.length; i++) {
        const box = boxes[i];
        const cs = window.getComputedStyle(box);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const contentEl = box.querySelector('.ss-text-content') || box;
        const hex = rgbStringToHex(window.getComputedStyle(contentEl).color);
        if (!hex) continue;
        const left = parseFloat(box.style.left) || 0;
        const top = parseFloat(box.style.top) || 0;
        const boxW = parseFloat(box.style.width) || 0;
        const boxH = parseFloat(box.style.height) || 0;
        if (boxW <= 0 || boxH <= 0) continue;
        // Skip boxes fully outside the visible slide region.
        if (left + boxW <= regionLeft || left >= regionRight ||
            top + boxH <= regionTop || top >= regionBottom) continue;
        const rgb = hexToRgb(hex);
        for (let j = 0; j < perBox; j++) samples.push(rgb.slice());
    }
}

// Raw [r, g, b] samples of one slide: the designer canvas background plus the
// images and text boxes that sit on the slide, all sampled geometry-invariantly.
function sampleSlidePixels(slideIndex) {
    const W = Math.max(1, Math.round(canvasState.width));
    const H = Math.max(1, Math.round(canvasState.height));
    const sections = Math.max(1, canvasState.sections || 1);
    const slideW = W / sections;
    const regionLeft = Math.min(slideIndex, sections - 1) * slideW;
    const regionRight = regionLeft + slideW;

    const samples = [];
    const designerCanvas = document.getElementById('ss-designer-canvas');
    const bgHex = (designerCanvas && designerCanvas.style.backgroundColor) || '#ffffff';
    const bgRgb = hexToRgb(bgHex);
    // Fixed background sample count so the canvas background always has a
    // presence regardless of how much of the slide the images happen to cover.
    for (let i = 0; i < 64; i++) samples.push(bgRgb.slice());
    addImageColorSamples(samples, regionLeft, regionRight, H);
    addTextColorSamples(samples, slideIndex, slideW, H);
    return samples;
}

// slideIndex: -1 = aggregate of every slide, otherwise a 0-based slide number.
// k = how many dominant colors to return (clamped to 3..11).
export function sampleCanvasColors(slideIndex, k) {
    try {
        const sections = Math.max(1, canvasState.sections || 1);
        if (typeof slideIndex === 'number' && slideIndex >= 0) {
            return kmeansTopK(sampleSlidePixels(Math.min(slideIndex, sections - 1)), k);
        }
        // Aggregate: pool the samples of every slide so a dominant color on
        // ANY slide (an image or text box) shows up in the overall palette.
        const pooled = [];
        for (let s = 0; s < sections; s++) {
            const slice = sampleSlidePixels(s);
            for (let i = 0; i < slice.length; i++) pooled.push(slice[i]);
        }
        // Sort the pooled stream so the result is order-independent: kmeans
        // seeds its centroids from evenly spaced indices, so a stable order
        // makes the palette depend only on which colors are present on the
        // canvas - not on which slide order they happen to be sampled in.
        pooled.sort(function (a, b) {
            return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
        });
        return kmeansTopK(pooled, k);
    } catch (e) {
        return padPalette(DEFAULT_PALETTE.slice(), k);
    }
}
