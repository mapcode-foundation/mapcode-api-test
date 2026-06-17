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

## Verify

```bash
npm run lint
npm test
```
