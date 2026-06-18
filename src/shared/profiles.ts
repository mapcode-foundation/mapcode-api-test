import type { RunProfileName } from "./types";

export interface RunProfile {
  name: RunProfileName;
  maxCapitalPoints: number;
  maxCountryPoints: number;
  maxOceanPoints: number;
  includeRoundTrips: boolean;
}

export const RUN_PROFILES: Record<RunProfileName, RunProfile> = {
  Fast: { name: "Fast", maxCapitalPoints: 25, maxCountryPoints: 50, maxOceanPoints: 16, includeRoundTrips: true },
  Deep: {
    name: "Deep",
    maxCapitalPoints: Number.POSITIVE_INFINITY,
    maxCountryPoints: Number.POSITIVE_INFINITY,
    maxOceanPoints: Number.POSITIVE_INFINITY,
    includeRoundTrips: true
  }
};
