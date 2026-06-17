export type ApiFormat = "json" | "xml";
export type HttpMethod = "GET";
export type RunProfileName = "Fast" | "Deep" | "Custom";
export type PointState = "queued" | "active" | "passed" | "failed" | "blocked";
export type ServiceKind = "java" | "typescript";

export interface FixturePoint {
  id: string;
  category: "capital" | "near-capital" | "country" | "ocean" | "pole" | "contract";
  label: string;
  lat: number;
  lon: number;
  territory?: string;
  source: string;
}

export interface RequestCase {
  id: string;
  fixtureId?: string;
  method: HttpMethod;
  path: string;
  query?: Record<string, string>;
  format: ApiFormat;
  expectation: "parity" | "version-shape" | "roundtrip" | "contract-error";
}

export interface ServiceResponse {
  service: ServiceKind;
  status: number;
  contentType: string;
  body: string;
  canonical?: CanonicalValue;
}

export type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

export interface SemanticDiff {
  path: string;
  expected: CanonicalValue | undefined;
  actual: CanonicalValue | undefined;
  message: string;
}

export interface Discrepancy {
  id: string;
  caseId: string;
  fixtureId?: string;
  endpoint: string;
  format: ApiFormat;
  status: "discrepancy" | "oracle-error" | "infrastructure-error";
  summary: string;
  diffs: SemanticDiff[];
  java: ServiceResponse;
  typescript: ServiceResponse;
  replay: string;
  logExcerpt?: string[];
}

export interface RunSummary {
  runId: string;
  profile: RunProfileName;
  seed: number;
  totalCases: number;
  completedCases: number;
  failures: number;
  roundTrips: number;
  maxDriftMeters: number;
}

export type RunnerEvent =
  | { type: "run-summary"; summary: RunSummary }
  | { type: "point-state"; fixtureId: string; state: PointState }
  | { type: "current-case"; java?: ServiceResponse; typescript?: ServiceResponse; request: RequestCase }
  | { type: "discrepancy"; discrepancy: Discrepancy }
  | { type: "service-log"; service: ServiceKind; line: string }
  | { type: "run-complete"; summary: RunSummary };
