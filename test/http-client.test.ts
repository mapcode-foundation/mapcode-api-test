import { fetchService } from "../src/coordinator/http-client";
import { startMockService } from "./fixtures/mock-service";

describe("fetchService", () => {
  it("sets Accept for JSON and canonicalizes the response", async () => {
    const service = await startMockService({ "/mapcode/version": { status: 200, body: '{"version":"1"}' } });

    try {
      const response = await fetchService("java", service.baseUrl, {
        id: "version",
        method: "GET",
        path: "/mapcode/version",
        format: "json",
        expectation: "version-shape"
      });

      expect(response.status).toBe(200);
      expect(response.canonical).toEqual({ version: "1" });
    } finally {
      await service.close();
    }
  });
});
