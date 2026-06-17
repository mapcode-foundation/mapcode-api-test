import type { FixturePoint, RequestCase } from "../shared/types";

export async function getConfig(): Promise<{ hasTomTomApiKey: boolean }> {
  const response = await fetch("/api/config");
  return response.json();
}

export async function getFixtures(): Promise<{ points: FixturePoint[]; seed: number }> {
  const response = await fetch("/api/fixtures");
  return response.json();
}

export async function getCases(profile: string): Promise<RequestCase[]> {
  const response = await fetch(`/api/cases?profile=${encodeURIComponent(profile)}`);
  return response.json();
}

export async function startRun(profile: string): Promise<void> {
  await postJson("/api/run/start", { profile });
}

export async function pauseRun(): Promise<void> {
  await postJson("/api/run/pause");
}

export async function resumeRun(): Promise<void> {
  await postJson("/api/run/resume");
}

export async function stopRun(): Promise<void> {
  await postJson("/api/run/stop");
}

export function connectEvents(onEvent: (event: unknown) => void): () => void {
  const source = new EventSource("/api/events");
  source.onmessage = (message) => onEvent(JSON.parse(message.data));
  return () => source.close();
}

export async function saveReport(): Promise<{ markdownPath: string; jsonPath: string }> {
  const response = await fetch("/api/report/save", { method: "POST" });
  ensureOk(response);
  return response.json();
}

async function postJson(path: string, body?: unknown): Promise<void> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  ensureOk(response);
}

function ensureOk(response: Response): void {
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
}
