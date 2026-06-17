import { createServerApp } from "../src/coordinator/server";
import { inject } from "./fixtures/inject";

describe("coordinator server", () => {
  it("returns config with TomTom key presence only", async () => {
    const app = createServerApp({ env: { TOMTOM_API_KEY: "secret-value" } });
    const response = await inject(app, "/api/config");
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ hasTomTomApiKey: true });
    expect(response.body).not.toContain("secret-value");
  });

  it("returns the pinned fixture set", async () => {
    const app = createServerApp({ env: {} });
    const response = await inject(app, "/api/fixtures");
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).seed).toBe(20260617);
  });

  it("returns expanded cases from the pinned fixture set", async () => {
    const app = createServerApp({ env: { TOMTOM_API_KEY: "secret-value" } });
    const response = await inject(app, "/api/cases?profile=Deep");
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain("secret-value");
    const cases = JSON.parse(response.body);
    expect(cases.map((item: { id: string }) => item.id)).toContain("version-json");
    expect(cases.some((item: { fixtureId?: string }) => item.fixtureId === "capital-nld-amsterdam")).toBe(true);
  });
});
