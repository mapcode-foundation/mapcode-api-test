import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderReport, writeReports } from "../src/coordinator/reporter";
import type { Discrepancy, RunSummary, ServiceKind } from "../src/shared/types";

const summary: RunSummary = {
  runId: "run-test",
  profile: "Fast",
  seed: 20260617,
  totalCases: 1,
  completedCases: 1,
  failures: 1,
  roundTrips: 0,
  currentRequestsPerSecond: 0,
  averageRequestsPerSecond: 0
};

const discrepancy: Discrepancy = {
  id: "d1",
  caseId: "c1",
  endpoint: "/mapcode/codes/52,5",
  format: "json",
  status: "discrepancy",
  summary: "payload differs",
  diffs: [
    {
      path: "$.mapcodes[0].territory",
      expected: "NLD",
      actual: "AAA",
      message: "Expected Production value to match Candidate value"
    }
  ],
  production: {
    service: "production",
    status: 200,
    contentType: "application/json",
    body: "secret TOMTOM_API_KEY=abc",
    canonical: { territory: "NLD", TOMTOM_API_KEY: "json-secret-value" }
  },
  candidate: {
    service: "candidate",
    status: 200,
    contentType: "application/json",
    body: '{"TOMTOM_API_KEY":"body-secret-value","territory":"AAA"}',
    canonical: { territory: "AAA" }
  },
  logExcerpt: ['startup {"TOMTOM_API_KEY":"log-secret-value"}', 'env TOMTOM_API_KEY="quoted-env-secret"'],
  replay: "GET /mapcode/codes/52,5"
};

const services: Record<
  ServiceKind,
  {
    label: string;
    mode: "manual" | "auto";
    baseUrl: string;
    sourcePath: string;
    version?: string;
  }
> = {
  production: {
    label: "Production API",
    mode: "auto",
    baseUrl: "https://mapcode-rest-service.example/mapcode-rest-service",
    sourcePath: "../mapcode-rest-service",
    version: "2.4.19.3"
  },
  candidate: {
    label: "Candidate API",
    mode: "manual",
    baseUrl: "https://api.mapcode.com",
    sourcePath: "../mapcode-rest-service-ts",
    version: "2.5.1"
  }
};

describe("writeReports", () => {
  it("writes AI-ready markdown and JSON reports with secrets redacted", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mapcode-report-"));
    const result = await writeReports({
      outputDir: dir,
      summary,
      discrepancies: [discrepancy],
      serviceVersions: { production: "2", candidate: "1" },
      services
    });
    const md = await readFile(result.markdownPath, "utf8");
    const json = await readFile(result.jsonPath, "utf8");
    const parsed = JSON.parse(json);

    expect(md).toContain("payload differs");
    expect(json).toContain("$.mapcodes[0].territory");
    expect(md).not.toContain("abc");
    expect(json).not.toContain("abc");
    expect(json).not.toContain("json-secret-value");
    expect(json).not.toContain("body-secret-value");
    expect(json).not.toContain("log-secret-value");
    expect(json).not.toContain("quoted-env-secret");
    expect(parsed.discrepancies[0].production.canonical.TOMTOM_API_KEY).toBe("[REDACTED]");
    expect(parsed.discrepancies[0].production.canonical.territory).toBe("NLD");
    expect(parsed.discrepancies[0].candidate.body).toContain('"TOMTOM_API_KEY":"[REDACTED]"');
  });

  it("includes the service URLs, source trees, and versions in generated reports", () => {
    const result = renderReport({
      outputDir: "/path/that/does/not/matter",
      summary,
      discrepancies: [],
      serviceVersions: { production: "2.4.19.3", candidate: "2.5.1" },
      services
    });

    expect(result.markdown).toContain("## Services");
    expect(result.markdown).toContain("### Production API");
    expect(result.markdown).toContain("- Base URL: `https://mapcode-rest-service.example/mapcode-rest-service`");
    expect(result.markdown).toContain("- Source tree: `../mapcode-rest-service`");
    expect(result.markdown).toContain("- Version: `2.4.19.3`");
    expect(result.markdown).toContain("### Candidate API");
    expect(result.markdown).toContain("- Base URL: `https://api.mapcode.com`");
    expect(result.markdown).toContain("- Source tree: `../mapcode-rest-service-ts`");
    expect(result.markdown).toContain("- Version: `2.5.1`");
    expect(result.json.services.production.baseUrl).toBe("https://mapcode-rest-service.example/mapcode-rest-service");
    expect(result.json.services.candidate.sourcePath).toBe("../mapcode-rest-service-ts");
  });

  it("can render a report preview even when files cannot be written", () => {
    const result = renderReport({
      outputDir: "/path/that/does/not/matter",
      summary,
      discrepancies: [discrepancy],
      serviceVersions: { production: "2", candidate: "1" },
      services
    });

    expect(result.markdown).toContain("payload differs");
    expect(result.html).toContain("Mapcode API Parity Report run-test");
    expect(result.markdown).not.toContain("json-secret-value");
  });

  it("numbers discrepancies in the rendered report so they can be referenced", () => {
    const secondDiscrepancy: Discrepancy = {
      ...discrepancy,
      id: "d2",
      caseId: "c2",
      endpoint: "/mapcode/codes/40,-74"
    };
    const result = renderReport({
      outputDir: "/path/that/does/not/matter",
      summary,
      discrepancies: [discrepancy, secondDiscrepancy],
      serviceVersions: { production: "2", candidate: "1" },
      services
    });

    expect(result.markdown).toContain("### Discrepancy 1: d1");
    expect(result.markdown).toContain("### Discrepancy 2: d2");
    expect(result.html).toContain("<h3>Discrepancy 1: d1</h3>");
    expect(result.html).toContain("<h3>Discrepancy 2: d2</h3>");
  });
});
