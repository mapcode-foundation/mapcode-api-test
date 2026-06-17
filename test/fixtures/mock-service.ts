import express from "express";
import type { Server } from "node:http";

export interface MockService {
  baseUrl: string;
  close: () => Promise<void>;
}

export async function startMockService(
  routes: Record<string, { status: number; body: string; contentType?: string }>
): Promise<MockService> {
  const app = express();

  for (const [path, response] of Object.entries(routes)) {
    app.get(path, (_req, res) => {
      res.status(response.status).type(response.contentType ?? "application/json").send(response.body);
    });
  }

  const server = await new Promise<Server>((resolve) => {
    const started = app.listen(0, "127.0.0.1", () => resolve(started));
  });
  const address = server.address();

  if (address === null || typeof address === "string") {
    throw new Error("Mock service did not bind to a TCP port");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}
