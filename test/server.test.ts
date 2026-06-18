import { resolve } from "node:path";
import { buildServiceStartPlan, createServerApp, parseRequestDelayMs } from "../src/coordinator/server";
import { inject } from "./fixtures/inject";
import { startMockService } from "./fixtures/mock-service";

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
      java: {
        label: "Java API (leading)",
        mode: "manual",
        baseUrl: "http://127.0.0.1:8081",
        sourcePath: "../mapcode-rest-service"
      },
      typescript: {
        label: "TypeScript API (ported)",
        mode: "manual",
        baseUrl: "http://127.0.0.1:8082",
        sourcePath: "../mapcode-rest-service-ts"
      }
    });
  });

  it("stores a source repo path with service configuration before the API is running", async () => {
    const app = createServerApp({ env: {} });
    const response = await inject(app, "/api/services/typescript/config", {
      method: "POST",
      body: { baseUrl: "http://127.0.0.1:9082", sourcePath: "/tmp/mapcode-rest-service-ts" }
    });
    const services = await inject(app, "/api/services");

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(services.body).typescript).toMatchObject({
      baseUrl: "http://127.0.0.1:9082",
      sourcePath: "/tmp/mapcode-rest-service-ts",
      availability: "unavailable"
    });
  });

  it("checks service availability through /mapcode/status", async () => {
    const app = createServerApp({ env: {} });
    const service = await startMockService({ "/mapcode/status": { status: 200, body: "ok" } });

    try {
      const response = await inject(app, "/api/services/typescript/config", {
        method: "POST",
        body: { baseUrl: service.baseUrl, sourcePath: "/tmp/mapcode-rest-service-ts" }
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toMatchObject({ availability: "available" });
      expect(service.requests.map((request) => request.path)).toContain("/mapcode/status");
    } finally {
      await service.close();
    }
  });

  it("stops both managed APIs and reports them as unavailable", async () => {
    const app = createServerApp({ env: {} });
    const response = await inject(app, "/api/services/stop", { method: "POST" });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      java: {
        availability: "unavailable",
        logs: ["Stopped Java API (leading)"]
      },
      typescript: {
        availability: "unavailable",
        logs: ["Stopped TypeScript API (ported)"]
      }
    });
  });

  it("rejects automatic start when the source repo path does not exist", async () => {
    const app = createServerApp({ env: {} });
    const response = await inject(app, "/api/services/java/start", {
      method: "POST",
      body: { baseUrl: "http://127.0.0.1:9081", sourcePath: "/tmp/does-not-exist-mapcode-api-test" }
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body)).toMatchObject({
      error: "Source path unavailable",
      service: "Java API (leading)"
    });
  });

  it("builds the Java service by installing prod artifacts before running Jetty in deployment", () => {
    const plan = buildServiceStartPlan("java", "http://127.0.0.1:9081", "/tmp/mapcode-rest-service");

    expect(plan).toMatchObject([
      {
        command: "mvn",
        args: ["install", "-Pprod"],
        cwd: resolve("/tmp/mapcode-rest-service"),
        waitForExit: true
      },
      {
        command: "mvn",
        args: ["-Dmaven.httpserver.port=9081", "jetty:run"],
        cwd: resolve("/tmp/mapcode-rest-service/deployment"),
        waitForExit: false
      }
    ]);
  });

  it("blocks run start and names APIs that are unavailable", async () => {
    const app = createServerApp({ env: {} });
    await inject(app, "/api/services/java/config", {
      method: "POST",
      body: { baseUrl: "http://127.0.0.1:19081", sourcePath: "../mapcode-rest-service" }
    });
    await inject(app, "/api/services/typescript/config", {
      method: "POST",
      body: { baseUrl: "http://127.0.0.1:19082", sourcePath: "../mapcode-rest-service-ts" }
    });
    const response = await inject(app, "/api/run/start", { method: "POST", body: { profile: "Fast" } });

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body)).toEqual({
      error: "APIs unavailable",
      unavailable: ["Java API (leading)", "TypeScript API (ported)"]
    });
  });

  it("clamps request delay seconds from run start payload", async () => {
    expect(parseRequestDelayMs(undefined)).toBe(0);
    expect(parseRequestDelayMs(-1)).toBe(0);
    expect(parseRequestDelayMs(2.5)).toBe(2500);
    expect(parseRequestDelayMs(10)).toBe(5000);
  });
});
