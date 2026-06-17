import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeReports } from "../src/coordinator/reporter";
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
    canonical: { territory: "NLD" }
  },
  typescript: {
    service: "typescript",
    status: 200,
    contentType: "application/json",
    body: "secret TOMTOM_API_KEY=abc",
    canonical: { territory: "AAA" }
  },
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

    expect(md).toContain("payload differs");
    expect(json).toContain("$.mapcodes[0].territory");
    expect(md).not.toContain("abc");
    expect(json).not.toContain("abc");
  });
});
