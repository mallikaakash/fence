import { test, expect } from "@playwright/test";

test.describe("End user — offline policy mirror", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
  });

  test("oversize intent is denied without gateway session", async ({ page }) => {
    await page.goto("/trade");
    await page.getByLabel("Max notional (offline)").fill("50");
    await page.getByLabel("Price").fill("100");
    await page.getByLabel("Quantity").fill("2");
    await page.getByRole("button", { name: "Evaluate proposal" }).click();
    await expect(page.getByText(/denied|reject|exceed|over/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("in-policy intent is allowed offline", async ({ page }) => {
    await page.goto("/trade");
    await page.getByLabel("Max notional (offline)").fill("500");
    await page.getByLabel("Price").fill("10");
    await page.getByLabel("Quantity").fill("1");
    await page.getByRole("button", { name: "Evaluate proposal" }).click();
    await expect(page.getByText(/allow|approved|ok/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});
