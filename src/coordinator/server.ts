import express from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { loadFixtureSet, expandFixtureCases } from "./fixture-store";

export interface ServerInput {
  env?: NodeJS.ProcessEnv;
}

let runtimeTomTomApiKey: string | undefined;

export function createServerApp(input: ServerInput = {}) {
  loadEnv();
  const env = input.env ?? process.env;
  const app = express();
  app.use(express.json());
  const staticDir = resolve("dist/ui");
  if (existsSync(staticDir)) app.use(express.static(staticDir));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
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
  app.get("*", (_req, res, next) => {
    const indexPath = resolve("dist/ui/index.html");
    if (existsSync(indexPath)) res.sendFile(indexPath);
    else next();
  });
  return app;
}
