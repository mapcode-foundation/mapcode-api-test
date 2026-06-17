import http from "node:http";
import type express from "express";

export async function inject(
  app: express.Express,
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<{ statusCode: number; body: string }> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("No test port");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method: init.method ?? "GET",
      headers: init.body ? { "content-type": "application/json" } : undefined,
      body: init.body ? JSON.stringify(init.body) : undefined
    });
    return { statusCode: response.status, body: await response.text() };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
