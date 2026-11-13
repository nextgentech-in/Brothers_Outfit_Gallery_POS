import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';

export type NewProductInput = {
  requestId: string; brand?: string; design?: string; fabric?: string; name: string; sku: string; barcode?: string; category: string; subCategory?: string;
  shortDescription?: string; description?: string; gsl?: string; salePrice: number; mrp: number; costPrice: number; gstEnabled: boolean; gstPercent: number;
  publish: boolean; isTrending: boolean; offerEnabled: boolean; offerDiscountPercentage: number;
  offerStartAt?: string; offerEndAt?: string;
  offerTitle?: string; offerItems?: string[];
  imageUrls?: string[];
  sizeGuide?: { enabled: boolean; unit: 'in' | 'cm'; columns: string[]; rows: Record<string, string>[] };
  variants: { size: string; color: string; colorHex?: string; stock: number; price: number; costPrice: number; barcode?: string }[];
};

type VariantRow = { id: string; size: string; color: string; colorHex: string; stock: string; price: string; costPrice: string; barcode: string };
const categories = ['Kurta', 'Shirts', 'T-Shirts', 'Jeans', 'Trousers', 'Shorts', 'Jackets', 'Hoodies', 'Ethnic Wear', 'Vest', 'Underwear', 'Perfumes', 'Wallets', 'Slippers', 'Watches', 'Belts', 'Caps', 'Sunglasses'];
const subCategories: Record<string, string[]> = {
  Kurta: ['Lakhnavi Kurta', 'Printed Kurta', 'Daman Work Kurta', 'Plain Kurta', 'Kachi Work Kurta', 'Bandhani Kurta', 'Koti Kurta', 'Embroidery Kurta'],
  Shirts: ['Casual', 'Formal', 'Printed', 'Linen', 'Denim', 'Oxford', 'Mandarin Collar', 'Half Sleeve'],
  'T-Shirts': ['Oversized', 'Regular Fit', 'Slim Fit', 'Polo', 'Graphic', 'Drop Shoulder', 'Acid Wash', 'Henley', 'Full Sleeve', 'Full Sleeve Collar'],
  Jeans: ['Skinny', 'Slim Fit', 'Regular', 'Baggy', 'Wide Leg', 'Ripped', 'Bootcut', 'Tapered', 'Straight Fit'],
  Trousers: ['Cargo', 'Chino', 'Jogger', 'Formal', 'Pleated', 'Straight Fit', 'Slim Fit'],
  Shorts: ['Cargo', 'Chino', 'Denim', 'Sports', 'Casual', 'Bermuda', 'Running'],
  Jackets: ['Bomber', 'Denim', 'Puffer', 'Windbreaker', 'Varsity', 'Leather', 'Quilted'],
  Hoodies: ['Pullover', 'Zip-Up', 'Cropped', 'Oversized', 'Sleeveless', 'Graphic'],
  'Ethnic Wear': ['Kurta', 'Sherwani', 'Pathani Suit', 'Nehru Jacket', 'Dhoti Set'],
  Vest: ['Plain', 'Lining', 'Coloring'], Underwear: ['Long Trunk', 'Mini Trunk', 'Brief'],
  Slippers: ['Slides', 'Flip Flops', 'Sports', 'Casual', 'Platform', 'Memory Foam'],
  Perfumes: ['Eau de Parfum', 'Eau de Toilette', 'Body Spray', 'Attar', 'Deodorant', 'Gift Set'],
  Wallets: ['Bifold', 'Trifold', 'Card Holder', 'Money Clip'], Watches: ['Analog', 'Digital', 'Smart Watch', 'Chronograph'],
  Belts: ['Leather', 'Canvas', 'Reversible', 'Auto-Lock', 'Braided'], Caps: ['Baseball Cap', 'Snapback', 'Trucker Hat', 'Beanie', 'Bucket Hat'],
  Sunglasses: ['Aviator', 'Wayfarer', 'Round', 'Square', 'Polarized']
};
const categorySizes: Record<string, string[]> = {
  Kurta: ['36', '38', '40', '42', '44', '46', 'S', 'M', 'L', 'XL', 'XXL', '3XL'],
  Shirts: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL', '6XL'],
  'T-Shirts': ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'Free Size'],
  Jeans: ['28', '30', '32', '34', '36', '38', '40', '42'], Trousers: ['28', '30', '32', '34', '36', '38', '40', '42'],
  Shorts: ['28', '30', '32', '34', '36', '38', '40', '42'], Jackets: ['S', 'M', 'L', 'XL', 'XXL', '3XL'], Hoodies: ['S', 'M', 'L', 'XL', 'XXL', '3XL'],
  'Ethnic Wear': ['36', '38', '40', '42', '44', '46', 'M', 'L', 'XL', 'XXL'],
  Vest: ['S', 'M', 'L', 'XL', 'XXL', '3XL', '75cm', '80cm', '85cm', '90cm', '95cm', '100cm', 'Free Size'],
  Underwear: ['S', 'M', 'L', 'XL', 'XXL', '3XL', '75cm', '80cm', '85cm', '90cm', '95cm', '100cm', '28', '30', '32', '34', '36', '38', '40'],
  Perfumes: ['10ml', '20ml', '30ml', '50ml', '75ml', '100ml', '120ml', '150ml', '200ml'],
  Slippers: ['6', '7', '8', '9', '10', '11'], Wallets: ['Standard', 'Slim', 'Bifold', 'Trifold'],
  Watches: ['Standard', 'Dial 40mm', 'Dial 42mm', 'Adjustable Strap'], Belts: ['28-32', '32-36', '36-40', '40-44', 'Free Size', 'Adjustable'],
  Caps: ['Free Size', 'Adjustable', 'S/M', 'L/XL', 'Snapback', 'Standard'], Sunglasses: ['Standard', 'Free Size', 'Medium (54mm)', 'Large (58mm)', 'Small (50mm)']
};
const newRow = (): VariantRow => ({ id: crypto.randomUUID(), size: 'Standard', color: 'Standard', colorHex: '#b88a2e', stock: '0', price: '', costPrice: '', barcode: '' });
const normalized = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'STANDARD';
export function ProductFormDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (product: NewProductInput) => Promise<void> }) {
  const requestId = useRef(crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('Shirts');
  const [customCategory, setCustomCategory] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [customSubCategory, setCustomSubCategory] = useState('');
  const [sku, setSku] = useState(() => `ITEM-${crypto.randomUUID().slice(0,8).toUpperCase()}`);
  const [gridSizes,setGridSizes]=useState<string[]>([]),[gridColors,setGridColors]=useState('');
  const [batchStock, setBatchStock] = useState('0');
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [salePrice, setSalePrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [gstEnabled, setGstEnabled] = useState(false);
  const [gstPercent, setGstPercent] = useState('5');
  const [rows, setRows] = useState<VariantRow[]>([newRow()]);
  const [bulkStock, setBulkStock] = useState('');
  const [bulkPrice, setBulkPrice] = useState('');
  const [sizeGuideEnabled, setSizeGuideEnabled] = useState(false);
  useEffect(() => {
    const previews = images.map(file => URL.createObjectURL(file));
    setImagePreviews(previews);
    return () => previews.forEach(url => URL.revokeObjectURL(url));
  }, [images]);
  function updateRow(id: string, field: keyof VariantRow, value: string) { setRows(old => old.map(row => row.id === id ? { ...row, [field]: value } : row)); }
  function addCombinations() {
    const colors = gridColors.split(',').map(value => value.trim()).filter(Boolean);
    if (!gridSizes.length || !colors.length || gridSizes.length * colors.length > 100) {
      setError('Choose at least one size and enter a colour. The limit is 100 combinations.'); return;
    }
    if (!Number.isSafeInteger(Number(batchStock)) || Number(batchStock) < 0) { setError('Batch stock must be a whole number.'); return; }
    setRows(old => {
      const existing = old.length === 1 && old[0].size === 'Standard' && old[0].color === 'Standard' && old[0].stock === '0' ? [] : old;
      const added = colors.flatMap(color => gridSizes.filter(size => !existing.some(row => row.size.toLowerCase() === size.toLowerCase() && row.color.toLowerCase() === color.toLowerCase())).map(size => ({ ...newRow(), size, color, stock: batchStock, price: salePrice, costPrice })));
      return [...existing, ...added];
    });
    setError('');
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const form = new FormData(event.currentTarget);
    const variantSkus = rows.map(row => `${sku.trim()}-${normalized(row.color)}-${normalized(row.size)}`);
    if (new Set(variantSkus).size !== variantSkus.length) { setError('Each color and size combination must be unique.'); return; }
    if (rows.some(row => !row.color.trim() || !row.size.trim() || !Number.isSafeInteger(Number(row.stock)) || Number(row.stock) < 0)) {
      setError('Every variant needs a color, size and whole-number stock quantity.'); return;
    }
    const columns = String(form.get('sizeGuideColumns') || '').split(',').map(value => value.trim()).filter(Boolean);
    const guideLines = String(form.get('sizeGuideRows') || '').split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    if (sizeGuideEnabled && (!columns.length || guideLines.some(line => line.split(',').length !== columns.length))) {
      setError('Size guide rows must have the same number of comma-separated cells as the column headings.'); return;
    }
    const guideRows = guideLines.map(line => Object.fromEntries(line.split(',').map((value, index) => [`c${index}`, value.trim()])));
    const input: NewProductInput = {
      brand:String(form.get('brand')||'').trim(),design:String(form.get('design')||'').trim(),fabric:String(form.get('fabric')||'').trim(),
      requestId: requestId.current, name: String(form.get('name') || '').trim(), sku: sku.trim(),
      barcode: String(form.get('barcode') || '').trim() || undefined,
      category: category === '__custom__' ? customCategory.trim() : category,
      subCategory: subCategory === '__custom__' ? customSubCategory.trim() : subCategory,
      shortDescription: String(form.get('shortDescription') || '').trim(), description: String(form.get('description') || '').trim(),
      gsl: String(form.get('gsl') || '').trim(), mrp: Number(form.get('mrp')), salePrice: Number(salePrice), costPrice: Number(costPrice || 0),
      gstEnabled, gstPercent: gstEnabled ? Number(gstPercent) : 0,
      publish: false, isTrending: form.get('isTrending') === 'on',
      offerEnabled: form.get('offerEnabled') === 'on', offerDiscountPercentage: Number(form.get('offerDiscountPercentage') || 0),
      offerStartAt: String(form.get('offerStartAt') || '').trim() || undefined,
      offerEndAt: String(form.get('offerEndAt') || '').trim() || undefined,
      offerTitle: String(form.get('offerTitle') || '').trim(),
      offerItems: String(form.get('offerItems') || '').split(/\r?\n/).map(item => item.trim()).filter(Boolean),
      sizeGuide: { enabled: sizeGuideEnabled, unit: form.get('sizeGuideUnit') === 'cm' ? 'cm' : 'in',
        columns: sizeGuideEnabled ? columns : [], rows: sizeGuideEnabled ? guideRows : [] },
      variants: rows.map(row => ({ size: row.size.trim(), color: row.color.trim(), colorHex: row.colorHex,
        stock: Number(row.stock), price: Number(row.price || salePrice), costPrice: Number(row.costPrice || costPrice || 0),
        barcode: row.barcode.trim() || undefined }))
    };
    if (input.mrp <= 0 || input.salePrice <= 0 || input.salePrice > input.mrp ||
        input.variants.some(variant => variant.price <= 0 || variant.price > input.mrp)) {
      setError('MRP and selling prices must be positive, and no selling price can exceed MRP.'); return;
    }
    if (gstEnabled && (!Number.isFinite(input.gstPercent) || input.gstPercent <= 0 || input.gstPercent > 100)) { setError('Enter a GST percentage from 0.01 to 100.'); return; }
    if (input.offerStartAt && input.offerEndAt && input.offerEndAt <= input.offerStartAt) {
      setError('Offer end date must be after its start date.'); return;
    }
    if (!input.category || input.category.length < 2) { setError('Choose or enter a category.'); return; }
    setSaving(true);
    try {
      if (images.length) {
        input.imageUrls = [];
        const csrfResponse = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
        if (!csrfResponse.ok) throw new Error('Could not verify this session for image upload.');
        const csrf = await csrfResponse.json() as { token: string };
        for (const file of images) {
          const response = await fetch('/api/products/images/upload', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': file.type, 'x-csrf-token': csrf.token }, body: file });
          const result = await response.json() as { url?: string; error?: string };
          if (!response.ok || !result.url) throw new Error(result.error || `Could not upload ${file.name}.`);
          input.imageUrls.push(result.url);
        }
      }
      await onCreate(input);
    } catch (cause) { setError((cause as Error).message); }
    finally { setSaving(false); }
  }
  const totalStock = rows.reduce((sum, row) => sum + Number(row.stock || 0), 0);
  const retailValue = rows.reduce((sum, row) => sum + Number(row.stock || 0) * Number(row.price || salePrice || 0), 0);
  return <div className="editor-backdrop" onClick={onClose}><form className="editor glass website-product-form" role="dialog" aria-modal="true" aria-label="Add product to shared website catalog" onClick={event => event.stopPropagation()} onSubmit={event => void submit(event)}>
    <div className="product-form-header"><div><span className="eyebrow">SHARED WEBSITE CATALOG</span><h2>Add new product</h2><p>Complete the website catalog details, GST, sizes, colours, pricing and opening stock in one form.</p><div className="product-form-steps" aria-label="Product form sections"><span>1 · Product</span><span>2 · Pricing & GST</span><span>3 · Sizes & colours</span><span>4 · Website details</span></div></div><button className="editor-close" type="button" onClick={onClose} aria-label="Close">×</button></div>
    {error && <div className="error-banner" role="alert">{error}</div>}
    <section className="product-form-section"><div className="product-form-section-title"><span>1</span><div><h3>Product information</h3><p>These details appear in the shared website catalog and product search.</p></div></div><div className="new-product-grid"><label>Product name<input name="name" required minLength={2} maxLength={200} autoFocus placeholder="Premium Oversized Cotton Shirt" /></label><label>SKU<input name="sku" required pattern="[A-Za-z0-9_.:-]+" maxLength={90} value={sku} onChange={event => setSku(event.target.value)} placeholder="SHT-BLK-001" /></label><label>Product barcode<input name="barcode" pattern="[A-Za-z0-9_.:-]*" maxLength={128} placeholder="Optional; generated barcode is used if blank" /></label><label>Category<select value={category} onChange={event => { setCategory(event.target.value); setSubCategory(''); }}><option value="">Choose category</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}<option value="__custom__">Custom category</option></select></label>{category === '__custom__' && <label>Custom category<input required value={customCategory} onChange={event => setCustomCategory(event.target.value)} maxLength={100} /></label>}<label>Sub-category / fit<select value={subCategory} onChange={event => setSubCategory(event.target.value)}><option value="">Optional</option>{(subCategories[category] || []).map(value => <option key={value} value={value}>{value}</option>)}<option value="__custom__">Custom fit</option></select></label>{subCategory === '__custom__' && <label>Custom fit<input required value={customSubCategory} onChange={event => setCustomSubCategory(event.target.value)} maxLength={100} /></label>}<label>Brand<input name="brand" maxLength={100}/></label><label>Design / article<input name="design" maxLength={100}/></label><label>Fabric<input name="fabric" maxLength={100}/></label><label>GSL / fabric weight<input name="gsl" maxLength={120} placeholder="Optional" /></label></div><div className="product-form-subsection"><h4>Website descriptions</h4><div className="new-product-grid"><label>Short description<textarea name="shortDescription" rows={3} maxLength={500} placeholder="Short summary shown on product cards" /></label><label>Full description<textarea name="description" rows={3} maxLength={5000} placeholder="Material, fit, care and product details" /></label></div></div></section>
    <section className="product-form-section"><h3>Pricing & GST</h3><div className="new-product-grid"><label>MRP ₹<input name="mrp" type="number" min="0" step="0.01" required /></label><label>Selling price ₹<input name="salePrice" type="number" min="0" step="0.01" required value={salePrice} onChange={event => setSalePrice(event.target.value)} /></label><label>Purchase rate ₹<input name="costPrice" type="number" min="0" step="0.01" value={costPrice} onChange={event => setCostPrice(event.target.value)} /></label><label className="check-row"><input type="checkbox" checked={gstEnabled} onChange={event => setGstEnabled(event.target.checked)} />Include GST in stock value</label>{gstEnabled && <label>GST %<input type="number" min="0.01" max="100" step="0.01" required value={gstPercent} onChange={event => setGstPercent(event.target.value)} /></label>}</div><small>GST is used for stock valuation and tax reporting. Retail bills do not add GST.</small></section>
    <section className="product-form-section"><div className="section-heading"><h3>Colors, sizes & stock</h3><button className="button secondary" type="button" onClick={() => setRows(old => [...old, { ...newRow(), price: salePrice, costPrice }])}><Plus size={17} />Add variant</button></div><p>Each color and size creates a website variant with its own barcode, price and stock.</p><div className="product-variant-builder"><div className="product-builder-heading"><strong>Choose sizes for {category === '__custom__' ? 'this product' : category}</strong><span>Same size presets as the website. Select sizes, enter colour names, then add stock.</span></div><div className="product-size-chips">{(categorySizes[category] || categorySizes.Shirts).map(size => <button key={size} type="button" className={gridSizes.includes(size) ? 'selected' : ''} aria-pressed={gridSizes.includes(size)} onClick={() => setGridSizes(old => old.includes(size) ? old.filter(value => value !== size) : [...old, size])}>{size}</button>)}</div><div className="new-product-grid"><label>Colours (separate with commas)<input value={gridColors} onChange={event => setGridColors(event.target.value)} placeholder="Black, Navy, White" /></label><label>Opening stock per size and colour<input type="number" min="0" step="1" value={batchStock} onChange={event => setBatchStock(event.target.value)} /></label></div><button type="button" className="button secondary" onClick={addCombinations}><Plus size={16} />Add {gridSizes.length ? gridSizes.length : ''} size × colour combinations</button></div><div className="product-form-bulk"><label>Set all stock<input type="number" min="0" step="1" value={bulkStock} onChange={event => setBulkStock(event.target.value)} /></label><button className="button secondary" type="button" onClick={() => { if (bulkStock !== '') setRows(old => old.map(row => ({ ...row, stock: bulkStock }))); }}>Apply stock</button><label>Set all prices ₹<input type="number" min="0" step="0.01" value={bulkPrice} onChange={event => setBulkPrice(event.target.value)} /></label><button className="button secondary" type="button" onClick={() => { if (bulkPrice !== '') setRows(old => old.map(row => ({ ...row, price: bulkPrice }))); }}>Apply price</button></div>{rows.map((row, index) => <div className="product-variant-row" key={row.id}><div className="section-heading"><strong>Variant {index + 1}</strong><button className="icon-button" type="button" disabled={rows.length === 1} onClick={() => setRows(old => old.filter(item => item.id !== row.id))} aria-label={`Remove variant ${index + 1}`}><Trash2 size={17} /></button></div><div className="new-product-grid"><label>Color<input value={row.color} onChange={event => updateRow(row.id, 'color', event.target.value)} required maxLength={80} /></label><label>Color swatch<input type="color" value={row.colorHex} onChange={event => updateRow(row.id, 'colorHex', event.target.value)} /></label><label>Size<input value={row.size} onChange={event => updateRow(row.id, 'size', event.target.value)} required maxLength={50} /></label><label>Opening stock<input type="number" min="0" max="100000" step="1" value={row.stock} onChange={event => updateRow(row.id, 'stock', event.target.value)} required /></label><label>Selling price ₹<input type="number" min="0" step="0.01" value={row.price} onChange={event => updateRow(row.id, 'price', event.target.value)} placeholder={salePrice || 'Base price'} /></label><label>Cost ₹<input type="number" min="0" step="0.01" value={row.costPrice} onChange={event => updateRow(row.id, 'costPrice', event.target.value)} placeholder={costPrice || 'Base cost'} /></label><label>Variant barcode<input value={row.barcode} onChange={event => updateRow(row.id, 'barcode', event.target.value)} pattern="[A-Za-z0-9_.:-]*" maxLength={128} placeholder="Auto SKU if blank" /></label></div><small>Variant SKU: {sku ? `${sku}-${normalized(row.color)}-${normalized(row.size)}` : 'Enter product SKU above'}</small></div>)}<div className="product-form-totals"><span>Total opening stock <strong>{totalStock.toLocaleString('en-IN')} units</strong></span><span>Stock at cost <strong>₹{rows.reduce((sum,row)=>sum+Number(row.stock||0)*Number(row.costPrice||costPrice||0),0).toLocaleString('en-IN')}</strong></span><span>Stock retail value <strong>₹{retailValue.toLocaleString('en-IN')}</strong></span></div></section>
    <details className="product-form-section"><summary>Advanced: website size guide and offers</summary><section><h3>Custom size guide</h3><label className="check-row"><input type="checkbox" checked={sizeGuideEnabled} onChange={event => setSizeGuideEnabled(event.target.checked)} />Show a product-specific size chart</label>{sizeGuideEnabled && <><label>Unit<select name="sizeGuideUnit"><option value="in">Inches</option><option value="cm">Centimeters</option></select></label><label>Column headings, comma separated<input name="sizeGuideColumns" placeholder="Size, Chest (in), Length (in)" required /></label><label>One row per size, comma separated<textarea name="sizeGuideRows" rows={4} placeholder={"S, 38, 27\nM, 40, 28"} required /></label></>}</section>
    <section className="product-form-section"><h3>Offers</h3><div className="new-product-grid"><label className="check-row"><input name="isTrending" type="checkbox" />Trending product</label><label className="check-row"><input name="offerEnabled" type="checkbox" />Enable offer</label><label>Offer discount %<input name="offerDiscountPercentage" type="number" min="0" max="100" step="0.01" defaultValue="0" /></label><label>Offer start date<input name="offerStartAt" type="datetime-local" /></label><label>Offer end date<input name="offerEndAt" type="datetime-local" /></label></div><label>Offer box title<input name="offerTitle" maxLength={200} placeholder="Offers for you" /></label><label>Custom offer lines<textarea name="offerItems" rows={3} placeholder={"Buy 2 and save ₹300\nPrepaid orders get 5% off"} /></label></section>
    </details><section className="product-form-section"><h3>Website product photos</h3><p>Add product photos now if the image service is configured. Products are saved as website drafts for review.</p><label>Product images<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => { const files = Array.from(event.target.files || []); if (files.length > 10 || files.some(file => file.size > 3_000_000)) { setError('Choose up to 10 JPEG, PNG or WebP images, each under 3 MB.'); event.target.value = ''; return; } setImages(files); setError(''); }} /></label>{images.length > 0 && <div className="product-form-images">{images.map((file, index) => <div key={`${file.name}-${index}`}><img src={imagePreviews[index]} alt={`Product photo ${index + 1} preview`} /><small>{file.name}</small></div>)}</div>}</section>
    <div className="product-form-actions"><button className="button secondary" type="button" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving ? 'Saving product…' : 'Add product to shared catalog'}</button></div>
  </form></div>;
}
