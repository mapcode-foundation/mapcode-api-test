import express, { type Response } from "express";
import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { loadFixtureSet, expandFixtureCases, resolveFixtureSet } from "./fixture-store";
import { renderReport, writeReports } from "./reporter";
import { Runner } from "./runner";
import { isReady } from "./service-manager";
import type {
  Discrepancy,
  RunProfileName,
  RunnerEvent,
  RunSummary,
  ServiceAvailability,
  ServiceKind,
  ServiceMode,
  ServiceStatus
} from "../shared/types";

export interface ServerInput {
  env?: NodeJS.ProcessEnv;
  stopPortListener?: (baseUrl: string) => Promise<void>;
}

type RunState = "idle" | "running" | "paused" | "stopped";
type ServiceState = ServiceStatus & { child?: ChildProcessWithoutNullStreams };
export type ServiceStartStep = {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  waitForExit: boolean;
};

const defaultJavaBaseUrl = "http://127.0.0.1:8081";
const defaultTypeScriptBaseUrl = "http://127.0.0.1:8082";
const defaultJavaSourcePath = "../mapcode-rest-service";
const defaultTypeScriptSourcePath = "../mapcode-rest-service-ts";
const defaultSeed = 20260617;
const serviceLabels: Record<ServiceKind, string> = {
  java: "Java API (leading)",
  typescript: "TypeScript API (ported)"
};

export function createServerApp(input: ServerInput = {}) {
  loadEnv();
  const env = input.env ?? process.env;
  const stopPortListener = input.stopPortListener ?? terminatePortListener;
  let runtimeTomTomApiKey: string | undefined;
  let activeRunner: Runner | undefined;
  let activeRunToken = 0;
  let runState: RunState = "idle";
  let lastSummary: RunSummary | undefined;
  let lastProfile: RunProfileName = "Fast";
  let lastSeed = defaultSeed;
  let discrepancies: Discrepancy[] = [];
  const services: Record<ServiceKind, ServiceState> = {
    java: {
      kind: "java",
      label: serviceLabels.java,
      mode: "manual",
      baseUrl: defaultJavaBaseUrl,
      sourcePath: defaultJavaSourcePath,
      availability: "unknown",
      logs: []
    },
    typescript: {
      kind: "typescript",
      label: serviceLabels.typescript,
      mode: "manual",
      baseUrl: defaultTypeScriptBaseUrl,
      sourcePath: defaultTypeScriptSourcePath,
      availability: "unknown",
      logs: []
    }
  };
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

  function publicServices(): Record<ServiceKind, ServiceStatus> {
    return {
      java: publicService(services.java),
      typescript: publicService(services.typescript)
    };
  }

  function publicService(service: ServiceState): ServiceStatus {
    return {
      kind: service.kind,
      label: service.label,
      mode: service.mode,
      baseUrl: service.baseUrl,
      sourcePath: service.sourcePath,
      availability: service.availability,
      logs: service.logs.slice(-40)
    };
  }

  function setServiceAvailability(kind: ServiceKind, availability: ServiceAvailability): void {
    services[kind].availability = availability;
    publish({ type: "service-status", services: publicServices() });
  }

  function addServiceLog(kind: ServiceKind, line: string): void {
    const service = services[kind];
    service.logs.push(line);
    service.logs = service.logs.slice(-120);
    publish({ type: "service-log", service: kind, line });
  }

  async function refreshService(kind: ServiceKind, options: { preserveStarting?: boolean } = {}): Promise<boolean> {
    const ready = await isReady(services[kind].baseUrl);
    if (ready) {
      setServiceAvailability(kind, "available");
    } else if (options.preserveStarting && services[kind].availability === "starting" && services[kind].child) {
      publish({ type: "service-status", services: publicServices() });
    } else {
      setServiceAvailability(kind, "unavailable");
    }
    return ready;
  }

  async function unavailableServiceLabels(): Promise<string[]> {
    const [javaReady, typescriptReady] = await Promise.all([refreshService("java"), refreshService("typescript")]);
    const unavailable: string[] = [];
    if (!javaReady) unavailable.push(serviceLabels.java);
    if (!typescriptReady) unavailable.push(serviceLabels.typescript);
    return unavailable;
  }

  async function startService(kind: ServiceKind): Promise<ServiceStatus> {
    const service = services[kind];
    await stopService(kind);
    service.mode = "auto";
    setServiceAvailability(kind, "starting");
    addServiceLog(kind, `Starting ${service.label} at ${service.baseUrl}`);

    const steps = buildServiceStartPlan(kind, service.baseUrl, service.sourcePath);
    for (const step of steps) {
      addServiceLog(kind, `Running ${step.command} ${step.args.join(" ")} in ${step.cwd}`);
      const child = spawn(step.command, step.args, {
        cwd: step.cwd,
        detached: true,
        env: { ...process.env, ...step.env }
      });
      service.child = child;
      child.stdout.on("data", (chunk) => addServiceLog(kind, String(chunk).trim()));
      child.stderr.on("data", (chunk) => addServiceLog(kind, String(chunk).trim()));
      child.on("error", (error) => addServiceLog(kind, `${service.label} failed to start: ${formatError(error)}`));

      if (step.waitForExit) {
        const code = await waitForProcessExit(child);
        if (service.child === child) service.child = undefined;
        if (code !== 0) {
          setServiceAvailability(kind, "unavailable");
          addServiceLog(kind, `${service.label} setup failed with exit code ${code}`);
          return publicService(service);
        }
        continue;
      }

      child.on("exit", (code, signal) => {
        if (service.child !== child) return;
        service.child = undefined;
        if (service.availability === "starting" || service.availability === "available") {
          setServiceAvailability(kind, "unavailable");
        }
        addServiceLog(kind, `${service.label} exited with ${signal ?? code ?? "unknown status"}`);
      });
    }

    const ready = await waitForServiceReady(service.baseUrl);
    setServiceAvailability(kind, ready ? "available" : "unavailable");
    if (!ready) addServiceLog(kind, `${service.label} did not become available at ${service.baseUrl}`);
    return publicService(service);
  }

  async function stopService(
    kind: ServiceKind,
    options: { markUnavailable?: boolean; log?: boolean; stopPortListener?: boolean } = {}
  ): Promise<void> {
    const service = services[kind];
    const child = service.child;
    if (child) {
      service.child = undefined;
      terminateChildProcess(child);
    }
    if (options.stopPortListener) {
      try {
        await stopPortListener(service.baseUrl);
      } catch (error) {
        addServiceLog(kind, `Could not stop listener at ${service.baseUrl}: ${formatError(error)}`);
      }
    }
    if (options.markUnavailable) setServiceAvailability(kind, "unavailable");
    if (options.log) addServiceLog(kind, `Stopped ${service.label}`);
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
  app.get("/api/config/tomtom-map-key", (_req, res) => {
    const key = runtimeTomTomApiKey || env.TOMTOM_API_KEY;
    if (!key) return res.status(404).json({ error: "TomTom map key unavailable" });
    return res.json({ key });
  });
  app.get("/api/tomtom/tile/:z/:x/:y.png", async (req, res, next) => {
    try {
      const key = runtimeTomTomApiKey || env.TOMTOM_API_KEY;
      if (!key) return res.status(404).json({ error: "TomTom map key unavailable" });
      const z = parseTilePart(req.params.z);
      const x = parseTilePart(req.params.x);
      const y = parseTilePart(req.params.y);
      if (z === undefined || x === undefined || y === undefined) return res.status(400).json({ error: "Invalid tile" });

      const tileResponse = await fetch(`https://api.tomtom.com/map/1/tile/basic/main/${z}/${x}/${y}.png?key=${key}`);
      if (!tileResponse.ok) return res.status(tileResponse.status).json({ error: "TomTom tile unavailable" });
      const body = Buffer.from(await tileResponse.arrayBuffer());
      res.type(tileResponse.headers.get("content-type") ?? "image/png");
      res.setHeader("cache-control", "public, max-age=3600");
      return res.send(body);
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/config/tomtom-key", (req, res) => {
    const key = typeof req.body?.key === "string" ? req.body.key.trim() : "";
    if (key.length < 8) return res.status(400).json({ error: "TomTom API key is too short" });
    runtimeTomTomApiKey = key;
    res.json({ hasTomTomApiKey: true });
  });
  app.get("/api/fixtures", async (_req, res, next) => {
    try {
      const profile = parseProfile(_req.query.profile);
      const fixtureSet = await loadFixtureSet("fixtures/fixture-set.json");
      res.json(resolveFixtureSet(fixtureSet, profile));
    } catch (error) {
      next(error);
    }
  });
  app.get("/api/cases", async (req, res, next) => {
    try {
      const profile = parseProfile(req.query.profile);
      const fixtureSet = await loadFixtureSet("fixtures/fixture-set.json");
      res.json(expandFixtureCases(fixtureSet, profile));
    } catch (error) {
      next(error);
    }
  });
  app.get("/api/services", (_req, res) => res.json(publicServices()));
  app.post("/api/services/stop", async (_req, res) => {
    await Promise.all([
      stopService("java", { markUnavailable: true, log: true, stopPortListener: true }),
      stopService("typescript", { markUnavailable: true, log: true, stopPortListener: true })
    ]);
    return res.json(publicServices());
  });
  app.post("/api/services/:kind/check", async (req, res) => {
    const kind = parseServiceKind(req.params.kind);
    if (!kind) return res.status(404).json({ error: "Unknown service" });
    await refreshService(kind, { preserveStarting: true });
    return res.json(publicService(services[kind]));
  });
  app.post("/api/services/:kind/config", async (req, res) => {
    const kind = parseServiceKind(req.params.kind);
    if (!kind) return res.status(404).json({ error: "Unknown service" });
    const baseUrl = readBodyString(req.body?.baseUrl, services[kind].baseUrl);
    const sourcePath = readBodyString(req.body?.sourcePath, services[kind].sourcePath);
    services[kind].mode = "manual";
    services[kind].baseUrl = normalizeBaseUrl(baseUrl);
    services[kind].sourcePath = sourcePath;
    await stopService(kind);
    await refreshService(kind);
    return res.json(publicService(services[kind]));
  });
  app.post("/api/services/:kind/start", async (req, res, next) => {
    try {
      const kind = parseServiceKind(req.params.kind);
      if (!kind) return res.status(404).json({ error: "Unknown service" });
      if (typeof req.body?.baseUrl === "string") services[kind].baseUrl = normalizeBaseUrl(req.body.baseUrl);
      if (typeof req.body?.sourcePath === "string" && req.body.sourcePath.trim()) {
        services[kind].sourcePath = req.body.sourcePath.trim();
      }
      if (!existsSync(resolve(services[kind].sourcePath))) {
        setServiceAvailability(kind, "unavailable");
        addServiceLog(kind, `Source path not found: ${services[kind].sourcePath}`);
        return res.status(400).json({ error: "Source path unavailable", service: services[kind].label });
      }
      const service = await startService(kind);
      return res.status(service.availability === "available" ? 200 : 500).json(service);
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/run/start", async (req, res, next) => {
    try {
      const unavailable = await unavailableServiceLabels();
      if (unavailable.length > 0) {
        runState = "stopped";
        return res.status(409).json({ error: "APIs unavailable", unavailable });
      }

      activeRunner?.stop();
      activeRunToken += 1;

      const fixtureSet = await loadFixtureSet("fixtures/fixture-set.json");
      const profile = parseProfile(req.body?.profile);
      const cases = expandFixtureCases(fixtureSet, profile);
      const javaBaseUrl = services.java.baseUrl;
      const typescriptBaseUrl = services.typescript.baseUrl;
      const token = activeRunToken;
      const runner = new Runner({
        javaBaseUrl,
        typescriptBaseUrl,
        profile,
        seed: fixtureSet.seed,
        cases,
        requestDelayMs: parseRequestDelayMs(req.body?.requestDelaySeconds)
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
  app.post("/api/run/delay", (req, res) => {
    const requestDelayMs = parseRequestDelayMs(req.body?.requestDelaySeconds);
    activeRunner?.setRequestDelay(requestDelayMs);
    return res.json({ requestDelayMs, requestDelaySeconds: requestDelayMs / 1000 });
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
    const reportInput = {
      outputDir: "reports",
      summary: lastSummary ?? fallbackSummary(lastProfile, lastSeed, discrepancies.length),
      discrepancies,
      serviceVersions: { java: "attached", typescript: "attached" }
    };
    try {
      const paths = await writeReports(reportInput);
      res.json(paths);
    } catch (error) {
      try {
        const preview = renderReport(reportInput);
        res.json({
          markdownPath: preview.markdownPath,
          jsonPath: preview.jsonPath,
          markdown: preview.markdown,
          html: preview.html,
          warning: `Report preview rendered, but files were not saved: ${formatError(error)}`
        });
      } catch (fallbackError) {
        next(fallbackError);
      }
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
  return value === "Deep" ? value : "Fast";
}

function parseServiceKind(value: string): ServiceKind | undefined {
  return value === "java" || value === "typescript" ? value : undefined;
}

function parseTilePart(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

export function parseRequestDelayMs(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  const seconds = Number.isFinite(parsed) ? parsed : 0;
  return Math.round(Math.min(5, Math.max(0, seconds)) * 1000);
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

function terminateChildProcess(child: ChildProcessWithoutNullStreams): void {
  if (child.pid && process.platform !== "win32") {
    try {
      process.kill(-child.pid, "SIGTERM");
      return;
    } catch {
      // Fall back to the direct child signal below.
    }
  }
  child.kill("SIGTERM");
}

async function terminatePortListener(baseUrl: string): Promise<void> {
  if (process.platform === "win32") return;
  const pids = await listeningPids(portFromBaseUrl(baseUrl));
  for (const pid of pids) {
    if (pid !== process.pid) process.kill(pid, "SIGTERM");
  }
}

function listeningPids(port: string): Promise<number[]> {
  return new Promise((resolvePids, rejectPids) => {
    execFile("lsof", [`-tiTCP:${port}`, "-sTCP:LISTEN"], (error, stdout, stderr) => {
      if (error) {
        if ("code" in error && error.code === 1) {
          resolvePids([]);
          return;
        }
        rejectPids(new Error(stderr.trim() || error.message));
        return;
      }

      const pids = stdout
        .split(/\s+/)
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0);
      resolvePids([...new Set(pids)]);
    });
  });
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function portFromBaseUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  return url.port || (url.protocol === "https:" ? "443" : "80");
}

export function buildServiceStartPlan(kind: ServiceKind, baseUrl: string, sourcePath: string): ServiceStartStep[] {
  const port = portFromBaseUrl(baseUrl);
  const resolvedSourcePath = resolve(sourcePath);
  if (kind === "typescript") {
    return [
      {
        command: "npm",
        args: ["run", "dev"],
        cwd: resolvedSourcePath,
        env: {
          PORT: port,
          MAPCODE_BORDERS_PATH: firstExistingPath([
            resolve(resolvedSourcePath, "data/borders.fgb"),
            resolve("../mapcode-rest-service-ts/data/borders.fgb")
          ])
        },
        waitForExit: false
      }
    ];
  }

  const bordersPath = firstExistingPath([
    resolve(resolvedSourcePath, "resources/src/main/resources/borders.fgb"),
    resolve(resolvedSourcePath, "data/borders.fgb"),
    resolve("../mapcode-rest-service/resources/src/main/resources/borders.fgb")
  ]);
  const deploymentPath = resolve(resolvedSourcePath, "deployment");
  return [
    {
      command: "mvn",
      args: ["install", "-Pprod"],
      cwd: resolvedSourcePath,
      env: {
        MAPCODE_BORDERS_PATH: bordersPath
      },
      waitForExit: true
    },
    {
      command: "mvn",
      args: [`-Dmaven.httpserver.port=${port}`, "jetty:run"],
      cwd: deploymentPath,
      env: {
        MAPCODE_BORDERS_PATH: bordersPath
      },
      waitForExit: false
    }
  ];
}

function waitForProcessExit(child: ChildProcessWithoutNullStreams): Promise<number> {
  return new Promise((resolveExit) => {
    child.once("error", () => resolveExit(1));
    child.once("exit", (code) => resolveExit(code ?? 1));
  });
}

function firstExistingPath(paths: string[]): string {
  return paths.find((path) => existsSync(path)) ?? paths[0];
}

async function waitForServiceReady(baseUrl: string): Promise<boolean> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await isReady(baseUrl)) return true;
    await new Promise((resolveReady) => setTimeout(resolveReady, 500));
  }
  return false;
}
