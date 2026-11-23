import { purchaseCsv } from '../shared/purchaseCsv';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Search, Trash2, Printer, Plus, Minus } from 'lucide-react';
import { purchaseSchema, type PurchaseInput, type PurchaseLine } from '../shared/purchases';
import { BarcodePrintModal, type PrintableItem } from './BarcodePrintModal';
export type { PurchaseInput };
type Product = { id: string; name: string; sku: string; productNumber?: number; barcode?: string; price?: number; mrp?: number; costPrice?: number; stock: number; variants: { sku: string; barcode?: string; size?: string; color?: string; stock: number; price?: number; mrp?: number; costPrice?: number }[] };
type Supplier = { id: string; name: string; phone?: string; address?: string };
type Line = PurchaseLine & { label: string; rowId: string };
type Variant = Product['variants'][number];
const variantsOf = (product: Product): Variant[] => product.variants.length ? product.variants
  : [{ sku: product.sku, stock: product.stock, price: product.price, costPrice: product.costPrice, mrp: product.mrp, barcode: product.barcode }];
const variantName = (variant?: Variant) => [variant?.size || 'Free size', variant?.color].filter(Boolean).join(' · ');
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
  const [pickedProductId, setPickedProductId] = useState('');
  const [cartProductIds, setCartProductIds] = useState<string[]>([]);
  const [hiddenSizes, setHiddenSizes] = useState<Record<string, string[]>>({});
  const [supplierId, setSupplierId] = useState(''), [supplierInvoice, setSupplierInvoice] = useState('');
  const [amountPaid, setAmountPaid] = useState(0);
  const [fullPayment, setFullPayment] = useState(false);
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
      setFullPayment(input.fullPayment === true);
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
  const productMatches = useMemo(() => {
    const raw = search.trim(), q = raw.toLowerCase();
    const cleanNum = raw.replace(/^#/, '').trim();
    const num = /^\d+$/.test(cleanNum) ? parseInt(cleanNum, 10) : null;
    return products.filter(product => {
      if (!q) return true;
      if (num !== null && product.productNumber === num) return true;
      return [product.productNumber ? `#${product.productNumber}` : '', product.name, product.sku, product.barcode ?? '',
        ...variantsOf(product).flatMap(variant => [variant.sku, variant.barcode ?? '', variant.size ?? '', variant.color ?? ''])]
        .join(' ').toLowerCase().includes(q);
    }).slice(0, 60);
  }, [products, search]);
  const picked = products.find(product => product.id === pickedProductId);
  function addProductToCart() {
    if (!picked) return;
    setCartProductIds(old => old.includes(picked.id) ? old : [...old, picked.id]);
    setHiddenSizes(old => ({ ...old, [picked.id]: [] }));
    setPickedProductId('');
  }
  function setSizeQty(product: Product, variant: Variant, value: number) {
    const count = Number.isFinite(value) ? Math.max(0, Math.min(10000, Math.floor(value))) : 0;
    setLines(previous => {
      const existing = previous.find(line => line.productId === product.id && line.sku === variant.sku);
      if (count === 0) return previous.filter(line => line !== existing);
      if (existing) return previous.map(line => line === existing ? { ...line, quantity: count } : line);
      const rate = variant.price ?? product.price;
      const mrp = variant.mrp ?? product.mrp ?? rate;
      return [...previous, { rowId: crypto.randomUUID(), label: product.name, productId: product.id, sku: variant.sku, quantity: count,
        unitCost: variant.costPrice ?? product.costPrice ?? 0, ...(rate && mrp && rate <= mrp ? { salePrice: rate, mrp } : {}) }];
    });
  }
  function removeSize(product: Product, variant: Variant) {
    setLines(old => old.filter(line => !(line.productId === product.id && line.sku === variant.sku)));
    setHiddenSizes(old => ({ ...old, [product.id]: [...(old[product.id] ?? []), variant.sku] }));
  }
  function restoreSize(product: Product, variant: Variant) {
    setHiddenSizes(old => ({ ...old, [product.id]: (old[product.id] ?? []).filter(sku => sku !== variant.sku) }));
  }
  function removeProduct(product: Product) {
    setLines(old => old.filter(line => line.productId !== product.id || line.newItem));
    setCartProductIds(old => old.filter(id => id !== product.id));
  }
  const cartGroups = useMemo(() => {
    const ids = [...cartProductIds];
    lines.forEach(line => { if (!line.newItem && line.productId && !ids.includes(line.productId)) ids.push(line.productId); });
    return ids.map(id => products.find(product => product.id === id)).filter((product): product is Product => Boolean(product));
  }, [cartProductIds, lines, products]);
  const looseLines = lines.filter(line => line.newItem || !line.productId || !products.some(product => product.id === line.productId));
  const total = lines.reduce((sum, line) => sum + Math.round(line.unitCost * 100) * line.quantity, 0) / 100;
  const paidNow = fullPayment ? total : amountPaid;
  const patch = (rowId: string, values: Partial<Line>) => setLines(old => old.map(line => line.rowId === rowId ? { ...line, ...values } : line));
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
    if (!isOrder) setSearch('');
    setSelectedSku('');
    setQuantity(1);
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setError(''); setNotice('');
    if (!command.current) {
      const parsed = purchaseSchema.safeParse({ requestId: crypto.randomUUID(), supplierId, supplierInvoice,
        ...(isOrder ? { supplierInvoiceDate: supplierInvoiceDate || undefined, includesTax, supplierAddress } : {}),
        amountPaid: paidNow, fullPayment, paymentMethod, mode, lines: lines.map(({ label, rowId, ...line }) => line) });
      if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
      if (paidNow > total) { setError('Amount paid exceeds total.'); return; }
      command.current = parsed.data;
    }
    setBusy(true);
    try {
      localStorage.setItem(pendingKey, JSON.stringify(command.current));
      await receive(command.current); localStorage.removeItem(pendingKey); command.current = null;
      if (lines.length > 0) {
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
      setUncertain(false); setLines([]); setPickedProductId(''); setCartProductIds([]); setHiddenSizes({}); setSelectedSku(''); setQuantity(1); setSearch(''); setSupplierInvoice(''); setSupplierInvoiceDate(''); setIncludesTax(false); setAmountPaid(0); setFullPayment(false); setNotice(mode === 'order' ? 'Purchase order completed. Stock and supplier payment recorded.' : 'Purchase received. New items, prices and stock saved together.');
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
        <label>Product<input type="search" placeholder="Search by product name, number or SKU" value={search}
          onChange={event => setSearch(event.target.value)} /></label>
        <label>Choose product<select value={pickedProductId} onChange={event => setPickedProductId(event.target.value)}>
          <option value="">{productMatches.length ? `Select from ${productMatches.length} product${productMatches.length === 1 ? '' : 's'}` : 'No matching products'}</option>
          {picked && !productMatches.includes(picked) && <option value={picked.id}>{picked.productNumber ? `#${picked.productNumber} · ` : ''}{picked.name}</option>}
          {productMatches.map(product => <option key={product.id} value={product.id}>
            {product.productNumber ? `#${product.productNumber} · ` : ''}{product.name} ({variantsOf(product).length} size{variantsOf(product).length === 1 ? '' : 's'})
          </option>)}
        </select></label>
        <button type="button" className="button primary purchase-add-cart" disabled={!picked} onClick={addProductToCart}>
          <Plus size={16} />{picked && cartGroups.includes(picked) ? 'Already in cart' : 'Add to cart'}</button>
        {picked && <p className="microcopy">All {variantsOf(picked).length} size{variantsOf(picked).length === 1 ? '' : 's'} appear in the cart. Enter quantities there.</p>}
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
      {cartGroups.map(product => {
        const hidden = hiddenSizes[product.id] ?? [];
        const all = variantsOf(product);
        const shown = all.filter(variant => !hidden.includes(variant.sku) || lines.some(line => line.productId === product.id && line.sku === variant.sku));
        const removed = all.filter(variant => !shown.includes(variant));
        const groupLines = lines.filter(line => line.productId === product.id && !line.newItem);
        const units = groupLines.reduce((sum, line) => sum + line.quantity, 0);
        const cost = groupLines.reduce((sum, line) => sum + Math.round(line.unitCost * 100) * line.quantity, 0) / 100;
        return <article className="po-cart-product" key={product.id}>
          <header>
            <div><strong>{product.productNumber ? <span className="product-no-badge">#{product.productNumber}</span> : null}{product.name}</strong>
              <small>{units ? `${groupLines.length} size${groupLines.length === 1 ? '' : 's'} · ${units} unit${units === 1 ? '' : 's'} · ${money(cost)}` : 'Enter quantity for the sizes you are ordering'}</small></div>
            <button type="button" className="icon-button" aria-label={`Remove ${product.name} from cart`} onClick={() => removeProduct(product)}><Trash2 size={18} /></button>
          </header>
          <div className="po-cart-table">
            <div className="po-cart-row po-cart-head"><span>Size</span><span>Qty</span><span>Rate ₹</span><span>Sale ₹</span><span>MRP ₹</span><span>Amount</span><span /></div>
            {shown.map(variant => {
              const line = groupLines.find(item => item.sku === variant.sku);
              const qty = line?.quantity ?? 0;
              const name = variantName(variant);
              return <div className={`po-cart-row${line ? '' : ' empty'}`} key={variant.sku}>
                <span className="po-cart-size"><strong>{name}</strong><small>{variant.sku} · Stock {variant.stock ?? 0}</small></span>
                <div className="po-stepper">
                  <button type="button" aria-label={`Less ${name}`} disabled={qty < 1} onClick={() => setSizeQty(product, variant, qty - 1)}><Minus size={14} /></button>
                  <input type="number" min="0" max="10000" step="1" aria-label={`Quantity ${name}`} placeholder="0" value={qty || ''} onChange={e => setSizeQty(product, variant, Number(e.target.value))} />
                  <button type="button" aria-label={`More ${name}`} onClick={() => setSizeQty(product, variant, qty + 1)}><Plus size={14} /></button>
                </div>
                {line ? <>
                  <label className="po-cell"><span>Rate ₹</span><input aria-label={`Purchase rate ${name}`} required type="number" min="0" step=".01" value={line.unitCost} onChange={e => patch(line.rowId, { unitCost: Number(e.target.value) })} /></label>
                  <label className="po-cell"><span>Sale ₹</span><input aria-label={`Sale price ${name}`} type="number" min=".01" step=".01" value={line.salePrice ?? ''} onChange={e => patch(line.rowId, { salePrice: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
                  <label className="po-cell"><span>MRP ₹</span><input aria-label={`MRP ${name}`} type="number" min=".01" step=".01" value={line.mrp ?? ''} onChange={e => patch(line.rowId, { mrp: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
                  <span className="po-cart-amount">{money(Math.round(line.unitCost * 100) * line.quantity / 100)}</span>
                </> : <span className="po-cart-hint">Add quantity to order this size</span>}
                <button type="button" className="icon-button" aria-label={`Remove size ${name}`} title="Remove this size" onClick={() => removeSize(product, variant)}><Trash2 size={16} /></button>
              </div>;
            })}
          </div>
          {removed.length > 0 && <div className="po-add-sizes"><span>Removed sizes:</span>{removed.map(variant =>
            <button type="button" key={variant.sku} onClick={() => restoreSize(product, variant)}><Plus size={13} />{variantName(variant)}</button>)}</div>}
        </article>;
      })}
      {looseLines.map(line => <article className="purchase-item-card" key={line.rowId}><header><strong>{line.newItem ? 'New catalog item' : line.label}</strong><button type="button" className="icon-button" aria-label={`Remove ${line.label}`} onClick={() => setLines(old => old.filter(x => x.rowId !== line.rowId))}><Trash2 size={18} /></button></header>
        {line.newItem && <div className="purchase-item-fields">{(['name','category','brand','design','fabric','size','color'] as const).map(field => <label key={field}>{({ name: 'Item name', category: 'Category', brand: 'Brand', design: 'Design / article', fabric: 'Fabric', size: 'Size', color: 'Colour' })[field]}<input required={['name','category','size','color'].includes(field)} value={line.newItem![field]} maxLength={field === 'name' ? 200 : 80} onChange={e => patch(line.rowId, { newItem: { ...line.newItem!, [field]: e.target.value } })} /></label>)}<label>SKU / barcode base<input required pattern="[A-Za-z0-9_.:-]+" maxLength={100} value={line.sku} onChange={e => patch(line.rowId, { sku: e.target.value })} /></label></div>}
        <div className="purchase-item-fields">{([{ field: 'quantity', label: 'Quantity', min: 1, step: 1 }, { field: 'unitCost', label: 'Purchase rate ₹', min: 0, step: .01 }, { field: 'salePrice', label: 'Sale price ₹', min: .01, step: .01 }, { field: 'mrp', label: 'MRP ₹', min: .01, step: .01 }] as const).map(({ field, label, min, step }) => <label key={field}>{label}<input required={field === 'quantity' || field === 'unitCost' || Boolean(line.newItem)} type="number"
          min={min} step={step} value={line[field] ?? ''} onChange={e => patch(line.rowId, {
            [field]: e.target.value === '' && (field === 'salePrice' || field === 'mrp') ? undefined : Number(e.target.value)
          })} /></label>)}</div>
        {line.newItem && <div className="purchase-item-fields"><label className="check-row"><input type="checkbox" checked={line.newItem.gstEnabled === true} onChange={e => patch(line.rowId, { newItem: { ...line.newItem!, gstEnabled: e.target.checked, gstPercent: e.target.checked ? (line.newItem?.gstPercent || 5) : 0 } })} />Charge GST on this item</label>{line.newItem.gstEnabled && <label>GST %<input type="number" min="0.01" max="100" step="0.01" value={line.newItem.gstPercent || ''} onChange={e => patch(line.rowId, { newItem: { ...line.newItem!, gstPercent: Number(e.target.value) } })} /></label>}</div>}
        <p><strong>Stock cost: {money(line.unitCost)} × {line.quantity} = {money(Math.round(line.unitCost * 100) * line.quantity / 100)}</strong></p></article>)}
      <div className="purchase-footer"><label className="check-row"><input type="checkbox" checked={fullPayment} onChange={event => setFullPayment(event.target.checked)} />Full payment</label><label>Payment method<select aria-label="Purchase payment method" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value as typeof paymentMethod)}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option></select></label><label>Amount paid ₹<input type="number" min="0" max={total} step=".01" value={paidNow} disabled={fullPayment} onChange={e => setAmountPaid(Number(e.target.value))} /></label><div><small>Total stock cost</small><strong>{money(total)}</strong><small>Supplier balance {money(Math.max(0, total - paidNow))}</small></div></div>
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
