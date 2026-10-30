export type Owner = { uid: string; email: string | null; role: 'owner' };
export type Mapping = { label: string; source: string; fields: string; plan: string };
export const mapping: Mapping[] = [
  { label: 'Products', source: 'products/{id}', fields: 'name · slug · salePrice · mrp · images · active', plan: 'Edit the same document. Preserve existing price aliases and image formats. No copied catalog.' },
  { label: 'Variants', source: 'products/{id}.variants[]', fields: 'id · sku · size · color · price · stock', plan: 'Keep the embedded variants and existing SKU registry. SKU identity changes require a coordinated migration.' },
  { label: 'Inventory', source: 'stockMovements', fields: 'productId · sku · deltaChange · source · stockAfter', plan: 'One append-only ledger. Add private erp_stockBalances and erp_reservations; project available into existing stock fields atomically.' },
  { label: 'Orders', source: 'orders/{id}', fields: 'items · status · totalAmount · userId · paymentId', plan: 'Website and POS share orders. Add channel/invoice metadata in erp_orderMeta, referencing the original order.' },
  { label: 'Customers', source: 'users/{uid}', fields: 'fullName · phone · email · address', plan: 'Link verified phone first, then verified email. Private identity links preserve original auth UIDs and order ownership.' },
  { label: 'Images', source: 'products/{id}.images[]', fields: 'url · publicId · isPrimary · color', plan: 'Reuse ImageKit URLs and server upload credentials. Preserve legacy string entries.' },
  { label: 'Payments', source: 'orders/{id}', fields: 'paymentId · razorpayOrderId · paymentStatus', plan: 'Reuse Razorpay server credentials. Copy payment references into immutable invoice snapshots and reconcile server-side.' },
  { label: 'Access', source: 'ADMIN_PIN + server session', fields: 'four-digit PIN · expiring opaque cookie', plan: 'The local admin preview checks one PIN on the server. Website customer sign-in remains separate.' }
];
export const phases = [
  { number: 1, name: 'Foundation', detail: 'Inspection, mapping, separate app, owner login, migration review', state: 'current' },
  { number: 2, name: 'Inventory', detail: 'Shared products, variants, stock ledger, barcode labels', state: 'planned' },
  { number: 3, name: 'Point of sale', detail: 'Billing, GST invoices, printing, returns and exchanges', state: 'planned' },
  { number: 4, name: 'Relationships', detail: 'Customers, suppliers, purchases and credit ledger', state: 'planned' },
  { number: 5, name: 'Business insights', detail: 'Dashboard, reports, GST export and backups', state: 'planned' },
  { number: 6, name: 'Shop anywhere', detail: 'PWA, offline queue, performance and security checks', state: 'planned' },
  { number: 7, name: 'Website sync', detail: 'Reservations, order intake, status updates, customer links, sync health and race tests', state: 'planned' }
];
export type Overview = {
  products: number; orders: number; customers: number; movements: number;
  checkedAt: string; businessWritesEnabled: boolean;
};
