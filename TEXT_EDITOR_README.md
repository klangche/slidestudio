# Text Editor Implementation

## Overview
Added a scaled text editor canvas to the "Add Text" popup (`ss-text-editor-viewport`).

## Features

### Canvas Dimensions
- **Exact size**: 1080px × 1920px (9:16 aspect ratio)
- **No padding**: Canvas fills the entire viewport div
- **Scaling**: Scales diagonally to fit inside `ss-text-editor-viewport`

### Font Behavior
- Font size remains at **48px** (not changed)
- Only the **visual scale** changes to fit the viewport
- This ensures fonts are perceptually scaled but technically the same size
- When you zoom in/out the window, the canvas scales but font-size stays 48px

### Styling
- White background with dark shadow
- 40px padding inside the canvas for text
- Placeholder text: "Click to add text..."
- Dark mode support included

## Technical Implementation

### HTML Structure
```html
<div class="ss-text-editor-viewport" id="ss-textEditorViewport">
    <div class="ss-text-editor-canvas-wrapper">
        <div class="ss-text-editor-canvas" 
             id="ss-textEditorCanvas" 
             contenteditable="true" 
             spellcheck="false">
            Click to add text...
        </div>
    </div>
</div>
```

### CSS (style.css)
- `.ss-text-editor-viewport`: Viewport container (70vh height, max 800px)
- `.ss-text-editor-canvas-wrapper`: Flexbox wrapper for centering
- `.ss-text-editor-canvas`: The actual 1080×1920 canvas with 48px font
- Transform origin: `center center` for proper scaling

### JavaScript (text-editor.js)
- **ResizeObserver**: Automatically scales canvas when viewport size changes
- **Scale calculation**: `Math.min(scaleX, scaleY)` to fit both dimensions
- **Transform**: Applied via `transform: scale(X)` CSS
- **Focus handling**: Auto-focuses canvas when popup opens
- **Placeholder handling**: Shows/hides based on content

## Scaling Logic
```javascript
const scaleX = availableWidth / 1080;
const scaleY = availableHeight / 1920;
const scale = Math.min(scaleX, scaleY);
canvas.style.transform = `scale(${scale})`;
```

## Testing
A test file `test-text-editor.html` has been created to demonstrate the functionality independently.

To test:
1. Open `index.html` in a browser
2. Click "Add Text" button in the sidebar
3. The popup will open with the scaled canvas
4. The canvas will maintain 9:16 ratio and scale to fit
5. Type text at 48px font size (visually scaled)

## Browser Compatibility
- Uses ResizeObserver (modern browsers)
- Falls back gracefully if ResizeObserver not available
- Supports contenteditable for text input
- CSS transform for scaling (widely supported)
