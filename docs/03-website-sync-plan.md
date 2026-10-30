# Phase 7: shared website and admin stock

The admin at `D:\Brothers_Outfit_Admin` and website at `D:\Brothers_Outfit\brothers` are separate projects using the same Firebase Firestore project. The owner authorized a checkout integration patch in the website. The patch has not been deployed, the Firestore index has not been applied, and `ERP_RESERVATIONS_ENABLED` defaults off. Admin business writes also require both `ADMIN_BUSINESS_WRITES=enabled` and `erp_settings/commerce.enabled=true`.

## Source mapping

| Concept | Existing source | Local implementation |
| --- | --- | --- |
| Catalog and variants | `products/{id}`, embedded `variants[]` | Both apps edit/read the same records; no copied catalog. |
| Physical stock ledger | `stockMovements` signed entries | Website, POS, purchase, cancellation and return transactions append movements. Existing history is retained. |
| On-hand / reserved / available | Existing `stock` and `quantity`; new nullable `reserved` fields on product and variants | `stock` remains on-hand. `available = stock - reserved` is used in website cards/detail pages and admin POS. |
| Checkout holds | New private `erp_reservations/{hash(user,checkoutId)}` and append-only `erp_reservationEvents` | Hold, release and finalize use Firestore transactions on the same product documents. |
| Orders and invoices | Existing `orders/{id}` plus new `erp_orderMeta`, `erp_invoices` | Admin sees website and POS orders; one fiscal-year sales receipt counter. GST was deferred by the owner. |
| Customers and payments | Existing `users/{uid}` and `orders.paymentId` | New orders get a shared phone-first/email-fallback customer key and immutable credit/loyalty event. Historical identity merge and gateway reconciliation are pending. |

## Stock operations

| Operation | On-hand change | Reserved change | Enforcement |
| --- | --- | --- | --- |
| Checkout reserve | 0 | +quantity | Require enough available and bind to customer/checkout ID. |
| Timeout, dismissal or rollback | 0 | -quantity | Only release an active hold; a retry is idempotent. |
| Order finalized | -quantity | -quantity | Consume the matching hold once in the order transaction. |
| Order without hold while flag off | -quantity | 0 | Require `stock - reserved >= quantity`. |
| POS sale | -quantity | 0 | Require `stock - reserved >= quantity`. |
| Purchase/return/cancellation | +quantity | 0 | Append a positive physical movement. |
| Damage/negative adjustment | -quantity | 0 | Reject if new on-hand would be below reserved. |

The website reserves stock before payment or COD placement for 20 minutes. It releases on Razorpay dismissal/failure. A secret-protected expiry endpoint and a catalog-visit expiry sweep release timed-out holds transactionally; the latter is needed because [Vercel Hobby cron runs at most daily](https://vercel.com/docs/cron-jobs/usage-and-pricing). A strict 20-minute wall-clock release without any shopper visit requires more frequent worker hosting. Payment capture cannot be part of a Firestore transaction; a captured payment whose hold expired needs a payment-review/refund workflow, which is still pending.

The site now shows published sold-out products as out of stock. The publish toggle (`active`) stays independent of physical stock and is not automatically turned on by sale or cancellation. Product pages use live Firestore listeners; catalog fallback cache is two minutes and performs expiry sweeping before refetch. The admin order screen uses a server Firestore listener streamed to the browser for a new-order badge and optional sound. The website can create a shared-numbered sales receipt in the order transaction when `ERP_AUTO_RECEIPTS_ENABLED=enabled`; a signed server-to-server event can trigger WhatsApp delivery through the separate admin service when `ERP_ADMIN_RECEIPT_URL` and `ERP_SYNC_SECRET` are configured. The service adapter still needs Meta credentials and an approved document template.

## Cutover and rollback

1. Review [the existing field inspection](01-inspection-and-mapping.md) and [additive schema plan](02-schema-and-rollback.md).
2. Deploy the website's `firestore.indexes.json` composite index for active/expired holds in a staging Firebase project. Do not deploy the index or flip the feature flag against production yet.
3. Test all website stock writers, existing external POS sync, admin POS, cancellation, return and expiry against one staging Firestore database. The last-unit race must never make on-hand or available negative.
4. Configure `CRON_SECRET` server-side. To enable, set `ERP_RESERVATIONS_ENABLED=enabled` only after staging passes. Enable the admin writer separately with its two gates after security review.
5. For rollback, turn off `ERP_RESERVATIONS_ENABLED`, run `scripts/rollback-reservations.ps1 -BaseUrl <website-origin> -Apply` with `CRON_SECRET` available only in the shell, and confirm the endpoint reports zero active holds. This releases holds and leaves newly added nullable `reserved` fields at zero. It does not delete accepted orders, invoices or stock movements.

## Remaining Phase 7 work

The user-facing timeout/payment-review flow, verified customer identity merge, gateway payment reconciliation, durable WhatsApp sender/retry worker, full stock-writer audit, website status subscription QA, complete sync-health retry, and staging race checklist remain before production cutover. The website's existing `src/server/posSync.js` contract must be exercised against concurrent reservations; it is not replaced by a second database. See [implementation review](05-implementation-review.md).
