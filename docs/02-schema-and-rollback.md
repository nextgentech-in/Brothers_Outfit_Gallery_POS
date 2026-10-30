# Additive schema proposal — review before applying

Firestore is schemaless, so these are collection/document contracts, not SQL `ALTER TABLE` operations. No existing column/field is dropped, renamed or retyped. No current website record is changed by Phase 1. Future schema application and stock cutover are separate delivery steps.

## Executable Phase 1 migration

`scripts/migrate.ts` defaults to a no-database dry run. `0001_foundation` creates only:

| New document | Fields |
| --- | --- |
| `erp_settings/system` | `schemaVersion: 1`, `phase: foundation`, `businessWritesEnabled: false`, `websiteSyncEnabled: false`, `migrationId: 0001_foundation` |
| `erp_migrations/0001_foundation` | `status`, SHA-256 `fingerprint`, `appliedAt`, `rolledBackAt` |

The transaction refuses a pre-existing settings document it does not own. Reapplying the same migration is idempotent. Explicit project selection must match both configured project and effective credentials. It does not initialize invoice counters, alter users, create products or recalculate stock. The later commerce routes are present but remain locked behind two disabled rollout gates.

Rollback command:

```powershell
npm run rollback
# After review, for the exact intended project:
npm run rollback -- --apply --project=<exact-project-id>
```

Rollback retains the disabled settings and marks the migration `rolled_back`; repeating it is safe. It refuses modified settings/new schema fields rather than undoing another phase's work. It never deletes data. This is a logical rollback, not a deletion script. Up/down live execution has not been tested or performed; only dry runs and guard tests have run.

## Proposed later collections — not migrated yet

| New collection | Identity / proposed fields | Purpose |
| --- | --- | --- |
| `erp_productMeta` | product ID → `brand`, `hsn`, `gstRate`, private costs/reorder fields | Private extensions; no copied names/images/prices/catalog |
| `erp_stockBalances` | hash(product ID, stable variant ID, location) → references, `onHand`, `reserved`, `version`, `updatedAt` | Transactional projection of the one ledger; enforce `0 <= reserved <= onHand` |
| `erp_locations` | location ID → name, type, active | Shop/godown and transfer-ready stock |
| `erp_reservations` | stable checkout ID → owner, lines, state, `expiresAt`, version, command IDs | Reserve/release/finalize exactly once |
| `erp_reservationEvents` | hold ID plus transition → reserve/release/finalize event and timestamp | Append-only hold audit |
| `erp_commands` | hash(scope + idempotency key) → request hash, actor, operation, result, state | Same key/body returns saved result; changed body conflicts |
| `erp_orderMeta` | existing order ID → `channel`, `customerId`, reservation/invoice references | POS/Website attribution without duplicating orders |
| `erp_customerIdentities` | normalized phone/email hash → canonical `users` ID, verification provenance | Phone-first, email-second matching with conflict review |
| `erp_customerLinks` | original user ID → canonical user ID, reason, audit reference | Preserve original auth and order ownership while combining history |
| `erp_customerLedger` | immutable event ID → user, invoice, credit delta/loyalty delta | Unified udhaar and loyalty transactions |
| `erp_invoices` | invoice ID → fiscal year, number, immutable item/tax snapshots, channel, order/payment references | GST billing documents, not a second order source |
| `erp_invoiceSequences` | fiscal year/store → last allocated number | Shared POS/Website numbering inside the invoice transaction |
| `erp_payments` | gateway/payment ID → amount, currency, order/invoice refs, reconciliation state | Deduplicate payment capture and identify mismatches |
| `erp_syncLog` | event ID → event, source, status, safe error code, retry count, timestamps, next retry, lease | Durable health and retry view; redact PII/secrets |
| `erp_outbox` | event ID → operation ref, delivery status, lease, attempts | Reliable notification/revalidation work after commit |
| `erp_auditLog` | event ID → actor, target, edited field names, before/after, server timestamp | Product last-write-wins history; restricted access |
| `erp_reviewQueue` | offline command ID → conflict reason, lines, attempted sale ref, resolution | Shortage/replay/identity conflicts for manual review |
| `erp_suppliers`, `erp_purchaseOrders`, `erp_receipts`, `erp_expenses`, `erp_dayCloses` | versioned documents linked to products/users/invoices | Later inventory/finance domains |

The website checkout patch uses two additive nullable fields in existing `products` documents: top-level `reserved` and `reserved` within each existing `variants[]` entry. Both default to zero when missing. Existing `stock` and `quantity` keep their meaning as on-hand and are never renamed or retyped. The only new documents are private `erp_reservations` and `erp_reservationEvents`, with a composite index on `(state, expiresAt)`. `erp_stockBalances` remains a future multi-location proposal and is not used by the current checkout patch. The local code is disabled by default and has not written these fields to production.

After disabling `ERP_RESERVATIONS_ENABLED`, the website rollback script `D:\Brothers_Outfit\brothers\scripts\rollback-reservations.ps1` drains active holds through a secret-protected endpoint. Each release transaction decrements only `reserved`, retains on-hand, and marks the hold released. The added fields remain at zero; accepted orders and append-only events are retained. If any hold cannot be released, the script fails for manual review rather than dropping fields or clamping stock. Use `-Apply` only with `CRON_SECRET` in the shell and an exact HTTPS website origin. This is separate from the admin commerce rollback below.

The other proposed contracts will be refined before migration. New fields in newly appended `stockMovements` entries may include `schemaVersion`, `locationId`, `channel`, `commandId`, `onHandAfter`, `reservedAfter`; keep legacy movement fields and records intact. No physical stock ledger parallel to `stockMovements` is proposed.

## Current review-preview writes and rollback

The local admin implementation can write the existing `products`, `orders` and `stockMovements` documents only after two independent gates are enabled: server `ADMIN_BUSINESS_WRITES=enabled` and `erp_settings/commerce.enabled=true`. Both are off in the delivered preview. POS product creation additionally writes the website's existing `productSkuMappings` and `productSlugMappings` registries in the same transaction. These routes create only new private collections: `erp_commands`, `erp_auditLog`, `erp_orderMeta`, `erp_invoices`, `erp_invoiceSequences`, `erp_syncLog`, `erp_returns`, `erp_creditNotes`, `erp_creditNoteSequences`, `erp_suppliers`, `erp_purchases`, `erp_productCosts`, `erp_customerProfiles`, and `erp_customerLedger`. No business write or rollout flag has been applied to the live database by this project.

Review the exact fields in `server/commerce.ts` before enabling. The owner chose to skip GST for now, so implemented bills are **sales receipts, not GST tax invoices**. Website checkout has a guarded reservation path, currently disabled; enabling it requires a coordinated stock-writer cutover.

The non-destructive rollout/rollback script is `npm run commerce:rollout -- --disable --apply --project=<exact-project-id>`. It sets `erp_settings/commerce.enabled=false`, causing every admin business write to return HTTP 423, and retains all accepted financial and stock history. An emergency server-side rollback also removes `ADMIN_BUSINESS_WRITES=enabled` from the deployment environment. The script dry-runs by default and requires the exact Firebase project ID for an apply. Enabling is `--enable` with the same guards, only after checkout and schema review. It does **not** roll back website stock writers, accepted orders, invoices or payment captures; those require a forward correction, never deletion.

## Stock baseline and rollback at cutover

Current history omits some opening stock. Therefore summing the historical ledger is not sufficient to reconstruct a reliable starting balance. During a coordinated write pause: validate every product/variant identity, record the existing ledger checkpoint, append deterministic opening events for the new accounting epoch, and create the balances/projections in guarded chunks. Each SKU is marked initialized so retries cannot seed it twice. Opening events represent the cutover baseline, not historical sales. Reconciliation uses the new epoch baseline plus subsequent deltas, retaining older history for audit.

Switch all stock writers together, then enable reservations. Never run the old stock writers against new reservation projections. If cutover fails before traffic resumes, use the checkpoint and migration ownership to return to the original writer. After business events are accepted, disable new checkout/reservations, drain or release active holds transactionally, preserve every ledger entry, and use a forward corrective migration. Do not restore an old balance snapshot or delete accepted movements. This later rollback procedure needs its own implemented and tested script before Phase 7 rollout; Phase 1's script is not a stock rollback tool.

## Indexes and rules

Plan indexed queries for reservation `(state, expiresAt)`, sync `(status, nextRetryAt)`, orders `(channel, createdAt)` through order metadata, customer ledger `(customerId, createdAt)`, invoice `(financialYear, number)`, and ledger `(productId, sku, locationId, createdAt)`. Use deterministic registry documents for uniqueness; Firestore indexes alone do not guarantee unique SKUs, barcodes, payment IDs or invoice numbers.

Do not deploy an ERP-only rules file that replaces the website rules. Existing checkout rules default-deny unknown ERP collections; keep those server-only and verify deployed rules in staging. At Phase 7 cutover, remove direct client stock/order mutation paths and give public catalog/stock access only via allowed read projections. Server Admin SDK bypasses Firestore rules, so every privileged route must perform its own authentication, authorization, validation and transaction checks.
