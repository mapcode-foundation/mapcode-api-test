import { createAttachedServiceManager } from "../src/coordinator/service-manager";
import { startMockService } from "./fixtures/mock-service";

describe("service-manager", () => {
  it("validates attached services by calling the /mapcode/status endpoint", async () => {
    const productionService = await startMockService({ "/mapcode/status": { status: 200, body: "ok" } });
    const candidateService = await startMockService({
      "/mapcode/status": { status: 200, body: "ok" }
    });

    try {
      const manager = createAttachedServiceManager({
        productionBaseUrl: productionService.baseUrl,
        candidateBaseUrl: candidateService.baseUrl
      });

      await expect(manager.waitUntilReady()).resolves.toEqual({ productionReady: true, candidateReady: true });
      expect(productionService.requests.map((request) => request.path)).toEqual(["/mapcode/status"]);
      expect(candidateService.requests.map((request) => request.path)).toEqual(["/mapcode/status"]);
    } finally {
      await Promise.all([productionService.close(), candidateService.close()]);
    }
  });

  it("honors path-prefixed service base URLs when checking readiness", async () => {
    const productionService = await startMockService({ "/java/mapcode/status": { status: 200, body: "ok" } });
    const candidateService = await startMockService({
      "/mapcode-rest-service-ts/mapcode/status": { status: 200, body: "ok" }
    });

    try {
      const manager = createAttachedServiceManager({
        productionBaseUrl: `${productionService.baseUrl}/java`,
        candidateBaseUrl: `${candidateService.baseUrl}/mapcode-rest-service-ts`
      });

      await expect(manager.waitUntilReady()).resolves.toEqual({ productionReady: true, candidateReady: true });
      expect(productionService.requests.map((request) => request.path)).toEqual(["/java/mapcode/status"]);
      expect(candidateService.requests.map((request) => request.path)).toEqual([
        "/mapcode-rest-service-ts/mapcode/status"
      ]);
    } finally {
      await Promise.all([productionService.close(), candidateService.close()]);
    }
  });
});
