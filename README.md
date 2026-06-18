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

Run the local coordinator. After `npm run build`, it also serves the browser dashboard from `dist/ui`.

```bash
npm run dev
```

For UI-only development with Vite:

```bash
npm run dev:ui
```

## Local services

Default managed mode expects:

- Java service: `../mapcode-rest-service`
- TypeScript service: `../mapcode-rest-service-ts`

Attached service base URLs are accepted by the coordinator run API. Dashboard controls for editing those URLs are a follow-up.

## Reports

Reports are written under `reports/` and ignored by git:

- Markdown report output, such as `report.md`, for human and AI-agent handoff.
- JSON report output, such as `report.json`, for machine-readable discrepancy evidence.

The dashboard displays the exact saved paths returned by the coordinator. Secrets, including `TOMTOM_API_KEY`, are redacted.

## Verify

```bash
npm run lint
npm test
```
