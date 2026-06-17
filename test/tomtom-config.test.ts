import { createServerApp } from "../src/coordinator/server";
import { inject } from "./fixtures/inject";

describe("TomTom key config", () => {
  it("accepts a key without returning it", async () => {
    const app = createServerApp({ env: {} });
    const response = await inject(app, "/api/config/tomtom-key", { method: "POST", body: { key: "secret-key" } });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('{"hasTomTomApiKey":true}');
  });

  it("rejects short keys", async () => {
    const app = createServerApp({ env: {} });
    const response = await inject(app, "/api/config/tomtom-key", { method: "POST", body: { key: "tiny" } });
    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain("tiny");
  });

  it("keeps runtime keys isolated per server app instance", async () => {
    const appWithRuntimeKey = createServerApp({ env: {} });
    await inject(appWithRuntimeKey, "/api/config/tomtom-key", { method: "POST", body: { key: "secret-key" } });

    const freshApp = createServerApp({ env: {} });
    const response = await inject(freshApp, "/api/config");

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('{"hasTomTomApiKey":false}');
  });
});
