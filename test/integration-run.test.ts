import { Runner } from "../src/coordinator/runner";
import { createServerApp } from "../src/coordinator/server";
import type { RequestCase, ServiceResponse } from "../src/shared/types";
import { inject } from "./fixtures/inject";

describe("integration run wiring", () => {
  it("runs a tiny parity set and produces a final summary", async () => {
    const cases: RequestCase[] = [
      { id: "version-json", method: "GET", path: "/mapcode/version", format: "json", expectation: "version-shape" }
    ];
    const runner = new Runner({
      javaBaseUrl: "http://java.test",
      typescriptBaseUrl: "http://ts.test",
      cases,
      fetchPair: async (request) => ({
        java: response("java", request, { version: "2" }),
        typescript: response("typescript", request, { version: "1" })
      })
    });
    const summary = await runner.start();
    expect(summary.completedCases).toBe(1);
    expect(summary.failures).toBe(0);
  });

  it("returns an idle state when pausing without an active runner", async () => {
    const app = createServerApp({ env: {} });
    const result = await inject(app, "/api/run/pause", { method: "POST" });

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ state: "idle" });
  });
});

function response(service: "java" | "typescript", _request: RequestCase, canonical: unknown): ServiceResponse {
  return { service, status: 200, contentType: "application/json", body: JSON.stringify(canonical), canonical: canonical as never };
}
