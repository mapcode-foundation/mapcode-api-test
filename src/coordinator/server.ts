import express, { type Response } from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { loadFixtureSet, expandFixtureCases } from "./fixture-store";
import { writeReports } from "./reporter";
import { Runner } from "./runner";
import type { Discrepancy, RunProfileName, RunnerEvent, RunSummary } from "../shared/types";

export interface ServerInput {
  env?: NodeJS.ProcessEnv;
}

type RunState = "idle" | "running" | "paused" | "stopped";

const defaultJavaBaseUrl = "http://127.0.0.1:8081";
const defaultTypeScriptBaseUrl = "http://127.0.0.1:8082";
const defaultSeed = 20260617;

export function createServerApp(input: ServerInput = {}) {
  loadEnv();
  const env = input.env ?? process.env;
  let runtimeTomTomApiKey: string | undefined;
  let activeRunner: Runner | undefined;
  let activeRunToken = 0;
  let runState: RunState = "idle";
  let lastSummary: RunSummary | undefined;
  let lastProfile: RunProfileName = "Fast";
  let lastSeed = defaultSeed;
  let discrepancies: Discrepancy[] = [];
  const sseClients = new Set<Response>();
  const app = express();
  app.use(express.json());
  const staticDir = resolve("dist/ui");
  if (existsSync(staticDir)) app.use(express.static(staticDir));

  function publish(event: unknown): void {
    for (const client of sseClients) client.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  function handleRunnerEvent(token: number, event: RunnerEvent): void {
    if (token !== activeRunToken) return;

    if (event.type === "run-summary" || event.type === "run-complete") {
      lastSummary = event.summary;
    }
    if (event.type === "discrepancy") {
      discrepancies.push(event.discrepancy);
    }
    if (event.type === "run-complete") {
      runState = "stopped";
      activeRunner = undefined;
    }

    publish(event);
  }

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.get("/api/events", (req, res) => {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive"
    });
    res.write(": connected\n\n");
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
  });
  app.get("/api/config", (_req, res) =>
    res.json({ hasTomTomApiKey: Boolean(env.TOMTOM_API_KEY || runtimeTomTomApiKey) })
  );
  app.post("/api/config/tomtom-key", (req, res) => {
    const key = typeof req.body?.key === "string" ? req.body.key.trim() : "";
    if (key.length < 8) return res.status(400).json({ error: "TomTom API key is too short" });
    runtimeTomTomApiKey = key;
    res.json({ hasTomTomApiKey: true });
  });
  app.get("/api/fixtures", async (_req, res, next) => {
    try {
      const fixtureSet = await loadFixtureSet("fixtures/fixture-set.json");
      res.json(fixtureSet);
    } catch (error) {
      next(error);
    }
  });
  app.get("/api/cases", async (req, res, next) => {
    try {
      const profile = req.query.profile === "Deep" || req.query.profile === "Custom" ? req.query.profile : "Fast";
      const fixtureSet = await loadFixtureSet("fixtures/fixture-set.json");
      res.json(expandFixtureCases(fixtureSet, profile));
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/run/start", async (req, res, next) => {
    try {
      activeRunner?.stop();
      activeRunToken += 1;

      const fixtureSet = await loadFixtureSet("fixtures/fixture-set.json");
      const profile = parseProfile(req.body?.profile);
      const cases = expandFixtureCases(fixtureSet, profile);
      const javaBaseUrl = readBodyString(req.body?.javaBaseUrl, defaultJavaBaseUrl);
      const typescriptBaseUrl = readBodyString(req.body?.typescriptBaseUrl, defaultTypeScriptBaseUrl);
      const token = activeRunToken;
      const runner = new Runner({
        javaBaseUrl,
        typescriptBaseUrl,
        profile,
        seed: fixtureSet.seed,
        cases
      });

      lastProfile = profile;
      lastSeed = fixtureSet.seed;
      lastSummary = undefined;
      discrepancies = [];
      runState = "running";
      activeRunner = runner;

      const unsubscribe = runner.onEvent((event) => handleRunnerEvent(token, event));
      void runner
        .start()
        .catch((error: unknown) => {
          if (token !== activeRunToken) return;
          runState = "stopped";
          activeRunner = undefined;
          publish({ type: "service-log", service: "java", line: `Run failed: ${formatError(error)}` });
          if (lastSummary) publish({ type: "run-complete", summary: lastSummary });
        })
        .finally(() => {
          unsubscribe();
          if (token === activeRunToken) {
            activeRunner = undefined;
            if (runState === "running" || runState === "paused") runState = "stopped";
          }
        });

      res.json({ state: runState, totalCases: cases.length });
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/run/pause", (_req, res) => {
    if (!activeRunner) return res.json({ state: "idle" });
    activeRunner.pause();
    runState = "paused";
    return res.json({ state: runState });
  });
  app.post("/api/run/resume", (_req, res) => {
    if (!activeRunner) return res.json({ state: "idle" });
    activeRunner.resume();
    runState = "running";
    return res.json({ state: runState });
  });
  app.post("/api/run/stop", (_req, res) => {
    if (!activeRunner) return res.json({ state: "idle" });
    activeRunner.stop();
    activeRunner = undefined;
    activeRunToken += 1;
    runState = "stopped";
    if (lastSummary) publish({ type: "run-complete", summary: lastSummary });
    return res.json({ state: runState });
  });
  app.post("/api/report/save", async (_req, res, next) => {
    try {
      const paths = await writeReports({
        outputDir: "reports",
        summary: lastSummary ?? fallbackSummary(lastProfile, lastSeed, discrepancies.length),
        discrepancies,
        serviceVersions: { java: "attached", typescript: "attached" }
      });
      res.json(paths);
    } catch (error) {
      next(error);
    }
  });
  app.get("*", (_req, res, next) => {
    const indexPath = resolve("dist/ui/index.html");
    if (existsSync(indexPath)) res.sendFile(indexPath);
    else next();
  });
  return app;
}

function parseProfile(value: unknown): RunProfileName {
  return value === "Deep" || value === "Custom" ? value : "Fast";
}

function readBodyString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function fallbackSummary(profile: RunProfileName, seed: number, failures: number): RunSummary {
  return {
    runId: `run-${Date.now()}`,
    profile,
    seed,
    totalCases: 0,
    completedCases: 0,
    failures,
    roundTrips: 0,
    maxDriftMeters: 0
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown run error";
}
