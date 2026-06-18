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
  const dynamicCases = resolveFixtureSet(set, profile).points.flatMap((point: FixturePoint) =>
    expandCasesForFixture(point, profile)
  );
  return [...staticContractCases(), ...dynamicCases];
}

export function resolveFixtureSet(set: FixtureSet, profile: RunProfileName): FixtureSet {
  return {
    ...set,
    source: `${set.source}; ${profile.toLowerCase()} profile generated fixtures`,
    points: profile === "Deep" ? deepProfilePoints() : fastProfilePoints()
  };
}

const FAST_LAND_POINTS: FixturePoint[] = [
  cityPoint("capital-nld-amsterdam", "Amsterdam, NLD", 52.376514, 4.908543, "NLD", "fast-curated", "capital"),
  cityPoint("city-nld-rotterdam", "Rotterdam, NLD", 51.92442, 4.477733, "NLD", "fast-curated"),
  cityPoint("city-bel-brussels", "Brussels, BEL", 50.846557, 4.351697, "BEL", "fast-curated"),
  cityPoint("city-gbr-london", "London, GBR", 51.507222, -0.1275, "GBR", "fast-curated"),
  cityPoint("city-fra-paris", "Paris, FRA", 48.856613, 2.352222, "FRA", "fast-curated"),
  cityPoint("city-ken-nairobi", "Nairobi, KEN", -1.286389, 36.817223, "KEN", "fast-curated"),
  cityPoint("city-zaf-cape-town", "Cape Town, ZAF", -33.924869, 18.424055, "ZAF", "fast-curated"),
  cityPoint("city-egy-cairo", "Cairo, EGY", 30.04442, 31.235712, "EGY", "fast-curated"),
  cityPoint("city-usa-new-york", "New York, USA", 40.712776, -74.005974, "USA", "fast-curated"),
  cityPoint("city-usa-los-angeles", "Los Angeles, USA", 34.052235, -118.243683, "USA", "fast-curated"),
  cityPoint("city-mex-mexico-city", "Mexico City, MEX", 19.432608, -99.133209, "MEX", "fast-curated"),
  cityPoint("city-arg-buenos-aires", "Buenos Aires, ARG", -34.603722, -58.381592, "ARG", "fast-curated"),
  cityPoint("city-bra-sao-paulo", "Sao Paulo, BRA", -23.55052, -46.633308, "BRA", "fast-curated"),
  cityPoint("city-usa-honolulu", "Honolulu, Hawaii, USA", 21.306944, -157.858337, "USA", "fast-curated"),
  cityPoint("city-aus-sydney", "Sydney, AUS", -33.86882, 151.209296, "AUS", "fast-curated"),
  cityPoint("city-jpn-tokyo", "Tokyo, JPN", 35.676191, 139.650311, "JPN", "fast-curated"),
  cityPoint("city-chn-shanghai", "Shanghai, CHN", 31.230391, 121.473701, "CHN", "fast-curated"),
  cityPoint("city-ind-mumbai", "Mumbai, IND", 19.075984, 72.877656, "IND", "fast-curated"),
  cityPoint("city-rus-moscow", "Moscow, RUS", 55.755826, 37.6173, "RUS", "fast-curated"),
  cityPoint("city-tur-istanbul", "Istanbul, TUR", 41.008238, 28.978359, "TUR", "fast-curated"),
  cityPoint("city-are-dubai", "Dubai, ARE", 25.204849, 55.270783, "ARE", "fast-curated"),
  cityPoint("city-sgp-singapore", "Singapore, SGP", 1.352083, 103.819836, "SGP", "fast-curated"),
  cityPoint("city-nzl-auckland", "Auckland, NZL", -36.850883, 174.764488, "NZL", "fast-curated"),
  cityPoint("pole-near-north", "Near North Pole", 89.6, 45, undefined, "fast-curated", "pole"),
  cityPoint("pole-near-south", "Near South Pole", -89.6, -135, undefined, "fast-curated", "pole"),
  cityPoint("antarctica-mcmurdo", "McMurdo Station, Antarctica", -77.8419, 166.6863, "ATA", "fast-curated", "country")
];

const FAST_OCEAN_POINTS: FixturePoint[] = [
  oceanPoint("ocean-north-atlantic", "North Atlantic sample", 36, -40),
  oceanPoint("ocean-south-atlantic", "South Atlantic sample", -32, -18),
  oceanPoint("ocean-north-pacific", "North Pacific sample", 28, -150),
  oceanPoint("ocean-south-pacific", "South Pacific sample", -25, -135),
  oceanPoint("ocean-indian", "Indian Ocean sample", -12, 78),
  oceanPoint("ocean-arctic", "Arctic Ocean sample", 82, 20),
  oceanPoint("ocean-southern", "Southern Ocean sample", -62, 40),
  oceanPoint("ocean-gulf-of-guinea", "Gulf of Guinea sample", 0.2, 0.1),
  oceanPoint("ocean-coral-sea", "Coral Sea sample", -18, 155),
  oceanPoint("ocean-bering-sea", "Bering Sea sample", 58, -175)
];

const DEEP_CITY_CENTERS: FixturePoint[] = [
  ...FAST_LAND_POINTS,
  cityPoint("city-deu-berlin", "Berlin, DEU", 52.52, 13.405, "DEU", "deep-center"),
  cityPoint("city-esp-madrid", "Madrid, ESP", 40.416775, -3.70379, "ESP", "deep-center"),
  cityPoint("city-ita-rome", "Rome, ITA", 41.902782, 12.496366, "ITA", "deep-center"),
  cityPoint("city-swe-stockholm", "Stockholm, SWE", 59.329323, 18.068581, "SWE", "deep-center"),
  cityPoint("city-pol-warsaw", "Warsaw, POL", 52.229676, 21.012229, "POL", "deep-center"),
  cityPoint("city-nga-lagos", "Lagos, NGA", 6.524379, 3.379206, "NGA", "deep-center"),
  cityPoint("city-eth-addis-ababa", "Addis Ababa, ETH", 8.980603, 38.757761, "ETH", "deep-center"),
  cityPoint("city-mar-casablanca", "Casablanca, MAR", 33.57311, -7.589843, "MAR", "deep-center"),
  cityPoint("city-can-toronto", "Toronto, CAN", 43.653225, -79.383186, "CAN", "deep-center"),
  cityPoint("city-usa-chicago", "Chicago, USA", 41.878113, -87.629799, "USA", "deep-center"),
  cityPoint("city-col-bogota", "Bogota, COL", 4.711, -74.0721, "COL", "deep-center"),
  cityPoint("city-per-lima", "Lima, PER", -12.046374, -77.042793, "PER", "deep-center"),
  cityPoint("city-chl-santiago", "Santiago, CHL", -33.44889, -70.669265, "CHL", "deep-center"),
  cityPoint("city-kor-seoul", "Seoul, KOR", 37.566535, 126.977969, "KOR", "deep-center"),
  cityPoint("city-chn-beijing", "Beijing, CHN", 39.904202, 116.407394, "CHN", "deep-center"),
  cityPoint("city-chn-shenzhen", "Shenzhen, CHN", 22.543096, 114.057865, "CHN", "deep-center"),
  cityPoint("city-tha-bangkok", "Bangkok, THA", 13.756331, 100.501765, "THA", "deep-center"),
  cityPoint("city-idn-jakarta", "Jakarta, IDN", -6.208763, 106.845599, "IDN", "deep-center"),
  cityPoint("city-pak-karachi", "Karachi, PAK", 24.860735, 67.001137, "PAK", "deep-center"),
  cityPoint("city-irn-tehran", "Tehran, IRN", 35.689198, 51.388974, "IRN", "deep-center"),
  cityPoint("city-sau-riyadh", "Riyadh, SAU", 24.713552, 46.675296, "SAU", "deep-center"),
  cityPoint("city-aus-melbourne", "Melbourne, AUS", -37.813628, 144.963058, "AUS", "deep-center"),
  cityPoint("antarctica-palmer", "Palmer Station, Antarctica", -64.7742, -64.0536, "ATA", "deep-center", "country"),
  cityPoint("antarctica-south-pole-station", "Amundsen-Scott Station, Antarctica", -89.9989, 139.2728, "ATA", "deep-center", "pole")
];

function fastProfilePoints(): FixturePoint[] {
  return [...FAST_LAND_POINTS, ...FAST_OCEAN_POINTS];
}

function deepProfilePoints(): FixturePoint[] {
  return [...FAST_LAND_POINTS, ...FAST_OCEAN_POINTS, ...cityCloudPoints(), ...globalRasterPoints()];
}

function cityCloudPoints(): FixturePoint[] {
  const offsets = [
    [0, 0],
    [0.08, 0],
    [-0.08, 0],
    [0, 0.08],
    [0, -0.08],
    [0.16, 0.16],
    [0.16, -0.16],
    [-0.16, 0.16],
    [-0.16, -0.16],
    [0.28, 0.08],
    [0.08, 0.28],
    [-0.28, -0.08]
  ];

  return DEEP_CITY_CENTERS.flatMap((center) =>
    offsets.map(([latOffset, lonOffset], index) => ({
      ...center,
      id: `${center.id}:cloud-${index.toString().padStart(2, "0")}`,
      label: `${center.label} cloud ${index + 1}`,
      lat: clamp(center.lat + latOffset, -89.999, 89.999),
      lon: wrapLon(center.lon + lonOffset),
      source: "city-cloud"
    }))
  );
}

function globalRasterPoints(): FixturePoint[] {
  const points: FixturePoint[] = [];
  const rows = 100;
  const cols = 100;
  for (let row = 0; row < rows; row += 1) {
    const lat = -89.1 + row * 1.8;
    for (let col = 0; col < cols; col += 1) {
      const lon = -178.2 + col * 3.6;
      points.push({
        id: `raster-${row.toString().padStart(3, "0")}-${col.toString().padStart(3, "0")}`,
        category: "country",
        label: `Global raster ${row + 1}/${col + 1}`,
        lat: Number(lat.toFixed(6)),
        lon: Number(lon.toFixed(6)),
        source: "global-raster"
      });
    }
  }
  return points;
}

function cityPoint(
  id: string,
  label: string,
  lat: number,
  lon: number,
  territory: string | undefined,
  source: string,
  category: FixturePoint["category"] = "near-capital"
): FixturePoint {
  return { id, category, label, lat, lon, territory, source };
}

function oceanPoint(id: string, label: string, lat: number, lon: number): FixturePoint {
  return { id, category: "ocean", label, lat, lon, source: "ocean-sweep" };
}

function clamp(value: number, min: number, max: number): number {
  return Number(Math.min(max, Math.max(min, value)).toFixed(6));
}

function wrapLon(value: number): number {
  const normalized = ((((value + 180) % 360) + 360) % 360) - 180;
  return Number(normalized.toFixed(6));
}
