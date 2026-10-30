# Brothers Outfit Gallery — Admin Studio

A separate private admin project in `D:\Brothers_Outfit_Admin`. The public website remains in `D:\Brothers_Outfit\brothers`; its guarded checkout integration was changed after the owner authorized it and has not been deployed. This is a review preview connected to the existing Firestore database. It reads the live catalog, variants, orders, customers, stock movements and store details. Product editing, stock adjustments, POS receipts, order status/returns, supplier receipts and offline queuing have been implemented behind a live-write lock. No production business mutation has been executed by this project.

The billing screen accepts USB/Bluetooth barcode scans, SKU entry and product-name search, with editable quantities, larger dark-theme text, per-line totals and stock retail values. The Inventory screen shows available quantity and retail value across all products and for each product. Staff can create a single-variant product from POS or Products; the guarded server route writes the same website `products` document, SKU/slug registries and an opening stock movement. The creation form has no image input. Product editing includes a barcode for the product and each variant, plus a Code128 label print view and QR label link. Completed sales receipts have a print button and PDF download. The owner deferred GST, so generated bills are sales receipts rather than GST tax invoices.

WhatsApp sending is selected by default when a customer number is entered. The operator should enter a number only after the customer agrees to receive the receipt; the option can be unchecked per bill. Automatic delivery still requires the Meta WhatsApp Business API credentials and approved document template listed below. The local preview has no provider connection and cannot send messages yet.

## Start locally

Requires Node 22.12+ and npm. From this folder:

```powershell
npm ci
npm run dev
```

Open [http://localhost:4310](http://localhost:4310). Use `localhost` consistently: CSRF checks require the configured origin. The server reads the existing `../Brothers_Outfit/brothers/.env`; keys are not copied. An optional local `.env` overrides names from that file; process environment takes precedence. Do not copy the website `.env` into frontend source.

Sign in with the four-digit PIN configured as `ADMIN_PIN` in the admin project's ignored `.env` file. No email, ID or password is requested. The local preview PIN was set by the owner. Sessions are opaque and expire after eight hours by default; logout revokes that session. A server restart signs out everyone. Firebase Auth accounts and website authentication are not changed.

The preview binds to `127.0.0.1`. Its business-write routes return HTTP 423 unless `ADMIN_BUSINESS_WRITES=enabled` is configured server-side. Keep that lock in place until the schema, stock-writer cutover and checkout changes are reviewed. A four-digit PIN, especially the requested local preview value, is inadequate for a public POS containing billing and customer data. Before internet hosting, add a stronger access control and a distributed login limiter while keeping a PIN-only user experience if desired.

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

## Deployment

This app matches the existing React/Vite + Express + Firebase architecture, adding TypeScript and Zod. It uses a small CSS token system rather than adding a second UI framework. The default dark theme uses the website's charcoal, ivory and antique gold colors; staff can switch to light mode. The app has not been deployed to a public host.

1. Deploy this folder as an independent Node service behind HTTPS at `admin.brothersoutfitgallery.com`. Use the existing Firebase project and existing ImageKit/Razorpay services; do not create a second production database.
2. Set the server environment through the host's secret store. Production does **not** read the sibling `.env` by default. Set `ADMIN_ORIGIN` to the exact HTTPS origin, `ADMIN_HOST` to the host-required address (commonly `0.0.0.0`), `ADMIN_PORT` to its port (1024+), and `NODE_ENV=production`.
3. Install with `npm ci`, build with `npm run build`, start with `npm start`. Current emitted server dynamically imports Vite only in development, but Vite's types are used by the build.
4. Forward the exact HTTPS origin and configure `TRUST_PROXY_HOPS` for the host topology. Never blindly trust all forwarded headers. Verify Secure/HttpOnly/SameSite cookies and a denied anonymous `/api/overview` request through the public origin. Replace or strengthen the requested four-digit PIN control before allowing internet access to customer/finance data.
5. The supplied PIN limiter and sessions are per-process. Configure a shared session store and host gateway/distributed limiter before multi-instance production rollout. Phase 7 listeners/expiry workers require a host that supports persistent workers or an appropriate managed function/queue setup.
6. Check the selected provider's current free-tier limits before choosing it. No free-tier capacity, worker availability, or custom-domain cost has been assumed or verified.

For `/admin` hosting, base-path/routing/cookie configuration must be added and tested; the current build targets a dedicated subdomain at `/`.

## Verification limits

Automated tests cover PIN access, CSRF, write locking, stock bounds and receipt PDF structure. The live catalog and orders were read in a browser preview, and a sample PDF was rendered. Production migration application, concurrent stock transactions, gateway/webhook reconciliation, WhatsApp delivery, checkout reservations, offline reconnect and deployment remain unverified or incomplete. See the [implementation review](docs/05-implementation-review.md) and [end-to-end checklist](docs/04-delivery-and-tests.md).
