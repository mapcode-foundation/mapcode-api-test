import { Runner } from "../src/coordinator/runner";
import type { RequestCase, ServiceResponse } from "../src/shared/types";

const request: RequestCase = {
  id: "version-json",
  method: "GET",
  path: "/mapcode/version",
  format: "json",
  expectation: "version-shape"
};

function response(service: "production" | "candidate", version: string): ServiceResponse {
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
      productionBaseUrl: "http://java.test",
      candidateBaseUrl: "http://ts.test",
      cases: [request],
      fetchPair: async () => ({ production: response("production", "1"), candidate: response("candidate", "2") })
    });

    runner.onEvent((event) => events.push(event.type));

    await runner.start();

    expect(events).toContain("run-summary");
    expect(events).toContain("current-case");
    expect(events).toContain("run-complete");
  });

  it("records discrepancies when semantic payloads differ", async () => {
    const runner = new Runner({
      productionBaseUrl: "http://java.test",
      candidateBaseUrl: "http://ts.test",
      cases: [{ ...request, path: "/mapcode/alphabets/GREEK", query: { precision: "8", include: "territory,alphabet" }, expectation: "parity" }],
      fetchPair: async () => ({ production: response("production", "one"), candidate: response("candidate", "two") })
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
      productionBaseUrl: "http://java.test",
      candidateBaseUrl: "http://ts.test",
      cases: [request],
      fetchPair: async () => ({ production: response("production", "1"), candidate: response("candidate", "2") })
    });

    runner.onEvent((event) => {
      if (event.type === "run-summary") summaries.push(event.summary.completedCases);
    });

    await runner.start();

    expect(summaries).toEqual([0, 1]);
  });

  it("reports current and average request throughput", async () => {
    const times = [1000, 1000, 1250];
    const runner = new Runner({
      productionBaseUrl: "http://java.test",
      candidateBaseUrl: "http://ts.test",
      cases: [request],
      now: () => times.shift() ?? 1250,
      fetchPair: async () => ({ production: response("production", "1"), candidate: response("candidate", "1") })
    });
    const summaries: Array<{ current: number | undefined; average: number | undefined }> = [];

    runner.onEvent((event) => {
      if (event.type === "run-summary") {
        summaries.push({
          current: event.summary.currentRequestsPerSecond,
          average: event.summary.averageRequestsPerSecond
        });
      }
    });

    await runner.start();

    expect(summaries).toEqual([
      { current: 0, average: 0 },
      { current: 4, average: 4 }
    ]);
  });

  it("can stop while paused without fetching a case", async () => {
    const runner = new Runner({
      productionBaseUrl: "http://java.test",
      candidateBaseUrl: "http://ts.test",
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
      productionBaseUrl: "http://java.test",
      candidateBaseUrl: "http://ts.test",
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
    let resolveFetch!: (value: { production: ServiceResponse; candidate: ServiceResponse }) => void;
    let resolveStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      resolveStarted = resolve;
    });
    const runner = new Runner({
      productionBaseUrl: "http://java.test",
      candidateBaseUrl: "http://ts.test",
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
    resolveFetch({ production: response("production", "1"), candidate: response("candidate", "1") });
    await runPromise;

    expect(events).not.toContain("current-case");
    expect(events).not.toContain("discrepancy");
  });

  it("aborts an in-flight request when stopped", async () => {
    let requestSignal: AbortSignal | undefined;
    let resolveStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      resolveStarted = resolve;
    });
    const runner = new Runner({
      productionBaseUrl: "http://java.test",
      candidateBaseUrl: "http://ts.test",
      cases: [request],
      fetchPair: async (_request, signal) => {
        requestSignal = signal;
        resolveStarted();
        return new Promise((resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("aborted")));
          setTimeout(() => resolve({ production: response("production", "1"), candidate: response("candidate", "1") }), 1_000);
        });
      }
    });

    const runPromise = runner.start();
    await started;
    runner.stop();

    await expect(Promise.race([runPromise.then(() => "done"), new Promise((resolve) => setTimeout(() => resolve("timeout"), 50))])).resolves.toBe(
      "done"
    );
    expect(requestSignal?.aborted).toBe(true);
  });

  it("keeps failed fixture state after a later request for the same fixture passes", async () => {
    const firstRequest: RequestCase = {
      ...request,
      id: "fixture-case-1",
      fixtureId: "fixture-1",
      path: "/mapcode/codes/52.1,4.3",
      expectation: "parity"
    };
    const secondRequest: RequestCase = {
      ...request,
      id: "fixture-case-2",
      fixtureId: "fixture-1",
      path: "/mapcode/codes/52.1,4.3",
      expectation: "parity"
    };
    const pointStates: string[] = [];
    const runner = new Runner({
      productionBaseUrl: "http://java.test",
      candidateBaseUrl: "http://ts.test",
      cases: [firstRequest, secondRequest],
      fetchPair: async (nextRequest) => ({
        production: response("production", nextRequest.id === "fixture-case-1" ? "one" : "same"),
        candidate: response("candidate", nextRequest.id === "fixture-case-1" ? "two" : "same")
      })
    });

    runner.onEvent((event) => {
      if (event.type === "point-state") pointStates.push(event.state);
    });

    await runner.start();

    expect(pointStates).toEqual(["active", "failed", "active", "failed"]);
  });

  it("waits between requests when a request delay is configured", async () => {
    const sleeps: number[] = [];
    const fetches: string[] = [];
    const secondRequest: RequestCase = { ...request, id: "territory-json", path: "/mapcode/territories/NLD" };
    const runner = new Runner({
      productionBaseUrl: "http://java.test",
      candidateBaseUrl: "http://ts.test",
      cases: [request, secondRequest],
      requestDelayMs: 1000,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      fetchPair: async (nextRequest) => {
        fetches.push(nextRequest.id);
        return { production: response("production", "1"), candidate: response("candidate", "1") };
      }
    });

    await runner.start();

    expect(fetches).toEqual(["version-json", "territory-json"]);
    expect(sleeps).toEqual([1000]);
  });

  it("uses an updated request delay for the next wait", async () => {
    const sleeps: number[] = [];
    const secondRequest: RequestCase = { ...request, id: "territory-json", path: "/mapcode/territories/NLD" };
    const runner = new Runner({
      productionBaseUrl: "http://java.test",
      candidateBaseUrl: "http://ts.test",
      cases: [request, secondRequest],
      requestDelayMs: 1000,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      fetchPair: async () => ({ production: response("production", "1"), candidate: response("candidate", "1") })
    });

    runner.onEvent((event) => {
      if (event.type === "run-summary" && event.summary.completedCases === 1) runner.setRequestDelay(2500);
    });

    await runner.start();

    expect(sleeps).toEqual([2500]);
  });
});
