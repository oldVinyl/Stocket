import { test, expect } from "@playwright/test";
import {
  demoSnapshot,
  applyMutation,
  type Mutation,
} from "../packages/core/src/index";
test("local inventory persists changes, supports catalog reuse, undo, and exports", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your inventory" }),
  ).toBeVisible();
  await expect(page.locator(".item-card")).toHaveCount(8);
  const paper = page
    .locator(".item-card")
    .filter({ has: page.getByRole("heading", { name: "Printer paper A4" }) });
  await paper.getByRole("button", { name: "Adjust stock" }).click();
  await page.getByRole("button", { name: "Stock out" }).click();
  await page.getByLabel("How many units?").fill("4");
  await page.getByRole("button", { name: "Save update", exact: true }).click();
  await expect(paper.locator(".stock-row strong")).toContainText("20");
  await page.reload();
  await expect(paper.locator(".stock-row strong")).toContainText("20");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByLabel("Item name", { exact: true }).fill("Binder clips");
  await page.getByLabel("Starting quantity").fill("9");
  await page.getByRole("button", { name: "Add to my inventory" }).click();
  await expect(page.locator(".item-card")).toHaveCount(9);
  await page.getByLabel("Search inventory").fill("Binder");
  const clips = page
    .locator(".item-card")
    .filter({ has: page.getByRole("heading", { name: "Binder clips" }) });
  await expect(clips).toBeVisible();
  await clips.getByRole("button", { name: "Options for Binder clips" }).click();
  await clips.getByRole("button", { name: "Remove item" }).click();
  await expect(clips).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(clips).toBeVisible();
  await page.getByLabel("Clear search").click();
  await page.getByRole("button", { name: "List view", exact: true }).click();
  await expect(page.locator(".item-grid")).toHaveClass(/list-view/);
  await page.getByRole("button", { name: "Grid view", exact: true }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  expect((await downloadPromise).suggestedFilename()).toBe(
    "stocket-inventory.csv",
  );
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const pdfPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  expect((await pdfPromise).suggestedFilename()).toBe("stocket-inventory.pdf");
  await page.getByRole("button", { name: "View low stock" }).click();
  await expect(page.locator(".item-card")).toHaveCount(3);
  await page.getByRole("button", { name: "Toggle dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(errors).toEqual([]);
});
test("small screens keep stock controls visible without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".item-card")).toHaveCount(8);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "artifacts/web-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.screenshot({ path: "artifacts/web-desktop.png", fullPage: true });
});
test("workspace menus, reminders, overview, companion, and guided help work", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/");
  await expect(page.locator(".item-card")).toHaveCount(8);
  await expect(page.locator(".pocket-card p")).toBeHidden();
  await page
    .locator(".sidebar nav")
    .getByRole("button", { name: "Overview" })
    .click();
  await expect(
    page.getByRole("region", { name: "Workspace overview" }),
  ).toBeVisible();
  await expect(page.locator(".item-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Open inventory" }).click();
  await page.getByLabel("Search inventory").fill("paper");
  await page.getByRole("button", { name: "3 low stock alerts" }).click();
  await expect(
    page.getByRole("region", { name: "Stock reminders" }),
  ).toContainText("3 supplies need a top-up");
  await page.getByRole("button", { name: "View low-stock inventory" }).click();
  await expect(page.locator(".item-card")).toHaveCount(3);
  await expect(page.getByLabel("Search inventory")).toHaveValue("");
  await page
    .getByRole("button", { name: "Account settings", exact: true })
    .click();
  await expect(page.getByLabel("Account menu", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Account & workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Make yourself at home" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Meet your pocket companion" })
    .click();
  await expect(
    page.getByRole("link", { name: "Get Stocket on GitHub" }),
  ).toHaveAttribute("href", "https://github.com/oldVinyl");
  await expect(page.getByRole("dialog")).toContainText("Add to Home Screen");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Help & getting started", exact: true })
    .click();
  await expect(page.locator(".guide-chapters li")).toHaveCount(7);
  await page.getByRole("button", { name: "Show me around" }).click();
  await expect(page.locator(".driver-popover-title")).toHaveText(
    "Your workspace",
  );
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".driver-popover-title")).toHaveText(
    "Add a supply",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator(".driver-popover")).toHaveCount(0);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect(page.locator(".pocket-card p")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Open account menu", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Help & getting started", exact: true })
    .click();
  await page.getByRole("button", { name: "Show me around" }).click();
  const titles = [
    "Your workspace",
    "Add a supply",
    "Find the right thing",
    "Stock in, stock out",
    "A friendly heads-up",
    "Keep a copy",
    "Offline is okay",
    "Your account",
  ];
  for (const [index, title] of titles.entries()) {
    await expect(page.locator(".driver-popover-title")).toHaveText(title);
    await page
      .getByRole("button", {
        name: index === titles.length - 1 ? "Ready to go" : "Next",
        exact: true,
      })
      .click();
  }
  await expect(page.locator(".driver-popover")).toHaveCount(0);
  await page.getByRole("button", { name: "3 low stock alerts" }).click();
  const reminderBounds = await page
    .getByRole("region", { name: "Stock reminders" })
    .boundingBox();
  expect(reminderBounds!.x).toBeGreaterThanOrEqual(0);
  expect(reminderBounds!.x + reminderBounds!.width).toBeLessThanOrEqual(390);
});

test("connected offline deductions retry safely when the response is lost", async ({
  page,
  context,
}) => {
  let server = demoSnapshot(),
    lost = false;
  server.company.name = "Acme Office";
  const applied = new Set<string>();
  await page.route("**/api/auth", (r) =>
    r.fulfill({
      json: { user: { id: server.profile.id }, profile: server.profile },
    }),
  );
  await page.route("**/api/inventory", async (r) => {
    if (r.request().method() === "POST") {
      const op = r.request().postDataJSON() as Mutation;
      if (!applied.has(op.id)) {
        server = applyMutation(server, op);
        applied.add(op.id);
      }
      if (!lost) {
        lost = true;
        await r.abort("connectionreset");
        return;
      }
      await r.fulfill({ json: { ok: true } });
    } else await r.fulfill({ json: server });
  });
  await page.goto("/");
  await expect(page.locator(".workspace")).toContainText("Acme Office");
  await expect(page.locator(".workspace")).toContainText("Company workspace");
  await expect(page.locator(".item-card")).toHaveCount(8);
  await context.setOffline(true);
  await expect(page.locator(".sync-label")).toContainText("Offline");
  const paper = page
    .locator(".item-card")
    .filter({ has: page.getByRole("heading", { name: "Printer paper A4" }) });
  await paper.getByRole("button", { name: "Adjust stock" }).click();
  await page.getByRole("button", { name: "Stock out" }).click();
  await page.getByLabel("How many units?").fill("4");
  await page.getByRole("button", { name: "Save update", exact: true }).click();
  await expect(paper.locator(".stock-row strong")).toContainText("20");
  expect(server.items[0].quantity).toBe(24);
  await context.setOffline(false);
  await expect(page.getByText("Your changes are saved here.")).toBeVisible();
  await page.getByRole("button", { name: "Try sync again" }).click();
  await expect(page.locator(".sync-label")).toContainText("All changes synced");
  expect(server.items[0].quantity).toBe(20);
  expect(applied.size).toBe(1);
  await page.reload();
  await expect(paper.locator(".stock-row strong")).toContainText("20");
});
test("production app reloads and exports while fully offline", async ({
  page,
  context,
}) => {
  test.skip(
    !process.env.TEST_OFFLINE_SHELL,
    "Production-only service worker check",
  );
  await page.goto("/");
  await expect(page.locator(".item-card")).toHaveCount(8);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => resolve(),
          { once: true },
        ),
      );
  });
  await page.waitForLoadState("networkidle");
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".item-card")).toHaveCount(8);
  await expect(page.locator(".sync-label")).toContainText("Offline");
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  expect((await download).suggestedFilename()).toBe("stocket-inventory.pdf");
});

test("Add item tops up existing stock by typed name and selected catalog match", async ({
  page,
}) => {
  await page.goto("/");
  const paper = page
    .locator(".item-card")
    .filter({ has: page.getByRole("heading", { name: "Printer paper A4" }) });
  await expect(paper.locator(".stock-row strong")).toContainText("24");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByLabel("Item name", { exact: true }).fill("printer paper a4");
  await expect(page.getByText("Already in your stock:")).toBeVisible();
  await expect(page.getByLabel("Alert below")).toHaveCount(0);
  await page.getByLabel("Quantity to add").fill("7");
  await page.getByRole("button", { name: "Add to existing stock" }).click();
  await expect(page.locator(".item-card")).toHaveCount(8);
  await expect(paper.locator(".stock-row strong")).toContainText("31");
  await page.reload();
  await expect(paper.locator(".stock-row strong")).toContainText("31");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByLabel("Item name", { exact: true }).fill("Printer paper");
  await page
    .locator(".catalog-matches button")
    .filter({ hasText: "Printer paper A4" })
    .click();
  await page.getByLabel("Quantity to add").fill("2");
  await page.getByRole("button", { name: "Add to existing stock" }).click();
  await expect(paper.locator(".stock-row strong")).toContainText("33");
  await expect(page.locator(".item-card")).toHaveCount(8);
  await paper
    .getByRole("button", { name: "Options for Printer paper A4" })
    .click();
  await paper.getByRole("button", { name: "Remove item" }).click();
  await expect(paper).toHaveCount(0);
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByLabel("Item name", { exact: true }).fill("Printer paper A4");
  await page.getByLabel("Quantity to add").fill("3");
  await page.getByRole("button", { name: "Add to existing stock" }).click();
  await expect(paper.locator(".stock-row strong")).toContainText("36");
  await expect(page.locator(".item-card")).toHaveCount(8);
});
