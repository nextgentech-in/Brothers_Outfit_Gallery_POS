import { z } from 'zod';
const identity = z.string().trim().min(1).max(100).regex(/^[\w.:-]+$/);
const money = z.number().finite().min(0).max(10000000).refine(n => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001, 'Use two decimal places.');
export const purchaseLineSchema = z.object({ productId: identity.optional(), sku: identity, quantity: z.number().int().min(1).max(10000), unitCost: money,
  salePrice: money.optional(), mrp: money.optional(),
  newItem: z.object({ name: z.string().trim().min(2).max(200), category: z.string().trim().min(2).max(100),
    brand: z.string().trim().max(100).default(''), design: z.string().trim().max(100).default(''), fabric: z.string().trim().max(100).default(''),
    size: z.string().trim().min(1).max(50), color: z.string().trim().min(1).max(80),
    gstEnabled: z.boolean().optional(), gstPercent: z.number().finite().min(0).max(100).optional() }).strict().optional()
}).strict().superRefine((line, ctx) => {
  if (Boolean(line.productId) === Boolean(line.newItem)) ctx.addIssue({ code: 'custom', message: 'Select an existing item or enter a new item.' });
  if (line.newItem && (!line.salePrice || !line.mrp)) ctx.addIssue({ code: 'custom', message: 'New items need selling price and MRP.' });
  if (line.salePrice !== undefined && line.mrp !== undefined && (line.salePrice <= 0 || line.salePrice > line.mrp)) ctx.addIssue({ code: 'custom', message: 'Selling price must be positive and cannot exceed MRP.' });
  if (line.newItem?.gstEnabled && !line.newItem.gstPercent) ctx.addIssue({ code: 'custom', message: 'Choose a GST percentage for this item.' });
});
export const purchaseSchema = z.object({ requestId: z.string().min(12).max(128).regex(/^[\w.:-]+$/), supplierId: identity,
  supplierInvoice: z.string().trim().min(1).max(80), paymentMethod: z.enum(['cash','upi','card']).default('cash'), amountPaid: money.default(0),
  lines: z.array(purchaseLineSchema).min(1).max(30), mode: z.enum(['order', 'receive']).default('receive') }).strict();
export type PurchaseLine = z.infer<typeof purchaseLineSchema>;
export type PurchaseInput = z.infer<typeof purchaseSchema>;
