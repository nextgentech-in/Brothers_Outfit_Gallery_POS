# Brothers Outfit Gallery — Admin Studio

Latest changes and cashier instructions: [daily-use update, purchases and barcode labels](docs/08-daily-use-update.md). Purchases receive stock immediately by default, create new items atomically, and calculate cost × quantity.

A separate private admin project in `D:\Brothers_Outfit_Admin`. The public website remains in `D:\Brothers_Outfit\brothers`; its guarded checkout integration was changed after the owner authorized it and has not been deployed. This is a review preview connected to the existing Firestore database. It reads the live catalog, variants, orders, customers, stock movements and store details. Product editing, stock adjustments, POS receipts, order status/returns, supplier receipts and offline queuing have been implemented behind a live-write lock. No production business mutation has been executed by this project.

See [current activation status](docs/07-activation-status.md). Billing now includes held bills on this device, current-stock checks on resume, a duplicate-click guard, and clearer handling of rejected sales.

The first screen is a live store dashboard with product, variant, stock, order, customer and recent channel-sales summaries. The sidebar keeps six daily tasks visible and puts suppliers, reports and sync health under More tools. The billing screen accepts USB/Bluetooth barcode scans, SKU entry and product-name search, with editable quantities, larger dark-theme text, per-line totals and stock retail values. Staff can create products with multiple color/size variants from POS or Products using a form modeled on the website's product editor. The admin/POS interface never displays or requests product photos; existing website images remain untouched, and newly created products start as website drafts so their photos and publication can be completed in the website editor. Products default to a clean list layout with an optional grid view, and every product expands inline to show all size/color stock without overlapping another row. The expanded product editor includes category, fit, descriptions, GSL, product and variant prices, costs, barcodes, visibility, and per-variant stock changes. Stock edits use one atomic append-only ledger transaction and cannot make a variant negative. A multi-product barcode-sheet dialog lets staff search the full catalog, select label quantities across different products and variants, choose two to four columns and label size, and print the combined selection across A4 pages. Billing includes a structured print preview before completing the sale, while completed sales receipts retain print, PDF download and manual WhatsApp sharing actions. Purchase receiving now searches product names, SKUs, barcodes, sizes and colours and supports multiple variants per supplier receipt. The owner deferred GST, so generated bills are sales receipts rather than GST tax invoices.

Receipt sharing defaults to manual sending. With customer consent, the free manual path is: complete the sale, select Share on WhatsApp, then send the prepared receipt message. Download PDF separately and attach it in WhatsApp when a document is required. This manual path requires a person to press Send; it does not auto-send the PDF. Automatic document delivery requires the Meta WhatsApp Business API credentials and approved template listed below, and provider charges may apply. The local preview has no provider connection and cannot auto-send messages.

POS sales also create a signed, read-only PDF link on the shared Firebase invoice. The link works without admin login and expires after 30 days. A completed receipt can open the customer's SMS app with the link and phone number filled in, or share the link through WhatsApp; staff must tap Send. The website's primary OTP path uses Firebase Phone Authentication, which sends verification codes only and cannot send arbitrary receipt messages. Automatic SMS requires a separate messaging provider and is not enabled. All commerce writes remain gated by the existing rollout controls.

## Start locally

Requires Node 22.12+ and npm. From this folder:

```powershell
npm ci
npm run dev
```

Open [http://localhost:4310](http://localhost:4310). Use `localhost` consistently: CSRF checks require the configured origin. The server reads the existing `../Brothers_Outfit/brothers/.env`; keys are not copied. An optional local `.env` overrides names from that file; process environment takes precedence. Do not copy the website `.env` into frontend source.

Sign in with the four-digit PIN configured as `ADMIN_PIN` in the admin project's ignored `.env` file. No email, ID or password is requested. The local preview PIN was set by the owner. Sessions are opaque and expire after eight hours by default; logout revokes that session. Local sessions are in memory and a server restart signs everyone out. Hosted sign-in also requires a one-time trusted-device pairing from the local preview; ordinary sign-in on paired devices remains PIN-only. Hosted sessions, devices and sign-in limits use the additive `erp_authState` collection. Firebase Auth accounts and website authentication are not changed.

The preview binds to `127.0.0.1`. Its business-write routes return HTTP 423 unless `ADMIN_BUSINESS_WRITES=enabled` is configured server-side. Keep that lock in place until the schema, stock-writer cutover and checkout changes are reviewed. Hosted sign-in has a distributed login limiter and requires a valid trusted-device cookie, because the requested four-digit PIN is already known publicly.

## Customer birthdays in billing

Quick bills show payment and discount without mobile or birthday fields. Select **Add customer details**, then **Mobile number**, to open the customer dialog. Choosing credit reveals the required customer fields automatically. A valid date of birth is required whenever a mobile number is added; walk-in bills can still omit both. Indian mobile numbers may be entered as 10 digits, and international numbers need their country code. Existing POS birthdays are looked up by mobile number. Confirm the birthday with the customer before using the details.

Birthdays are saved only when the sale succeeds, in `erp_customerProfiles/{customerKey}.dateOfBirth` as a date-only `YYYY-MM-DD` string. The separate `birthdayOffersOptIn` field records whether the customer agreed to birthday offers; receipt-sharing consent does not enable offers. The **Customers** view combines website accounts and POS profiles, shows dates of birth, and filters birthdays for today or this month using India time. The **Birthday offers** column shows the saved offer preference. The **Action → WhatsApp** button opens the message composer; staff review the draft and tap Send in WhatsApp.

Held and offline bills retain birthday details. Completing or queuing a bill clears its customer details for the next customer. Legacy held bills with a phone prompt for a birthday before checkout; older queued bills without a birthday remain available for review if rejected by the new validation. DOB stays off receipts and public bill PDFs. All existing sale activation gates still apply; no live migration is needed for the additive profile fields.

## Prepare WhatsApp messages and send manually

In **Customers → Action → WhatsApp**, select an offer, birthday wish, payment reminder, thank-you message or custom message. The customer name and mobile are filled from their profile. Enter offer details or the payment amount/date, review the generated text and edit it if needed. **Send · Open WhatsApp** opens a prepared draft in the WhatsApp account on that device; the operator must press Send there. Opening a draft creates no API message or delivery record. Customers without a valid mobile show a disabled action.

The composer works without Meta credentials or API templates. On a computer, link the shop's number using **WhatsApp Web → Linked devices**. The WhatsApp page explains this manual workflow separately from the optional automatic API connection and history. Edited drafts remain unchanged when fields are adjusted until **Rewrite from fields** is selected. Receipt API sending is now off by default and requires an explicit selection. Quick bills can omit customer details; udhar still requires the customer's name, mobile, birthday and repayment due date. Held bills restore their customer details.

## Customer credit (udhar) and WhatsApp

**Udhar / Credit** shows customer balances in red and payments received in green. Add a customer with an optional opening balance, add credit, or record a partial/full repayment by cash, UPI or card. Credit entries require one due date; quick choices set 7, 15 or 30 days. The customer history keeps every credit, repayment and return adjustment. Partial repayments settle the oldest credit first; overdue amounts use the shop date in India. Earlier credit entries without dates stay visible as undated debt.

Selecting **Credit / udhaar** during billing requires the customer's name, mobile, birthday and repayment date. The same transaction saves the credit entry with the sale. Held/offline bills retain that date. Credit PDFs say **PAYMENT DUE**, and full returns cancel only the unpaid part of the returned bill; any already-paid part remains subject to the existing refund review.

Ledger entries stay in `erp_customerLedger`. New entries include `kind`, `sequence`, `dueDate`, `note` and `paymentMethod`; return reductions identify the original entry through `appliesTo`. `erp_creditAccounts/{customerKey}` serializes changes to each account. Repayment amounts cannot exceed the outstanding balance, and stable request IDs make retries idempotent. No migration or balance rewrite is applied automatically. All new mutation routes retain authentication, CSRF and both commerce-write gates.

**WhatsApp** shows configured/missing settings, a live Meta connection check, sending-number details, quality rating, template approval when checkable, and customer message history. Automatic account creation, credit and repayment messages use the separate `creditWhatsAppOptIn` preference. New messages are created atomically in `erp_customerMessages` with the ledger change. They are attempted after commit and remain queued if provider settings are missing. Accepted means accepted by Meta, not delivered/read; delivery webhooks are not implemented. Ambiguous timeouts and interrupted sends require review rather than automatic resend. Confirmed rejections support an explicit retry.

For automatic account messages configure `WA_GRAPH_VERSION`, `WA_PHONE_NUMBER_ID`, `WA_ACCESS_TOKEN`, `WA_CREDIT_TEMPLATE_NAME`, and `WA_TEMPLATE_LANGUAGE`. Configure `WA_BUSINESS_ACCOUNT_ID` to check template approval. Keep `WA_TEMPLATE_NAME` for the existing receipt-PDF template. Meta calls require HTTPS access to `graph.facebook.com`. Provide values through the server's secure environment settings, not frontend code.

The approved account/credit utility template must use a static body with **five positional text parameters**, in this order: customer name, activity, transaction amount, remaining balance, repayment due date (or “No payment due”). Example body for provider review: `Hello {{1}}, your Brothers Outfit Gallery account update: {{2}}. Amount: {{3}}. Balance: {{4}}. Repayment due: {{5}}.` The account owner must obtain Meta approval for their template and language before sending.

The dedicated Node server processes queued customer messages every 45 seconds while commerce writes are enabled. Vercel Functions do not run that background loop: new events are attempted during their request; use **Process queued messages** or a separately configured authenticated worker for pending delivery. Due-date reminder messages are not scheduled automatically. Real Firebase, provider authorization, template approval and live message delivery still require environment-specific verification.

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
