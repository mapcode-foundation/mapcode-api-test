import type { FixturePoint, RequestCase, ServiceKind, ServiceStatus } from "../shared/types";

export type ServicesResponse = Record<ServiceKind, ServiceStatus>;
export type ReportResponse = {
  markdownPath: string;
  jsonPath: string;
  markdown: string;
  html: string;
};

export async function getConfig(): Promise<{ hasTomTomApiKey: boolean }> {
  const response = await fetch("/api/config");
  return response.json();
}

export async function getFixtures(profile?: string): Promise<{ points: FixturePoint[]; seed: number }> {
  const path = profile ? `/api/fixtures?profile=${encodeURIComponent(profile)}` : "/api/fixtures";
  const response = await fetch(path);
  return response.json();
}

export async function getCases(profile: string): Promise<RequestCase[]> {
  const response = await fetch(`/api/cases?profile=${encodeURIComponent(profile)}`);
  return response.json();
}

export async function getServices(): Promise<ServicesResponse> {
  const response = await fetch("/api/services");
  ensureOk(response);
  return response.json();
}

export async function checkService(kind: ServiceKind): Promise<ServiceStatus> {
  return postJson<ServiceStatus>(`/api/services/${kind}/check`);
}

export async function configureService(kind: ServiceKind, baseUrl: string): Promise<ServiceStatus> {
  return postJson<ServiceStatus>(`/api/services/${kind}/config`, { baseUrl });
}

export async function startService(kind: ServiceKind, baseUrl: string): Promise<ServiceStatus> {
  return postJson<ServiceStatus>(`/api/services/${kind}/start`, { baseUrl });
}

export async function startRun(profile: string): Promise<{ state: string; totalCases: number }> {
  const response = await fetch("/api/run/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ profile })
  });
  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    const unavailable = Array.isArray(body?.unavailable) ? `: ${body.unavailable.join(", ")}` : "";
    throw new Error(`${body?.error ?? `Request failed with status ${response.status}`}${unavailable}`);
  }
  return response.json();
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

export async function saveReport(): Promise<ReportResponse> {
  const response = await fetch("/api/report/save", { method: "POST" });
  ensureOk(response);
  return response.json();
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  ensureOk(response);
  return response.json();
}

function ensureOk(response: Response): void {
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
}
