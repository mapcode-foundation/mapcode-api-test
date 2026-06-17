import { distanceMeters, type LatLon } from "../shared/distance";
import type { CanonicalValue, SemanticDiff, ServiceResponse } from "../shared/types";

export function compareResponses(java: ServiceResponse, typescript: ServiceResponse, path: string): SemanticDiff[] {
  const diffs: SemanticDiff[] = [];

  if (java.status !== typescript.status) {
    diffs.push({
      path: "$.status",
      expected: java.status,
      actual: typescript.status,
      message: "Expected HTTP status codes to match"
    });
  }

  if (path === "/mapcode/version") {
    return diffs.concat(compareVersionShape(java.canonical, typescript.canonical));
  }

  return diffs.concat(compareCanonical(java.canonical ?? null, typescript.canonical ?? null));
}

export function compareCanonical(expected: CanonicalValue | undefined, actual: CanonicalValue | undefined, path = "$"): SemanticDiff[] {
  if (JSON.stringify(expected) === JSON.stringify(actual)) return [];

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

function isRecord(value: unknown): value is Record<string, CanonicalValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
