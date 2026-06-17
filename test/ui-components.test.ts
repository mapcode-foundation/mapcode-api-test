import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ServicePane } from "../src/ui/components/ServicePane";
import type { RequestCase, ServiceResponse } from "../src/shared/types";

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

    const markup = renderToStaticMarkup(createElement(ServicePane, { title: "TypeScript Port", request, response }));

    expect(markup).toContain("400");
    expect(markup).not.toContain("400 OK");
    expect(markup).toContain("precision=8");
    expect(markup).toContain("include=territory%2Calphabet");
    expect(markup).toContain(">false<");
  });
});
