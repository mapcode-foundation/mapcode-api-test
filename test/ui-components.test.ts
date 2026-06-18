import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { App } from "../src/ui/App";
import { CoverageMap } from "../src/ui/components/CoverageMap";
import { ReportDialog } from "../src/ui/components/ReportDialog";
import { ServicePane } from "../src/ui/components/ServicePane";
import type { FixturePoint, RequestCase, ServiceResponse } from "../src/shared/types";

const request: RequestCase = {
  id: "precision-case",
  method: "GET",
  path: "/mapcode/codes/52,5",
  query: { precision: "8", include: "territory,alphabet" },
  format: "json",
  expectation: "parity"
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

describe("App shell", () => {
  it("offers only Fast and Deep profiles and uses the updated service labels", () => {
    const markup = renderToStaticMarkup(createElement(App));

    expect(markup).toContain("Fast");
    expect(markup).toContain("Deep");
    expect(markup).not.toContain("Custom");
    expect(markup).toContain("Java API (leading)");
    expect(markup).toContain("TypeScript API (ported)");
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
    }
  ];

  it("renders a visible map/table view toggle while a map key is available", () => {
    const markup = renderToStaticMarkup(
      createElement(CoverageMap, {
        points,
        states: { "capital-nld-amsterdam": "queued" },
        mapKeyAvailable: true,
        view: "map",
        onViewChange: () => undefined
      })
    );

    expect(markup).toContain("Map");
    expect(markup).toContain("Table");
    expect(markup).toContain("Coverage map preview");
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
