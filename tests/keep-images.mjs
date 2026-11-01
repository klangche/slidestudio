// Issue #27: the app must not delete image layers on its own. Adds an
// on-canvas DOM image layer near the right edge with the canvas at
// transform: scale(2), and a hidden on-canvas one, waits past two runs of
// the old 5 s cleanup interval, and fails if either layer is gone.
// Expects the repo served at BASE_URL.
import { chromium } from 'playwright';

const url = (process.env.BASE_URL || 'http://localhost:8000') + '/index.html';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const expected = ['hidden-on-canvas', 'scaled-near-edge'];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errors = [];
page.on('pageerror', (err) => errors.push('page error: ' + err.message));
await page.goto(url);
await page.waitForTimeout(1500);

// Layers shaped like the ones restoreState (js/history.js) creates.
await page.evaluate((png) => {
    const canvas = document.getElementById('ss-designer-canvas');
    const add = (id, left, top, size, hidden) => {
        const el = document.createElement('div');
        el.className = 'ss-image-element';
        el.id = id;
        Object.assign(el.style, { position: 'absolute', left: left + 'px', top: top + 'px', width: size + 'px', height: size + 'px' });
        if (hidden) { el.style.display = 'none'; el.style.pointerEvents = 'none'; }
        const img = document.createElement('img');
        img.src = png;
        img.style.width = '100%';
        img.style.height = '100%';
        el.appendChild(img);
        canvas.appendChild(el);
        window.layerState.layers.push({ id, element: el, imageElement: img, type: 'image', zIndex: 10, position: { left, top }, size: { width: size, height: size }, src: png, visible: !hidden, disabled: !!hidden });
    };
    canvas.style.transform = 'scale(2)';
    add('hidden-on-canvas', 400, 800, 200, true);
    add('scaled-near-edge', 1000, 800, 60, false);
}, PNG);

// Two passes of the old 5 s interval: it spliced inside forEach, so one
// pass skipped the layer after a removed one.
await page.waitForTimeout(10500);
const ids = await page.evaluate(() => window.layerState.layers.filter((l) => l.type === 'image' && l.element.isConnected).map((l) => l.id));
await browser.close();

const missing = expected.filter((id) => !ids.includes(id));
if (missing.length) errors.push('image layers removed: ' + missing.join(', ') + ' (left: ' + JSON.stringify(ids) + ')');
if (errors.length) {
    console.error('Keep-images test failed:\n' + errors.join('\n'));
    process.exit(1);
}
console.log('Keep-images test passed: ' + url);
