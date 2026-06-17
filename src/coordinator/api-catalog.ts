import type { ApiFormat, FixturePoint, RequestCase, RunProfileName } from "../shared/types";

export interface EndpointCatalogItem {
  id: string;
  pathTemplate: string;
  formats: ApiFormat[];
  aliases: boolean;
}

export const API_CATALOG: EndpointCatalogItem[] = [
  { id: "help", pathTemplate: "/mapcode", formats: ["json"], aliases: false },
  { id: "version", pathTemplate: "/mapcode/version", formats: ["json", "xml"], aliases: true },
  { id: "status", pathTemplate: "/mapcode/status", formats: ["json", "xml"], aliases: true },
  { id: "codes-missing", pathTemplate: "/mapcode/codes", formats: ["json", "xml"], aliases: true },
  { id: "codes-default", pathTemplate: "/mapcode/codes/{lat},{lon}", formats: ["json", "xml"], aliases: true },
  { id: "codes-type", pathTemplate: "/mapcode/codes/{lat},{lon}/{type}", formats: ["json", "xml"], aliases: true },
  { id: "codes-territories", pathTemplate: "/mapcode/codes/{lat},{lon}/territories", formats: ["json", "xml"], aliases: false },
  { id: "coords-missing", pathTemplate: "/mapcode/coords", formats: ["json", "xml"], aliases: true },
  { id: "coords-code", pathTemplate: "/mapcode/coords/{code}", formats: ["json", "xml"], aliases: true },
  { id: "territories", pathTemplate: "/mapcode/territories", formats: ["json", "xml"], aliases: true },
  { id: "territory", pathTemplate: "/mapcode/territories/{territory}", formats: ["json", "xml"], aliases: true },
  { id: "alphabets", pathTemplate: "/mapcode/alphabets", formats: ["json", "xml"], aliases: true },
  { id: "alphabet", pathTemplate: "/mapcode/alphabets/{alphabet}", formats: ["json", "xml"], aliases: true }
];

export function expandCasesForFixture(point: FixturePoint, profile: RunProfileName): RequestCase[] {
  const latLon = `${point.lat},${point.lon}`;
  const formats: ApiFormat[] = ["json", "xml"];
  const cases: RequestCase[] = [];
  for (const format of formats) {
    cases.push({ id: `${point.id}:codes:${format}`, fixtureId: point.id, method: "GET", path: `/mapcode/codes/${latLon}`, format, expectation: "parity" });
    cases.push({
      id: `${point.id}:codes-mapcodes:${format}`,
      fixtureId: point.id,
      method: "GET",
      path: `/mapcode/codes/${latLon}/mapcodes`,
      format,
      expectation: "parity"
    });
    cases.push({
      id: `${point.id}:codes-international:${format}`,
      fixtureId: point.id,
      method: "GET",
      path: `/mapcode/codes/${latLon}/international`,
      format,
      expectation: "parity"
    });
    cases.push({
      id: `${point.id}:codes-territories:${format}`,
      fixtureId: point.id,
      method: "GET",
      path: `/mapcode/codes/${latLon}/territories`,
      format,
      expectation: "parity"
    });
  }
  if (profile === "Deep") {
    for (const precision of ["0", "1", "8"]) {
      cases.push({
        id: `${point.id}:codes-precision-${precision}`,
        fixtureId: point.id,
        method: "GET",
        path: `/mapcode/codes/${latLon}`,
        query: { precision, include: "territory,alphabet,rectangle" },
        format: "json",
        expectation: "parity"
      });
    }
  }
  return cases;
}

export function staticContractCases(): RequestCase[] {
  return [
    { id: "version-json", method: "GET", path: "/mapcode/version", format: "json", expectation: "version-shape" },
    { id: "version-xml", method: "GET", path: "/mapcode/version", format: "xml", expectation: "version-shape" },
    { id: "status-json", method: "GET", path: "/mapcode/status", format: "json", expectation: "parity" },
    { id: "codes-missing-json", method: "GET", path: "/mapcode/codes", format: "json", expectation: "contract-error" },
    { id: "coords-missing-json", method: "GET", path: "/mapcode/coords", format: "json", expectation: "contract-error" },
    { id: "territories-json", method: "GET", path: "/mapcode/territories", format: "json", expectation: "parity" },
    { id: "alphabets-json", method: "GET", path: "/mapcode/alphabets", format: "json", expectation: "parity" },
    { id: "alphabet-greek-json", method: "GET", path: "/mapcode/alphabets/GREEK", format: "json", expectation: "parity" }
  ];
}
