import { compareResponses } from "./comparator";
import { fetchService } from "./http-client";
import type { Discrepancy, PointState, RequestCase, RunnerEvent, RunProfileName, RunSummary, ServiceResponse } from "../shared/types";

export interface RunnerInput {
  javaBaseUrl: string;
  typescriptBaseUrl: string;
  cases: RequestCase[];
  profile?: RunProfileName;
  seed?: number;
  fetchPair?: (request: RequestCase, signal?: AbortSignal) => Promise<{ java: ServiceResponse; typescript: ServiceResponse }>;
  requestDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export class Runner {
  private listeners = new Set<(event: RunnerEvent) => void>();
  private paused = false;
  private stopped = false;
  private summary: RunSummary;
  private fetchPair: (request: RequestCase, signal?: AbortSignal) => Promise<{ java: ServiceResponse; typescript: ServiceResponse }>;
  private requestDelayMs: number;
  private sleep: (ms: number) => Promise<void>;
  private currentRequestController: AbortController | undefined;
  private readonly fixtureTerminalStates = new Map<string, PointState>();

  constructor(private readonly input: RunnerInput) {
    this.summary = {
      runId: `run-${Date.now()}`,
      profile: input.profile ?? "Fast",
      seed: input.seed ?? 20260617,
      totalCases: input.cases.length,
      completedCases: 0,
      failures: 0,
      roundTrips: 0
    };
    this.fetchPair =
      input.fetchPair ??
      ((request, signal) =>
        Promise.all([
          fetchService("java", input.javaBaseUrl, request, { signal }),
          fetchService("typescript", input.typescriptBaseUrl, request, { signal })
        ]).then(([java, typescript]) => ({ java, typescript })));
    this.requestDelayMs = Math.max(0, input.requestDelayMs ?? 0);
    this.sleep = input.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  onEvent(listener: (event: RunnerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  setRequestDelay(requestDelayMs: number): void {
    this.requestDelayMs = Math.max(0, requestDelayMs);
  }

  stop(): void {
    this.stopped = true;
    this.currentRequestController?.abort();
  }

  async start(): Promise<RunSummary> {
    this.emitSummary();
    for (let index = 0; index < this.input.cases.length; index += 1) {
      const request = this.input.cases[index];
      if (this.stopped) break;
      while (this.paused && !this.stopped) await new Promise((resolve) => setTimeout(resolve, 100));
      if (this.stopped) break;
      if (request.fixtureId) this.emit({ type: "point-state", fixtureId: request.fixtureId, state: "active" });
      let java: ServiceResponse;
      let typescript: ServiceResponse;
      const requestController = new AbortController();
      this.currentRequestController = requestController;
      try {
        ({ java, typescript } = await this.fetchPair(request, requestController.signal));
      } catch (error) {
        if (this.stopped) break;
        this.summary.failures += 1;
        this.summary.completedCases += 1;
        const discrepancy = createInfrastructureDiscrepancy(request, error);
        this.emit({ type: "discrepancy", discrepancy });
        if (request.fixtureId) this.emitFixtureTerminalState(request.fixtureId, "blocked");
        this.emitSummary();
        await this.waitBetweenRequests(index);
        continue;
      } finally {
        if (this.currentRequestController === requestController) this.currentRequestController = undefined;
      }
      if (this.stopped) break;
      this.emit({ type: "current-case", request, java, typescript });
      const diffs = compareResponses(java, typescript, request.path, {
        format: request.format,
        expectation: request.expectation
      });
      if (diffs.length > 0) {
        this.summary.failures += 1;
        const discrepancy: Discrepancy = {
          id: `${request.id}:discrepancy`,
          caseId: request.id,
          fixtureId: request.fixtureId,
          endpoint: request.path,
          format: request.format,
          status: "discrepancy",
          summary: `${request.path} differs for ${request.format}`,
          diffs,
          java,
          typescript,
          replay: `${request.method} ${formatReplayPath(request)}`
        };
        this.emit({ type: "discrepancy", discrepancy });
        if (request.fixtureId) this.emitFixtureTerminalState(request.fixtureId, "failed");
      } else if (request.fixtureId) {
        this.emitFixtureTerminalState(request.fixtureId, "passed");
      }
      this.summary.completedCases += 1;
      this.emitSummary();
      await this.waitBetweenRequests(index);
    }
    this.emit({ type: "run-complete", summary: { ...this.summary } });
    return this.summary;
  }

  private emitSummary(): void {
    this.emit({ type: "run-summary", summary: { ...this.summary } });
  }

  private emit(event: RunnerEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  private emitFixtureTerminalState(fixtureId: string, nextState: PointState): void {
    const state = dominantPointState(this.fixtureTerminalStates.get(fixtureId), nextState);
    this.fixtureTerminalStates.set(fixtureId, state);
    this.emit({ type: "point-state", fixtureId, state });
  }

  private async waitBetweenRequests(index: number): Promise<void> {
    if (this.requestDelayMs <= 0 || this.stopped || index >= this.input.cases.length - 1) return;
    await this.sleep(this.requestDelayMs);
  }
}

function dominantPointState(current: PointState | undefined, next: PointState): PointState {
  if (current === "failed" || next === "failed") return "failed";
  if (current === "blocked" || next === "blocked") return "blocked";
  return next;
}

function formatReplayPath(request: RequestCase): string {
  const params = new URLSearchParams(request.query ?? {});
  const query = params.toString();
  return query.length > 0 ? `${request.path}?${query}` : request.path;
}

function createInfrastructureDiscrepancy(request: RequestCase, error: unknown): Discrepancy {
  const message = error instanceof Error ? error.message : "Request failed";
  const failedResponse = (service: "java" | "typescript"): ServiceResponse => ({
    service,
    status: 0,
    contentType: "",
    body: message,
    canonical: null
  });

  return {
    id: `${request.id}:infrastructure-error`,
    caseId: request.id,
    fixtureId: request.fixtureId,
    endpoint: request.path,
    format: request.format,
    status: "infrastructure-error",
    summary: `Request failed before both services returned: ${message}`,
    diffs: [
      {
        path: "$.infrastructure",
        expected: "Java and TypeScript responses",
        actual: message,
        message: "Expected both services to return comparable responses"
      }
    ],
    java: failedResponse("java"),
    typescript: failedResponse("typescript"),
    replay: `${request.method} ${formatReplayPath(request)}`
  };
}
