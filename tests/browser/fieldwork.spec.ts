import { test, expect, type Page } from "@playwright/test";
import sharp from "sharp";
import { mkdir, readFile } from "node:fs/promises";
async function openDemo(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Open local demo" }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(
    page.getByRole("heading", { name: "Every farmer. Every visit." }),
  ).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
}
async function choose(page: Page, label: string, answer: "Yes" | "No") {
  await page
    .getByRole("group", { name: label, exact: true })
    .getByRole("button", { name: answer, exact: true })
    .click();
}
test("offline farmer, submitted baseline, photo, GPS, boundary, and draft survive reopen; exports contain data", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({
    latitude: 23.2,
    longitude: 77.1,
    accuracy: 8,
  });
  await openDemo(page);
  await context.setOffline(true);
  await page
    .getByRole("button", { name: "Register farmer", exact: true })
    .click();
  await page.getByLabel("Farmer name").fill("Offline Acceptance Farmer");
  await page.getByLabel("Village *").fill("Acceptance village");
  await page.getByRole("button", { name: "Capture GPS", exact: true }).click();
  await expect(page.getByText("±8 m")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Register farmer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Offline Acceptance Farmer" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New visit", exact: true }).click();
  await page.getByLabel("Age *", { exact: true }).fill("46");
  await page.getByLabel("Household members").fill("5");
  await page.getByLabel("Main source of income").selectOption("farming");
  await page.getByLabel("Land tenure").selectOption("leased");
  await expect(page.getByLabel("Years remaining on lease")).toBeVisible();
  await page.getByLabel("Years remaining on lease").fill("8");
  await page.getByLabel("Farm area").fill("2.4");
  await page.getByLabel("Wheat", { exact: true }).check();
  await choose(page, "Is the farm irrigated?", "No");
  await page.getByLabel("Existing trees", { exact: false }).first().fill("18");
  await choose(page, "Crop residues burned?", "No");
  await choose(page, "Interested in agroforestry?", "Yes");
  const png = await sharp({
    create: { width: 1000, height: 800, channels: 3, background: "#547549" },
  })
    .png()
    .toBuffer();
  await page.locator("input[type=file]").setInputFiles({
    name: "field-evidence.png",
    mimeType: "image/png",
    buffer: png,
  });
  await expect(page.locator(".photo-grid img")).toBeVisible();
  await expect(page.getByText(/KB · Stored locally/)).toBeVisible();
  await page
    .getByRole("button", { name: "Submit for review", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Offline Acceptance Farmer" }),
  ).toBeVisible();
  await expect(
    page.locator(".timeline-content").filter({ hasText: "Baseline survey" }),
  ).toContainText("Awaiting review");
  await page.locator("#new-stage").selectOption("boundary");
  await page.getByRole("button", { name: "New visit", exact: true }).click();
  await page.getByText("View / enter coordinates", { exact: true }).click();
  for (const [lat, lon] of [
    ["23.20", "77.10"],
    ["23.20", "77.102"],
    ["23.202", "77.102"],
    ["23.202", "77.10"],
  ]) {
    await page.getByLabel("Latitude", { exact: true }).fill(lat);
    await page.getByLabel("Longitude", { exact: true }).fill(lon);
    await page.getByRole("button", { name: "Add vertex", exact: true }).click();
  }
  await expect(
    page.getByText("✓ Valid boundary · saved with this visit"),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Submit for review", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Offline Acceptance Farmer" }),
  ).toBeVisible();
  await page.locator("#new-stage").selectOption("monitoring");
  await page.getByRole("button", { name: "New visit", exact: true }).click();
  await page.getByLabel("Living trees").fill("18");
  await page.getByRole("button", { name: "Save & close", exact: true }).click();
  const profile = page.url();
  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(profile);
  await expect(
    reopened.getByRole("heading", { name: "Offline Acceptance Farmer" }),
  ).toBeVisible();
  await expect(
    reopened.locator(".timeline-content").filter({ hasText: "Monitoring" }),
  ).toContainText("Draft");
  await expect(reopened.locator(".boundary-summary-footer")).toContainText(
    "ha",
  );
  await reopened
    .locator(".timeline-content")
    .filter({ hasText: "Baseline survey" })
    .getByRole("button", { name: "View submission" })
    .click();
  await expect(reopened.getByRole("dialog").locator("img")).toBeVisible();
  await reopened.getByRole("button", { name: "Close", exact: true }).click();
  await reopened.getByRole("button", { name: "Farmers", exact: true }).click();
  const csvDownload = reopened.waitForEvent("download");
  await reopened.getByRole("button", { name: "Export data" }).click();
  const csv = await csvDownload;
  const csvText = await readFile((await csv.path())!, "utf8");
  expect(csvText).toContain("Offline Acceptance Farmer");
  expect(csvText).toContain("Acceptance village");
  expect(csvText).toContain("lease_years");
  await reopened
    .getByRole("button", { name: "Project settings", exact: true })
    .click();
  const geoDownload = reopened.waitForEvent("download");
  await reopened.getByRole("button", { name: "Download GeoJSON" }).click();
  const geo = JSON.parse(
    await readFile((await (await geoDownload).path())!, "utf8"),
  );
  expect(
    geo.features.some(
      (f: any) =>
        f.properties.name === "Offline Acceptance Farmer" &&
        f.geometry.type === "Polygon",
    ),
  ).toBe(true);
  await reopened.getByRole("button", { name: /Sync centre/ }).click();
  await context.setOffline(false);
  await reopened.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect(reopened.locator(".notice[role=alert]")).toContainText(
    "Local demonstration: cloud sync is unavailable",
  );
  await expect(reopened.locator(".queue-row")).toHaveCount(5);
});
test("Hindi forms, conditional validation, search, and responsive layouts", async ({
  page,
}) => {
  await openDemo(page);
  await mkdir("docs/screenshots", { recursive: true });
  await page.setViewportSize({ width: 1600, height: 1100 });
  await expect(page.locator(".farmer-marker").first()).toBeVisible();
  await page.screenshot({
    path: "docs/screenshots/registry-desktop.png",
    fullPage: true,
  });
  await page.getByLabel("Search farmers").fill("Ramesh");
  await expect(page.locator(".farmer-table tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "Open Ramesh Patel" }).click();
  await page.screenshot({
    path: "docs/screenshots/farmer-timeline.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "New visit", exact: true }).click();
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "आधारभूत सर्वेक्षण" }),
  ).toBeVisible();
  await expect(page.getByLabel("आयु")).toBeVisible();
  await page.getByRole("button", { name: "समीक्षा हेतु जमा करें" }).click();
  await expect(page.locator(".notice[role=alert]")).toContainText(
    "चिह्नित प्रश्नों",
  );
  await page.getByRole("button", { name: "हिन्दी", exact: true }).click();
  await page.getByRole("button", { name: "Save & close", exact: true }).click();
  await page
    .getByRole("button", { name: "Farmer registry", exact: true })
    .click();
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 960 });
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.screenshot({
      path: `docs/screenshots/registry-${width}.png`,
      fullPage: true,
    });
  }
});
