import { loadFixtureSet, expandFixtureCases } from "../src/coordinator/fixture-store";

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
});
