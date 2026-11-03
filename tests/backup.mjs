// Issue #59: the Backup and Load Backup buttons must save and restore the
// project. Adds a slide and a text layer, clicks Backup, clears storage and
// reloads, clicks Load Backup with the downloaded file, and fails unless the
// text layer and the slide count come back. Uploaded (canvas) images are not
// part of backups yet (#61). Expects the repo served at BASE_URL.
import { chromium } from 'playwright';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = (process.env.BASE_URL || 'http://localhost:8000') + '/index.html';
const errors = [];
const dir = mkdtempSync(join(tmpdir(), 'ss-backup-'));

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
page.on('pageerror', (err) => errors.push('page error: ' + err.message));

const summary = () => page.evaluate(() => ({
    texts: window.layerState.layers.filter((l) => l.type === 'text').map((l) => l.element.textContent.trim()),
    sections: window.canvasState.sections,
}));
const openBackupSection = () => page.locator('.ss-collapsible-header', { hasText: 'Backup Work' }).click();

await page.goto(url);
await page.waitForTimeout(1500);

await page.click('#ss-addSection');
await page.click('#ss-addTextBtn');
await page.click('#ss-text2EditablePreview');
await page.keyboard.type('Hello backup');
await page.click('#ss-text2Apply');
await page.waitForTimeout(500);
const before = await summary();

await openBackupSection();
let file = null;
try {
    const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 5000 }),
        page.click('#ss-backupBtn'),
    ]);
    file = join(dir, download.suggestedFilename());
    await download.saveAs(file);
} catch (err) {
    errors.push('Backup button did not download a file: ' + err.message);
}

if (file) {
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload();
    await page.waitForTimeout(1500);
    await openBackupSection();
    try {
        const [chooser] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 5000 }),
            page.click('#ss-loadBackupBtn'),
        ]);
        await chooser.setFiles(file);
        await page.waitForTimeout(1000);
        const after = await summary();
        if (JSON.stringify(after) !== JSON.stringify(before)) {
            errors.push('restored ' + JSON.stringify(after) + ', expected ' + JSON.stringify(before));
        }
    } catch (err) {
        errors.push('Load Backup button did not open a file chooser: ' + err.message);
    }
}

await browser.close();
rmSync(dir, { recursive: true, force: true });

if (before.texts[0] !== 'Hello backup' || before.sections !== 2) errors.push('setup failed: ' + JSON.stringify(before));
if (errors.length) {
    console.error('Backup test failed:\n' + errors.join('\n'));
    process.exit(1);
}
console.log('Backup test passed: ' + url);
