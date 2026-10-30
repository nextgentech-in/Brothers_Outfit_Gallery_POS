import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Check, FileDown, Package, Plus, Printer, RefreshCw, Search, ShoppingBag, Volume2 } from 'lucide-react';
import { BarcodeLabel, type LabelProduct } from './BarcodeLabel';
import { BrandLogo } from './BrandLogo';
import { cacheCatalog, cachedCatalog, queueSale, queuedSales, removeSale, syncQueuedSales, type QueuedSale } from './offlineQueue';

type Product = { id: string; name: string; sku: string; barcode?: string; price: number; mrp: number; category: string; active: boolean; stock: number; image: string;
  variants: { sku: string; barcode?: string; size?: string; color?: string; stock: number; price: number }[] };
type Order = { id: string; status?: string; totalAmount?: number; paymentMethod?: string; createdBy?: string; createdAt?: { _seconds?: number; seconds?: number };
  customerName?: string; shippingAddress?: { fullName?: string }; items?: { name?: string; quantity?: number }[] };
type Customer = { id: string; fullName: string; phone: string; email: string };
type Supplier = { id: string; name: string; phone: string; email: string; gstin: string };
type Purchase = { id: string; supplierName: string; supplierInvoice: string; total: number; amountPaid: number; payable: number };
type Movement = { id: string; productId?: string; sku?: string; deltaChange?: number; reason?: string; source?: string; stockAfter?: number };
type Invoice = { id: string; orderId: string; total: number; lines: { name?: string; sku?: string; quantity?: number; price?: number }[];
  customerName?: string; customerPhone?: string; channel: string; paymentMethod: string; kind?: string };
type SyncRecord = { id: string; event?: string; status?: string; invoiceId?: string; source?: string; retryCount?: number; error?: string; providerMessageId?: string };
type Shop = { name: string; phone: string; address: string; email: string; whatsapp: string; logo: string };
type NewProductInput = { requestId: string; name: string; sku: string; barcode?: string; category: string;
  size: string; color: string; salePrice: number; mrp: number; openingStock: number; imageUrl?: string; publish: boolean };

const money = (value: number | undefined) => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const retailStockValue = (product: Product) => product.variants.length
  ? product.variants.reduce((sum, variant) => sum + variant.stock * variant.price, 0)
  : product.stock * product.price;
async function get<T>(path: string): Promise<T> {
  const res = await fetch(`/api/${path}`, { credentials: 'same-origin' });
  if (res.status === 401) { location.assign('/login'); throw new Error('Session expired.'); }
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || 'Unable to load data.');
  return body;
}

function NewPosProductDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (product: NewProductInput) => Promise<void> }) {
  const stableRequestId = useRef(requestId());
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input: NewProductInput = {
      requestId: stableRequestId.current, name: String(form.get('name') || '').trim(),
      sku: String(form.get('sku') || '').trim(), barcode: String(form.get('barcode') || '').trim() || undefined,
      category: String(form.get('category') || '').trim(), size: String(form.get('size') || '').trim(),
      color: String(form.get('color') || '').trim(), salePrice: Number(form.get('salePrice')),
      mrp: Number(form.get('mrp')), openingStock: Number(form.get('openingStock')),
      publish: form.get('publish') === 'on'
    };
    setSaving(true);
    try { await onCreate(input); } finally { setSaving(false); }
  }
  return <div className="editor-backdrop" onClick={onClose}><form className="editor glass new-product-editor" role="dialog" aria-modal="true" aria-label="Add product to website catalog" onClick={event => event.stopPropagation()} onSubmit={event => void submit(event)}><button className="editor-close" type="button" onClick={onClose} aria-label="Close">×</button><span className="eyebrow">SHARED WEBSITE CATALOG</span><h2>Add a product</h2><p>The product uses the same website catalog. Opening stock is recorded in the shared ledger.</p><label>Product name<input name="name" required minLength={2} maxLength={200} autoFocus /></label><div className="new-product-grid"><label>Product SKU<input name="sku" required pattern="[A-Za-z0-9_.:-]+" maxLength={120} placeholder="e.g. SHIRT-101" /></label><label>Barcode<input name="barcode" maxLength={128} placeholder="Optional" /></label><label>Category<input name="category" required maxLength={100} placeholder="Shirts" /></label><label>Size<input name="size" required maxLength={50} defaultValue="Standard" /></label><label>Color<input name="color" required maxLength={80} defaultValue="Standard" /></label><label>Opening quantity<input name="openingStock" type="number" min="0" max="100000" step="1" required defaultValue="1" /></label><label>Selling price ₹<input name="salePrice" type="number" min="0" step="0.01" required /></label><label>MRP ₹<input name="mrp" type="number" min="0" step="0.01" required /></label></div><label className="check-row"><input name="publish" type="checkbox" defaultChecked />Publish to website</label><button className="button primary" disabled={saving}>{saving ? 'Adding product…' : 'Add product and sync website'}</button></form></div>;
}
async function send<T>(path: string, body: unknown): Promise<T> {
  const csrf = await get<{ token: string }>('auth/csrf');
  const res = await fetch(`/api/${path}`, { method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf.token }, body: JSON.stringify(body) });
  const result = await res.json();
  if (!res.ok) throw Object.assign(new Error(result.error || 'Operation failed.'), { status: res.status });
  return result;
}
const requestId = () => crypto.randomUUID();
const salePayload = (sale: QueuedSale) => ({ requestId: sale.requestId, lines: sale.lines,
  customerName: sale.customerName, customerPhone: sale.customerPhone, customerEmail: sale.customerEmail || undefined,
  whatsappOptIn: sale.whatsappOptIn === true, discount: sale.discount, paymentMethod: sale.paymentMethod });

export function CommerceView({ tab }: { tab: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [sync, setSync] = useState<SyncRecord[]>([]);
  const [shop, setShop] = useState<Shop | null>(null);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);
  const [labelProduct, setLabelProduct] = useState<LabelProduct | null>(null);
  const [cart, setCart] = useState<{ product: Product; sku: string; quantity: number; price: number }[]>([]);
  const [payment, setPayment] = useState<'cash' | 'upi' | 'card' | 'credit'>('cash');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [whatsappOptIn, setWhatsAppOptIn] = useState(true);
  const [discount, setDiscount] = useState(0);
  const [lastInvoice, setLastInvoice] = useState<Invoice | null>(null);
  const [newOrderCount, setNewOrderCount] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [offlineSales, setOfflineSales] = useState<QueuedSale[]>([]);
  const [writesEnabled, setWritesEnabled] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (tab !== 'pos') return;
    const focusScanner = (event: KeyboardEvent) => { if (event.key === 'F2') { event.preventDefault(); scanRef.current?.focus(); scanRef.current?.select(); } };
    window.addEventListener('keydown', focusScanner);
    return () => window.removeEventListener('keydown', focusScanner);
  }, [tab]);

  useEffect(() => { void get<{ businessWritesEnabled: boolean }>('foundation').then(data => setWritesEnabled(data.businessWritesEnabled)).catch(() => setWritesEnabled(false)); }, []);

  async function refreshOffline() {
    try { setOfflineSales(await queuedSales()); } catch { /* Private mode may disable IndexedDB. */ }
  }
  useEffect(() => {
    void refreshOffline();
    const reconnect = () => void syncQueuedSales(async sale => { await send('pos/sale', salePayload(sale)); }).then(result => {
      void refreshOffline();
      if (result.sent) setNotice(`${result.sent} queued bill(s) synced.`);
      if (result.review) setError(`${result.review} offline bill(s) need stock review.`);
    });
    window.addEventListener('online', reconnect);
    if (navigator.onLine) reconnect();
    return () => window.removeEventListener('online', reconnect);
  }, []);

  async function load() {
    setLoading(true); setError('');
    const paths: Record<string, string[]> = { products: ['products'], pos: ['products', 'shop-details'],
      inventory: ['products', 'movements'], orders: ['orders', 'invoices'], customers: ['customers'],
      suppliers: ['suppliers', 'purchases', 'products'],
      reports: ['orders', 'invoices'], sync: ['sync-health'] };
    const wanted = paths[tab] || [];
    try {
      const values = await Promise.all(wanted.map(path => get<{ items?: unknown[] } & Shop>(path)));
      values.forEach((value, i) => { switch (wanted[i]) {
        case 'products': setProducts((value.items || []) as Product[]); void cacheCatalog((value.items || []) as Product[]); break;
        case 'orders': setOrders((value.items || []) as Order[]); break;
        case 'customers': setCustomers((value.items || []) as Customer[]); break;
        case 'suppliers': setSuppliers((value.items || []) as Supplier[]); break;
        case 'purchases': setPurchases((value.items || []) as Purchase[]); break;
        case 'movements': setMovements((value.items || []) as Movement[]); break;
        case 'invoices': setInvoices((value.items || []) as Invoice[]); break;
        case 'sync-health': setSync((value.items || []) as SyncRecord[]); break;
        case 'shop-details': setShop(value); break;
      }});
    } catch (error) {
      if (wanted.includes('products')) {
        try { const cached = await cachedCatalog<Product>(); if (cached.length) { setProducts(cached); setNotice('Offline catalog loaded. Bills will queue until the connection returns.'); return; } }
        catch { /* No offline catalog available. */ }
      }
      setError((error as Error).message);
    }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, [tab]);
  useEffect(() => {
    if (tab !== 'orders') return;
    const stream = new EventSource('/api/orders/stream');
    stream.addEventListener('new-order', () => {
      setNewOrderCount(n => n + 1);
      setNotice('A new website order arrived.');
      void load();
      if (soundEnabled) {
        try { const audio = new AudioContext(); const oscillator = audio.createOscillator(); const gain = audio.createGain();
          oscillator.connect(gain); gain.connect(audio.destination); oscillator.frequency.value = 660;
          gain.gain.value = 0.06; oscillator.start(); oscillator.stop(audio.currentTime + 0.18);
          oscillator.onended = () => void audio.close(); } catch { /* Browser denied audio. Badge still works. */ }
      }
    });
    return () => stream.close();
  }, [tab, soundEnabled]);
  const shownProducts = useMemo(() => products.filter(p => `${p.name} ${p.sku} ${p.barcode || ''} ${p.category} ${p.variants.map(v => `${v.sku} ${v.barcode || ''}`).join(' ')}`.toLowerCase().includes(query.toLowerCase())), [products, query]);
  const stockUnits = products.reduce((sum, product) => sum + product.stock, 0);
  const stockRetailTotal = products.reduce((sum, product) => sum + retailStockValue(product), 0);
  const billSubtotal = cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
  function scanOrFind() {
    const scanned = query.trim().toLowerCase();
    if (!scanned) return;
    for (const product of products) {
      const match = product.variants.find(v => v.sku?.toLowerCase() === scanned || v.barcode?.toLowerCase() === scanned);
      if (match) { addToCart(product, match.sku); setQuery(''); setNotice(`${product.name} added to the bill.`); return; }
      if (product.sku.toLowerCase() === scanned || product.barcode?.toLowerCase() === scanned) {
        const sku = product.variants.length === 1 ? product.variants[0].sku : product.variants.length ? '' : product.sku;
        if (sku) { addToCart(product, sku); setQuery(''); setNotice(`${product.name} added to the bill.`); return; }
      }
    }
    setError('No exact SKU or barcode match. Search by product name and choose a variant.');
  }
  async function act(path: string, body: unknown, message: string) {
    setError(''); setNotice('');
    try { const result = await send<Record<string, unknown>>(path, body); setNotice(message); await load(); return result; }
    catch (error) { setError((error as Error).message); return null; }
  }
  async function createPosProduct(input: NewProductInput) {
    const created = await act('products/create', input, 'Product added to the shared website catalog.');
    if (!created?.productId) return;
    setCreating(false);
    try {
      const catalog = await get<{ items: Product[] }>('products');
      setProducts(catalog.items);
      const product = catalog.items.find(item => item.id === created.productId);
      if (tab === 'pos' && product && product.stock > 0 && product.variants[0]) addToCart(product, product.variants[0].sku);
    } catch { setNotice('Product saved. Refresh the catalog to add it to the bill.'); }
  }
  function addToCart(product: Product, sku: string) {
    const variant = product.variants.find(v => v.sku === sku);
    const available = variant?.stock ?? product.stock;
    const already = cart.find(line => line.product.id === product.id && line.sku === sku)?.quantity || 0;
    if (already >= available) { setError('No more stock is available for this variant.'); return; }
    setError(''); setCart(old => {
      const found = old.find(line => line.product.id === product.id && line.sku === sku);
      return found ? old.map(line => line === found ? { ...line, quantity: line.quantity + 1 } : line)
        : [...old, { product, sku, quantity: 1, price: variant?.price ?? product.price }];
    });
  }
  function setCartQuantity(productId: string, sku: string, quantity: number) {
    const line = cart.find(item => item.product.id === productId && item.sku === sku);
    if (!line) return;
    const variant = line.product.variants.find(item => item.sku === sku);
    const available = variant?.stock ?? line.product.stock;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > available) {
      setError(`Enter a quantity from 1 to ${available} for ${line.product.name}.`); return;
    }
    setError('');
    setCart(old => old.map(item => item.product.id === productId && item.sku === sku ? { ...item, quantity } : item));
  }
  async function completeSale(event: FormEvent) {
    event.preventDefault();
    if (!writesEnabled) { setError('Billing is locked until the shared stock and schema review is complete.'); return; }
    if (!cart.length) return;
    const phoneDigits = customerPhone.replace(/\D/g, '');
    if (customerPhone.trim() && (phoneDigits.length < 10 || phoneDigits.length > 15)) {
      setError('Enter a valid WhatsApp phone number, or leave it blank.'); return;
    }
    if (discount > billSubtotal) { setError('Discount cannot exceed the bill subtotal.'); return; }
    const command: QueuedSale = { requestId: requestId(), lines: cart.map(line => ({ productId: line.product.id, sku: line.sku, quantity: line.quantity })),
      customerName, customerPhone, customerEmail, whatsappOptIn: Boolean(customerPhone.trim()) && whatsappOptIn,
      discount, paymentMethod: payment, queuedAt: new Date().toISOString(), state: 'pending' };
    try { await queueSale(command); await refreshOffline(); }
    catch { setError('Bill storage is unavailable on this device. Keep the bill open and retry.'); return; }
    if (!navigator.onLine) {
      setNotice('Bill queued offline with a provisional ID. It will sync on reconnect.'); setCart([]);
      return;
    }
    try {
      const result = await send<{ invoiceId: string; orderId: string; total: number }>('pos/sale', salePayload(command));
      await removeSale(command.requestId); await refreshOffline();
      setLastInvoice({ id: String(result.invoiceId), orderId: String(result.orderId), total: Number(result.total),
        lines: cart.map(line => ({ name: line.product.name, sku: line.sku, quantity: line.quantity, price: line.price })),
        customerName, customerPhone, channel: 'POS', paymentMethod: payment, kind: 'sales_receipt' });
      setCart([]); setDiscount(0); setCustomerName(''); setCustomerPhone(''); setCustomerEmail(''); setWhatsAppOptIn(true);
      scanRef.current?.focus();
      setNotice('Sale recorded and receipt created.'); await load();
    } catch (error) {
      await queueSale({ ...command, state: (error as { status?: number }).status === 409 ? 'review' : 'pending',
        error: (error as Error).message });
      await refreshOffline();
      setError((error as { status?: number }).status === 409
        ? 'Stock conflict. This bill is saved for review and was not posted.'
        : 'Connection failed. The bill is saved locally and will retry with the same ID.');
      setCart([]);
    }
  }
  const heading: Record<string, [string, string]> = {
    products: ['Products', 'The website catalog, in your workspace.'], pos: ['Quick billing', 'Sell from the shared catalog and create one receipt.'],
    inventory: ['Inventory', 'Variant stock and recent movements from the same database.'], orders: ['Orders', 'Website and in-store orders together.'],
    customers: ['Customers', 'Existing website accounts and shop history.'], suppliers: ['Suppliers & purchases', 'Receive stock and track supplier payables.'],
    reports: ['Reports', 'A clear view of both sales channels.'],
    sync: ['Sync health', 'Delivery events and work needing attention.']
  };
  return <div className="commerce"><div className="page-title"><div><span className="eyebrow">BROTHERS OUTFIT GALLERY</span><h1>{heading[tab]?.[0]}</h1><p>{heading[tab]?.[1]}</p></div><button className="button secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} />Refresh</button></div>
    {!writesEnabled && <div className="notice" role="status">Review preview: live product, order, customer and stock data is visible. Business writes are locked until the schema and checkout cutover are reviewed.</div>}
    {loading && <div className="notice" role="status"><RefreshCw size={16} />Loading shared store data…</div>}
    {error && <div className="error-banner" role="alert">{error}<button onClick={() => setError('')}>Dismiss</button></div>}
    {notice && <div className="success-banner" role="status"><Check size={16} />{notice}<button onClick={() => setNotice('')}>Dismiss</button></div>}
    {tab === 'products' && <><div className="product-add-toolbar"><button className="button primary" onClick={() => setCreating(true)}><Plus size={18} />Add product to website catalog</button></div><div className="commerce-toolbar"><label className="field-search"><Search size={17} /><input placeholder="Search name, SKU or category" value={query} onChange={e => setQuery(e.target.value)} /></label><span>{shownProducts.length} products</span></div>
      <div className="stock-summary glass"><div><span>All product stock</span><strong>{stockUnits.toLocaleString('en-IN')} units</strong></div><div><span>Available stock retail value</span><strong>{money(stockRetailTotal)}</strong></div></div><div className="commerce-grid">{shownProducts.map(product => <article className="glass product-tile" key={product.id}><div className="product-media">{product.image ? <img src={product.image} alt="" loading="lazy" /> : <Package size={35} />}</div><div className="product-body"><span className="eyebrow">{product.category || 'PRODUCT'}</span><h2>{product.name}</h2><p>SKU {product.sku} · {product.variants.length} variants</p><div className="product-bottom"><strong>{money(product.price)}</strong><span className={product.stock > 0 ? 'available' : 'unavailable'}>{product.stock > 0 ? `${product.stock} available` : 'Out of stock'}</span></div><p className="stock-value">Available stock value: {money(retailStockValue(product))}</p><button className="button secondary" onClick={() => setSelected(product)}>Edit product <ArrowRight size={15} /></button></div></article>)}</div>
      {selected && <div className="editor-backdrop" onClick={() => setSelected(null)}><form className="editor glass" onClick={event => event.stopPropagation()} onSubmit={async event => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        const imageUrl = String(form.get('primaryImageUrl') || '').trim();
        const variantPatches = selected.variants.every(v => Boolean(v.sku)) ? selected.variants.map((variant, i) => ({
          sku: variant.sku, barcode: String(form.get(`variant-barcode-${i}`) || '').trim(), size: String(form.get(`variant-size-${i}`) || variant.size || 'Standard'),
          color: String(form.get(`variant-color-${i}`) || variant.color || 'Standard'),
          price: Number(form.get(`variant-price-${i}`) ?? variant.price)
        })) : undefined;
        const result = await act('products/patch', { requestId: requestId(), productId: selected.id, patch: {
          name: String(form.get('name')), barcode: String(form.get('barcode') || '').trim(), salePrice: Number(form.get('price')), mrp: Number(form.get('mrp')),
          active: form.get('active') === 'on', ...(imageUrl ? { primaryImageUrl: imageUrl } : {}),
          ...(variantPatches ? { variantPatches } : {})
        } }, 'Product updated on the shared website catalog.');
        if (result) setSelected(null);
      }}><button type="button" className="editor-close" onClick={() => setSelected(null)}>×</button><span className="eyebrow">EDIT SHARED PRODUCT</span><h2>{selected.name}</h2><label>Name<input name="name" defaultValue={selected.name} required /></label><label>Selling price<input name="price" type="number" min="0" step="0.01" defaultValue={selected.price} required /></label><label>MRP<input name="mrp" type="number" min="0" step="0.01" defaultValue={selected.mrp} required /></label><label>Product barcode<input name="barcode" pattern="[A-Za-z0-9_.:-]*" defaultValue={selected.barcode || ''} placeholder="SKU is used if blank" /></label><label>New primary image URL<input name="primaryImageUrl" type="url" placeholder="Leave blank to keep existing image" /></label>{selected.variants.map((variant, i) => <div className="variant-edit" key={variant.sku || i}><strong>{variant.sku || `Variant ${i + 1}`}</strong><label>Barcode<input name={`variant-barcode-${i}`} pattern="[A-Za-z0-9_.:-]*" defaultValue={variant.barcode || ''} placeholder="Variant SKU is used if blank" /></label><label>Size<input name={`variant-size-${i}`} defaultValue={variant.size || 'Standard'} required /></label><label>Color<input name={`variant-color-${i}`} defaultValue={variant.color || 'Standard'} required /></label><label>Price<input name={`variant-price-${i}`} type="number" min="0" step="0.01" defaultValue={variant.price} required /></label>{variant.sku && <div className="label-links"><a href={`/api/products/${encodeURIComponent(selected.id)}/label?sku=${encodeURIComponent(variant.sku)}&format=code128`} target="_blank" rel="noreferrer">Code128 label</a><a href={`/api/products/${encodeURIComponent(selected.id)}/label?sku=${encodeURIComponent(variant.sku)}&format=qrcode`} target="_blank" rel="noreferrer">QR label</a></div>}</div>)}{!selected.variants.length && selected.sku && <div className="label-links"><a href={`/api/products/${encodeURIComponent(selected.id)}/label?sku=${encodeURIComponent(selected.sku)}&format=code128`} target="_blank" rel="noreferrer">Code128 label</a><a href={`/api/products/${encodeURIComponent(selected.id)}/label?sku=${encodeURIComponent(selected.sku)}&format=qrcode`} target="_blank" rel="noreferrer">QR label</a></div>}<label className="check-row"><input name="active" type="checkbox" defaultChecked={selected.active} />Publish to website</label><p>Stock is adjusted separately so every change has a movement record.</p><button className="button secondary" type="button" onClick={() => setLabelProduct(selected)}>Print barcode labels</button><button className="button primary">Save changes</button></form></div>}
    </>}
    {tab === 'pos' && <><div className="pos-toolbar"><div className="stock-summary glass"><div><span>All product stock</span><strong>{stockUnits.toLocaleString('en-IN')} units</strong></div><div><span>Available stock retail value</span><strong>{money(stockRetailTotal)}</strong></div></div><button className="button secondary add-pos-product" onClick={() => setCreating(true)}><Plus size={18} />Add new product</button></div><div className="pos-layout"><section className="glass pos-catalog"><div className="commerce-toolbar"><h2>Scan or search a product</h2><label className="field-search"><Search size={20} /><input ref={scanRef} autoFocus placeholder="Scan barcode, type SKU or search name" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); scanOrFind(); } }} /></label></div><p className="microcopy">A USB or Bluetooth scanner can type the barcode here and press Enter. Press F2 to focus the scanner field, or choose a variant below when searching by name.</p>
      <div className="pos-products">{shownProducts.slice(0, 60).map(product => <div className="pos-product" key={product.id}><div><strong>{product.name}</strong><small>{product.sku} · {money(product.price)} each · {product.stock} available</small><small>Stock retail value {money(retailStockValue(product))}</small></div><select aria-label={`Add variant of ${product.name}`} value="" onChange={event => { if (event.target.value) addToCart(product, event.target.value); }}><option value="">Add variant</option>{(product.variants.length ? product.variants : [{ sku: product.sku, stock: product.stock, price: product.price }]).map(v => <option key={v.sku} value={v.sku} disabled={v.stock <= 0}>{v.size || 'Standard'} {v.color || ''} · {v.stock} left</option>)}</select></div>)}</div></section>
      <form className="glass pos-checkout" onSubmit={completeSale}><span className="eyebrow">CURRENT BILL</span><h2>Checkout <span>{cart.reduce((sum, line) => sum + line.quantity, 0)} items</span></h2>{cart.length === 0 && <p className="empty-cart">Choose a product to start a bill.</p>}{cart.map(line => <div className="cart-line" key={`${line.product.id}:${line.sku}`}><div className="cart-description"><strong>{line.product.name}</strong><small>{line.sku} · {money(line.price)} each · {(line.product.variants.find(v => v.sku === line.sku)?.stock ?? line.product.stock)} available</small></div><label className="cart-qty">Qty<input type="number" min="1" max={line.product.variants.find(v => v.sku === line.sku)?.stock ?? line.product.stock} step="1" value={line.quantity} onChange={e => setCartQuantity(line.product.id, line.sku, Number(e.target.value))} aria-label={`Quantity for ${line.product.name}`} /></label><strong className="line-total">{money(line.price * line.quantity)}</strong><button type="button" onClick={() => setCart(old => old.filter(item => item !== line))} aria-label={`Remove ${line.product.name}`}>×</button></div>)}
      <div className="checkout-fields"><label>Customer name<input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Optional" /></label><label>Customer email<input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="Optional" /></label><label>WhatsApp phone<input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="With country code for receipt" /></label><label className="check-row"><input type="checkbox" checked={whatsappOptIn} onChange={e => setWhatsAppOptIn(e.target.checked)} disabled={!customerPhone.trim()} />Send bill on WhatsApp by default when a phone is entered</label><p className="whatsapp-note">Enter the number after the customer agrees to receive the receipt. Uncheck to skip WhatsApp for this bill.</p><label>Discount ₹<input type="number" min="0" step="0.01" value={discount} onChange={e => setDiscount(Number(e.target.value))} /></label><label>Payment method<select value={payment} onChange={e => setPayment(e.target.value as typeof payment)}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="credit">Credit / udhaar</option></select></label></div>
      <div className="bill-breakdown"><div><span>Subtotal</span><strong>{money(billSubtotal)}</strong></div><div><span>Discount</span><strong>− {money(discount)}</strong></div></div><div className="bill-total"><span>Total</span><strong>{money(Math.max(0, billSubtotal - discount))}</strong></div><button className="button primary" disabled={!cart.length}>Complete sale <ArrowRight size={17} /></button><p className="microcopy">With an agreed customer number and a connected WhatsApp Business account, the bill PDF sends automatically.</p></form></div>
      </>}
    {tab === 'inventory' && <><div className="stock-summary glass inventory-summary"><div><span>Available stock, all products</span><strong>{stockUnits.toLocaleString('en-IN')} units</strong></div><div><span>Total stock retail value</span><strong>{money(stockRetailTotal)}</strong></div></div><div className="glass table-panel"><div className="commerce-toolbar"><h2>Stock value by product</h2><label className="field-search"><Search size={17} /><input placeholder="Search product or SKU" value={query} onChange={e => setQuery(e.target.value)} /></label></div><div className="table-wrap valuation-table"><table><thead><tr><th>Product</th><th>SKU</th><th>Available quantity</th><th>Selling price</th><th>Stock retail value</th></tr></thead><tbody>{shownProducts.map(product => <tr key={product.id}><td><strong>{product.name}</strong></td><td>{product.sku}</td><td>{product.stock.toLocaleString('en-IN')}</td><td>{money(product.price)}</td><td><strong>{money(retailStockValue(product))}</strong></td></tr>)}</tbody></table></div></div><div className="glass table-panel"><h2>Adjust stock</h2><form className="stock-form" onSubmit={async event => { event.preventDefault(); const target = event.currentTarget; const form = new FormData(target); const result = await act('inventory/adjust', { requestId: requestId(), productId: String(form.get('productId')), sku: String(form.get('sku')), delta: Number(form.get('delta')), reason: String(form.get('reason')), note: String(form.get('note') || '') }, 'Stock movement recorded.'); if (result) { target.reset(); setSelected(null); } }}>
      <label>Product<select name="productId" required value={selected?.id || ''} onChange={e => setSelected(products.find(p => p.id === e.target.value) || null)}><option value="">Select product</option>{products.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
      <label>Variant<select name="sku" required><option value="">Select SKU</option>{(selected?.variants.length ? selected.variants : selected ? [{ sku: selected.sku, stock: selected.stock }] : []).map(v => <option value={v.sku} key={v.sku}>{v.sku} · {v.stock} available</option>)}</select></label>
      <label>Quantity change<input name="delta" type="number" step="1" required placeholder="+5 or -2" /></label>
      <label>Reason<select name="reason"><option value="purchase">Purchase received</option><option value="adjustment">Stock adjustment</option><option value="damage">Damage</option><option value="return">Accepted return</option></select></label>
      <label>Note<input name="note" maxLength={500} placeholder="Why this changed" /></label><button className="button primary">Record movement</button></form></div>
      <div className="glass table-panel"><h2>Recent stock movements</h2><div className="table-wrap"><table><thead><tr><th>SKU</th><th>Change</th><th>Reason</th><th>Source</th><th>After</th></tr></thead><tbody>{movements.map(row => <tr key={row.id}><td>{row.sku || '—'}</td><td className={Number(row.deltaChange) < 0 ? 'unavailable' : 'available'}>{Number(row.deltaChange) > 0 ? '+' : ''}{row.deltaChange}</td><td>{row.reason || '—'}</td><td>{row.source || '—'}</td><td>{row.stockAfter ?? '—'}</td></tr>)}</tbody></table></div></div></>}
    {tab === 'orders' && <><div className="commerce-toolbar"><span>{newOrderCount ? `${newOrderCount} new orders` : `${orders.length} recent orders`}</span><button className="button secondary" onClick={() => { setSoundEnabled(true); setNewOrderCount(0); }}><Volume2 size={16} />{soundEnabled ? 'Sound on' : 'Enable new-order sound'}</button></div>
      <div className="glass table-panel"><div className="table-wrap"><table><thead><tr><th>Order</th><th>Channel</th><th>Customer</th><th>Total</th><th>Status</th><th>Action</th></tr></thead><tbody>{orders.map(row => <tr key={row.id}><td><strong>{row.id}</strong><small>{row.paymentMethod || ''}</small></td><td>{row.createdBy === 'admin-pos' ? 'POS' : 'Website'}</td><td>{row.customerName || row.shippingAddress?.fullName || '—'}</td><td>{money(row.totalAmount)}</td><td><span className="source-tag">{row.status || 'Processing'}</span></td><td><select aria-label={`Update ${row.id}`} value="" onChange={event => { const status = event.target.value; if (status) void act('orders/status', { requestId: requestId(), orderId: row.id, status }, `Order marked ${status}.`); }}><option value="">Set status</option>{['Confirmed', 'Packed', 'Shipped', 'Delivered', 'Cancelled'].map(s => <option key={s} value={s}>{s}</option>)}</select><button className="text-button" onClick={async () => { const result = await act('orders/invoice', { requestId: requestId(), orderId: row.id }, 'Invoice created.'); if (result?.invoiceId) { const invoice = (await get<{ items: Invoice[] }>('invoices')).items.find(i => i.id === result.invoiceId); if (invoice) setLastInvoice(invoice); } }}>Invoice</button>{row.status === 'Delivered' && <button className="text-button" onClick={() => { const reason = window.prompt('Return reason (at least 3 characters)'); if (reason?.trim() && reason.trim().length >= 3) void act('orders/return', { requestId: requestId(), orderId: row.id, reason: reason.trim() }, 'Return recorded; credit note created. Review the refund separately.'); }}>Return</button>}</td></tr>)}</tbody></table></div></div></>}
    {tab === 'customers' && <div className="glass table-panel"><div className="commerce-toolbar"><label className="field-search"><Search size={16} /><input placeholder="Search customer" value={query} onChange={e => setQuery(e.target.value)} /></label><span>{customers.length} profiles</span></div><div className="table-wrap"><table><thead><tr><th>Name</th><th>Phone</th><th>Email</th></tr></thead><tbody>{customers.filter(c => `${c.fullName} ${c.phone} ${c.email}`.toLowerCase().includes(query.toLowerCase())).map(c => <tr key={c.id}><td>{c.fullName || '—'}</td><td>{c.phone || '—'}</td><td>{c.email || '—'}</td></tr>)}</tbody></table></div></div>}
    {tab === 'suppliers' && <><div className="glass table-panel"><h2>Add supplier</h2><form className="stock-form" onSubmit={async event => { event.preventDefault(); const target = event.currentTarget, form = new FormData(target); const result = await act('suppliers/create', { requestId: requestId(), name: String(form.get('name')), phone: String(form.get('phone') || ''), email: String(form.get('email') || '') || undefined, gstin: String(form.get('gstin') || '') }, 'Supplier added.'); if (result) target.reset(); }}><label>Name<input name="name" required minLength={2} /></label><label>Phone<input name="phone" inputMode="tel" /></label><label>Email<input name="email" type="email" /></label><label>GSTIN<input name="gstin" maxLength={15} /></label><button className="button primary">Add supplier</button></form></div><div className="glass table-panel"><h2>Receive a purchase</h2><form className="stock-form" onSubmit={async event => { event.preventDefault(); const target = event.currentTarget, form = new FormData(target); const result = await act('purchases/receive', { requestId: requestId(), supplierId: String(form.get('supplierId')), supplierInvoice: String(form.get('supplierInvoice')), amountPaid: Number(form.get('amountPaid') || 0), lines: [{ productId: String(form.get('productId')), sku: String(form.get('sku')), quantity: Number(form.get('quantity')), unitCost: Number(form.get('unitCost')) }] }, 'Purchase received and stock updated.'); if (result) { target.reset(); setSelected(null); } }}><label>Supplier<select name="supplierId" required><option value="">Choose supplier</option>{suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Supplier invoice<input name="supplierInvoice" required /></label><label>Product<select name="productId" required value={selected?.id || ''} onChange={e => setSelected(products.find(p => p.id === e.target.value) || null)}><option value="">Choose product</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Variant<select name="sku" required><option value="">Choose SKU</option>{(selected?.variants.length ? selected.variants : selected ? [{ sku: selected.sku, stock: selected.stock }] : []).map(v => <option key={v.sku} value={v.sku}>{v.sku}</option>)}</select></label><label>Quantity<input name="quantity" type="number" min="1" step="1" required /></label><label>Unit cost ₹<input name="unitCost" type="number" min="0" step="0.01" required /></label><label>Amount paid ₹<input name="amountPaid" type="number" min="0" step="0.01" defaultValue="0" /></label><button className="button primary">Receive stock</button></form><p className="microcopy">One variant per receipt in this preview. Each receipt records a stock movement and supplier balance.</p></div><div className="glass table-panel"><h2>Recent purchases</h2><div className="table-wrap"><table><thead><tr><th>Receipt</th><th>Supplier</th><th>Invoice</th><th>Total</th><th>Payable</th></tr></thead><tbody>{purchases.map(p => <tr key={p.id}><td>{p.id}</td><td>{p.supplierName}</td><td>{p.supplierInvoice}</td><td>{money(p.total)}</td><td>{money(p.payable)}</td></tr>)}</tbody></table></div></div></>}
    {tab === 'reports' && <><div className="stats-grid">{[{ label: 'Website sales', value: orders.filter(o => o.createdBy !== 'admin-pos' && o.status !== 'Cancelled').reduce((sum, o) => sum + Number(o.totalAmount || 0), 0) },
      { label: 'POS sales', value: orders.filter(o => o.createdBy === 'admin-pos' && o.status !== 'Cancelled').reduce((sum, o) => sum + Number(o.totalAmount || 0), 0) },
      { label: 'Invoices', value: invoices.length }, { label: 'Recent orders', value: orders.length }].map((card, index) => <div className="glass stat-card" key={card.label}><span>{card.label}</span><strong>{index < 2 ? money(card.value) : card.value}</strong><small>From recent loaded records only</small></div>)}</div><div className="notice"><FileDown size={17} />This overview is limited to the most recent 80 orders. Accounting exports require a full indexed date-range query.</div></>}
    {tab === 'sync' && <><div className="glass table-panel"><h2>Offline bills on this device · {offlineSales.length}</h2>{offlineSales.map(sale => <div className="source-row" key={sale.requestId}><span className="row-number">{sale.state}</span><div><strong>{sale.requestId}</strong><small>{sale.lines.length} lines · queued {new Date(sale.queuedAt).toLocaleString('en-IN')}</small></div><span>{sale.error || ''}</span></div>)}{!offlineSales.length && <p>No offline bills on this device.</p>}</div><div className="glass table-panel"><h2>Recent sync events</h2><div className="table-wrap"><table><thead><tr><th>Event</th><th>Source</th><th>Invoice</th><th>Status</th><th>Retries</th><th>Action</th></tr></thead><tbody>{sync.map(row => <tr key={row.id}><td>{row.event || '—'}</td><td>{row.source || '—'}</td><td>{row.invoiceId || '—'}</td><td><span className="source-tag">{row.status || '—'}</span><small>{row.error || row.providerMessageId || ''}</small></td><td>{row.retryCount ?? 0}</td><td>{['failed', 'awaiting_provider'].includes(row.status || '') && <button className="text-button" onClick={() => void act('sync/retry', { requestId: requestId(), eventId: row.id }, 'Delivery retry processed.')}>Retry</button>}</td></tr>)}</tbody></table></div>{!sync.length && <p>No server sync events yet.</p>}<p className="microcopy">Pending deliveries need Meta WhatsApp Business API credentials and an approved document-header receipt template. Unknown outcomes require provider review before another send.</p></div></>}
    {creating && <NewPosProductDialog onClose={() => setCreating(false)} onCreate={createPosProduct} />}
    {labelProduct && <BarcodeLabel product={labelProduct} onClose={() => setLabelProduct(null)} />}
    {lastInvoice && <div className="editor-backdrop" onClick={() => setLastInvoice(null)}><div className="invoice-sheet glass" onClick={e => e.stopPropagation()}><div className="invoice-actions"><button className="button secondary" onClick={() => setLastInvoice(null)}>Close</button><a className="button secondary" href={`/api/invoices/${encodeURIComponent(lastInvoice.id)}/pdf`} download>Download PDF</a><button className="button primary" onClick={() => window.print()}><Printer size={16} />Print</button></div><div className="invoice-header"><BrandLogo /><div><h2>{shop?.name || 'Brothers Outfit Gallery'}</h2><p>{shop?.address || 'FF-57, Pratham Square, Himatnagar, Gujarat 383001'}<br />{shop?.phone || '+91 84602 33020'}</p></div></div><h1>Sales receipt</h1><p><strong>{lastInvoice.id}</strong> · {lastInvoice.channel}<br />Customer: {lastInvoice.customerName || 'Walk-in'} {lastInvoice.customerPhone || ''}<br />Order: {lastInvoice.orderId}</p><table><thead><tr><th>Product</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>{lastInvoice.lines.map((line, i) => <tr key={i}><td>{line.name || line.sku || 'Item'}</td><td>{line.quantity}</td><td>{money(line.price)}</td><td>{money(Number(line.price || 0) * Number(line.quantity || 0))}</td></tr>)}</tbody></table><div className="bill-total"><span>Total</span><strong>{money(lastInvoice.total)}</strong></div><p className="microcopy">Payment: {lastInvoice.paymentMethod}. Sales receipt; GST is deferred.</p></div></div>}
  </div>;
}
