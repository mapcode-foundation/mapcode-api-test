import { createServerApp } from "../src/coordinator/server";
import { inject } from "./fixtures/inject";

describe("TomTom key config", () => {
  it("accepts a key without returning it", async () => {
    const app = createServerApp({ env: {} });
    const response = await inject(app, "/api/config/tomtom-key", { method: "POST", body: { key: "secret-key" } });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('{"hasTomTomApiKey":true}');
  });
});
