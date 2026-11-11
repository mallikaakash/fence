import { test, expect } from "@playwright/test";

/** Fresh visitor — no saved protection or gateway settings. */
async function clearUserStorage(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

test.describe("End user — first visit", () => {
  test.beforeEach(async ({ page }) => {
    await clearUserStorage(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
  });
  test("home hero leads to setup wizard", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("link", { name: "Start setup" })).toBeVisible();
    await page.getByRole("link", { name: "Start setup" }).click();
    await expect(page).toHaveURL(/\/start/);
    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  });

  test("nav mirrors primary user paths", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const nav = page.getByRole("navigation", { name: "Main" }).first();
    await nav.getByRole("link", { name: "Get started" }).click();
    await expect(page).toHaveURL(/\/start/);
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await nav.getByRole("link", { name: "How it works" }).click();
    await expect(page).toHaveURL(/\/limitations/);
    await page.goto("/protection", { waitUntil: "domcontentloaded" });
    await expect(page.getByText(/No protection set up yet/i)).toBeVisible();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page
      .getByRole("contentinfo")
      .getByRole("link", { name: "Wallet check" })
      .click();
    await expect(page).toHaveURL(/\/portfolio/);
  });

  test("setup wizard steps are discoverable", async ({ page }) => {
    await page.goto("/start");
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("button", { name: /Connect Keplr/i })).toBeVisible();
    await expect(page.getByText("Connect wallet", { exact: true })).toBeVisible();
  });

  test("portfolio and trade pages load audit UI", async ({ page }) => {
    await page.goto("/portfolio");
    await expect(page.getByRole("button", { name: "Connect Keplr / Leap" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Run auditor" })).toBeVisible();
    await expect(page.getByText("Injective testnet only")).toBeVisible();
  });

  test("how it works explains path in plain language", async ({ page }) => {
    await page.goto("/limitations");
    await expect(page.getByRole("link", { name: "Start setup" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/How it works/i);
  });

  test("developers page points to dashboard", async ({ page }) => {
    await page.goto("/console");
    await expect(page.getByRole("link", { name: "Open my session" })).toBeVisible();
    await expect(page.getByText(/Everyday users/i)).toBeVisible();
  });
});

test.describe("End user — hosted wiring", () => {
  test("hosted status reports gateway proxy", async ({ request, baseURL }) => {
    test.skip(!baseURL?.includes("run.app"), "hosted-only check");
    const res = await request.get("/api/hosted/status");
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { proxyConfigured?: boolean };
    expect(body.proxyConfigured).toBe(true);
  });

  test("health via browser proxy returns testnet execute", async ({ request, baseURL }) => {
    test.skip(!baseURL?.includes("run.app"), "hosted-only check");
    const res = await request.get("/api/gateway/health");
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { network?: string; executeEnabled?: boolean };
    expect(body.network).toBe("testnet");
    expect(body.executeEnabled).toBe(true);
  });
});

test.describe("End user — layout quality", () => {
  for (const path of ["/", "/start", "/protection", "/trade", "/portfolio"]) {
    test(`no horizontal scroll on ${path}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(path, { waitUntil: "networkidle" });
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
    });
  }
});
