import { useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Search, Trash2 } from 'lucide-react';
import { writeAdmin } from './adminApi';
import type { PrintableItem } from './BarcodePrintModal';
import type { PurchaseLine } from '../shared/purchases';

const money = (n: unknown) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
type CatalogVariant = { sku: string; barcode?: string; size?: string; color?: string; stock: number; price?: number; mrp?: number; costPrice?: number };
export type CatalogProduct = { id: string; name: string; sku: string; productNumber?: number; barcode?: string; price?: number; mrp?: number; costPrice?: number;
  stock: number; brand?: string; design?: string; fabric?: string; category?: string; variants: CatalogVariant[] };
type RecordLine = { productId?: string; sku?: string; name?: string; quantity?: number; unitCost?: number; salePrice?: number; mrp?: number; newItem?: PurchaseLine['newItem'] };
export type EditablePurchase = { id: string; supplierName: string; supplierInvoice: string; total?: number; lines?: RecordLine[] };

/** Dialog with a fixed header (and optional fixed `top`/`footer`); only the middle scrolls. */
function Modal({ title, subtitle, busy, onClose, children, top, footer, width = 520 }: { title: string; subtitle?: string; busy?: boolean; onClose: () => void; children: ReactNode; top?: ReactNode; footer?: ReactNode; width?: number }) {
  return createPortal(<div className="editor-backdrop" onClick={() => { if (!busy) onClose(); }}>
    <div className="glass table-panel" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}
      style={{ width: `min(${width}px, 94vw)`, margin: 'auto', maxHeight: 'calc(100vh - 40px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, borderBottom: '1px solid var(--line)', paddingBottom: 12 }}>
        <div><h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>{subtitle && <small style={{ color: 'var(--muted)' }}>{subtitle}</small>}</div>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose} disabled={busy}>×</button>
      </div>
      {top && <div style={{ flex: 'none' }}>{top}</div>}
      <div style={{ flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overscrollBehavior: 'contain', paddingRight: 4 }}>{children}</div>
      {footer && <div style={{ flex: 'none' }}>{footer}</div>}
    </div></div>, document.body);
}

/** "Blue · Size 32" for a catalog variant, or for a new item's own colour/size. */
function variantDetails(color?: string, size?: string) {
  return [color && String(color).trim(), size && `Size ${String(size).trim()}`].filter(Boolean).join(' · ');
}

/** Yes/no confirmation that runs `action` and shows its error in place. */
export function ConfirmDialog({ title, message, confirmLabel, onConfirm, onClose }: { title: string; message: ReactNode; confirmLabel: string; onConfirm: () => Promise<void>; onClose: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  return <Modal title={title} busy={busy} onClose={onClose}>
    <div style={{ fontSize: 14, lineHeight: 1.6 }}>{message}</div>
    {error && <p className="error-banner" role="alert">{error}</p>}
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
      <button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancel</button>
      <button type="button" className="button primary danger-action" disabled={busy} onClick={async () => {
        setBusy(true); setError('');
        try { await onConfirm(); onClose(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
      }}>{busy ? 'Deleting…' : confirmLabel}</button>
    </div>
  </Modal>;
}

export function DeleteBillDialog({ invoice, onClose, onDeleted }: { invoice: { id: string; total?: number; customerName?: string; lines?: RecordLine[] }; onClose: () => void; onDeleted: (message: string) => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const ids = useRef<Record<string, string>>({});
  const units = (invoice.lines || []).reduce((n, l) => n + Number(l.quantity || 0), 0);
  async function remove(restock: boolean) {
    const mode = restock ? 'restock' : 'permanent';
    ids.current[mode] ||= crypto.randomUUID();
    setBusy(true); setError('');
    try {
      const r = await writeAdmin<{ restocked: number; coinDelta: number; creditReversed: number }>('invoices/delete', { requestId: ids.current[mode], invoiceId: invoice.id, restock });
      onDeleted(`Bill ${invoice.id} deleted${restock ? `; ${units} unit(s) returned to stock` : ' permanently; stock unchanged'}.` +
        (r.coinDelta ? ` ${Math.abs(r.coinDelta)} coin(s) ${r.coinDelta < 0 ? 'taken back from' : 'returned to'} the customer.` : '') +
        (r.creditReversed ? ` Udhar of ${money(r.creditReversed)} cleared.` : ''));
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Modal title={`Delete bill ${invoice.id}?`} subtitle={`${invoice.customerName || 'Walk-in'} · ${money(invoice.total)} · ${units} unit(s)`} busy={busy} onClose={onClose}>
    <p style={{ fontSize: 14, lineHeight: 1.6, marginTop: 0 }}>Choose what happens to the items on this bill. Any loyalty coins this bill earned are taken back from the customer (never below zero), and any unpaid udhar on it is cleared. This cannot be undone.</p>
    <ul style={{ fontSize: 13, lineHeight: 1.6, paddingLeft: 18 }}>{(invoice.lines || []).map((l, i) => <li key={i}>{l.name || l.sku} · {l.sku} × {l.quantity}</li>)}</ul>
    {error && <p className="error-banner" role="alert">{error}</p>}
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
      <button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancel</button>
      <button type="button" className="button secondary danger-action" disabled={busy} onClick={() => void remove(false)}>Delete permanently</button>
      <button type="button" className="button primary" disabled={busy} onClick={() => void remove(true)}>{busy ? 'Deleting…' : 'Restock & delete'}</button>
    </div>
  </Modal>;
}

/** Labels for every PO/receipt line, one copy per unit purchased. */
export function purchasePrintItems(lines: RecordLine[] | undefined, products: CatalogProduct[]): PrintableItem[] {
  return (lines || []).flatMap(line => {
    const product = products.find(p => p.id === line.productId);
    if (!product && !line.newItem) return [];
    const base = product || { id: line.productId || line.sku || 'new-item', name: line.newItem?.name || line.name || line.sku || 'Item', sku: line.sku || '',
      brand: line.newItem?.brand, design: line.newItem?.design, fabric: line.newItem?.fabric, category: line.newItem?.category, price: line.salePrice, mrp: line.mrp };
    const variant = product?.variants.find(v => v.sku === line.sku);
    return [{ product: base, variant: { ...variant, sku: variant?.sku || line.sku || base.sku, barcode: variant?.barcode || (product && !product.variants.length ? product.barcode : undefined),
      size: variant?.size ?? line.newItem?.size, color: variant?.color ?? line.newItem?.color,
      price: line.salePrice ?? variant?.price ?? product?.price, mrp: line.mrp ?? variant?.mrp ?? product?.mrp }, defaultCopies: Number(line.quantity || 0) }];
  });
}

type EditLine = RecordLine & { rowId: string; label: string };
export function PurchaseEditDialog({ kind, record, products, onClose, onSaved }: { kind: 'purchase' | 'order'; record: EditablePurchase; products: CatalogProduct[]; onClose: () => void; onSaved: (message: string) => void }) {
  const [lines, setLines] = useState<EditLine[]>(() => (record.lines || []).map((l, i) => ({ ...l, rowId: String(i),
    label: l.newItem?.name || l.name || products.find(p => p.id === l.productId)?.name || l.sku || 'Item' })));
  const [search, setSearch] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const command = useRef<{ key: string; requestId: string } | null>(null);
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase(); if (!q) return [];
    return products.flatMap(p => (p.variants.length ? p.variants : [{ sku: p.sku, stock: p.stock, price: p.price, mrp: p.mrp, costPrice: p.costPrice }]).map(v => ({ p, v })))
      .filter(({ p, v }) => `${p.productNumber ? `#${p.productNumber}` : ''} ${p.name} ${v.sku} ${'size' in v ? v.size : ''} ${'color' in v ? v.color : ''}`.toLowerCase().includes(q));
  }, [products, search]);
  const MATCH_LIMIT = 300; // the list scrolls, so show every match; cap only guards against one-letter searches over a huge catalog
  const shownMatches = matches.slice(0, MATCH_LIMIT);
  const total = lines.reduce((n, l) => n + Math.round(Number(l.unitCost || 0) * 100) * Number(l.quantity || 0), 0) / 100;
  const patch = (rowId: string, values: Partial<EditLine>) => setLines(old => old.map(l => l.rowId === rowId ? { ...l, ...values } : l));
  // The search is kept after adding, so several sizes/colours of the same product can be added in a row.
  const isAdded = (p: CatalogProduct, v: CatalogVariant) => lines.some(l => l.productId === p.id && l.sku === v.sku);
  function add(p: CatalogProduct, v: CatalogVariant) {
    setError('');
    if (lines.some(l => l.productId === p.id && l.sku === v.sku)) { setError('That item is already on this purchase. Change its quantity instead.'); return; }
    setLines(old => [...old, { rowId: crypto.randomUUID(), label: p.name, productId: p.id, sku: v.sku, quantity: 1, unitCost: v.costPrice ?? p.costPrice ?? 0, salePrice: v.price ?? p.price, mrp: v.mrp ?? p.mrp }]);
  }
  async function save() {
    setError('');
    if (!lines.length) { setError('Keep at least one item. To cancel everything, return the goods to the supplier instead.'); return; }
    if (lines.some(l => !Number.isInteger(Number(l.quantity)) || Number(l.quantity) < 1)) { setError('Every quantity must be a whole number of at least 1.'); return; }
    const payloadLines = lines.map(({ rowId, label, name, ...l }) => kind === 'purchase'
      ? { productId: l.productId!, sku: l.sku!, quantity: Number(l.quantity), unitCost: Number(l.unitCost || 0),
          ...(l.salePrice !== undefined ? { salePrice: Number(l.salePrice) } : {}), ...(l.mrp !== undefined ? { mrp: Number(l.mrp) } : {}) }
      : Object.fromEntries(Object.entries({ ...l, quantity: Number(l.quantity), unitCost: Number(l.unitCost || 0) }).filter(([, v]) => v !== undefined && v !== null)));
    const key = JSON.stringify(payloadLines);
    if (command.current?.key !== key) command.current = { key, requestId: crypto.randomUUID() };
    setBusy(true);
    try {
      if (kind === 'purchase') {
        const r = await writeAdmin<{ total: number; payable: number; stockChanges: number }>('purchases/update', { requestId: command.current.requestId, purchaseId: record.id, lines: payloadLines });
        onSaved(`Receipt ${record.id} updated: total ${money(r.total)}, payable ${money(r.payable)}, ${r.stockChanges} stock change(s).`);
      } else {
        const r = await writeAdmin<{ total: number }>('purchase-orders/update', { requestId: command.current.requestId, orderId: record.id, lines: payloadLines });
        onSaved(`Purchase order ${record.id} updated: total ${money(r.total)}.`);
      }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const fields = [{ field: 'quantity', label: 'Qty', step: 1, min: 1 }, { field: 'unitCost', label: 'Purchase rate ₹', step: .01, min: 0 },
    { field: 'salePrice', label: 'Sale price ₹', step: .01, min: .01 }, { field: 'mrp', label: 'MRP ₹', step: .01, min: .01 }] as const;
  const lineDetails = (line: EditLine) => {
    const v = products.find(p => p.id === line.productId)?.variants.find(x => x.sku === line.sku);
    return variantDetails(v?.color ?? line.newItem?.color, v?.size ?? line.newItem?.size);
  };
  const units = lines.reduce((n, l) => n + Number(l.quantity || 0), 0);
  const top = <>
    <p className="microcopy" style={{ marginTop: 0 }}>{kind === 'purchase'
      ? 'Stock changes by the difference from what was received, and each item’s purchase rate is re-weighted the same way as receiving. Items already sold cannot be removed.'
      : 'This order has not been received, so stock does not change until you mark it received.'}</p>
    <div className="field-search" style={{ marginBottom: 8 }}><Search size={16} /><input aria-label="Add item to purchase" placeholder="Add an existing item, colour, size or SKU" value={search} onChange={e => setSearch(e.target.value)} /></div>
    {search.trim() && <small style={{ display: 'block', color: 'var(--muted)', marginBottom: 4 }}>{matches.length
      ? `${matches.length} match(es)${matches.length > MATCH_LIMIT ? ` — showing the first ${MATCH_LIMIT}, type more to narrow down` : ''}`
      : 'No matching items'}</small>}
    {shownMatches.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10, maxHeight: 260, overflowY: 'auto', overscrollBehavior: 'contain', padding: 2 }}>
      {shownMatches.map(({ p, v }) => { const details = variantDetails('color' in v ? v.color : undefined, 'size' in v ? v.size : undefined);
        return <button type="button" className="button secondary" style={{ textAlign: 'left', lineHeight: 1.3, ...(isAdded(p, v) ? { cursor: 'default' } : {}) }} key={`${p.id}:${v.sku}`} disabled={isAdded(p, v)} aria-pressed={isAdded(p, v)} onClick={() => add(p, v)}>
          {isAdded(p, v) && <span style={{ color: 'var(--accent)', fontWeight: 700 }}>✓ Added · </span>}{p.name}{details && <> · <span style={{ color: 'var(--accent)' }}>{details}</span></>}<small style={{ display: 'block', fontWeight: 400, color: 'var(--muted)' }}>{v.sku} · {v.stock ?? 0} in stock</small></button>; })}
    </div>}
    <small style={{ display: 'block', color: 'var(--muted)', marginBottom: 6 }}>{lines.length} item(s) · {units} unit(s)</small>
  </>;
  const footer = <>
    {error && <p className="error-banner" role="alert">{error}</p>}
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 10, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
      <span>New total <strong>{money(total)}</strong>{record.total !== undefined && <small style={{ color: 'var(--muted)' }}> (was {money(record.total)})</small>}</span>
      <div style={{ display: 'flex', gap: 10 }}>
        <button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancel</button>
        <button type="button" className="button primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save changes'}</button>
      </div>
    </div>
  </>;
  return <Modal width={820} busy={busy} onClose={onClose} title={kind === 'purchase' ? `Edit stock receipt ${record.id}` : `Edit purchase order ${record.id}`}
    subtitle={`${record.supplierName} · ${record.supplierInvoice}`} top={top} footer={footer}>
    {lines.map(line => { const details = lineDetails(line); return <article className="purchase-item-card" key={line.rowId}>
      <header><strong>{line.label}
          {details && <span style={{ display: 'block', fontWeight: 600, fontSize: 14, color: 'var(--accent)', marginTop: 2 }}>{details}</span>}
          <small style={{ display: 'block', fontWeight: 400 }}>{line.sku}{line.newItem ? ' · new catalog item' : ''}</small></strong>
        <button type="button" className="icon-button" aria-label={`Remove ${line.label}${details ? ` ${details}` : ''}`} onClick={() => setLines(old => old.filter(l => l.rowId !== line.rowId))}><Trash2 size={18} /></button></header>
      <div className="purchase-item-fields">{fields.map(({ field, label, step, min }) => <label key={field}>{label}
        <input aria-label={`${label} ${line.label} ${details}`.trim()} type="number" min={min} step={step} value={line[field] ?? ''} onChange={e => patch(line.rowId, { [field]: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>)}</div>
    </article>; })}
  </Modal>;
}
