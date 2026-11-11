import { test, expect } from "@playwright/test";

const PAGES = [
  { path: "/", heading: /Fence/i },
  { path: "/protection", heading: /My session/i },
  { path: "/start", heading: /Set up Fence/i },
  { path: "/trade", heading: /Try a sample trade/i },
  { path: "/agent", heading: /Try sample AI phrases/i },
  { path: "/portfolio", heading: /Wallet check/i },
  { path: "/limitations", heading: /How it works/i },
  { path: "/history", heading: /Activity/i },
  { path: "/console", heading: /Developers/i },
] as const;

const PRIMARY_NAV = ["Home", "Get started", "How it works"];

test.describe("Static pages render", () => {
  for (const { path, heading } of PAGES) {
    test(`${path} has expected heading`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
    });
  }
});

test("primary nav labels", async ({ page }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Main" }).first();
  for (const label of PRIMARY_NAV) {
    await expect(nav.getByRole("link", { name: label })).toBeVisible();
  }
});
