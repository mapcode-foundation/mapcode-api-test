import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { FixturePoint, RequestCase, RunProfileName } from "../shared/types";
import { expandCasesForFixture, staticContractCases } from "./api-catalog";

const fixturePointSchema = z.object({
  id: z.string(),
  category: z.enum(["capital", "near-capital", "country", "ocean", "pole", "contract"]),
  label: z.string(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  territory: z.string().optional(),
  source: z.string()
});

const fixtureSetSchema = z.object({
  id: z.string(),
  seed: z.number().int(),
  source: z.string(),
  points: z.array(fixturePointSchema)
});

export type FixtureSet = z.infer<typeof fixtureSetSchema>;

export async function loadFixtureSet(path: string): Promise<FixtureSet> {
  const raw = await readFile(path, "utf8");
  return fixtureSetSchema.parse(JSON.parse(raw));
}

export function expandFixtureCases(set: FixtureSet, profile: RunProfileName): RequestCase[] {
  const dynamicCases = set.points.flatMap((point: FixturePoint) => expandCasesForFixture(point, profile));
  return [...staticContractCases(), ...dynamicCases];
}
