import { Runner } from "../src/coordinator/runner";
import type { RequestCase, ServiceResponse } from "../src/shared/types";

const request: RequestCase = {
  id: "version-json",
  method: "GET",
  path: "/mapcode/version",
  format: "json",
  expectation: "version-shape"
};

function response(service: "java" | "typescript", version: string): ServiceResponse {
  return {
    service,
    status: 200,
    contentType: "application/json",
    body: `{"version":"${version}"}`,
    canonical: { version }
  };
}

describe("Runner", () => {
  it("emits summary, current case, and completion events", async () => {
    const events: string[] = [];
    const runner = new Runner({
      javaBaseUrl: "http://java.test",
      typescriptBaseUrl: "http://ts.test",
      cases: [request],
      fetchPair: async () => ({ java: response("java", "1"), typescript: response("typescript", "2") })
    });

    runner.onEvent((event) => events.push(event.type));

    await runner.start();

    expect(events).toContain("run-summary");
    expect(events).toContain("current-case");
    expect(events).toContain("run-complete");
  });

  it("records discrepancies when semantic payloads differ", async () => {
    const runner = new Runner({
      javaBaseUrl: "http://java.test",
      typescriptBaseUrl: "http://ts.test",
      cases: [{ ...request, path: "/mapcode/alphabets/GREEK", expectation: "parity" }],
      fetchPair: async () => ({ java: response("java", "one"), typescript: response("typescript", "two") })
    });
    const discrepancies: string[] = [];

    runner.onEvent((event) => {
      if (event.type === "discrepancy") discrepancies.push(event.discrepancy.summary);
    });

    await runner.start();

    expect(discrepancies).toHaveLength(1);
  });
});
