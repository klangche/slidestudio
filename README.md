# SlideStudio

A jacked-up social-media slide carousel editor. Build 1080 × 1920 story-sized slides
(1–20 of them), place and edit images and rich text, snap everything into alignment,
then export each slide in the SoMe formats that matter: **9:16 Stories, 3:4/4:5 Post,
1:1 Square**.

The whole app is **vanilla JavaScript ES modules** — no build step, no framework, no
dependencies. It runs as a static site (PWA via a service worker). You can run it by
opening `index.html`, but some features (Service Worker, PWA install) need a local
HTTP server — see [Running](#running).

---

## Table of contents

- [Quick start](#running)
- [Architecture overview](#architecture-overview)
- [Module reference](#module-reference)
- [Global state (js/state.js)](#global-state)
- [The two image rendering paths](#the-two-image-rendering-paths)
- [Snapping engine (js/guidance.js)](#snapping-engine)
- [Image transform model (js/image-transform.js)](#image-transform-model)
- [History / undo / redo (js/history.js)](#history)
- [Zoom model (js/zoom.js)](#zoom-model)
- [Text editor (js/text-editor.js)](#text-editor)
- [Export, backup and templates (js/export.js)](#export)
- [Guidance overlays](#guidance-overlays)
- [Global bridge inventory](#global-bridge-inventory)
- [Key DOM ids](#key-dom-ids)
- [Key CSS classes](#key-css-classes)
- [Conventions & gotchas](#conventions--gotchas)

---

## Running

Requires Python only for the local server (serves `/sw.js` at the root so the
Service Worker can register):

```powershell
powershell -File dev-server.ps1            # serves on http://localhost:8000
powershell -File dev-server.ps1 -Port 8080 # pick another port if 8000 is busy
```

The project is also configured for Netlify (`netlify.toml`) and works fully offline
once the service worker (`sw.js`) has cached the assets (`manifest.json` + `icons/`
make it installable).

---

## Architecture overview

Boot sequence:

1. `index.html` loads `<script type="module" src="js/main.js">`.
2. `js/main.js` imports every module in dependency order (state first, selfcheck
   last). Import order matters because most modules rely on `window.*` bridges set
   up by earlier modules — `selfcheck.js` verifies them all at the end.
3. `js/designer.js` (on `DOMContentLoaded`) runs `initializeDesignerWorkspace()`:
   - hides the placeholder, shows `#ss-canvasContainer`,
   - creates `#ss-canvasScroll` (the scroll-sized wrapper) and
     `#ss-designer-canvas` (the 1080 × 1920 surface),
   - initializes zoom, sections, color picker, uploads, transparency slider,
     magnet button, keyboard movement, global click handling and free-move,
   - enables SoMe Guides by default and calls `saveState()`.
4. `js/image-transform.js` lazily creates the `<canvas id="ss-image-canvas">`
   (z-index 100) inside the designer canvas and manages images drawn on it.
5. `js/slidestudio.js` wires the chrome: project name, theme toggle, menu, about
   popup, collapsible sidebar sections, export button.

Everything communicates through **`window.*` bridges** (set via
`window.foo = foo`). No imports are circular; modules import what they need, and
cross-cutting hooks (e.g. "save state after change", "snap while dragging") are
called through `window` so they never throw if a module is missing.

### Layering inside `#ss-designer-canvas`

| z-index | Layer |
| --- | --- |
| `1` | the designer canvas itself |
| `100` | `#ss-image-canvas` (canvas-drawn images, handles) |
| `200+` | DOM layers: `.ss-image-element`, `.ss-text-element` (text starts at 200) |
| `100000` | `#ss-guidance-overlay` (separators, center lines, SoMe guides, labels) |
| `100001` | guide lines / separators, `100002` their labels |
| `1001+` | resize/rotation handles on selected elements |

The whole designer canvas is scaled with `transform: scale(...)` by the zoom
module, and `#ss-canvasScroll` is resized to the *scaled* size so scrolling always
matches the visible edges.

---

## Module reference

### `js/main.js`
Entry point. Imports all modules in order. Contains no logic.

### `js/state.js`
Declares and exports the six shared state objects (see
[Global state](#global-state)) and mirrors each onto `window`.

### `js/designer.js`
Workspace bootstrap. Creates the canvas DOM, wires tool/sidebar buttons, calls the
initializer functions of every feature module. Exposes the app entry points on
`window.Designer` (e.g. `Designer.exportCanvasZip`, `Designer.getCanvasState()`).

### `js/slidestudio.js`
Header/sidebar chrome: project name editing (max 50 chars), clear button,
light/dark theme toggle (persisted to `localStorage['ss-theme']`, auto-detects
system theme on first load), menu (show/hide sidebar), about popup, collapsible
sections, and the **Export pages** button which calls
`Designer.exportCanvasZip(name + '.zip')`.

### `js/zoom.js`
Zoom slider, wheel and pinch gestures; applies `transform: scale()` to
`#ss-designer-canvas`. See [Zoom model](#zoom-model).

### `js/guidance.js`
SoMe guide overlays, slide separators, center lines and the magnet snapping
engine. See [Snapping engine](#snapping-engine).

### `js/sections.js`
Add/remove slides: `addSection()`/`removeSection()` grow/shrink
`canvasState.width` by 1080 and call `SSImageTransform.setCanvasSteps(...)` so the
image canvas matches. Also: `updateSectionCount`, `updateResolutionDisplay`,
`updateButtonStates` (progressively fading the + button), and
`initializeMagnetButton` (magnet on by default, toggles `magnetState.active`).

### `js/selection.js`
DOM-layer selection and dragging:
- `makeElementDraggable(el)` — pointer drag with magnet snapping
  (`snapElementAt`), `snapReset()` on pointerdown and on drag end, updates
  `layer.position` and `saveState()`.
- `makeElementSelectable(el)` — click selects, shows handles.
- `selectLayer`, `updateImageToolUIForSelection`, `toggleMultiSelectMode`,
  `groupElements`, `ungroupLayer`, `toggleGroupSelected` (multi-select/groups),
- Free-move canvas panning: `enableFreeMove`, `disableFreeMove`,
  `toggleFreeMove`, `initializeFreeMoveShortcuts` (uses `freeMoveState`).
- `initializeGlobalClickHandler`, `deselectAllLayers`, `clearMultiSelectMode`,
  `updateLayerOrderButtons`.

### `js/history.js`
`saveState()`, `undo()`, `redo()`, `restoreState()`, `updateUndoRedoButtons()`
plus layer restore helpers. See [History](#history).

### `js/layers.js`
DOM-layer operations wired to the sidebar tool buttons:
- `deleteSelectedLayer`, `duplicateSelectedImageLayer`,
  `flipSelectedImageHorizontal/Vertical`, `replaceSelectedImage`,
  `toggleLockSelectedImage` (toggles `.ss-locked` + `layer.locked` +
  `saveState()`), `toggleDropShadowSelectedImage`, `toggleGrayscaleSelectedImage`.
- Z-order: `moveLayerToTop/Up/Down/Bottom`.
- `updateImageToolButtons` (enables/disables buttons based on selection),
  `initializeColorPicker` (slide background color + hex),
  `initializeUploadFunctionality` (Upload Images → `importImageToCanvas`, and
  Add Text → `SSTextEditor.open()`),
  `initializeTransparencySlider` (guides overlay opacity),
  `cleanupImagesOutsideCanvas` (interval, every 5 s).

### `js/keyboard.js`
Arrow-key nudge (1 px, hold-to-repeat with acceleration state), clamps to canvas
bounds, applies magnet snapping per step, `saveState()` after each move.

### `js/export.js`
Full-canvas rendering, rich-text parsing for export, ZIP export, JSON backup and
localStorage templates. See [Export](#export).

### `js/designer.js` (already covered) and `js/backupexport.js`
`backupexport.js` is a **legacy placeholder** — its buttons alert "will be
implemented here". The real backup/export lives in `export.js`.

### `js/image-transform.js`
The mathematically-correct canvas image system (IIFE exposing `window.SSImageTransform`,
`window.SSImage`, `window.ImageTransform`). See
[Image transform model](#image-transform-model).

### `js/text-editor.js`
Modal rich-text editor (own internal 1080 × 1920 canvas preview). Exposes
`window.SSTextEditor = { open, close }`; "Add to page" creates a
`.ss-text-element` and wires dragging/selecting/resize/rotation. See
[Text editor](#text-editor).

### `js/ui-helpers.js`
Shared DOM helpers (formerly missing, now the source of truth):
`createResizeHandles`, `getResizeHandlesForElement`, `setupRotationHandler`
(persists rotation to the layer + `saveState()`), `adjustTextElementSize`,
`setupTextResizeHandlers` (corner resize scales the font proportionally so text
behaves like an image), and `addTextElement` (fallback direct text creation).
Also exposes `window.SSText.setupTextResizeHandlers`.

### `js/selfcheck.js`
On `DOMContentLoaded` verifies every `window.*` bridge in `REQUIRED_BRIDGES`
exists and logs `[selfcheck] All module bridges present.` or a list of missing
ones. Open DevTools console — a missing-bridge list there is the first thing to
check after a refactor.

---

## Global state

All defined in `js/state.js`, exported and mirrored to `window`.

```js
layerState = {
  layers: [],            // [{ id, element, type: 'image'|'text', zIndex,
                         //    position:{left,top}, size, rotation, visible,
                         //    disabled, ...type-specific }]
  selectedLayer: null,   // DOM element reference
  nextZIndex: 10,        // DOM layers start here; text editor bumps to 200
  maxLayers: 1000
}

canvasState = {
  width: 1080, height: 1920, // width grows by 1080 per section
  sections: 1, minSections: 1, maxSections: 20
}

guidanceState = {
  active: false,               // SoMe guides shown & snap targets enabled
  guidelines: { square: {1080x1080 1:1}, portrait: {1080x1350 4:5}, stories: {1080x1920 9:16} }
}

magnetState = { active: true } // master switch for snapping

historyState = { undoStack: [], redoStack: [], maxHistory: 1000 }

freeMoveState = { active, isMoving, startX, startY, startScrollLeft, startScrollTop }
```

---

## The two image rendering paths

There are **two independent ways an image can appear on the canvas**. New edits
(the canvas path) and restored history/backup (the DOM path) must stay in sync —
several `window` bridges exist purely to reconcile them.

### 1. Canvas path (primary, used by "Upload Images")
`js/layers.js` → `window.importImageToCanvas(file)` →
`loadImageFromFile()` in `js/image-transform.js`:
- Creates an entry in `state.images` (the bitmap is an `Image`/`ImageBitmap`).
- Positions it at the center of the **rightmost slide**.
- Everything renders onto `<canvas id="ss-image-canvas">` (z-index 100) by
  `draw()`.

### 2. DOM path (used by undo/redo restore and backups)
`js/history.js` `restoreState()` → `restoreImageLayer()`:
- Creates `<div class="ss-image-element">` with an inner `<img>` (object-fit:
  cover) plus resize/rotation handles.
- `SSImage.setupImageResizeHandlers(el)` (via `setupImageResizeHandlers`)
  **adapts** the DOM element into a canvas image too (`createImageFromLayer`),
  hiding the DOM `<img>` and drawing the element's bitmap on the canvas instead.
- `SSImage.applyImageEffectsToElement` re-applies crop/visibleRect from
  `layer.cropData`.

### Text layers (DOM only)
`.ss-text-element` divs, added by `text-editor.js` (`handleAddToPage`) or
`ui-helpers.js` `addTextElement()`. They get resize (font-scaling) and rotation
handles like images. Restored by `history.js` `restoreTextLayer()`.

---

## Snapping engine

`js/guidance.js`. Snaps an element's axis-aligned bounding box (AABB) to:

- **canvas edges and slide separators** — always active,
- **SoMe guide lines** (centers, 1:1 square top/bottom, 4:5 top/bottom) — only
  while `guidanceState.active`,
- **every other object's sides, corners and centers** — DOM layers via
  `getCanvasSpaceRect` plus canvas images via
  `SSImageTransform.getSnapRegions()`.

### Constants and glue
```js
const SNAP_THRESHOLD = 8;        // px (canvas space) to begin snapping
const SNAP_RELEASE_THRESHOLD = 12; // 1.5x — must drift beyond this to un-glue
const magnetSession = { x: null, y: null }; // which line+anchor each axis is glued to
```
Once an axis snaps, it **stays glued to that exact line** until it is dragged more
than the release threshold away, which stops the box from flickering between
rival anchors/lines. The session is cleared with `snapReset()` at the start/end of
every drag gesture (selection, image-transform, keyboard) and per keyboard step.

### Key functions
| Function | Purpose |
| --- | --- |
| `computeRotatedAABB(x,y,w,h,rotation)` | AABB of a rotated box (radians). |
| `getCanvasSpaceRect(el)` | AABB of a DOM element in canvas coords (undoes zoom). |
| `collectOtherBoxes(excludeEl, excludeImgId)` | All other objects' AABBs. |
| `collectSnapLines(excludeEl, excludeImgId)` | All vertical/horizontal target lines. |
| `findXSnap / findYSnap` | Best anchor (left/center/right, top/center/bottom) match within threshold. |
| `snapAABB(aabb, excludeEl, excludeImgId)` | The engine core; returns adjusted AABB. |
| `snapToGuidelines(x,y,w,h,rotation)` | Legacy wrapper (resets session, returns adjusted origin). |
| `snapElementAt(x,y,el)` | Snap a DOM element targeting position (x, y). |

Bridges: `window.snapBox = snapAABB`, `window.snapElementAt`,
`window.snapToGuidelines`, `window.snapReset`. The module also exports
`snapBox`/`snapElementAt`/`snapReset` for direct `import` use (image-transform and
keyboard import them; selection calls through `window`).

---

## Image transform model

Each entry in `state.images` (see `js/image-transform.js`):

```js
{
  id,                                  // incrementing state.nextImageId
  position: { x, y },                  // world (canvas) coords of the top-left
  scale,                               // uniform scale applied to the bitmap
  rotation,                            // radians
  originalWidth, originalHeight,       // bitmap dimensions
  bitmap,                              // Image / ImageBitmap
  visibleRect: { x, y, width, height },// crop region in *bitmap* coordinates
  domId,                               // link to a DOM layer when adapted
  flipX, flipY,                        // flips (mirror around visibleRect center)
  locked, visible, shadow, grayscale
}
```

Coordinate math is exact, not CSS-approximated:

```js
localToWorld(img, pLocal)  // position + rotate(rotation) + scale(scale)
worldToLocal(img, pWorld)  // inverse
```

- `draw()` sets a **clip path to the four visibleRect corners** (world space),
  then `translate(img.position)` → `rotate(img.rotation)` → `scale(img.scale)` and
  draws only `vr` of the bitmap. Flips mirror around the visible region itself
  (`translate(cx,cy); scale(-1,1); translate(-cx,-cy)`) so a flipped image keeps
  its crop and never reveals hidden pixels.
- Handles (`computeHandles`) are 4 corners (scale) + 4 edges (crop) + 1 rotate
  handle; all coordinates in local bitmap space, projected to world for DOM
  handle elements. Handles are hidden when the image is locked.
- Locked images draw a red ring inside their visibleRect: thickness
  `15 / (img.scale * zoom)` so it is always **15 px on screen**, semi-transparent
  (`rgba(231,76,60,.45)`, `.85` when selected). DOM images get the same ring from
  CSS (see [Key CSS classes](#key-css-classes)).
- Interactions: `handlePointerDown/Move/Up` for scaling (corner-anchored,
  keeps aspect via MIN_SIZE 20), edge handles for cropping
  (`visibleRect` clamped to bitmap bounds), drag-to-move with
  `snapBox` on the image AABB, rotate about the image center. `interaction`
  object stores the gesture start snapshot.
- `prepareSnapshot()` temporarily deselects so external snapshots (export) capture
  clean artwork, returning a restore function.

### Bridge APIs
- `window.SSImageTransform` — `setCanvasSteps, draw, computeHandles,
  flipHorizontal, flipVertical, duplicateImage, deleteImage, toggleLock,
  toggleShadow, toggleGrayscale, replaceImage, hasSelectedImage,
  getSelectedImage, prepareSnapshot, getSnapRegions`.
- `window.SSImage` — DOM adapter: `setupImageResizeHandlers,
  applyImageEffectsToElement, getImageForElement, updateLayerVisibleRect,
  resetCrop, updateHandlePositions`.
- `window.ImageTransform` — `getState, getSnapRegions, importFromElement`.
- `window.importImageToCanvas(file)` queues to `window._pendingUploads` if the
  module hasn't loaded yet.

---

## History

`js/history.js`. `saveState()` deep-copies `canvasState` plus every layer in
`layerState.layers`:

- **images**: `id, type, zIndex, position, rotation, visible, disabled, size,
  src, naturalSize, aspectRatio, transform, cropData, imageData` (data URL of the
  `<img>` so it can be restored),
- **text**: `id, type, zIndex, position, rotation, visible, disabled,
  textContent, fontSize, transform, style{fontFamily,fontSize,color,fontWeight,
  fontStyle,textDecoration,textAlign,backgroundColor}, size`.

It only pushes a new snapshot if the JSON serialization actually changed (dedup),
and caps `historyState.maxHistory` (1000). `undo()`/`redo()` pop/push stacks and
call `restoreState()`, which resets `canvasState`, clears all DOM layers except
`#ss-guidance-overlay`, rebuilds every layer with `restoreImageLayer` /
`restoreTextLayer`, re-runs `setInitialZoom()` and refreshes the guidance overlay.

---

## Zoom model

`js/zoom.js`. The designer canvas keeps its layout size (1080 × N×1080); zoom is a
CSS `transform: scale(s)` on `#ss-designer-canvas`, origin top-left, applied in
`updateCanvasTransform(s)`. That function **also sets the CSS custom property
`--ss-zoom` on the canvas**, which the locked-ring CSS uses to counter-scale.

- Slider maps the range **0.05 … 0.5**; wheel/pinch can reach **1.0**.
- `applyScale(scale, anchorX)` keeps the point under the pointer fixed
  horizontally and the canvas vertically centered; the scroll wrapper
  (`#ss-canvasScroll`) is resized to `width*scale × height*scale` so scrolling
  matches the visible canvas.
- `setInitialZoom()` fits the canvas into the container (clamped to the slider
  range); "fit all" button calls it, as does window resize.
- `setZoomLevel(z, mouseX, mouseY)` is the programmatic entry point (used by
  wheel and pinch handlers).

Reading the current zoom elsewhere (e.g. image-transform locked ring) parses the
`scale(...)` value out of `#ss-designer-canvas.style.transform`.

---

## Text editor

`js/text-editor.js`. A modal (`#ss-textPopup`) with an internal
1080 × 1920 canvas preview and a rich-text toolbar (fonts — including Google
Fonts and uploaded `@font-face` CSS — size, color, bold/italic/underline/strike,
align, letter/word spacing, caps). Exposes:

- `window.SSTextEditor = { open, close }` — "Add Text" sidebar button calls
  `open()`.
- `openTextEditor(textBox)` re-opens the editor for an existing text box
  (double-click on canvas).

"Add to page" (`handleAddToPage`) renders the editor canvas into a new
`.ss-text-element`, adds it to `layerState.layers` at z-index ≥ 200, wires
`makeElementDraggable` / `makeElementSelectable` /
`SSText.setupTextResizeHandlers` / `setupRotationHandler`, and calls
`saveState()`. Rotation is stored in `layer.rotation` by the rotation handler
and re-applied on restore via the `transform` string.

---

## Export

`js/export.js`.

1. `renderFullCanvas()` — draws background + snapshot of `#ss-image-canvas`
   (via `SSImageTransform.prepareSnapshot()` to hide selection outlines) + all
   text layers sorted by z-index onto one full-size canvas, clipped to canvas
   bounds. Rich text is parsed into styled runs (`TAG_STYLES`,
   `collectRuns`/`mergeRunStyle`) so bold/italic/etc. survive export.
2. `exportCanvasZip(filename)` — splits that single snapshot into:
   - `fullsize.png`,
   - `9-16 Stories/slide_N.png` (1080×1920),
   - `3-4 Post/slide_N.png` (1080×1350),
   - `1-1 Square/slide_N.png` (1080×1080),
   each cropped **centered vertically** within every 1080×1920 section, packaged
   with an in-file ZIP builder (`makeZip`). Returns
   `{ sections, files, filename }`.
3. `downloadBackup(filename)` — full JSON of `canvasState` + layers (+ image
   `data:` URLs when present) + history stacks.
4. Templates — `saveTemplate(name)` / `listTemplates()` /
   `loadTemplateByName(name)` persist to `localStorage['ss_templates']`;
   `openLoadBackupDialog()` / `openLoadTemplateDialog()` restore from a JSON file.

---

## Guidance overlays

`js/guidance.js` builds a single `#ss-guidance-overlay` (pointer-events: none,
z-index 100000) inside the designer canvas containing, per section:

- **slide separators** (1 px, `x = i * 1080`, color adapts to slide background),
- **center lines** (blue: one horizontal at y=960, vertical at each `x = s*1080 + 540`),
- **SoMe guides**: 1:1 square (Instagram gradient top/bottom), 4:5 post (purple
  top/bottom), 9:16 label "9:16 Stories #N",
- labels (`ss-guide-label`, z-index 100002).

The transparency slider (`#ss-transparencySlider`) drives
`guidanceState.active`-gated overlay opacity via
`updateGuidanceTransparency()`. Toggling "SoMe Guides"
(`toggleGuidance`) adds/removes the overlay and enables/disables the slider.

---

## Global bridge inventory

Self-checked by `js/selfcheck.js` (`REQUIRED_BRIDGES`). Everything is also listed
by the modules that define them:

| Bridge | Defined in |
| --- | --- |
| `layerState, canvasState, guidanceState, magnetState, historyState, freeMoveState` | `state.js` |
| `saveState` | `history.js` |
| `makeElementDraggable, makeElementSelectable, selectLayer, updateImageToolUIForSelection, toggleMultiSelectMode, groupElements, ungroupLayer, toggleGroupSelected, updateLayerOrderButtons` | `selection.js` |
| `createResizeHandles, getResizeHandlesForElement, setupRotationHandler, adjustTextElementSize, addTextElement, setupTextResizeHandlers, SSText` | `ui-helpers.js` |
| `updateImageToolButtons` | `layers.js` |
| `snapToGuidelines, snapElementAt, snapBox, snapReset` | `guidance.js` |
| `Designer` (+ export/backup/template functions) | `designer.js` |
| `SSImageTransform, SSImage, ImageTransform, importImageToCanvas, setupImageResizeHandlers, applyImageEffectsToElement, updateLayerVisibleRect, resetCrop, updateHandlePositions` | `image-transform.js` |
| `SSTextEditor` | `text-editor.js` |

---

## Key DOM ids

`ss-designer-canvas`, `ss-canvasScroll`, `ss-canvasContainer`, `ss-image-canvas`,
`ss-guidance-overlay`, `ss-workspace`, `ss-workspacePlaceholder` — workspace.

`ss-uploadImagesBtn`, `ss-addTextBtn`, `ss-guidanceBtn`, `ss-magnetBtn`,
`ss-transparencySlider` (+`ss-transparencyThumb`, `ss-transparencyFill`,
`ss-transparencyValue`), `ss-slideColorPicker`, `ss-slideColorHex`,
`ss-addSection`, `ss-removeSection`, `ss-sectionCount`, `ss-resolutionDisplay`.

Zoom: `ss-slider`, `ss-sliderThumb`, `ss-sliderFill`, `ss-zoomValue`,
`ss-fitAllBtn`, `ss-freeMoveBtn`.

Tools: `ss-flipHorizontalBtn`, `ss-flipVerticalBtn`, `ss-duplicateImageBtn`,
`ss-deleteImageBtn`, `ss-replaceImageBtn`, `ss-lockImageBtn`,
`ss-dropShadowBtn`, `ss-grayscaleBtn`, `ss-selectMultipleBtn`, `ss-groupBtn`,
`ss-moveToTopBtn`, `ss-moveUpBtn`, `ss-moveDownBtn`, `ss-moveToBottomBtn`.

Misc: `ss-exportBtn`, `ss-backupBtn`, `ss-saveTemplateBtn`, `ss-loadBackupBtn`,
`ss-restoreDefaultsBtn`, `ss-projectName`, `ss-clearButton`, `ss-themeToggle`,
`ss-menuToggle`, `ss-logoHeader`, `ss-aboutPopup`, `ss-textPopup`,
`ss-slideColorPicker`, `ss-undoBtn`, `ss-redoBtn`.

---

## Key CSS classes

| Class | Purpose |
| --- | --- |
| `.ss-designer-canvas` | The 1080×N surface; gets `transform: scale()` + `--ss-zoom`. |
| `.ss-image-element` / `.ss-text-element` | DOM layers; `position: absolute`, `cursor: grab`. |
| `.ss-image-element.selected` | Green selection outline (overridden to none in an earlier rule — the visible one is at the bottom of the file). |
| `.ss-image-element.ss-locked::after` | **Locked ring**: `box-shadow: inset 0 0 0 calc(15px / var(--ss-zoom, 1)) rgba(231,76,60,.45)`; `.selected` variant `.85`. Constant 15 px on screen at any zoom. |
| `.ss-resize-handles` / `.ss-resize-handle` | Selection handles; shown via `.selected .ss-resize-handles { display: block }`. |
| `.ss-rotation-handle` | Rotation handle below the element. |
| `.ss-slide-separator` | 1 px section divider. |
| `.ss-guide-label` | Small black labels (1:1, 4:5, 9:16 #N). |
| `.ss-guideline-label` | Legacy CSS for a snap distance label (not currently created by any JS). |
| `.ss-slider` / `.ss-slider-thumb` / `.ss-slider-fill` | Zoom + transparency sliders. |
| `.ss-polaroid-frame` / `.ss-polaroid-window` / `.ss-polaroid-lock-icon` | Polaroid frame style + lock badge. |
| `.ss-active` | Active-state highlight for guidance/magnet buttons. |
| `.ss-dark-mode` | Body-level dark theme. |
| `.ss-sidebar-visible` / `.ss-sidebar-hidden` | Sidebar visibility. |
| `.ss-disabled` | Disabled control state. |

---

## Conventions & gotchas

- **No build step.** ES modules served statically; `index.html` must be loaded
  over HTTP for `import` and the Service Worker to work (`dev-server.ps1`).
- **Bridge pattern.** Cross-module calls go through `window.*` guarded with
  `typeof window.x === 'function'` so a missing module never throws. Always add a
  bridge when a new module needs to be callable from another, and keep
  `selfcheck.js`'s `REQUIRED_BRIDGES` in sync.
- **Canvas vs DOM images.** Uploads go to the canvas path only; restore goes
  through the DOM path and is adapted back into the canvas. Don't "fix" one path
  without the other — `getSnapRegions`, lock rings, flips and crop all exist in
  both.
- **Rotation units.** Canvas images store rotation in **radians**;
  DOM/text layers store it in **degrees** (and inside the CSS `transform`
  string). Mind the conversion at boundaries.
- **Zoom coupling.** Fixed-size CSS decorations inside the scaled canvas appear
  to shrink with zoom. Anything that must stay a constant *screen* size (like the
  locked ring) must divide by `--ss-zoom` (CSS) or by `img.scale * zoom` (canvas).
- **Snapping thresholds.** `SNAP_THRESHOLD = 8`, `SNAP_RELEASE_THRESHOLD = 12`
  in canvas-space px. Always call `snapReset()` at the start/end of a gesture or
  stale glue state will yank the element.
- **State dedup.** `saveState()` skips pushes when the serialized state is
  unchanged — don't rely on it being called after every mutation for history
  boundaries.
- **Save often.** Many handlers call `window.saveState()` after mutations; if you
  add a new mutation path, mirror that.

---

Related docs: `TEXT_EDITOR_README.md` (text editor deep-dive),
`IMPLEMENTATION_VISUAL.txt` (implementation/visual notes).
