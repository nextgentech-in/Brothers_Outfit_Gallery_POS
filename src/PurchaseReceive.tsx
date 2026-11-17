import { purchaseCsv } from '../shared/purchaseCsv';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Search, Trash2, Printer } from 'lucide-react';
import { purchaseSchema, type PurchaseInput, type PurchaseLine } from '../shared/purchases';
import { BarcodePrintModal, type PrintableItem } from './BarcodePrintModal';
export type { PurchaseInput };
type Product = { id: string; name: string; sku: string; productNumber?: number; barcode?: string; price?: number; mrp?: number; costPrice?: number; stock: number; variants: { sku: string; barcode?: string; size?: string; color?: string; stock: number; price?: number; mrp?: number; costPrice?: number }[] };
type Supplier = { id: string; name: string; phone?: string; address?: string };
type Line = PurchaseLine & { label: string; rowId: string };
const money = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export function PurchaseReceive({ products, suppliers, receive, mode = 'receive' }: {
  products: Product[];
  suppliers: Supplier[];
  receive: (input: PurchaseInput) => Promise<void>;
  mode?: PurchaseInput['mode'];
}) {
  const isOrder = mode === 'order';
  const pendingKey = `brothers-purchase-pending-v2-${mode}`;
  const [supplierInvoiceDate, setSupplierInvoiceDate] = useState('');
  const [includesTax, setIncludesTax] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierAddress, setSupplierAddress] = useState('');
  const [selectedSku, setSelectedSku] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [supplierId, setSupplierId] = useState(''), [supplierInvoice, setSupplierInvoice] = useState('');
  const [amountPaid, setAmountPaid] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'card'>('cash');
  const [search, setSearch] = useState(''), [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [printItems, setPrintItems] = useState<PrintableItem[] | null>(null);
  const [lastReceivedPrintItems, setLastReceivedPrintItems] = useState<PrintableItem[] | null>(null);
  const command = useRef<PurchaseInput | null>(null);
  useEffect(() => {
    try {
      const legacyKey = 'brothers-purchase-pending-v2';
      const current = localStorage.getItem(pendingKey);
      const saved = purchaseSchema.safeParse(JSON.parse(current || localStorage.getItem(legacyKey) || 'null'));
      if (!saved.success || saved.data.mode !== mode) return;
      const input = saved.data;
      localStorage.setItem(pendingKey, JSON.stringify(input));
      if (!current) localStorage.removeItem(legacyKey);
      command.current = input;
      setSupplierId(input.supplierId);
      setSupplierInvoice(input.supplierInvoice);
      setSupplierInvoiceDate(input.supplierInvoiceDate ?? '');
      setIncludesTax(input.includesTax ?? false);
      setSupplierAddress(input.supplierAddress ?? '');
      setAmountPaid(input.amountPaid);
      setPaymentMethod(input.paymentMethod);
      setLines(input.lines.map((line, index) => ({ ...line, rowId: String(index), label: line.newItem?.name || line.sku })));
      setUncertain(true);
      setError('A previous purchase has an unconfirmed result. Retry the saved purchase.');
    } catch { /* Local storage may be unavailable. */ }
  }, [mode, pendingKey]);
  const matches = useMemo(() => {
    const raw = search.trim();
    const q = raw.toLowerCase();
    const cleanNum = raw.replace(/^#/, '').trim();
    const isNum = /^\d+$/.test(cleanNum);
    const parsedNum = isNum ? parseInt(cleanNum, 10) : null;
    if (!q && !isOrder) return [];
    return products.flatMap(product => (product.variants.length ? product.variants : [{ sku: product.sku, stock: product.stock, price: product.price, costPrice: product.costPrice, mrp: product.mrp, barcode: product.barcode }]).map(variant => ({ product, variant }))).filter(({ product, variant }) => {
      if (parsedNum !== null && product.productNumber === parsedNum) return true;
      return `${product.productNumber ? `#${product.productNumber}` : ''} ${product.name} ${variant.sku} ${variant.barcode ?? ''} ${'size' in variant ? variant.size : ''} ${'color' in variant ? variant.color : ''}`.toLowerCase().includes(q);
    }).slice(0, 15);
  }, [products, search, isOrder]);
  const total = lines.reduce((sum, line) => sum + Math.round(line.unitCost * 100) * line.quantity, 0) / 100;
  const patch = (rowId: string, values: Partial<Line>) => setLines(old => old.map(line => line.rowId === rowId ? { ...line, ...values } : line));
  const productKey = (product: Product, variant: Product['variants'][number]) => JSON.stringify([product.id, variant.sku]);
  const selected = matches.find(({ product, variant }) => productKey(product, variant) === selectedSku);
  function add(product: Product, variant: Product['variants'][number], count = 1) {
    const rate = variant.price ?? product.price;
    const mrp = variant.mrp ?? product.mrp ?? rate;
    setLines(previous => {
      const existing = previous.find(line => line.productId === product.id && line.sku === variant.sku);
      if (existing) return previous.map(line => line.rowId === existing.rowId ? { ...line, quantity: line.quantity + count } : line);
      return [...previous, {
        rowId: crypto.randomUUID(), label: product.name, productId: product.id, sku: variant.sku,
        quantity: count, unitCost: variant.costPrice ?? product.costPrice ?? 0,
        ...(rate && mrp && rate <= mrp ? { salePrice: rate, mrp } : {})
      }];
    });
    setSearch('');
    setSelectedSku('');
    setQuantity(1);
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setError(''); setNotice('');
    if (!command.current) {
      const parsed = purchaseSchema.safeParse({ requestId: crypto.randomUUID(), supplierId, supplierInvoice,
        ...(isOrder ? { supplierInvoiceDate: supplierInvoiceDate || undefined, includesTax, supplierAddress } : {}),
        amountPaid, paymentMethod, mode, lines: lines.map(({ label, rowId, ...line }) => line) });
      if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
      if (amountPaid > total) { setError('Amount paid exceeds total.'); return; }
      command.current = parsed.data;
    }
    setBusy(true);
    try {
      localStorage.setItem(pendingKey, JSON.stringify(command.current));
      await receive(command.current); localStorage.removeItem(pendingKey); command.current = null;
      if (mode === 'receive' && lines.length > 0) {
        const toPrint: PrintableItem[] = lines.map(line => {
          const prod = products.find(p => p.id === line.productId) || {
            id: line.productId || 'new-item',
            name: line.newItem?.name || line.label,
            sku: line.sku,
            brand: line.newItem?.brand,
            design: line.newItem?.design,
            fabric: line.newItem?.fabric,
            category: line.newItem?.category,
            price: line.salePrice,
            mrp: line.mrp,
            variants: []
          };
          const existingVariant = prod.variants.find(variant => variant.sku === line.sku);
          return {
            product: prod,
            variant: {
              ...existingVariant,
              sku: line.sku,
              size: line.newItem?.size ?? existingVariant?.size,
              color: line.newItem?.color ?? existingVariant?.color,
              price: line.salePrice,
              mrp: line.mrp ?? existingVariant?.mrp
            },
            defaultCopies: line.quantity
          };
        });
        setPrintItems(toPrint);
        setLastReceivedPrintItems(toPrint);
      }
      setUncertain(false); setLines([]); setSelectedSku(''); setQuantity(1); setSearch(''); setSupplierInvoice(''); setSupplierInvoiceDate(''); setIncludesTax(false); setAmountPaid(0); setNotice(mode === 'order' ? 'Purchase order saved. Stock changes when received.' : 'Purchase received. New items, prices and stock saved together.');
    } catch (e) { const status = (e as { status?: number }).status;
      if (status && [400,404,409,422].includes(status)) { command.current = null; localStorage.removeItem(pendingKey); setUncertain(false); } else setUncertain(true);
      setError((e as Error).message);
    } finally { setBusy(false); }
  }
  return <div className="glass table-panel purchase-receive">
    <header className="purchase-order-heading">
      <h2>{isOrder ? 'New Purchase Order' : 'Receive Stock'}</h2>
      {isOrder && <p><strong>{money(total)}</strong> · {lines.reduce((sum, line) => sum + line.quantity, 0)} units</p>}
    </header>
    {error && <p className="error-banner" role="alert">{error}</p>}
    {notice && (
      <div className="success-banner" role="status" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <span>{notice}</span>
        {lastReceivedPrintItems && (
          <button
            type="button"
            className="button secondary sm"
            onClick={() => setPrintItems(lastReceivedPrintItems)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Printer size={15} /> Print Barcode Labels ({lastReceivedPrintItems.reduce((s, i) => s + (i.defaultCopies || 0), 0)} labels)
          </button>
        )}
      </div>
    )}
    <form onSubmit={event => void submit(event)}><fieldset disabled={busy || uncertain} className="purchase-fieldset">
      <div className={isOrder ? 'purchase-order-layout' : undefined}>
      <div>
      {isOrder && <>
        <label>Product<input type="search" placeholder="Search by product, number or SKU" value={search}
          onChange={event => { setSearch(event.target.value); setSelectedSku(''); }} /></label>
        <label>Matching product<select value={selectedSku} onChange={event => setSelectedSku(event.target.value)}>
          <option value="">Choose product</option>
          {matches.map(({ product, variant }) => <option key={productKey(product, variant)} value={productKey(product, variant)}>
            {product.productNumber ? `#${product.productNumber} · ` : ''}{product.name} · {variant.sku}
          </option>)}
        </select></label>
        <label>Quantity<input type="number" min="1" max="10000" step="1" value={quantity} onChange={event => setQuantity(Number(event.target.value))} /></label>
        <label className="check-row"><input type="checkbox" checked={includesTax} onChange={event => setIncludesTax(event.target.checked)} /> Entered purchase rates include tax</label>
      </>}
      <div className={isOrder ? 'purchase-order-fields' : 'purchase-top'}>
        {isOrder && <label>Find supplier<input type="search" placeholder="Name or mobile" value={supplierSearch} onChange={event => setSupplierSearch(event.target.value)} /></label>}
        <div><label htmlFor={`purchase-supplier-${mode}`}>Supplier</label><select id={`purchase-supplier-${mode}`} required value={supplierId} onChange={event => {
          setSupplierId(event.target.value);
          setSupplierAddress(suppliers.find(supplier => supplier.id === event.target.value)?.address ?? '');
        }}><option value="">Choose supplier</option>
          {suppliers.filter(supplier => supplier.id === supplierId ||
            `${supplier.name} ${supplier.phone ?? ''}`.toLowerCase().includes(supplierSearch.trim().toLowerCase()))
            .map(supplier => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
        </select></div>
        <label>Supplier invoice / order reference<input required maxLength={80} value={supplierInvoice} onChange={event => setSupplierInvoice(event.target.value)} /></label>
        {isOrder && <>
          <label>Invoice date<input type="date" value={supplierInvoiceDate} onChange={event => setSupplierInvoiceDate(event.target.value)} /></label>
          <label>Supplier address<textarea value={supplierAddress} maxLength={500} onChange={event => setSupplierAddress(event.target.value)} /></label>
        </>}
      </div>
      {isOrder && <button type="button" className="button primary purchase-add-cart" disabled={!selected || !Number.isInteger(quantity) || quantity < 1 || quantity > 10000}
        onClick={() => { if (selected) add(selected.product, selected.variant, quantity); }}>Add to Cart</button>}
      <details className="purchase-import"><summary>Import purchase items from CSV</summary><p><a href="/purchase-template.csv" download>Download CSV template</a>. Import up to 30 rows, review all values below, then receive the purchase.</p><label>Import CSV<input type="file" accept=".csv,text/csv" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{const imported=purchaseCsv(await file.text());if(imported.length+lines.length>30)throw new Error('A purchase supports up to 30 items.');setLines(old=>[...old,...imported.map(line=>({...line,rowId:crypto.randomUUID(),label:line.newItem?.name||line.sku}))]);setError('');}catch(error){setError((error as Error).message);}e.target.value='';}}/></label></details>{!isOrder && <><div className="commerce-toolbar purchase-search-toolbar"><div className="field-search"><Search size={18} /><input aria-label="Search products to receive" placeholder="Find existing item, size or SKU" value={search} onChange={e => setSearch(e.target.value)} /></div></div>
      {matches.map(({ product, variant }) => (
        <button type="button" className="button secondary" key={`${product.id}:${variant.sku}`} onClick={() => add(product, variant)}>
          {product.productNumber ? <span className="product-no-badge">#{product.productNumber}</span> : null}
          {product.name} · {variant.sku}
        </button>
      ))}</>}
      </div>
      <div className="purchase-order-cart">
      {isOrder && <h3>Cart</h3>}
      {isOrder && !lines.length && <p className="microcopy">No products added.</p>}
      {lines.map(line => <article className="purchase-item-card" key={line.rowId}><header><strong>{line.newItem ? 'New catalog item' : line.label}</strong><button type="button" className="icon-button" aria-label={`Remove ${line.label}`} onClick={() => setLines(old => old.filter(x => x.rowId !== line.rowId))}><Trash2 size={18} /></button></header>
        {line.newItem && <div className="purchase-item-fields">{(['name','category','brand','design','fabric','size','color'] as const).map(field => <label key={field}>{({ name: 'Item name', category: 'Category', brand: 'Brand', design: 'Design / article', fabric: 'Fabric', size: 'Size', color: 'Colour' })[field]}<input required={['name','category','size','color'].includes(field)} value={line.newItem![field]} maxLength={field === 'name' ? 200 : 80} onChange={e => patch(line.rowId, { newItem: { ...line.newItem!, [field]: e.target.value } })} /></label>)}<label>SKU / barcode base<input required pattern="[A-Za-z0-9_.:-]+" maxLength={100} value={line.sku} onChange={e => patch(line.rowId, { sku: e.target.value })} /></label></div>}
        <div className="purchase-item-fields">{([{ field: 'quantity', label: 'Quantity', min: 1, step: 1 }, { field: 'unitCost', label: 'Purchase rate ₹', min: 0, step: .01 }, { field: 'salePrice', label: 'Sale price ₹', min: .01, step: .01 }, { field: 'mrp', label: 'MRP ₹', min: .01, step: .01 }] as const).map(({ field, label, min, step }) => <label key={field}>{label}<input required={field === 'quantity' || field === 'unitCost' || Boolean(line.newItem)} type="number"
          min={min} step={step} value={line[field] ?? ''} onChange={e => patch(line.rowId, {
            [field]: e.target.value === '' && (field === 'salePrice' || field === 'mrp') ? undefined : Number(e.target.value)
          })} /></label>)}</div>
        {line.newItem && <div className="purchase-item-fields"><label className="check-row"><input type="checkbox" checked={line.newItem.gstEnabled === true} onChange={e => patch(line.rowId, { newItem: { ...line.newItem!, gstEnabled: e.target.checked, gstPercent: e.target.checked ? (line.newItem?.gstPercent || 5) : 0 } })} />Charge GST on this item</label>{line.newItem.gstEnabled && <label>GST %<input type="number" min="0.01" max="100" step="0.01" value={line.newItem.gstPercent || ''} onChange={e => patch(line.rowId, { newItem: { ...line.newItem!, gstPercent: Number(e.target.value) } })} /></label>}</div>}
        <p><strong>Stock cost: {money(line.unitCost)} × {line.quantity} = {money(Math.round(line.unitCost * 100) * line.quantity / 100)}</strong></p></article>)}
      <div className="purchase-footer">{mode === 'receive' && <label>Payment method<select aria-label="Purchase payment method" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as typeof paymentMethod)}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option></select></label>}{mode === 'receive' && <label>Amount paid ₹<input type="number" min="0" max={total} step=".01" value={amountPaid} onChange={e => setAmountPaid(Number(e.target.value))} /></label>}<div><small>Total stock cost</small><strong>{money(total)}</strong><small>{mode === 'receive' ? `Supplier balance ${money(total - amountPaid)}` : 'No stock increase until receipt'}</small></div></div>
      </div>
      </div>
    </fieldset><button className="button primary" disabled={busy || !lines.length}>{busy ? 'Saving…' : uncertain ? 'Retry saved purchase' : mode === 'order' ? 'Create purchase order' : 'Receive stock & create items'}</button></form>
    {printItems && (
      <BarcodePrintModal
        items={printItems}
        title="Print Received Stock Barcodes"
        subtitle="Quantities pre-filled with received invoice quantities."
        onClose={() => setPrintItems(null)}
      />
    )}
  </div>;
}
