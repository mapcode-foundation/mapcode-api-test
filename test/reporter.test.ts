import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderReport, writeReports } from "../src/coordinator/reporter";
import type { Discrepancy, RunSummary } from "../src/shared/types";

const summary: RunSummary = {
  runId: "run-test",
  profile: "Fast",
  seed: 20260617,
  totalCases: 1,
  completedCases: 1,
  failures: 1,
  roundTrips: 0,
  maxDriftMeters: 0
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
      message: "Expected Java value to match TypeScript value"
    }
  ],
  java: {
    service: "java",
    status: 200,
    contentType: "application/json",
    body: "secret TOMTOM_API_KEY=abc",
    canonical: { territory: "NLD", TOMTOM_API_KEY: "json-secret-value" }
  },
  typescript: {
    service: "typescript",
    status: 200,
    contentType: "application/json",
    body: '{"TOMTOM_API_KEY":"body-secret-value","territory":"AAA"}',
    canonical: { territory: "AAA" }
  },
  logExcerpt: ['startup {"TOMTOM_API_KEY":"log-secret-value"}', 'env TOMTOM_API_KEY="quoted-env-secret"'],
  replay: "GET /mapcode/codes/52,5"
};

describe("writeReports", () => {
  it("writes AI-ready markdown and JSON reports with secrets redacted", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mapcode-report-"));
    const result = await writeReports({
      outputDir: dir,
      summary,
      discrepancies: [discrepancy],
      serviceVersions: { java: "2", typescript: "1" }
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
    expect(parsed.discrepancies[0].java.canonical.TOMTOM_API_KEY).toBe("[REDACTED]");
    expect(parsed.discrepancies[0].java.canonical.territory).toBe("NLD");
    expect(parsed.discrepancies[0].typescript.body).toContain('"TOMTOM_API_KEY":"[REDACTED]"');
  });

  it("can render a report preview even when files cannot be written", () => {
    const result = renderReport({
      outputDir: "/path/that/does/not/matter",
      summary,
      discrepancies: [discrepancy],
      serviceVersions: { java: "2", typescript: "1" }
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
      serviceVersions: { java: "2", typescript: "1" }
    });

    expect(result.markdown).toContain("### Discrepancy 1: d1");
    expect(result.markdown).toContain("### Discrepancy 2: d2");
    expect(result.html).toContain("<h3>Discrepancy 1: d1</h3>");
    expect(result.html).toContain("<h3>Discrepancy 2: d2</h3>");
  });
});
