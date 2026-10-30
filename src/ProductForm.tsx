import { useRef, useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';

export type NewProductInput = {
  requestId: string; name: string; sku: string; barcode?: string; category: string; subCategory?: string;
  shortDescription?: string; description?: string; gsl?: string; salePrice: number; mrp: number; costPrice: number;
  publish: boolean; isTrending: boolean; offerEnabled: boolean; offerDiscountPercentage: number;
  offerStartAt?: string; offerEndAt?: string;
  offerTitle?: string; offerItems?: string[];
  sizeGuide?: { enabled: boolean; unit: 'in' | 'cm'; columns: string[]; rows: Record<string, string>[] };
  variants: { size: string; color: string; colorHex?: string; stock: number; price: number; costPrice: number; barcode?: string }[];
  imageUrls?: string[];
};

type VariantRow = { id: string; size: string; color: string; colorHex: string; stock: string; price: string; costPrice: string; barcode: string };
const categories = ['Kurta', 'Shirts', 'T-Shirts', 'Jeans', 'Trousers', 'Shorts', 'Jackets', 'Hoodies', 'Ethnic Wear', 'Vest', 'Underwear', 'Perfumes', 'Wallets', 'Slippers', 'Watches', 'Belts', 'Caps', 'Sunglasses'];
const subCategories: Record<string, string[]> = {
  Shirts: ['Formal', 'Casual', 'Oversized', 'Slim Fit', 'Regular Fit'], 'T-Shirts': ['Oversized', 'Polo', 'Round Neck', 'V-Neck'],
  Jeans: ['Slim Fit', 'Regular Fit', 'Relaxed Fit', 'Baggy'], Trousers: ['Formal', 'Casual', 'Cargo'], Kurta: ['Short', 'Long', 'Pathani']
};
const newRow = (): VariantRow => ({ id: crypto.randomUUID(), size: 'Standard', color: 'Standard', colorHex: '#b88a2e', stock: '0', price: '', costPrice: '', barcode: '' });
const normalized = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'STANDARD';
async function preparedImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const ratio = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
    canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot prepare product images.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image compression failed.')), 'image/webp', 0.84));
  } finally { bitmap.close(); }
}

export function ProductFormDialog({ mode, onClose, onCreate }: { mode: 'products' | 'pos'; onClose: () => void; onCreate: (product: NewProductInput) => Promise<void> }) {
  const requestId = useRef(crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('Shirts');
  const [customCategory, setCustomCategory] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [customSubCategory, setCustomSubCategory] = useState('');
  const [sku, setSku] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [rows, setRows] = useState<VariantRow[]>([newRow()]);
  const [bulkStock, setBulkStock] = useState('');
  const [bulkPrice, setBulkPrice] = useState('');
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sizeGuideEnabled, setSizeGuideEnabled] = useState(false);
  function updateRow(id: string, field: keyof VariantRow, value: string) { setRows(old => old.map(row => row.id === id ? { ...row, [field]: value } : row)); }
  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true); setError('');
    try {
      const csrfResponse = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
      if (!csrfResponse.ok) throw new Error('Sign in again before uploading.');
      const { token } = await csrfResponse.json() as { token: string };
      for (const file of Array.from(files)) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10_000_000) throw new Error('Choose JPEG, PNG or WebP images under 10 MB.');
        const prepared = await preparedImage(file);
        if (prepared.size > 3_000_000) throw new Error('The optimized image is still too large. Choose a smaller photo.');
        const response = await fetch('/api/products/images/upload', { method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': prepared.type, 'x-csrf-token': token }, body: prepared });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Image upload failed.');
        setUploadedUrls(old => [...old, result.url]);
      }
    } catch (cause) { setError((cause as Error).message); }
    finally { setUploading(false); }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const form = new FormData(event.currentTarget);
    const variantSkus = rows.map(row => `${sku.trim()}-${normalized(row.color)}-${normalized(row.size)}`);
    if (new Set(variantSkus).size !== variantSkus.length) { setError('Each color and size combination must be unique.'); return; }
    if (rows.some(row => !row.color.trim() || !row.size.trim() || !Number.isSafeInteger(Number(row.stock)) || Number(row.stock) < 0)) {
      setError('Every variant needs a color, size and whole-number stock quantity.'); return;
    }
    const pastedUrls = mode === 'products' ? String(form.get('imageUrls') || '').split(/\r?\n/).map(url => url.trim()).filter(Boolean) : [];
    const imageUrls = [...new Set([...uploadedUrls, ...pastedUrls])];
    const columns = String(form.get('sizeGuideColumns') || '').split(',').map(value => value.trim()).filter(Boolean);
    const guideLines = String(form.get('sizeGuideRows') || '').split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    if (sizeGuideEnabled && (!columns.length || guideLines.some(line => line.split(',').length !== columns.length))) {
      setError('Size guide rows must have the same number of comma-separated cells as the column headings.'); return;
    }
    const guideRows = guideLines.map(line => Object.fromEntries(line.split(',').map((value, index) => [`c${index}`, value.trim()])));
    const input: NewProductInput = {
      requestId: requestId.current, name: String(form.get('name') || '').trim(), sku: sku.trim(),
      barcode: String(form.get('barcode') || '').trim() || undefined,
      category: category === '__custom__' ? customCategory.trim() : category,
      subCategory: subCategory === '__custom__' ? customSubCategory.trim() : subCategory,
      shortDescription: String(form.get('shortDescription') || '').trim(), description: String(form.get('description') || '').trim(),
      gsl: String(form.get('gsl') || '').trim(), mrp: Number(form.get('mrp')), salePrice: Number(salePrice), costPrice: Number(costPrice || 0),
      publish: form.get('publish') === 'on', isTrending: form.get('isTrending') === 'on',
      offerEnabled: form.get('offerEnabled') === 'on', offerDiscountPercentage: Number(form.get('offerDiscountPercentage') || 0),
      offerStartAt: String(form.get('offerStartAt') || '').trim() || undefined,
      offerEndAt: String(form.get('offerEndAt') || '').trim() || undefined,
      offerTitle: String(form.get('offerTitle') || '').trim(),
      offerItems: String(form.get('offerItems') || '').split(/\r?\n/).map(item => item.trim()).filter(Boolean),
      sizeGuide: { enabled: sizeGuideEnabled, unit: form.get('sizeGuideUnit') === 'cm' ? 'cm' : 'in',
        columns: sizeGuideEnabled ? columns : [], rows: sizeGuideEnabled ? guideRows : [] },
      variants: rows.map(row => ({ size: row.size.trim(), color: row.color.trim(), colorHex: row.colorHex,
        stock: Number(row.stock), price: Number(row.price || salePrice), costPrice: Number(row.costPrice || costPrice || 0),
        barcode: row.barcode.trim() || undefined })), ...(imageUrls.length ? { imageUrls } : {})
    };
    if (input.mrp <= 0 || input.salePrice <= 0 || input.salePrice > input.mrp ||
        input.variants.some(variant => variant.price <= 0 || variant.price > input.mrp)) {
      setError('MRP and selling prices must be positive, and no selling price can exceed MRP.'); return;
    }
    if (input.offerStartAt && input.offerEndAt && input.offerEndAt <= input.offerStartAt) {
      setError('Offer end date must be after its start date.'); return;
    }
    if (mode === 'products' && input.publish && !imageUrls.length) { setError('Add at least one product image before publishing, as on the website.'); return; }
    if (!input.category || input.category.length < 2) { setError('Choose or enter a category.'); return; }
    if (input.imageUrls?.some(url => { try { return new URL(url).protocol !== 'https:'; } catch { return true; } })) { setError('Use HTTPS image URLs only.'); return; }
    setSaving(true);
    try { await onCreate(input); } catch (cause) { setError((cause as Error).message); }
    finally { setSaving(false); }
  }
  const totalStock = rows.reduce((sum, row) => sum + Number(row.stock || 0), 0);
  const retailValue = rows.reduce((sum, row) => sum + Number(row.stock || 0) * Number(row.price || salePrice || 0), 0);
  return <div className="editor-backdrop" onClick={onClose}><form className="editor glass website-product-form" role="dialog" aria-modal="true" aria-label="Add product to shared website catalog" onClick={event => event.stopPropagation()} onSubmit={event => void submit(event)}>
    <div className="product-form-header"><div><span className="eyebrow">SHARED WEBSITE CATALOG</span><h2>Add new product</h2><p>The same product, variants and stock used by the website.</p></div><button className="editor-close" type="button" onClick={onClose} aria-label="Close">×</button></div>
    {error && <div className="error-banner" role="alert">{error}</div>}
    <section className="product-form-section"><h3>Basic information</h3><div className="new-product-grid"><label>Product name<input name="name" required minLength={2} maxLength={200} autoFocus placeholder="Premium Oversized Cotton Shirt" /></label><label>SKU<input name="sku" required pattern="[A-Za-z0-9_.:-]+" maxLength={90} value={sku} onChange={event => setSku(event.target.value)} placeholder="SHT-BLK-001" /></label><label>Product barcode<input name="barcode" pattern="[A-Za-z0-9_.:-]*" maxLength={128} placeholder="Optional; SKU works as barcode" /></label><label>Category<select value={category} onChange={event => { setCategory(event.target.value); setSubCategory(''); }}><option value="">Choose category</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}<option value="__custom__">Custom category</option></select></label>{category === '__custom__' && <label>Custom category<input required value={customCategory} onChange={event => setCustomCategory(event.target.value)} maxLength={100} /></label>}<label>Sub-category / fit<select value={subCategory} onChange={event => setSubCategory(event.target.value)}><option value="">Optional</option>{(subCategories[category] || []).map(value => <option key={value} value={value}>{value}</option>)}<option value="__custom__">Custom fit</option></select></label>{subCategory === '__custom__' && <label>Custom fit<input required value={customSubCategory} onChange={event => setCustomSubCategory(event.target.value)} maxLength={100} /></label>}<label>GSL / fabric weight<input name="gsl" maxLength={120} placeholder="Optional" /></label></div><label>Short description<textarea name="shortDescription" rows={2} maxLength={500} /></label><label>Full description<textarea name="description" rows={3} maxLength={5000} /></label></section>
    <section className="product-form-section"><h3>Pricing & cost</h3><div className="new-product-grid"><label>MRP ₹<input name="mrp" type="number" min="0" step="0.01" required /></label><label>Selling price ₹<input name="salePrice" type="number" min="0" step="0.01" required value={salePrice} onChange={event => setSalePrice(event.target.value)} /></label><label>Cost price ₹<input name="costPrice" type="number" min="0" step="0.01" value={costPrice} onChange={event => setCostPrice(event.target.value)} /></label></div></section>
    <section className="product-form-section"><div className="section-heading"><h3>Colors, sizes & stock</h3><button className="button secondary" type="button" onClick={() => setRows(old => [...old, { ...newRow(), price: salePrice, costPrice }])}><Plus size={17} />Add variant</button></div><p>Each color and size creates a website variant with its own barcode, price and stock.</p><div className="product-form-bulk"><label>Set all stock<input type="number" min="0" step="1" value={bulkStock} onChange={event => setBulkStock(event.target.value)} /></label><button className="button secondary" type="button" onClick={() => { if (bulkStock !== '') setRows(old => old.map(row => ({ ...row, stock: bulkStock }))); }}>Apply stock</button><label>Set all prices ₹<input type="number" min="0" step="0.01" value={bulkPrice} onChange={event => setBulkPrice(event.target.value)} /></label><button className="button secondary" type="button" onClick={() => { if (bulkPrice !== '') setRows(old => old.map(row => ({ ...row, price: bulkPrice }))); }}>Apply price</button></div>{rows.map((row, index) => <div className="product-variant-row" key={row.id}><div className="section-heading"><strong>Variant {index + 1}</strong><button className="icon-button" type="button" disabled={rows.length === 1} onClick={() => setRows(old => old.filter(item => item.id !== row.id))} aria-label={`Remove variant ${index + 1}`}><Trash2 size={17} /></button></div><div className="new-product-grid"><label>Color<input value={row.color} onChange={event => updateRow(row.id, 'color', event.target.value)} required maxLength={80} /></label><label>Color swatch<input type="color" value={row.colorHex} onChange={event => updateRow(row.id, 'colorHex', event.target.value)} /></label><label>Size<input value={row.size} onChange={event => updateRow(row.id, 'size', event.target.value)} required maxLength={50} /></label><label>Opening stock<input type="number" min="0" max="100000" step="1" value={row.stock} onChange={event => updateRow(row.id, 'stock', event.target.value)} required /></label><label>Selling price ₹<input type="number" min="0" step="0.01" value={row.price} onChange={event => updateRow(row.id, 'price', event.target.value)} placeholder={salePrice || 'Base price'} /></label><label>Cost ₹<input type="number" min="0" step="0.01" value={row.costPrice} onChange={event => updateRow(row.id, 'costPrice', event.target.value)} placeholder={costPrice || 'Base cost'} /></label><label>Variant barcode<input value={row.barcode} onChange={event => updateRow(row.id, 'barcode', event.target.value)} pattern="[A-Za-z0-9_.:-]*" maxLength={128} placeholder="Auto SKU if blank" /></label></div><small>Variant SKU: {sku ? `${sku}-${normalized(row.color)}-${normalized(row.size)}` : 'Enter product SKU above'}</small></div>)}<div className="product-form-totals"><span>Total opening stock <strong>{totalStock.toLocaleString('en-IN')} units</strong></span><span>Stock retail value <strong>₹{retailValue.toLocaleString('en-IN')}</strong></span></div></section>
    <section className="product-form-section"><h3>Custom size guide</h3><label className="check-row"><input type="checkbox" checked={sizeGuideEnabled} onChange={event => setSizeGuideEnabled(event.target.checked)} />Show a product-specific size chart</label>{sizeGuideEnabled && <><label>Unit<select name="sizeGuideUnit"><option value="in">Inches</option><option value="cm">Centimeters</option></select></label><label>Column headings, comma separated<input name="sizeGuideColumns" placeholder="Size, Chest (in), Length (in)" required /></label><label>One row per size, comma separated<textarea name="sizeGuideRows" rows={4} placeholder={"S, 38, 27\nM, 40, 28"} required /></label></>}</section>
    {mode === 'products' && <section className="product-form-section"><h3>Product images</h3><p>Upload product photos to the website's ImageKit account, or paste secure image URLs. The first image becomes the main website image.</p><label>Upload photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => void uploadFiles(event.target.files)} disabled={uploading} /></label>{uploading && <p>Uploading photos…</p>}{uploadedUrls.length > 0 && <div className="product-form-images">{uploadedUrls.map(url => <div key={url}><img src={url} alt="Uploaded product" /><button className="text-button" type="button" onClick={() => setUploadedUrls(old => old.filter(item => item !== url))}>Remove</button></div>)}</div>}<label>Or paste image URLs<textarea name="imageUrls" rows={3} placeholder="https://…" /></label></section>}
    <section className="product-form-section"><h3>Visibility & offers</h3><div className="new-product-grid">{mode === 'products' && <label className="check-row"><input name="publish" type="checkbox" defaultChecked />Visible on website</label>}<label className="check-row"><input name="isTrending" type="checkbox" />Trending product</label><label className="check-row"><input name="offerEnabled" type="checkbox" />Enable offer</label><label>Offer discount %<input name="offerDiscountPercentage" type="number" min="0" max="100" step="0.01" defaultValue="0" /></label><label>Offer start date<input name="offerStartAt" type="datetime-local" /></label><label>Offer end date<input name="offerEndAt" type="datetime-local" /></label></div><label>Offer box title<input name="offerTitle" maxLength={200} placeholder="Offers for you" /></label><label>Custom offer lines<textarea name="offerItems" rows={3} placeholder={"Buy 2 and save ₹300\nPrepaid orders get 5% off"} /></label></section>
    {mode === 'pos' && <p className="product-form-pos-note">POS products start as website drafts until you add photos and publish them from Products.</p>}
    <div className="product-form-actions"><button className="button secondary" type="button" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving || uploading}>{saving ? 'Saving product…' : 'Add product to website catalog'}</button></div>
  </form></div>;
}
