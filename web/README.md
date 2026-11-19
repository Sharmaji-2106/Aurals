# Auralis web

Next.js 16 (App Router) app. `/api/*` is proxied to the FastAPI backend
(`AURALIS_API_URL`, default `http://127.0.0.1:8000`).

```bash
npm install
npm run dev          # http://localhost:3000 (needs the API running)
npm run api:types    # regenerate src/lib/api/schema.d.ts from the running API
npm test             # unit tests
npm run test:e2e     # Playwright against a running stack
```

Structure:

- `src/app`: routes (`/`, `/start`, `/music`, `/analysis/[id]`, `/tune`, `/profile`, `/method`)
- `src/components/viz`: charts and generative visuals (spectral scale = frequency)
- `src/components/{flow,analysis,tune,profile}`: feature components
- `src/lib`: API client and hooks, band vocabulary, scales, formatting
