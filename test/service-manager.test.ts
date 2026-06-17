import { createAttachedServiceManager } from "../src/coordinator/service-manager";
import { startMockService } from "./fixtures/mock-service";

describe("service-manager", () => {
  it("validates attached services by calling /mapcode/status", async () => {
    const javaService = await startMockService({ "/mapcode/status": { status: 200, body: "" } });
    const typescriptService = await startMockService({ "/mapcode/status": { status: 200, body: "" } });

    try {
      const manager = createAttachedServiceManager({
        javaBaseUrl: javaService.baseUrl,
        typescriptBaseUrl: typescriptService.baseUrl
      });

      await expect(manager.waitUntilReady()).resolves.toEqual({ javaReady: true, typescriptReady: true });
      expect(javaService.requests.map((request) => request.path)).toEqual(["/mapcode/status"]);
      expect(typescriptService.requests.map((request) => request.path)).toEqual(["/mapcode/status"]);
    } finally {
      await Promise.all([javaService.close(), typescriptService.close()]);
    }
  });
});
