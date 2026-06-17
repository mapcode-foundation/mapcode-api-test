import { compareResponses } from "./comparator";
import { fetchService } from "./http-client";
import type { Discrepancy, RequestCase, RunnerEvent, RunSummary, ServiceResponse } from "../shared/types";

export interface RunnerInput {
  javaBaseUrl: string;
  typescriptBaseUrl: string;
  cases: RequestCase[];
  fetchPair?: (request: RequestCase) => Promise<{ java: ServiceResponse; typescript: ServiceResponse }>;
}

export class Runner {
  private listeners = new Set<(event: RunnerEvent) => void>();
  private paused = false;
  private stopped = false;
  private summary: RunSummary;
  private fetchPair: (request: RequestCase) => Promise<{ java: ServiceResponse; typescript: ServiceResponse }>;

  constructor(private readonly input: RunnerInput) {
    this.summary = {
      runId: `run-${Date.now()}`,
      profile: "Fast",
      seed: 20260617,
      totalCases: input.cases.length,
      completedCases: 0,
      failures: 0,
      roundTrips: 0,
      maxDriftMeters: 0
    };
    this.fetchPair =
      input.fetchPair ??
      ((request) =>
        Promise.all([
          fetchService("java", input.javaBaseUrl, request),
          fetchService("typescript", input.typescriptBaseUrl, request)
        ]).then(([java, typescript]) => ({ java, typescript })));
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

  stop(): void {
    this.stopped = true;
  }

  async start(): Promise<RunSummary> {
    this.emit({ type: "run-summary", summary: this.summary });
    for (const request of this.input.cases) {
      if (this.stopped) break;
      while (this.paused) await new Promise((resolve) => setTimeout(resolve, 100));
      if (request.fixtureId) this.emit({ type: "point-state", fixtureId: request.fixtureId, state: "active" });
      const { java, typescript } = await this.fetchPair(request);
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
          replay: `${request.method} ${request.path}`
        };
        this.emit({ type: "discrepancy", discrepancy });
        if (request.fixtureId) this.emit({ type: "point-state", fixtureId: request.fixtureId, state: "failed" });
      } else if (request.fixtureId) {
        this.emit({ type: "point-state", fixtureId: request.fixtureId, state: "passed" });
      }
      this.summary.completedCases += 1;
      this.emit({ type: "run-summary", summary: this.summary });
    }
    this.emit({ type: "run-complete", summary: this.summary });
    return this.summary;
  }

  private emit(event: RunnerEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
