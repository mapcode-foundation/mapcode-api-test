# Mapcode API Parity Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-first local dashboard that compares the Java mapcode REST service against the TypeScript port, shows live parity progress, and emits AI-ready discrepancy reports.

**Architecture:** A TypeScript monorepo-style app with shared domain types, a Node coordinator server, and a Vite React browser UI. The coordinator manages or attaches to services, expands pinned fixtures into API request cases, canonicalizes JSON/XML, compares Java and TypeScript semantics, streams live events over SSE, and writes redacted reports.

**Tech Stack:** Node.js 20+, TypeScript, Vite, React, Vitest, Playwright, Express, Server-Sent Events, `fast-xml-parser`, `zod`, `dotenv`, `@tomtom-org/maps-sdk`.

---

## Execution Notes

- Do not implement on `main`. Before Task 1, create an isolated worktree or switch to a feature branch named `codex/mapcode-api-parity-dashboard`.
- Do not push without explicit approval.
- Do not modify sibling repositories except by running their services or reading their source/tests.
- If multiple workers are used, workers are not alone in the codebase. They must not revert edits made by others and must adapt to existing changes.
- Commit after each task when tests for that task pass.
- The approved design spec is `docs/superpowers/specs/2026-06-17-mapcode-api-parity-dashboard-design.md`.

## File Structure

Create or modify these paths:

- `package.json`: scripts, dependencies, dev dependencies.
- `tsconfig.json`: shared TypeScript config.
- `vite.config.ts`: UI dev/build config.
- `vitest.config.ts`: unit/integration test config.
- `playwright.config.ts`: browser test config.
- `src/shared/types.ts`: shared request, fixture, canonical payload, diff, event, and report types.
- `src/shared/profiles.ts`: `Fast`, `Deep`, and `Custom` profile constants.
- `src/shared/distance.ts`: geodesic distance in meters for round-trip tolerance.
- `src/coordinator/canonicalizer.ts`: JSON/XML canonical parsing.
- `src/coordinator/comparator.ts`: semantic parity comparison.
- `src/coordinator/api-catalog.ts`: Java-derived endpoint catalog and case expansion.
- `src/coordinator/fixture-store.ts`: pinned fixture loading and profile expansion.
- `src/coordinator/http-client.ts`: paired API HTTP calls with format handling.
- `src/coordinator/service-manager.ts`: managed/attached Java and TypeScript service readiness/log lifecycle.
- `src/coordinator/runner.ts`: run scheduler, pause/resume/stop, event emission.
- `src/coordinator/reporter.ts`: redacted `report.md` and `report.json` writer.
- `src/coordinator/server.ts`: Express app, REST endpoints, SSE stream, static UI serving.
- `src/coordinator/index.ts`: CLI entry point to launch the local coordinator/dashboard.
- `src/ui/main.tsx`: React entry.
- `src/ui/index.html`: Vite HTML entry.
- `src/ui/App.tsx`: dashboard shell and state orchestration.
- `src/ui/api.ts`: UI client for coordinator REST/SSE endpoints.
- `src/ui/components/*.tsx`: setup form, run summary, coverage map/table, service panes, discrepancy list/detail.
- `src/ui/styles.css`: dashboard styling.
- `fixtures/fixture-set.json`: pinned starter fixture set.
- `test/fixtures/inject.ts`: Express test injection helper.
- `test/fixtures/*.ts`: test helpers and mocked services.
- `test/**/*.test.ts`: unit and integration tests.
- `tests/e2e/dashboard.spec.ts`: Playwright UI smoke tests.
- `README.md`: local setup, `.env`, run commands, report format.

## Task 1: Scaffold TypeScript Workspace

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `src/shared/types.ts`
- Create: `src/coordinator/index.ts`
- Create: `src/ui/index.html`
- Create: `src/ui/main.tsx`
- Create: `src/ui/App.tsx`
- Create: `src/ui/styles.css`
- Create: `test/scaffold.test.ts`
- Modify: `README.md`

- [ ] **Step 1: Create package and toolchain files**

Create `package.json` with these scripts and dependency families:

```json
{
  "name": "mapcode-api-test",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx src/coordinator/index.ts",
    "dev:ui": "vite --host 127.0.0.1",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@tomtom-org/maps-sdk": "^1.0.0",
    "@vitejs/plugin-react": "^5.0.0",
    "dotenv": "^16.4.7",
    "express": "^4.19.2",
    "fast-xml-parser": "^4.5.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@playwright/test": "^1.49.1",
    "@types/express": "^4.17.21",
    "@types/node": "^22.10.2",
    "@types/react": "^19.0.1",
    "@types/react-dom": "^19.0.2",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2",
    "vite": "^6.0.3",
    "vitest": "^2.1.8"
  }
}
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "jsx": "react-jsx",
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node", "vitest/globals"]
  },
  "include": ["src", "test", "tests", "vite.config.ts", "vitest.config.ts", "playwright.config.ts"]
}
```

Create `vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  root: "src/ui",
  build: {
    outDir: "../../dist/ui",
    emptyOutDir: true
  },
  server: {
    host: "127.0.0.1",
    port: 5173
  }
});
```

Create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
    coverage: {
      reporter: ["text", "json-summary"]
    }
  }
});
```

Create `playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry"
  },
  webServer: {
    command: "npm run build && npm run dev -- --port 4173 --no-open",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: true,
    timeout: 120_000
  }
});
```

- [ ] **Step 2: Add initial shared types**

Create `src/shared/types.ts`:

```ts
export type ApiFormat = "json" | "xml";
export type HttpMethod = "GET";
export type RunProfileName = "Fast" | "Deep" | "Custom";
export type PointState = "queued" | "active" | "passed" | "failed" | "blocked";
export type ServiceKind = "java" | "typescript";

export interface FixturePoint {
  id: string;
  category: "capital" | "near-capital" | "country" | "ocean" | "pole" | "contract";
  label: string;
  lat: number;
  lon: number;
  territory?: string;
  source: string;
}

export interface RequestCase {
  id: string;
  fixtureId?: string;
  method: HttpMethod;
  path: string;
  query?: Record<string, string>;
  format: ApiFormat;
  expectation: "parity" | "version-shape" | "roundtrip" | "contract-error";
}

export interface ServiceResponse {
  service: ServiceKind;
  status: number;
  contentType: string;
  body: string;
  canonical?: CanonicalValue;
}

export type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

export interface SemanticDiff {
  path: string;
  expected: CanonicalValue | undefined;
  actual: CanonicalValue | undefined;
  message: string;
}

export interface Discrepancy {
  id: string;
  caseId: string;
  fixtureId?: string;
  endpoint: string;
  format: ApiFormat;
  status: "discrepancy" | "oracle-error" | "infrastructure-error";
  summary: string;
  diffs: SemanticDiff[];
  java: ServiceResponse;
  typescript: ServiceResponse;
  replay: string;
  logExcerpt?: string[];
}

export interface RunSummary {
  runId: string;
  profile: RunProfileName;
  seed: number;
  totalCases: number;
  completedCases: number;
  failures: number;
  roundTrips: number;
  maxDriftMeters: number;
}

export type RunnerEvent =
  | { type: "run-summary"; summary: RunSummary }
  | { type: "point-state"; fixtureId: string; state: PointState }
  | { type: "current-case"; java?: ServiceResponse; typescript?: ServiceResponse; request: RequestCase }
  | { type: "discrepancy"; discrepancy: Discrepancy }
  | { type: "service-log"; service: ServiceKind; line: string }
  | { type: "run-complete"; summary: RunSummary };
```

- [ ] **Step 3: Add minimal coordinator and UI entry files**

Create `src/coordinator/index.ts`:

```ts
import express from "express";

const app = express();
const portArgIndex = process.argv.indexOf("--port");
const port = portArgIndex >= 0 ? Number(process.argv[portArgIndex + 1]) : 4173;

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.listen(port, "127.0.0.1", () => {
  console.log(`Mapcode API parity dashboard listening at http://127.0.0.1:${port}`);
});
```

Create `src/ui/main.tsx`:

```tsx
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Create `src/ui/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mapcode REST Parity Runner</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
```

Create `src/ui/App.tsx`:

```tsx
export function App() {
  return (
    <main className="app-shell">
      <h1>Mapcode REST Parity Runner</h1>
      <p>Coordinator connected. Use the profile selector and run controls to start a parity run.</p>
    </main>
  );
}
```

Create `test/scaffold.test.ts`:

```ts
describe("scaffold", () => {
  it("runs the initial test harness", () => {
    expect(true).toBe(true);
  });
});
```

Create `src/ui/styles.css`:

```css
body {
  margin: 0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #17212b;
  background: #f4f6f8;
}

.app-shell {
  padding: 24px;
}
```

- [ ] **Step 4: Update README with setup commands**

Modify `README.md`:

```md
# Mapcode API Test

Browser-first local parity dashboard for comparing `../mapcode-rest-service` with `../mapcode-rest-service-ts`.

## Setup

```bash
npm install
cp .env.example .env
```

Optional map preview:

```dotenv
TOMTOM_API_KEY=your-key
```

## Run

```bash
npm run dev
```

## Verify

```bash
npm run lint
npm test
```
```

- [ ] **Step 5: Install dependencies**

Run:

```bash
npm install
```

Expected: `package-lock.json` is created and dependencies install successfully.

- [ ] **Step 6: Verify scaffold**

Run:

```bash
npm run lint
npm test
```

Expected: TypeScript passes and the scaffold test passes.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts vitest.config.ts playwright.config.ts src README.md test/scaffold.test.ts
git commit -m "feat: scaffold parity dashboard app"
```

## Task 2: Shared Profiles, Fixtures, Canonicalizer, Comparator

**Files:**
- Create: `src/shared/profiles.ts`
- Create: `src/shared/distance.ts`
- Create: `src/coordinator/canonicalizer.ts`
- Create: `src/coordinator/comparator.ts`
- Create: `fixtures/fixture-set.json`
- Create: `test/canonicalizer.test.ts`
- Create: `test/comparator.test.ts`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Write canonicalizer tests**

Create `test/canonicalizer.test.ts`:

```ts
import { canonicalizeBody } from "../src/coordinator/canonicalizer";

describe("canonicalizeBody", () => {
  it("sorts JSON object keys while preserving array order", () => {
    expect(canonicalizeBody('{"b":2,"a":[{"d":4,"c":3}]}', "json")).toEqual({
      a: [{ c: 3, d: 4 }],
      b: 2
    });
  });

  it("converts XML into a canonical object and preserves repeated elements as arrays", () => {
    const xml = '<?xml version="1.0"?><mapcodes><mapcode><mapcode>ABC.12</mapcode></mapcode><mapcode><mapcode>DEF.34</mapcode></mapcode></mapcodes>';
    expect(canonicalizeBody(xml, "xml")).toEqual({
      mapcodes: {
        mapcode: [{ mapcode: "ABC.12" }, { mapcode: "DEF.34" }]
      }
    });
  });
});
```

- [ ] **Step 2: Implement canonicalizer**

Create `src/coordinator/canonicalizer.ts`:

```ts
import { XMLParser } from "fast-xml-parser";
import type { ApiFormat, CanonicalValue } from "../shared/types";

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  textNodeName: "#text",
  parseTagValue: true,
  trimValues: true,
  isArray: (_name, jpath) => jpath.endsWith(".mapcode")
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
```

- [ ] **Step 3: Write comparator tests**

Create `test/comparator.test.ts`:

```ts
import { compareCanonical, compareResponses, roundTripWithinTolerance } from "../src/coordinator/comparator";
import type { ServiceResponse } from "../src/shared/types";

function response(service: "java" | "typescript", canonical: unknown, status = 200): ServiceResponse {
  return {
    service,
    status,
    contentType: "application/json",
    body: JSON.stringify(canonical),
    canonical: canonical as never
  };
}

describe("compareCanonical", () => {
  it("returns no diffs for equal semantic payloads", () => {
    expect(compareCanonical({ a: [{ b: 1 }] }, { a: [{ b: 1 }] })).toEqual([]);
  });

  it("reports path-level value differences", () => {
    expect(compareCanonical({ mapcodes: [{ territory: "NLD" }] }, { mapcodes: [{ territory: "AAA" }] })).toEqual([
      {
        path: "$.mapcodes[0].territory",
        expected: "NLD",
        actual: "AAA",
        message: "Expected Java value to match TypeScript value"
      }
    ]);
  });
});

describe("compareResponses", () => {
  it("allows /mapcode/version value differences but still requires object shape", () => {
    const diffs = compareResponses(
      response("java", { version: "2.4.19.2" }),
      response("typescript", { version: "0.1.0" }),
      "/mapcode/version"
    );
    expect(diffs).toEqual([]);
  });

  it("requires matching status codes", () => {
    const diffs = compareResponses(response("java", {}, 403), response("typescript", {}, 404), "/mapcode/codes");
    expect(diffs[0].path).toBe("$.status");
  });
});

describe("roundTripWithinTolerance", () => {
  it("passes when both decoded points are within 10 meters", () => {
    expect(roundTripWithinTolerance({ lat: 52, lon: 5 }, { lat: 52.00001, lon: 5 }, { lat: 52.00002, lon: 5 }, 10).ok).toBe(true);
  });
});
```

- [ ] **Step 4: Implement comparator and distance**

Create `src/shared/distance.ts`:

```ts
export interface LatLon {
  lat: number;
  lon: number;
}

export function distanceMeters(a: LatLon, b: LatLon): number {
  const radiusMeters = 6_371_000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * radiusMeters * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}
```

Create `src/coordinator/comparator.ts`:

```ts
import { distanceMeters, type LatLon } from "../shared/distance";
import type { CanonicalValue, SemanticDiff, ServiceResponse } from "../shared/types";

export function compareResponses(java: ServiceResponse, typescript: ServiceResponse, path: string): SemanticDiff[] {
  const diffs: SemanticDiff[] = [];
  if (java.status !== typescript.status) {
    diffs.push({ path: "$.status", expected: java.status, actual: typescript.status, message: "Expected HTTP status codes to match" });
  }
  if (path === "/mapcode/version") {
    return diffs.concat(compareVersionShape(java.canonical, typescript.canonical));
  }
  return diffs.concat(compareCanonical(java.canonical ?? null, typescript.canonical ?? null));
}

export function compareCanonical(expected: CanonicalValue | undefined, actual: CanonicalValue | undefined, path = "$"): SemanticDiff[] {
  if (JSON.stringify(expected) === JSON.stringify(actual)) return [];
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const diffs: SemanticDiff[] = [];
    const max = Math.max(expected.length, actual.length);
    for (let i = 0; i < max; i += 1) diffs.push(...compareCanonical(expected[i], actual[i], `${path}[${i}]`));
    return diffs;
  }
  if (isRecord(expected) && isRecord(actual)) {
    const diffs: SemanticDiff[] = [];
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
    for (const key of keys) diffs.push(...compareCanonical(expected[key], actual[key], `${path}.${key}`));
    return diffs;
  }
  return [{ path, expected, actual, message: "Expected Java value to match TypeScript value" }];
}

export function roundTripWithinTolerance(original: LatLon, javaDecoded: LatLon, tsDecoded: LatLon, toleranceMeters: number) {
  const javaDrift = distanceMeters(original, javaDecoded);
  const tsDrift = distanceMeters(original, tsDecoded);
  const serviceDrift = distanceMeters(javaDecoded, tsDecoded);
  return {
    ok: javaDrift <= toleranceMeters && tsDrift <= toleranceMeters && serviceDrift <= toleranceMeters,
    javaDrift,
    tsDrift,
    serviceDrift
  };
}

function compareVersionShape(expected: CanonicalValue | undefined, actual: CanonicalValue | undefined): SemanticDiff[] {
  if (isRecord(expected) && isRecord(actual) && "version" in expected && "version" in actual) return [];
  return [{ path: "$.version", expected, actual, message: "Expected both version responses to contain a version field" }];
}

function isRecord(value: unknown): value is Record<string, CanonicalValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
```

- [ ] **Step 5: Add profiles and starter fixture set**

Create `src/shared/profiles.ts`:

```ts
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
  Deep: { name: "Deep", maxCapitalPoints: Number.POSITIVE_INFINITY, maxCountryPoints: Number.POSITIVE_INFINITY, maxOceanPoints: Number.POSITIVE_INFINITY, includeRoundTrips: true },
  Custom: { name: "Custom", maxCapitalPoints: 25, maxCountryPoints: 50, maxOceanPoints: 16, includeRoundTrips: true }
};
```

Create `fixtures/fixture-set.json` with a starter set:

```json
{
  "id": "starter-20260617",
  "seed": 20260617,
  "source": "hand-curated starter set for MVP; generator version starter-1",
  "points": [
    { "id": "capital-nld-amsterdam", "category": "capital", "label": "Amsterdam, NLD", "lat": 52.376514, "lon": 4.908543, "territory": "NLD", "source": "capital" },
    { "id": "capital-lux-luxembourg", "category": "capital", "label": "Luxembourg, LUX", "lat": 49.611622, "lon": 6.131935, "territory": "LUX", "source": "capital" },
    { "id": "country-nld-sample", "category": "country", "label": "Netherlands sample", "lat": 52.159853, "lon": 4.49979, "territory": "NLD", "source": "country-sample" },
    { "id": "ocean-atlantic-mid", "category": "ocean", "label": "Atlantic sample", "lat": 0, "lon": -30, "source": "ocean-sweep" },
    { "id": "pole-north", "category": "pole", "label": "North Pole", "lat": 90, "lon": 0, "source": "edge" },
    { "id": "pole-south", "category": "pole", "label": "South Pole", "lat": -90, "lon": 0, "source": "edge" }
  ]
}
```

- [ ] **Step 6: Run core tests**

Run:

```bash
npm test -- canonicalizer comparator
```

Expected: all canonicalizer and comparator tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/shared src/coordinator/canonicalizer.ts src/coordinator/comparator.ts fixtures test/canonicalizer.test.ts test/comparator.test.ts
git commit -m "feat: add canonical parity core"
```

## Task 3: API Catalog And Fixture Expansion

**Files:**
- Create: `src/coordinator/api-catalog.ts`
- Create: `src/coordinator/fixture-store.ts`
- Create: `test/api-catalog.test.ts`
- Create: `test/fixture-store.test.ts`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Write API catalog tests**

Create `test/api-catalog.test.ts`:

```ts
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
  it("contains all Java-derived endpoint families", () => {
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
```

- [ ] **Step 2: Implement API catalog**

Create `src/coordinator/api-catalog.ts`:

```ts
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
    cases.push({ id: `${point.id}:codes-mapcodes:${format}`, fixtureId: point.id, method: "GET", path: `/mapcode/codes/${latLon}/mapcodes`, format, expectation: "parity" });
    cases.push({ id: `${point.id}:codes-international:${format}`, fixtureId: point.id, method: "GET", path: `/mapcode/codes/${latLon}/international`, format, expectation: "parity" });
    cases.push({ id: `${point.id}:codes-territories:${format}`, fixtureId: point.id, method: "GET", path: `/mapcode/codes/${latLon}/territories`, format, expectation: "parity" });
  }
  if (profile === "Deep") {
    for (const precision of ["0", "1", "8"]) {
      cases.push({ id: `${point.id}:codes-precision-${precision}`, fixtureId: point.id, method: "GET", path: `/mapcode/codes/${latLon}`, query: { precision, include: "territory,alphabet,rectangle" }, format: "json", expectation: "parity" });
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
```

- [ ] **Step 3: Write fixture store tests**

Create `test/fixture-store.test.ts`:

```ts
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
```

- [ ] **Step 4: Implement fixture store**

Create `src/coordinator/fixture-store.ts`:

```ts
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
```

- [ ] **Step 5: Run catalog tests**

Run:

```bash
npm test -- api-catalog fixture-store
```

Expected: catalog and fixture store tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/coordinator/api-catalog.ts src/coordinator/fixture-store.ts fixtures/fixture-set.json test/api-catalog.test.ts test/fixture-store.test.ts
git commit -m "feat: add API catalog and fixture expansion"
```

## Task 4: HTTP Client And Service Manager

**Files:**
- Create: `src/coordinator/http-client.ts`
- Create: `src/coordinator/service-manager.ts`
- Create: `test/http-client.test.ts`
- Create: `test/service-manager.test.ts`
- Create: `test/fixtures/mock-service.ts`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Add mock service helper**

Create `test/fixtures/mock-service.ts`:

```ts
import express from "express";
import type { Server } from "node:http";

export interface MockService {
  baseUrl: string;
  close: () => Promise<void>;
}

export async function startMockService(routes: Record<string, { status: number; body: string; contentType?: string }>): Promise<MockService> {
  const app = express();
  for (const [path, response] of Object.entries(routes)) {
    app.get(path, (_req, res) => {
      res.status(response.status).type(response.contentType ?? "application/json").send(response.body);
    });
  }
  const server = await new Promise<Server>((resolve) => {
    const started = app.listen(0, "127.0.0.1", () => resolve(started));
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Mock service did not bind to a TCP port");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}
```

- [ ] **Step 2: Write HTTP client tests**

Create `test/http-client.test.ts`:

```ts
import { fetchService } from "../src/coordinator/http-client";
import { startMockService } from "./fixtures/mock-service";

describe("fetchService", () => {
  it("sets Accept for JSON and canonicalizes the response", async () => {
    const service = await startMockService({ "/mapcode/version": { status: 200, body: '{"version":"1"}' } });
    try {
      const response = await fetchService("java", service.baseUrl, { id: "version", method: "GET", path: "/mapcode/version", format: "json", expectation: "version-shape" });
      expect(response.status).toBe(200);
      expect(response.canonical).toEqual({ version: "1" });
    } finally {
      await service.close();
    }
  });
});
```

- [ ] **Step 3: Implement HTTP client**

Create `src/coordinator/http-client.ts`:

```ts
import { canonicalizeBody } from "./canonicalizer";
import type { RequestCase, ServiceKind, ServiceResponse } from "../shared/types";

export async function fetchService(service: ServiceKind, baseUrl: string, request: RequestCase): Promise<ServiceResponse> {
  const url = new URL(request.path, baseUrl);
  for (const [key, value] of Object.entries(request.query ?? {})) url.searchParams.set(key, value);
  const accept = request.format === "json" ? "application/json" : "application/xml";
  const response = await fetch(url, { method: request.method, headers: { Accept: accept } });
  const body = await response.text();
  return {
    service,
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    body,
    canonical: canonicalizeBody(body, request.format)
  };
}
```

- [ ] **Step 4: Write service manager tests**

Create `test/service-manager.test.ts`:

```ts
import { createAttachedServiceManager } from "../src/coordinator/service-manager";
import { startMockService } from "./fixtures/mock-service";

describe("service-manager", () => {
  it("validates attached services by calling /mapcode/status", async () => {
    const service = await startMockService({ "/mapcode/status": { status: 200, body: "" } });
    try {
      const manager = createAttachedServiceManager({ javaBaseUrl: service.baseUrl, typescriptBaseUrl: service.baseUrl });
      await expect(manager.waitUntilReady()).resolves.toEqual({ javaReady: true, typescriptReady: true });
    } finally {
      await service.close();
    }
  });
});
```

- [ ] **Step 5: Implement attached service manager and managed skeleton**

Create `src/coordinator/service-manager.ts`:

```ts
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

export interface ServiceManager {
  javaBaseUrl: string;
  typescriptBaseUrl: string;
  logs: string[];
  waitUntilReady(): Promise<{ javaReady: boolean; typescriptReady: boolean }>;
  stop(): Promise<void>;
}

export function createAttachedServiceManager(input: { javaBaseUrl: string; typescriptBaseUrl: string }): ServiceManager {
  return {
    javaBaseUrl: input.javaBaseUrl,
    typescriptBaseUrl: input.typescriptBaseUrl,
    logs: [],
    async waitUntilReady() {
      const [javaReady, typescriptReady] = await Promise.all([isReady(input.javaBaseUrl), isReady(input.typescriptBaseUrl)]);
      return { javaReady, typescriptReady };
    },
    async stop() {
      return undefined;
    }
  };
}

export function createManagedServiceManager(input: {
  javaCommand: string;
  javaArgs: string[];
  javaBaseUrl: string;
  typescriptCommand: string;
  typescriptArgs: string[];
  typescriptBaseUrl: string;
}): ServiceManager {
  const logs: string[] = [];
  const children: ChildProcessWithoutNullStreams[] = [
    spawn(input.javaCommand, input.javaArgs, { cwd: "../mapcode-rest-service" }),
    spawn(input.typescriptCommand, input.typescriptArgs, { cwd: "../mapcode-rest-service-ts" })
  ];
  for (const child of children) {
    child.stdout.on("data", (chunk) => logs.push(String(chunk).trim()));
    child.stderr.on("data", (chunk) => logs.push(String(chunk).trim()));
  }
  return {
    javaBaseUrl: input.javaBaseUrl,
    typescriptBaseUrl: input.typescriptBaseUrl,
    logs,
    async waitUntilReady() {
      const [javaReady, typescriptReady] = await Promise.all([waitForReady(input.javaBaseUrl), waitForReady(input.typescriptBaseUrl)]);
      return { javaReady, typescriptReady };
    },
    async stop() {
      for (const child of children) child.kill("SIGTERM");
    }
  };
}

async function isReady(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(new URL("/mapcode/status", baseUrl));
    return response.status === 200;
  } catch {
    return false;
  }
}

async function waitForReady(baseUrl: string): Promise<boolean> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await isReady(baseUrl)) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}
```

- [ ] **Step 6: Run tests**

Run:

```bash
npm test -- http-client service-manager
```

Expected: HTTP client and service manager tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/coordinator/http-client.ts src/coordinator/service-manager.ts test/http-client.test.ts test/service-manager.test.ts test/fixtures/mock-service.ts
git commit -m "feat: add service HTTP and lifecycle helpers"
```

## Task 5: Runner And Event Stream

**Files:**
- Create: `src/coordinator/runner.ts`
- Create: `test/runner.test.ts`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Write runner tests**

Create `test/runner.test.ts`:

```ts
import { Runner } from "../src/coordinator/runner";
import type { RequestCase, ServiceResponse } from "../src/shared/types";

const request: RequestCase = { id: "version-json", method: "GET", path: "/mapcode/version", format: "json", expectation: "version-shape" };

function response(service: "java" | "typescript", version: string): ServiceResponse {
  return { service, status: 200, contentType: "application/json", body: `{"version":"${version}"}`, canonical: { version } };
}

describe("Runner", () => {
  it("emits summary, current case, and completion events", async () => {
    const events: string[] = [];
    const runner = new Runner({
      javaBaseUrl: "http://java.test",
      typescriptBaseUrl: "http://ts.test",
      cases: [request],
      fetchPair: async () => ({ java: response("java", "1"), typescript: response("typescript", "2") })
    });
    runner.onEvent((event) => events.push(event.type));
    await runner.start();
    expect(events).toContain("run-summary");
    expect(events).toContain("current-case");
    expect(events).toContain("run-complete");
  });

  it("records discrepancies when semantic payloads differ", async () => {
    const runner = new Runner({
      javaBaseUrl: "http://java.test",
      typescriptBaseUrl: "http://ts.test",
      cases: [{ ...request, path: "/mapcode/alphabets/GREEK", expectation: "parity" }],
      fetchPair: async () => ({ java: response("java", "one"), typescript: response("typescript", "two") })
    });
    const discrepancies: string[] = [];
    runner.onEvent((event) => {
      if (event.type === "discrepancy") discrepancies.push(event.discrepancy.summary);
    });
    await runner.start();
    expect(discrepancies).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Implement runner**

Create `src/coordinator/runner.ts`:

```ts
import { compareResponses } from "./comparator";
import { fetchService } from "./http-client";
import type { Discrepancy, RequestCase, RunnerEvent, RunSummary, ServiceResponse } from "../shared/types";

export interface RunnerInput {
  javaBaseUrl: string;
  typescriptBaseUrl: string;
  cases: RequestCase[];
  fetchPair?: (request: RequestCase) => Promise<{ java: ServiceResponse; typescript: ServiceResponse }>;
}

export class Runner {
  private listeners = new Set<(event: RunnerEvent) => void>();
  private paused = false;
  private stopped = false;
  private summary: RunSummary;
  private fetchPair: (request: RequestCase) => Promise<{ java: ServiceResponse; typescript: ServiceResponse }>;

  constructor(private readonly input: RunnerInput) {
    this.summary = {
      runId: `run-${Date.now()}`,
      profile: "Fast",
      seed: 20260617,
      totalCases: input.cases.length,
      completedCases: 0,
      failures: 0,
      roundTrips: 0,
      maxDriftMeters: 0
    };
    this.fetchPair =
      input.fetchPair ??
      ((request) =>
        Promise.all([
          fetchService("java", input.javaBaseUrl, request),
          fetchService("typescript", input.typescriptBaseUrl, request)
        ]).then(([java, typescript]) => ({ java, typescript })));
  }

  onEvent(listener: (event: RunnerEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  stop(): void {
    this.stopped = true;
  }

  async start(): Promise<RunSummary> {
    this.emit({ type: "run-summary", summary: this.summary });
    for (const request of this.input.cases) {
      if (this.stopped) break;
      while (this.paused) await new Promise((resolve) => setTimeout(resolve, 100));
      if (request.fixtureId) this.emit({ type: "point-state", fixtureId: request.fixtureId, state: "active" });
      const { java, typescript } = await this.fetchPair(request);
      this.emit({ type: "current-case", request, java, typescript });
      const diffs = compareResponses(java, typescript, request.path);
      if (diffs.length > 0) {
        this.summary.failures += 1;
        const discrepancy: Discrepancy = {
          id: `${request.id}:discrepancy`,
          caseId: request.id,
          fixtureId: request.fixtureId,
          endpoint: request.path,
          format: request.format,
          status: "discrepancy",
          summary: `${request.path} differs for ${request.format}`,
          diffs,
          java,
          typescript,
          replay: `${request.method} ${request.path}`
        };
        this.emit({ type: "discrepancy", discrepancy });
        if (request.fixtureId) this.emit({ type: "point-state", fixtureId: request.fixtureId, state: "failed" });
      } else if (request.fixtureId) {
        this.emit({ type: "point-state", fixtureId: request.fixtureId, state: "passed" });
      }
      this.summary.completedCases += 1;
      this.emit({ type: "run-summary", summary: this.summary });
    }
    this.emit({ type: "run-complete", summary: this.summary });
    return this.summary;
  }

  private emit(event: RunnerEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
```

- [ ] **Step 3: Run runner tests**

Run:

```bash
npm test -- runner
```

Expected: runner tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/coordinator/runner.ts test/runner.test.ts
git commit -m "feat: add parity runner event loop"
```

## Task 6: Reports And Redaction

**Files:**
- Create: `src/coordinator/reporter.ts`
- Create: `test/reporter.test.ts`
- Modify: `src/shared/types.ts`

- [ ] **Step 1: Write reporter tests**

Create `test/reporter.test.ts`:

```ts
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { writeReports } from "../src/coordinator/reporter";
import type { Discrepancy, RunSummary } from "../src/shared/types";

const summary: RunSummary = {
  runId: "run-test",
  profile: "Fast",
  seed: 20260617,
  totalCases: 1,
  completedCases: 1,
  failures: 1,
  roundTrips: 0,
  maxDriftMeters: 0
};

const discrepancy: Discrepancy = {
  id: "d1",
  caseId: "c1",
  endpoint: "/mapcode/codes/52,5",
  format: "json",
  status: "discrepancy",
  summary: "payload differs",
  diffs: [{ path: "$.mapcodes[0].territory", expected: "NLD", actual: "AAA", message: "Expected Java value to match TypeScript value" }],
  java: { service: "java", status: 200, contentType: "application/json", body: "secret TOMTOM_API_KEY=abc", canonical: { territory: "NLD" } },
  typescript: { service: "typescript", status: 200, contentType: "application/json", body: "secret TOMTOM_API_KEY=abc", canonical: { territory: "AAA" } },
  replay: "GET /mapcode/codes/52,5"
};

describe("writeReports", () => {
  it("writes AI-ready markdown and JSON reports with secrets redacted", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mapcode-report-"));
    const result = await writeReports({ outputDir: dir, summary, discrepancies: [discrepancy], serviceVersions: { java: "2", typescript: "1" } });
    const md = await readFile(result.markdownPath, "utf8");
    const json = await readFile(result.jsonPath, "utf8");
    expect(md).toContain("payload differs");
    expect(json).toContain("$.mapcodes[0].territory");
    expect(json).not.toContain("abc");
  });
});
```

- [ ] **Step 2: Implement reporter**

Create `src/coordinator/reporter.ts`:

```ts
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Discrepancy, RunSummary } from "../shared/types";

export interface ReportInput {
  outputDir: string;
  summary: RunSummary;
  discrepancies: Discrepancy[];
  serviceVersions: { java?: string; typescript?: string };
}

export async function writeReports(input: ReportInput): Promise<{ markdownPath: string; jsonPath: string }> {
  await mkdir(input.outputDir, { recursive: true });
  const markdownPath = join(input.outputDir, `${input.summary.runId}.md`);
  const jsonPath = join(input.outputDir, `${input.summary.runId}.json`);
  const redacted = redact(input);
  await writeFile(markdownPath, renderMarkdown(redacted), "utf8");
  await writeFile(jsonPath, JSON.stringify(redacted, null, 2), "utf8");
  return { markdownPath, jsonPath };
}

function renderMarkdown(input: ReportInput): string {
  const lines = [
    `# Mapcode API Parity Report ${input.summary.runId}`,
    "",
    `Profile: ${input.summary.profile}`,
    `Seed: ${input.summary.seed}`,
    `Cases: ${input.summary.completedCases}/${input.summary.totalCases}`,
    `Failures: ${input.summary.failures}`,
    `Java version: ${input.serviceVersions.java ?? "unknown"}`,
    `TypeScript version: ${input.serviceVersions.typescript ?? "unknown"}`,
    "",
    "## Discrepancies",
    ""
  ];
  for (const item of input.discrepancies) {
    lines.push(`### ${item.id}`);
    lines.push("");
    lines.push(`- Endpoint: \`${item.endpoint}\``);
    lines.push(`- Format: \`${item.format}\``);
    lines.push(`- Summary: ${item.summary}`);
    lines.push(`- Replay: \`${item.replay}\``);
    lines.push("");
    for (const diff of item.diffs) {
      lines.push(`- ${diff.path}: expected \`${JSON.stringify(diff.expected)}\`, actual \`${JSON.stringify(diff.actual)}\``);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function redact(input: ReportInput): ReportInput {
  return JSON.parse(JSON.stringify(input).replace(/TOMTOM_API_KEY=[^"\\s]+/g, "TOMTOM_API_KEY=[REDACTED]").replace(/tomtom[^"\\s]{8,}/gi, "[REDACTED]"));
}
```

- [ ] **Step 3: Run reporter tests**

Run:

```bash
npm test -- reporter
```

Expected: reporter tests pass and generated content contains no TomTom key material.

- [ ] **Step 4: Commit**

```bash
git add src/coordinator/reporter.ts test/reporter.test.ts
git commit -m "feat: add AI-ready report writer"
```

## Task 7: Coordinator Server API

**Files:**
- Create: `src/coordinator/server.ts`
- Modify: `src/coordinator/index.ts`
- Create: `test/server.test.ts`
- Create: `test/fixtures/inject.ts`

- [ ] **Step 1: Write server tests**

Create `test/fixtures/inject.ts`:

```ts
import http from "node:http";
import type express from "express";

export async function inject(
  app: express.Express,
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<{ statusCode: number; body: string }> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("No test port");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method: init.method ?? "GET",
      headers: init.body ? { "content-type": "application/json" } : undefined,
      body: init.body ? JSON.stringify(init.body) : undefined
    });
    return { statusCode: response.status, body: await response.text() };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
```

Create `test/server.test.ts`:

```ts
import { createServerApp } from "../src/coordinator/server";
import { inject } from "./fixtures/inject";

describe("coordinator server", () => {
  it("returns config with TomTom key presence only", async () => {
    const app = createServerApp({ env: { TOMTOM_API_KEY: "secret-value" } });
    const response = await inject(app, "/api/config");
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ hasTomTomApiKey: true });
    expect(response.body).not.toContain("secret-value");
  });

  it("returns the pinned fixture set", async () => {
    const app = createServerApp({ env: {} });
    const response = await inject(app, "/api/fixtures");
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).seed).toBe(20260617);
  });
});
```

- [ ] **Step 2: Implement server**

Create `src/coordinator/server.ts`:

```ts
import express from "express";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { loadFixtureSet, expandFixtureCases } from "./fixture-store";

export interface ServerInput {
  env?: NodeJS.ProcessEnv;
}

export function createServerApp(input: ServerInput = {}) {
  loadEnv();
  const env = input.env ?? process.env;
  const app = express();
  app.use(express.json());
  const staticDir = resolve("dist/ui");
  if (existsSync(staticDir)) app.use(express.static(staticDir));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.get("/api/config", (_req, res) => res.json({ hasTomTomApiKey: Boolean(env.TOMTOM_API_KEY) }));
  app.get("/api/fixtures", async (_req, res, next) => {
    try {
      const fixtureSet = await loadFixtureSet("fixtures/fixture-set.json");
      res.json(fixtureSet);
    } catch (error) {
      next(error);
    }
  });
  app.get("/api/cases", async (req, res, next) => {
    try {
      const profile = req.query.profile === "Deep" || req.query.profile === "Custom" ? req.query.profile : "Fast";
      const fixtureSet = await loadFixtureSet("fixtures/fixture-set.json");
      res.json(expandFixtureCases(fixtureSet, profile));
    } catch (error) {
      next(error);
    }
  });
  app.get("*", (_req, res, next) => {
    const indexPath = resolve("dist/ui/index.html");
    if (existsSync(indexPath)) res.sendFile(indexPath);
    else next();
  });
  return app;
}
```

Modify `src/coordinator/index.ts`:

```ts
import { createServerApp } from "./server";

const portArgIndex = process.argv.indexOf("--port");
const noOpen = process.argv.includes("--no-open");
const port = portArgIndex >= 0 ? Number(process.argv[portArgIndex + 1]) : 4173;
const app = createServerApp();

app.listen(port, "127.0.0.1", () => {
  const url = `http://127.0.0.1:${port}`;
  console.log(`Mapcode API parity dashboard listening at ${url}`);
  if (!noOpen) console.log("Open the URL in your browser.");
});
```

- [ ] **Step 3: Run server tests**

Run:

```bash
npm test -- server
```

Expected: config, fixtures, and cases endpoints return expected JSON without secrets.

- [ ] **Step 4: Commit**

```bash
git add src/coordinator/server.ts src/coordinator/index.ts test/server.test.ts test/fixtures/inject.ts
git commit -m "feat: add coordinator server API"
```

## Task 8: Browser Dashboard UI

**Files:**
- Create: `src/ui/api.ts`
- Create: `src/ui/components/RunSummary.tsx`
- Create: `src/ui/components/ServicePane.tsx`
- Create: `src/ui/components/DiscrepancyList.tsx`
- Create: `src/ui/components/DiscrepancyDetail.tsx`
- Modify: `src/ui/App.tsx`
- Modify: `src/ui/styles.css`

- [ ] **Step 1: Add UI API helper**

Create `src/ui/api.ts`:

```ts
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
```

- [ ] **Step 2: Implement dashboard components**

Create `src/ui/components/RunSummary.tsx`:

```tsx
import type { RunSummary as RunSummaryType } from "../../shared/types";

export function RunSummary({ summary }: { summary: RunSummaryType }) {
  return (
    <section className="run-summary">
      <div className="summary-title">
        <strong>Run Summary</strong>
        <span>Seed {summary.seed} · pinned fixture set</span>
      </div>
      <Metric label="Requests" value={summary.totalCases} />
      <Metric label="Cases" value={`${summary.completedCases}/${summary.totalCases}`} />
      <Metric label="Failures" value={summary.failures} tone="fail" />
      <Metric label="Round trips" value={summary.roundTrips} />
      <Metric label="Max drift" value={`${summary.maxDriftMeters.toFixed(1)} m`} tone="warn" />
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: "fail" | "warn" }) {
  return (
    <div className="summary-item">
      <span className="label">{label}</span>
      <b className={tone ? `metric-${tone}` : undefined}>{value}</b>
    </div>
  );
}
```

Create `src/ui/components/ServicePane.tsx`:

```tsx
import type { RequestCase, ServiceResponse } from "../../shared/types";

export function ServicePane({ title, request, response }: { title: string; request?: RequestCase; response?: ServiceResponse }) {
  return (
    <article className="pane">
      <div className="pane-title">
        <h2>{title}</h2>
        <span className="pill">{response ? `${response.status} OK` : "idle"}</span>
      </div>
      <div className="request"><span>{request?.method ?? "GET"}</span> {request?.path ?? "Waiting for run"}</div>
      <pre className="response">{response?.canonical ? JSON.stringify(response.canonical, null, 2) : "{}"}</pre>
    </article>
  );
}
```

Create `src/ui/components/DiscrepancyList.tsx`:

```tsx
import type { Discrepancy } from "../../shared/types";

export function DiscrepancyList({ items, selectedId, onSelect }: { items: Discrepancy[]; selectedId?: string; onSelect: (item: Discrepancy) => void }) {
  return (
    <section className="list-panel">
      <div className="panel-head"><span>Discrepancies</span><span>{items.length}</span></div>
      <div className="failure-list">
        {items.map((item) => (
          <button key={item.id} className={`failure ${selectedId === item.id ? "selected" : ""}`} onClick={() => onSelect(item)}>
            <strong>{item.endpoint}</strong>
            <span>{item.caseId} · {item.format.toUpperCase()}</span>
            <span className="kind">{item.summary}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
```

Create `src/ui/components/DiscrepancyDetail.tsx`:

```tsx
import type { Discrepancy } from "../../shared/types";

export function DiscrepancyDetail({ item }: { item?: Discrepancy }) {
  return (
    <section className="detail-panel">
      <div className="panel-head">Selected Failure</div>
      <div className="detail-body">
        <span className="label">Canonical diff</span>
        <code>{item ? item.diffs.map((diff) => `${diff.path}: ${JSON.stringify(diff.expected)} -> ${JSON.stringify(diff.actual)}`).join("\n") : "No discrepancy selected"}</code>
        <span className="label">Reproduce</span>
        <code>{item?.replay ?? "Start a run to capture replay data."}</code>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Implement App shell**

Modify `src/ui/App.tsx` so it renders:

```tsx
import { useEffect, useMemo, useState } from "react";
import type { Discrepancy, RunSummary as RunSummaryType } from "../shared/types";
import { getCases, getConfig, getFixtures } from "./api";
import { RunSummary } from "./components/RunSummary";
import { ServicePane } from "./components/ServicePane";

const initialSummary: RunSummaryType = {
  runId: "preview",
  profile: "Fast",
  seed: 20260617,
  totalCases: 0,
  completedCases: 0,
  failures: 0,
  roundTrips: 0,
  maxDriftMeters: 0
};

export function App() {
  const [profile, setProfile] = useState<"Fast" | "Deep" | "Custom">("Fast");
  const [summary, setSummary] = useState(initialSummary);
  const [needsTomTomKey, setNeedsTomTomKey] = useState(false);
  const [discrepancies] = useState<Discrepancy[]>([]);

  useEffect(() => {
    void getConfig().then((config) => setNeedsTomTomKey(!config.hasTomTomApiKey));
    void getFixtures();
  }, []);

  useEffect(() => {
    void getCases(profile).then((cases) => setSummary((current) => ({ ...current, profile, totalCases: cases.length })));
  }, [profile]);

  const selected = useMemo(() => discrepancies[0], [discrepancies]);

  return (
    <div className="shell">
      <header><strong>Mapcode REST Parity Runner</strong><span>Java: managed · TypeScript: managed</span></header>
      <section className="toolbar">
        <label><span className="label">Profile</span><select value={profile} onChange={(event) => setProfile(event.target.value as typeof profile)}><option>Fast</option><option>Deep</option><option>Custom</option></select></label>
        <div className="progress"><div className="bar" /></div>
        <div className="controls"><button className="primary">Start</button><button>Pause</button><button>Preview map</button><button>Save report</button><button>■</button></div>
      </section>
      <main>
        <RunSummary summary={summary} />
        <section className="workspace"><ServicePane title="Java Leading API" /><ServicePane title="TypeScript Port" /></section>
      </main>
      {needsTomTomKey && <div className="modal-backdrop"><section className="modal"><h2>TomTom API key required for map preview</h2><input type="password" placeholder="Paste API key" /><button>Skip map</button><button className="primary">Save key</button></section></div>}
    </div>
  );
}
```

Render `DiscrepancyList`, `DiscrepancyDetail`, `CoverageMap`, and `TomTomKeyDialog` once their task files exist. Until Task 9 adds the map components, keep the coverage area hidden and show the run summary plus service panes.

- [ ] **Step 4: Update CSS to match approved mockup**

Move the approved mockup styling from `.superpowers/brainstorm/.../dashboard-layout.html` into `src/ui/styles.css`, adapting class names from the React components. Preserve the compact run-summary, smaller response pane font, top `Save report` button, clickable discrepancy row styling, and TomTom key modal.

- [ ] **Step 5: Run UI build**

Run:

```bash
npm run build
```

Expected: TypeScript and Vite build succeed.

- [ ] **Step 6: Commit**

```bash
git add src/ui test/ui-components.test.tsx
git commit -m "feat: add dashboard UI shell"
```

## Task 9: Coverage Map And TomTom Key Flow

**Files:**
- Create: `src/ui/components/CoverageMap.tsx`
- Create: `src/ui/components/TomTomKeyDialog.tsx`
- Modify: `src/coordinator/server.ts`
- Modify: `src/ui/App.tsx`
- Create: `test/tomtom-config.test.ts`
- Create: `tests/e2e/dashboard.spec.ts`

- [ ] **Step 1: Add key save endpoint test**

Create `test/tomtom-config.test.ts`:

```ts
import { createServerApp } from "../src/coordinator/server";
import { inject } from "./fixtures/inject";

describe("TomTom key config", () => {
  it("accepts a key without returning it", async () => {
    const app = createServerApp({ env: {} });
    const response = await inject(app, "/api/config/tomtom-key", { method: "POST", body: { key: "secret-key" } });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('{"hasTomTomApiKey":true}');
  });
});
```

- [ ] **Step 2: Implement TomTom key save behavior**

Modify `src/coordinator/server.ts`:

```ts
let runtimeTomTomApiKey: string | undefined;

app.post("/api/config/tomtom-key", (req, res) => {
  const key = typeof req.body?.key === "string" ? req.body.key.trim() : "";
  if (key.length < 8) return res.status(400).json({ error: "TomTom API key is too short" });
  runtimeTomTomApiKey = key;
  res.json({ hasTomTomApiKey: true });
});
```

Also update `/api/config` to return `Boolean(env.TOMTOM_API_KEY || runtimeTomTomApiKey)`.

- [ ] **Step 3: Implement map/table component**

Create `src/ui/components/CoverageMap.tsx`:

```tsx
import type { FixturePoint, PointState } from "../../shared/types";

export function CoverageMap({ points, states, mapEnabled }: { points: FixturePoint[]; states: Record<string, PointState>; mapEnabled: boolean }) {
  if (!mapEnabled) {
    return (
      <section className="coverage-preview">
        <div className="coverage-side">
          <h2>Fixture Table</h2>
          <table><tbody>{points.map((point) => <tr key={point.id}><td>{point.label}</td><td>{states[point.id] ?? "queued"}</td></tr>)}</tbody></table>
        </div>
      </section>
    );
  }
  return (
    <section className="coverage-preview">
      <div className="coverage-map" aria-label="Coverage map preview">
        {points.map((point) => <span key={point.id} className={`point ${states[point.id] ?? "queued"}`} title={point.label} style={{ left: `${((point.lon + 180) / 360) * 100}%`, top: `${((90 - point.lat) / 180) * 100}%` }} />)}
      </div>
      <div className="coverage-side"><h2>Fixture Map Preview</h2><p>Queued, active, passed, failed, and blocked points update as the run progresses.</p></div>
    </section>
  );
}
```

Within this component, dynamically import `@tomtom-org/maps-sdk` when `mapEnabled` is true and render the TomTom map into a `ref` container. Keep the static positioned-point preview as the fallback when SDK loading fails.

- [ ] **Step 4: Implement key dialog component**

Create `src/ui/components/TomTomKeyDialog.tsx`:

```tsx
import { useState } from "react";

export function TomTomKeyDialog({ onSaved, onSkip }: { onSaved: () => void; onSkip: () => void }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function save() {
    const response = await fetch("/api/config/tomtom-key", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key }) });
    if (!response.ok) {
      setError("Enter a valid TomTom API key or skip the map preview.");
      return;
    }
    onSaved();
  }
  return (
    <div className="modal-backdrop">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="tomtom-key-title">
        <h2 id="tomtom-key-title">TomTom API key required for map preview</h2>
        <p>No TOMTOM_API_KEY was found in .env. Enter one to enable the map, or skip to continue with the fixture table.</p>
        <input type="password" value={key} onChange={(event) => setKey(event.target.value)} placeholder="Paste API key" />
        {error && <p className="error">{error}</p>}
        <button onClick={onSkip}>Skip map</button>
        <button className="primary" onClick={save}>Save key</button>
      </section>
    </div>
  );
}
```

- [ ] **Step 5: Add Playwright smoke**

Create `tests/e2e/dashboard.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("dashboard shows profile, map preview, and report controls", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("Mapcode REST Parity Runner")).toBeVisible();
  await expect(page.getByLabel("Profile")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save report" })).toBeVisible();
});
```

- [ ] **Step 6: Run UI tests**

Run:

```bash
npm run build
npm run test:e2e
```

Expected: Vite build and Playwright smoke pass.

- [ ] **Step 7: Commit**

```bash
git add src/ui/components/CoverageMap.tsx src/ui/components/TomTomKeyDialog.tsx src/ui/App.tsx src/coordinator/server.ts test/tomtom-config.test.ts tests/e2e/dashboard.spec.ts
git commit -m "feat: add coverage map and TomTom key flow"
```

## Task 10: End-To-End Run Wiring And Documentation

**Files:**
- Modify: `src/coordinator/server.ts`
- Modify: `src/coordinator/runner.ts`
- Modify: `src/ui/api.ts`
- Modify: `src/ui/App.tsx`
- Modify: `README.md`
- Create: `test/integration-run.test.ts`

- [ ] **Step 1: Write integration run test**

Create `test/integration-run.test.ts`:

```ts
import { Runner } from "../src/coordinator/runner";
import type { RequestCase, ServiceResponse } from "../src/shared/types";

describe("integration run wiring", () => {
  it("runs a tiny parity set and produces a final summary", async () => {
    const cases: RequestCase[] = [{ id: "version-json", method: "GET", path: "/mapcode/version", format: "json", expectation: "version-shape" }];
    const runner = new Runner({
      javaBaseUrl: "http://java.test",
      typescriptBaseUrl: "http://ts.test",
      cases,
      fetchPair: async (request) => ({
        java: response("java", request, { version: "2" }),
        typescript: response("typescript", request, { version: "1" })
      })
    });
    const summary = await runner.start();
    expect(summary.completedCases).toBe(1);
    expect(summary.failures).toBe(0);
  });
});

function response(service: "java" | "typescript", _request: RequestCase, canonical: unknown): ServiceResponse {
  return { service, status: 200, contentType: "application/json", body: JSON.stringify(canonical), canonical: canonical as never };
}
```

- [ ] **Step 2: Add server run endpoints and SSE**

Modify `src/coordinator/server.ts` to add:

```ts
const sseClients = new Set<express.Response>();

app.get("/api/events", (req, res) => {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive"
  });
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

function publish(event: unknown) {
  for (const client of sseClients) client.write(`data: ${JSON.stringify(event)}\n\n`);
}
```

Add `POST /api/run/start`, `POST /api/run/pause`, `POST /api/run/resume`, `POST /api/run/stop`, and `POST /api/report/save`. Wire them to one active `Runner` instance and `writeReports`.

- [ ] **Step 3: Wire UI to run endpoints**

Modify `src/ui/api.ts`:

```ts
export async function startRun(profile: string): Promise<void> {
  await fetch("/api/run/start", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile }) });
}

export function connectEvents(onEvent: (event: unknown) => void): () => void {
  const source = new EventSource("/api/events");
  source.onmessage = (message) => onEvent(JSON.parse(message.data));
  return () => source.close();
}

export async function saveReport(): Promise<{ markdownPath: string; jsonPath: string }> {
  const response = await fetch("/api/report/save", { method: "POST" });
  return response.json();
}
```

Modify `src/ui/App.tsx` so:

- `Start` calls `startRun(profile)`.
- `Pause` calls `POST /api/run/pause`.
- `Save report` calls `saveReport()` and displays the returned paths.
- `connectEvents()` is opened in a `useEffect`.
- `run-summary` events update the summary state.
- `point-state` events update a `Record<string, PointState>`.
- `current-case` events update Java and TypeScript service panes.
- `discrepancy` events append to the discrepancy list and select the first failure automatically.

- [ ] **Step 4: Update README**

Modify `README.md` to include:

```md
## Local services

Default managed mode expects:

- Java service: `../mapcode-rest-service`
- TypeScript service: `../mapcode-rest-service-ts`

Attached mode can be configured from the dashboard with Java and TypeScript base URLs.

## Reports

Reports are written under `reports/` and ignored by git:

- `report.md` for human and AI-agent handoff.
- `report.json` for machine-readable discrepancy evidence.

Secrets, including `TOMTOM_API_KEY`, are redacted.
```

- [ ] **Step 5: Run full verification**

Run:

```bash
npm run lint
npm test
npm run build
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/coordinator src/ui README.md test/integration-run.test.ts
git commit -m "feat: wire dashboard run flow"
```

## Final Verification

- [ ] Run:

```bash
npm run lint
npm test
npm run build
```

Expected: all pass.

- [ ] If Playwright browsers are installed, run:

```bash
npm run test:e2e
```

Expected: dashboard smoke passes. If browsers are missing, document that Playwright browser installation is needed.

- [ ] Start the app:

```bash
npm run dev -- --port 4173 --no-open
```

Expected: `http://127.0.0.1:4173` responds to `/api/health`.

- [ ] Save final notes listing completed tasks, test results, known gaps, and next recommended work for deeper generated fixtures.
