# HGDelivery

Clean rebuild using plain HTML/CSS/JavaScript, Cloudflare Workers, D1 and private R2.

## Cloudflare resources

See [Cloudflare setup guide](docs/CLOUDFLARE_SETUP.md) for the exact commands to create the D1 database and private R2 bucket, apply migrations, configure secrets and deploy.

- D1 database name: `hgdelivery`
- R2 bucket name: `hgdelivery-private` (private; do not enable public access)
- Worker name: `hgdelivery`
- D1 migrations: `database/migrations/`

## Local development

1. Install Node.js LTS.
2. Run `npm install`.
3. Create local `.dev.vars` based on the setup guide.
4. Run `npm run db:local` and `npm run dev`.

## Production status

This is an implementation in progress, not a production-ready service. The initial customer order and map flow exists, but user management, courier assignment, pricing enforcement, secure proof upload/download, payment workflows, rate limiting, CSRF/origin controls, and end-to-end tests still need completion. Do not onboard real users until these are implemented and tested.

The clean version does not use legacy Apps Script, Sheets, Drive IDs or frontend credentials. Deleting old secrets from the new code does not erase them from Git history; rotate any credentials that were ever committed.
