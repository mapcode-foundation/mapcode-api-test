import express from "express";

const app = express();
const portArgIndex = process.argv.indexOf("--port");
const port = portArgIndex >= 0 ? Number(process.argv[portArgIndex + 1]) : 4173;

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Mapcode API parity dashboard listening at http://127.0.0.1:${port}`);
});
