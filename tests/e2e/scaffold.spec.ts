import { expect, test } from "@playwright/test";

test("serves the dashboard shell", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Mapcode REST Parity Runner" })).toBeVisible();
  await expect(page.getByText("Coordinator connected.")).toBeVisible();
});
