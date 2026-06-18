import { createAttachedServiceManager } from "../src/coordinator/service-manager";
import { startMockService } from "./fixtures/mock-service";

describe("service-manager", () => {
  it("validates attached services by calling the /mapcode help endpoint", async () => {
    const helpBody = "<html><pre>MAPCODE API (test)</pre></html>";
    const javaService = await startMockService({ "/mapcode": { status: 200, body: helpBody, contentType: "text/html" } });
    const typescriptService = await startMockService({
      "/mapcode": { status: 200, body: helpBody, contentType: "text/html" }
    });

    try {
      const manager = createAttachedServiceManager({
        javaBaseUrl: javaService.baseUrl,
        typescriptBaseUrl: typescriptService.baseUrl
      });

      await expect(manager.waitUntilReady()).resolves.toEqual({ javaReady: true, typescriptReady: true });
      expect(javaService.requests.map((request) => request.path)).toEqual(["/mapcode"]);
      expect(typescriptService.requests.map((request) => request.path)).toEqual(["/mapcode"]);
    } finally {
      await Promise.all([javaService.close(), typescriptService.close()]);
    }
  });
});
