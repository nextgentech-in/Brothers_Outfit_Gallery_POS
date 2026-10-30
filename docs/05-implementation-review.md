# Seven-phase implementation review

The admin is a separate project at `D:\Brothers_Outfit_Admin`. The public website remains a separate project at `D:\Brothers_Outfit\brothers`. After owner authorization, a guarded checkout integration patch was made in the website project; it has not been deployed. Both use the same Firebase project and existing server credentials. The review preview runs at `http://localhost:4310`. Admin live business writes are locked by both the server environment and the private Firestore rollout flag; website reservations default off.

## Field mapping inspected before implementation

| Business concept | Existing website source | Admin behavior |
| --- | --- | --- |
| Products / variants | `products/{id}`, embedded `variants[]` (`sku`, `size`, `color`, `stock`, `quantity`, price aliases) | Reads and edits the same documents; POS creation uses the website's SKU/slug registries and one shared opening movement. No copied catalog. |
| Images | `products/{id}.images[]`, `thumbnailUrl`, `image`; ImageKit URLs | Shows existing image URLs. Upload signing and image replacement UI are pending. |
| Stock | `products.stock` and `variants[].stock`; `stockMovements` signed events | POS, adjustments, purchases and returns use Firestore transactions and append movements. The guarded website checkout patch adds nullable `reserved` counts, with available = on-hand minus reserved. |
| Orders / payments | `orders/{id}`, `paymentId`, `razorpayOrderId`, `paymentStatus` | Reads the same orders. POS adds records to `orders`; `erp_orderMeta` stores channel/invoice link. Payment reconciliation and gateway webhooks are pending. |
| Customers | `users/{uid}` with phone, email, addresses | Shows existing accounts. New POS and website orders share a hashed phone-first, email-fallback customer key and append credit/loyalty entries; historical account linking, settlements and verified identity review are pending. |
| Shop identity | `settings/storeSettings`, website `src/config/business.js` and public assets | Admin uses live settings, website contact defaults and copied logo/storefront assets. |

## Current phase status

| Phase | Implemented in local preview | Remaining for full delivery |
| --- | --- | --- |
| 1. Foundation | Separate folder, PIN-only login, session/CSRF/rate limit, mapping, guarded migration and rollback. | Public deployment security hardening. |
| 2. Inventory | Shared catalog, POS product creation, available stock units and retail value by product/across catalog, variant stock, transactional adjustments, purchase stock movements, Code128/QR label download. | Locations/transfers, stock take, bulk import/export, alerts and full ledger baseline. |
| 3. POS | Scanner/SKU input and product search, editable bill quantity, darker billing text, per-line totals, transactional sale, shared fiscal-year receipt counter, printable sales receipt, downloadable PDF, whole-order return/credit note with stock restoration. | Line discounts, split payments, hold/resume, exchange and thermal receipt. GST was deferred by the owner. |
| 4. Relationships | Live website customer list, phone-first/email-fallback key for new orders, new credit/loyalty events, supplier records and one-variant purchase receipts with payable snapshots. | Historical account merge/review, credit collection, loyalty redemption, purchase orders, GRN and payable settlement. |
| 5. Insights | Recent POS/website sales overview and stock history. | Full date-range reports, GST export, profit/valuation, expenses, day close and backup automation. |
| 6. PWA/offline | Manifest, service worker shell cache, IndexedDB catalog/bill queue, same-key retry, shortage review on this device. | Installability audit, full reconnect race test, durable server review queue, performance and production security test. |
| 7. Website sync | Same Firestore products/orders, online orders in admin, live order badge/listener, order status reflected in shared document, online receipt conversion, sync-log list; guarded website checkout hold/release/finalize code. | Staging rollout of reservations, full writer audit, historical customer merge, payment reconciliation, live delivery validation and WhatsApp API activation. |

The local website patch now keeps published zero-stock products visible with an out-of-stock state. Checkout can reserve before payment when `ERP_RESERVATIONS_ENABLED=enabled`, but the flag remains off pending an index deployment, writer audit and staging race tests. The website has a separate existing POS sync API; the new admin uses the shared database directly and must not run a competing stock reconciliation writer during cutover.

## WhatsApp invoice delivery

An invoice delivery record is written with the sale or website receipt transaction. In POS, WhatsApp delivery is checked by default when staff enter a customer number after agreement; staff can uncheck it for a bill. A Meta WhatsApp Cloud API adapter uploads the PDF and sends an approved utility template with a document header when server credentials and customer agreement are present. The existing website has only a WhatsApp contact link; no Business messaging credentials or approved template were found, so live delivery remains `awaiting_provider`. The website automatically creates a receipt only when its separate `ERP_AUTO_RECEIPTS_ENABLED=enabled` flag is set, and can notify the admin through `ERP_ADMIN_RECEIPT_URL` using `ERP_SYNC_SECRET`. These are server-side settings; the browser bundle never receives them. An ambiguous provider outcome is marked `unknown` for manual review to avoid an automatic duplicate send. The app does not claim that a message was sent when credentials or agreement are absent.

## Review and rollback

Read [the full inspection](01-inspection-and-mapping.md), [additive collection/schema proposal](02-schema-and-rollback.md) and [Phase 7 cutover design](03-website-sync-plan.md). The preview has not applied migrations or business writes to production. `npm run commerce:rollout` prints the guarded enable/disable plan; `--disable --apply --project=<exact-project-id>` is the non-destructive rollback for the admin writer. Existing order/stock history is retained. A full Phase 7 rollout additionally needs a website stock-writer rollback and a staged race test before traffic switches.

## End-to-end acceptance checklist

1. In an isolated Firebase emulator/staging project, sell the last item in POS while a website checkout holds it. Exactly one sale may finalize; available stock never becomes negative.
2. Place and cancel a website order. The order appears in admin, status updates on the website, and each stock unit returns exactly once.
3. Deliver and return an order. One credit note and one positive movement per returned line are created; refund settlement is reviewed separately.
4. Queue a POS bill offline, sell the item online, then reconnect. The offline bill stays in review and never silently reduces stock below zero.
5. Replay each sale/order/payment/webhook with the same idempotency key. It must return the same result with no duplicate invoice or stock movement.
6. Send a consented invoice via the configured WhatsApp provider. Verify the provider ID, delivered/failure status and retry behavior without sending twice.
7. Verify customer phone-first/email-second matching, payment reconciliation and backup restore before calling Phases 3–7 complete. GST invoicing remains deferred by the owner.
