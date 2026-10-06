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

test("phone popovers become draggable sheets without losing inventory changes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".item-card")).toHaveCount(8);
  await page.getByRole("button", { name: "3 low stock alerts" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  const handle = sheet.getByRole("button", {
    name: "Drag sheet; tap to expand or collapse",
  });
  await expect(handle).toBeVisible();
  let box = await handle.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + 18);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2, box!.y - 65, { steps: 8 });
  await page.mouse.up();
  await expect(sheet).toHaveClass(/sheet-expanded/);
  box = await handle.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + 18);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + 180, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Open account menu" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Help & getting started",
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Export", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Download PDF");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByLabel("Item name", { exact: true }).fill("Desk fan");
  await page.getByRole("button", { name: "Suggest a category" }).click();
  await expect(
    page.getByText(/Free-tier AI needs a connected company/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.locator(".item-card")).toHaveCount(8);
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe(
    "hidden",
  );
});

test("photo choices include webcam capture and file selection with permission fallback", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: async () => {
        throw new DOMException("Denied", "NotAllowedError");
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByLabel("Item name", { exact: true }).fill("Desk fan");
  await page.getByRole("button", { name: /Take a photo/ }).click();
  const choices = page.getByRole("dialog", { name: "Add a supply photo" });
  await expect(
    choices.getByRole("button", { name: "Choose a photo", exact: true }),
  ).toBeVisible();
  await choices.getByRole("button", { name: "Use camera" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Camera access was denied",
  );
  await page.getByRole("button", { name: "Back to photo choices" }).click();
  await expect(choices).toBeVisible();
  const fileChooser = page.waitForEvent("filechooser");
  await choices
    .getByRole("button", { name: "Choose a photo", exact: true })
    .click();
  await (
    await fileChooser
  ).setFiles({
    name: "photo.png",
    mimeType: "image/png",
    buffer: await page.screenshot({
      clip: { x: 0, y: 0, width: 32, height: 32 },
    }),
  });
  await expect(page.getByAltText("Your captured supply")).toHaveAttribute(
    "src",
    /^data:image\/webp/,
  );
  await page.getByRole("button", { name: "Add to my inventory" }).click();
  await expect(page.locator(".item-card")).toHaveCount(9);
});

test("connected members invite teammates from desktop and phone settings", async ({
  page,
}) => {
  const snapshot = demoSnapshot();
  snapshot.company.name = "Acme Office";
  await page.route("**/api/auth", (route) =>
    route.fulfill({
      json: { user: { id: snapshot.profile.id }, profile: snapshot.profile },
    }),
  );
  await page.route("**/api/inventory", (route) =>
    route.fulfill({ json: snapshot }),
  );
  const requests: unknown[] = [];
  await page.route("**/api/invitations", (route) => {
    requests.push(route.request().postDataJSON());
    return route.fulfill({
      json: {
        warning: requests.length === 2,
        message:
          requests.length === 2
            ? "Teammate added, but the email couldn't be sent. They can request a code from Stocket's sign-in screen."
            : "Teammate invited! Ask them to open Stocket and enter the code in their email.",
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page
    .getByLabel("Teammate email", { exact: true })
    .fill("one@office.com");
  await page
    .getByRole("button", { name: "Invite teammate", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Teammate invited!" }),
  ).toBeVisible();
  await expect(page.getByLabel("Teammate email", { exact: true })).toHaveValue(
    "",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByLabel("Teammate email", { exact: true })
    .fill("two@office.com");
  await page
    .getByRole("button", { name: "Invite teammate", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Teammate added" }),
  ).toBeVisible();
  expect(requests).toEqual([
    { email: "one@office.com" },
    { email: "two@office.com" },
  ]);
  await expect(
    page.getByText("Acme Office", { exact: true }).last(),
  ).toBeVisible();
});

test("invited teammates can verify their existing code without sending another email", async ({
  page,
}) => {
  let verified = false;
  const posts: any[] = [];
  await page.route("**/api/auth", (route) => {
    if (route.request().method() === "POST") {
      posts.push(route.request().postDataJSON());
      verified = true;
      return route.fulfill({ json: { ok: true } });
    }
    return route.fulfill({
      json: { user: verified ? { id: "invited-member" } : null, profile: null },
    });
  });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Connect your company", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Company email", { exact: true })
    .fill("teammate@office.com");
  await page
    .getByRole("button", { name: "I already have an email code", exact: true })
    .click();
  expect(posts).toHaveLength(0);
  await page.getByLabel("Email code", { exact: true }).fill("123456");
  await page
    .getByRole("button", { name: "Verify & continue", exact: true })
    .click();
  await expect(
    page.getByLabel("What should we call you?", { exact: true }),
  ).toBeVisible();
  expect(posts).toEqual([
    { action: "verify", email: "teammate@office.com", token: "123456" },
  ]);
});
