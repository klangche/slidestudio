// Loads the app once online, waits for the service worker, then reloads
// offline and fails if a module bridge is missing or the page throws.
// Expects the repo served at BASE_URL.
import { chromium } from 'playwright';

const url = (process.env.BASE_URL || 'http://localhost:8000') + '/index.html';
const errors = [];
let selfcheckOk = false;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
const page = await context.newPage();

await page.goto(url);
await page.evaluate(() => navigator.serviceWorker.ready);

page.on('pageerror', err => errors.push('page error: ' + err.message));
page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[selfcheck] All module bridges present.')) selfcheckOk = true;
    if (text.includes('[selfcheck] MISSING')) errors.push(text);
});

// Drop the HTTP cache so only the service worker cache can serve files.
const cdp = await context.newCDPSession(page);
await cdp.send('Network.clearBrowserCache');
await context.setOffline(true);
await page.reload();
await page.waitForTimeout(3000);
await browser.close();

if (!selfcheckOk) errors.push('selfcheck success message not seen offline');
if (errors.length) {
    console.error('Offline test failed:\n' + errors.join('\n'));
    process.exit(1);
}
console.log('Offline test passed: ' + url);
