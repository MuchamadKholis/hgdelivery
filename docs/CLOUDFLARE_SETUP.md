# Cloudflare setup — HGDelivery

This repository is prepared for Cloudflare Workers + D1 + R2. **No Cloudflare resource has been created yet**: resource creation requires signing in to the owner's Cloudflare account. These steps create the resources in that account.

## 1. Requirements

- A Cloudflare account with Workers and D1 access.
- Node.js LTS and npm on your computer.
- From the repository root, install dependencies: `npm install`.
- Authenticate Wrangler: `npx wrangler login` and approve the browser authorization.

## 2. Create database and private file bucket

Run these commands once:

```bash
npx wrangler d1 create hgdelivery
npx wrangler r2 bucket create hgdelivery-private
```

The D1 command prints a `database_id`. Copy it into `wrangler.jsonc` in the `database_id` field. Keep the R2 bucket name exactly `hgdelivery-private`. Do not make this bucket public; files must be served through authenticated Worker routes.

## 3. Apply schema

First test locally:

```bash
npm run db:local
```

Then apply to the Cloudflare database:

```bash
npm run db:remote
```

Migrations are versioned in `database/migrations`; do not edit a migration that has already been applied remotely. Add a new numbered migration instead.

## 4. Configure Worker secrets

Generate a long random bootstrap password and set it as a Worker secret:

```bash
npx wrangler secret put BOOTSTRAP_ADMIN_PASSWORD
```

Also set an independent session signing secret for future token hardening:

```bash
npx wrangler secret put SESSION_SECRET
```

Never put secrets in Git, `.dev.vars`, frontend JavaScript, or screenshots. The current starter bootstrap endpoint expects the one-time password in the request body. After creating the first admin, remove the bootstrap secret:

```bash
npx wrangler secret delete BOOTSTRAP_ADMIN_PASSWORD
```

Do not expose the bootstrap endpoint publicly until rate limiting and origin/abuse protections are enabled.

## 5. Local development

Create a local-only `.dev.vars` file (it is ignored by Git):

```dotenv
BOOTSTRAP_ADMIN_PASSWORD=replace-with-a-long-random-local-only-value
ENVIRONMENT=development
```

Then run:

```bash
npm run dev
```

## 6. Deploy

After setting the production secrets and applying remote migrations:

```bash
npm run deploy
```

Wrangler will deploy the Worker and static assets. The first deploy creates the Worker endpoint; connect a custom domain only after smoke tests pass.

## 7. Storage and privacy

R2 is configured as a private bucket binding named `PROOFS`. The schema includes metadata for proof uploads. The current API does not yet expose a complete upload/download route; do not upload real customer identity documents or sensitive images until authenticated upload, content validation, size limits, authorization checks, retention, and signed/streamed download endpoints have been implemented and tested.

## Resource checklist

- [ ] D1 database `hgdelivery` created and its ID added to `wrangler.jsonc`.
- [ ] R2 bucket `hgdelivery-private` created (private).
- [ ] Local and remote migrations applied.
- [ ] Worker secrets set in Cloudflare.
- [ ] Bootstrap admin created once, then bootstrap secret deleted.
- [ ] Production smoke tests completed before inviting customers or couriers.
