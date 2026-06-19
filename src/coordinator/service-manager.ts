import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { resolveServiceUrl } from "./service-url";

export interface ServiceManager {
  productionBaseUrl: string;
  candidateBaseUrl: string;
  logs: string[];
  waitUntilReady(): Promise<{ productionReady: boolean; candidateReady: boolean }>;
  stop(): Promise<void>;
}

export function createAttachedServiceManager(input: { productionBaseUrl: string; candidateBaseUrl: string }): ServiceManager {
  return {
    productionBaseUrl: input.productionBaseUrl,
    candidateBaseUrl: input.candidateBaseUrl,
    logs: [],
    async waitUntilReady() {
      const [productionReady, candidateReady] = await Promise.all([isReady(input.productionBaseUrl), isReady(input.candidateBaseUrl)]);
      return { productionReady, candidateReady };
    },
    async stop() {
      return undefined;
    }
  };
}

export function createManagedServiceManager(input: {
  productionCommand: string;
  productionArgs: string[];
  productionBaseUrl: string;
  candidateCommand: string;
  candidateArgs: string[];
  candidateBaseUrl: string;
}): ServiceManager {
  const logs: string[] = [];
  const children: ChildProcessWithoutNullStreams[] = [
    spawn(input.productionCommand, input.productionArgs, { cwd: "../mapcode-rest-service" }),
    spawn(input.candidateCommand, input.candidateArgs, { cwd: "../mapcode-rest-service-ts" })
  ];

  for (const child of children) {
    child.stdout.on("data", (chunk) => logs.push(String(chunk).trim()));
    child.stderr.on("data", (chunk) => logs.push(String(chunk).trim()));
  }

  return {
    productionBaseUrl: input.productionBaseUrl,
    candidateBaseUrl: input.candidateBaseUrl,
    logs,
    async waitUntilReady() {
      const [productionReady, candidateReady] = await Promise.all([
        waitForReady(input.productionBaseUrl),
        waitForReady(input.candidateBaseUrl)
      ]);
      return { productionReady, candidateReady };
    },
    async stop() {
      for (const child of children) {
        child.kill("SIGTERM");
      }
    }
  };
}

export async function isReady(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(resolveServiceUrl(baseUrl, "/mapcode/status"));
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForReady(baseUrl: string): Promise<boolean> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await isReady(baseUrl)) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}
