// Background color picker - a standalone color panel in the Slide Management
// sidebar section. It replaces the old native color input with the full
// smart-color UI (canvas palette with complements + Spectrum/Grid/Sliders
// carousel + hex input + eyedropper), but it is implemented as its own
// function/module with its own DOM refs and state, so it never shares any
// state with the text editor's color panel.
//
// The canvas palette aggregates dominant colors across every slide (the "All
// Slides" view) or shows one slide's colors once a slide is picked with the
// nav arrows. Clicking a swatch applies it as the canvas background; hovering
// previews it live without touching the undo history.
import { canvasState } from './state.js';
import { updateCanvasColor } from './layers.js';
import {
    normalizeHex, hexToRgb, rgbToHex, rgbToHsl, hslToHex,
    hsvToHex, complementOf, sampleCanvasColors,
    MIN_PALETTE_SIZE, MAX_PALETTE_SIZE
} from './color-utils.js';

const CAROUSEL_PAGES = ['spectrum', 'grid', 'sliders'];
const CAROUSEL_TITLES = {
    spectrum: 'Spectrum',
    grid: 'Grid',
    sliders: 'Sliders'
};
const COLOR_HUES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
const COLOR_LIGHTNESS = [0.86, 0.7, 0.55, 0.4, 0.25];

let refs = null;
let initialized = false;
let refreshQueued = false;

const state = {
    color: '#ffffff',
    committed: '#ffffff',
    slideIndex: -1,
    paletteSize: 5,
    carouselIndex: 0
};

function clamp01(v) {
    return Math.max(0, Math.min(1, v));
}

function currentRgb() {
    return hexToRgb(state.color);
}

function currentHsl() {
    const rgb = currentRgb();
    return rgbToHsl(rgb[0], rgb[1], rgb[2]);
}

function pos(marker, leftPct, topPct) {
    if (!marker) return;
    marker.style.left = leftPct + '%';
    marker.style.top = topPct + '%';
}

// Apply a color: preview on the canvas live (commit = false) or apply it to
// the history + separator colors as well (commit = true).
function setColor(hex, commit) {
    const c = normalizeHex(hex);
    state.color = c;
    const designerCanvas = document.getElementById('ss-designer-canvas');
    if (designerCanvas) designerCanvas.style.backgroundColor = c;
    syncControls();
    if (commit) {
        state.committed = c;
        updateCanvasColor(c);
        refreshBackgroundPalette();
    }
}

function commitCurrent() {
    setColor(state.color, true);
}

function syncHex() {
    if (refs.hex && refs.hex.value.toLowerCase() !== state.color) refs.hex.value = state.color;
}

function syncControls() {
    syncHex();
    renderCarousel();
}

function renderNav() {
    if (!refs) return;
    const sections = Math.max(1, canvasState.sections || 1);
    state.slideIndex = Math.max(-1, Math.min(state.slideIndex, sections - 1));
    const name = state.slideIndex === -1 ? 'All Slides' : 'Slide ' + (state.slideIndex + 1);
    if (refs.canvasName) {
        refs.canvasName.textContent = name;
        refs.canvasName.title = name;
        refs.canvasName.setAttribute('aria-label', name);
    }
    if (refs.canvasPrev) refs.canvasPrev.disabled = state.slideIndex <= -1;
    if (refs.canvasNext) refs.canvasNext.disabled = state.slideIndex >= sections - 1;
}

function buildPalette(slideIndex, k) {
    const colors = sampleCanvasColors(slideIndex, k);
    return { top: colors, bottom: colors.map(complementOf) };
}

function fillRow(container, colors) {
    container.innerHTML = '';
    colors.forEach(function (c) {
        const sw = document.createElement('button');
        sw.type = 'button';
        sw.className = 'ss-text2-swatch';
        sw.dataset.color = c;
        sw.style.background = c;
        sw.title = c;
        sw.setAttribute('aria-label', c);
        sw.addEventListener('mouseenter', function () { setColor(c, false); });
        sw.addEventListener('mouseleave', function () { setColor(state.committed, false); });
        sw.addEventListener('click', function () { setColor(c, true); });
        container.appendChild(sw);
    });
}

function renderCanvasPalette() {
    if (!refs || !refs.paletteMain || !refs.paletteSub) return;
    const pal = buildPalette(state.slideIndex, state.paletteSize);
    fillRow(refs.paletteMain, pal.top);
    fillRow(refs.paletteSub, pal.bottom);
    if (refs.palettePlus) refs.palettePlus.disabled = state.paletteSize >= MAX_PALETTE_SIZE;
    if (refs.paletteMinus) refs.paletteMinus.disabled = state.paletteSize <= MIN_PALETTE_SIZE;
}

function renderCarousel() {
    if (!refs || !refs.pages) return;
    const n = CAROUSEL_PAGES.length;
    state.carouselIndex = ((state.carouselIndex % n) + n) % n;
    const children = refs.pages.children;
    for (let i = 0; i < children.length; i++) {
        children[i].classList.toggle('ss-text2-color-page--active', i === state.carouselIndex);
    }
    const page = CAROUSEL_PAGES[state.carouselIndex];
    if (refs.carTitle) refs.carTitle.textContent = CAROUSEL_TITLES[page];
    if (page === 'spectrum') renderSpectrum();
    else if (page === 'grid') renderGrid();
    else renderSliders();
}

function renderSpectrum() {
    if (!refs.spectrumSv) return;
    const hsl = currentHsl();
    const h = hsl[0], s = hsl[1], l = hsl[2];
    const v = l + s * Math.min(l, 1 - l);
    refs.spectrumSv.style.backgroundColor = hslToHex(h, 1, 0.5);
    refs.spectrumSv.style.backgroundImage = 'linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0))';
    pos(refs.spectrumSvMarker, s * 100, (1 - v) * 100);
    pos(refs.spectrumHueMarker, (h / 360) * 100, 50);
}

function svFromEvent(e) {
    if (!refs.spectrumSv) return;
    const rect = refs.spectrumSv.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const s = clamp01((e.clientX - rect.left) / rect.width);
    const v = clamp01(1 - (e.clientY - rect.top) / rect.height);
    const h = currentHsl()[0];
    setColor(hsvToHex(h, s, v), false);
}

function hueFromEvent(e) {
    if (!refs.spectrumHue) return;
    const rect = refs.spectrumHue.getBoundingClientRect();
    if (!rect.width) return;
    const h = clamp01((e.clientX - rect.left) / rect.width) * 360;
    const hsl = currentHsl();
    setColor(hslToHex(h, hsl[1], hsl[2]), false);
}

function bindSpectrum() {
    if (!refs.spectrumSv || !refs.spectrumHue) return;
    let svDrag = false;
    let hueDrag = false;
    const svMove = function (e) { if (svDrag) svFromEvent(e); };
    const svUp = function () {
        if (!svDrag) return;
        svDrag = false;
        document.removeEventListener('pointermove', svMove);
        document.removeEventListener('pointerup', svUp);
        commitCurrent();
    };
    const hueMove = function (e) { if (hueDrag) hueFromEvent(e); };
    const hueUp = function () {
        if (!hueDrag) return;
        hueDrag = false;
        document.removeEventListener('pointermove', hueMove);
        document.removeEventListener('pointerup', hueUp);
        commitCurrent();
    };
    refs.spectrumSv.addEventListener('pointerdown', function (e) {
        svDrag = true;
        svFromEvent(e);
        document.addEventListener('pointermove', svMove);
        document.addEventListener('pointerup', svUp);
    });
    refs.spectrumHue.addEventListener('pointerdown', function (e) {
        hueDrag = true;
        hueFromEvent(e);
        document.addEventListener('pointermove', hueMove);
        document.addEventListener('pointerup', hueUp);
    });
}

function attachSwatchPreview(sw, c) {
    sw.addEventListener('mouseenter', function () { setColor(c, false); });
    sw.addEventListener('mouseleave', function () { setColor(state.committed, false); });
    sw.addEventListener('click', function () { setColor(c, true); });
}

function renderGrid() {
    if (!refs.swatches) return;
    refs.swatches.innerHTML = '';
    COLOR_LIGHTNESS.forEach(function (l) {
        const row = document.createElement('div');
        row.className = 'ss-text2-color-row';
        COLOR_HUES.forEach(function (h) {
            const c = hslToHex(h, 0.62, l);
            const sw = document.createElement('button');
            sw.type = 'button';
            sw.className = 'ss-text2-swatch ss-text2-swatch--color';
            sw.dataset.color = c;
            sw.style.background = c;
            sw.title = c;
            sw.setAttribute('aria-label', c);
            attachSwatchPreview(sw, c);
            row.appendChild(sw);
        });
        refs.swatches.appendChild(row);
    });
    const ramp = document.createElement('div');
    ramp.className = 'ss-text2-color-row';
    for (let i = 0; i <= 8; i++) {
        const v = Math.round((i / 8) * 255);
        const c = rgbToHex(v, v, v);
        const sw = document.createElement('button');
        sw.type = 'button';
        sw.className = 'ss-text2-swatch ss-text2-swatch--color';
        sw.dataset.color = c;
        sw.style.background = c;
        sw.title = c;
        sw.setAttribute('aria-label', c);
        attachSwatchPreview(sw, c);
        ramp.appendChild(sw);
    }
    refs.swatches.appendChild(ramp);
}

function buildSliders() {
    if (!refs.sliders) return;
    refs.sliders.innerHTML = '';
    ['R', 'G', 'B'].forEach(function (ch) {
        const row = document.createElement('div');
        row.className = 'ss-text2-slider-row';
        const label = document.createElement('label');
        label.textContent = ch;
        const input = document.createElement('input');
        input.type = 'range';
        input.min = '0';
        input.max = '255';
        input.step = '1';
        input.dataset.channel = ch;
        const val = document.createElement('span');
        val.className = 'ss-text2-slider-val';
        input.addEventListener('input', function () {
            const r = parseInt(refs.sliders.querySelector('[data-channel="R"]').value, 10) || 0;
            const g = parseInt(refs.sliders.querySelector('[data-channel="G"]').value, 10) || 0;
            const b = parseInt(refs.sliders.querySelector('[data-channel="B"]').value, 10) || 0;
            setColor(rgbToHex(r, g, b), true);
        });
        row.appendChild(label);
        row.appendChild(input);
        row.appendChild(val);
        refs.sliders.appendChild(row);
    });
}

function renderSliders() {
    if (!refs.sliders) return;
    if (!refs.sliders.childElementCount) buildSliders();
    const rgb = currentRgb();
    const inputs = refs.sliders.querySelectorAll('input[type="range"]');
    const vals = refs.sliders.querySelectorAll('.ss-text2-slider-val');
    if (inputs.length === 3) {
        inputs[0].value = rgb[0];
        inputs[1].value = rgb[1];
        inputs[2].value = rgb[2];
    }
    if (vals.length === 3) {
        vals[0].textContent = rgb[0];
        vals[1].textContent = rgb[1];
        vals[2].textContent = rgb[2];
    }
    if (refs.sliderPreview) {
        refs.sliderPreview.style.background = state.color;
        refs.sliderPreview.dataset.color = state.color;
        refs.sliderPreview.title = state.color;
    }
    if (refs.sliderHex) refs.sliderHex.textContent = state.color;
}

function pickScreenColor() {
    if (window.EyeDropper) {
        try {
            const dropper = new window.EyeDropper();
            dropper.open().then(function (result) {
                if (result && result.sRGBHex) setColor(normalizeHex(result.sRGBHex), true);
            }).catch(function () {});
            return;
        } catch (e) {}
    }
    if (refs.hex) refs.hex.focus();
}

function bindHex() {
    if (!refs.hex) return;
    refs.hex.addEventListener('input', function () {
        let v = this.value.replace('#', '');
        v = v.replace(/[^0-9A-F]/gi, '');
        if (v.length > 6) v = v.substring(0, 6);
        this.value = v;
        if (v.length === 3 || v.length === 6) {
            setColor('#' + v, true);
        }
    });
    refs.hex.addEventListener('blur', function () {
        let v = this.value.replace('#', '');
        if (v === '') v = 'ffffff';
        else if (v.length === 3) v = v.split('').map(function (ch) { return ch + ch; }).join('');
        else if (v.length !== 6) v = v.padEnd(6, '0').substring(0, 6);
        this.value = v;
        setColor('#' + v, true);
    });
}

function bindEvents() {
    if (refs.canvasPrev) {
        refs.canvasPrev.addEventListener('click', function () {
            state.slideIndex--;
            renderNav();
            renderCanvasPalette();
        });
    }
    if (refs.canvasNext) {
        refs.canvasNext.addEventListener('click', function () {
            state.slideIndex++;
            renderNav();
            renderCanvasPalette();
        });
    }
    if (refs.palettePlus) {
        refs.palettePlus.addEventListener('click', function () {
            state.paletteSize = Math.min(MAX_PALETTE_SIZE, state.paletteSize + 1);
            renderCanvasPalette();
        });
    }
    if (refs.paletteMinus) {
        refs.paletteMinus.addEventListener('click', function () {
            state.paletteSize = Math.max(MIN_PALETTE_SIZE, state.paletteSize - 1);
            renderCanvasPalette();
        });
    }
    if (refs.carPrev) {
        refs.carPrev.addEventListener('click', function () {
            state.carouselIndex--;
            renderCarousel();
        });
    }
    if (refs.carNext) {
        refs.carNext.addEventListener('click', function () {
            state.carouselIndex++;
            renderCarousel();
        });
    }
    if (refs.pipette) refs.pipette.addEventListener('click', pickScreenColor);
    bindHex();
    bindSpectrum();
}

// Any canvas change that re-draws the image canvas also refreshes the
// background palette (image moves, flips, filters, slide add/remove...).
function wrapImageDraw() {
    if (window.SSImageTransform && typeof window.SSImageTransform.draw === 'function') {
        const orig = window.SSImageTransform.draw;
        window.SSImageTransform.draw = function () {
            const res = orig.apply(this, arguments);
            refreshBackgroundPalette();
            return res;
        };
    }
}

function renderAll() {
    renderNav();
    renderCanvasPalette();
    renderCarousel();
    syncHex();
}

export function initializeBackgroundColorPicker() {
    if (initialized) return;
    initialized = true;

    const designerCanvas = document.getElementById('ss-designer-canvas');
    state.color = state.committed = normalizeHex(
        (designerCanvas && designerCanvas.style.backgroundColor) || '#ffffff'
    );

    refs = {
        panel: document.getElementById('ss-bgColorPanel'),
        hex: document.getElementById('ss-bgColorHex'),
        pipette: document.getElementById('ss-bgPipette'),
        canvasPrev: document.getElementById('ss-bgCanvasPrev'),
        canvasNext: document.getElementById('ss-bgCanvasNext'),
        canvasName: document.getElementById('ss-bgCanvasName'),
        paletteMain: document.getElementById('ss-bgPaletteMain'),
        paletteSub: document.getElementById('ss-bgPaletteSub'),
        palettePlus: document.getElementById('ss-bgPalettePlus'),
        paletteMinus: document.getElementById('ss-bgPaletteMinus'),
        carPrev: document.getElementById('ss-bgCarPrev'),
        carNext: document.getElementById('ss-bgCarNext'),
        carTitle: document.getElementById('ss-bgCarTitle'),
        pages: document.getElementById('ss-bgColorPages'),
        spectrumSv: document.getElementById('ss-bgSpectrumSv'),
        spectrumSvMarker: document.getElementById('ss-bgSpectrumSvMarker'),
        spectrumHue: document.getElementById('ss-bgSpectrumHue'),
        spectrumHueMarker: document.getElementById('ss-bgSpectrumHueMarker'),
        swatches: document.getElementById('ss-bgColorSwatches'),
        sliders: document.getElementById('ss-bgSliders'),
        sliderPreview: document.getElementById('ss-bgSliderPreview'),
        sliderHex: document.getElementById('ss-bgSliderHex')
    };
    if (!refs.panel) return;

    bindEvents();
    renderAll();
    wrapImageDraw();
}

export function refreshBackgroundPalette() {
    if (!refs) return;
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(function () {
        refreshQueued = false;
        renderNav();
        renderCanvasPalette();
        renderCarousel();
    });
}
window.refreshBackgroundPalette = refreshBackgroundPalette;

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeBackgroundColorPicker);
} else {
    initializeBackgroundColorPicker();
}
