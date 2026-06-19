import { API_CATALOG, expandCasesForFixture } from "../src/coordinator/api-catalog";
import type { FixturePoint } from "../src/shared/types";

const point: FixturePoint = {
  id: "capital-nld-amsterdam",
  category: "capital",
  label: "Amsterdam, NLD",
  lat: 52.376514,
  lon: 4.908543,
  territory: "NLD",
  source: "test"
};

describe("API_CATALOG", () => {
  it("contains all production endpoint families", () => {
    expect(API_CATALOG.map((item) => item.pathTemplate)).toContain("/mapcode/codes/{lat},{lon}");
    expect(API_CATALOG.map((item) => item.pathTemplate)).toContain("/mapcode/coords/{code}");
    expect(API_CATALOG.map((item) => item.pathTemplate)).toContain("/mapcode/alphabets/{alphabet}");
  });

  it("expands a fixture into encode cases for JSON and XML", () => {
    const cases = expandCasesForFixture(point, "Fast");
    expect(cases.some((item) => item.path === "/mapcode/codes/52.376514,4.908543" && item.format === "json")).toBe(true);
    expect(cases.some((item) => item.path === "/mapcode/codes/52.376514,4.908543" && item.format === "xml")).toBe(true);
  });
});
