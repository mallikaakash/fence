import { test, expect } from "@playwright/test";

test.describe("End user — offline policy mirror", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
  });

  test("oversize intent is denied without gateway session", async ({ page }) => {
    await page.goto("/trade", { waitUntil: "networkidle" });
    const oversize = page.getByRole("button", { name: "Oversize (deny)" });
    await expect(oversize).toBeEnabled();
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/propose") && r.request().method() === "POST",
      ),
      oversize.click(),
    ]);
    await expect(page.getByText(/Preview:\s*denied/i)).toBeVisible();
  });

  test("in-policy intent is allowed offline", async ({ page }) => {
    await page.goto("/trade", { waitUntil: "networkidle" });
    const allow = page.getByRole("button", { name: "In-policy (allow)" });
    await expect(allow).toBeEnabled();
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/propose") && r.request().method() === "POST",
      ),
      allow.click(),
    ]);
    await expect(page.getByText(/Preview:\s*allowed/i)).toBeVisible();
  });
});
