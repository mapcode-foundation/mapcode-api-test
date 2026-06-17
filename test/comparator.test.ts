import { compareCanonical, compareResponses, roundTripWithinTolerance } from "../src/coordinator/comparator";
import type { ServiceResponse } from "../src/shared/types";

function response(service: "java" | "typescript", canonical: unknown, status = 200): ServiceResponse {
  return {
    service,
    status,
    contentType: "application/json",
    body: JSON.stringify(canonical),
    canonical: canonical as never
  };
}

describe("compareCanonical", () => {
  it("returns no diffs for equal semantic payloads", () => {
    expect(compareCanonical({ a: [{ b: 1 }] }, { a: [{ b: 1 }] })).toEqual([]);
  });

  it("reports path-level value differences", () => {
    expect(compareCanonical({ mapcodes: [{ territory: "NLD" }] }, { mapcodes: [{ territory: "AAA" }] })).toEqual([
      {
        path: "$.mapcodes[0].territory",
        expected: "NLD",
        actual: "AAA",
        message: "Expected Java value to match TypeScript value"
      }
    ]);
  });
});

describe("compareResponses", () => {
  it("allows /mapcode/version value differences but still requires object shape", () => {
    const diffs = compareResponses(
      response("java", { version: "2.4.19.2" }),
      response("typescript", { version: "0.1.0" }),
      "/mapcode/version"
    );

    expect(diffs).toEqual([]);
  });

  it("requires /mapcode/version responses to contain a version field", () => {
    const diffs = compareResponses(response("java", { version: "2.4.19.2" }), response("typescript", {}), "/mapcode/version");

    expect(diffs).toEqual([
      {
        path: "$.version",
        expected: { version: "2.4.19.2" },
        actual: {},
        message: "Expected both version responses to contain a version field"
      }
    ]);
  });

  it("requires matching status codes", () => {
    const diffs = compareResponses(response("java", {}, 403), response("typescript", {}, 404), "/mapcode/codes");

    expect(diffs[0].path).toBe("$.status");
  });
});

describe("roundTripWithinTolerance", () => {
  it("passes when original-to-service and service-to-service distances are within tolerance", () => {
    expect(roundTripWithinTolerance({ lat: 52, lon: 5 }, { lat: 52.00001, lon: 5 }, { lat: 52.00002, lon: 5 }, 10).ok).toBe(
      true
    );
  });

  it("fails when Java and TypeScript decoded points drift apart beyond tolerance", () => {
    expect(roundTripWithinTolerance({ lat: 0, lon: 0 }, { lat: 0.00001, lon: 0 }, { lat: 0, lon: 0.01 }, 10).ok).toBe(false);
  });
});
