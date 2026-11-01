// Adds 5 image layers with ~4.5 MB data URLs and fails if the median
// saveState() takes 50 ms or more, or if two saves of an unchanged state
// add two snapshots. Expects the repo served at BASE_URL.
import { chromium } from 'playwright';

const url = (process.env.BASE_URL || 'http://localhost:8000') + '/index.html';
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (err) => errors.push('page error: ' + err.message));

await page.goto(url);
await page.waitForFunction(() => document.getElementById('ss-designer-canvas'));

const result = await page.evaluate(async () => {
    const { saveState } = await import('/js/history.js');
    const { layerState, historyState } = await import('/js/state.js');
    const canvas = document.getElementById('ss-designer-canvas');

    for (let i = 0; i < 5; i++) {
        const src = 'data:image/png;base64,' + String(i).repeat(4.5 * 1024 * 1024);
        const element = document.createElement('div');
        element.style.left = '0px';
        element.style.top = '0px';
        element.style.width = '100px';
        element.style.height = '100px';
        const img = document.createElement('img');
        img.src = src;
        element.appendChild(img);
        canvas.appendChild(element);
        layerState.layers.push({
            id: 'ss-test-image-' + i, type: 'image', element: element, imageElement: img, src: src,
            zIndex: 10 + i, position: { left: 0, top: 0 }, size: { width: 100, height: 100 }
        });
    }

    // Each save moves a layer, so every save compares and pushes a snapshot.
    const times = [];
    for (let i = 0; i < 9; i++) {
        layerState.layers[0].element.style.left = i + 'px';
        const t0 = performance.now();
        saveState();
        times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);

    const before = historyState.undoStack.length;
    layerState.layers[0].element.style.left = '500px';
    saveState();
    saveState();
    return { median: times[Math.floor(times.length / 2)], added: historyState.undoStack.length - before };
});

await browser.close();

if (result.median >= 50) errors.push('median saveState() took ' + result.median.toFixed(1) + ' ms, expected under 50 ms');
if (result.added !== 1) errors.push('two saves of an unchanged state added ' + result.added + ' snapshots, expected 1');
if (errors.length) {
    console.error('Save state test failed:\n' + errors.join('\n'));
    process.exit(1);
}
console.log('Save state test passed (median ' + result.median.toFixed(1) + ' ms): ' + url);
