import { layerState } from './state.js';

(function(){
    let popup, overlay, modalContent, closeBtn, canvas, viewport;
    let lastActiveElement = null;
    let resizeObserver = null;
    let lastValidHTML = '';
    let restoring = false;
    let matchBtn = null;
    let matchCircle = null;
    let matchState = false;
    let colorPicker = null;
    let fontButton = null;
    let fontPanel = null;
    let fontPanelOpen = false;
    let editTextBtn = null;
    let fontDropdownList = null;
    let fontDropdownItems = [];
    let fontDropdownOpen = false;
    let previewedFont = null;
    let allCapsBtn = null;
    let clearCustomBtn = null;
    let allCapsActive = false;
    let selectedFont = 'Trebuchet MS';
    let fontSizeInput = null;
    let textColorPicker = null;
    let textColorHex = null;
    let fontUploadInput = null;
    let uploadFontBtn = null;
    let uploadedFonts = [];
    let fontUploadFeedback = null;
    let fontUploadFeedbackTimer = null;
    let googleFontBtn = null;
    let googleFontPopup = null;
    let googleFontOverlay = null;
    let googleFontInput = null;
    let googleFontPopupClose = null;
    let googleFontsLink = null;
    let googleFontEscapeAttached = false;
    const googleFontCssRefs = new Map();
    let fontUploadFeedbackMessage = null;
    let fontUploadFeedbackClose = null;
    let editingTextBox = null; // Track which text box is being edited
    const baseFonts = [
        'Trebuchet MS',
        'Arial',
        'Times New Roman',
        'Verdana',
        'Tahoma',
        'Georgia',
        'Calibri',
        'Cambria',
        'Garamond',
        'Courier New',
        'Helvetica',
        'Gill Sans',
        'Futura',
        'Avenir',
        'Inter',
        'Roboto',
        'Open Sans',
        'Lato',
        'Montserrat',
        'Nunito',
        'Source Sans Pro',
        'Noto Sans',
        'Work Sans',
        'Poppins',
        'JetBrains Mono',
        'Urban Jungle',
        'BlowBrush',
        'Graffonti',
        'Trashhand',
        'Streetwear'
    ];
    const supportedFontExtensions = ['ttf', 'otf', 'woff', 'woff2'];
    const PERSISTED_FONTS_KEY = 'ssTextEditorCustomFonts';
    const defaultFontSize = 64;
    const defaultEditorColor = '#121212';
    const defaultEditorPrompt = 'Enter your text here, clicking anywhere in the text editor removes it, restoring the text only if the text editor is empty.';
    const defaultTextAlign = 'left';
    const EDITOR_CANVAS_WIDTH = 1080;
    const EDITOR_CANVAS_HEIGHT = 1920;
    const MIN_CANVAS_SCALE = 0.05;
    const SCALE_STOP_EARLY_FACTOR = 1.5; // Keep the editor from shrinking past 50% of the previous limit
    let suppressPlaceholderFocus = false;

    // Alignment button variables and state
    let alignButtons = {};
    let currentAlign = 'left';
    let previewAlign = null;
    
    // Formatting button variables and state
    let formatButtons = {};
    let formatStates = {
        bold: false,
        italic: false,
        underline: false,
        strikethrough: false
    };
    let previewFormat = null;
    
    function initAlignmentButtons() {
        alignButtons.left = document.getElementById('ss-textAlignLeftBtn');
        alignButtons.center = document.getElementById('ss-textAlignCenterBtn');
        alignButtons.right = document.getElementById('ss-textAlignRightBtn');
        alignButtons.justify = document.getElementById('ss-textAlignJustifyBtn');
        
        Object.values(alignButtons).forEach(button => {
            if (!button) return;
            const align = button.dataset.align;
            
            button.addEventListener('click', () => {
                applyAlignment(align);
            });
            
            button.addEventListener('mouseenter', () => {
                previewAlignment(align);
            });
            
            button.addEventListener('mouseleave', () => {
                revertAlignmentPreview();
            });
        });
        
        // Set initial state
        updateAlignmentButtons(currentAlign);
        // Sync preview to any editing text box
        syncEditingTextBoxFromCanvas();
    }
    
    function previewAlignment(align) {
        if (!canvas || !align) return;
        previewAlign = align;
        canvas.style.textAlign = align;
    }
    
    function revertAlignmentPreview() {
        if (!canvas || !previewAlign) return;
        previewAlign = null;
        canvas.style.textAlign = currentAlign;
    }
    
    function applyAlignment(align) {
        if (!canvas || !align) return;
        currentAlign = align;
        previewAlign = null;
        canvas.style.textAlign = align;
        updateAlignmentButtons(align);
        // Sync changes to any editing text box
        syncEditingTextBoxFromCanvas();
    }
    
    function updateAlignmentButtons(align) {
        Object.entries(alignButtons).forEach(([key, button]) => {
            if (!button) return;
            const isActive = key === align;
            button.setAttribute('aria-pressed', String(isActive));
            if (isActive) {
                button.classList.add('ss-text-tool-action');
            } else {
                button.classList.remove('ss-text-tool-action');
            }
        });
    }
    
    function initFormattingButtons() {
        formatButtons.bold = document.getElementById('ss-textBoldBtn');
        formatButtons.italic = document.getElementById('ss-textItalicBtn');
        formatButtons.underline = document.getElementById('ss-textUnderlineBtn');
        formatButtons.strikethrough = document.getElementById('ss-textStrikethroughBtn');
        
        Object.entries(formatButtons).forEach(([format, button]) => {
            if (!button) return;
            
            button.addEventListener('click', () => {
                toggleFormat(format);
            });
            
            button.addEventListener('mouseenter', () => {
                previewFormatting(format);
            });
            
            button.addEventListener('mouseleave', () => {
                revertFormattingPreview();
            });
        });
        
        // Set initial states
        Object.keys(formatStates).forEach(format => {
            updateFormattingButton(format, formatStates[format]);
        });
    }
    
    function previewFormatting(format) {
        if (!canvas || !format) return;
        previewFormat = format;
        const tempState = !formatStates[format];
        applyFormatStyle(format, tempState);
    }
    
    function revertFormattingPreview() {
        if (!canvas || !previewFormat) return;
        const format = previewFormat;
        previewFormat = null;
        applyFormatStyle(format, formatStates[format]);
    }
    
    function toggleFormat(format) {
        if (!canvas || !format) return;
        previewFormat = null;
        formatStates[format] = !formatStates[format];
        applyFormatStyle(format, formatStates[format]);
        updateFormattingButton(format, formatStates[format]);
    }
    
    function applyFormatStyle(format, active) {
        if (!canvas) return;
        
        switch (format) {
            case 'bold':
                if (!applyStyleToSelection({ fontWeight: active ? 'bold' : 'normal' })) {
                    canvas.style.fontWeight = active ? 'bold' : 'normal';
                }
                break;
            case 'italic':
                if (!applyStyleToSelection({ fontStyle: active ? 'italic' : 'normal' })) {
                    canvas.style.fontStyle = active ? 'italic' : 'normal';
                }
                break;
            case 'underline':
            case 'strikethrough':
                // Handle text decoration (underline and strikethrough)
                let decorations = [];
                const isUnderline = format === 'underline' ? active : formatStates.underline;
                const isStrikethrough = format === 'strikethrough' ? active : formatStates.strikethrough;
                
                if (isUnderline) decorations.push('underline');
                if (isStrikethrough) decorations.push('line-through');
                
                const decorationValue = decorations.join(' ') || 'none';
                if (!applyStyleToSelection({ textDecoration: decorationValue })) {
                    canvas.style.textDecoration = decorationValue;
                }
                break;
        }
        // Sync changes to any editing text box
        syncEditingTextBoxFromCanvas();
    }
    
    function updateFormattingButton(format, active) {
        const button = formatButtons[format];
        if (!button) return;
        button.setAttribute('aria-pressed', String(active));
        if (active) {
            button.classList.add('ss-text-tool-action');
        } else {
            button.classList.remove('ss-text-tool-action');
        }
    }

    function init(){
        popup = document.getElementById('ss-textPopup');
        overlay = document.getElementById('ss-textPopupOverlay');
        modalContent = document.querySelector('.ss-text-popup-content');
        closeBtn = document.getElementById('ss-textPopupClose');
        canvas = document.getElementById('ss-textEditorCanvas');
        viewport = document.getElementById('ss-textEditorViewport');

        if (!popup || !overlay || !modalContent) return;

        if (canvas) {
            canvas.style.fontSize = `${defaultFontSize}px`;
            canvas.style.color = defaultEditorColor;
        }

        overlay.addEventListener('click', close);
        if (closeBtn) closeBtn.addEventListener('click', close);
        popup.addEventListener('click', (event) => { if (event.target === popup) close(); });

        document.addEventListener('keydown', function(e) {
            if (!popup || popup.style.display === 'none') return;
            if (e.key === 'Escape') {
                close();
                return;
            }
            if (e.key === 'Tab' && e.target !== canvas) {
                const focusable = modalContent.querySelectorAll('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])');
                if (!focusable || focusable.length === 0) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        });

        if (canvas) {
            canvas.addEventListener('input', handleInput);
            canvas.addEventListener('focus', handleEditorFocus);
            canvas.addEventListener('blur', handleEditorBlur);
            canvas.addEventListener('mousedown', handleEditorPointer);
        }

        setEditorPlaceholderIfEmpty();

        if (canvas && viewport && typeof ResizeObserver !== 'undefined') {
            resizeObserver = new ResizeObserver(scaleCanvas);
            resizeObserver.observe(viewport);
        }

        matchBtn = document.getElementById('ss-textMatchSlideBtn');
        matchCircle = matchBtn ? matchBtn.querySelector('#canvas-circle') : null;
        if (matchBtn) {
            matchBtn.addEventListener('click', toggleMatchState);
            matchBtn.setAttribute('aria-pressed', String(matchState));
        }

        fontButton = document.getElementById('ss-textFontBtn');
        fontPanel = document.getElementById('ss-textFontPanel');
        editTextBtn = document.getElementById('ss-textEditBtn');
        allCapsBtn = document.getElementById('ss-textAllCapsBtn');
        clearCustomBtn = document.getElementById('ss-textClearCustomBtn');
        fontUploadFeedback = document.getElementById('ss-fontUploadFeedback');
        fontUploadFeedbackMessage = fontUploadFeedback ? fontUploadFeedback.querySelector('.ss-font-upload-toast__message') : null;
        fontUploadFeedbackClose = fontUploadFeedback ? fontUploadFeedback.querySelector('.ss-font-upload-toast__close') : null;
        if (fontUploadFeedback) {
            fontUploadFeedback.setAttribute('aria-hidden', 'true');
        }
        if (fontUploadFeedbackClose) {
            fontUploadFeedbackClose.addEventListener('click', () => {
                clearTimeout(fontUploadFeedbackTimer);
                if (fontUploadFeedbackMessage) fontUploadFeedbackMessage.textContent = '';
                if (fontUploadFeedback) {
                    fontUploadFeedback.classList.remove('visible');
                    fontUploadFeedback.setAttribute('aria-hidden', 'true');
                }
            });
        }
        initFontControls();
        setFontPanelState(fontPanelOpen);

        colorPicker = document.getElementById('ss-slideColorPicker');
        const colorHex = document.getElementById('ss-slideColorHex');
        [colorPicker, colorHex].forEach(input => {
            if (input) input.addEventListener('input', handleSlideColorChange);
        });

        updateCircleColor(getSlideCanvasColor());

        window.SSTextEditor = { open: open, close: close };
    }

    function scaleCanvas() {
        if (!canvas || !viewport) return;

        if (canvas.parentElement !== viewport) {
            viewport.appendChild(canvas);
        }

        const availableWidth = viewport.clientWidth;
        const availableHeight = viewport.clientHeight;
        if (!availableWidth || !availableHeight) return;

        const widthScale = availableWidth / EDITOR_CANVAS_WIDTH;
        const heightScale = availableHeight / EDITOR_CANVAS_HEIGHT;
        let scale = heightScale;
        if (widthScale < scale) scale = widthScale;
        if (scale > 1) scale = 1;

        canvas.style.left = '50%';
        canvas.style.top = '0px';
        canvas.style.transformOrigin = 'top center';
        canvas.style.transform = `translateX(-50%) scale(${scale})`;
        canvas.scrollTop = 0;
        if (viewport) viewport.scrollTop = 0;
    }

    function resetCanvasTransform() {
        if (!canvas) return;
        canvas.style.transform = '';
        canvas.style.left = '0px';
        canvas.style.top = '0px';
        canvas.style.transformOrigin = 'top left';
    }

    function handleInput() {
        if (restoring || !canvas) return;
        if (isOverflowing()) {
            restoring = true;
            canvas.innerHTML = lastValidHTML;
            moveCaretToEnd();
            restoring = false;
            scaleCanvas();
            return;
        }
        lastValidHTML = canvas.innerHTML;
        scaleCanvas();
        updateAddToPageButton();
        // If editing an existing text box, preview the edits live on the canvas
        if (editingTextBox && editingTextBox.parentNode === document.getElementById('ss-designer-canvas')) {
            previewExistingTextBox(editingTextBox);
        }
    }

    // Debounced live preview update for the currently editing text box
    let previewTimer = null;
    function previewExistingTextBox(textBox) {
        if (!textBox || !canvas) return;
        // Debounce frequent redraws while typing
        if (previewTimer) clearTimeout(previewTimer);
        previewTimer = setTimeout(function() {
            try {
                const htmlContent = canvas.innerHTML;
                const computedStyle = window.getComputedStyle(canvas);
                // Apply content and styles
                const inner = textBox.querySelector && textBox.querySelector('.ss-text-content');
                if (inner) inner.innerHTML = htmlContent; else textBox.innerHTML = '<div class="ss-text-content">' + htmlContent + '</div>';
                applyStylesToTextBox(textBox, computedStyle);
                // Recalculate size using a hidden clone
                const clone = textBox.cloneNode(true);
                clone.style.position = 'absolute';
                clone.style.visibility = 'hidden';
                clone.style.left = '-9999px';
                clone.style.top = '-9999px';
                clone.style.width = 'auto';
                clone.style.height = 'auto';
                const parent = textBox.parentNode || document.getElementById('ss-designer-canvas');
                parent.appendChild(clone);
                const newWidth = Math.min(clone.scrollWidth, 1080);
                const newHeight = clone.scrollHeight;
                parent.removeChild(clone);
                textBox.style.width = newWidth + 'px';
                textBox.style.height = newHeight + 'px';
                // Update layerState if present
                if (layerState && Array.isArray(layerState.layers)) {
                    const layerIndex = layerState.layers.findIndex(l => l.element === textBox);
                    if (layerIndex !== -1) {
                        const layer = layerState.layers[layerIndex];
                        layer.textContent = htmlContent;
                        layer.size = layer.size || {};
                        layer.size.width = newWidth;
                        layer.size.height = newHeight;
                        layer.fontSize = parseInt(computedStyle.fontSize) || layer.fontSize;
                        layerState.layers[layerIndex] = layer;
                    }
                }
            } catch (err) {
                console.error('Error previewing text box', err);
            }
        }, 120);
    }

    function syncEditingTextBoxFromCanvas() {
        if (!editingTextBox || editingTextBox.parentNode !== document.getElementById('ss-designer-canvas')) return;
        previewExistingTextBox(editingTextBox);
    }

    function updateAddToPageButton() {
        const addToPageBtn = document.querySelector('.ss-add-to-page-btn');
        if (!addToPageBtn || !canvas) return;
        // Determine whether the canvas contains real text (not the placeholder)
        const plainText = canvas.textContent.trim();
        const isPlaceholder = canvas.dataset.placeholder === 'true' || plainText === defaultEditorPrompt;
        const hasText = plainText.length > 0 && !isPlaceholder;
        // Keep the button visible at all times, but disable it when there's no real text
        addToPageBtn.style.display = 'inline-flex';
        addToPageBtn.disabled = !hasText;
        // Also set an aria-disabled attribute for better accessibility
        try { addToPageBtn.setAttribute('aria-disabled', String(!hasText)); } catch (e) {}
    }

    function isOverflowing() {
        if (!canvas) return false;
        return canvas.scrollHeight > canvas.clientHeight || canvas.scrollWidth > canvas.clientWidth;
    }

    function moveCaretToEnd() {
        if (!canvas) return;
        const range = document.createRange();
        range.selectNodeContents(canvas);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }

    function toggleMatchState() {
        setMatchState(!matchState);
    }

    function setMatchState(active) {
        matchState = active;
        if (matchBtn) matchBtn.setAttribute('aria-pressed', String(matchState));
        animateMatchIcon(matchState);
        applyMatchBackground();
        updateCircleColor(getSlideCanvasColor());
    }

    function applyMatchBackground() {
        if (!canvas) return;
        canvas.style.backgroundColor = matchState ? getSlideCanvasColor() : '#ffffff';
    }

    function syncMatchButtonAppearance() {
        if (matchBtn) matchBtn.setAttribute('aria-pressed', String(matchState));
        applyMatchBackground();
        updateCircleColor(getSlideCanvasColor());
    }

    function animateMatchIcon(active) {
        if (!matchCircle) return;
        matchCircle.classList.remove('expanding', 'contracting');
        matchCircle.classList.add(active ? 'expanding' : 'contracting');
    }

    function initFontControls() {
        if (!fontButton) return;
        fontDropdownList = document.getElementById('ss-textFontDropdownList');
        fontUploadInput = document.getElementById('ss-fontUploadInput');
        uploadFontBtn = document.getElementById('ss-googleFontUploadBtn');
        selectedFont = getInitialFont();
        loadPersistedFonts();
        updateFontButtonLabel(selectedFont);
        renderFontOptions();
        attachFontUploadHandlers();
        googleFontBtn = document.getElementById('ss-textAddGoogleBtn');
        googleFontPopup = document.getElementById('ss-googleFontPopup');
        googleFontOverlay = document.getElementById('ss-googleFontOverlay');
        googleFontInput = document.getElementById('ss-googleFontInput');
        googleFontPopupClose = document.getElementById('ss-googleFontPopupClose');
        googleFontsLink = document.getElementById('ss-googleFontsLink');
        attachGoogleFontPopupHandlers();
        fontButton.addEventListener('click', function(event) {
            event.stopPropagation();
            toggleFontDropdown();
        });
        if (editTextBtn) {
            editTextBtn.addEventListener('click', function(event) {
                event.stopPropagation();
                toggleFontPanel();
            });
        }
        document.addEventListener('click', handleDocumentClickOutsideFontDropdown);
        toggleFontDropdown(false);
        fontSizeInput = document.getElementById('ss-textFontSizeInput');
        textColorPicker = document.getElementById('ss-textColorPicker');
        textColorHex = document.getElementById('ss-textColorHex');
        if (fontSizeInput) {
            const computedSize = clampFontSize(parseInt(window.getComputedStyle(canvas || document.body).fontSize, 10) || defaultFontSize);
            fontSizeInput.value = computedSize;
            fontSizeInput.addEventListener('input', handleFontSizeChange);
        }
        if (textColorPicker) textColorPicker.addEventListener('input', handleFontColorInput);
        if (textColorHex) textColorHex.addEventListener('input', handleFontColorHexInput);
        syncTextColorControls(defaultEditorColor);
        if (allCapsBtn) allCapsBtn.addEventListener('click', toggleAllCaps);
        if (clearCustomBtn) clearCustomBtn.addEventListener('click', resetEditorCustomizations);
        
        // Initialize alignment buttons
        initAlignmentButtons();
        // Initialize formatting buttons
        initFormattingButtons();
        
        // Initialize Apply button
        const addToPageBtn = document.querySelector('.ss-add-to-page-btn');
        if (addToPageBtn) {
            addToPageBtn.addEventListener('click', handleAddToPage);
        }
    }

    function renderFontOptions() {
        if (!fontDropdownList) return;
        fontDropdownList.innerHTML = '';
        const appendFont = (fontName, options = {}) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'ss-text-font-option';
            button.dataset.font = fontName;
            button.style.fontFamily = `'${fontName}', ${options.fallback || 'Trebuchet MS, sans-serif'}`;
            const label = document.createElement('span');
            label.className = 'ss-font-label';
            label.textContent = options.displayName || fontName;
            label.style.fontFamily = button.style.fontFamily;
            button.appendChild(label);
            if (options.uploaded && options.id) {
                button.classList.add('ss-text-font-option--uploaded');
                button.dataset.fontId = options.id;
                const remove = document.createElement('span');
                remove.className = 'ss-font-remove';
                remove.setAttribute('role', 'button');
                remove.setAttribute('aria-label', `Remove ${options.displayName || fontName}`);
                remove.textContent = '×';
                remove.addEventListener('click', event => {
                    event.stopPropagation();
                    removeUploadedFont(options.id);
                });
                button.appendChild(remove);
            }
            fontDropdownList.appendChild(button);
        };

        appendFont(baseFonts[0]);
        uploadedFonts.forEach(font => appendFont(font.family, {
            uploaded: true,
            id: font.id,
            displayName: font.displayName,
            fallback: 'Trebuchet MS, sans-serif'
        }));
        baseFonts.slice(1).forEach(font => appendFont(font));
        fontDropdownItems = fontDropdownList ? Array.from(fontDropdownList.querySelectorAll('.ss-text-font-option')) : [];
        attachFontOptionEvents();
        markDropdownSelection(selectedFont);
    }

    function attachFontOptionEvents() {
        if (!fontDropdownItems || fontDropdownItems.length === 0) return;
        fontDropdownItems.forEach(option => {
            option.addEventListener('click', handleFontOptionClick);
            option.addEventListener('mouseenter', () => previewFont(option.dataset.font));
            option.addEventListener('mouseleave', revertFontPreview);
        });
    }

    function handleFontOptionClick(event) {
        const option = event.currentTarget;
        if (!option) return;
        event.stopPropagation();
        applyFontSelection(option.dataset.font);
    }

    function attachFontUploadHandlers() {
        if (uploadFontBtn && fontUploadInput) {
            uploadFontBtn.addEventListener('click', () => fontUploadInput.click());
        }
        if (fontUploadInput) {
            fontUploadInput.addEventListener('change', handleFontUploadFiles);
        }
    }

    function attachGoogleFontPopupHandlers() {
        if (googleFontBtn) googleFontBtn.addEventListener('click', openGoogleFontPopup);
        if (googleFontOverlay) googleFontOverlay.addEventListener('click', closeGoogleFontPopup);
        if (googleFontPopupClose) googleFontPopupClose.addEventListener('click', closeGoogleFontPopup);
        if (googleFontInput) googleFontInput.addEventListener('input', handleGoogleFontInput);
        if (googleFontsLink) googleFontsLink.addEventListener('click', openExternalGoogleFonts);
        if (!googleFontEscapeAttached) {
            document.addEventListener('keydown', handleGoogleFontEscape);
            googleFontEscapeAttached = true;
        }
    }

    function handleGoogleFontEscape(event) {
        if (event.key === 'Escape' && googleFontPopup && googleFontPopup.classList.contains('ss-google-font-popup--open')) {
            closeGoogleFontPopup();
        }
    }

    function openGoogleFontPopup() {
        if (!googleFontPopup) return;
        googleFontPopup.classList.add('ss-google-font-popup--open');
        googleFontPopup.setAttribute('aria-hidden', 'false');
        if (googleFontInput) {
            googleFontInput.focus();
            googleFontInput.select();
        }
    }

    function closeGoogleFontPopup() {
        if (!googleFontPopup) return;
        googleFontPopup.classList.remove('ss-google-font-popup--open');
        googleFontPopup.setAttribute('aria-hidden', 'true');
    }

    function handleGoogleFontInput(event) {
        const value = (event && event.target && event.target.value) ? event.target.value.trim() : '';
        if (!value || !value.includes('fonts.googleapis.com')) return;
        const { urls, families } = parseGoogleFontSnippet(value);
        if (!urls.length || !families.length) return;
        const addedSet = new Set();
        const ignoredMap = new Map();
        urls.forEach(url => {
            const familiesForUrl = extractFamiliesFromUrl(url);
            const result = ensureGoogleFontsFromUrl(url, familiesForUrl);
            if (result.added && result.added.length) {
                result.added.forEach(name => addedSet.add(name));
            }
            if (result.ignored && result.ignored.length) {
                result.ignored.forEach(item => {
                    const list = ignoredMap.get(item.reason) || [];
                    if (!list.includes(item.name)) list.push(item.name);
                    ignoredMap.set(item.reason, list);
                });
            }
        });
        const addedList = Array.from(addedSet);
        const ignoredSummary = Array.from(ignoredMap.entries()).map(([reason, names]) => ({ reason, names }));
        if (!addedList.length && !ignoredSummary.length) return;
        updateGoogleFontStatus('Imported', addedList, ignoredSummary);
    }

    function parseGoogleFontSnippet(value) {
        const urls = new Set();
        const families = new Set();
        const urlRegex = /https:\/\/fonts\.googleapis\.com\/css2\?[^'"\s>]+/gi;
        let match;
        while ((match = urlRegex.exec(value))) {
            const url = match[0];
            urls.add(url);
            extractFamiliesFromUrl(url).forEach(family => families.add(family));
        }
        const preconnectRegex = /<link[^>]*rel=["']preconnect["'][^>]*>/gi;
        while ((match = preconnectRegex.exec(value))) {
            const temp = document.createElement('div');
            temp.innerHTML = match[0];
            const link = temp.querySelector('link');
            if (link) appendPreconnectLink(link);
        }
        return { urls: Array.from(urls), families: Array.from(families) };
    }

    function extractFamiliesFromUrl(url) {
        if (!url) return [];
        try {
            const parsed = new URL(url);
            const params = parsed.searchParams.getAll('family');
            return params.map(param => decodeURIComponent(param).split(':')[0].replace(/\+/g, ' ').trim()).filter(Boolean);
        } catch (error) {
            return [];
        }
    }

    function ensureGoogleFontsFromUrl(url, targetFamilies, skipRender) {
        if (!url) return { added: [], ignored: [] };
        const entry = ensureGoogleFontLink(url);
        const families = (targetFamilies && targetFamilies.length) ? targetFamilies : extractFamiliesFromUrl(url);
        const added = [];
        const ignored = [];
        families.forEach(name => {
            const normalized = (name || '').trim();
            if (!normalized) return;
            if (uploadedFonts.some(font => font.family === normalized)) {
                ignored.push({ name: normalized, reason: 'Already uploaded' });
                return;
            }
            const id = `google-${normalized.replace(/[^a-z0-9]+/gi, '-')}-${Date.now()}`;
            const info = { id, family: normalized, displayName: normalized, url, cssUrl: url, source: 'google' };
            uploadedFonts.push(info);
            if (entry) entry.count += 1;
            added.push(normalized);
        });
        if (added.length) {
            if (!skipRender) renderFontOptions();
            persistFontsState();
        }
        return { added, ignored };
    }

    function ensureGoogleFontLink(url) {
        if (!url) return null;
        let entry = googleFontCssRefs.get(url);
        if (entry) return entry;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = url;
        link.crossOrigin = 'anonymous';
        document.head.appendChild(link);
        entry = { element: link, count: 0 };
        googleFontCssRefs.set(url, entry);
        return entry;
    }

    function openExternalGoogleFonts() {
        const url = 'https://fonts.google.com';
        window.open(url, '_blank', 'noopener,noreferrer');
    }

    function persistFontsState() {
        if (typeof localStorage === 'undefined') return;
        try {
            const payload = uploadedFonts.map(font => {
                const entry = {
                    family: font.family,
                    displayName: font.displayName,
                    source: font.source || 'file'
                };
                if (font.fileName) entry.fileName = font.fileName;
                if (entry.source === 'google' && font.cssUrl) entry.cssUrl = font.cssUrl;
                if (entry.source === 'file' && font.dataUrl) {
                    entry.dataUrl = font.dataUrl;
                    entry.mime = font.mime;
                }
                return entry;
            });
            localStorage.setItem(PERSISTED_FONTS_KEY, JSON.stringify(payload));
        } catch (error) {
            console.warn('Unable to persist fonts', error);
        }
    }

    function loadPersistedFonts() {
        if (typeof localStorage === 'undefined') return;
        const stored = localStorage.getItem(PERSISTED_FONTS_KEY);
        if (!stored) return;
        try {
            const entries = JSON.parse(stored);
            entries.forEach(entry => {
                if (entry.source === 'google' && entry.cssUrl && entry.family) {
                    ensureGoogleFontsFromUrl(entry.cssUrl, [entry.family], true);
                } else if (entry.source === 'file' && entry.dataUrl && entry.family) {
                    ensurePersistedFileFont(entry);
                }
            });
        } catch (error) {
            console.warn('Unable to load persisted fonts', error);
        }
    }

    function ensurePersistedFileFont(entry) {
        if (uploadedFonts.some(font => font.family === entry.family)) return;
        const id = `${entry.family}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const face = new FontFace(entry.family, `url(${entry.dataUrl})`);
        face.load().then(() => document.fonts.add(face)).catch(error => {
            console.warn('Failed to load persisted font', entry.family, error);
        });
        const info = {
            id,
            family: entry.family,
            displayName: entry.displayName || entry.family,
            fileName: entry.fileName || entry.family,
            dataUrl: entry.dataUrl,
            mime: entry.mime,
            source: 'file'
        };
        uploadedFonts.push(info);
    }

    let googleFontInputClearTimer = null;
    function scheduleGoogleFontInputClear() {
        clearTimeout(googleFontInputClearTimer);
        googleFontInputClearTimer = window.setTimeout(() => {
            if (googleFontInput) googleFontInput.value = '';
        }, 5000);
    }

    function updateGoogleFontStatus(label, detailLines = [], ignoredSummary = []) {
        if (!googleFontInput) return;
        const count = detailLines.length;
        const noun = count === 1 ? 'font' : 'fonts';
        const firstLine = `${label} ${count} ${noun}`;
        const detailLine = detailLines.length ? detailLines.join(', ') : 'No new fonts';
        let text = `${firstLine}\n${detailLine}`;
        ignoredSummary.forEach(summary => {
            if (!summary.names || !summary.names.length) return;
            const ignoredCount = summary.names.length;
            const ignoredNoun = ignoredCount === 1 ? 'font' : 'fonts';
            text += `\nIgnored ${ignoredCount} ${ignoredNoun} (${summary.reason}): ${summary.names.join(', ')}`;
        });
        googleFontInput.value = text;
        scheduleGoogleFontInputClear();
    }

    function releaseGoogleFontLink(url) {
        if (!url) return;
        const entry = googleFontCssRefs.get(url);
        if (!entry) return;
        entry.count -= 1;
        if (entry.count <= 0) {
            if (entry.element && entry.element.parentNode) entry.element.parentNode.removeChild(entry.element);
            googleFontCssRefs.delete(url);
        }
    }

    function appendPreconnectLink(linkNode) {
        if (!linkNode || !linkNode.href) return;
        const selector = `link[rel="preconnect"][href="${linkNode.href}"]`;
        if (document.head.querySelector(selector)) return;
        const preconnect = document.createElement('link');
        preconnect.rel = 'preconnect';
        preconnect.href = linkNode.href;
        if (linkNode.crossOrigin !== null) preconnect.crossOrigin = linkNode.getAttribute('crossorigin') || '';
        document.head.appendChild(preconnect);
    }

    async function handleFontUploadFiles(event) {
        const files = event.target.files;
        if (!files || files.length === 0) return;
        const loadedFonts = [];
        const ignoredUploads = [];
        const tasks = Array.from(files).map(async file => {
            const extension = getFileExtension(file.name);
            if (!supportedFontExtensions.includes(extension)) return;
            const result = await addUploadedFont(file);
            if (result && result.added) {
                loadedFonts.push(result.added);
            }
            if (result && result.ignored) {
                ignoredUploads.push(result.ignored);
            }
        });
        await Promise.all(tasks);
        fontUploadInput.value = '';
        showFontUploadFeedback(loadedFonts);
        let ignoredSummary = [];
        if (ignoredUploads.length) {
            const grouped = new Map();
            ignoredUploads.forEach(entry => {
                const list = grouped.get(entry.reason) || [];
                if (!list.includes(entry.name)) list.push(entry.name);
                grouped.set(entry.reason, list);
            });
            ignoredSummary = Array.from(grouped.entries()).map(([reason, names]) => ({ reason, names }));
        }
        if (loadedFonts.length || ignoredSummary.length) {
            const addedDetails = loadedFonts.map(info => `${info.displayName} (${info.fileName})`);
            updateGoogleFontStatus('Uploaded', addedDetails, ignoredSummary);
        }
    }


    function getFileExtension(name) {
        if (!name) return '';
        const parts = name.toLowerCase().split('.');
        return parts.length > 1 ? parts.pop() : '';
    }

    function getFontMimeType(name) {
        const extension = getFileExtension(name);
        switch (extension) {
            case 'woff2': return 'font/woff2';
            case 'woff': return 'font/woff';
            case 'otf': return 'font/otf';
            case 'ttf':
            default:
                return 'font/ttf';
        }
    }

    function createDataUrl(buffer, mime) {
        if (!buffer) return '';
        const base64 = arrayBufferToBase64(buffer);
        return `data:${mime};base64,${base64}`;
    }

    function arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
        }
        return window.btoa(binary);
    }

    function showFontUploadFeedback(loaded) {
        if (!fontUploadFeedback) return;
        clearTimeout(fontUploadFeedbackTimer);
        const sanitized = (loaded || []).filter(Boolean);
        if (!sanitized.length) {
            if (fontUploadFeedbackMessage) fontUploadFeedbackMessage.textContent = '';
            fontUploadFeedback.classList.remove('visible');
            fontUploadFeedback.setAttribute('aria-hidden', 'true');
            return;
        }
        const fontDetails = sanitized.map(info => `${info.displayName} (${info.fileName})`);
        const plural = sanitized.length === 1 ? '' : 's';
        const message = `Loaded ${sanitized.length} font${plural}: ${fontDetails.join(', ')}`;
        if (fontUploadFeedbackMessage) {
            fontUploadFeedbackMessage.textContent = message;
        } else {
            fontUploadFeedback.textContent = message;
        }
        fontUploadFeedback.classList.add('visible');
        fontUploadFeedback.setAttribute('aria-hidden', 'false');
        fontUploadFeedbackTimer = window.setTimeout(() => {
            if (fontUploadFeedback) {
                fontUploadFeedback.classList.remove('visible');
                fontUploadFeedback.setAttribute('aria-hidden', 'true');
            }
        }, 4500);
    }

    async function addUploadedFont(file) {
        const safeName = file.name.replace(/\.[^/.]+$/, '').replace(/[^a-zA-Z0-9\s-]/g, '').trim() || 'Custom Font';
        const family = safeName;
        const buffer = await file.arrayBuffer();
        const mime = getFontMimeType(file.name);
        const dataUrl = createDataUrl(buffer, mime);
        if (uploadedFonts.some(font => font.dataUrl === dataUrl)) {
            return {
                added: null,
                ignored: { name: family, reason: 'Already uploaded' }
            };
        }
        if (typeof FontFace === 'function') {
            try {
                const face = new FontFace(family, `url(${dataUrl})`);
                await face.load();
                document.fonts.add(face);
            } catch (error) {
                console.warn('Unable to load uploaded font', file.name, error);
            }
        }
        const id = `${family}-${Date.now()}`;
        const info = { id, family, displayName: safeName, fileName: file.name, dataUrl, mime, source: 'file' };
        uploadedFonts.push(info);
        renderFontOptions();
        persistFontsState();
        return { added: info };
    }

    function removeUploadedFont(id) {
        const font = uploadedFonts.find(entry => entry.id === id);
        if (!font) return;
        uploadedFonts = uploadedFonts.filter(entry => entry.id !== id);
        if (font.url) {
            URL.revokeObjectURL(font.url);
        }
        if (font.cssUrl) releaseGoogleFontLink(font.cssUrl);
        if (selectedFont === font.family) {
            selectedFont = baseFonts[0];
            if (canvas) canvas.style.fontFamily = `${baseFonts[0]}, Trebuchet MS, sans-serif`;
            updateFontButtonLabel(baseFonts[0]);
        }
        renderFontOptions();
        persistFontsState();
    }

    function clearPersistedFonts() {
        try {
            localStorage.removeItem(PERSISTED_FONTS_KEY);
        } catch (error) {
            /* ignore */
        }
        uploadedFonts = [];
        googleFontCssRefs.forEach(entry => {
            if (entry.element && entry.element.parentNode) entry.element.parentNode.removeChild(entry.element);
        });
        googleFontCssRefs.clear();
        renderFontOptions();
    }

    function toggleFontPanel() {
        setFontPanelState(!fontPanelOpen);
    }

    function setFontPanelState(open) {
        fontPanelOpen = open;
        if (modalContent) modalContent.classList.toggle('ss-font-panel-open', fontPanelOpen);
        if (fontPanel) fontPanel.setAttribute('aria-hidden', String(!fontPanelOpen));
        if (editTextBtn) editTextBtn.setAttribute('aria-pressed', String(fontPanelOpen));
        if (!fontPanelOpen) closeFontDropdown();
    }

    function closeFontPanel() {
        setFontPanelState(false);
    }

    function applyFontSelection(font) {
        if (!font) return;
        selectedFont = font;
        previewedFont = null;
        const fontFamilyValue = `${font}, Trebuchet MS, sans-serif`;
        if (!applyStyleToSelection({ fontFamily: fontFamilyValue }) && canvas) {
            canvas.style.fontFamily = fontFamilyValue;
        }
        updateFontButtonLabel(font);
        closeFontPanel();
        // Sync changes to any editing text box
        syncEditingTextBoxFromCanvas();
    }

    function toggleAllCaps() {
        allCapsActive = !allCapsActive;
        if (allCapsBtn) allCapsBtn.setAttribute('aria-pressed', String(allCapsActive));
        if (canvas) canvas.style.textTransform = allCapsActive ? 'uppercase' : '';
        // Sync changes to any editing text box
        syncEditingTextBoxFromCanvas();
    }

    function resetEditorCustomizations() {
        if (!canvas) return;
        canvas.style.textAlign = defaultTextAlign;
        canvas.style.textTransform = '';
        allCapsActive = false;
        if (allCapsBtn) allCapsBtn.setAttribute('aria-pressed', 'false');
        syncTextColorControls(defaultEditorColor);
        applyTextColor(defaultEditorColor);
        if (fontSizeInput) {
            fontSizeInput.value = defaultFontSize;
            applyFontSize(defaultFontSize);
        }
        canvas.style.fontSize = `${defaultFontSize}px`;
        canvas.style.color = defaultEditorColor;
        clearPersistedFonts();
        selectedFont = baseFonts[0];
        updateFontButtonLabel(selectedFont);
        
        // Reset alignment
        currentAlign = defaultTextAlign;
        updateAlignmentButtons(currentAlign);
        
        // Reset formatting
        formatStates = {
            bold: false,
            italic: false,
            underline: false,
            strikethrough: false
        };
        canvas.style.fontWeight = 'normal';
        canvas.style.fontStyle = 'normal';
        canvas.style.textDecoration = '';
        Object.keys(formatStates).forEach(format => {
            updateFormattingButton(format, false);
        });
    }

    function getInitialFont() {
        if (!canvas) return 'Trebuchet MS';
        const computed = window.getComputedStyle(canvas).fontFamily || 'Trebuchet MS';
        return computed.split(',')[0].replace(/['"]/g, '') || 'Trebuchet MS';
    }

    function updateFontButtonLabel(font) {
        if (!fontButton) return;
        const label = fontButton.querySelector('span');
        if (label) label.textContent = font;
        fontButton.style.fontFamily = `${font}, 'Trebuchet MS', sans-serif`;
        markDropdownSelection(font);
    }

    function markDropdownSelection(font) {
        if (!fontDropdownItems || fontDropdownItems.length === 0) return;
        fontDropdownItems.forEach(item => {
            const active = item.dataset.font === font;
            item.setAttribute('aria-selected', active ? 'true' : 'false');
        });
    }

    function toggleFontDropdown(force) {
        if (!fontDropdownList) return;
        const next = typeof force === 'boolean' ? force : !fontDropdownOpen;
        fontDropdownOpen = next;
        fontDropdownList.classList.toggle('open', fontDropdownOpen);
        fontDropdownList.setAttribute('aria-hidden', String(!fontDropdownOpen));
        if (fontButton) fontButton.setAttribute('aria-expanded', String(fontDropdownOpen));
        if (!fontDropdownOpen) revertFontPreview();
    }

    function closeFontDropdown() {
        toggleFontDropdown(false);
    }

    function handleDocumentClickOutsideFontDropdown(event) {
        if (!fontDropdownOpen) return;
        if ((fontDropdownList && fontDropdownList.contains(event.target)) || (fontButton && fontButton.contains(event.target))) return;
        closeFontDropdown();
    }

    function previewFont(font) {
        if (!font || !canvas) return;
        previewedFont = font;
        canvas.style.fontFamily = `${font}, Trebuchet MS, sans-serif`;
    }

    function revertFontPreview() {
        if (!canvas || !previewedFont) return;
        previewedFont = null;
        if (selectedFont) {
            canvas.style.fontFamily = `${selectedFont}, Trebuchet MS, sans-serif`;
        }
    }

    function handleFontSizeChange() {
        if (!fontSizeInput) return;
        const value = clampFontSize(parseInt(fontSizeInput.value, 10) || 0);
        if (!value) return;
        fontSizeInput.value = value;
        applyFontSize(value);
    }

    function handleFontColorInput(event) {
        const color = (event && event.target && event.target.value) ? event.target.value : '#000000';
        syncTextColorControls(color);
        applyTextColor(color);
    }

    function handleFontColorHexInput(event) {
        if (!textColorHex) return;
        let hex = textColorHex.value.trim();
        if (!hex.startsWith('#')) {
            hex = `#${hex}`;
            textColorHex.value = hex;
        }
        if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
        syncTextColorControls(hex);
        applyTextColor(hex);
    }

    function applyFontSize(value) {
        const px = `${value}px`;
        if (!applyStyleToSelection({ fontSize: px }) && canvas) {
            canvas.style.fontSize = px;
        }
        // Sync changes to any editing text box
        syncEditingTextBoxFromCanvas();
    }

    function clampFontSize(value) {
        return Math.min(200, Math.max(8, Math.round(value)));
    }

    function applyTextColor(color) {
        if (!color) return;
        if (!applyStyleToSelection({ color }) && canvas) {
            canvas.style.color = color;
        }
        // Sync changes to any editing text box
        syncEditingTextBoxFromCanvas();
    }

    function syncTextColorControls(color) {
        if (!color) return;
        const normalized = normalizeColorToHex(color);
        if (textColorPicker && textColorPicker.value !== normalized) {
            textColorPicker.value = normalized;
        }
        if (textColorHex && textColorHex.value.toUpperCase() !== normalized.toUpperCase()) {
            textColorHex.value = normalized;
        }
    }

    function normalizeColorToHex(color) {
        if (!color) return '#000000';
        if (color.startsWith('#') && color.length === 7) return color.toUpperCase();
        const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (match) {
            return `#${[1,2,3].map(i => parseInt(match[i], 10).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
        }
        return '#000000';
    }

    function applyStyleToSelection(styles) {
        if (!styles) return false;
        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return false;
        const range = selection.getRangeAt(0);
        const fragment = range.extractContents();
        const span = document.createElement('span');
        Object.keys(styles).forEach(key => {
            span.style[key] = styles[key];
        });
        span.appendChild(fragment);
        range.insertNode(span);
        selection.removeAllRanges();
        const newRange = document.createRange();
        newRange.selectNodeContents(span);
        selection.addRange(newRange);
        return true;
    }

    function setEditorPlaceholderIfEmpty() {
        if (!canvas) return;
        if (canvas.textContent.trim() === '') {
            canvas.textContent = defaultEditorPrompt;
            canvas.dataset.placeholder = 'true';
        }
        // Update button state when placeholder is set
        updateAddToPageButton();
    }

    function clearEditorPlaceholder() {
        if (!canvas) return;
        const current = canvas.textContent.trim();
        if (canvas.dataset.placeholder === 'true' || current === defaultEditorPrompt) {
            canvas.textContent = '';
            canvas.dataset.placeholder = 'false';
        }
        // Update button state after placeholder is cleared
        updateAddToPageButton();
    }

    function handleEditorFocus() {
        if (!suppressPlaceholderFocus) {
            clearEditorPlaceholder();
        }
        if (canvas) lastValidHTML = canvas.innerHTML;
    }

    function handleEditorBlur() {
        setEditorPlaceholderIfEmpty();
    }

    function handleEditorPointer() {
        clearEditorPlaceholder();
        if (canvas) lastValidHTML = canvas.innerHTML;
    }

    function handleSlideColorChange(event) {
        const color = (event && event.target && event.target.value) ? event.target.value : getSlideCanvasColor();
        updateCircleColor(color);
        if (matchState) applyMatchBackground();
        closeFontPanel();
    }

    function updateCircleColor(color) {
        if (!matchCircle) return;
        matchCircle.setAttribute('fill', color);
    }

    function getSlideCanvasColor() {
        if (colorPicker && colorPicker.value) {
            return colorPicker.value;
        }
        const slideCanvas = document.getElementById('ss-designer-canvas');
        if (slideCanvas) {
            return getComputedStyle(slideCanvas).backgroundColor || '#ffffff';
        }
        return '#ffffff';
    }

    function handleAddToPage() {
        if (!canvas) return;
        
        // Get the text content
        const htmlContent = canvas.innerHTML;
        const plainText = canvas.textContent.trim();
        
        // Skip if there's no text or only placeholder
        if (!plainText || plainText === defaultEditorPrompt || canvas.dataset.placeholder === 'true') return;
        
        // Get the designer canvas
        const designerCanvas = document.getElementById('ss-designer-canvas');
        if (!designerCanvas) return;
        
        // Get the computed styles from the canvas
        const computedStyle = window.getComputedStyle(canvas);
        
        // If editing an existing text box, update it
        if (editingTextBox && editingTextBox.parentNode === designerCanvas) {
            updateExistingTextBox(editingTextBox, htmlContent, computedStyle);
            close();
            return;
        }
        
        // Create new text box element
        const textBox = document.createElement('div');
        textBox.className = 'ss-text-element ss-text-box';
        textBox.innerHTML = '<div class="ss-text-content">' + htmlContent + '</div>';
        
        // Apply basic positioning
        textBox.style.position = 'absolute';
        textBox.style.cursor = 'grab';
        textBox.style.outline = 'none';
        textBox.style.transformOrigin = 'center center';
        textBox.style.userSelect = 'none';
        textBox.style.pointerEvents = 'auto';
        
        // Apply styles from the editor
        applyStylesToTextBox(textBox, computedStyle);
        
        // Temporarily add to canvas to measure size
        textBox.style.width = 'auto';
        textBox.style.visibility = 'hidden';
        designerCanvas.appendChild(textBox);

        // Use a hidden clone for accurate measurement
        const clone = textBox.cloneNode(true);
        clone.style.position = 'absolute';
        clone.style.visibility = 'hidden';
        clone.style.left = '-9999px';
        clone.style.top = '-9999px';
        clone.style.width = 'auto';
        clone.style.height = 'auto';
        designerCanvas.appendChild(clone);
        const textWidth = Math.min(clone.scrollWidth, 1080);
        const textHeight = clone.scrollHeight;
        designerCanvas.removeChild(clone);
        textBox.style.width = textWidth + 'px';
        textBox.style.height = textHeight + 'px';

        // Center the text box on the canvas
        const canvasWidth = designerCanvas.offsetWidth;
        const canvasHeight = designerCanvas.offsetHeight;
        const left = (canvasWidth - textWidth) / 2;
        const top = (canvasHeight - textHeight) / 2;

        textBox.style.left = left + 'px';
        textBox.style.top = top + 'px';
        textBox.style.visibility = 'visible';
        
        // Add test click handler to verify element is clickable
        textBox.addEventListener('pointerdown', function(e) {
            console.log('TEXTBOX MOUSEDOWN EVENT FIRED!', e.target);
        });
        textBox.addEventListener('click', function(e) {
            console.log('TEXTBOX CLICK EVENT FIRED!', e.target);
        });

        // Add double-click handler to open editor for this text box
        textBox.addEventListener('dblclick', function(e) {
            e.stopPropagation();
            if (typeof window.openTextEditor === 'function') {
                window.openTextEditor(textBox);
            } else if (typeof open === 'function') {
                open(textBox);
            }
        });
        
        // Add to layer state if available
        if (typeof layerState !== 'undefined' && layerState) {
            const layerId = 'text-' + Date.now();
            textBox.id = layerId;
            
            // Use z-index higher than image canvas (which is at 100)
            // Start text boxes at 200 to be above images
            if (!layerState.nextZIndex || layerState.nextZIndex < 200) {
                layerState.nextZIndex = 200;
            }
            const nextZIndex = layerState.nextZIndex++;
            textBox.style.zIndex = String(nextZIndex);
            
            console.log('Creating text box:', layerId, 'with z-index:', nextZIndex);
            console.log('Text box element:', textBox);
            console.log('Text box in canvas:', designerCanvas.contains(textBox));
            
            const layer = {
                id: layerId,
                element: textBox,
                type: 'text',
                zIndex: nextZIndex,
                position: { left: left, top: top },
                size: { width: textWidth, height: textHeight },
                fontSize: parseInt(computedStyle.fontSize) || 64,
                rotation: 0,
                visible: true,
                disabled: false,
                textContent: htmlContent,
                style: {
                    fontFamily: computedStyle.fontFamily,
                    color: computedStyle.color,
                    fontWeight: computedStyle.fontWeight,
                    fontStyle: computedStyle.fontStyle,
                    textDecoration: computedStyle.textDecoration,
                    textAlign: computedStyle.textAlign
                }
            };
            
            layerState.layers.push(layer);
            console.log('Layer added to state. Total layers:', layerState.layers.length);
            
            // Make it draggable and selectable using global functions
            if (typeof window.makeElementDraggable === 'function') {
                window.makeElementDraggable(textBox);
                console.log('Made text box draggable');
            } else {
                console.error('makeElementDraggable not found');
            }
            if (typeof window.makeElementSelectable === 'function') {
                window.makeElementSelectable(textBox);
                console.log('Made text box selectable');
            } else {
                console.error('makeElementSelectable not found');
            }
            
            // Verify element is clickable
            setTimeout(() => {
                const computed = window.getComputedStyle(textBox);
                console.log('Text box pointer-events:', computed.pointerEvents);
                console.log('Text box z-index:', computed.zIndex);
                console.log('Text box display:', computed.display);
                console.log('Text box visibility:', computed.visibility);
                console.log('Text box position:', computed.position);
                console.log('Text box dimensions:', textBox.offsetWidth, 'x', textBox.offsetHeight);
                console.log('Text box coordinates:', textBox.offsetLeft, ',', textBox.offsetTop);
                console.log('Text box parent:', textBox.parentNode);
                console.log('Text box class list:', textBox.classList.toString());
                
                // Check what's at that position
                const rect = textBox.getBoundingClientRect();
                const elementAtPoint = document.elementFromPoint(rect.left + rect.width/2, rect.top + rect.height/2);
                console.log('Element at text box center:', elementAtPoint);
                console.log('Is it the text box?', elementAtPoint === textBox);
            }, 100);
            
            // Save state if available
            if (typeof window.saveState === 'function') {
                window.saveState();
            }
        }
        
        // Close the text editor
        editingTextBox = null;
        close();
    }
    
    function applyStylesToTextBox(textBox, computedStyle) {
        // If the box contains a designated content wrapper, apply styles there
        const content = textBox.querySelector && textBox.querySelector('.ss-text-content') ? textBox.querySelector('.ss-text-content') : textBox;
        content.style.fontFamily = computedStyle.fontFamily;
        content.style.fontSize = computedStyle.fontSize;
        content.style.color = computedStyle.color;
        content.style.fontWeight = computedStyle.fontWeight;
        content.style.fontStyle = computedStyle.fontStyle;
        content.style.textDecoration = computedStyle.textDecoration;
        content.style.textTransform = computedStyle.textTransform;
        content.style.textAlign = computedStyle.textAlign;
        content.style.lineHeight = computedStyle.lineHeight;
        content.style.letterSpacing = computedStyle.letterSpacing;
        content.style.wordSpacing = computedStyle.wordSpacing;
        content.style.backgroundColor = 'transparent';
        content.style.whiteSpace = 'pre-wrap';
        content.style.wordBreak = 'break-word';
        content.style.overflow = 'visible';
        content.style.boxSizing = 'border-box';
        content.style.padding = '0';
        content.style.margin = '0';
    }
    
    function updateExistingTextBox(textBox, htmlContent, computedStyle) {
        // Save state before update
        if (typeof window.saveState === 'function') {
            window.saveState();
        }
        
        // Update content
        if (!textBox.classList.contains('ss-text-element')) textBox.classList.add('ss-text-element');
        const innerContent = textBox.querySelector && textBox.querySelector('.ss-text-content');
        if (innerContent) innerContent.innerHTML = htmlContent; else textBox.innerHTML = '<div class="ss-text-content">' + htmlContent + '</div>';
        
        // Update styles
        applyStylesToTextBox(textBox, computedStyle);
        
        // Use a hidden clone for accurate measurement
        const clone = textBox.cloneNode(true);
        clone.style.position = 'absolute';
        clone.style.visibility = 'hidden';
        clone.style.left = '-9999px';
        clone.style.top = '-9999px';
        clone.style.width = 'auto';
        clone.style.height = 'auto';
        textBox.parentNode.appendChild(clone);
        const newWidth = Math.min(clone.scrollWidth, 1080);
        const newHeight = clone.scrollHeight;
        textBox.parentNode.removeChild(clone);
        textBox.style.width = newWidth + 'px';
        textBox.style.height = newHeight + 'px';
        
        // Update layer state
        if (typeof layerState !== 'undefined' && layerState) {
            const layerIndex = layerState.layers.findIndex(l => l.element === textBox);
            if (layerIndex !== -1) {
                layerState.layers[layerIndex].textContent = htmlContent;
                layerState.layers[layerIndex].size.width = newWidth;
                layerState.layers[layerIndex].size.height = newHeight;
                layerState.layers[layerIndex].fontSize = parseInt(computedStyle.fontSize) || 64;
                layerState.layers[layerIndex].style = {
                    fontFamily: computedStyle.fontFamily,
                    color: computedStyle.color,
                    fontWeight: computedStyle.fontWeight,
                    fontStyle: computedStyle.fontStyle,
                    textDecoration: computedStyle.textDecoration,
                    textAlign: computedStyle.textAlign
                };
            }
        }
        
        editingTextBox = null;
    }

    function open(existingTextBox){
        if (!popup) init();
        if (!popup) return;
        
        // Check if opening to edit an existing text box
        if (existingTextBox && existingTextBox.classList && existingTextBox.classList.contains('ss-text-box')) {
            editingTextBox = existingTextBox;
            // Populate canvas with existing content
            if (canvas) {
                canvas.innerHTML = existingTextBox.innerHTML;
                // Copy styles from text box
                const textBoxStyle = window.getComputedStyle(existingTextBox);
                canvas.style.fontFamily = textBoxStyle.fontFamily;
                canvas.style.fontSize = textBoxStyle.fontSize;
                canvas.style.color = textBoxStyle.color;
                canvas.style.fontWeight = textBoxStyle.fontWeight;
                canvas.style.fontStyle = textBoxStyle.fontStyle;
                canvas.style.textDecoration = textBoxStyle.textDecoration;
                canvas.style.textTransform = textBoxStyle.textTransform;
                canvas.style.textAlign = textBoxStyle.textAlign;
                // Initialize format state/UI based on existing text box style
                formatStates.bold = (textBoxStyle.fontWeight === 'bold' || parseInt(textBoxStyle.fontWeight) >= 600);
                formatStates.italic = textBoxStyle.fontStyle === 'italic';
                const decoration = (textBoxStyle.textDecoration || '').toLowerCase();
                formatStates.underline = decoration.includes('underline');
                formatStates.strikethrough = decoration.includes('line-through');
                Object.keys(formatStates).forEach(format => updateFormattingButton(format, formatStates[format]));
                // Update selected font label and alignment in the UI
                selectedFont = canvas.style.fontFamily ? canvas.style.fontFamily.split(',')[0].replace(/['"]/g, '') : selectedFont;
                updateFontButtonLabel(selectedFont);
                currentAlign = canvas.style.textAlign || currentAlign;
                updateAlignmentButtons(currentAlign);
            }
            // Update button label
            updateAddToPageButtonLabel('Update Text');
        } else {
            editingTextBox = null;
            updateAddToPageButtonLabel('Apply');
        }
        
        lastActiveElement = document.activeElement;
        if (canvas) resetCanvasTransform();
        popup.style.display = 'flex';
        popup.setAttribute('aria-hidden', 'false');
        const main = document.querySelector('main');
        if (main) main.setAttribute('aria-hidden', 'true');
        if (modalContent) {
            if (!modalContent.hasAttribute('tabindex')) modalContent.setAttribute('tabindex', '-1');
            modalContent.focus();
        }
        document.body.style.overflow = 'hidden';
        
        setTimeout(function() {
            scaleCanvas();
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(() => scaleCanvas());
            }
            if (canvas) {
                if (!editingTextBox) {
                    setEditorPlaceholderIfEmpty();
                }
                suppressPlaceholderFocus = true;
                canvas.focus();
                setTimeout(function() { suppressPlaceholderFocus = false; }, 0);
            }
            syncMatchButtonAppearance();
            updateAddToPageButton();
        }, 10);
    }
    
    function updateAddToPageButtonLabel(label) {
        const addToPageLabel = document.querySelector('.ss-add-to-page-label');
        if (addToPageLabel) {
            addToPageLabel.textContent = label;
        }
    }

    function close(){
        if (!popup) return;
        popup.style.display = 'none';
        popup.setAttribute('aria-hidden', 'true');
        const main = document.querySelector('main');
        if (main) main.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = '';
        closeFontPanel();
        
        if (canvas) {
            canvas.textContent = '';
            resetCanvasTransform();
        }
        lastValidHTML = '';
        editingTextBox = null;
        updateAddToPageButtonLabel('Apply');
        
        try { if (lastActiveElement && typeof lastActiveElement.focus === 'function') lastActiveElement.focus(); } catch (e) {}
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
