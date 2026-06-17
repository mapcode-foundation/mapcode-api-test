import { canonicalizeBody } from "../src/coordinator/canonicalizer";

describe("canonicalizeBody", () => {
  it("sorts JSON object keys while preserving array order", () => {
    expect(canonicalizeBody('{"b":2,"a":[{"d":4,"c":3}]}', "json")).toEqual({
      a: [{ c: 3, d: 4 }],
      b: 2
    });
  });

  it("converts XML into a canonical object and preserves repeated elements as arrays", () => {
    const xml =
      '<?xml version="1.0"?><mapcodes><mapcode><mapcode>ABC.12</mapcode></mapcode><mapcode><mapcode>DEF.34</mapcode></mapcode></mapcodes>';

    expect(canonicalizeBody(xml, "xml")).toEqual({
      mapcodes: {
        mapcode: [{ mapcode: "ABC.12" }, { mapcode: "DEF.34" }]
      }
    });
  });

  it("returns null for empty response bodies", () => {
    expect(canonicalizeBody("  ", "json")).toBeNull();
  });
});
