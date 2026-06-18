import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const operationalServices = {
  java: {
    kind: "java",
    label: "Java API (leading)",
    mode: "manual",
    baseUrl: "http://127.0.0.1:8081",
    sourcePath: "../mapcode-rest-service",
    availability: "available",
    logs: []
  },
  typescript: {
    kind: "typescript",
    label: "TypeScript API (ported)",
    mode: "manual",
    baseUrl: "http://127.0.0.1:8082",
    sourcePath: "../mapcode-rest-service-ts",
    availability: "available",
    logs: []
  }
};

async function routeServices(page: Page, services = operationalServices): Promise<void> {
  await page.route("**/api/services", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(services) });
  });
}

test("dashboard shows profile, map preview, and report controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Mapcode REST Parity Runner")).toBeVisible();
  await expect(page.getByLabel("Profile")).toBeVisible();
  await expect(page.getByRole("option", { name: "Custom" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Preview map" })).toHaveCount(0);
  await expect(page.getByLabel("Delay")).toHaveValue("0");
  await expect(page.getByRole("button", { name: "Save report" })).toBeVisible();
  const controlOrder = await page.locator(".run-controls").evaluate((node) =>
    Array.from(node.children).map((child) => child.textContent?.replace(/\s+/g, " ").trim())
  );
  expect(controlOrder.slice(0, 3)).toEqual(["Start", "Pause", "Stop"]);
  expect(controlOrder[3]).toContain("Delay");
  expect(controlOrder[3]).toContain("full speed");
  const sectionOrder = await page.locator(".dashboard-main > *").evaluateAll((nodes) =>
    nodes.map((node) => {
      if ((node as HTMLElement).classList.contains("run-summary")) return "summary";
      if ((node as HTMLElement).classList.contains("workspace")) return "workspace";
      if ((node as HTMLElement).classList.contains("coverage-preview")) return "coverage";
      return node.nodeName.toLowerCase();
    })
  );
  expect(sectionOrder).toEqual(["summary", "workspace", "coverage"]);
});

test("dashboard sends the selected request delay when starting a run", async ({ page }) => {
  let startPayload: unknown;
  await routeServices(page);
  await page.route("**/api/run/start", async (route) => {
    startPayload = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ state: "running", totalCases: 1 })
    });
  });

  await page.goto("/");
  await page.getByLabel("Delay").fill("2.5");
  await expect(page.getByText("2.5s")).toBeVisible();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.getByText("1 queued requests")).toBeVisible();

  expect(startPayload).toMatchObject({ profile: "Fast", requestDelaySeconds: 2.5 });
});

test("dashboard starts at full speed by default", async ({ page }) => {
  let startPayload: unknown;
  await routeServices(page);
  await page.route("**/api/run/start", async (route) => {
    startPayload = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ state: "running", totalCases: 1 })
    });
  });

  await page.goto("/");
  await expect(page.getByText("full speed")).toBeVisible();
  await page.getByRole("button", { name: "Start", exact: true }).click();

  expect(startPayload).toMatchObject({ profile: "Fast", requestDelaySeconds: 0 });
});

test("dashboard applies speed changes during a run with a pause and resume cycle", async ({ page }) => {
  const calls: string[] = [];
  let delayPayload: unknown;
  await routeServices(page);
  await page.route("**/api/run/start", async (route) => {
    calls.push("start");
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ state: "running", totalCases: 10 })
    });
  });
  await page.route("**/api/run/pause", async (route) => {
    calls.push("pause");
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ state: "paused" }) });
  });
  await page.route("**/api/run/delay", async (route) => {
    calls.push("delay");
    delayPayload = route.request().postDataJSON();
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ requestDelaySeconds: 3 }) });
  });
  await page.route("**/api/run/resume", async (route) => {
    calls.push("resume");
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ state: "running" }) });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.getByLabel("Delay").fill("3");
  await expect(page.getByText("3s")).toBeVisible();

  await expect.poll(() => calls).toEqual(["start", "pause", "delay", "resume"]);
  expect(delayPayload).toMatchObject({ requestDelaySeconds: 3 });
});

test("dashboard disables Start while either API is not operational", async ({ page }) => {
  await routeServices(page, {
    ...operationalServices,
    typescript: {
      ...operationalServices.typescript,
      availability: "unavailable"
    }
  });

  await page.goto("/");

  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeDisabled();
});

test("dashboard opens service configuration from a service chip", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Java API \(leading\)/ }).click();

  await expect(page.getByRole("dialog", { name: "Java API (leading)" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start automatically" })).toBeVisible();
  const statusText = await page.getByRole("status").innerText();
  expect(["not started", "starting", "operational", "failed"]).toContain(statusText.trim());
  await expect(page.getByLabel("Specify URL/port")).toHaveValue("http://127.0.0.1:8081");
  await expect(page.getByLabel("Source repository path")).toHaveValue("../mapcode-rest-service");
});

test("dashboard closes service configuration after automatic start is operational", async ({ page }) => {
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

  await expect(page.getByRole("dialog", { name: "TypeScript API (ported)" })).toBeHidden();
  await expect(page.getByRole("button", { name: "TypeScript API (ported) operational" })).toBeVisible();
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

test("dashboard map can zoom, pan, track a fixture request, and return to overview", async ({ page }) => {
  await page.route("**/api/config", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ hasTomTomApiKey: true }) });
  });
  await page.route("**/api/fixtures**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        seed: 20260617,
        points: [
          {
            id: "capital-nld-amsterdam",
            category: "capital",
            label: "Amsterdam, NLD",
            lat: 52.376514,
            lon: 4.908543,
            territory: "NLD",
            source: "test"
          }
        ]
      })
    });
  });
  await page.route("**/api/cases**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "capital-nld-amsterdam:codes:json",
          fixtureId: "capital-nld-amsterdam",
          method: "GET",
          path: "/mapcode/codes/52.376514,4.908543",
          format: "json",
          expectation: "parity"
        }
      ])
    });
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

  const map = page.getByLabel("Coverage map preview");
  await expect(map).toHaveAttribute("data-zoom", "1");
  await page.getByRole("button", { name: "Tracking request" }).click();
  await page.getByRole("button", { name: "Full overview" }).click();
  await expect(map).toHaveAttribute("data-zoom", "1");
  await map.scrollIntoViewIfNeeded();
  const mapBox = await map.boundingBox();
  expect(mapBox).not.toBeNull();

  await map.hover();
  await page.mouse.wheel(0, -120);
  await expect.poll(async () => Number(await map.getAttribute("data-zoom"))).toBeGreaterThan(1);
  await expect.poll(async () => Number(await map.getAttribute("data-zoom"))).toBeLessThan(2);

  const centerBeforePan = await map.getAttribute("data-center-lon");
  await page.mouse.down();
  await page.mouse.move(mapBox!.x + mapBox!.width / 2 + 120, mapBox!.y + mapBox!.height / 2);
  await page.mouse.up();
  await expect
    .poll(async () => map.getAttribute("data-center-lon"))
    .not.toBe(centerBeforePan);

  await page.mouse.wheel(0, -240);
  await expect.poll(async () => Number(await map.getAttribute("data-zoom"))).toBeGreaterThan(1.8);
  const zoomBeforeTracking = await map.getAttribute("data-zoom");
  await page.getByRole("button", { name: "Track request" }).click();
  await expect(map).toHaveAttribute("data-zoom", zoomBeforeTracking ?? "");
  await expect(map).toHaveAttribute("data-center-lat", "52.3765");
  await expect(map).toHaveAttribute("data-center-lon", "4.9085");

  await page.getByRole("button", { name: "Full overview" }).click();
  await expect(map).toHaveAttribute("data-zoom", "1");

  await page.locator('.coverage-static-layer .point[title="Amsterdam, NLD"]').dblclick();
  await expect(map).toHaveAttribute("data-zoom", "10");
  await expect(map).toHaveAttribute("data-center-lat", "52.3765");
  await expect(map).toHaveAttribute("data-center-lon", "4.9085");
});

test("dashboard map tracks current request by default and can toggle tracking off", async ({ page }) => {
  await page.addInitScript(() => {
    const sources: { onmessage: ((message: { data: string }) => void) | null }[] = [];
    class FakeEventSource {
      onmessage: ((message: { data: string }) => void) | null = null;

      constructor() {
        sources.push(this);
      }

      close() {
        const index = sources.indexOf(this);
        if (index >= 0) sources.splice(index, 1);
      }
    }

    window.EventSource = FakeEventSource as unknown as typeof EventSource;
    (window as typeof window & { __emitDashboardEvent?: (event: unknown) => void }).__emitDashboardEvent = (event: unknown) => {
      for (const source of sources) {
        source.onmessage?.({ data: JSON.stringify(event) });
      }
    };
  });
  await page.route("**/api/config", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ hasTomTomApiKey: true }) });
  });
  await page.route("**/api/fixtures**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        seed: 20260617,
        points: [
          {
            id: "capital-nld-amsterdam",
            category: "capital",
            label: "Amsterdam, NLD",
            lat: 52.376514,
            lon: 4.908543,
            territory: "NLD",
            source: "test"
          },
          {
            id: "city-ken-nairobi",
            category: "near-capital",
            label: "Nairobi, KEN",
            lat: -1.286389,
            lon: 36.817223,
            territory: "KEN",
            source: "test"
          }
        ]
      })
    });
  });
  await page.route("**/api/cases**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "capital-nld-amsterdam:codes:json",
          fixtureId: "capital-nld-amsterdam",
          method: "GET",
          path: "/mapcode/codes/52.376514,4.908543",
          format: "json",
          expectation: "parity"
        },
        {
          id: "city-ken-nairobi:codes:json",
          fixtureId: "city-ken-nairobi",
          method: "GET",
          path: "/mapcode/codes/-1.286389,36.817223",
          format: "json",
          expectation: "parity"
        }
      ])
    });
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

  const map = page.getByLabel("Coverage map preview");
  const trackingToggle = page.getByRole("button", { name: "Tracking request" });
  await expect(trackingToggle).toHaveAttribute("aria-pressed", "true");
  await expect(map).toHaveAttribute("data-zoom", "1");
  await map.hover();
  await page.mouse.wheel(0, -360);
  await expect(map).toHaveAttribute("data-zoom", "2");

  await page.evaluate(() => {
    (window as typeof window & { __emitDashboardEvent?: (event: unknown) => void }).__emitDashboardEvent?.({
      type: "current-case",
      request: {
        id: "city-ken-nairobi:codes:json",
        fixtureId: "city-ken-nairobi",
        method: "GET",
        path: "/mapcode/codes/-1.286389,36.817223",
        format: "json",
        expectation: "parity"
      }
    });
  });

  await expect(map).toHaveAttribute("data-zoom", "2");
  await expect(map).toHaveAttribute("data-center-lat", "-1.2864");
  await expect(map).toHaveAttribute("data-center-lon", "36.8172");

  await trackingToggle.click();
  await expect(page.getByRole("button", { name: "Track request" })).toHaveAttribute("aria-pressed", "false");
  await page.evaluate(() => {
    (window as typeof window & { __emitDashboardEvent?: (event: unknown) => void }).__emitDashboardEvent?.({
      type: "current-case",
      request: {
        id: "capital-nld-amsterdam:codes:json",
        fixtureId: "capital-nld-amsterdam",
        method: "GET",
        path: "/mapcode/codes/52.376514,4.908543",
        format: "json",
        expectation: "parity"
      }
    });
  });

  await expect(map).toHaveAttribute("data-center-lat", "-1.2864");
  await expect(map).toHaveAttribute("data-center-lon", "36.8172");
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
