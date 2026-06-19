import { compareCanonical, compareResponses, roundTripWithinTolerance } from "../src/coordinator/comparator";
import type { ServiceResponse } from "../src/shared/types";

function response(service: "production" | "candidate", canonical: unknown, status = 200, contentType = "application/json"): ServiceResponse {
  return {
    service,
    status,
    contentType,
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
        message: "Expected Production value to match Candidate value"
      }
    ]);
  });

  it("allows top-level time and reference values to differ when both services emit values", () => {
    expect(
      compareCanonical(
        { time: "2026-06-18T10:00:00Z", reference: "production-run-1" },
        { time: "2026-06-18T10:00:01Z", reference: "candidate-run-2" }
      )
    ).toEqual([]);
  });

  it("requires Candidate to emit a real top-level time or reference when Production does", () => {
    expect(compareCanonical({ time: "2026-06-18T10:00:00Z", reference: "production-run-1" }, { time: null })).toEqual([
      {
        path: "$.reference",
        expected: "production-run-1",
        actual: undefined,
        message: "Expected Candidate to emit a non-null value when Production emits this field"
      },
      {
        path: "$.time",
        expected: "2026-06-18T10:00:00Z",
        actual: null,
        message: "Expected Candidate to emit a non-null value when Production emits this field"
      }
    ]);
  });
});

describe("compareResponses", () => {
  it("allows /mapcode/version value differences but still requires object shape", () => {
    const diffs = compareResponses(
      response("production", { version: "2.4.19.2" }),
      response("candidate", { version: "0.1.0" }),
      "/mapcode/version"
    );

    expect(diffs).toEqual([]);
  });

  it("allows /mapcode/json/version and /mapcode/xml/version value differences", () => {
    expect(
      compareResponses(
        response("production", { version: "2.4.19.2" }, 200, "application/json"),
        response("candidate", { version: "0.1.0" }, 200, "application/json"),
        "/mapcode/json/version",
        { format: "json" }
      )
    ).toEqual([]);

    expect(
      compareResponses(
        response("production", { version: "2.4.19.2" }, 200, "application/xml"),
        response("candidate", { version: "0.1.0" }, 200, "application/xml"),
        "/mapcode/xml/version",
        { format: "xml" }
      )
    ).toEqual([]);
  });

  it("requires /mapcode/version responses to contain a version field", () => {
    const diffs = compareResponses(response("production", { version: "2.4.19.2" }), response("candidate", {}), "/mapcode/version");

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
    const diffs = compareResponses(response("production", {}, 403), response("candidate", {}, 404), "/mapcode/codes");

    expect(diffs[0].path).toBe("$.status");
  });

  it("validates content type when a request format is provided", () => {
    const diffs = compareResponses(
      response("production", {}, 200, "application/json"),
      response("candidate", {}, 200, "application/json"),
      "/mapcode/territories",
      { format: "xml" }
    );

    expect(diffs.map((diff) => diff.path)).toEqual(["$.production.contentType", "$.candidate.contentType"]);
  });

  it("does not require formatted content types for empty /mapcode/status health responses", () => {
    const diffs = compareResponses(
      response("production", null, 200, ""),
      response("candidate", null, 200, "text/plain; charset=utf-8"),
      "/mapcode/status",
      { format: "json" }
    );

    expect(diffs).toEqual([]);
  });

  it("allows small lat/lon drift for roundtrip coordinate responses", () => {
    const diffs = compareResponses(
      response("production", { latDeg: 52.376514, lonDeg: 4.908543 }),
      response("candidate", { latDeg: 52.376524, lonDeg: 4.908533 }),
      "/mapcode/coords/ABC.123",
      { format: "json", expectation: "roundtrip" }
    );

    expect(diffs).toEqual([]);
  });

  it("accepts coordinate differences up to 0.00001 degrees in encoded-decoded coordinate responses", () => {
    const diffs = compareResponses(
      response("production", { lat: 52.376514, lon: 4.908543 }),
      response("candidate", { lat: 52.376524, lon: 4.908533 }),
      "/mapcode/coords/ABC.123",
      { format: "json", expectation: "parity" }
    );

    expect(diffs).toEqual([]);
  });

  it("reports coordinate differences larger than 0.00001 degrees", () => {
    const diffs = compareResponses(
      response("production", { latDeg: 52.376514, lonDeg: 4.908543 }),
      response("candidate", { latDeg: 52.376526, lonDeg: 4.908543 }),
      "/mapcode/coords/ABC.123",
      { format: "json", expectation: "parity" }
    );

    expect(diffs.map((diff) => diff.path)).toEqual(["$.latDeg"]);
  });
});

describe("roundTripWithinTolerance", () => {
  it("passes when original-to-service and service-to-service distances are within tolerance", () => {
    expect(roundTripWithinTolerance({ lat: 52, lon: 5 }, { lat: 52.00001, lon: 5 }, { lat: 52.00002, lon: 5 }, 10).ok).toBe(
      true
    );
  });

  it("fails when Production and Candidate decoded points drift apart beyond tolerance", () => {
    expect(roundTripWithinTolerance({ lat: 0, lon: 0 }, { lat: 0.00001, lon: 0 }, { lat: 0, lon: 0.01 }, 10).ok).toBe(false);
  });
});
