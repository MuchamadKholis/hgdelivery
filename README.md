# HGDelivery

Clean rebuild using plain HTML/CSS/JavaScript, Cloudflare Workers, D1 and private R2.

## Local development
1. Install Node.js LTS.
2. Run npm install.
3. Create a Cloudflare D1 database and R2 bucket.
4. Replace the placeholder database ID in wrangler.jsonc.
5. Run npm run db:local and npm run dev.

## Production
Set Worker secrets SESSION_SECRET and BOOTSTRAP_ADMIN_PASSWORD, configure D1/R2, apply remote migrations and deploy. Create the first admin through the one-time bootstrap endpoint, then remove BOOTSTRAP_ADMIN_PASSWORD.

## Map
Search an Indonesian address/place, choose a result, use GPS, click the map or drag the marker. Coordinates and labels are stored with each order. The starter uses public Nominatim; respect its usage policy and select a production geocoder for real traffic.

This clean version does not use the legacy Apps Script, Sheets, Drive IDs or frontend credentials. Complete user management, pricing/business rules, migration, security review and end-to-end tests before production cutover.