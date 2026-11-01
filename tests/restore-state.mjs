// Calls restoreState() on a fresh page with a saved state and fails if it
// does not return within 2 s, removes the guidance overlay or the
// SSImageTransform canvas/handles, or keeps a stale child. Expects the
// repo served at BASE_URL.
import { chromium } from 'playwright';

const url = (process.env.BASE_URL || 'http://localhost:8000') + '/index.html';
const errors = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (err) => errors.push('page error: ' + err.message));

await page.goto(url);
await page.waitForFunction(() => document.getElementById('ss-guidance-overlay'));

const run = page.evaluate(async () => {
    const history = await import('/js/history.js');
    const { historyState } = await import('/js/state.js');
    const canvas = document.getElementById('ss-designer-canvas');
    const stale = document.createElement('div');
    stale.id = 'ss-test-stale';
    canvas.appendChild(stale);
    const owned = ['ss-image-canvas', 'ss-image-handles'].filter((id) => document.getElementById(id));
    history.saveState();
    history.restoreState(historyState.undoStack[historyState.undoStack.length - 1]);
    return {
        overlay: !!document.getElementById('ss-guidance-overlay'),
        stale: !!document.getElementById('ss-test-stale'),
        lostOwned: owned.filter((id) => !document.getElementById(id))
    };
});
const timeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), 2000));
const result = await Promise.race([run, timeout]);

if (result === 'timeout') {
    errors.push('restoreState() did not return within 2 s');
} else {
    if (!result.overlay) errors.push('guidance overlay was removed');
    if (result.stale) errors.push('stale canvas child was not removed');
    if (result.lostOwned.length) errors.push('removed SSImageTransform elements: ' + result.lostOwned.join(', '));
}

// A hung page can block a clean close; do not wait on it forever.
await Promise.race([browser.close(), new Promise((r) => setTimeout(r, 2000))]);

if (errors.length) {
    console.error('Restore state test failed:\n' + errors.join('\n'));
    process.exit(1);
}
console.log('Restore state test passed: ' + url);
