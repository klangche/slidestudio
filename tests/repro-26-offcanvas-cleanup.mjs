// Reproduction for issue #26: cleanupImagesOutsideCanvas (js/layers.js)
// removing image layers. Diagnosis only, not part of the suite.
// Run: python3 -m http.server 8000 & node tests/repro-26-offcanvas-cleanup.mjs
import { chromium } from 'playwright';

const url = (process.env.BASE_URL || 'http://localhost:8000') + '/index.html';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const logs = [];
page.on('console', (m) => { if (m.text().includes('images outside canvas')) logs.push(m.text()); });
page.on('pageerror', (e) => console.log('page error:', e.message));
await page.goto(url);
await page.waitForTimeout(1500);

// Helpers in the page: add a DOM image layer shaped like the ones
// restoreState (js/history.js) and duplicateSelectedImageLayer create.
await page.evaluate((png) => {
    window.__repro = {
        add(id, left, top, w, h, hidden) {
            const c = document.getElementById('ss-designer-canvas');
            const el = document.createElement('div');
            el.className = 'ss-image-element';
            el.id = id;
            Object.assign(el.style, { position: 'absolute', left: left + 'px', top: top + 'px', width: w + 'px', height: h + 'px' });
            if (hidden) { el.style.display = 'none'; el.style.pointerEvents = 'none'; }
            const img = document.createElement('img');
            img.src = png;
            img.style.width = '100%';
            img.style.height = '100%';
            el.appendChild(img);
            c.appendChild(el);
            window.layerState.layers.push({ id, element: el, imageElement: img, type: 'image', zIndex: 10, position: { left, top }, size: { width: w, height: h }, src: png, visible: !hidden, disabled: !!hidden });
        },
        reset() {
            window.layerState.layers.filter((l) => l.type === 'image').forEach((l) => l.element.remove());
            window.layerState.layers = window.layerState.layers.filter((l) => l.type !== 'image');
        },
        ids() { return window.layerState.layers.filter((l) => l.type === 'image').map((l) => l.id); },
        scale() { const m = /scale\(([^)]+)\)/.exec(document.getElementById('ss-designer-canvas').style.transform); return m ? +m[1] : 1; },
        setScale(s) { document.getElementById('ss-designer-canvas').style.transform = 'scale(' + s + ')'; },
        async cleanup() { (await import('/js/layers.js')).cleanupImagesOutsideCanvas(); },
        async zoom(z) { (await import('/js/zoom.js')).setZoomLevel(z); }
    };
}, PNG);

const ev = (fn, ...args) => page.evaluate(([fn, args]) => window.__repro[fn](...args), [fn, args]);
const report = (name, ids, expect) => console.log((JSON.stringify(ids) === JSON.stringify(expect) ? 'as expected  ' : 'BUG          ') + name + ' -> layers left: ' + JSON.stringify(ids) + ', expected ' + JSON.stringify(expect));

// 0. Real upload path: where do uploaded images go?
const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#ss-uploadImagesBtn')]);
await chooser.setFiles({ name: 'a.png', mimeType: 'image/png', buffer: Buffer.from(PNG.split(',')[1], 'base64') });
await page.waitForTimeout(500);
console.log('0. upload via button: image-type entries in layerState.layers =', (await ev('ids')).length,
    '| canvas-drawn images in SSImageTransform =', await page.evaluate(() => window.SSImageTransform.getSampleableImages().length));

// 1. Issue scenario: image well inside the canvas, zoom to the max (1x), wait for the real 5 s interval.
await ev('reset');
await ev('zoom', 5); // clamped to 1 by setZoomLevel
await ev('add', 'inside', 400, 800, 200, 200);
console.log('1. zoom after setZoomLevel(5):', await ev('scale'));
await page.waitForTimeout(5500);
report('1. on-canvas image, zoom 1x, after 5.5 s', await ev('ids'), ['inside']);

// 2. Zoom scale vs canvas units: same on-canvas image near the right edge, several scales.
for (const s of [0.25, 0.5, 1, 2]) {
    await ev('reset'); await ev('setScale', s);
    await ev('add', 'near-right-edge', 1000, 800, 60, 60);
    await ev('cleanup');
    report('2. on-canvas image at left 1000, scale ' + s, await ev('ids'), ['near-right-edge']);
}
// 2b. The other direction: an image far off canvas is kept when zoomed out.
for (const s of [0.25, 1]) {
    await ev('reset'); await ev('setScale', s);
    await ev('add', 'far-right', 2500, 800, 60, 60);
    await ev('cleanup');
    report('2b. off-canvas image at left 2500, scale ' + s, await ev('ids'), []);
}
await ev('zoom', 1);

// 3. Two adjacent off-canvas images: splice inside forEach skips the second.
await ev('reset');
await ev('add', 'off-1', -2000, 800, 60, 60);
await ev('add', 'off-2', -2000, 900, 60, 60);
await ev('cleanup');
report('3. two adjacent off-canvas images, one cleanup pass', await ev('ids'), []);

// 4. Soft-deleted (display:none) image on the canvas: zero rect.
await ev('reset');
const canvasLeft = await page.evaluate(() => document.getElementById('ss-designer-canvas').getBoundingClientRect().left);
await ev('add', 'hidden-on-canvas', 400, 800, 200, 200, true);
await ev('cleanup');
report('4. hidden image on canvas (canvas viewport left ' + Math.round(canvasLeft) + ')', await ev('ids'), ['hidden-on-canvas']);

// 5. Undo after a removal.
await ev('reset');
await ev('add', 'undo-me', -2000, 800, 60, 60);
await page.evaluate(() => window.saveState());
await ev('cleanup');
const afterCleanup = await ev('ids');
// restoreState's clear loop (js/history.js) spins forever while
// #ss-guidance-overlay is in the canvas, so undo freezes the page. Detach
// the overlay around undo so the history content itself can be checked.
const hasOverlay = await page.evaluate(() => !!document.getElementById('ss-guidance-overlay'));
console.log('5. #ss-guidance-overlay present before undo: ' + hasOverlay + (hasOverlay ? ' (undo would hang; detaching it for this check)' : ''));
await page.evaluate(async () => {
    const o = document.getElementById('ss-guidance-overlay');
    if (o) o.remove();
    (await import('/js/history.js')).undo();
    if (o) document.getElementById('ss-designer-canvas').appendChild(o);
});
await page.waitForTimeout(300);
console.log('5. undo after cleanup: before undo ' + JSON.stringify(afterCleanup) + ', after undo ' + JSON.stringify(await ev('ids')));

console.log('console:', logs.join(' | '));
await browser.close();
