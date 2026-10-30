# Delivery phases and verification

The owner later requested all seven phases together. This is a local review build with guarded website integration, not a production rollout. The phase table distinguishes implemented code from unfinished requirements; see [implementation review](05-implementation-review.md).

| Phase | Deliverable | Current state |
| --- | --- | --- |
| 1 | Inspect, map, plan, separate folder, PIN login, additive migration drafts/rollback | Implemented locally; checks recorded below; live migrations not applied |
| 2 | Shared products/variants, stock ledger, locations, labels, import/export | Shared editing, ledger movements and Code128/QR label routes implemented; locations/import/export pending |
| 3 | POS, scan/search billing, invoice sequence, printing/PDF, returns | Barcode/SKU scan and search, sale, shared receipt sequence, PDF and whole-order return implemented; split/thermal/exchange pending. GST deferred by owner |
| 4 | Customers, identity links, suppliers, purchases, credit/loyalty | New orders share a phone-first/email-fallback key and append credit/loyalty events; historical merge, settlements and full supplier workflow pending |
| 5 | Combined sales dashboard, profit/tax exports, expenses, day-close, backup/export | Recent channel sales view implemented; accounting/export/backup pending |
| 6 | PWA, IndexedDB queue, offline recovery, accessibility/performance/security | Shell cache, offline queue and conflict review implemented; full audits pending |
| 7 | Website field mapping, shared ledger cutover, reservations, order intake/status, customer merge, sync health, payment reconciliation, E2E checklist | Guarded website reservation and auto-receipt code implemented; rollout and major reconciliation work pending |

## Local checks

- Build and strict TypeScript check: `npm run build`.
- Automated test suite: `npm test` (configured PIN and a test session adapter; no production account login).
- Check anonymous pages redirect to `/login`; anonymous APIs return JSON 401.
- Verify cross-origin requests, missing/mismatched CSRF tokens, forged/revoked sessions and invalid login payloads fail closed.
- Verify cookie HttpOnly/SameSite/expiry and sign-out revocation; verify Secure cookies separately under production HTTPS.
- Verify repeated invalid PIN attempts receive 429 with Retry-After.
- Run migration/rollback without `--apply`; inspect exact changes and confirm no DB operations.
- Verify changed/extended settings cause the rollback guard to refuse.
- Inspect the existing Firestore field shapes with read-only sampling; no customer/credential values in output.
- Check desktop/mobile login layout and production page/asset loading.
- Review website checkout changes separately from the admin repo. The admin source is published to the requested POS repository; website checkout changes remain local and neither app has been deployed to a public host by this work.

Applied business migration and Firestore Emulator transaction integration tests still require their own verification. The deployed HTTPS route, paired-device PIN login, hosted dashboard read and grant revocation were exercised against Vercel with temporary grants that were revoked. Local stock-helper tests cover reserved last-unit protection, and a browser preview exercised barcode scan-to-cart without a business write. The admin login uses a PIN-only server session rather than Firebase Auth. Do not seed production for demonstration.

## Required Phase 7 end-to-end checklist (staging, not yet run)

| Scenario | Expected assertion |
| --- | --- |
| Last item in ordinary online cart, POS sells it | Cart has no reservation yet; POS succeeds; checkout reserve fails cleanly; no charge; stock remains zero |
| Last item in reserved online checkout, POS attempts sale | POS rejects/flags shortage; online hold stays valid; available is zero |
| POS and checkout reserve the last item concurrently (repeat 100+ times) | Exactly one succeeds each time; on-hand/reserved/available invariants hold; no negative stock |
| Online confirmation | Reservation consumed, one order, one movement set; payment accepted once; invoice conversion does not deduct again |
| Reservation timeout + browser closed | Server worker releases within operational deadline; reserved returns to zero; release retry is a no-op |
| Payment races reservation expiry | One serialized outcome; late payment either reacquires stock or enters review/refund; no unfulfillable success |
| Duplicate/reordered payment webhooks | Signature checked on raw bytes; one payment/stock/invoice effect; conflicting payload rejected |
| Cancel unpaid reserved order | Release exactly once; no fabricated physical-stock increment |
| Cancel deducted order twice | One restoring movement per accepted quantity; stock restored once; website status changes |
| Partial/full accepted return | Bound returned quantity by original sold quantity minus prior returns; one credit note; stock restored only after accepted QC |
| Damaged/rejected return | No sellable-stock restoration; reason and appropriate location recorded |
| Price/name/image/publish edit | Same product ID updates; open website refreshes; an unpublished item is not republished by a purchase or return |
| Sold-out variant | Product visibility follows publish flag; variant reads zero available and shows Out of stock |
| Two simultaneous product edits | Explicit field patches preserve unrelated edits; server ordering gives last-write-wins for same field; both audit entries survive |
| Website order intake | New-order badge/sound once after user enables audio; reconnect catches missing orders without repeating old sounds |
| Packed/shipped/delivered state changes | Customer-owned live page updates; invalid state transitions/unauthorized order access rejected |
| Invoice conversion races POS invoice | Shared fiscal-year sequence; unique numbers; no duplicate invoice or stock deduction on retry |
| Same customer in shop and website | Verified phone then email resolve canonical history/credit/loyalty; conflicting identities require review; no cross-user access escalation |
| Offline sale then reconnect with sufficient stock | Stable queued UUID; one order/invoice/stock effect even after lost response and repeated retries |
| Offline sale then reconnect after online sell-out | Persistent review item; queued bill retained; no negative balance or silent drop |
| Worker crash after commit, before notification | Outbox replay completes; no business effect repeats |
| Retry failed sync via admin button | Original idempotency key/payload preserved; authorized only; attempts/log outcome visible |
| Gateway reconciliation | Missing, duplicate, unmatched, amount/currency mismatch and settled payments classified against original order/invoice |
| Public/browser security | No private keys in bundle/logs; no direct stock/admin writes; rate limits work across instances; signature failure has no effect |
| Cache/rules deployment and rollback | Website remains usable; hidden products/costs stay private as designed; rollback releases holds safely and preserves ledger/history |

## Backup and restore delivery

Phase 5 must provide an authenticated export, retention/access rules, scheduled backup instructions for the selected Firebase plan, and a restore drill into a separate project. Do not enable a schedule, claim free-tier eligibility or write production exports to a public directory in Phase 1. Before later cutover, capture a scoped metadata/data checkpoint and test recovery without reversing accepted ledger events.
