import { expect, test } from "@playwright/test";

test("serves the dashboard shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Mapcode REST Parity Runner" })).toBeVisible();
  await expect(page.getByLabel("Profile")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save report" })).toBeVisible();
});
