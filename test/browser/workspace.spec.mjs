import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

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
test("orchestration stages explain authority and navigate to working routes", async ({
  page,
}) => {
  await page.goto("/#overview");
  for (let i = 0; i < 6; i++) {
    const node = page.locator(`[data-stage="${i}"]`);
    await node.click();
    await expect(node).toHaveAttribute("aria-expanded", "true");
    await expect(
      page.locator('[data-stage][aria-expanded="true"]'),
    ).toHaveCount(1);
    await expect(page.locator("#stage-inspector strong")).toHaveText(
      await node.locator("strong").innerText(),
    );
  }
  await page.locator('[data-stage="2"]').focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#stage-inspector")).toContainText(
    "not permission to move money",
  );
  await page.locator("#stage-inspector [data-go]").click();
  await expect(page).toHaveURL(/#cases$/);
});
test("every screen renders without errors, overflow or serious accessibility violations", async ({
  page,
}, testInfo) => {
  test.setTimeout(180000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  for (const width of [1440, 1280, 768, 390]) {
    await page.setViewportSize({
      width,
      height:
        width === 1440
          ? 900
          : width === 1280
            ? 800
            : width === 390
              ? 844
              : 1024,
    });
    for (const screen of screens) {
      await page.goto("/#" + screen);
      await expect(page.locator("#view")).toHaveAttribute("data-view", screen);
      await expect(page.locator("#view")).not.toHaveAttribute(
        "aria-busy",
        "true",
      );
      await expect(page.locator("#view h1")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      if (screen === "requests")
        await expect(page.locator(".ag-root")).toBeVisible();
      const overflow = await page.evaluate(() => ({
        viewport: innerWidth,
        body: document.documentElement.scrollWidth,
      }));
      expect(overflow.body, screen + " at " + width).toBeLessThanOrEqual(
        overflow.viewport,
      );
      const accessibility = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze();
      await page.screenshot({
        path: testInfo.outputPath(screen + "-" + width + ".png"),
        fullPage: true,
        animations: "disabled",
      });
      expect(
        accessibility.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => n.target),
        })),
        screen + " at " + width,
      ).toEqual([]);
    }
  }
  expect(errors).toEqual([]);
});

test("mobile drawer, focus, deep links and history navigation work", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(page.locator("#view h1")).toBeVisible();
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await expect(page.locator("#menu-toggle")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await page.locator('.app-sidebar [data-view="policy"]').click();
  await expect(page).toHaveURL(/#policy$/);
  await expect(page.locator("#policy-form")).toBeVisible();
  await expect(page.locator("#menu-toggle")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#menu-toggle")).toBeFocused();
  await page.goto("/#guide");
  await expect(page.locator(".guide-steps")).toBeVisible();
  await page.getByRole("button", { name: "Open your first case" }).click();
  await expect(page.locator("#case-create")).toBeVisible();
  await page.goBack();
  await expect(page.locator(".guide-steps")).toBeVisible();
});

test("manual refund, approval queue and individual review retain real demo API behavior", async ({
  page,
}) => {
  await page.goto("/#overview");
  await page
    .getByRole("button", { name: "Manual proposal", exact: true })
    .click();
  await page.locator("#capture-select").selectOption("DEMO-1042");
  await page
    .locator('#proposal-form [name="note"]')
    .fill("Damaged notebook. Refund $12.");
  await page.locator('#proposal-form [name="amount"]').fill("12.00");
  await expect(page.locator("#draft")).toBeDisabled();
  const dialogAudit = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(dialogAudit.violations).toEqual([]);
  await page.getByRole("button", { name: "Check policy & submit" }).click();
  await expect(page.locator("#proposal")).not.toBeVisible();
  await expect(page.locator("#notice-text")).toContainText("Completed");
  await expect(page.locator(".financial-number")).toHaveText("$12.00");
  await page
    .getByRole("button", { name: "Manual proposal", exact: true })
    .click();
  await page.locator("#capture-select").selectOption("DEMO-1043");
  await page
    .locator('#proposal-form [name="note"]')
    .fill("Please refund the $45 organiser.");
  await page.locator('#proposal-form [name="amount"]').fill("45.00");
  await page.getByRole("button", { name: "Check policy & submit" }).click();
  await expect(page.locator("#notice-text")).toContainText("Needs approval");
  await page.locator('.app-sidebar [data-view="requests"]').click();
  await page.locator('[data-refund-queue="approval"]').click();
  await expect(page.locator("#review-panel")).toContainText("$45.00");
  await page.locator("#review-panel [data-approve]").click();
  await expect(page.locator("#notice-text")).toContainText("Review recorded");
  await page.locator('[data-refund-queue="all"]').click();
  await page.locator("#refund-search").fill("DEMO-1043");
  await expect(
    page.getByRole("gridcell", { name: "DEMO-1043", exact: true }),
  ).toHaveCount(1);
  await page.locator("#clear-refund-filters").click();
  await page.locator("#toggle-refund-date").click();
  await expect(page.locator("#toggle-refund-date")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByRole("columnheader", { name: "Requested", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("gridcell", { name: /^DEMO-104[23]$/ }),
  ).toHaveCount(2);
  await page.locator("#refund-grid [data-detail]").first().click();
  await expect(page.locator("#request-detail")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("case conversation, evidence form, errors and settings remain functional", async ({
  page,
}) => {
  await page.goto("/#cases");
  await page.locator('#case-create [name="capture"]').selectOption("DEMO-1044");
  const message = "One item arrived damaged. <img src=x onerror=alert(1)>";
  await page.locator('#case-create [name="message"]').fill(message);
  await page
    .locator("#case-create")
    .getByRole("button", { name: "Open case" })
    .click();
  await expect(page.locator(".case-conversation")).toContainText(message);
  await expect(page.locator(".case-conversation img")).toHaveCount(0);
  await page
    .getByText("Add a customer reply or correction", { exact: true })
    .click();
  await page
    .locator("#case-reply textarea")
    .fill("The refund should be for one item.");
  await page.getByRole("button", { name: "Save reply", exact: true }).click();
  await expect(page.locator(".case-conversation li")).toHaveCount(2);
  await page
    .locator(".card-details")
    .filter({
      has: page.locator("summary", { hasText: "Order, return & policy" }),
    })
    .locator(":scope > summary")
    .click();
  await page
    .getByText("Add or update order and return records", { exact: true })
    .click();
  await page
    .getByRole("button", { name: "Fill synthetic example", exact: true })
    .click();
  await expect(
    page.locator('#case-evidence [name="orderReference"]'),
  ).toHaveValue("SYNTHETIC-ORDER");
  await page
    .getByRole("button", { name: "Save merchant records", exact: true })
    .click();
  await expect(page.locator(".case-main")).toContainText("SYNTHETIC-ORDER");
  await page
    .getByText("Add or update order and return records", { exact: true })
    .click();
  await page
    .locator('#case-evidence [name="items"]')
    .fill("INVALID | incomplete item");
  await page
    .getByRole("button", { name: "Save merchant records", exact: true })
    .click();
  await expect(page.locator(".case-message")).toContainText(
    "Each order item needs",
  );
  await expect(page.locator('#case-evidence [name="items"]')).toHaveValue(
    "INVALID | incomplete item",
  );
  await expect(
    page.getByRole("button", { name: "Investigate case", exact: true }),
  ).toBeDisabled();
  await page.locator('.app-sidebar [data-view="policy"]').click();
  await page.locator('#policy-form [name="auto"]').fill("18.00");
  await page.getByRole("button", { name: "Save permissions" }).click();
  await expect(page.locator("#notice-text")).toContainText(
    "Permissions updated",
  );
  await expect(page.locator('#policy-form [name="auto"]')).toHaveValue("18.00");
});

test("fonts and presentation modules are served locally with correct security and MIME types", async ({
  request,
}) => {
  for (const [path, type] of [
    ["/ui.js", "text/javascript"],
    ["/command-center.js", "text/javascript"],
    ["/command.css", "text/css"],
    ["/workspace-views.js", "text/javascript"],
    ["/case-presentation.js", "text/javascript"],
    ["/fonts/geist-latin-wght-normal.woff2", "font/woff2"],
    ["/favicon.svg", "image/svg+xml"],
  ]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe(type);
    expect(response.headers()["content-security-policy"]).toContain(
      "script-src 'self'",
    );
  }
  expect((await request.get("/.env")).status()).toBe(404);
});
