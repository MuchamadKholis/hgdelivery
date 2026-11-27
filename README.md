# HGDelivery

Clean rebuild using plain HTML/CSS/JavaScript, Cloudflare Workers, D1 and private Google Drive storage for proof photos.

## Cloudflare resources

See [Cloudflare setup guide](docs/CLOUDFLARE_SETUP.md) for the exact commands to create the D1 database, apply migrations, configure secrets and deploy. See [Google Drive setup](docs/GOOGLE_DRIVE_SETUP.md) for private proof-photo storage.

- D1 database name: `hgdelivery`
- Worker name: `hgdelivery`
- D1 migrations: `database/migrations/`

## Local development

1. Install Node.js LTS.
2. Run `npm install`.
3. Create local `.dev.vars` based on the setup guide.
4. Run `npm run db:local` and `npm run dev`.

## Production status

This is an implementation in progress, not a production-ready service. The initial customer order and map flow exists. Login rate limits, same-origin API checks, secure session cookies, role-checked proof upload/download endpoints, admin user management, courier assignment, order status workflow, pricing-rule configuration, and basic admin dashboard metrics are implemented in code but still require runtime and end-to-end verification. Automatic route-distance calculation and order-price enforcement, payment workflows, retention/deletion rules, and comprehensive end-to-end tests remain incomplete. Configured tariff rules are not yet used to generate customer quotes. Do not onboard real users or upload real customer documents until these gaps are implemented and tested.

The current build uses private Google Drive storage for proof photos; D1 stores file metadata and Drive IDs only. It does not use legacy Apps Script, Sheets, or frontend credentials. Deleting old secrets from the new code does not erase them from Git history; rotate any credentials that were ever committed.
