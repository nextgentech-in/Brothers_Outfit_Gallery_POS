# Brothers Outfit Gallery — Admin Studio

A separate private admin project in `D:\Brothers_Outfit_Admin`. The public website remains in `D:\Brothers_Outfit\brothers`; its guarded checkout integration was changed after the owner authorized it and has not been deployed. This is a review preview connected to the existing Firestore database. It reads the live catalog, variants, orders, customers, stock movements and store details. Product editing, stock adjustments, POS receipts, order status/returns, supplier receipts and offline queuing have been implemented behind a live-write lock. No production business mutation has been executed by this project.

The first screen is a live store dashboard with product, variant, stock, order, customer and recent channel-sales summaries. The sidebar keeps six daily tasks visible and puts suppliers, reports and sync health under More tools. The billing screen accepts USB/Bluetooth barcode scans, SKU entry and product-name search, with editable quantities, larger dark-theme text, per-line totals and stock retail values. Staff can create products with multiple color/size variants from POS or Products using a form modeled on the website's product editor. The admin/POS interface never displays or requests product photos; existing website images remain untouched, and newly created products start as website drafts so their photos and publication can be completed in the website editor. Products can switch between grid and list layouts, and every product has an expandable size/color stock breakdown. Product editing includes a barcode for the product and each variant. A multi-product barcode-sheet dialog lets staff search the full catalog, select label quantities across different products and variants, choose two to four columns and label size, and print the combined selection across A4 pages. Billing includes a print preview before completing the sale, while completed sales receipts retain print and PDF download actions. The owner deferred GST, so generated bills are sales receipts rather than GST tax invoices.

WhatsApp sending is selected by default when a customer number is entered. The operator should enter a number only after the customer agrees to receive the receipt; the option can be unchecked per bill. Automatic delivery still requires the Meta WhatsApp Business API credentials and approved document template listed below. The local preview has no provider connection and cannot send messages yet.

## Start locally

Requires Node 22.12+ and npm. From this folder:

```powershell
npm ci
npm run dev
```

Open [http://localhost:4310](http://localhost:4310). Use `localhost` consistently: CSRF checks require the configured origin. The server reads the existing `../Brothers_Outfit/brothers/.env`; keys are not copied. An optional local `.env` overrides names from that file; process environment takes precedence. Do not copy the website `.env` into frontend source.

Sign in with the four-digit PIN configured as `ADMIN_PIN` in the admin project's ignored `.env` file. No email, ID or password is requested. The local preview PIN was set by the owner. Sessions are opaque and expire after eight hours by default; logout revokes that session. Local sessions are in memory and a server restart signs everyone out. Hosted sign-in also requires a one-time trusted-device pairing from the local preview; ordinary sign-in on paired devices remains PIN-only. Hosted sessions, devices and sign-in limits use the additive `erp_authState` collection. Firebase Auth accounts and website authentication are not changed.

The preview binds to `127.0.0.1`. Its business-write routes return HTTP 423 unless `ADMIN_BUSINESS_WRITES=enabled` is configured server-side. Keep that lock in place until the schema, stock-writer cutover and checkout changes are reviewed. Hosted sign-in has a distributed login limiter and requires a valid trusted-device cookie, because the requested four-digit PIN is already known publicly.

## Review first

- [Inspection and field mapping](docs/01-inspection-and-mapping.md)
- [Additive schema proposal and rollback](docs/02-schema-and-rollback.md)
- [Phase 7 integration design and required website changes](docs/03-website-sync-plan.md)
- [Delivery phases and end-to-end checklist](docs/04-delivery-and-tests.md)

The owner later requested all seven phases in one pass. The [implementation review](docs/05-implementation-review.md) separates working preview features from the Phase 7 integration and provider work that still needs website changes or external credentials. Review the mapping and additive collection plan before unlocking any writes.

## Commands

| Command | Effect |
| --- | --- |
| `npm run dev` | Local Express + Vite app on port 4310 |
| `npm run build` | Strict TypeScript check, production frontend and server build |
| `npm start` | Production server; requires HTTPS `ADMIN_ORIGIN` |
| `npm test` | PIN, access, CSRF, write lock, stock helper, PDF and rollback guard tests; no live DB writes |
| `npm run inspect` | Read at most 3 documents in each of 8 existing collections; output field names/types only |
| `npm run migrate` | Print Phase 1 migration proposal; no DB access |
| `npm run rollback` | Print non-destructive rollback proposal; no DB access |
| `npm run device:rollback` | Preview revocation of only paired-device records; exact project ID and `--apply` required for deletion |
| `npm run commerce:rollout` | Print the guarded commerce enable/disable and rollback procedure; no DB access without `--apply --project=` |
| `npm run seed:demo` | Refuses production; seeds one fixture only when both Firebase emulators and a demo project are configured |

Applying a reviewed migration is a separate operation. Both commands require the exact project ID and `--apply`:

```powershell
npm run migrate -- --apply --project=<exact-project-id>
npm run rollback -- --apply --project=<exact-project-id>
```

Neither command has been applied to the live database. Migration `0001` creates only `erp_settings/system` and `erp_migrations/0001_foundation`. It does not create fake catalog records, backfill stock, or enable business writes. Rollback marks the migration inactive and retains disabled settings; it refuses if settings have advanced beyond this foundation. Financial/stock history is never deleted.

Commerce writes additionally require a database rollout flag. After reviewing the exact schema and website checkout cutover, `npm run commerce:rollout -- --enable --apply --project=<exact-project-id>` creates or enables `erp_settings/commerce`, and the server must separately set `ADMIN_BUSINESS_WRITES=enabled`. `--disable` with the same guarded arguments is the non-destructive rollback script; it retains accepted stock and financial history. Neither direction has been applied to the live database.

## Environment names (no values)

| Names | Purpose |
| --- | --- |
| `EXISTING_WEBSITE_ENV` | Server-only path to existing env; development defaults to sibling website |
| `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Existing Firebase server identity |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Alternative server credential representation; project must match |
| `ADMIN_PIN` | Four-digit PIN used only by the admin server; keep in an ignored `.env` or server secret store |
| `ADMIN_SESSION_SECRET` | Optional dedicated random 32+ character server secret for hosted auth; when unset, a separate key is derived from the existing server-only Firebase service key with HKDF |
| `ADMIN_PAIRING_ORIGIN` | HTTPS production POS origin used when creating a one-time device invitation; defaults to the canonical Vercel URL |
| `ADMIN_DEVICE_ACCESS` | Set to `disabled` to stop hosted pairing, sign-in and active sessions before device rollback; enabled when unset |
| `ADMIN_BUSINESS_WRITES` | Set to `enabled` only after reviewed stock and schema cutover; otherwise every business write is locked |
| `ADMIN_ORIGIN`, `ADMIN_PORT`, `ADMIN_HOST`, `SESSION_HOURS` | Origin, bind address and session lifetime |
| `TRUST_PROXY_HOPS` | Exact trusted reverse-proxy topology; default zero |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Existing gateway credentials, reserved for billing phase |
| `IMAGEKIT_PRIVATE_KEY`, `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_URL_ENDPOINT` | Existing image service, reserved for inventory phase |
| `RAZORPAY_WEBHOOK_SECRET`, `ERP_WORKER_SECRET` | New server-only secrets needed for Phase 7; not provisioned here |
| `ERP_SYNC_SECRET` | Shared HMAC secret for the website's server-to-server receipt event; never in a client bundle |
| `WA_GRAPH_VERSION`, `WA_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN` | Meta WhatsApp Cloud API endpoint and server token |
| `WA_TEMPLATE_NAME`, `WA_TEMPLATE_LANGUAGE` | Approved utility receipt template with a document header and static body |
| `FIRESTORE_EMULATOR_HOST`, `FIREBASE_AUTH_EMULATOR_HOST` | Optional isolated test emulators |

Vite has env loading disabled and only an unused `ADMIN_PUBLIC_` prefix. Inherited `VITE_` variables are never exported to the frontend. The existing website contains a private ImageKit credential under a `VITE_` name; this admin deliberately does not expose that namespace. Existing website secret handling is documented for its separate security review.

## Vercel deployment

The initial Vercel deployment served `/` but returned 404 for `/login` and every `/api/*` route. The repository now includes `vercel.json` for Vite SPA deep links and `api/index.ts` for the Express API as a Vercel Function. Vercel's own [Vite guide](https://vercel.com/docs/frameworks/frontend/vite) requires SPA rewrites for deep links, and its [Express guide](https://vercel.com/docs/frameworks/backend/express) explains that Express apps run as Functions.

The Firebase Admin dependency chain needs the checked-in npm override for `jwks-rsa` → `jose@4.15.9` on Vercel's CommonJS function loader. Keep `package-lock.json` with deployments; removing the override causes `ERR_REQUIRE_ESM` at function startup.

Set the Vercel project's Root Directory to this repository's root, Framework Preset to Vite, Build Command to `npm run build`, and Output Directory to `dist` (the checked-in `vercel.json` declares the last three). A wrong root or output directory can still produce a 404. The function URL `/api/health` should return JSON `{"status":"ok",...}`; `/login` should serve the app; anonymous `/api/dashboard` should return JSON 401. The Vercel project must receive its own server-side environment variables; it cannot read the sibling website's local `.env`.

Required Vercel environment names for sign-in and data: `ADMIN_PIN`, `FIREBASE_ADMIN_PROJECT_ID`, and either `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_CLIENT_EMAIL` plus `FIREBASE_PRIVATE_KEY`. A dedicated `ADMIN_SESSION_SECRET` is recommended but optional when a Firebase service key is configured: the server derives a stable, separate session HMAC key from that existing secret. Rotating the Firebase service key invalidates existing POS sessions unless a dedicated session secret is set. The canonical URL is the fallback `ADMIN_ORIGIN`; set `ADMIN_ORIGIN` explicitly if using another domain. The Firebase project must be the same project as the website. For ImageKit uploads add `IMAGEKIT_PRIVATE_KEY`. Keep `ADMIN_BUSINESS_WRITES` disabled until the shared schema and checkout cutover are reviewed.

**The requested four-digit local PIN is known from this project discussion.** Hosted PIN sign-in requires a device paired from the local shop preview. Open `http://localhost:4310/security`, select **Create one-time link**, and open that link on the browser you want to use. The link expires after 10 minutes and works once. Once paired, visit `/login` on that same browser and enter the PIN. If a device is lost, revoke it from Trusted devices; its active sessions then fail their grant check. [The exact additive document mapping and rollback](docs/06-trusted-device-access-proposal.md) were approved before implementation.

Hosted PIN sessions and login limits use `erp_authState` with HMAC-hashed IDs; invitations and device grants use SHA-256 IDs derived from random 256-bit tokens. No raw PIN, token or client IP is stored. The device rollback script dry-runs by default and deletes only device invitations, grants and linked sessions when applied with an exact project ID. The broader `npm run auth:rollback` revokes every POS auth document. Vercel Functions do not run the interval worker in `server/index.ts`; WhatsApp retry scheduling needs a separate hosted worker or a suitable scheduled function before Phase 7 can be called complete.

For a dedicated Node host, run `npm ci`, `npm run build`, then `npm start` behind HTTPS. Set `ADMIN_ORIGIN`, `ADMIN_HOST`, `ADMIN_PORT`, credentials and trusted proxy topology for that host. Production uses the same durable sessions and write gates. No production stock or order mutation has been applied from the local preview.

## Verification limits

Automated tests cover PIN access, trusted-device pairing, CSRF, write locking, stock bounds and receipt PDF structure. A real Vercel pairing and PIN sign-in reached the hosted dashboard; revoking that temporary device made its existing session return HTTP 401. The live catalog and orders were read in a browser preview, and a sample PDF was rendered. Production business migration application, concurrent stock transactions, gateway/webhook reconciliation, WhatsApp delivery, checkout reservations and offline reconnect remain unverified or incomplete. See the [implementation review](docs/05-implementation-review.md) and [end-to-end checklist](docs/04-delivery-and-tests.md).
