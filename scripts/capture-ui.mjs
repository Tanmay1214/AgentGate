// Read-only local workspace review. Does not create a checkout, case or refund.
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
const base =
  process.argv.find((v) => v.startsWith("--base="))?.slice(7) ||
  "http://localhost:4310";
const target = new URL(base);
if (
  !["localhost", "127.0.0.1"].includes(target.hostname) ||
  target.protocol !== "http:"
)
  throw Error("Use a local AgentGate HTTP origin.");
const screens = [
  "overview",
  "cases",
  "requests",
  "policy",
  "search",
  "audit",
  "setup",
  "guide",
];
await mkdir("data/ui-review", { recursive: true });
const report = {
  verifiedAt: new Date().toISOString(),
  method:
    "Read-only local workspace review using Playwright Chromium and axe WCAG A/AA checks.",
  viewports: [1440, 1280, 768, 390],
  screens: [],
  errors: [],
};
const browser = await chromium.launch({ channel: "chromium", headless: true });
try {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", (error) => report.errors.push(error.message));
  for (const width of report.viewports) {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : width === 1280 ? 800 : width === 390 ? 844 : 1024 });
    for (const screen of screens) {
      await page.goto(target.origin + "/#" + screen);
      await page
        .locator('#view[data-view="' + screen + '"]:not([aria-busy="true"]) h1')
        .waitFor();
      await page.evaluate(() => document.fonts.ready);
      if (screen === "requests") await page.locator(".ag-root").waitFor();
      await page.screenshot({
        path: "data/ui-review/" + screen + "-" + width + ".png",
        fullPage: screen !== "audit",
        animations: "disabled",
      });
      const audit = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      const result = {
        screen,
        width,
        overflow: await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        violations: audit.violations.map((v) => ({
          id: v.id,
          targets: v.nodes.map((n) => n.target),
        })),
      };
      report.screens.push(result);
      console.log(
        screen +
          " @ " +
          width +
          ": " +
          result.violations.length +
          " accessibility violations; overflow=" +
          result.overflow,
      );
    }
  }
} finally {
  await browser.close();
}
await writeFile(
  "data/ui-review/final-review.json",
  JSON.stringify(report, null, 2) + "\n",
);
if (
  report.errors.length ||
  report.screens.some((s) => s.overflow || s.violations.length)
)
  process.exitCode = 1;
