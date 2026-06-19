import { fetchService } from "../src/coordinator/http-client";
import { startMockService } from "./fixtures/mock-service";

describe("fetchService", () => {
  it("sets Accept for JSON and canonicalizes the response", async () => {
    const service = await startMockService({ "/mapcode/version": { status: 200, body: '{"version":"1"}' } });

    try {
      const response = await fetchService("production", service.baseUrl, {
        id: "version",
        method: "GET",
        path: "/mapcode/version",
        format: "json",
        expectation: "version-shape"
      });

      expect(response.status).toBe(200);
      expect(response.canonical).toEqual({ version: "1" });
      expect(service.requests[0]?.headers.accept).toBe("application/json");
    } finally {
      await service.close();
    }
  });

  it("keeps a path-prefixed service base URL when sending requests", async () => {
    const service = await startMockService({
      "/mapcode-rest-service-ts/mapcode/version": { status: 200, body: '{"version":"2"}' }
    });

    try {
      const response = await fetchService("candidate", `${service.baseUrl}/mapcode-rest-service-ts`, {
        id: "version",
        method: "GET",
        path: "/mapcode/version",
        format: "json",
        expectation: "version-shape"
      });

      expect(response.status).toBe(200);
      expect(response.canonical).toEqual({ version: "2" });
      expect(service.requests.map((request) => request.path)).toEqual(["/mapcode-rest-service-ts/mapcode/version"]);
    } finally {
      await service.close();
    }
  });
});
