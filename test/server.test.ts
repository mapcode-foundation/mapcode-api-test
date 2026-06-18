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

  it("treats Custom as Fast because only Fast and Deep are supported profiles", async () => {
    const app = createServerApp({ env: {} });
    const customResponse = await inject(app, "/api/cases?profile=Custom");
    const fastResponse = await inject(app, "/api/cases?profile=Fast");

    expect(customResponse.statusCode).toBe(200);
    expect(JSON.parse(customResponse.body).map((item: { id: string }) => item.id)).toEqual(
      JSON.parse(fastResponse.body).map((item: { id: string }) => item.id)
    );
  });

  it("returns profile-specific fixtures", async () => {
    const app = createServerApp({ env: {} });
    const fastResponse = await inject(app, "/api/fixtures?profile=Fast");
    const deepResponse = await inject(app, "/api/fixtures?profile=Deep");

    expect(fastResponse.statusCode).toBe(200);
    expect(deepResponse.statusCode).toBe(200);
    expect(JSON.parse(fastResponse.body).points.length).toBeLessThan(JSON.parse(deepResponse.body).points.length);
  });

  it("reports service status without auto-starting services", async () => {
    const app = createServerApp({ env: {} });
    const response = await inject(app, "/api/services");

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      java: { label: "Java API (leading)", mode: "manual", baseUrl: "http://127.0.0.1:8081" },
      typescript: { label: "TypeScript API (ported)", mode: "manual", baseUrl: "http://127.0.0.1:8082" }
    });
  });

  it("blocks run start and names APIs that are unavailable", async () => {
    const app = createServerApp({ env: {} });
    const response = await inject(app, "/api/run/start", { method: "POST", body: { profile: "Fast" } });

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body)).toEqual({
      error: "APIs unavailable",
      unavailable: ["Java API (leading)", "TypeScript API (ported)"]
    });
  });
});
