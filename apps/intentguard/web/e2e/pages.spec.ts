import { test, expect } from "@playwright/test";

const ROUTES: { path: string; heading: RegExp }[] = [
  { path: "/", heading: /IntentGuard/i },
  { path: "/start", heading: /Protect your trading/i },
  { path: "/trade", heading: /Try your limits/i },
  { path: "/agent", heading: /Demo agent/i },
  { path: "/portfolio", heading: /Grant audit/i },
  { path: "/history", heading: /Activity log/i },
  { path: "/limitations", heading: /How it works/i },
  { path: "/console", heading: /Developer console/i },
];

const PRIMARY_NAV = ["Home", "Protect", "Try limits", "Demo agent", "Grant audit"];

test.describe("IntentGuard pages", () => {
  for (const { path, heading } of ROUTES) {
    test(`${path} loads with heading and nav`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1 })).toContainText(heading, {
        timeout: 45_000,
      });
      for (const label of PRIMARY_NAV) {
        await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: label })).toBeVisible();
      }
      await expect(page.getByRole("contentinfo")).toContainText(/testnet/i);
    });
  }

  test("limitations mentions Helix bots contrast", async ({ page }) => {
    await page.goto("/limitations");
    await expect(page.getByText(/Helix trading bots/i)).toBeVisible();
    await expect(page.getByText(/testnet faucet/i)).toBeVisible();
  });

  test("footer links resolve", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("navigation", { name: "Secondary" }).getByRole("link", { name: "How it works" }).click();
    await expect(page).toHaveURL(/\/limitations/);
  });

  test("no document overflow on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/start");
    const overflow = await page.evaluate(() => {
      const el = document.documentElement;
      return el.scrollWidth - el.clientWidth;
    });
    expect(overflow).toBeLessThanOrEqual(2);
  });
});
