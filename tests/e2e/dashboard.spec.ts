import { expect, test } from "@playwright/test";

test("dashboard shows profile, map preview, and report controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Mapcode REST Parity Runner")).toBeVisible();
  await expect(page.getByLabel("Profile")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save report" })).toBeVisible();
});

test("dashboard can skip a missing TomTom key and continue with fixture table fallback", async ({ page }) => {
  await page.route("**/api/config", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ hasTomTomApiKey: false }) });
  });

  await page.goto("/");
  await expect(page.getByRole("dialog", { name: /TomTom API key/i })).toBeVisible();
  await page.getByRole("button", { name: "Skip map" }).click();
  await expect(page.getByRole("heading", { name: "Fixture Table" })).toBeVisible();
  await expect(page.getByText("Amsterdam")).toBeVisible();
});
