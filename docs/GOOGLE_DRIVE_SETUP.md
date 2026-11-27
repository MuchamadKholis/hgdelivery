# Google Drive storage setup — HGDelivery

HGDelivery stores proof photos in a **private Google Drive folder** through the Google Drive API directly from the Cloudflare Worker. No Apps Script and no R2 bucket are used. D1 stores metadata and the Drive file ID; the Worker streams file contents only after checking the signed-in user's access to the related order.

## Google account and quota

Use a Google account that has enough Drive storage for operational photos. Files are owned by the Google account that authorizes the OAuth connection. Drive storage and API quotas follow Google's current account and API policies; this is not unlimited free storage.

## 1. Create a Google Cloud project and enable Drive API

1. Open https://console.cloud.google.com/
2. Create a project named `HGDelivery` (or select a project you control).
3. Open APIs & Services → Library.
4. Search for **Google Drive API** and click Enable.
5. Configure Google Auth Platform / OAuth consent screen. For initial testing, choose External if this is a personal Gmail account, and add your Google account as a test user if the app is in Testing.

## 2. Create OAuth credentials

1. Open Google Auth Platform → Clients → Create Client.
2. Choose **Web application**.
3. Add this exact authorized redirect URI: `https://developers.google.com/oauthplayground`
4. Create the client and keep the Client ID and Client Secret private.
5. Open https://developers.google.com/oauthplayground
6. Click the settings gear, enable **Use your own OAuth credentials**, and enter the Client ID and Client Secret.
7. In Step 1, enter this scope: `https://www.googleapis.com/auth/drive.file`
8. Click Authorize APIs and sign in using the Google account that should own HGDelivery proof photos.
9. In Step 2, click Exchange authorization code for tokens.
10. Copy the **refresh_token**. Never paste it into GitHub, chat, frontend code, or a screenshot.

The `drive.file` scope allows the app to create and manage files it creates or that the user explicitly opens with the app. HGDelivery creates its own folder named `HGDelivery Proofs` in the authorized Drive account.

## 3. Add credentials as Cloudflare Worker secrets

From PowerShell, run each command and paste the value only into the hidden prompt:

```powershell
wrangler.cmd secret put GOOGLE_CLIENT_ID
wrangler.cmd secret put GOOGLE_CLIENT_SECRET
wrangler.cmd secret put GOOGLE_REFRESH_TOKEN
```

The folder is created automatically on the first upload. Its ID is stored in D1. Do not create a public sharing link and do not change folder permissions to public.

## 4. Apply database migrations

From the HGDelivery repository folder:

```powershell
wrangler.cmd d1 migrations apply hgdelivery --remote
```

## 5. Upload API

After the Worker is deployed and authentication is hardened/tested:

- `POST /api/orders/{orderId}/proofs` — multipart form with `file` and optional `label`. Only the assigned courier or admin may upload. JPG, PNG and WebP, maximum 8 MB.
- `GET /api/proofs/{proofId}` — streams the photo only to an admin, the order's customer, or its assigned courier. No public Drive URL is exposed.

D1 stores the Drive file ID in `order_proofs.object_key`. Do not store OAuth tokens or file contents in D1.

## Security and rollout notes

- Keep the Google OAuth client secret and refresh token as Cloudflare secrets only.
- Keep the Drive folder private; do not use `anyone` permissions.
- Restrict the OAuth consent screen to the intended test users while testing.
- Before production, add request rate limits, CSRF/origin checks, audit logging, deletion/retention rules, and upload malware/content validation.
- The current endpoint enforces role/order access and an 8 MB image size/type limit, but the app is still a development build. Do not upload real customer documents until the full security review and end-to-end tests are complete.
- If OAuth consent remains in Testing, refresh-token validity can be limited by Google's testing-mode policy. Publish/configure the consent screen appropriately before long-term production use.


## First admin and security hardening

The Worker also requires a one-time bootstrap secret before the first administrator can be created.

1. Set a long, unique secret from PowerShell (Wrangler prompts for the value; do not paste it into chat):

```powershell
wrangler.cmd secret put BOOTSTRAP_ADMIN_PASSWORD
```

2. After the Worker is deployed for a controlled test, send a POST request to `/api/auth/bootstrap` with JSON fields `bootstrapPassword`, `name`, `email`, and `password`. The admin password must be at least 12 characters. Keep the bootstrap secret separate from the admin password.
3. Immediately remove the bootstrap secret after the first admin is created:

```powershell
wrangler.cmd secret delete BOOTSTRAP_ADMIN_PASSWORD
```

The current hardening migration adds hashed login-rate-limit keys. Login is limited to five attempts per email/IP pair per 15-minute window. State-changing API requests must include the exact same-origin `Origin` header. Apply all pending migrations before deploying this branch.

Do not use real customer data during initial testing. The app still needs broader end-to-end security and operational testing before production.
