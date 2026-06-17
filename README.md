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
