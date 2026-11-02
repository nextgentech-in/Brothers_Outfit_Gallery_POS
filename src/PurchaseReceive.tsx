import { useMemo, useState, type FormEvent } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';

type Product = { id: string; name: string; sku: string; barcode?: string; variants: { sku: string; barcode?: string; size?: string; color?: string; stock: number; costPrice?: number }[] };
type Supplier = { id: string; name: string };
type Line = { productId: string; name: string; sku: string; quantity: number; unitCost: number; stock: number };
const money = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PurchaseReceive({ products, suppliers, receive }: { products: Product[]; suppliers: Supplier[]; receive: (input: { supplierId: string; supplierInvoice: string; amountPaid: number; lines: { productId: string; sku: string; quantity: number; unitCost: number }[] }) => Promise<boolean> }) {
  const [supplierId, setSupplierId] = useState('');
  const [supplierInvoice, setSupplierInvoice] = useState('');
  const [amountPaid, setAmountPaid] = useState(0);
  const [search, setSearch] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');
  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return products.flatMap(product => (product.variants.length ? product.variants : [{ sku: product.sku, stock: 0 }]).map(variant => ({ product, variant })))
      .filter(({ product, variant }) => `${product.name} ${product.sku} ${product.barcode || ''} ${variant.sku} ${'barcode' in variant ? variant.barcode || '' : ''} ${'size' in variant ? variant.size || '' : ''} ${'color' in variant ? variant.color || '' : ''}`.toLowerCase().includes(term))
      .slice(0, 12);
  }, [products, search]);
  const total = lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
  function add(product: Product, variant: Product['variants'][number]) {
    setLines(current => current.some(line => line.productId === product.id && line.sku === variant.sku)
      ? current.map(line => line.productId === product.id && line.sku === variant.sku ? { ...line, quantity: line.quantity + 1 } : line)
      : [...current, { productId: product.id, name: product.name, sku: variant.sku, quantity: 1, unitCost: variant.costPrice || 0, stock: variant.stock }]);
    setSearch(''); setLocalError('');
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!lines.length) { setLocalError('Add at least one product variant.'); return; }
    if (lines.some(line => !Number.isInteger(line.quantity) || line.quantity < 1 || !Number.isFinite(line.unitCost) || line.unitCost < 0)) { setLocalError('Check the quantity and unit cost for each item.'); return; }
    if (amountPaid < 0 || amountPaid > total) { setLocalError('Amount paid must be between zero and the purchase total.'); return; }
    setBusy(true); setLocalError('');
    try {
      const saved = await receive({ supplierId, supplierInvoice, amountPaid, lines: lines.map(({ productId, sku, quantity, unitCost }) => ({ productId, sku, quantity, unitCost })) });
      if (saved) { setSupplierInvoice(''); setAmountPaid(0); setLines([]); }
    } finally { setBusy(false); }
  }
  return <div className="glass table-panel purchase-receive"><h2>Receive a purchase</h2><p className="microcopy">Search by product, SKU, barcode, size or colour. Add several variants to one supplier receipt.</p>
    <form onSubmit={event => void submit(event)}>
      <div className="purchase-top"><label>Supplier<select required value={supplierId} onChange={event => setSupplierId(event.target.value)}><option value="">Choose supplier</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Supplier invoice<input required value={supplierInvoice} onChange={event => setSupplierInvoice(event.target.value)} placeholder="Invoice number" /></label></div>
      <label className="purchase-search-label">Find product or scan barcode</label><div className="field-search purchase-search"><Search size={20} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search product name, SKU, barcode, size…" aria-label="Search products to receive" /></div>
      {search.trim() && <div className="purchase-matches" role="listbox" aria-label="Matching product variants">{matches.map(({ product, variant }) => <button type="button" key={`${product.id}:${variant.sku}`} onClick={() => add(product, variant)}><span><strong>{product.name}</strong><small>{variant.sku} · {'size' in variant ? variant.size || '' : ''} {'color' in variant ? variant.color || '' : ''} · Current stock {variant.stock}</small></span><Plus size={18} /></button>)}{!matches.length && <p>No matching products. Try another name or barcode.</p>}</div>}
      <div className="purchase-lines"><h3>Items to receive <span>{lines.length}</span></h3>{!lines.length && <p className="empty-cart">Search and add product variants above.</p>}{lines.map((line, index) => <div className="purchase-line" key={`${line.productId}:${line.sku}`}><div className="purchase-line-name"><strong>{line.name}</strong><small>{line.sku} · Current stock {line.stock}</small></div><label>Quantity<input type="number" min="1" step="1" value={line.quantity} onChange={event => setLines(current => current.map((item, i) => i === index ? { ...item, quantity: Number(event.target.value) } : item))} /></label><label>Unit cost ₹<input type="number" min="0" step="0.01" value={line.unitCost} onChange={event => setLines(current => current.map((item, i) => i === index ? { ...item, unitCost: Number(event.target.value) } : item))} /></label><strong className="purchase-line-total">{money(line.quantity * line.unitCost)}</strong><button className="purchase-remove" type="button" aria-label={`Remove ${line.name} ${line.sku}`} onClick={() => setLines(current => current.filter((_, i) => i !== index))}><Trash2 size={18} /></button></div>)}</div>
      <div className="purchase-footer"><label>Amount paid ₹<input type="number" min="0" max={total} step="0.01" value={amountPaid} onChange={event => setAmountPaid(Number(event.target.value))} /></label><div><small>Purchase total</small><strong>{money(total)}</strong><small>Balance due {money(Math.max(0, total - amountPaid))}</small></div><button className="button primary" disabled={busy || !lines.length}>{busy ? 'Receiving…' : 'Receive stock'}</button></div>{localError && <p className="error-banner" role="alert">{localError}</p>}
    </form></div>;
}
