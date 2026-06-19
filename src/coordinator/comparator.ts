import { distanceMeters, type LatLon } from "../shared/distance";
import type { ApiFormat, CanonicalValue, RequestCase, SemanticDiff, ServiceResponse } from "../shared/types";

const coordinateToleranceDegrees = 0.00001;

export function compareResponses(
  production: ServiceResponse,
  candidate: ServiceResponse,
  path: string,
  options: { format?: ApiFormat; expectation?: RequestCase["expectation"] } = {}
): SemanticDiff[] {
  const diffs: SemanticDiff[] = [];

  if (production.status !== candidate.status) {
    diffs.push({
      path: "$.status",
      expected: production.status,
      actual: candidate.status,
      message: "Expected HTTP status codes to match"
    });
  }

  if (options.format && !isStatusEndpoint(path)) {
    diffs.push(...compareContentTypes(production, candidate, options.format));
  }

  if (options.expectation === "version-shape" || isVersionEndpoint(path)) {
    return diffs.concat(compareVersionShape(production.canonical, candidate.canonical));
  }

  return diffs.concat(
    compareCanonical(production.canonical ?? null, candidate.canonical ?? null, "$", {
      coordinateToleranceDegrees
    })
  );
}

export function compareCanonical(
  expected: CanonicalValue | undefined,
  actual: CanonicalValue | undefined,
  path = "$",
  options: { coordinateToleranceDegrees?: number } = {}
): SemanticDiff[] {
  if (JSON.stringify(expected) === JSON.stringify(actual)) return [];
  if (isCoordinatePath(path) && typeof expected === "number" && typeof actual === "number") {
    const tolerance = options.coordinateToleranceDegrees;
    if (tolerance !== undefined && Math.abs(expected - actual) <= tolerance + 1e-12) return [];
  }
  if (isVolatilePresenceOnlyPath(path)) {
    if (expected !== null && expected !== undefined && actual !== null && actual !== undefined) return [];
    if (expected !== null && expected !== undefined) {
      return [
        {
          path,
          expected,
          actual,
          message: "Expected Candidate to emit a non-null value when Production emits this field"
        }
      ];
    }
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    const diffs: SemanticDiff[] = [];
    const max = Math.max(expected.length, actual.length);
    for (let i = 0; i < max; i += 1) {
      diffs.push(...compareCanonical(expected[i], actual[i], `${path}[${i}]`, options));
    }
    return diffs;
  }

  if (isRecord(expected) && isRecord(actual)) {
    const diffs: SemanticDiff[] = [];
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
    for (const key of keys) {
      diffs.push(...compareCanonical(expected[key], actual[key], `${path}.${key}`, options));
    }
    return diffs;
  }

  return [{ path, expected, actual, message: "Expected Production value to match Candidate value" }];
}

export function roundTripWithinTolerance(original: LatLon, productionDecoded: LatLon, candidateDecoded: LatLon, toleranceMeters: number) {
  const productionDrift = distanceMeters(original, productionDecoded);
  const candidateDrift = distanceMeters(original, candidateDecoded);
  const serviceDrift = distanceMeters(productionDecoded, candidateDecoded);

  return {
    ok: productionDrift <= toleranceMeters && candidateDrift <= toleranceMeters && serviceDrift <= toleranceMeters,
    productionDrift,
    candidateDrift,
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

function compareContentTypes(production: ServiceResponse, candidate: ServiceResponse, format: ApiFormat): SemanticDiff[] {
  const diffs: SemanticDiff[] = [];
  if (!contentTypeMatches(production.contentType, format)) {
    diffs.push({
      path: "$.production.contentType",
      expected: expectedContentType(format),
      actual: production.contentType,
      message: "Expected Production response content type to match requested format"
    });
  }
  if (!contentTypeMatches(candidate.contentType, format)) {
    diffs.push({
      path: "$.candidate.contentType",
      expected: expectedContentType(format),
      actual: candidate.contentType,
      message: "Expected Candidate response content type to match requested format"
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

function isCoordinatePath(path: string): boolean {
  return path.endsWith(".latDeg") || path.endsWith(".lonDeg") || path.endsWith(".lat") || path.endsWith(".lon");
}

function isRecord(value: unknown): value is Record<string, CanonicalValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
