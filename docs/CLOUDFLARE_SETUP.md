# Cloudflare setup — HGDelivery

HGDelivery uses Cloudflare Workers for the API and static frontend, D1 for relational data, and a private Google Drive folder for delivery proof photos. **R2 is not required.**

## 1. Requirements

- Cloudflare account with Workers and D1 access.
- Node.js LTS and npm.
- Install dependencies from the repository root: `npm install`.
- Authenticate Wrangler: `wrangler login` (on Windows PowerShell, use `wrangler.cmd login` if script execution is blocked).

## 2. Cloudflare resources

Create the D1 database once:

```powershell
wrangler.cmd d1 create hgdelivery
```

Copy the returned database ID into `wrangler.jsonc`. The Worker name is `hgdelivery`; the D1 binding is `DB`. No R2 bucket is used.

## 3. Apply database migrations

Migrations are versioned in `database/migrations`. Never edit a migration that has already been applied remotely; add a new numbered migration instead.

```powershell
wrangler.cmd d1 migrations apply hgdelivery --local
wrangler.cmd d1 migrations apply hgdelivery --remote
```

## 4. Configure Google Drive secrets

Follow [Google Drive setup](GOOGLE_DRIVE_SETUP.md) to create OAuth credentials and obtain a refresh token. Store credentials only as Worker secrets:

```powershell
wrangler.cmd secret put GOOGLE_CLIENT_ID
wrangler.cmd secret put GOOGLE_CLIENT_SECRET
wrangler.cmd secret put GOOGLE_REFRESH_TOKEN
```

Never paste secret values into chat, Git, frontend JavaScript, or screenshots. The Drive folder is created automatically on the first proof upload and remains private.

## 5. Free route estimate (optional)

HGDelivery can use the OpenRouteService free Standard API for road-distance estimates. Create a free account and API key at [OpenRouteService](https://openrouteservice.org/plans/). The free plan has daily/minute quotas; check the provider's current plan limits before use. No Google Maps billing is needed for this route estimate.

Store the key only as a Worker secret:

```powershell
wrangler.cmd secret put OPENROUTESERVICE_API_KEY
```

The current integration uses the `driving-car` profile for road routing. It is an estimate, not a motorcycle-specific route, and it does not calculate or finalize order fares. Do not use the estimate as a final customer charge without operational validation. The app displays OpenRouteService/OpenStreetMap attribution. API keys must never be placed in frontend code.

## 6. First administrator

Before the first deployment used for a controlled setup, set a long, unique bootstrap secret:

```powershell
wrangler.cmd secret put BOOTSTRAP_ADMIN_PASSWORD
```

After deployment, open the login page, expand **Pengaturan awal: buat admin pertama**, and enter the bootstrap secret plus the admin account details. Use an admin password of at least 12 characters. Immediately remove the bootstrap secret after the admin is created:

```powershell
wrangler.cmd secret delete BOOTSTRAP_ADMIN_PASSWORD
```

The bootstrap secret and admin password must be different. Never send either value in chat.

## 7. Validate and deploy

First validate the bundle without deploying:

```powershell
wrangler.cmd deploy --dry-run
```

A successful dry run checks packaging and bindings only; it does not prove that the app works. Do not deploy until the current code review, pending migrations, authentication setup, and smoke-test plan are complete.

When explicitly approved for a controlled test deployment:

```powershell
wrangler.cmd deploy
```

The GitHub Actions deployment workflow is configured for pushes to `main` and manual dispatch. Do not merge rebuild work into `main` as part of routine testing.

## 7. Privacy and production readiness

- Proof photos are stored in a private Google Drive folder; D1 stores metadata and Drive file IDs only.
- Proof upload is restricted to the assigned courier or admin; download is restricted to the admin, order customer, or assigned courier.
- Login rate limits and same-origin checks for state-changing API requests are implemented.
- These controls still require runtime and end-to-end testing. User management, courier assignment, pricing enforcement, payment workflows, retention/deletion rules, and broader operational authorization remain incomplete.
- Do not onboard real customers or upload real customer documents until the complete workflow has been tested and reviewed.
