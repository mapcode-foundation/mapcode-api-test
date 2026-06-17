import { XMLParser } from "fast-xml-parser";
import type { ApiFormat, CanonicalValue } from "../shared/types";

const xmlParser = new XMLParser({
  ignoreDeclaration: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  parseTagValue: true,
  trimValues: true,
  isArray: (name, jpath) => name === "mapcode" && jpath === "mapcodes.mapcode"
});

export function canonicalizeBody(body: string, format: ApiFormat): CanonicalValue {
  if (body.trim() === "") return null;

  const parsed = format === "json" ? JSON.parse(body) : xmlParser.parse(body);
  return canonicalizeValue(parsed);
}

export function canonicalizeValue(value: unknown): CanonicalValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(canonicalizeValue);
  }

  if (typeof value === "object") {
    const out: Record<string, CanonicalValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canonicalizeValue((value as Record<string, unknown>)[key]);
    }
    return out;
  }

  return String(value);
}
