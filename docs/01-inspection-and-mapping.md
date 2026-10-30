# Existing website inspection — 30 October 2026

Scope: source in `D:\Brothers_Outfit\brothers` and a read-only live Firestore sample of up to three documents per selected collection. No customer values, document IDs, secrets or product payloads are stored in this report. Sampling confirms field shapes, not complete schema coverage or data quality.

## Stack and identity

- React 19, JavaScript/JSX, Vite 8, npm/package-lock, React Router 7.
- Express 5 backend in `server.js`, Vercel routing in `vercel.json`.
- Firebase Cloud Firestore document database. Browser Firebase SDK and trusted `firebase-admin` SDK; no SQL tables, Supabase or ORM.
- Firebase email/password and phone authentication on the existing website. Protected `admins/{uid}` documents contain `role`; existing code also has email/phone allowlists. The separate admin app uses only the owner-requested four-digit PIN and an opaque server session; it does not change website authentication.
- Images use ImageKit. Image metadata is embedded in product documents, including legacy string URL arrays.
- Razorpay online payment and Delhivery shipping. Existing external Mr. Munim integration is delta-based and button-triggered; it is not the required reservation system.

## Field mapping

| Domain | Existing path and fields | Admin mapping / proposal |
| --- | --- | --- |
| Product identity | `products/{documentId}`, `webProductId`, `integrationOrigin`, `sku`, `slug` | Keep the same Firestore ID. Never introduce `erp_products`. Keep SKU/slug registries and legacy IDs. |
| Product text | `name`, `description`, `shortDescription`, `category`, `categoryId`, `subCategory`, `categoryKey`, `subCategoryKey`, `gsl`, `gslSpec` | Edit the original document through authenticated server operations. Patch explicit edited fields; retain unedited fields. Audit before/after values. |
| Prices | `price`, `salePrice`, `mrp`, `compareAtPrice`; cost aliases `costPrice`, `cost_price`, `purchasePrice`, `purchase_price` | Preserve existing number types and compatible aliases. Calculate in integer paise internally. No retyping existing fields. Keep new private purchase-cost metadata in private ERP collections. |
| Variants | Embedded `variants[]`: `id`, `sku`, `size`, `color`, `stock`, `quantity`, `price`, `salePrice`, cost aliases, `isDefaultPrice` | Same embedded variants, not a new variant catalog. Stable ID + SKU registry. Ambiguous or missing identity must be resolved before baseline migration. |
| Images | `images[]` strings or objects; form uses `url`, `publicId`, `isPrimary`, `color`; product `thumbnailUrl`, `image` | Preserve both formats; reuse URLs and server-side upload signing. No duplicate media store. Live sampled images were empty; object fields confirmed in source. |
| Publish/visibility | `active`, `inStock`, `isDeleted`; `sizes`, `allSizes` | Proposed publish toggle uses `active`. Inventory must stop automatically setting `active=true` when replenishing stock. Out-of-stock display and publication must be independent. |
| Stock | Product and variant `stock`, `quantity`; `stockMovements` | Current checkout patch keeps existing stock fields as **on-hand** and adds nullable `reserved`; the website computes available as on-hand minus reserved. A private multi-location balance projection remains future work. |
| Ledger | `stockMovements/{id}`: `movementId`, `productId`, `webProductId`, `sku`, `size`, `color`, `deltaChange`, `source`, `reason`, `externalReference`, `syncId`, `stockAfter`, `createdAt` | Keep collection/history. New movement schema adds on-hand/reservation deltas, channel, location and command reference on newly created entries only. Historical entries remain unchanged. |
| Orders | `orders/{id}`: `userId`, `userEmail`, `userPhone`, `shippingAddress`, `items[]`, totals, `status`, `shipmentStatus`, timestamps | Same order collection for Website/POS; use `erp_orderMeta/{orderId}` for channel, canonical customer and invoice link, without duplicating order business data. Preserve original customer ownership. |
| Stock order guards | `requestFingerprint`, `checkoutId`, `inventoryDeducted`, `inventoryDeductedAt`, `inventoryRestored`, `stockRestoredAt` | Retain existing semantics; bridge into one new command service. Old/new paths must not deduct or restore twice. |
| Payments | `paymentId`, `razorpayOrderId`, `paymentMethod`, `paymentStatus` | Gateway payment identity unique across orders/invoices; private payment reconciliation records reference originals. Payment attempts/claims must be authenticated server-side. |
| Customers | `users/{uid}`: `fullName`, `phone`, `email`, `address`, `provider`, timestamps, optional `phoneVerified`; subcollections `addresses`, `wishlist` | Reuse profiles; add identity-to-canonical-user links. Matching alone must not grant access to another user's orders or credit. |
| Owner access | Existing website: Firebase Auth, `admins/{uid}.role`, admin email allowlist | Separate admin preview: server-side PIN check and expiring opaque session. Business-write routes exist but require two disabled rollout gates. |
| Shop settings | `settings/{id}`: branding, contact, offers, shipping thresholds | Read existing settings where applicable. Private GST/invoice/finance settings belong in `erp_settings`, not publicly readable store settings. |

Other source collections include `posProductMappings`, `productSkuMappings`, `productSlugMappings`, `posTaxonomy`, `posStockEvents`, `posReconciliationDiscrepancies`, `posConsumedMovements`, `exchangeRequests`, `notifications`, `customerNotifications`, `reviews` and `coupons`. Do not remove or repurpose their records.

## Observed gaps that affect Phase 7

1. Checkout creates an order through `POST /api/orders/create`. Stock is deducted at COD confirmation or after captured Razorpay verification. No `reserved` balance or checkout timeout exists today.
2. Stock and cancellation use transactions and deterministic movements, but not every writer uses a single append-only command boundary. Legacy browser service code, privileged direct writes, absolute inventory updates and external POS writes must be accounted for.
3. `productService.js` filters sold-out products from listings. Product and catalog listeners already exist, but client cache TTL is two minutes and server catalog cache is five seconds. Some writes set `active` from stock and could republish a hidden product.
4. Customer order pages do not subscribe to order status in the same way as the catalog. Sharing documents alone does not make an already-open customer page update instantly.
5. Existing exchange/QC workflows do not constitute a stock-restoring full/partial return system.
6. Firebase rules in this checkout permit direct admin product writes and broad admin order updates. Existing user cancellation rules can update status without the server stock restoration path. Production deployed rules were not inspected; checkout rules must be reviewed and tightened at cutover.
7. `products` are publicly readable, including legacy cost-price fields. Firestore document reads cannot hide selected fields. New private financial fields must be stored separately; removing public access to legacy costs requires a public projection API and corresponding storefront/rules changes.
8. Existing `.env` includes `VITE_IMAGEKIT_PRIVATE_KEY`. The new admin does not import or expose that namespace. Whether the existing deployed client includes it has not been verified.
9. The existing external POS has its own sync checkpoints. It must not continue writing through an uncoordinated path once reservations are enabled.

## Environment names found

Firebase: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_MEASUREMENT_ID`, `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`.

Integrations: `POS_SYNC_API_TOKEN`, `VITE_ADMIN_EMAIL` (duplicate declaration), `VITE_IMAGEKIT_PUBLIC_KEY`, `VITE_IMAGEKIT_URL_ENDPOINT`, `IMAGEKIT_PRIVATE_KEY`, `VITE_IMAGEKIT_PRIVATE_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `VITE_RAZORPAY_KEY_ID`, `DELHIVERY_API_KEY`, `DELHIVERY_WAREHOUSE_NAME`, `D1_CLIENT_ID`, `D1_CLIENT_SECRET`, `D1_AUTH_URL`, `D1_REALM`, `D1_CLIENT_CMS`, `D1_MCP_URL`, `FAST2SMS_API_KEY`.

Additional names supported in the example/server include `FIREBASE_WEB_API_KEY`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `IMAGEKIT_PUBLIC_KEY`, `IMAGEKIT_URL_ENDPOINT`, `ALLOWED_ORIGINS`, `ADMIN_PHONE_NUMBERS`, `DELHIVERY_WEBHOOK_SECRET`, `ALLOW_DEV_OTP`, and SMTP credentials. Presence of a variable name is not proof the corresponding external service works.

## Source evidence

- `../Brothers_Outfit/brothers/package.json`, `src/firebase/firebaseApp.js`, `firebaseConfig.js`, `firebaseAuth.js`
- `../Brothers_Outfit/brothers/server.js`: auth, catalog, product upsert, inventory update, order creation/cancellation, Razorpay, ImageKit, status and exchange handlers
- `../Brothers_Outfit/brothers/src/server/posSync.js`, `docs/MR_MUNIM_POS_SYNC.md`, `scripts/backfill-pos-integration.js`
- `../Brothers_Outfit/brothers/src/services/{productService,adminService,orderService,userService}.js`
- `../Brothers_Outfit/brothers/src/pages/{CheckoutPage,Profile,TrackOrderPage}.jsx`, `src/pages/admin/AdminProductForm.jsx`, `firestore.rules`

This inspection preceded the owner's approval to edit checkout. The website checkout and catalog integration was subsequently changed locally; it has not been deployed. See `03-website-sync-plan.md` and `05-implementation-review.md`.
