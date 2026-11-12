export type Owner = { uid: string; email: string | null; role: 'owner' | 'manager' | 'cashier'; name?: string };
export type Mapping = { label: string; source: string; fields: string; plan: string };
export const mapping: Mapping[] = [
  { label: 'Products', source: 'products/{id}', fields: 'name · slug · salePrice · mrp · images · active', plan: 'Edit the same document. Preserve existing price aliases and image formats. No copied catalog.' },
  { label: 'Variants', source: 'products/{id}.variants[]', fields: 'id · sku · size · color · price · stock', plan: 'Keep the embedded variants and existing SKU registry. SKU identity changes require a coordinated migration.' },
  { label: 'Inventory', source: 'stockMovements', fields: 'productId · sku · deltaChange · source · stockAfter', plan: 'Keep the append-only movement ledger. Existing stock fields remain on-hand; nullable reserved fields let both apps calculate available = on-hand − reserved.' },
  { label: 'Orders', source: 'orders/{id}', fields: 'items · status · totalAmount · userId · paymentId', plan: 'Website and POS share orders. Add channel/invoice metadata in erp_orderMeta, referencing the original order.' },
  { label: 'Customers', source: 'users/{uid}', fields: 'fullName · phone · email · address', plan: 'Link verified phone first, then verified email. Private identity links preserve original auth UIDs and order ownership.' },
  { label: 'Images', source: 'products/{id}.images[]', fields: 'url · publicId · isPrimary · color', plan: 'Reuse ImageKit URLs and server upload credentials. Preserve legacy string entries.' },
  { label: 'Payments', source: 'orders/{id}', fields: 'paymentId · razorpayOrderId · paymentStatus', plan: 'Reuse Razorpay server credentials. Copy payment references into immutable invoice snapshots and reconcile server-side.' },
  { label: 'Access', source: 'ADMIN_PIN + server session', fields: 'four-digit PIN · expiring opaque cookie', plan: 'The local admin preview checks one PIN on the server. Website customer sign-in remains separate.' }
];
export const phases = [
  { number: 1, name: 'Foundation', state: 'local', label: 'BUILT LOCALLY',
    built: 'Separate app, owner/staff PIN sessions, trusted devices, schema mapping and guarded migration.',
    remaining: 'Harden access and deploy before public use.' },
  { number: 2, name: 'Inventory', state: 'partial', label: 'PARTLY BUILT',
    built: 'Shared variants, immediate purchases/new items, cost valuation, physical counts, reorder thresholds and detailed clothing labels.',
    remaining: 'Multiple locations, bulk import and live baseline cutover.' },
  { number: 3, name: 'Point of sale', state: 'partial', label: 'PARTLY BUILT',
    built: 'Barcode search, saved drafts/held bills, split payments, partial returns, paid-bill exchanges, recorded refunds and thermal layouts.',
    remaining: 'Live printer verification and payment-provider reconciliation. GST remains deferred.' },
  { number: 4, name: 'Relationships', state: 'partial', label: 'PARTLY BUILT',
    built: 'Customer editing and birthdays, udhar/repayments, manual multilingual WhatsApp drafts, suppliers and payment settlement.',
    remaining: 'Historical customer merge and loyalty redemption.' },
  { number: 5, name: 'Business insights', state: 'early', label: 'EARLY BUILD',
    built: 'Date-based sales/returns/collections reports, expenses, cash closing and bill search.',
    remaining: 'Complete historical cost accounting and live reconciliation verification.' },
  { number: 6, name: 'Shop anywhere', state: 'partial', label: 'PARTLY BUILT',
    built: 'PWA shell, offline provisional bills, same-key retry, server-checked recovery and pending-bill export.',
    remaining: 'Real-device offline/printer checks and large-catalog performance checks.' },
  { number: 7, name: 'Website sync', state: 'rollout', label: 'ROLLOUT PENDING',
    built: 'Shared Firestore catalog/orders, live order intake, sync health and guarded checkout reservation code.',
    remaining: 'Staging stock-writer cutover, payment reconciliation, WhatsApp credentials and race tests.' }
] as const;
export type Overview = {
  products: number; orders: number; customers: number; movements: number;
  checkedAt: string; businessWritesEnabled: boolean;
};
export type DashboardSummary = {
  products: number; variants: number; customers: number; orders: number;
  availableUnits: number; stockRetailValue: number; stockGstValue: number; stockTotalWithGst: number; lowStock: number; outOfStock: number;
  recentSales: number; websiteSales: number; posSales: number; pendingOrders: number;
  syncFailures: number; sampledOrders: number; checkedAt: string; businessWritesEnabled: boolean;
  lowStockItems: { id: string; name: string; sku: string; available: number }[];
  recentOrders: { id: string; customer: string; status: string; channel: 'POS' | 'Website'; total: number; createdAt: string | null }[];
};
