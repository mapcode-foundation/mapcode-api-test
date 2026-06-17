import { createAttachedServiceManager } from "../src/coordinator/service-manager";
import { startMockService } from "./fixtures/mock-service";

describe("service-manager", () => {
  it("validates attached services by calling /mapcode/status", async () => {
    const service = await startMockService({ "/mapcode/status": { status: 200, body: "" } });

    try {
      const manager = createAttachedServiceManager({
        javaBaseUrl: service.baseUrl,
        typescriptBaseUrl: service.baseUrl
      });

      await expect(manager.waitUntilReady()).resolves.toEqual({ javaReady: true, typescriptReady: true });
    } finally {
      await service.close();
    }
  });
});
