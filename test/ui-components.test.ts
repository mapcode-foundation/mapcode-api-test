import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { App } from "../src/ui/App";
import { CoverageMap } from "../src/ui/components/CoverageMap";
import { DiscrepancyDetail } from "../src/ui/components/DiscrepancyDetail";
import { ReportDialog } from "../src/ui/components/ReportDialog";
import { ServicePane } from "../src/ui/components/ServicePane";
import type { FixturePoint, RequestCase, RunSummary, ServiceResponse } from "../src/shared/types";

const request: RequestCase = {
  id: "precision-case",
  method: "GET",
  path: "/mapcode/codes/52,5",
  query: { precision: "8", include: "territory,alphabet" },
  format: "json",
  expectation: "parity"
};

const summary: RunSummary = {
  runId: "run-test",
  profile: "Fast",
  seed: 20260617,
  totalCases: 40,
  completedCases: 12,
  failures: 2,
  roundTrips: 6
};

describe("ServicePane", () => {
  it("shows query parameters, non-OK statuses, and falsy canonical payloads", () => {
    const response: ServiceResponse = {
      service: "typescript",
      status: 400,
      contentType: "application/json",
      body: "false",
      canonical: false
    };

    const markup = renderToStaticMarkup(createElement(ServicePane, { title: "TypeScript API (ported)", request, response }));

    expect(markup).toContain("400");
    expect(markup).not.toContain("400 OK");
    expect(markup).toContain("precision=8");
    expect(markup).toContain("include=territory%2Calphabet");
    expect(markup).toContain(">false<");
  });
});

describe("DiscrepancyDetail", () => {
  it("explains how to read canonical diff lines", () => {
    const markup = renderToStaticMarkup(createElement(DiscrepancyDetail, {}));

    expect(markup).toContain("Canonical diff");
    expect(markup).toContain("path: Java canonical value -&gt; TypeScript canonical value");
  });
});

describe("App shell", () => {
  it("offers only Fast and Deep profiles and uses the updated service labels", () => {
    const markup = renderToStaticMarkup(createElement(App));

    expect(markup).toContain("Fast");
    expect(markup).toContain("Deep");
    expect(markup).not.toContain("Custom");
    expect(markup).toContain("Java API (leading)");
    expect(markup).toContain("TypeScript API (ported)");
    expect(markup).toContain("Java API (leading) not started");
    expect(markup).toContain("TypeScript API (ported) not started");
    expect(markup).not.toContain("Java API (leading) unknown");
    expect(markup).toContain(">Report</button>");
    expect(markup).not.toContain("Save report");
  });

  it("disables Start while APIs are not operational", () => {
    const markup = renderToStaticMarkup(createElement(App));

    expect(markup).toMatch(/<button type="button" class="primary"[^>]*disabled=""/);
    expect(markup).toContain(">Start</button>");
  });

  it("uses a dropdown for request delay", () => {
    const markup = renderToStaticMarkup(createElement(App));

    expect(markup).toContain('<select id="request-delay"');
    expect(markup).toContain('<option value="0" selected="">full speed</option>');
    expect(markup).toContain('<option value="5">5s</option>');
    expect(markup).not.toContain('type="range"');
  });
});

describe("CoverageMap", () => {
  const points: FixturePoint[] = [
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
      id: "raster-000-000",
      category: "country",
      label: "Global raster 1/1",
      lat: -89,
      lon: -179,
      source: "global-raster"
    }
  ];

  it("renders a visible map/table view toggle while a map key is available", () => {
    const markup = renderToStaticMarkup(
      createElement(CoverageMap, {
        points,
        requests: [],
        currentRequest: { ...request, id: "capital-nld-amsterdam:codes:json", fixtureId: "capital-nld-amsterdam" },
        summary,
        states: { "capital-nld-amsterdam": "queued" },
        mapKeyAvailable: true,
        view: "map",
        onViewChange: () => undefined
      })
    );

    expect(markup).toContain("Map");
    expect(markup).toContain("Table");
    expect(markup).toContain("Coverage map preview");
    expect(markup).toContain("/api/tomtom/tile/1/0/0.png");
    expect(markup).toContain("Map point legend");
    expect(markup).toContain("Queued");
    expect(markup).toContain("Full overview");
    expect(markup).toContain("Tracking request");
    expect(markup).toContain("Map progress");
    expect(markup).toContain("12/40 cases");
    expect(markup).toContain("30%");
    expect(markup).toContain("2 failures");
    expect(markup).toContain("capital-nld-amsterdam:codes:json");
    expect(markup.indexOf("Coverage view")).toBeLessThan(markup.indexOf("Coverage map preview"));
  });

  it("hides queued global raster points from the map layer", () => {
    const markup = renderToStaticMarkup(
      createElement(CoverageMap, {
        points,
        requests: [],
        summary,
        states: { "capital-nld-amsterdam": "queued", "raster-000-000": "queued" },
        mapKeyAvailable: true,
        view: "map",
        onViewChange: () => undefined
      })
    );

    expect(markup).toContain("1 queued global raster points are hidden on the map");
    expect(markup).not.toContain('title="Global raster 1/1"');
  });

  it("shows global raster points on the map once they have result states", () => {
    const markup = renderToStaticMarkup(
      createElement(CoverageMap, {
        points,
        requests: [],
        summary,
        states: { "capital-nld-amsterdam": "queued", "raster-000-000": "passed" },
        mapKeyAvailable: true,
        view: "map",
        onViewChange: () => undefined
      })
    );

    expect(markup).not.toContain("queued global raster points are hidden on the map");
    expect(markup).toContain('class="point raster-point passed"');
    expect(markup).toContain('title="Global raster 1/1"');
  });

  it("keeps raster result dots from intercepting map gestures", () => {
    const styles = readFileSync("src/ui/styles.css", "utf8");

    expect(styles).toMatch(/\.point\.raster-point\s*\{[^}]*pointer-events:\s*none;/s);
  });

  it("adds an aggregate row for non-location requests in the fixture table", () => {
    const markup = renderToStaticMarkup(
      createElement(CoverageMap, {
        points,
        requests: [
          { ...request, id: "capital-nld-amsterdam:codes:json", fixtureId: "capital-nld-amsterdam" },
          { ...request, id: "version-json", path: "/mapcode/version", expectation: "version-shape" },
          { ...request, id: "codes-missing-json", path: "/mapcode/codes", expectation: "contract-error" }
        ],
        summary,
        states: { "capital-nld-amsterdam": "queued" },
        mapKeyAvailable: true,
        view: "table",
        onViewChange: () => undefined
      })
    );

    expect(markup).toContain("Non-location requests");
    expect(markup).toContain("version-json");
    expect(markup).toContain("codes-missing-json");
    expect(markup).toContain("2 requests");
  });
});

describe("ReportDialog", () => {
  it("renders report preview with save and copy controls", () => {
    const markup = renderToStaticMarkup(
      createElement(ReportDialog, {
        report: {
          markdown: "# Mapcode API Parity Report run-test\n\nNo discrepancies recorded.",
          html: "<h1>Mapcode API Parity Report run-test</h1><p>No discrepancies recorded.</p>",
          paths: { markdownPath: "reports/run-test.md", jsonPath: "reports/run-test.json" }
        },
        onClose: () => undefined,
        onCopy: () => undefined
      })
    );

    expect(markup).toContain("Mapcode API Parity Report run-test");
    expect(markup).toContain("Save");
    expect(markup).toContain("Copy to Clipboard");
  });
});
