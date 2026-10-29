// Loads the app in headless Chromium and fails if a module bridge is
// missing or the page throws. Expects the repo served at BASE_URL.
import { chromium } from 'playwright';

const url = (process.env.BASE_URL || 'http://localhost:8000') + '/index.html';
const errors = [];
let selfcheckOk = false;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (err) => errors.push('page error: ' + err.message));
page.on('console', (msg) => {
    const text = msg.text();
    if (text.includes('[selfcheck] All module bridges present.')) selfcheckOk = true;
    if (text.includes('[selfcheck] MISSING')) errors.push(text);
});

await page.goto(url);
await page.waitForTimeout(3000);
await browser.close();

if (!selfcheckOk) errors.push('selfcheck success message not seen');
if (errors.length) {
    console.error('Smoke test failed:\n' + errors.join('\n'));
    process.exit(1);
}
console.log('Smoke test passed: ' + url);
