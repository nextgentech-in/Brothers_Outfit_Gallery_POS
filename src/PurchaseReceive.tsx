import { purchaseCsv } from '../shared/purchaseCsv';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import { readAdmin, writeAdmin } from './adminApi';
import { purchaseSchema, type PurchaseInput, type PurchaseLine } from '../shared/purchases';
type Product = { id: string; name: string; sku: string; barcode?: string; price?: number; mrp?: number; costPrice?: number; stock: number; variants: { sku: string; barcode?: string; size?: string; color?: string; stock: number; price?: number; mrp?: number; costPrice?: number }[] };
type Supplier = { id: string; name: string };
type Line = PurchaseLine & { label: string; rowId: string };
type Order = { id: string; supplierName: string; supplierInvoice: string; total: number; status: string };
const money = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pendingKey = 'brothers-purchase-pending-v2';
export function PurchaseReceive({ products, suppliers, receive }: { products: Product[]; suppliers: Supplier[]; receive: (input: PurchaseInput) => Promise<void> }) {
  const [supplierId, setSupplierId] = useState(''), [supplierInvoice, setSupplierInvoice] = useState('');
  const [amountPaid, setAmountPaid] = useState(0), [mode, setMode] = useState<'order' | 'receive'>('receive');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'card'>('cash');
  const [search, setSearch] = useState(''), [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const command = useRef<PurchaseInput | null>(null);
  const [orders, setOrders] = useState<Order[]>([]), [payments, setPayments] = useState<Record<string, string>>({}), [orderMethods,setOrderMethods]=useState<Record<string,string>>({});
  const loadOrders = () => readAdmin<{ items: Order[] }>('purchase-orders').then(data => setOrders(data.items)).catch(() => {});
  useEffect(() => { void loadOrders(); try { const saved = JSON.parse(localStorage.getItem(pendingKey) || 'null'); if (saved && purchaseSchema.safeParse(saved).success) { command.current = saved; setSupplierId(saved.supplierId); setSupplierInvoice(saved.supplierInvoice); setMode(saved.mode); setAmountPaid(saved.amountPaid); setPaymentMethod(saved.paymentMethod || 'cash'); setLines(saved.lines.map((line: PurchaseLine, index: number) => ({ ...line, rowId: String(index), label: line.newItem?.name || line.sku }))); setUncertain(true); setError('A previous purchase has an unconfirmed result. Retry the saved purchase.'); } } catch {} }, []);
  const matches = useMemo(() => products.flatMap(product => (product.variants.length ? product.variants : [{ sku: product.sku, stock: product.stock, price: product.price, costPrice: product.costPrice }]).map(variant => ({ product, variant }))).filter(({ product, variant }) => search.trim() && `${product.name} ${variant.sku} ${'size' in variant ? variant.size : ''} ${'color' in variant ? variant.color : ''}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 15), [products, search]);
  const total = lines.reduce((sum, line) => sum + Math.round(line.unitCost * 100) * line.quantity, 0) / 100;
  const patch = (rowId: string, values: Partial<Line>) => setLines(old => old.map(line => line.rowId === rowId ? { ...line, ...values } : line));
  function add(product: Product, variant: Product['variants'][number]) {
    setLines(old => old.some(line => line.productId === product.id && line.sku === variant.sku) ? old.map(line => line.productId === product.id && line.sku === variant.sku ? { ...line, quantity: line.quantity + 1 } : line) : [...old, { rowId: crypto.randomUUID(), label: product.name, productId: product.id, sku: variant.sku, quantity: 1, unitCost: variant.costPrice ?? product.costPrice ?? 0, salePrice: variant.price ?? product.price ?? 0, mrp: variant.mrp ?? product.mrp ?? 0 }]); setSearch('');
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setError(''); setNotice('');
    if (!command.current) {
      const parsed = purchaseSchema.safeParse({ requestId: crypto.randomUUID(), supplierId, supplierInvoice, amountPaid, paymentMethod, mode, lines: lines.map(({ label, rowId, ...line }) => line) });
      if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
      if (amountPaid > total) { setError('Amount paid exceeds total.'); return; }
      command.current = parsed.data;
    }
    setBusy(true);
    try {
      localStorage.setItem(pendingKey, JSON.stringify(command.current));
      await receive(command.current); localStorage.removeItem(pendingKey); command.current = null;
      setUncertain(false); setLines([]); setSupplierInvoice(''); setAmountPaid(0); setNotice(mode === 'order' ? 'Purchase order saved. Stock changes when received.' : 'Purchase received. New items, prices and stock saved together.'); await loadOrders();
    } catch (e) { const status = (e as { status?: number }).status;
      if (status && [400,404,409,422].includes(status)) { command.current = null; localStorage.removeItem(pendingKey); setUncertain(false); } else setUncertain(true);
      setError((e as Error).message);
    } finally { setBusy(false); }
  }
  async function receiveOrder(order: Order) {
    if (busy) return; setBusy(true); setError('');
    const key=`receive-pending-${order.id}`;
    try { const command=JSON.parse(localStorage.getItem(key)||'null')||{ requestId: crypto.randomUUID(), orderId: order.id, amountPaid: Number(payments[order.id] || 0), paymentMethod:orderMethods[order.id]||'cash' };localStorage.setItem(key,JSON.stringify(command));await writeAdmin('purchases/receive-order', command);localStorage.removeItem(key); await loadOrders(); setNotice('Order received. Refresh the catalog to view its new items and stock.'); }
    catch (e) { if([400,404,409,422].includes((e as any).status))localStorage.removeItem(key);setError((e as Error).message); } finally { setBusy(false); }
  }
  return <div className="glass table-panel purchase-receive"><h2>Purchase order / stock receipt</h2><p className="microcopy">Create new items here or select existing stock. Cost × quantity is the purchase stock value. Customer barcode labels show MRP and sale price, never purchase cost.</p>
    {error && <p className="error-banner" role="alert">{error}</p>}{notice && <p className="success-banner" role="status">{notice}</p>}
    <form onSubmit={event => void submit(event)}><fieldset disabled={busy || uncertain} className="purchase-fieldset">
      <div className="purchase-top"><label>Supplier<select required value={supplierId} onChange={e => setSupplierId(e.target.value)}><option value="">Choose supplier</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Supplier invoice / order reference<input required value={supplierInvoice} onChange={e => setSupplierInvoice(e.target.value)} /></label><label>Save as<select aria-label="Purchase status" value={mode} onChange={e => { setMode(e.target.value as typeof mode); setAmountPaid(0); }}><option value="order">Purchase order — awaiting goods</option><option value="receive">Received — add stock now</option></select></label></div>
      <details><summary>Import purchase items from CSV</summary><p><a href="/purchase-template.csv" download>Download CSV template</a>. Import up to 30 rows, review all values below, then receive the purchase.</p><label>Import CSV<input type="file" accept=".csv,text/csv" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{const imported=purchaseCsv(await file.text());if(imported.length+lines.length>30)throw new Error('A purchase supports up to 30 items.');setLines(old=>[...old,...imported.map(line=>({...line,rowId:crypto.randomUUID(),label:line.newItem?.name||line.sku}))]);setError('');}catch(error){setError((error as Error).message);}e.target.value='';}}/></label></details><div className="commerce-toolbar"><div className="field-search"><Search size={18} /><input aria-label="Search products to receive" placeholder="Find existing item, size or SKU" value={search} onChange={e => setSearch(e.target.value)} /></div><button type="button" className="button secondary" onClick={() => setLines(old => [...old, { rowId: crypto.randomUUID(), label: 'New item', sku: `NEW-${crypto.randomUUID().slice(0,8).toUpperCase()}`, quantity: 1, unitCost: 0, salePrice: 0, mrp: 0, newItem: { name: '', category: 'Clothing', brand: '', design: '', fabric: '', size: '', color: '' } }])}><Plus size={16} />Add new item</button></div>
      {matches.map(({ product, variant }) => <button type="button" className="button secondary" key={`${product.id}:${variant.sku}`} onClick={() => add(product, variant)}>{product.name} · {variant.sku}</button>)}
      {lines.map(line => <article className="purchase-item-card" key={line.rowId}><header><strong>{line.newItem ? 'New catalog item' : line.label}</strong><button type="button" className="icon-button" aria-label={`Remove ${line.label}`} onClick={() => setLines(old => old.filter(x => x.rowId !== line.rowId))}><Trash2 size={18} /></button></header>
        {line.newItem && <div className="purchase-item-fields">{(['name','category','brand','design','fabric','size','color'] as const).map(field => <label key={field}>{({ name: 'Item name', category: 'Category', brand: 'Brand', design: 'Design / article', fabric: 'Fabric', size: 'Size', color: 'Colour' })[field]}<input required={['name','category','size','color'].includes(field)} value={line.newItem![field]} maxLength={field === 'name' ? 200 : 80} onChange={e => patch(line.rowId, { newItem: { ...line.newItem!, [field]: e.target.value } })} /></label>)}<label>SKU / barcode base<input required pattern="[A-Za-z0-9_.:-]+" maxLength={100} value={line.sku} onChange={e => patch(line.rowId, { sku: e.target.value })} /></label></div>}
        <div className="purchase-item-fields">{([{ field: 'quantity', label: 'Quantity', min: 1, step: 1 }, { field: 'unitCost', label: 'Cost per item ₹', min: 0, step: .01 }, { field: 'salePrice', label: 'Sale price ₹', min: .01, step: .01 }, { field: 'mrp', label: 'MRP ₹', min: .01, step: .01 }] as const).map(({ field, label, min, step }) => <label key={field}>{label}<input required type="number" min={min} step={step} value={line[field] ?? 0} onChange={e => patch(line.rowId, { [field]: Number(e.target.value) })} /></label>)}</div>
        <p><strong>Stock cost: {money(line.unitCost)} × {line.quantity} = {money(Math.round(line.unitCost * 100) * line.quantity / 100)}</strong></p></article>)}
      <div className="purchase-footer">{mode === 'receive' && <label>Payment method<select aria-label="Purchase payment method" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as typeof paymentMethod)}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option></select></label>}{mode === 'receive' && <label>Amount paid ₹<input type="number" min="0" max={total} step=".01" value={amountPaid} onChange={e => setAmountPaid(Number(e.target.value))} /></label>}<div><small>Total stock cost</small><strong>{money(total)}</strong><small>{mode === 'receive' ? `Supplier balance ${money(total - amountPaid)}` : 'No stock increase until receipt'}</small></div></div>
    </fieldset><button className="button primary" disabled={busy || !lines.length}>{busy ? 'Saving…' : uncertain ? 'Retry saved purchase' : mode === 'order' ? 'Create purchase order' : 'Receive stock & create items'}</button></form>
    <h3>Purchase orders</h3><div className="table-wrap"><table><thead><tr><th>Supplier / reference</th><th>Stock cost</th><th>Status</th><th>Receive</th></tr></thead><tbody>{orders.map(order => <tr key={order.id}><td>{order.supplierName}<small>{order.supplierInvoice}</small></td><td>{money(order.total)}</td><td>{order.status}</td><td>{order.status === 'ordered' && <><input aria-label={`Amount paid for ${order.supplierInvoice}`} type="number" min="0" max={order.total} step=".01" value={payments[order.id] || ''} placeholder="Amount paid ₹" onChange={e => setPayments(old => ({ ...old, [order.id]: e.target.value }))} /><select aria-label={`Payment method for ${order.supplierInvoice}`} value={orderMethods[order.id]||'cash'} onChange={e=>setOrderMethods(old=>({...old,[order.id]:e.target.value}))}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option></select><button type="button" className="button secondary" disabled={busy} onClick={() => void receiveOrder(order)}>Mark received</button></>}</td></tr>)}</tbody></table></div>
  </div>;
}
