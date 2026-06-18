import { expect, test } from "@playwright/test";

test("dashboard shows profile, map preview, and report controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Mapcode REST Parity Runner")).toBeVisible();
  await expect(page.getByLabel("Profile")).toBeVisible();
  await expect(page.getByRole("option", { name: "Custom" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save report" })).toBeVisible();
});

test("dashboard opens service configuration from a service chip", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Java API \(leading\)/ }).click();

  await expect(page.getByRole("dialog", { name: "Java API (leading)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start automatically" })).toBeVisible();
  const statusText = await page.getByRole("status").innerText();
  expect(["not started", "failed"]).toContain(statusText.trim());
  await expect(page.getByLabel("Specify URL/port")).toHaveValue("http://127.0.0.1:8081");
  await expect(page.getByLabel("Source repository path")).toHaveValue("../mapcode-rest-service");
});

test("dashboard keeps service configuration open after automatic start", async ({ page }) => {
  await page.route("**/api/services/typescript/start", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        kind: "typescript",
        label: "TypeScript API (ported)",
        mode: "auto",
        baseUrl: "http://127.0.0.1:8082",
        sourcePath: "../mapcode-rest-service-ts",
        availability: "available",
        logs: ["started"]
      })
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: /TypeScript API \(ported\)/ }).click();
  await page.getByRole("button", { name: "Start automatically" }).click();

  await expect(page.getByRole("dialog", { name: "TypeScript API (ported)" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("operational");
  await expect(page.locator(".service-log")).toContainText("started");
});

test("dashboard renders TomTom tile images behind coverage points", async ({ page }) => {
  await page.route("**/api/config", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ hasTomTomApiKey: true }) });
  });
  await page.route("**/api/tomtom/tile/**", async (route) => {
    await route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
        "base64"
      )
    });
  });

  await page.goto("/");

  await expect(page.getByLabel("Coverage map preview")).toBeVisible();
  const mapBox = await page.getByLabel("Coverage map preview").boundingBox();
  expect(mapBox).not.toBeNull();
  expect(mapBox!.height).toBeGreaterThan(500);
  expect(mapBox!.width / mapBox!.height).toBeGreaterThan(0.95);
  expect(mapBox!.width / mapBox!.height).toBeLessThan(1.05);
  await expect(page.locator(".tile-map img")).toHaveCount(4);
  await expect(page.locator('.tile-map img[src*="/api/tomtom/tile/1/0/0.png"]')).toBeVisible();
  await expect(page.getByLabel("Map point legend")).toContainText("Queued");
});

test("dashboard opens an immediate report preview modal after saving", async ({ page }) => {
  await page.route("**/api/report/save", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        markdownPath: "reports/run-preview.md",
        jsonPath: "reports/run-preview.json",
        markdown: "# Mapcode API Parity Report preview\n\nNo discrepancies recorded.",
        html: "<h1>Mapcode API Parity Report preview</h1><p>No discrepancies recorded.</p>"
      })
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Save report" }).click();

  await expect(page.getByRole("dialog", { name: "Saved parity report" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy to Clipboard" })).toBeVisible();
  await expect(page.getByText("No discrepancies recorded.")).toBeVisible();
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

test("dashboard can save a browser TomTom key without echoing it", async ({ page }) => {
  await page.route("**/api/config", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ hasTomTomApiKey: false }) });
  });
  await page.route("**/api/config/tomtom-key", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ hasTomTomApiKey: true }) });
  });

  await page.goto("/");
  await page.getByPlaceholder("Paste API key").fill("browser-secret-key");
  await page.getByRole("button", { name: "Save key" }).click();

  await expect(page.getByRole("dialog", { name: /TomTom API key/i })).toBeHidden();
  await expect(page.getByText("browser-secret-key")).toHaveCount(0);
  await expect(page.getByLabel("Coverage map preview")).toBeVisible();
});
