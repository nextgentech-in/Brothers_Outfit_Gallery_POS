# Activation status — 2 November 2026

> Historical rollout record: see [4 November daily-use update](08-daily-use-update.md) for current local features and remaining validation.
The owner approved proceeding with live cutover and completing the app. Do not ask again for this authorization. Activation is not yet complete.

## Completed

- Website shared-stock code committed and pushed as 48aa81a; Vercel reports success. Reservation activation is still unverified/off by default.
- Website stock tests: 62 passed. The added reservation tests are unit tests, not a production concurrency test.
- Live catalog read-only audit: 77 products, zero invalid stock/reserved balances and zero missing/duplicate sellable SKUs.
- POS tests: 17 passed; browser billing, barcode, quantity, receipt preview, purchase search and hold/resume checks passed.
- Held bills persist on this device and re-read prices and stock before resuming. They do not reserve inventory.
- Repeated checkout clicks are blocked while saving. Explicit server rejections retain the cart instead of creating a pending automatic sale.

## Exact remaining activation work

1. Connect Vercel to inspect the website and POS production settings. No authenticated CLI or connected Vercel integration was available during this turn.
2. Compare deployed Firestore rules with the checked-in rules before applying changes; apply the reservation index and wait until ready. Preserve unrelated rules.
3. Exercise the concurrent last-unit checkout, cancel/release, return and offline replay scenarios against an isolated staging/emulator database. Unit tests are not a substitute for the transaction race checks.
4. Enable the website reservation flag, verify expiry sweeping and confirm every stock writer respects reservations. The existing older POS sync endpoint is another writer and must be included.
5. Enable the POS server write setting and the shared commerce rollout document together, then verify product creation and sale receipts. Current local ADMIN_BUSINESS_WRITES is unset and erp_settings/commerce is absent.
6. Production notification delivery requires a selected provider. Firebase Phone Auth cannot send receipt SMS. Manual SMS/WhatsApp bill-link sharing is implemented.

## Rollback

Disable POS business writes and run the existing commerce rollout script with --disable and the exact configured Firebase project. Retain invoices and stock events.
For website reservations, disable ERP_RESERVATIONS_ENABLED and use the existing rollback-reservations.ps1 drain workflow. Never delete an accepted sale or reset stock to an old snapshot.

## Remaining app scope

Do not label all seven phases complete. Credit/payable settlement, historical customer merge, complete payment reconciliation, split payments/exchanges, full reports/day close, backup restore, installed/offline audit and production message delivery still require implementation or end-to-end validation. GST remains deferred by the owner.
