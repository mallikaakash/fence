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
  });
  test("home hero leads to Protect wizard", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Protect my wallet" })).toBeVisible();
    await page.getByRole("link", { name: "Protect my wallet" }).click();
    await expect(page).toHaveURL(/\/start/);
    await expect(page.getByRole("button", { name: /Start — about 3 minutes/i })).toBeVisible();
  });

  test("nav mirrors primary user paths", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Main" })
      .first()
      .getByRole("link", { name: "My protection" })
      .click();
    await expect(page).toHaveURL(/\/protection/);
    await expect(page.getByText(/No protection set up yet/i)).toBeVisible();
    await page
      .getByRole("navigation", { name: "Main" })
      .first()
      .getByRole("link", { name: "Grant audit" })
      .click();
    await expect(page).toHaveURL(/\/portfolio/);
  });

  test("Protect wizard steps are discoverable", async ({ page }) => {
    await page.goto("/start");
    await page.getByRole("button", { name: /Start — about 3 minutes/i }).click();
    await expect(page.getByRole("button", { name: /Connect Keplr/i })).toBeVisible();
    await expect(page.getByText("Wallet", { exact: true })).toBeVisible();
  });

  test("trade and agent gate users without a session", async ({ page }) => {
    await page.goto("/trade");
    await expect(page.getByText(/Preview mode/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Evaluate proposal" })).toBeVisible();
    await page.goto("/agent");
    await expect(page.getByText(/Complete[\s\S]*Protect first/i)).toBeVisible();
    await expect(page.getByRole("button", { name: "Small long INJ" })).toBeDisabled();
  });

  test("grant audit is usable without wallet extension", async ({ page }) => {
    await page.goto("/portfolio");
    await expect(page.getByRole("button", { name: "Connect Keplr / Leap" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Run auditor" })).toBeVisible();
    await expect(page.getByText("Injective testnet only")).toBeVisible();
  });

  test("how it works explains path in plain language", async ({ page }) => {
    await page.goto("/limitations");
    await expect(page.getByRole("link", { name: "Start protecting" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/How it works/i);
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
      const overflow = await page.evaluate(() => {
        const el = document.documentElement;
        return el.scrollWidth - el.clientWidth;
      });
      expect(overflow).toBeLessThanOrEqual(2);
    });
  }
});
