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
