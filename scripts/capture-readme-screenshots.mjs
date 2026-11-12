// Captures real, read-only localhost views for the GitHub README gallery.
// It never creates a checkout, case, refund, or other payment-side effect.
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base = process.argv.find((value) => value.startsWith('--base='))?.slice(7) || 'http://localhost:4310';
const target = new URL(base);
if (target.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(target.hostname)) {
  throw Error('Use a localhost HTTP AgentGate address.');
}

const output = 'docs/screenshots';
const screens = ['overview', 'cases', 'requests', 'search', 'audit'];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 940 }, deviceScaleFactor: 1 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const screen of screens) {
    await page.goto(`${target.origin}/#${screen}`, { waitUntil: 'networkidle' });
    await page.locator(`#view[data-view="${screen}"]:not([aria-busy="true"]) h1`).waitFor();
    if (screen === 'requests') await page.locator('.ag-root').waitFor();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${output}/${screen}.png`, animations: 'disabled' });
  }
} finally {
  await browser.close();
}
