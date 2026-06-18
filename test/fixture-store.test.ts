import { loadFixtureSet, expandFixtureCases, resolveFixtureSet } from "../src/coordinator/fixture-store";

describe("fixture-store", () => {
  it("loads the pinned starter fixture set", async () => {
    const set = await loadFixtureSet("fixtures/fixture-set.json");
    expect(set.seed).toBe(20260617);
    expect(set.points.some((point) => point.id === "capital-nld-amsterdam")).toBe(true);
  });

  it("expands fixtures and static contract cases deterministically", async () => {
    const set = await loadFixtureSet("fixtures/fixture-set.json");
    const first = expandFixtureCases(set, "Fast").map((item) => item.id);
    const second = expandFixtureCases(set, "Fast").map((item) => item.id);
    expect(first).toEqual(second);
    expect(first).toContain("version-json");
  });

  it("builds the fast profile from curated land, city, pole, and ocean points", async () => {
    const set = await loadFixtureSet("fixtures/fixture-set.json");
    const fastSet = resolveFixtureSet(set, "Fast");

    expect(fastSet.points.length).toBeGreaterThanOrEqual(35);
    expect(fastSet.points.length).toBeLessThanOrEqual(45);
    expect(fastSet.points.filter((point) => point.category === "ocean")).toHaveLength(10);
    expect(fastSet.points.some((point) => point.label.includes("Amsterdam"))).toBe(true);
    expect(fastSet.points.some((point) => point.label.includes("Nairobi"))).toBe(true);
    expect(fastSet.points.some((point) => point.label.includes("New York"))).toBe(true);
    expect(fastSet.points.some((point) => point.label.includes("Mexico City"))).toBe(true);
    expect(fastSet.points.some((point) => point.label.includes("Buenos Aires"))).toBe(true);
    expect(fastSet.points.some((point) => point.label.includes("Hawaii"))).toBe(true);
    expect(fastSet.points.some((point) => point.lat > 0)).toBe(true);
    expect(fastSet.points.some((point) => point.lat < 0)).toBe(true);
    expect(fastSet.points.some((point) => point.lon > 0)).toBe(true);
    expect(fastSet.points.some((point) => point.lon < 0)).toBe(true);
  });

  it("builds the deep profile with deterministic city clouds and a global raster", async () => {
    const set = await loadFixtureSet("fixtures/fixture-set.json");
    const deepSet = resolveFixtureSet(set, "Deep");
    const again = resolveFixtureSet(set, "Deep");

    expect(deepSet.points.map((point) => point.id)).toEqual(again.points.map((point) => point.id));
    expect(deepSet.points.filter((point) => point.source === "global-raster")).toHaveLength(10_000);
    expect(deepSet.points.filter((point) => point.source === "city-cloud").length).toBeGreaterThanOrEqual(300);
    expect(deepSet.points.some((point) => point.label.includes("Shanghai"))).toBe(true);
    expect(deepSet.points.some((point) => point.label.includes("Antarctica"))).toBe(true);
    expect(deepSet.points.some((point) => point.lat > 80)).toBe(true);
    expect(deepSet.points.some((point) => point.lat < -80)).toBe(true);
  });

  it("jitters global raster points within their deterministic cells", async () => {
    const set = await loadFixtureSet("fixtures/fixture-set.json");
    const rasterPoints = resolveFixtureSet(set, "Deep").points.filter((point) => point.source === "global-raster");
    const firstRowLatitudes = new Set(
      rasterPoints.filter((point) => point.id.startsWith("raster-000-")).map((point) => point.lat)
    );
    const firstColumnLongitudes = new Set(
      rasterPoints.filter((point) => point.id.endsWith("-000")).map((point) => point.lon)
    );

    expect(firstRowLatitudes.size).toBeGreaterThan(50);
    expect(firstColumnLongitudes.size).toBeGreaterThan(50);
    expect(rasterPoints.find((point) => point.id === "raster-000-000")).toMatchObject({
      lat: expect.any(Number),
      lon: expect.any(Number)
    });
  });

  it("generates requests for every visible deep map point", async () => {
    const set = await loadFixtureSet("fixtures/fixture-set.json");
    const deepSet = resolveFixtureSet(set, "Deep");
    const requestedFixtureIds = new Set(expandFixtureCases(set, "Deep").flatMap((item) => (item.fixtureId ? [item.fixtureId] : [])));
    const visibleMapPointIds = deepSet.points.filter((point) => point.source !== "global-raster").map((point) => point.id);

    expect(visibleMapPointIds.length).toBeGreaterThan(300);
    expect(visibleMapPointIds.filter((id) => !requestedFixtureIds.has(id))).toEqual([]);
  });
});
