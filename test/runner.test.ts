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
      cases: [{ ...request, path: "/mapcode/alphabets/GREEK", query: { precision: "8", include: "territory,alphabet" }, expectation: "parity" }],
      fetchPair: async () => ({ java: response("java", "one"), typescript: response("typescript", "two") })
    });
    const discrepancies: string[] = [];

    runner.onEvent((event) => {
      if (event.type === "discrepancy") discrepancies.push(event.discrepancy.replay);
    });

    await runner.start();

    expect(discrepancies).toHaveLength(1);
    expect(discrepancies[0]).toBe("GET /mapcode/alphabets/GREEK?precision=8&include=territory%2Calphabet");
  });

  it("emits immutable summary snapshots", async () => {
    const summaries: number[] = [];
    const runner = new Runner({
      javaBaseUrl: "http://java.test",
      typescriptBaseUrl: "http://ts.test",
      cases: [request],
      fetchPair: async () => ({ java: response("java", "1"), typescript: response("typescript", "2") })
    });

    runner.onEvent((event) => {
      if (event.type === "run-summary") summaries.push(event.summary.completedCases);
    });

    await runner.start();

    expect(summaries).toEqual([0, 1]);
  });

  it("can stop while paused without fetching a case", async () => {
    const runner = new Runner({
      javaBaseUrl: "http://java.test",
      typescriptBaseUrl: "http://ts.test",
      cases: [request],
      fetchPair: async () => {
        throw new Error("fetchPair should not run after stop");
      }
    });
    const completions: number[] = [];

    runner.onEvent((event) => {
      if (event.type === "run-summary" && event.summary.completedCases === 0) runner.stop();
      if (event.type === "run-complete") completions.push(event.summary.completedCases);
    });
    runner.pause();

    await runner.start();

    expect(completions).toEqual([0]);
  });

  it("records infrastructure discrepancies when a request fails", async () => {
    const runner = new Runner({
      javaBaseUrl: "http://java.test",
      typescriptBaseUrl: "http://ts.test",
      cases: [request],
      fetchPair: async () => {
        throw new Error("connect ECONNREFUSED");
      }
    });
    const discrepancies: string[] = [];

    runner.onEvent((event) => {
      if (event.type === "discrepancy") discrepancies.push(`${event.discrepancy.status}:${event.discrepancy.summary}`);
    });

    const summary = await runner.start();

    expect(summary.completedCases).toBe(1);
    expect(summary.failures).toBe(1);
    expect(discrepancies).toEqual(["infrastructure-error:Request failed before both services returned: connect ECONNREFUSED"]);
  });

  it("does not emit response events after stop during an in-flight request", async () => {
    let resolveFetch!: (value: { java: ServiceResponse; typescript: ServiceResponse }) => void;
    let resolveStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      resolveStarted = resolve;
    });
    const runner = new Runner({
      javaBaseUrl: "http://java.test",
      typescriptBaseUrl: "http://ts.test",
      cases: [request],
      fetchPair: async () => {
        resolveStarted();
        return new Promise((resolve) => {
          resolveFetch = resolve;
        });
      }
    });
    const events: string[] = [];
    runner.onEvent((event) => events.push(event.type));

    const runPromise = runner.start();
    await started;

    runner.stop();
    resolveFetch({ java: response("java", "1"), typescript: response("typescript", "1") });
    await runPromise;

    expect(events).not.toContain("current-case");
    expect(events).not.toContain("discrepancy");
  });
});
