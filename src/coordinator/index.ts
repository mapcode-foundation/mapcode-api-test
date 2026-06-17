import { existsSync } from "node:fs";
import { resolve } from "node:path";
import express from "express";

const app = express();
const portArgIndex = process.argv.indexOf("--port");
const port = portArgIndex >= 0 ? Number(process.argv[portArgIndex + 1]) : 4173;
const staticDir = resolve("dist/ui");
const indexHtml = resolve(staticDir, "index.html");

if (existsSync(staticDir)) {
  app.use(express.static(staticDir));
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("*", (_req, res, next) => {
  if (existsSync(indexHtml)) {
    res.sendFile(indexHtml);
    return;
  }
  next();
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Mapcode API parity dashboard listening at http://127.0.0.1:${port}`);
});
