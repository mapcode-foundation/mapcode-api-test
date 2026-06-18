import { distanceMeters, type LatLon } from "../shared/distance";
import type { ApiFormat, CanonicalValue, RequestCase, SemanticDiff, ServiceResponse } from "../shared/types";

export function compareResponses(
  java: ServiceResponse,
  typescript: ServiceResponse,
  path: string,
  options: { format?: ApiFormat; expectation?: RequestCase["expectation"] } = {}
): SemanticDiff[] {
  const diffs: SemanticDiff[] = [];

  if (java.status !== typescript.status) {
    diffs.push({
      path: "$.status",
      expected: java.status,
      actual: typescript.status,
      message: "Expected HTTP status codes to match"
    });
  }

  if (options.format && !isStatusEndpoint(path)) {
    diffs.push(...compareContentTypes(java, typescript, options.format));
  }

  if (options.expectation === "version-shape" || isVersionEndpoint(path)) {
    return diffs.concat(compareVersionShape(java.canonical, typescript.canonical));
  }

  return diffs.concat(compareCanonical(java.canonical ?? null, typescript.canonical ?? null));
}

export function compareCanonical(expected: CanonicalValue | undefined, actual: CanonicalValue | undefined, path = "$"): SemanticDiff[] {
  if (JSON.stringify(expected) === JSON.stringify(actual)) return [];
  if (isVolatilePresenceOnlyPath(path)) {
    if (expected !== null && expected !== undefined && actual !== null && actual !== undefined) return [];
    if (expected !== null && expected !== undefined) {
      return [
        {
          path,
          expected,
          actual,
          message: "Expected TypeScript to emit a non-null value when Java emits this field"
        }
      ];
    }
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    const diffs: SemanticDiff[] = [];
    const max = Math.max(expected.length, actual.length);
    for (let i = 0; i < max; i += 1) {
      diffs.push(...compareCanonical(expected[i], actual[i], `${path}[${i}]`));
    }
    return diffs;
  }

  if (isRecord(expected) && isRecord(actual)) {
    const diffs: SemanticDiff[] = [];
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
    for (const key of keys) {
      diffs.push(...compareCanonical(expected[key], actual[key], `${path}.${key}`));
    }
    return diffs;
  }

  return [{ path, expected, actual, message: "Expected Java value to match TypeScript value" }];
}

export function roundTripWithinTolerance(original: LatLon, javaDecoded: LatLon, tsDecoded: LatLon, toleranceMeters: number) {
  const javaDrift = distanceMeters(original, javaDecoded);
  const tsDrift = distanceMeters(original, tsDecoded);
  const serviceDrift = distanceMeters(javaDecoded, tsDecoded);

  return {
    ok: javaDrift <= toleranceMeters && tsDrift <= toleranceMeters && serviceDrift <= toleranceMeters,
    javaDrift,
    tsDrift,
    serviceDrift
  };
}

function compareVersionShape(expected: CanonicalValue | undefined, actual: CanonicalValue | undefined): SemanticDiff[] {
  if (isRecord(expected) && isRecord(actual) && "version" in expected && "version" in actual) return [];

  return [
    {
      path: "$.version",
      expected,
      actual,
      message: "Expected both version responses to contain a version field"
    }
  ];
}

function compareContentTypes(java: ServiceResponse, typescript: ServiceResponse, format: ApiFormat): SemanticDiff[] {
  const diffs: SemanticDiff[] = [];
  if (!contentTypeMatches(java.contentType, format)) {
    diffs.push({
      path: "$.java.contentType",
      expected: expectedContentType(format),
      actual: java.contentType,
      message: "Expected Java response content type to match requested format"
    });
  }
  if (!contentTypeMatches(typescript.contentType, format)) {
    diffs.push({
      path: "$.typescript.contentType",
      expected: expectedContentType(format),
      actual: typescript.contentType,
      message: "Expected TypeScript response content type to match requested format"
    });
  }
  return diffs;
}

function contentTypeMatches(contentType: string, format: ApiFormat): boolean {
  const normalized = contentType.toLowerCase();
  return format === "json"
    ? normalized.includes("application/json") || normalized.includes("+json")
    : normalized.includes("application/xml") || normalized.includes("text/xml") || normalized.includes("+xml");
}

function expectedContentType(format: ApiFormat): string {
  return format === "json" ? "application/json" : "application/xml";
}

function isVersionEndpoint(path: string): boolean {
  return path === "/mapcode/version" || path === "/mapcode/json/version" || path === "/mapcode/xml/version";
}

function isStatusEndpoint(path: string): boolean {
  return path === "/mapcode/status" || path === "/mapcode/json/status" || path === "/mapcode/xml/status";
}

function isVolatilePresenceOnlyPath(path: string): boolean {
  return path === "$.time" || path === "$.reference";
}

function isRecord(value: unknown): value is Record<string, CanonicalValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
