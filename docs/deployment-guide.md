# Story 14 Deployment Guide

## Target

Deploy the integrated ALDI E-Commerce System so the Express backend and static frontend are available from a public HTTPS URL instead of localhost.

## Required Production Environment Variables

| Variable | Purpose |
| --- | --- |
| `NODE_ENV=production` | Enables production cookie security behavior. |
| `PORT` | Hosting provider runtime port. Render injects this automatically, but `render.yaml` sets a default. |
| `JWT_SECRET` | Secret used to sign login cookies and API tokens. |
| `ALDI_SQL_CONNECT_API_KEY` | Firebase service account JSON stored as a secret, never committed. |

## Render Deployment Steps

1. Create a new Render Web Service from the GitHub repository.
2. Use `npm ci` as the build command.
3. Use `npm start` as the start command.
4. Add the environment variables listed above.
5. Keep `ALDI_SQL_CONNECT_API_KEY` private and paste the full JSON value into Render's secret value field.
6. After deployment, open `/api/health` on the public URL and confirm it returns `{"status":"ok"}`.
7. Open `/api/live-check` to confirm Firebase Data Connect is reachable and products are available.

## Live Smoke Test

After the site is deployed, seed the production database from a trusted operator machine:

```bash
npm run seed
```

This seeds staff/customer demo accounts plus 4,000 clean ALDI catalog records with stock batches. Then run:

```bash
LIVE_URL=https://your-live-url.example npm run test:e2e
```

On Windows PowerShell:

```powershell
$env:LIVE_URL="https://your-live-url.example"
npm run test:e2e
```

The live smoke test validates the public health endpoint, seeded catalog, customer checkout, financial ledger update, WebSocket dashboard trigger, admin finance summary, and 403 responses for customer attempts to access admin or finance routes.
