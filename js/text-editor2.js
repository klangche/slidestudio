// Text Editor - a self-contained text editor. Text added here:
//   - acts exactly like an image on the canvas (drag, corner-resize, rotate,
//     edge handles crop the box without reflowing the text)
//   - opens this editor on double-click (or via the "Add Text" button when selected)
//   - lets you pick ANY Google Font by typing its name (loaded via the Google Fonts css2 API)
//   - "Poster" formatting: every row ends up exactly as wide as the widest row
//     (multi-word rows scale their font size, a single word without spaces gets
//     letter spacing between the letters - nothing is ever hidden or cut)
//   - smart color: eyedropper pipette, hex input, and an always-visible
//     color panel with a palette of the 5 dominant canvas colors and their
//     5 complements (greyscale ramp when the canvas is only black & white)
//     plus Spectrum, Grid and Sliders selectors that all stay in step
//   - recents-first font list (last used fonts are pinned to the top)
//   - all text tools live in one compact toolbar row
//   - a live preview panel under the writing box that always shows the exact
//     poster layout, so the editor always looks like the final text
//
// Everything here uses ss-text2-* ids/classes so the popup never collides
// with the rest of the app.
import { layerState, canvasState } from './state.js';
import {
    MIN_PALETTE_SIZE, MAX_PALETTE_SIZE,
    normalizeHex, hexToRgb, rgbToHex, rgbToHsl, hslToRgb, hslToHex,
    hsvToHex, complementOf, sampleCanvasColors
} from './color-utils.js';

(function () {
    'use strict';

    // ------------------------------------------------------------------
    // DOM refs
    // ------------------------------------------------------------------
    let popup, overlay, closeBtn, title;
    let editablePreview, editableAnchor;
    let slideNav, slidePrev, slideNext, slideLabel;
    let fontBtn, fontLabel, fontDropdown, fontSearch, fontList, fontRecent;
    let weightSelect;
    let colorHex;
    let pipetteBtn, equalWidthBtn;
    let colorPages, carPrev, carNext, carTitle;
    let paletteMain, paletteSub, palettePlus, paletteMinus, canvasPrev, canvasNext, canvasName;
    let spectrumSv, spectrumSvMarker, spectrumHue, spectrumHueMarker;
    let colorSwatches, sliders, sliderPreview, sliderHex;
    let cancelBtn, applyBtn;
    let addText2Btn = null;

    let editingTextBox = null;
    let editingSlideIndex = 0;
    let lastActiveElement = null;
    let fontDropdownOpen = false;
    let carouselIndex = 0;
    let canvasSlideIndex = 0;
    let paletteSize = 5;
    let committedColor = '#121212';
    let initialized = false;

    const loadedFontLinks = new Set();
    let measEl = null;

    function getMeasEl() {
        if (!measEl) {
            measEl = document.createElement('span');
            measEl.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre;';
            document.body.appendChild(measEl);
        }
        return measEl;
    }

    // ------------------------------------------------------------------
    // Defaults / state
    // ------------------------------------------------------------------
    const DEFAULT_FONT = 'Trebuchet MS';
    const BASE_CANVAS_WIDTH = 1080;
    const BASE_CANVAS_HEIGHT = 1920;
    const MAX_TEXT_WIDTH = 1080;
    const RECENT_KEY = 'ss_text2_fonts';
    const MAX_RECENT = 8;
    // Poster rows are packed tight: nearly touching, so more rows fit.
    const POSTER_LINE_HEIGHT = 0.82;

    const editor = {
        text: '',
        lines: [],
        font: DEFAULT_FONT,
        fontSize: 48,
        color: '#121212',
        fontWeight: 'normal',
        fontStyle: 'normal',
        textDecoration: 'none',
        textTransform: 'none',
        textAlign: 'center',
        letterSpacing: 0,
        lineHeight: 1.2,
        equalWidth: false
    };

    const SYSTEM_FONTS = [
        'Arial', 'Trebuchet MS', 'Times New Roman', 'Georgia', 'Verdana',
        'Tahoma', 'Courier New', 'Impact', 'Gill Sans', 'Comic Sans MS'
    ];

    // Curated popular Google Fonts (any of these loads instantly on pick; a
    // custom search can load every other Google Font too).
    const GOOGLE_FONTS = [
        'Inter', 'Roboto', 'Open Sans', 'Lato', 'Montserrat', 'Poppins', 'Nunito',
        'Raleway', 'Work Sans', 'Source Sans Pro', 'Noto Sans', 'Oswald', 'Bebas Neue',
        'Anton', 'Jost', 'Manrope', 'Sora', 'Outfit', 'Space Grotesk', 'Archivo',
        'Playfair Display', 'Merriweather', 'Lora', 'EB Garamond', 'Cormorant Garamond',
        'Bitter', 'PT Serif', 'Crimson Text', 'Fraunces', 'Libre Baskerville',
        'Pacifico', 'Lobster', 'Caveat', 'Dancing Script', 'Shadows Into Light',
        'Satisfy', 'Righteous', 'Luckiest Guy', 'Bangers', 'Fredoka One',
        'Sigmar One', 'Permanent Marker', 'Amatic SC', 'Kalam', 'Sriracha',
        'Gloria Hallelujah', 'Patrick Hand', 'Indie Flower', 'Cherry Bomb One',
        'JetBrains Mono', 'Space Mono', 'Fira Mono', 'IBM Plex Mono', 'Rubik Mono One',
        'Frijole', 'Splash', 'Mogra', 'Streetwear', 'BlowBrush', 'Graffonti', 'Trashhand', 'Urban Jungle'
    ];

    // ------------------------------------------------------------------
    // Init
    // ------------------------------------------------------------------
    function init() {
        if (initialized) return;
        initialized = true;

        popup = document.getElementById('ss-text2Popup');
        overlay = document.getElementById('ss-text2Overlay');
        closeBtn = document.getElementById('ss-text2Close');
        title = document.getElementById('ss-text2Title');
        editablePreview = document.getElementById('ss-text2EditablePreview');
        editableAnchor = document.getElementById('ss-text2EditableAnchor');
        slideNav = document.getElementById('ss-text2SlideNav');
        slidePrev = document.getElementById('ss-text2SlidePrev');
        slideNext = document.getElementById('ss-text2SlideNext');
        slideLabel = document.getElementById('ss-text2SlideLabel');
        fontBtn = document.getElementById('ss-text2FontBtn');
        fontLabel = document.getElementById('ss-text2FontLabel');
        fontDropdown = document.getElementById('ss-text2FontDropdown');
        fontSearch = document.getElementById('ss-text2FontSearch');
        fontList = document.getElementById('ss-text2FontList');
        fontRecent = document.getElementById('ss-text2FontRecent');
        weightSelect = document.getElementById('ss-text2Weight');
        colorHex = document.getElementById('ss-text2ColorHex');
        pipetteBtn = document.getElementById('ss-text2Pipette');
        equalWidthBtn = document.getElementById('ss-text2EqualWidth');
        colorPages = document.getElementById('ss-text2ColorPages');
        carPrev = document.getElementById('ss-text2CarPrev');
        carNext = document.getElementById('ss-text2CarNext');
        carTitle = document.getElementById('ss-text2CarTitle');
        paletteMain = document.getElementById('ss-text2PaletteMain');
        paletteSub = document.getElementById('ss-text2PaletteSub');
        palettePlus = document.getElementById('ss-text2PalettePlus');
        paletteMinus = document.getElementById('ss-text2PaletteMinus');
        canvasPrev = document.getElementById('ss-text2CanvasPrev');
        canvasNext = document.getElementById('ss-text2CanvasNext');
        canvasName = document.getElementById('ss-text2CanvasName');
        spectrumSv = document.getElementById('ss-text2SpectrumSv');
        spectrumSvMarker = document.getElementById('ss-text2SpectrumSvMarker');
        spectrumHue = document.getElementById('ss-text2SpectrumHue');
        spectrumHueMarker = document.getElementById('ss-text2SpectrumHueMarker');
        colorSwatches = document.getElementById('ss-text2ColorSwatches');
        sliders = document.getElementById('ss-text2Sliders');
        sliderPreview = document.getElementById('ss-text2SliderPreview');
        sliderHex = document.getElementById('ss-text2SliderHex');
        cancelBtn = document.getElementById('ss-text2Cancel');
        applyBtn = document.getElementById('ss-text2Apply');

        if (!popup) return;

        overlay.addEventListener('click', close);
        closeBtn.addEventListener('click', close);
        cancelBtn.addEventListener('click', close);
        popup.addEventListener('click', function (e) { if (e.target === popup) close(); });

        document.addEventListener('keydown', function (e) {
            if (!popup || popup.style.display === 'none') return;
            if (e.key === 'Escape') { e.preventDefault(); close(); return; }
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleApply();
            }
        });

        if (editableAnchor) {
            editableAnchor.addEventListener('input', function (e) {
                if (e && e.isComposing) return;
                rebuildLinesFromText();
                renderContentAndPreview();
            });
            editableAnchor.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    splitEditableLine();
                } else if (e.key === 'Escape') {
                    e.stopPropagation();
                }
            });
            editableAnchor.addEventListener('paste', handleEditablePaste);
        }

        if (editablePreview) {
            editablePreview.addEventListener('mousedown', function (e) {
                if (!editableAnchor) return;
                if (editableAnchor === e.target || editableAnchor.contains(e.target)) return;
                e.preventDefault();
                editableAnchor.focus();
                const divs = Array.prototype.slice.call(editableAnchor.querySelectorAll(':scope > .ss-text2-line'));
                const line = divs.length ? divs.length - 1 : 0;
                const offset = divs.length ? (divs[line].textContent || '').length : 0;
                setEditableCaretPosition(editableAnchor, { line: line, offset: offset });
            });
        }

        if (slidePrev) slidePrev.addEventListener('click', function () { navigateSlide(-1); });
        if (slideNext) slideNext.addEventListener('click', function () { navigateSlide(1); });

        if (weightSelect) {
            weightSelect.addEventListener('change', function () {
                editor.fontWeight = weightSelect.value;
                loadGoogleFont(editor.font, weightSelect.value);
                renderContentAndPreview();
            });
        }

        if (colorHex) {
            colorHex.addEventListener('input', function () {
                let hex = colorHex.value.trim();
                if (!hex.startsWith('#')) hex = '#' + hex;
                if (/^#[0-9a-fA-F]{6}$/.test(hex)) applyBase({ color: normalizeHex(hex) });
            });
            colorHex.addEventListener('blur', function () {
                const hex = normalizeHex(colorHex.value.trim());
                applyBase({ color: hex });
            });
        }

        if (pipetteBtn) pipetteBtn.addEventListener('click', pickScreenColor);
        if (carPrev) carPrev.addEventListener('click', function (e) {
            e.stopPropagation();
            carouselIndex -= 1;
            renderCarousel();
        });
        if (carNext) carNext.addEventListener('click', function (e) {
            e.stopPropagation();
            carouselIndex += 1;
            renderCarousel();
        });
        if (canvasPrev) canvasPrev.addEventListener('click', function (e) {
            e.stopPropagation();
            canvasSlideIndex -= 1;
            renderCanvasSection();
        });
        if (canvasNext) canvasNext.addEventListener('click', function (e) {
            e.stopPropagation();
            canvasSlideIndex += 1;
            renderCanvasSection();
        });
        if (palettePlus) palettePlus.addEventListener('click', function (e) {
            e.stopPropagation();
            changePaletteSize(1);
        });
        if (paletteMinus) paletteMinus.addEventListener('click', function (e) {
            e.stopPropagation();
            changePaletteSize(-1);
        });
        if (equalWidthBtn) equalWidthBtn.addEventListener('click', function () {
            editor.equalWidth = !editor.equalWidth;
            updateEqualWidthButton();
            renderContentAndPreview();
        });

        if (spectrumSv) spectrumSv.addEventListener('pointerdown', function (e) {
            e.preventDefault();
            svDragging = true;
            svColorFromEvent(e);
            document.addEventListener('pointermove', svMove);
            document.addEventListener('pointerup', svUp);
        });
        if (spectrumHue) spectrumHue.addEventListener('pointerdown', function (e) {
            e.preventDefault();
            hueDragging = true;
            hueFromEvent(e);
            document.addEventListener('pointermove', hueMove);
            document.addEventListener('pointerup', hueUp);
        });

        if (sliderPreview) attachBigSwatch(sliderPreview);

        const toolbar = document.getElementById('ss-text2Toolbar');
        if (toolbar) {
            toolbar.querySelectorAll('.ss-text2-tool[data-style]').forEach(function (btn) {
                btn.addEventListener('click', function () { toggleStyle(btn.dataset.style); });
            });
        }

        fontBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            toggleFontDropdown();
        });
        fontSearch.addEventListener('input', function () { renderFontList(fontSearch.value); });
        fontSearch.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const q = fontSearch.value.trim();
                if (q) applyFontByName(q);
            }
        });
        document.addEventListener('click', function (e) {
            if (fontDropdownOpen) {
                if (!fontDropdown.contains(e.target) && !fontBtn.contains(e.target)) {
                    closeFontDropdown();
                }
            }
        });

        applyBtn.addEventListener('click', handleApply);

        addText2Btn = document.getElementById('ss-addTextBtn');
        if (addText2Btn) {
            addText2Btn.addEventListener('click', function () {
                if (layerState.layers.length >= layerState.maxLayers) {
                    alert('Maximum number of layers reached (' + layerState.maxLayers + '). Please remove some elements before adding more.');
                    return;
                }
                const selected = getSelectedText2Element();
                if (selected) open(selected); else open();
            });
        }
        updateAddTextButton();

        const designerCanvas = document.getElementById('ss-designer-canvas');
        if (designerCanvas) {
            designerCanvas.addEventListener('dblclick', function (e) {
                const el = e.target && e.target.closest ? e.target.closest('.ss-text2-element') : null;
                if (el) {
                    e.preventDefault();
                    e.stopPropagation();
                    open(el);
                }
            });
        }

        renderFontList('');
        applyPreview();
    }

    // ------------------------------------------------------------------
    // Font catalog / Google Font loading / recents
    // ------------------------------------------------------------------
    const WEIGHT_OPTIONS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

    function fontUrl(name) {
        return 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(name).replace(/%20/g, '+') + '&display=swap';
    }

    function loadGoogleFont(name, weight) {
        if (!name) return;
        const w = (weight !== undefined && weight !== null && weight !== '') ? String(weight) : String(editor.fontWeight || 'normal');
        const wantsAllWeights = (w !== 'normal' && w !== 'bold') || name;
        let url;
        if (wantsAllWeights) {
            url = 'https://fonts.googleapis.com/css2?family=' + encodeURIComponent(name).replace(/%20/g, '+') +
                ':wght@' + WEIGHT_OPTIONS.join(';') + '&display=swap';
        } else {
            url = fontUrl(name);
        }
        if (loadedFontLinks.has(url)) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = url;
        document.head.appendChild(link);
        loadedFontLinks.add(url);
    }

    function allFonts() {
        return SYSTEM_FONTS.concat(GOOGLE_FONTS);
    }

    function getRecentFonts() {
        try {
            const arr = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
            if (!Array.isArray(arr)) return [];
            return arr
                .filter(function (r) { return r && typeof r.name === 'string'; })
                .sort(function (a, b) { return (b.ts || 0) - (a.ts || 0); })
                .map(function (r) { return r.name; });
        } catch (e) { return []; }
    }

    function pushRecentFont(name) {
        try {
            const arr = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
            if (!Array.isArray(arr)) return;
            const filtered = arr.filter(function (r) { return !r || r.name !== name; });
            filtered.unshift({ name: name, ts: Date.now() });
            localStorage.setItem(RECENT_KEY, JSON.stringify(filtered.slice(0, MAX_RECENT)));
        } catch (e) {}
    }

    function renderRecentFonts() {
        if (!fontRecent) return;
        fontRecent.innerHTML = '';
        const recents = getRecentFonts();
        if (!recents.length) return;
        const title = document.createElement('div');
        title.className = 'ss-text2-font-recent-title';
        title.textContent = 'Recent';
        fontRecent.appendChild(title);
        recents.forEach(function (f) {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'ss-text2-font-option';
            row.dataset.font = f;
            row.style.fontFamily = "'" + f + "', sans-serif";
            const nameSpan = document.createElement('span');
            nameSpan.className = 'ss-text2-font-opt-name';
            nameSpan.textContent = f;
            row.appendChild(nameSpan);
            row.addEventListener('click', function (e) {
                e.stopPropagation();
                applyFontByName(f);
            });
            fontRecent.appendChild(row);
        });
    }

    function renderFontList(filterText) {
        if (!fontList) return;
        const q = (filterText || '').trim().toLowerCase();
        const fonts = allFonts().filter(function (f) {
            return !q || f.toLowerCase().indexOf(q) !== -1;
        });
        fontList.innerHTML = '';

        const unique = [];
        fonts.forEach(function (f) { if (unique.indexOf(f) === -1) unique.push(f); });
        unique.forEach(function (f) {
            const row = document.createElement('button');
            row.type = 'button';
            row.className = 'ss-text2-font-option';
            row.dataset.font = f;
            row.style.fontFamily = "'" + f + "', sans-serif";
            if (f === editor.font) row.classList.add('ss-text2-active-font');
            const nameSpan = document.createElement('span');
            nameSpan.className = 'ss-text2-font-opt-name';
            nameSpan.textContent = f;
            const tag = document.createElement('span');
            tag.className = 'ss-text2-font-opt-tag';
            if (SYSTEM_FONTS.indexOf(f) !== -1) {
                tag.textContent = 'System';
            } else {
                tag.classList.add('ss-text2-tag-google');
                tag.textContent = 'Google';
            }
            row.appendChild(nameSpan);
            row.appendChild(tag);
            row.addEventListener('click', function (e) {
                e.stopPropagation();
                applyFontByName(f);
            });
            fontList.appendChild(row);
        });

        if (q && !unique.some(function (f) { return f.toLowerCase() === q; })) {
            const loadRow = document.createElement('button');
            loadRow.type = 'button';
            loadRow.className = 'ss-text2-font-option ss-text2-font-load';
            const label = document.createElement('span');
            label.textContent = "Load '" + filterText.trim() + "' from Google Fonts";
            loadRow.appendChild(label);
            loadRow.addEventListener('click', function (e) {
                e.stopPropagation();
                applyFontByName(filterText.trim());
            });
            fontList.appendChild(loadRow);
        }

        if (!fontList.childElementCount) {
            const empty = document.createElement('div');
            empty.className = 'ss-text2-font-option';
            empty.textContent = 'No fonts found';
            empty.style.opacity = '0.5';
            empty.style.cursor = 'default';
            fontList.appendChild(empty);
        }
    }

    function applyFontByName(name) {
        if (!name) return;
        editor.font = name;
        loadGoogleFont(name, editor.fontWeight);
        pushRecentFont(name);
        if (fontLabel) {
            fontLabel.textContent = name;
            fontLabel.style.fontFamily = "'" + name + "', sans-serif";
        }
        closeFontDropdown();
        renderContentAndPreview();
    }

    function toggleFontDropdown() {
        if (!fontDropdown) return;
        fontDropdownOpen = !fontDropdownOpen;
        fontDropdown.classList.toggle('ss-text2-open', fontDropdownOpen);
        fontDropdown.setAttribute('aria-hidden', String(!fontDropdownOpen));
        if (fontBtn) fontBtn.setAttribute('aria-expanded', String(fontDropdownOpen));
        if (fontDropdownOpen) {
            fontSearch.value = '';
            renderRecentFonts();
            renderFontList('');
            setTimeout(function () { fontSearch.focus(); }, 10);
        }
    }

    function closeFontDropdown() {
        if (!fontDropdownOpen) return;
        fontDropdownOpen = false;
        fontDropdown.classList.remove('ss-text2-open');
        fontDropdown.setAttribute('aria-hidden', 'true');
        if (fontBtn) fontBtn.setAttribute('aria-expanded', 'false');
    }

    // ------------------------------------------------------------------
    // Line model / styles
    // ------------------------------------------------------------------
    function fontFamilyFor(name) {
        return "'" + name + "', 'Trebuchet MS', sans-serif";
    }

    function baseStyle() {
        return {
            fontFamily: fontFamilyFor(editor.font),
            fontSize: editor.fontSize,
            color: editor.color,
            fontWeight: editor.fontWeight,
            fontStyle: editor.fontStyle,
            textDecoration: editor.textDecoration,
            textTransform: editor.textTransform,
            textAlign: editor.textAlign,
            letterSpacing: editor.letterSpacing,
            lineHeight: editor.lineHeight
        };
    }

    function parseTextLine(obj) {
        obj = (obj && typeof obj === 'object') ? obj : {};
        return {
            text: (obj.text !== undefined && obj.text !== null) ? String(obj.text) : ''
        };
    }

    function readEditableLines() {
        if (!editableAnchor) return [{ text: editor.text }];
        // Walk ALL direct children of the anchor. Text that ends up as a stray
        // text node (typed text the browser left outside a line div) is folded
        // into the current line so it is never lost.
        const lines = [];
        let buffer = '';
        const nodes = editableAnchor.childNodes;
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            if (n.nodeType === Node.TEXT_NODE) {
                buffer += n.textContent;
            } else if (n.nodeType === Node.ELEMENT_NODE) {
                if (n.classList && n.classList.contains('ss-text2-line')) {
                    lines.push({ text: buffer + n.textContent });
                    buffer = '';
                } else {
                    buffer += n.textContent;
                }
            }
        }
        if (buffer !== '' || lines.length === 0) lines.push({ text: buffer });
        return lines;
    }

    function anchorHasStrayContent() {
        if (!editableAnchor) return false;
        const nodes = editableAnchor.childNodes;
        for (let i = 0; i < nodes.length; i++) {
            const n = nodes[i];
            if (n.nodeType === Node.TEXT_NODE) {
                if ((n.textContent || '').trim() !== '') return true;
            } else if (n.nodeType === Node.ELEMENT_NODE) {
                if (!(n.classList && n.classList.contains('ss-text2-line'))) return true;
            }
        }
        return false;
    }

    function rebuildLinesFromText() {
        editor.lines = readEditableLines();
        editor.text = editor.lines.map(function (l) { return l.text; }).join('\n');
    }

    function decoFrom(baseDeco, underline, strike) {
        let parts = (baseDeco || 'none').split(/\s+/).filter(function (p) { return p && p !== 'none'; });
        if (underline === true && parts.indexOf('underline') === -1) parts.push('underline');
        if (underline === false) parts = parts.filter(function (p) { return p !== 'underline'; });
        if (strike === true && parts.indexOf('line-through') === -1) parts.push('line-through');
        if (strike === false) parts = parts.filter(function (p) { return p !== 'line-through'; });
        return parts.length ? parts.join(' ') : 'none';
    }

    function applyBase(overrides) {
        if (overrides.fontSize !== undefined) editor.fontSize = overrides.fontSize;
        if (overrides.color !== undefined) {
            editor.color = overrides.color;
            committedColor = overrides.color;
        }
        if (overrides.weight !== undefined) editor.fontWeight = String(overrides.weight);
        if (overrides.bold !== undefined) editor.fontWeight = overrides.bold ? 'bold' : 'normal';
        if (overrides.italic !== undefined) editor.fontStyle = overrides.italic ? 'italic' : 'normal';
        if (overrides.underline !== undefined) editor.textDecoration = decoFrom(editor.textDecoration, overrides.underline, null);
        if (overrides.strike !== undefined) editor.textDecoration = decoFrom(editor.textDecoration, null, overrides.strike);
        if (overrides.caps !== undefined) editor.textTransform = overrides.caps ? 'uppercase' : 'none';
        editor.textAlign = 'center';
        renderContentAndPreview();
        refreshColorSelectors();
    }

    function toggleStyle(style) {
        switch (style) {
            case 'bold': applyBase({ bold: editor.fontWeight !== 'bold' }); break;
            case 'italic': applyBase({ italic: editor.fontStyle !== 'italic' }); break;
            case 'underline': applyBase({ underline: (editor.textDecoration || '').indexOf('underline') === -1 }); break;
            case 'strike': applyBase({ strike: (editor.textDecoration || '').indexOf('line-through') === -1 }); break;
            case 'caps': applyBase({ caps: editor.textTransform !== 'uppercase' }); break;
        }
    }

    function updateToolButtons() {
        const eff = baseStyle();
        syncColorControls(eff.color);
        updateEqualWidthButton();
        if (weightSelect) {
            let numeric = 400;
            if (eff.fontWeight === 'bold') numeric = 700;
            else if (eff.fontWeight && eff.fontWeight !== 'normal') {
                const n = parseFloat(eff.fontWeight);
                if (!isNaN(n)) numeric = Math.round(n);
            }
            if (String(weightSelect.value) !== String(numeric)) weightSelect.value = String(numeric);
        }

        const styleState = {
            bold: eff.fontWeight === 'bold' || (parseFloat(eff.fontWeight) || 0) >= 600,
            italic: eff.fontStyle === 'italic',
            underline: (eff.textDecoration || '').indexOf('underline') !== -1,
            strike: (eff.textDecoration || '').indexOf('line-through') !== -1,
            caps: eff.textTransform === 'uppercase'
        };
        const toolbar = document.getElementById('ss-text2Toolbar');
        if (toolbar) {
            toolbar.querySelectorAll('.ss-text2-tool[data-style]').forEach(function (btn) {
                btn.classList.toggle('ss-text2-active', !!styleState[btn.dataset.style]);
            });
        }
    }

    function updateEqualWidthButton() {
        if (equalWidthBtn) equalWidthBtn.classList.toggle('ss-text2-active', !!editor.equalWidth);
    }

    function syncColorControls(color) {
        const c = normalizeHex(color || editor.color);
        if (colorHex && colorHex.value.toLowerCase() !== c) colorHex.value = c;
    }

    // ------------------------------------------------------------------
    // Layout: measurement + per-line rendering
    // ------------------------------------------------------------------
    // Measure exactly the way the browser renders it (a hidden DOM span), so
    // the computed layout always matches the on-screen text - no canvas/DOM
    // metric drift that would let words escape or get clipped.
    function measureTextWidth(text, family, size, ls, weight, style, caps) {
        if (!text) return 0;
        const t = caps ? text.toUpperCase() : text;
        const el = getMeasEl();
        el.style.fontFamily = family;
        el.style.fontSize = size + 'px';
        el.style.fontWeight = weight || 'normal';
        el.style.fontStyle = style || 'normal';
        el.style.letterSpacing = ls + 'px';
        el.textContent = t;
        return el.getBoundingClientRect().width;
    }

    // Poster layout: every row is exactly as wide as the widest row.
    //   - a row with more than one word keeps the base font size relation and is
    //     widened by increasing its font size until it matches the target width
    //   - a single word without spaces cannot be widened that way, so it keeps
    //     the base font size and is widened by adding letter spacing between the
    //     letters (nothing is ever cut or hidden)
    // Font glyph widths are not perfectly linear across sizes (hinting can even
    // quantize them into plateaus), so scaling by a ratio can overshoot and make
    // a row overflow. Strategy for a multi-word row:
    //   1. binary-search the LARGEST font size whose rendered width is still
    //      <= targetW (monotonic, so this is stable despite quantization)
    //   2. fill the remaining gap exactly with letter-spacing, which the browser
    //      applies continuously (one advance per character, trailing one included)
    // This guarantees the row lands exactly on targetW - nothing is cut or hidden.
    function sizeForWidth(text, family, targetW, baseLS, weight, style, caps, startSize) {
        // Already the widest row: keep the base size untouched.
        if (measureTextWidth(text, family, startSize, baseLS, weight, style, caps) >= targetW) {
            return { size: startSize, ls: baseLS };
        }
        let lo = 1;
        let hi = Math.max(startSize * 10, 500);
        let bestSize = startSize;
        for (let i = 0; i < 60 && hi - lo > 0.001; i++) {
            const mid = (lo + hi) / 2;
            const w = measureTextWidth(text, family, mid, baseLS, weight, style, caps);
            if (w <= targetW) { bestSize = mid; lo = mid; } else { hi = mid; }
        }
        // Hinting can switch width plateaus a few tenths of a pixel above
        // bestSize, and the line rounds its font size down, so drop to the
        // nearest 0.01px BEFORE measuring - never straddle a plateau edge.
        bestSize = Math.floor(bestSize * 100) / 100;
        const wBest = measureTextWidth(text, family, bestSize, baseLS, weight, style, caps);
        const extra = targetW - wBest;
        const ls = extra > 0 && text.length ? baseLS + extra / text.length : baseLS;
        return { size: bestSize, ls: Math.floor(ls * 100) / 100 };
    }

    function computeLayout(base, lines, equalWidth) {
        const caps = base.textTransform === 'uppercase';
        const naturals = lines.map(function (l) {
            return measureTextWidth(l.text, base.fontFamily, base.fontSize, base.letterSpacing, base.fontWeight, base.fontStyle, caps);
        });
        const sizes = lines.map(function () { return base.fontSize; });
        const spacings = lines.map(function () { return base.letterSpacing; });
        let contentW = 1;
        if (equalWidth && lines.length) {
            const target = Math.max.apply(null, naturals);
            contentW = Math.max(1, target);
            lines.forEach(function (l, i) {
                const t = caps ? l.text.toUpperCase() : (l.text || '');
                const trimmed = t.trim();
                if (!trimmed) return;
                // Poster: every row fills the same width. Rows with fewer words
                // (a single word, a short word) need a bigger font to reach the
                // target width, so grow the font size until the row is just
                // below the target, then finish the last few pixels with
                // letter-spacing.
                const fitted = sizeForWidth(t, base.fontFamily, contentW,
                    base.letterSpacing, base.fontWeight, base.fontStyle,
                    caps, base.fontSize);
                sizes[i] = fitted.size;
                spacings[i] = fitted.ls;
            });
        } else {
            naturals.forEach(function (w) { if (w > contentW) contentW = w; });
        }
        const contentH = lines.reduce(function (acc, l, i) {
            const lh = equalWidth ? POSTER_LINE_HEIGHT : (base.lineHeight || 1.2);
            return acc + lh * sizes[i];
        }, 0);
        return { contentW: contentW, contentH: contentH, sizes: sizes, spacings: spacings };
    }

    function styleLineDiv(d, base, layout, i, equalWidth) {
        d.style.width = (Math.round(layout.contentW * 10) / 10) + 'px';
        d.style.fontFamily = base.fontFamily;
        d.style.fontSize = (Math.floor(layout.sizes[i] * 100) / 100) + 'px';
        d.style.color = base.color;
        d.style.fontWeight = base.fontWeight;
        d.style.fontStyle = base.fontStyle;
        d.style.textDecoration = base.textDecoration;
        d.style.textTransform = base.textTransform;
        d.style.textAlign = base.textAlign;
        d.style.letterSpacing = (Math.round(layout.spacings[i] * 100) / 100) + 'px';
        d.style.lineHeight = String(equalWidth ? POSTER_LINE_HEIGHT : base.lineHeight);
        // Poster rows must stay on one single line: never wrap, never hide.
        d.style.whiteSpace = equalWidth ? 'pre' : 'pre-wrap';
        d.style.wordBreak = equalWidth ? 'keep-all' : 'break-word';
        d.style.padding = '0';
        d.style.margin = '0';
        d.style.boxSizing = 'border-box';
        d.style.overflow = 'visible';
    }

    function renderLinesInto(container, base, lines, layout, equalWidth) {
        container.innerHTML = '';
        lines.forEach(function (l, i) {
            const d = document.createElement('div');
            d.className = 'ss-text2-line';
            d.textContent = l.text;
            styleLineDiv(d, base, layout, i, equalWidth);
            container.appendChild(d);
        });
    }

    function styleContentBase(content, base) {
        content.style.position = 'absolute';
        content.style.left = '0';
        content.style.top = '0';
        content.style.transformOrigin = '0 0';
        content.style.fontFamily = base.fontFamily;
        content.style.fontSize = base.fontSize + 'px';
        content.style.color = base.color;
        content.style.fontWeight = base.fontWeight;
        content.style.fontStyle = base.fontStyle;
        content.style.textDecoration = base.textDecoration;
        content.style.textTransform = base.textTransform;
        content.style.textAlign = base.textAlign;
        content.style.letterSpacing = base.letterSpacing + 'px';
        content.style.lineHeight = String(base.lineHeight);
        content.style.whiteSpace = 'pre-wrap';
        content.style.wordBreak = 'break-word';
        content.style.padding = '0';
        content.style.margin = '0';
        content.style.boxSizing = 'border-box';
        content.style.overflow = 'visible';
        content.style.backgroundColor = 'transparent';
    }

    function renderContentToElement(textBox, data, state) {
        if (!textBox) return;
        let clip = textBox.querySelector('.ss-text2-clip');
        if (!clip) {
            clip = document.createElement('div');
            clip.className = 'ss-text2-clip';
            textBox.appendChild(clip);
        }
        let content = clip.querySelector('.ss-text-content');
        if (!content) {
            content = document.createElement('div');
            content.className = 'ss-text-content';
            clip.appendChild(content);
        }

        const base = data.base || baseStyle();
        const lines = data.lines || [];
        const layout = computeLayout(base, lines, !!data.equalWidth);

        const contentW = state && state.baseW ? state.baseW : layout.contentW;
        const contentH = state && state.baseH ? state.baseH : layout.contentH;

        styleContentBase(content, base);
        renderLinesInto(content, base, lines, layout, !!data.equalWidth);
        content.style.width = contentW + 'px';
        content.style.height = Math.max(1, contentH) + 'px';

        // The uniform model scale/crop is owned by the text2-transform module;
        // here we only establish the starting point (scale 1, full crop) unless
        // the caller supplies a scale/crop to restore. On edit, the box WIDTH is
        // preserved and the height fits the new content at that width.
        let s = 1;
        let crop = { x: 0, y: 0, w: contentW, h: contentH };
        if (state && state.scale !== undefined) {
            s = state.scale;
        } else if (state && state.boxW) {
            s = state.boxW / contentW;
        }
        if (state && state.crop) {
            crop = state.crop;
        }
        const boxW = crop.w * s;
        const boxH = crop.h * s;
        textBox.style.width = boxW + 'px';
        textBox.style.height = boxH + 'px';
        content.style.transform = 'translate(' + (-crop.x * s) + 'px,' + (-crop.y * s) + 'px) scale(' + s + ',' + s + ')';

        textBox.dataset.text2Lines = JSON.stringify(lines);
        textBox.dataset.text2Equal = data.equalWidth ? '1' : '0';
        textBox.dataset.text2Scale = String(Math.round(s * 1000) / 1000);
        textBox.dataset.text2Crop = crop.x + '|' + crop.y + '|' + crop.w + '|' + crop.h;
        if (!textBox.dataset.text2Rot) textBox.dataset.text2Rot = '0';
        textBox.dataset.text2BaseW = String(Math.round(contentW * 10) / 10);
        textBox.dataset.text2BaseH = String(Math.round(contentH * 10) / 10);
        textBox.dataset.text2Font = data.font || editor.font;
        textBox.dataset.text2Size = String(base.fontSize);
    }

    function collectText2Data() {
        return {
            text: editor.lines.map(function (l) { return l.text; }).join('\n'),
            lines: editor.lines,
            base: baseStyle(),
            font: editor.font,
            equalWidth: editor.equalWidth
        };
    }

    // ------------------------------------------------------------------
    // Canvas handles: text2 boxes are handled by the standalone text2-transform
    // module (blue corner scale handles, orange edge crop handles, green
    // rotation handle, blue outline). Image-transform is never touched.
    // ------------------------------------------------------------------
    function registerWithImageTransform(textBox) {
        if (window.SSText2Transform && typeof window.SSText2Transform.register === 'function') {
            return window.SSText2Transform.register(textBox);
        }
        return textBox;
    }

    // ------------------------------------------------------------------
    // Editable live preview
    // ------------------------------------------------------------------
    // There is ONE writing surface: a contenteditable preview that re-renders
    // itself with the exact poster layout on every change. Typing in it IS the
    // live adjustment - the caret is preserved across re-renders.
    function renderContentAndPreview() {
        updateToolButtons();
        renderEditablePreview();
    }

    function applyPreview() {
        renderContentAndPreview();
    }

    const EDIT_MIN_H = 120;
    const EDIT_MAX_H = 280;

    function editableCaretPosition() {
        if (!editableAnchor) return null;
        const sel = window.getSelection();
        if (!sel.rangeCount) return null;
        const range = sel.getRangeAt(0);
        const anchorEl = editableAnchor;
        if (range.startContainer !== anchorEl && !anchorEl.contains(range.startContainer)) return null;

        const divs = Array.prototype.slice.call(anchorEl.querySelectorAll(':scope > .ss-text2-line'));
        let lineEl = range.startContainer;
        while (lineEl && lineEl !== anchorEl && !(lineEl.classList && lineEl.classList.contains('ss-text2-line'))) {
            lineEl = lineEl.parentNode;
        }
        if (lineEl === anchorEl || !lineEl) {
            // Caret sits directly on the anchor (empty editor). Map to the last
            // line so a subsequent caret restore still lands on a real line.
            const pre = range.cloneRange();
            pre.selectNodeContents(anchorEl);
            pre.setEnd(range.startContainer, range.startOffset);
            return { line: divs.length ? divs.length - 1 : 0, offset: divs.length ? divs[divs.length - 1].textContent.length : 0 };
        }
        let line = divs.indexOf(lineEl);
        if (line === -1) line = divs.length ? divs.length - 1 : 0;
        const pre = range.cloneRange();
        pre.selectNodeContents(lineEl);
        pre.setEnd(range.startContainer, range.startOffset);
        return { line: line, offset: pre.toString().length };
    }

    function setEditableCaretPosition(container, pos) {
        const sel = window.getSelection();
        const range = document.createRange();
        const divs = Array.prototype.slice.call(container.querySelectorAll(':scope > .ss-text2-line'));
        const lineEl = divs[Math.max(0, Math.min(pos.line, divs.length - 1))];
        if (!lineEl) return;
        const text = lineEl.textContent || '';
        const offset = Math.max(0, Math.min(pos.offset, text.length));
        if (text.length === 0) {
            range.setStart(lineEl, 0);
        } else {
            range.setStart(lineEl.firstChild, offset);
        }
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    function caretOffsetInLine(range, lineEl) {
        const pre = range.cloneRange();
        pre.selectNodeContents(lineEl);
        pre.setEnd(range.startContainer, range.startOffset);
        return pre.toString().length;
    }

    function lineElFromSelection() {
        if (!editableAnchor) return null;
        const sel = window.getSelection();
        if (!sel.rangeCount) return null;
        const range = sel.getRangeAt(0);
        let lineEl = range.startContainer;
        while (lineEl && lineEl !== editableAnchor && !(lineEl.classList && lineEl.classList.contains('ss-text2-line'))) {
            lineEl = lineEl.parentNode;
        }
        return (lineEl && lineEl !== editableAnchor) ? lineEl : null;
    }

    function setLineDom(d, text) {
        if (text) {
            if (d.textContent !== text) d.textContent = text;
        } else {
            if (d.childNodes.length !== 1 || d.firstChild.nodeName !== 'BR') {
                d.textContent = '';
                d.appendChild(document.createElement('br'));
            }
        }
    }

    function renderEditablePreview() {
        if (!editablePreview || !editableAnchor) return;
        const caret = editableCaretPosition();
        const base = baseStyle();
        const lines = editor.lines && editor.lines.length ? editor.lines : [{ text: '' }];
        const layout = computeLayout(base, lines, editor.equalWidth);

        const divs = editableAnchor.querySelectorAll(':scope > .ss-text2-line');
        if (divs.length !== lines.length || anchorHasStrayContent()) {
            editableAnchor.innerHTML = '';
            lines.forEach(function (l) {
                const d = document.createElement('div');
                d.className = 'ss-text2-line';
                setLineDom(d, l.text);
                editableAnchor.appendChild(d);
            });
        } else {
            lines.forEach(function (l, i) {
                setLineDom(divs[i], l.text);
            });
        }
        editableAnchor.querySelectorAll(':scope > .ss-text2-line').forEach(function (d, i) {
            styleLineDiv(d, base, layout, i, editor.equalWidth);
        });

        const availW = Math.max(60, editablePreview.clientWidth - 20);
        const availH = EDIT_MAX_H - 20;
        // Cap the on-screen size below full scale so the text is smaller in the
        // field: more rows fit and there is breathing room to work with.
        const scale = Math.min(0.85, availW / Math.max(1, layout.contentW), availH / Math.max(1, layout.contentH));
        editableAnchor.style.width = layout.contentW + 'px';
        editableAnchor.style.height = Math.max(1, layout.contentH) + 'px';
        editableAnchor.style.transform = 'translate(-50%, -50%) scale(' + scale + ')';
        editableAnchor.style.transformOrigin = 'center center';
        editablePreview.style.height = Math.max(EDIT_MIN_H, Math.min(EDIT_MAX_H, layout.contentH * scale + 20)) + 'px';
        editablePreview.classList.toggle('ss-text2-editable-preview--empty', !lines.some(function (l) { return (l.text || '').trim(); }));

        if (caret !== null) setEditableCaretPosition(editableAnchor, caret);
    }

    function splitEditableLine() {
        if (!editableAnchor) return;
        const lineEl = lineElFromSelection();
        if (!lineEl) return;
        const sel = window.getSelection();
        const range = sel.rangeCount ? sel.getRangeAt(0) : null;
        if (!range) return;
        const offset = caretOffsetInLine(range, lineEl);
        const text = lineEl.textContent;
        setLineDom(lineEl, text.slice(0, offset));
        const newDiv = document.createElement('div');
        newDiv.className = 'ss-text2-line';
        setLineDom(newDiv, text.slice(offset));
        lineEl.after(newDiv);
        rebuildLinesFromText();
        renderEditablePreview();
        setEditableCaretPosition(editableAnchor, { line: (function () {
            const divs = Array.prototype.slice.call(editableAnchor.querySelectorAll(':scope > .ss-text2-line'));
            const idx = divs.indexOf(newDiv);
            return idx === -1 ? (divs.length ? divs.length - 1 : 0) : idx;
        })(), offset: 0 });
    }

    function handleEditablePaste(e) {
        e.preventDefault();
        if (!editableAnchor) return;
        const src = e.clipboardData || window.clipboardData;
        const text = (src && src.getData) ? src.getData('text/plain') : '';
        if (!text) return;

        const lineEl = lineElFromSelection();
        const sel = window.getSelection();
        const range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
        const pasted = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        if (!lineEl || !range) {
            editableAnchor.innerHTML = '';
            pasted.split('\n').forEach(function (t) {
                const d = document.createElement('div');
                d.className = 'ss-text2-line';
                setLineDom(d, t);
                editableAnchor.appendChild(d);
            });
            rebuildLinesFromText();
            renderEditablePreview();
            const divs = Array.prototype.slice.call(editableAnchor.querySelectorAll(':scope > .ss-text2-line'));
            if (divs.length) setEditableCaretPosition(editableAnchor, { line: divs.length - 1, offset: divs[divs.length - 1].textContent.length });
            return;
        }

        const start = caretOffsetInLine(range, lineEl);
        let end = start;
        const selected = range.toString();
        if (selected && lineEl.textContent.slice(start).indexOf(selected) === 0) {
            end = start + selected.length;
        }
        const before = lineEl.textContent.slice(0, start);
        const after = lineEl.textContent.slice(end);
        const parts = pasted.split('\n');
        const first = before + parts[0];
        const rest = parts.slice(1);
        setLineDom(lineEl, first);
        let anchorEl = lineEl;
        rest.forEach(function (t) {
            const d = document.createElement('div');
            d.className = 'ss-text2-line';
            setLineDom(d, t);
            anchorEl.after(d);
            anchorEl = d;
        });
        setLineDom(anchorEl, anchorEl.textContent + after);
        rebuildLinesFromText();
        renderEditablePreview();
        setEditableCaretPosition(editableAnchor, { line: (function () {
            const divs = Array.prototype.slice.call(editableAnchor.querySelectorAll(':scope > .ss-text2-line'));
            const idx = divs.indexOf(anchorEl);
            return idx === -1 ? (divs.length ? divs.length - 1 : 0) : idx;
        })(), offset: rest.length ? rest[rest.length - 1].length : first.length });
    }

    function clampFontSize(v) {
        const n = parseFloat(v);
        if (isNaN(n)) return editor.fontSize || 48;
        return Math.min(400, Math.max(8, Math.round(n)));
    }

    function clampLetterSpacing(v) {
        const n = parseFloat(v);
        if (isNaN(n)) return 0;
        return Math.min(40, Math.max(-5, Math.round(n * 10) / 10));
    }

    function clampLineHeight(v) {
        const n = parseFloat(v);
        if (isNaN(n)) return 1.2;
        return Math.min(3, Math.max(0.5, Math.round(n * 10) / 10));
    }

    // ------------------------------------------------------------------
    // Smart color: pipette, canvas palette, complementary colors
    // (the color math and canvas sampling live in js/color-utils.js - the
    // canvas palette aggregates dominant colors across every slide, so a
    // color on any slide shows up in the overall "Canvas" palette)
    // ------------------------------------------------------------------

    function buildPaletteColors(slideIndex, k) {
        const colors = sampleCanvasColors(typeof slideIndex === 'number' ? slideIndex : -1, k);
        return { top: colors, bottom: colors.map(complementOf) };
    }

    function previewSwatchColor(c) {
        if (!c) return;
        editor.color = normalizeHex(c);
        syncColorControls(editor.color);
        renderContentAndPreview();
        refreshColorSelectors();
    }

    function revertSwatchColor() {
        if (editor.color === committedColor) return;
        editor.color = committedColor;
        syncColorControls(editor.color);
        renderContentAndPreview();
        refreshColorSelectors();
    }

    function attachSwatch(sw, c) {
        sw.addEventListener('mouseenter', function () { previewSwatchColor(c); });
        sw.addEventListener('mouseleave', revertSwatchColor);
        sw.addEventListener('click', function () {
            applyBase({ color: c });
        });
    }

    function fillPaletteRow(container, colors) {
        if (!container) return;
        container.innerHTML = '';
        colors.forEach(function (c) {
            const sw = document.createElement('button');
            sw.type = 'button';
            sw.className = 'ss-text2-swatch';
            sw.dataset.color = c;
            sw.style.background = c;
            sw.title = c;
            sw.setAttribute('aria-label', c);
            attachSwatch(sw, c);
            container.appendChild(sw);
        });
    }

    function attachBigSwatch(btn) {
        if (!btn) return;
        btn.addEventListener('mouseenter', function () {
            if (btn.dataset.color) previewSwatchColor(btn.dataset.color);
        });
        btn.addEventListener('mouseleave', revertSwatchColor);
        btn.addEventListener('click', function () {
            if (btn.dataset.color) applyBase({ color: btn.dataset.color });
        });
    }

    // ------------------------------------------------------------------
    // Color selector carousel: Spectrum / Grid / Sliders
    // (the Canvas palette with its complementary colors is a fixed section
    // above this carousel - see renderCanvasSection/renderCanvasPalette)
    // ------------------------------------------------------------------
    const CAROUSEL_PAGES = ['spectrum', 'grid', 'sliders'];
    const CAROUSEL_TITLES = {
        spectrum: 'Spectrum',
        grid: 'Grid',
        sliders: 'Sliders'
    };

    function renderCarousel() {
        if (!colorPages) return;
        carouselIndex = ((carouselIndex % CAROUSEL_PAGES.length) + CAROUSEL_PAGES.length) % CAROUSEL_PAGES.length;
        const children = colorPages.children;
        for (let i = 0; i < children.length; i++) {
            children[i].classList.toggle('ss-text2-color-page--active', i === carouselIndex);
        }
        const page = CAROUSEL_PAGES[carouselIndex];
        if (carTitle) carTitle.textContent = CAROUSEL_TITLES[page];
        if (page === 'spectrum') renderSpectrumPage();
        else if (page === 'grid') renderGridPage();
        else renderSlidersPage();
    }

    // Keep the active selector in step with the color: Spectrum markers and
    // Slider values re-sync when a color is picked elsewhere (complementary
    // swatch, dominant swatch, hex input...). The Grid has no selection
    // indicator, so it needs no re-render here.
    function refreshColorSelectors() {
        if (!popup || popup.style.display === 'none') return;
        const page = CAROUSEL_PAGES[carouselIndex];
        if (page === 'spectrum') renderSpectrumPage();
        else if (page === 'sliders') renderSlidersPage();
    }

    // ------------------------------------------------------------------
    // Canvas palette section: dominant colors of a slide (a row of square
    // swatches, 5 default, + grows to 11, - shrinks to 3) with the
    // complementary colors in a row directly under them. The nav row has
    // left/right arrows and a label that reads "Canvas" (whole canvas) or
    // "Slide N" once a slide is selected.
    // ------------------------------------------------------------------
    function renderCanvasSection() {
        if (!canvasName) return;
        const sections = Math.max(1, canvasState.sections || 1);
        canvasSlideIndex = Math.max(-1, Math.min(canvasSlideIndex, sections - 1));

        if (canvasSlideIndex === -1) {
            canvasName.textContent = 'Canvas';
            canvasName.title = 'Overall - whole canvas';
            canvasName.setAttribute('aria-label', 'Overall - whole canvas');
        } else {
            canvasName.textContent = 'Slide ' + (canvasSlideIndex + 1);
            canvasName.title = 'Slide ' + (canvasSlideIndex + 1);
            canvasName.setAttribute('aria-label', 'Slide ' + (canvasSlideIndex + 1));
        }

        if (canvasPrev) canvasPrev.disabled = canvasSlideIndex <= -1;
        if (canvasNext) canvasNext.disabled = canvasSlideIndex >= sections - 1;

        renderCanvasPalette();
    }

    function renderCanvasPalette() {
        if (!paletteMain || !paletteSub) return;
        const pal = buildPaletteColors(canvasSlideIndex, paletteSize);
        fillPaletteRow(paletteMain, pal.top);
        fillPaletteRow(paletteSub, pal.bottom);
        if (palettePlus) palettePlus.disabled = paletteSize >= MAX_PALETTE_SIZE;
        if (paletteMinus) paletteMinus.disabled = paletteSize <= MIN_PALETTE_SIZE;
    }

    function changePaletteSize(delta) {
        paletteSize = Math.min(MAX_PALETTE_SIZE, Math.max(MIN_PALETTE_SIZE, paletteSize + delta));
        renderCanvasPalette();
    }

    function hslOfColor() {
        const rgb = hexToRgb(editor.color);
        const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
        return { h: hsl[0], s: hsl[1], l: hsl[2] };
    }

    // Current color as (h, s, v) so the spectrum square markers line up.
    function currentHsv() {
        const { h, s, l } = hslOfColor();
        const v = l + s * Math.min(l, 1 - l);
        return { h: h, s: s, v: v };
    }

    function clamp01(v) {
        return Math.max(0, Math.min(1, v));
    }

    function positionSpectrumMarker(marker, leftPct, topPct) {
        if (!marker) return;
        marker.style.left = leftPct + '%';
        marker.style.top = topPct + '%';
    }

    function renderSpectrumPage() {
        if (!spectrumSv) return;
        const { h, s, v } = currentHsv();
        spectrumSv.style.backgroundColor = hslToHex(h, 1, 0.5);
        spectrumSv.style.backgroundImage = 'linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0))';
        positionSpectrumMarker(spectrumSvMarker, s * 100, (1 - v) * 100);
        positionSpectrumMarker(spectrumHueMarker, (h / 360) * 100, 50);
    }

    function svColorFromEvent(e) {
        if (!spectrumSv) return;
        const rect = spectrumSv.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const s = clamp01((e.clientX - rect.left) / rect.width);
        const v = clamp01(1 - (e.clientY - rect.top) / rect.height);
        const h = hslOfColor().h;
        applyBase({ color: hsvToHex(h, s, v) });
        positionSpectrumMarker(spectrumSvMarker, s * 100, (1 - v) * 100);
    }

    function hueFromEvent(e) {
        if (!spectrumHue) return;
        const rect = spectrumHue.getBoundingClientRect();
        if (!rect.width) return;
        const x = clamp01((e.clientX - rect.left) / rect.width);
        const h = x * 360;
        const { s, v } = currentHsv();
        applyBase({ color: hsvToHex(h, s, v) });
        positionSpectrumMarker(spectrumHueMarker, x * 100, 50);
        if (spectrumSv) {
            spectrumSv.style.backgroundColor = hslToHex(h, 1, 0.5);
            spectrumSv.style.backgroundImage = 'linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, rgba(255,255,255,0))';
        }
    }

    let svDragging = false;
    let hueDragging = false;
    function svMove(e) { if (svDragging) svColorFromEvent(e); }
    function svUp() {
        svDragging = false;
        document.removeEventListener('pointermove', svMove);
        document.removeEventListener('pointerup', svUp);
    }
    function hueMove(e) { if (hueDragging) hueFromEvent(e); }
    function hueUp() {
        hueDragging = false;
        document.removeEventListener('pointermove', hueMove);
        document.removeEventListener('pointerup', hueUp);
    }

    const COLOR_HUES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
    const COLOR_LIGHTNESS = [0.86, 0.7, 0.55, 0.4, 0.25];

    function colorSwatchForHsl(h, s, l) {
        const rgb = hslToRgb(h, s, l);
        return rgbToHex(rgb[0], rgb[1], rgb[2]);
    }

    function renderGridPage() {
        if (!colorSwatches) return;
        colorSwatches.innerHTML = '';
        // Hue rows: one row per lightness, hues 0..330, back-to-back rectangles.
        COLOR_LIGHTNESS.forEach(function (l) {
            const row = document.createElement('div');
            row.className = 'ss-text2-color-row';
            COLOR_HUES.forEach(function (h) {
                const c = colorSwatchForHsl(h, 0.62, l);
                const sw = document.createElement('button');
                sw.type = 'button';
                sw.className = 'ss-text2-swatch ss-text2-swatch--color';
                sw.dataset.color = c;
                sw.style.background = c;
                sw.title = c;
                sw.setAttribute('aria-label', c);
                attachSwatch(sw, c);
                row.appendChild(sw);
            });
            colorSwatches.appendChild(row);
        });
        // Grayscale ramp at the bottom of the panel.
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
            attachSwatch(sw, c);
            ramp.appendChild(sw);
        }
        colorSwatches.appendChild(ramp);
    }

    function buildSliders() {
        if (!sliders) return;
        sliders.innerHTML = '';
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
                const r = parseInt(sliders.querySelector('[data-channel="R"]').value, 10) || 0;
                const g = parseInt(sliders.querySelector('[data-channel="G"]').value, 10) || 0;
                const b = parseInt(sliders.querySelector('[data-channel="B"]').value, 10) || 0;
                updateSliderValues(r, g, b);
                applyBase({ color: rgbToHex(r, g, b) });
            });
            row.appendChild(label);
            row.appendChild(input);
            row.appendChild(val);
            sliders.appendChild(row);
        });
    }

    function updateSliderValues(r, g, b) {
        if (!sliders) return;
        const inputs = sliders.querySelectorAll('input[type="range"]');
        const vals = sliders.querySelectorAll('.ss-text2-slider-val');
        if (inputs.length === 3) {
            inputs[0].value = r; inputs[1].value = g; inputs[2].value = b;
        }
        if (vals.length === 3) {
            vals[0].textContent = r; vals[1].textContent = g; vals[2].textContent = b;
        }
        const hex = rgbToHex(r, g, b);
        if (sliderPreview) {
            sliderPreview.style.background = hex;
            sliderPreview.dataset.color = hex;
            sliderPreview.title = hex;
        }
        if (sliderHex) sliderHex.textContent = hex;
    }

    function renderSlidersPage() {
        if (!sliders) return;
        if (!sliders.childElementCount) buildSliders();
        const rgb = hexToRgb(editor.color);
        updateSliderValues(rgb[0], rgb[1], rgb[2]);
    }

    function pickScreenColor() {
        if (window.EyeDropper) {
            try {
                const dropper = new window.EyeDropper();
                const restore = function () {
                    if (popup) {
                        popup.style.display = 'flex';
                        popup.setAttribute('aria-hidden', 'false');
                        const main = document.querySelector('main');
                        if (main) main.setAttribute('aria-hidden', 'true');
                        document.body.style.overflow = 'hidden';
                    }
                };
                if (popup) {
                    // Un-blur the page and drop the add-text box out of the
                    // way so the eyedropper can sample the actual canvas.
                    popup.style.display = 'none';
                    popup.setAttribute('aria-hidden', 'true');
                    const main = document.querySelector('main');
                    if (main) main.setAttribute('aria-hidden', 'false');
                    document.body.style.overflow = '';
                }
                setTimeout(function () {
                    dropper.open().then(function (result) {
                        restore();
                        if (result && result.sRGBHex) applyBase({ color: normalizeHex(result.sRGBHex) });
                    }).catch(function () {
                        restore();
                    });
                }, 60);
                return;
            } catch (e) {}
        }
        if (colorHex) colorHex.focus();
    }

    // ------------------------------------------------------------------
    // Slide navigation (multi-slide posters)
    // ------------------------------------------------------------------
    function slideIndexOfTextBox(box) {
        if (!box) return 0;
        const left = parseFloat(box.style.left) || 0;
        return Math.max(0, Math.round(left / BASE_CANVAS_WIDTH));
    }

    function textBoxesOnSlide(slideIndex) {
        const designerCanvas = document.getElementById('ss-designer-canvas');
        if (!designerCanvas) return [];
        return Array.prototype.slice.call(designerCanvas.querySelectorAll('.ss-text2-element'))
            .filter(function (el) { return slideIndexOfTextBox(el) === slideIndex; })
            .sort(function (a, b) {
                const za = parseInt(a.style.zIndex, 10) || 0;
                const zb = parseInt(b.style.zIndex, 10) || 0;
                return zb - za;
            });
    }

    function updateSlideNav() {
        const sections = Math.max(1, canvasState.sections || 1);
        if (!slideNav) return;
        if (sections <= 1) {
            slideNav.style.display = 'none';
            return;
        }
        slideNav.style.display = 'flex';
        if (slideLabel) {
            slideLabel.textContent = 'Slide ' + (editingSlideIndex + 1) + ' / ' + sections;
        }
    }

    function navigateSlide(delta) {
        if (!popup || popup.style.display === 'none') return;
        const sections = Math.max(1, canvasState.sections || 1);
        if (sections <= 1) return;
        const current = editingTextBox ? slideIndexOfTextBox(editingTextBox) : editingSlideIndex;
        const target = (current + delta + sections) % sections;

        // Keep the canvas palette in step with the slide being edited.
        canvasSlideIndex = target;
        renderCanvasSection();
        refreshColorSelectors();

        // If a text box already lives on that slide, edit it; otherwise start a
        // fresh "Add Text" session positioned on that slide.
        const boxes = textBoxesOnSlide(target);
        if (boxes.length) {
            open(boxes[0]);
        } else {
            editingTextBox = null;
            editingSlideIndex = target;
            resetEditor();
            if (title) title.textContent = 'Add Text';
            if (applyBtn) applyBtn.textContent = 'Add Text';
            syncControls();
            renderContentAndPreview();
            updateSlideNav();
            renderCarousel();
            setTimeout(function () {
                renderEditablePreview();
                if (editableAnchor) {
                    editableAnchor.focus();
                    setEditableCaretPosition(editableAnchor, { line: 0, offset: 0 });
                }
            }, 10);
        }
    }

    // ------------------------------------------------------------------
    // Editor open / close
    // ------------------------------------------------------------------
    function open(existingTextBox) {
        if (!popup) init();
        if (!popup) return;

        editingTextBox = (existingTextBox && existingTextBox.classList && existingTextBox.classList.contains('ss-text2-element'))
            ? existingTextBox : null;
        editingSlideIndex = editingTextBox ? slideIndexOfTextBox(editingTextBox) : Math.max(0, (canvasState.sections || 1) - 1);

        if (editingTextBox) {
            const contentEl = editingTextBox.querySelector('.ss-text-content') || editingTextBox;
            const cs = window.getComputedStyle(contentEl);
            let savedLines = [];
            try {
                savedLines = JSON.parse(editingTextBox.dataset.text2Lines || '[]');
            } catch (e) {}
            if (!Array.isArray(savedLines) || !savedLines.length) {
                savedLines = (contentEl.textContent || '').split('\n').map(function (t) { return { text: t }; });
            }
            editor.lines = savedLines.map(parseTextLine);
            editor.text = editor.lines.map(function (l) { return l.text; }).join('\n');
            editor.font = editingTextBox.dataset.text2Font || parseFontName(cs.fontFamily) || DEFAULT_FONT;
            editor.fontSize = clampFontSize(parseFloat(editingTextBox.dataset.text2Size) || parseFloat(cs.fontSize) || 48);
            editor.color = normalizeHex(cs.color);
            committedColor = editor.color;
            editor.fontWeight = (cs.fontWeight === 'bold' || parseFloat(cs.fontWeight) >= 600) ? 'bold' : 'normal';
            editor.fontStyle = cs.fontStyle === 'italic' ? 'italic' : 'normal';
            editor.textDecoration = (cs.textDecoration || 'none').toLowerCase();
            editor.textTransform = cs.textTransform === 'uppercase' ? 'uppercase' : 'none';
            editor.textAlign = 'center';
            editor.letterSpacing = clampLetterSpacing(parseFloat(cs.letterSpacing) || 0);
            const csFontSize = parseFloat(cs.fontSize) || 48;
            const csLineHeight = parseFloat(cs.lineHeight);
            editor.lineHeight = clampLineHeight(csLineHeight ? csLineHeight / csFontSize : 1.2);
            editor.equalWidth = editingTextBox.dataset.text2Equal === '1';
            if (title) title.textContent = 'Update Text';
            if (applyBtn) applyBtn.textContent = 'Update Text';
            loadGoogleFont(editor.font);
        } else {
            resetEditor();
            if (title) title.textContent = 'Add Text';
            if (applyBtn) applyBtn.textContent = 'Add Text';
        }

        syncControls();
        renderContentAndPreview();
        updateSlideNav();
        canvasSlideIndex = -1;
        renderCanvasSection();
        renderCarousel();

        lastActiveElement = document.activeElement;
        popup.style.display = 'flex';
        popup.setAttribute('aria-hidden', 'false');
        const main = document.querySelector('main');
        if (main) main.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = 'hidden';
        closeFontDropdown();

        // The editable preview scale depends on the popup width, which is only
        // known once the popup is visible.
        setTimeout(function () {
            renderEditablePreview();
            if (editableAnchor) {
                editableAnchor.focus();
                const lastLine = Math.max(0, (editor.lines ? editor.lines.length : 1) - 1);
                const lastText = editor.lines && editor.lines.length ? (editor.lines[lastLine].text || '') : '';
                setEditableCaretPosition(editableAnchor, { line: lastLine, offset: lastText.length });
            }
        }, 10);
    }

    function syncControls() {
        if (fontLabel) {
            fontLabel.textContent = editor.font;
            fontLabel.style.fontFamily = "'" + editor.font + "', sans-serif";
        }
        updateToolButtons();
        renderFontList('');
    }

    function resetEditor() {
        editor.text = '';
        editor.lines = [{ text: '' }];
        editor.font = DEFAULT_FONT;
        editor.fontSize = 48;
        editor.color = '#121212';
        committedColor = editor.color;
        editor.fontWeight = 'normal';
        editor.fontStyle = 'normal';
        editor.textDecoration = 'none';
        editor.textTransform = 'none';
        editor.textAlign = 'center';
        editor.letterSpacing = 0;
        editor.lineHeight = 1.2;
        editor.equalWidth = false;
        syncControls();
    }

    function close() {
        if (!popup) return;
        popup.style.display = 'none';
        popup.setAttribute('aria-hidden', 'true');
        const main = document.querySelector('main');
        if (main) main.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = '';
        closeFontDropdown();
        editingTextBox = null;
        try { if (lastActiveElement && typeof lastActiveElement.focus === 'function') lastActiveElement.focus(); } catch (e) {}
    }

    // ------------------------------------------------------------------
    // Applying to the canvas (create / update)
    // ------------------------------------------------------------------
    function handleApply() {
        if (!popup || popup.style.display === 'none') return;
        const text = editor.lines.map(function (l) { return l.text; }).join('\n');
        if (!text.trim()) return;
        const data = collectText2Data();
        const designerCanvas = document.getElementById('ss-designer-canvas');
        if (!designerCanvas) return;

        if (editingTextBox && editingTextBox.parentNode === designerCanvas) {
            updateText2Element(editingTextBox, data);
        } else {
            createText2Element(data);
        }
        close();
    }

    function createText2Element(data) {
        const designerCanvas = document.getElementById('ss-designer-canvas');
        if (!designerCanvas) return null;

        const textBox = document.createElement('div');
        textBox.className = 'ss-text-element ss-text-box ss-text2-element';
        const clip = document.createElement('div');
        clip.className = 'ss-text2-clip';
        textBox.appendChild(clip);

        textBox.style.position = 'absolute';
        textBox.style.cursor = 'grab';
        textBox.style.outline = 'none';
        textBox.style.transformOrigin = '0 0';
        textBox.style.userSelect = 'none';
        textBox.style.pointerEvents = 'auto';
        textBox.style.overflow = 'visible';

        renderContentToElement(textBox, data);

        const boxW = parseFloat(textBox.style.width) || 200;
        const boxH = parseFloat(textBox.style.height) || 60;

        const canvasWidth = designerCanvas.offsetWidth || BASE_CANVAS_WIDTH;
        const numSlides = Math.max(1, Math.round(canvasWidth / BASE_CANVAS_WIDTH));
        const slideIndex = Math.max(0, Math.min(editingSlideIndex, numSlides - 1));
        const left = slideIndex * BASE_CANVAS_WIDTH + (BASE_CANVAS_WIDTH - boxW) / 2;
        const top = (BASE_CANVAS_HEIGHT - boxH) / 2;
        textBox.style.left = left + 'px';
        textBox.style.top = top + 'px';

        const id = 'text2-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
        textBox.id = id;

        if (!layerState.nextZIndex || layerState.nextZIndex < 200) layerState.nextZIndex = 200;
        const zIndex = layerState.nextZIndex++;
        textBox.style.zIndex = String(zIndex);

        designerCanvas.appendChild(textBox);

        const layer = {
            id: id,
            element: textBox,
            type: 'text',
            isText2: true,
            zIndex: zIndex,
            position: { left: left, top: top },
            size: { width: boxW, height: boxH },
            fontSize: editor.fontSize,
            rotation: 0,
            visible: true,
            disabled: false,
            textContent: data.text,
            style: data.base
        };
        layerState.layers.push(layer);

        if (typeof window.makeElementDraggable === 'function') window.makeElementDraggable(textBox);
        if (typeof window.makeElementSelectable === 'function') window.makeElementSelectable(textBox);
        registerWithImageTransform(textBox);

        if (typeof window.selectLayer === 'function') window.selectLayer(textBox);
        if (typeof window.saveState === 'function') window.saveState();
        if (typeof window.refreshBackgroundPalette === 'function') window.refreshBackgroundPalette();
        return textBox;
    }

    function updateText2Element(textBox, data) {
        if (typeof window.saveState === 'function') window.saveState();

        const state = {
            boxW: textBox.offsetWidth || 200,
            boxH: textBox.offsetHeight || 60
        };
        renderContentToElement(textBox, data, state);
        registerWithImageTransform(textBox);

        const contentEl = textBox.querySelector('.ss-text-content');
        const boxW = parseFloat(textBox.style.width) || state.boxW;
        const boxH = parseFloat(textBox.style.height) || state.boxH;
        if (!textBox.classList.contains('ss-text2-element')) textBox.classList.add('ss-text2-element');

        const idx = layerState.layers.findIndex(function (l) { return l.element === textBox; });
        if (idx !== -1) {
            const layer = layerState.layers[idx];
            layer.textContent = data.text;
            layer.fontSize = editor.fontSize;
            layer.size = { width: boxW, height: boxH };
            layer.style = data.base;
            layerState.layers[idx] = layer;
        }
        if (typeof window.saveState === 'function') window.saveState();
        if (typeof window.refreshBackgroundPalette === 'function') window.refreshBackgroundPalette();
    }

    // ------------------------------------------------------------------
    // Selection helpers
    // ------------------------------------------------------------------
    function getSelectedText2Element() {
        const sel = layerState.selectedLayer;
        if (sel && sel.classList && sel.classList.contains('ss-text2-element')) return sel;
        return null;
    }

    // The sidebar button reads "Update Text" when a text is selected,
    // otherwise "Add Text".
    function updateAddTextButton() {
        const btn = document.getElementById('ss-addTextBtn');
        if (!btn) return;
        btn.textContent = getSelectedText2Element() ? 'Update Text' : 'Add Text';
    }

    // ------------------------------------------------------------------
    // Small utils
    // ------------------------------------------------------------------
    function parseFontName(family) {
        if (!family) return DEFAULT_FONT;
        const first = family.split(',')[0].trim().replace(/['"]/g, '');
        return first || DEFAULT_FONT;
    }

    // ------------------------------------------------------------------
    // Bootstrap
    // ------------------------------------------------------------------
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.SSTextEditor2 = {
        open: open,
        close: close,
        isText2Element: function (el) { return !!(el && el.classList && el.classList.contains('ss-text2-element')); },
        getSelected: getSelectedText2Element,
        updateAddTextButton: updateAddTextButton,
        renderContentToElement: renderContentToElement,
        registerWithImageTransform: registerWithImageTransform,
        isText2Element: function (el) { return !!(el && el.classList && el.classList.contains('ss-text2-element')); }
    };
})();
