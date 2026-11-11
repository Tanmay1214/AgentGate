// Local screenshot contact sheets for comparing responsive compositions.
import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chromium", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1550 },
    deviceScaleFactor: 1,
  });
  for (const width of [1440, 1280, 768, 390]) {
    const cards = await Promise.all(
      [
        "overview",
        "cases",
        "requests",
        "policy",
        "search",
        "audit",
        "setup",
        "guide",
      ].map(
        async (name) =>
          `<article><h2>${name} / ${width}px</h2><img src="data:image/png;base64,${(await readFile(`data/ui-review/${name}-${width}.png`)).toString("base64")}"></article>`,
      ),
    );
    await page.setContent(
      `<style>body{margin:0;padding:18px;background:#ccd4dc;font:14px system-ui;display:grid;grid-template-columns:repeat(4,1fr);gap:16px}article{min-width:0;background:white;overflow:hidden;height:730px}h2{font-size:14px;margin:12px}img{width:100%;display:block}</style>${cards.join("")}`,
    );
    await page.screenshot({
      path: `data/ui-review/contact-${width}.png`,
      fullPage: true,
    });
  }
} finally {
  await browser.close();
}
