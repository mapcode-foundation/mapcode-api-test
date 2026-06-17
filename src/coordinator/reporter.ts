import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Discrepancy, RunSummary, ServiceResponse } from "../shared/types";

export interface ReportInput {
  outputDir: string;
  summary: RunSummary;
  discrepancies: Discrepancy[];
  serviceVersions: { java?: string; typescript?: string };
}

export async function writeReports(input: ReportInput): Promise<{ markdownPath: string; jsonPath: string }> {
  await mkdir(input.outputDir, { recursive: true });

  const fileStem = safeFileStem(input.summary.runId);
  const markdownPath = join(input.outputDir, `${fileStem}.md`);
  const jsonPath = join(input.outputDir, `${fileStem}.json`);
  const redacted = redact(input);

  await writeFile(markdownPath, renderMarkdown(redacted), "utf8");
  await writeFile(jsonPath, JSON.stringify(redacted, null, 2), "utf8");

  return { markdownPath, jsonPath };
}

function renderMarkdown(input: ReportInput): string {
  const lines = [
    `# Mapcode API Parity Report ${input.summary.runId}`,
    "",
    `Profile: ${input.summary.profile}`,
    `Seed: ${input.summary.seed}`,
    `Cases: ${input.summary.completedCases}/${input.summary.totalCases}`,
    `Failures: ${input.summary.failures}`,
    `Round trips: ${input.summary.roundTrips}`,
    `Max drift meters: ${input.summary.maxDriftMeters}`,
    `Java version: ${input.serviceVersions.java ?? "unknown"}`,
    `TypeScript version: ${input.serviceVersions.typescript ?? "unknown"}`,
    "",
    "## Discrepancies",
    ""
  ];

  if (input.discrepancies.length === 0) {
    lines.push("No discrepancies recorded.", "");
    return lines.join("\n");
  }

  for (const item of input.discrepancies) {
    lines.push(`### ${item.id}`);
    lines.push("");
    lines.push(`- Case: \`${item.caseId}\``);
    if (item.fixtureId) lines.push(`- Fixture: \`${item.fixtureId}\``);
    lines.push(`- Endpoint: \`${item.endpoint}\``);
    lines.push(`- Format: \`${item.format}\``);
    lines.push(`- Status: \`${item.status}\``);
    lines.push(`- Summary: ${item.summary}`);
    lines.push(`- Replay: \`${item.replay}\``);
    lines.push("");
    lines.push("Diffs:");
    for (const diff of item.diffs) {
      lines.push(`- ${diff.path}: expected \`${formatInline(diff.expected)}\`, actual \`${formatInline(diff.actual)}\` - ${diff.message}`);
    }
    lines.push("");
    lines.push("Java evidence:");
    lines.push(...renderEvidence(item.java));
    lines.push("");
    lines.push("TypeScript evidence:");
    lines.push(...renderEvidence(item.typescript));
    if (item.logExcerpt?.length) {
      lines.push("");
      lines.push("Log excerpt:");
      for (const line of item.logExcerpt) lines.push(`- ${line}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function renderEvidence(response: ServiceResponse): string[] {
  return [
    `- Status: ${response.status}`,
    `- Content type: \`${response.contentType}\``,
    "- Canonical:",
    ...codeBlock(formatJson(response.canonical)),
    "- Body:",
    ...codeBlock(response.body)
  ];
}

function codeBlock(value: string): string[] {
  return ["```", value.replace(/```/g, "``\\`"), "```"];
}

function formatInline(value: unknown): string {
  return formatJson(value).replace(/\n/g, " ");
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? "undefined";
}

function redact(input: ReportInput): ReportInput {
  return redactValue(input) as ReportInput;
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redactSecrets(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      out[key] = isSecretKey(key) ? "[REDACTED]" : redactValue(child);
    }
    return out;
  }
  return value;
}

function redactSecrets(value: string): string {
  return value
    .replace(/TOMTOM_API_KEY\s*[:=]\s*[^"'\\\s,}]+/gi, "TOMTOM_API_KEY=[REDACTED]")
    .replace(/tomtom[^"'\\\s,}]{8,}/gi, "[REDACTED]");
}

function isSecretKey(key: string): boolean {
  return key.toUpperCase() === "TOMTOM_API_KEY";
}

function safeFileStem(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.*/, "") || "report";
}
