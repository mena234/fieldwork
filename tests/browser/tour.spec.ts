import { test, expect, type Page } from "@playwright/test";

const owner = "33333333-3333-4333-8333-333333333333";
const preference = `fieldwork-tour-v1:${owner}:workspace`;
async function demo(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Open local demo" }).click();
  await expect(
    page.getByRole("dialog", { name: "Welcome to Fieldwork" }),
  ).toBeVisible();
}
async function records(page: Page) {
  return page.evaluate(async (owner) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(`fieldwork-${owner}`);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const stores = ["farmers", "submissions", "queue", "media"];
    const transaction = db.transaction(stores);
    const data = await Promise.all(
      stores.map(
        (name) =>
          new Promise((resolve, reject) => {
            const request = transaction.objectStore(name).getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          }),
      ),
    );
    db.close();
    return data;
  }, owner);
}

test("first visit tour walks through real screens without changing records; completion persists", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await demo(page);
  const before = await records(page);
  await page.screenshot({ path: "test-results/tour-welcome-desktop.png" });
  await page.getByRole("button", { name: "Show me around" }).click();
  const stops = [
    ["farmers", "#farmers"],
    ["timeline", "#profile/"],
    ["forms", "#forms"],
    ["map", "#map"],
    ["sync", "#sync"],
    ["review", "#review"],
  ];
  for (const [id, hash] of stops) {
    await expect(page.getByRole("dialog")).toHaveAttribute(
      "data-tour-step",
      id,
    );
    await expect.poll(() => page.url()).toContain(hash);
    await expect(page.locator(".tour-spotlight")).toBeVisible();
    if (id === "timeline")
      await page.screenshot({ path: "test-results/tour-timeline-desktop.png" });
    if (id === "sync")
      await expect(page.getByRole("dialog")).toContainText(
        "This demo keeps changes locally",
      );
    await page.getByRole("button", { name: "Next", exact: true }).click();
  }
  await expect(page.getByRole("dialog")).toHaveAttribute(
    "data-tour-step",
    "finish",
  );
  await page
    .getByRole("button", { name: "Explore farmers", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await records(page)).toEqual(before);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), preference),
  ).toBe("completed");
  await page.reload();
  await expect(page.getByRole("button", { name: "Take a tour" })).toBeEnabled();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("skip is remembered; replay supports back, keyboard, focus trapping and restores the original profile", async ({
  page,
  context,
}) => {
  await demo(page);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.goto("/#profile/44444444-4444-4444-8444-000000000002");
  await expect(
    page.getByRole("heading", { name: "Sunita Bai", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.getByRole("button", { name: "Take a tour" }).click();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("dialog")).toHaveAttribute(
    "data-tour-step",
    "farmers",
  );
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("dialog")).toHaveAttribute(
    "data-tour-step",
    "timeline",
  );
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveAttribute(
    "data-tour-step",
    "farmers",
  );
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(
        () => !!document.activeElement?.closest('[role="dialog"]'),
      ),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(
    /#profile\/44444444-4444-4444-8444-000000000002$/,
  );
  await expect(page.getByRole("button", { name: "Take a tour" })).toBeFocused();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Sunita Bai", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("tour stays usable at phone and tablet sizes in both languages", async ({
  page,
}) => {
  await demo(page);
  for (const width of [320, 375, 414, 768]) {
    await page.setViewportSize({ width, height: 812 });
    if (width !== 320)
      await page.getByRole("button", { name: "Take a tour" }).click();
    await expect(
      page.getByRole("button", { name: "Show me around" }),
    ).toBeInViewport();
    if (width === 375)
      await page.screenshot({ path: "test-results/tour-welcome-mobile.png" });
    await page.getByRole("button", { name: "Show me around" }).click();
    for (let step = 0; step < 6; step++) {
      await expect(
        page.getByRole("button", { name: "Next", exact: true }),
      ).toBeInViewport();
      const bounds = await page.getByRole("dialog").boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      if (width === 375 && step === 1)
        await page.screenshot({
          path: "test-results/tour-timeline-mobile.png",
        });
      await page.getByRole("button", { name: "Next", exact: true }).click();
    }
    await page.getByRole("button", { name: "Explore farmers" }).click();
  }
  await page.setViewportSize({ width: 320, height: 640 });
  await page.locator(".language-toggle").click();
  await page.getByRole("button", { name: "ऐप का परिचय", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Fieldwork में आपका स्वागत है",
  );
  await page.getByRole("button", { name: "परिचय शुरू करें" }).click();
  for (let step = 0; step < 6; step++) {
    await expect(
      page.getByRole("button", { name: "आगे", exact: true }),
    ).toBeInViewport();
    await page.getByRole("button", { name: "आगे", exact: true }).click();
  }
  await page.getByRole("button", { name: "किसान देखें", exact: true }).click();
});

test("manual tour leaves an in-progress visit mounted and returns to its saved answers", async ({
  page,
}) => {
  await demo(page);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.goto("/#profile/44444444-4444-4444-8444-000000000001");
  await page.getByRole("button", { name: "New visit", exact: true }).click();
  await page.getByLabel("Age *", { exact: true }).fill("53");
  await expect(
    page.getByText("Saved on this device", { exact: true }).first(),
  ).toBeVisible();
  const visitURL = page.url();
  await page.evaluate((key) => localStorage.removeItem(key), preference);
  await page.reload();
  await expect(page.getByLabel("Age *", { exact: true })).toHaveValue("53");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const before = await records(page);
  await page.getByRole("button", { name: "Take a tour" }).click();
  await page.getByRole("button", { name: "Show me around" }).click();
  for (let i = 0; i < 6; i++) {
    await expect(page).toHaveURL(visitURL);
    await expect(page.getByRole("dialog")).toContainText(
      "Your visit stays open",
    );
    await page.getByRole("button", { name: "Next", exact: true }).click();
  }
  await page.getByRole("button", { name: "Return to your visit" }).click();
  await expect(page.getByLabel("Age *", { exact: true })).toHaveValue("53");
  expect(await records(page)).toEqual(before);
});

test("empty downloaded projects explain the first farmer without opening a missing profile", async ({
  page,
}) => {
  await demo(page);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.evaluate(async (owner) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(`fieldwork-${owner}`);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction(
          ["farmers", "submissions", "queue"],
          "readwrite",
        );
        for (const name of ["farmers", "submissions", "queue"])
          tx.objectStore(name).clear();
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, owner);
  await page.reload();
  await page.getByRole("button", { name: "Take a tour" }).click();
  await page.getByRole("button", { name: "Show me around" }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "After registering your first farmer",
  );
  await expect(page).toHaveURL(/#farmers$/);
  await expect(page.locator(".tour-spotlight")).toBeVisible();
  await page.getByRole("button", { name: "Close tour" }).click();
});

test("accounts without a downloaded project get the preparation guide", async ({
  page,
}) => {
  // An isolated local test identity exercises setup copy without pretending cloud authentication succeeded.
  await page.addInitScript(() =>
    localStorage.setItem(
      "fieldwork-identity",
      JSON.stringify({
        id: "tour-setup-test",
        name: "Setup test",
        email: "setup@example.test",
        demo: false,
      }),
    ),
  );
  await page.goto("/");
  await expect(
    page.getByRole("dialog", { name: "Welcome to Fieldwork" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show me around" }).click();
  await expect(page.getByRole("dialog")).toHaveAttribute(
    "data-tour-step",
    "project",
  );
  await expect(page.getByRole("dialog")).toContainText(
    "your project admin needs to assign you",
  );
  await expect(page.locator(".tour-spotlight")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByRole("button", { name: "Choose a project" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      localStorage.getItem("fieldwork-tour-v1:tour-setup-test:setup"),
    ),
  ).toBe("completed");
});
