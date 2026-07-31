# SketchForge Cloud staging

This is an isolated non-production deployment. It uses the Worker
`sketchforge-cloud-staging`, D1 database `sketchforge-cloud-db-staging`, private
R2 bucket `sketchforge-cloud-projects-staging`, and Stripe test mode. The
staging configuration has no custom-domain routes and must never be connected
to `sketchforge3d.com`.

## Architecture

- The existing Next.js app is statically exported and served through the
  staging Worker's `ASSETS` binding.
- `worker/src/index.ts` handles only `/api/cloud/*` server routes.
- D1 stores accounts, sessions, legal acceptance, authoritative Stripe state,
  project metadata, storage counters, deletion requests, and processed Stripe
  event IDs.
- R2 stores versioned project JSON under backend-generated per-user keys. The
  bucket has no public URL.
- Google OAuth uses Authorization Code + PKCE, nonce/state validation, and
  cryptographic verification of Google's ID-token signature and claims.
- Stripe Checkout redirects only to `/cloud/activating`. Entitlement changes
  are written only after a raw-body, signature-verified webhook retrieves the
  current subscription from Stripe.
- Stripe's test Customer Portal configuration handles payment-method updates,
  invoice history, and cancellation at period end.

## Install and verify

```powershell
npm install
npm run ci
npm run staging:check
```

`npm run cloudflare:check`, `npm run cloudflare:dev`, and
`npm run cloudflare:deploy` are intentionally aliases for the staging
configuration. A production deployment is locked behind
`SKETCHFORGE_PRODUCTION_DEPLOY=DEPLOY_SKETCHFORGE3D_PRODUCTION` and must not be
used before explicit staging approval.

## Local Worker development

Create `.dev.vars` beside `wrangler.staging.jsonc` (it is ignored by git):

```dotenv
GOOGLE_CLIENT_SECRET=replace-me
SESSION_SECRET=replace-with-at-least-32-random-bytes
STRIPE_SECRET_KEY=sk_test_replace-me
STRIPE_WEBHOOK_SECRET=whsec_replace-me
```

For local OAuth, temporarily use a local Wrangler config override with
`APP_BASE_URL=http://127.0.0.1:8787` and register this exact Google redirect:

```text
http://127.0.0.1:8787/api/cloud/auth/google/callback
```

Apply local D1 migrations and start the Worker:

```powershell
npx wrangler d1 migrations apply sketchforge-cloud-db-staging --local -c wrangler.staging.jsonc
npm run staging:dev
```

The static build and Worker are served together at `http://127.0.0.1:8787`.

## Stripe CLI and local webhooks

Confirm the CLI is authenticated and remains in test mode:

```powershell
stripe version
stripe products list --limit 100
stripe prices list --product prod_Ut9LZZdWN8236D --limit 100
stripe billing_portal configurations retrieve bpc_1TtN91RIfuuiWcFTJLDYpejF
```

The idempotent provisioning helper reuses the tagged product, exact active
$7/month price, and test portal configuration. It stops if duplicates exist:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/ensure-stripe-test-resources.ps1
```

Forward the supported events to the local Worker:

```powershell
stripe listen --forward-to http://127.0.0.1:8787/api/cloud/stripe/webhook --events checkout.session.completed,checkout.session.expired,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed,invoice.payment_action_required
```

Copy only the printed `whsec_...` value into local `.dev.vars`. Do not commit
it. Complete a real test Checkout through `/cloud/subscribe`; synthetic
`stripe trigger` events are supplemental and do not replace the real Checkout
test.

Use Stripe's test card `4242 4242 4242 4242`, any future expiry, any three-digit
CVC, and a valid postal code for a successful payment. Use Stripe's documented
decline and authentication test cards for recovery scenarios.

## Staging resources and deployment

The D1 database already exists. Migrations `0001_sketchforge_cloud.sql` through
`0004_cloud_project_thumbnails.sql` are ordered and non-destructive; they cover
the core Cloud schema, recoverable storage reservations, progressive logical
allocation, and private project-thumbnail metadata. Their manual rollback SQL
lives outside Wrangler's migration directory at `migrations/rollback/` and is
destructive; do not run it without explicit approval.

R2 must first be enabled on the Cloudflare account. Then create only the
staging bucket:

```powershell
npx wrangler r2 bucket create sketchforge-cloud-projects-staging
```

Register this exact authorized Google redirect URI:

```text
https://sketchforge-cloud-staging.sketchforge3d.workers.dev/api/cloud/auth/google/callback
```

Set secrets without placing values in command history:

```powershell
npx wrangler secret put GOOGLE_CLIENT_ID -c wrangler.staging.jsonc
npx wrangler secret put GOOGLE_CLIENT_SECRET -c wrangler.staging.jsonc
npx wrangler secret put SESSION_SECRET -c wrangler.staging.jsonc
npx wrangler secret put STRIPE_SECRET_KEY -c wrangler.staging.jsonc
```

Deploy, then register a Stripe **test-mode** webhook endpoint at:

```text
https://sketchforge-cloud-staging.sketchforge3d.workers.dev/api/cloud/stripe/webhook
```

Store its signing secret and redeploy if required:

```powershell
npx wrangler secret put STRIPE_WEBHOOK_SECRET -c wrangler.staging.jsonc
npm run staging:migrate
npm run staging:deploy
```

## End-to-end staging checklist

1. Confirm the URL is on `workers.dev` and Cloudflare shows no custom routes.
2. Confirm Stripe Dashboard is in test mode and the plan is exactly $7 USD per
   month.
3. Open `/demo` signed out and verify the editor remains free and local-only.
4. Sign in through `/cloud/subscribe`; confirm both legal checkboxes start
   clear and acceptance is stored.
5. Complete real test Checkout and verify `/cloud/activating` stays locked
   before webhook delivery.
6. Deliver the verified webhook and confirm `/cloud` opens only afterward.
7. Create, save, reload, rename, export, and delete a staging project.
8. Test failed renewal, past-due read/export, blocked saves, billing repair,
   cancellation at period end, expiration, seven-day frozen access, resubscription,
   duplicate webhook delivery, invalid signatures, and an older event arriving
   after a newer one.
9. Confirm storage counters equal active project object sizes and that R2 keys
   all begin with the authenticated internal user ID.
10. Confirm account deletion needs recent authentication, the email, and the
    word `DELETE`. Confirmation immediately revokes every session, anonymizes
    the Google-linked identity, clears the session cookie, and redirects the
    browser to Cloud sign-in. Staging retries the remaining Stripe test and R2
    cleanup every ten minutes, while legacy requests remain inert until the
    user explicitly reconfirms them.

## Production cutover (approval required)

Do not perform these actions until the staging result is explicitly approved:

1. Obtain legal approval for paid-service Terms, Privacy, refund/cancellation,
   retention, and contact details.
2. Create/review the separate production D1 database
   `sketchforge-cloud-db` and private R2 bucket
   `sketchforge-cloud-projects`.
3. Review migrations and back up any pre-existing production data.
4. Create or map a live Stripe product/price; never reuse the test price ID.
5. Store live Stripe and production Google secrets only in Cloudflare secrets.
6. Register the production Google redirect and live Stripe webhook endpoint.
7. Confirm every production variable contains a production URL/ID and no test
   value remains.
8. Review Cloudflare routes separately before adding either custom domain.
9. Run one controlled live purchase, webhook, portal, cancellation, recovery,
   export, and quota test with monitoring enabled.
10. Enable public launch only after explicit approval.
