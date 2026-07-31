# Cloudflare deployment

SketchForge is deployed as a static Cloudflare Workers Assets application. The
hosted site opens directly in the demo editor; local-only Next.js API routes are
not part of the static deployment.

## Live routes

- `https://sketchforge3d.com`
- `https://www.sketchforge3d.com`
- `https://sketchforge3d.sketchforge3d.workers.dev`

The `/beta` route redirects to `/demo`.

## Validate

```powershell
npm run typecheck
npm run test
npm run cloudflare:check
```

`cloudflare:check` creates the static export, verifies worker chunk paths, and
runs a Wrangler dry-run without changing the live deployment.

## Deploy

```powershell
npm run cloudflare:deploy
```

Wrangler reads `wrangler.jsonc` and publishes `apps/web/.next-export`. Keep the custom
domain routes, `_headers`, and `_redirects` files when syncing application code
from the public SketchForge repository.
