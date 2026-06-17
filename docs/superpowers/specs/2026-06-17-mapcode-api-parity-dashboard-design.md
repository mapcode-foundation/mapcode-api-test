# Mapcode API Parity Dashboard Design

Date: 2026-06-17

## Purpose

Build a browser-first local test application that compares the Java `../mapcode-rest-service` REST API against the TypeScript `../mapcode-rest-service-ts` port. The Java service is the canonical oracle. The application must find semantic discrepancies in JSON and XML payloads, validate round-trip mapcode decoding within 10 meters, cover all Java REST API endpoints, and produce reports that are useful both to humans and AI coding agents.

## Product Shape

The app is a browser dashboard backed by a local coordinator server.

The coordinator owns local authority: starting or attaching to services, reading pinned fixtures, calling both APIs, canonicalizing JSON/XML, comparing responses, streaming progress, writing reports, and shutting down child processes that it started.

The browser is the operator console. It provides profile selection, service configuration, live progress, a TomTom map preview of generated lat/lon coverage, side-by-side Java and TypeScript current request/response panes, a clickable discrepancy list, selected discrepancy details, and final run summaries.

The UI direction is the approved dashboard mockup in `.superpowers/brainstorm/.../dashboard-layout.html`. The scratch mockup directory is intentionally ignored by git.

## Service Modes

The app supports both modes:

- Managed local services: start Java from `../mapcode-rest-service` and TypeScript from `../mapcode-rest-service-ts` on separate ports, stream logs, wait for readiness, and stop those child processes when the user stops the run or exits the app.
- Attached services: accept Java and TypeScript base URLs for CI, Docker, or remote debugging.

Before running tests, both services must pass `/mapcode/status`. If a managed service fails to start or crashes, the dashboard shows a blocking startup/runtime error and pauses affected work rather than reporting a false parity failure.

## Test Profiles And Fixtures

The corpus is pinned and reproducible. Fixture files record source version, generator version, seed, category, territory/ocean label, and coverage purpose.

Fixture groups:

- Capital points for every country.
- Near-capital perturbations.
- Broad country samples away from capitals.
- Ocean latitude/longitude sweeps.
- North Pole and South Pole edge cases.
- Java API contract examples derived from the Java service tests.
- Java-generated mapcodes harvested during encode tests for decode round-trip checks.

Profiles:

- `Fast`: representative samples from every group, suitable for normal development.
- `Deep`: expanded country/ocean samples, endpoint/query combinations, precision values, alphabets, JSON/XML formats, and round-trip checks.
- `Custom`: user-selected categories, sample counts, seed, endpoint families, and slow round-trip sweeps.

Run profile is selected in the UI before starting. Fixture expansion must be deterministic for the selected fixture set and seed.

## Map Preview

The dashboard includes a coverage map preview using the current TomTom Maps SDK for JavaScript, not the deprecated Web SDK v6 package. The local app expects `TOMTOM_API_KEY` in `.env`.

If no key is found, the UI opens a dialog asking the user to enter one. Saving the key enables the map. Skipping the dialog keeps the runner usable and falls back to a non-map fixture table.

The map shows the selected profile's generated lat/lon points. During execution, point state updates live:

- Queued or not checked: white/outlined.
- Currently being tried: red.
- Completed successfully: grey/blue.
- Completed with discrepancy: orange.

Points can be filtered by category and selected to inspect generated request cases.

## API Coverage

The coordinator maintains an explicit Java-derived API catalog. It covers:

- `GET /mapcode`
- `GET /mapcode/version`
- `GET /mapcode/status`
- `GET /mapcode/codes`
- `GET /mapcode/codes/{lat},{lon}`
- `GET /mapcode/codes/{lat},{lon}/{mapcodes|local|international}`
- `GET /mapcode/codes/{lat},{lon}/territories`
- `GET /mapcode/coords`
- `GET /mapcode/coords/{code}`
- `GET /mapcode/territories`
- `GET /mapcode/territories/{territory}`
- `GET /mapcode/alphabets`
- `GET /mapcode/alphabets/{alphabet}`

For each endpoint family, the app tests JSON via `Accept`, XML via `Accept`, and the `/mapcode/json/...` and `/mapcode/xml/...` aliases where the Java service actually exposes them.

The test catalog includes negative and contract cases from the Java tests: missing parameters, invalid precision, invalid alphabet, invalid territory, bad lat/lon syntax, unsupported `context` usage on encode, unsupported `territory` usage on decode, and expected `400`, `403`, and `404` responses.

## Parity Rules

Comparison is semantic canonical parity, not byte-for-byte wire parity.

Rules:

- Status codes must match.
- JSON is parsed into canonical structures.
- XML is parsed into equivalent canonical structures.
- Meaningful array order is preserved, especially for `mapcodes`, territory candidates, and alphabets/territories lists.
- Java is the oracle. If Java succeeds and TypeScript differs, the result is a discrepancy.
- If Java fails unexpectedly, the case is marked `oracle-error`.
- `/mapcode/version` is the only allowed value difference. Its behavior, shape, and content type must remain valid, but the version value itself may differ.
- All Java-generated mapcodes from encode tests are fed back into both APIs through decode endpoints. The Java and TypeScript decoded locations must be within 10 meters of the original fixture lat/lon, and the TypeScript decoded location must match the Java decoded location within the same tolerance.

## Runtime Flow

Startup flow:

1. Open the dashboard.
2. Load `.env` and show the TomTom key dialog if needed.
3. Choose managed services or attached URLs.
4. Choose `Fast`, `Deep`, or `Custom`.
5. Load the selected pinned fixture set and show the map/table preview.
6. Start or validate both services.
7. Enable the run once both services are ready.

Run flow:

1. Expand fixtures into endpoint request cases.
2. Schedule paired Java/TypeScript requests with bounded concurrency.
3. Show current Java and TypeScript request/response in side-by-side panes.
4. Canonicalize responses.
5. Compare under parity rules.
6. Stream progress, map point state, and discrepancies to the UI.
7. Allow pause, resume, stop, filtering, discrepancy selection, and report export during the run.

End flow:

- Show totals, failures by endpoint/category, max round-trip drift, skipped cases, service versions, fixture seed, report path, and reproducible request details for every discrepancy.

## Dashboard Controls

Controls:

- `Start`
- `Pause`
- `Stop`
- `Preview map`
- `Save report`
- Profile selector
- Discrepancy filters by endpoint, category, format, and failure type
- Clickable discrepancy rows

Keyboard shortcuts:

- Start/pause
- Previous/next discrepancy
- Open selected discrepancy details
- Filter
- Save report

## Architecture

Use TypeScript for the coordinator and browser UI so API types, canonical payload types, diff structures, and report schemas can be shared.

Coordinator modules:

- `service-manager`: starts or attaches to Java/TypeScript services, tracks ports, readiness, logs, and shutdown.
- `fixture-store`: loads pinned fixtures and map preview metadata.
- `api-catalog`: defines endpoint families, formats, aliases, parameter combinations, and contract cases.
- `runner`: schedules paired requests, handles pause/resume/stop, applies retry policy, and enforces concurrency limits.
- `canonicalizer`: parses JSON/XML into comparable semantic structures.
- `comparator`: applies parity rules, ordered-array rules, version exception, and 10 meter round-trip tolerance.
- `reporter`: writes human-readable and machine-readable reports.
- `event-stream`: streams progress, current request/response, map point state, service state, and discrepancy events to the browser.

Browser UI modules:

- `run-setup`: profile/service/key setup.
- `coverage-map`: TomTom map or non-map fixture table fallback.
- `run-summary`: progress and aggregate metrics.
- `service-panes`: Java/TypeScript current request and canonical response.
- `discrepancy-list`: clickable, keyboard-accessible failure list.
- `discrepancy-detail`: semantic diff, replay request, coordinates, and logs.
- `report-actions`: report save/export controls.

## Error Handling

- Missing TomTom key opens a dialog; skipping falls back to fixture table.
- Service startup failure blocks the run with visible logs.
- Service crash pauses the run and marks pending/active cases as blocked until the service is restored or the run is stopped.
- Network timeouts are retried according to bounded retry policy; exhausted retries are infrastructure errors.
- Malformed TypeScript response when Java succeeds is a discrepancy.
- Malformed Java response or unexpected Java failure is `oracle-error`.
- Report generation failures are shown as UI errors without losing in-memory discrepancy data.
- Secrets such as `TOMTOM_API_KEY` are never included in logs or reports.

## AI-Ready Reports

The report output must be suitable for feeding to an AI coding agent to fix bugs in the TypeScript port.

The app writes both:

- `report.md`: human-readable summary with failing endpoints, categories, impact, and reproduction steps.
- `report.json`: machine-readable evidence bundle.

Each discrepancy in `report.json` includes:

- Endpoint, method, query, format, profile, fixture id, fixture category, and seed.
- Java and TypeScript base URLs and service versions.
- Status codes and canonical payloads from both services.
- Semantic diff paths with expected Java values and actual TypeScript values.
- Java-generated mapcode for round-trip cases.
- Original fixture coordinates, decoded Java and TypeScript coordinates, and distance drift for round-trip failures.
- Raw request metadata, excluding secrets.
- Relevant Java and TypeScript service log excerpts.
- Exact replay command or local replay URL.
- Fixture provenance, such as capital, country sample, ocean sample, or pole case.

The report redacts secrets and avoids relying on UI-only context. A developer or AI agent should be able to reproduce and investigate a discrepancy from the report alone.

## Validation Strategy

Unit tests:

- Fixture loading and seeded expansion.
- Endpoint catalog expansion.
- JSON canonicalization.
- XML canonicalization.
- Semantic diffing.
- `/mapcode/version` exception.
- Ordered array comparisons.
- 10 meter round-trip tolerance.
- Report redaction and report schema.

Coordinator tests:

- Managed service lifecycle with mocked child processes.
- Attached URL mode.
- Pause/resume/stop behavior.
- Service crash handling.
- Retry and timeout behavior.
- Event stream payloads.
- Report output.

UI tests:

- Profile selection.
- TomTom key dialog.
- Map/table fallback.
- Map point state updates.
- Clickable discrepancy rows.
- Keyboard navigation.
- Save report control.

End-to-end smoke:

- Start both sibling services.
- Run a tiny pinned fixture set.
- Verify the whole loop: readiness, paired calls, canonical comparison, discrepancy capture, map/table state, and report writing.

`Deep` is intended for parity discovery. It is not the default fast verification path for ordinary code changes.
