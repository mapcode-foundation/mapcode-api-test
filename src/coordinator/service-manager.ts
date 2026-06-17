import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export interface ServiceManager {
  javaBaseUrl: string;
  typescriptBaseUrl: string;
  logs: string[];
  waitUntilReady(): Promise<{ javaReady: boolean; typescriptReady: boolean }>;
  stop(): Promise<void>;
}

export function createAttachedServiceManager(input: { javaBaseUrl: string; typescriptBaseUrl: string }): ServiceManager {
  return {
    javaBaseUrl: input.javaBaseUrl,
    typescriptBaseUrl: input.typescriptBaseUrl,
    logs: [],
    async waitUntilReady() {
      const [javaReady, typescriptReady] = await Promise.all([isReady(input.javaBaseUrl), isReady(input.typescriptBaseUrl)]);
      return { javaReady, typescriptReady };
    },
    async stop() {
      return undefined;
    }
  };
}

export function createManagedServiceManager(input: {
  javaCommand: string;
  javaArgs: string[];
  javaBaseUrl: string;
  typescriptCommand: string;
  typescriptArgs: string[];
  typescriptBaseUrl: string;
}): ServiceManager {
  const logs: string[] = [];
  const children: ChildProcessWithoutNullStreams[] = [
    spawn(input.javaCommand, input.javaArgs, { cwd: "../mapcode-rest-service" }),
    spawn(input.typescriptCommand, input.typescriptArgs, { cwd: "../mapcode-rest-service-ts" })
  ];

  for (const child of children) {
    child.stdout.on("data", (chunk) => logs.push(String(chunk).trim()));
    child.stderr.on("data", (chunk) => logs.push(String(chunk).trim()));
  }

  return {
    javaBaseUrl: input.javaBaseUrl,
    typescriptBaseUrl: input.typescriptBaseUrl,
    logs,
    async waitUntilReady() {
      const [javaReady, typescriptReady] = await Promise.all([
        waitForReady(input.javaBaseUrl),
        waitForReady(input.typescriptBaseUrl)
      ]);
      return { javaReady, typescriptReady };
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
    const response = await fetch(new URL("/mapcode/status", baseUrl));
    return response.status === 200;
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
