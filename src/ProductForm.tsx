import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { ColorPicker, type PickedColor } from './ColorPicker';
import { colorHex, colorName } from '../shared/colors';

export type NewProductInput = {
  requestId: string; brand?: string; design?: string; fabric?: string; name: string; sku: string; barcode?: string; category: string; subCategory?: string;
  shortDescription?: string; description?: string; gsl?: string; salePrice: number; mrp: number; costPrice: number; customPrice?: number; gstEnabled: boolean; gstPercent: number;
  publish: boolean; isTrending: boolean; giftItem: boolean; offerEnabled: boolean; offerDiscountPercentage: number;
  offerStartAt?: string; offerEndAt?: string;
  offerTitle?: string; offerItems?: string[];
  imageUrls?: string[];
  sizeGuide?: { enabled: boolean; unit: 'in' | 'cm'; columns: string[]; rows: Record<string, string>[] };
  variants: { size: string; color: string; colorHex?: string; stock: number; price: number; costPrice: number; barcode?: string }[];
};

type VariantRow = { id: string; size: string; color: string; colorHex: string; stock: string; price: string; costPrice: string; barcode: string };
// Same category, fit and size presets as the website product form (stored in CAPITALS there too).
const categories = ['KURTA', 'SHIRTS', 'T-SHIRTS', 'JEANS', 'TROUSERS', 'SHORTS', 'JACKETS', 'HOODIES', 'ETHNIC WEAR', 'VEST', 'UNDERWEAR', 'PERFUMES', 'WALLETS', 'SLIPPERS', 'WATCHES', 'BELTS', 'CAPS', 'SUNGLASSES', 'ACCESSORIES'];
const subCategories: Record<string, string[]> = {
  KURTA: ['LAKHNAVI KURTA', 'PRINTED KURTA', 'DAMAN WORK KURTA', 'PLAIN KURTA', 'KACHI WORK KURTA', 'BANDHANI KURTA', 'KOTI KURTA', 'EMBROIDERY KURTA'],
  'T-SHIRTS': ['OVERSIZED', 'REGULAR FIT', 'SLIM FIT', 'POLO', 'GRAPHIC', 'DROP SHOULDER', 'ACID WASH', 'HENLEY', 'FULL SLEEVE', 'FULL SLEEVE COLLAR'],
  SHIRTS: ['CASUAL', 'FORMAL', 'PRINTED', 'LINEN', 'DENIM', 'OXFORD', 'MANDARIN COLLAR', 'HALF SLEEVE'],
  JEANS: ['SKINNY', 'SLIM FIT', 'REGULAR', 'BAGGY', 'WIDE LEG', 'RIPPED', 'BOOTCUT', 'TAPERED', 'MOM FIT', 'STRAIGHT FIT', 'NARROW FIT'],
  TROUSERS: ['CARGO', 'CHINO', 'JOGGER', 'FORMAL', 'PLEATED', 'STRAIGHT FIT', 'SLIM FIT'],
  SHORTS: ['CARGO', 'CHINO', 'DENIM', 'SPORTS', 'CASUAL', 'BERMUDA', 'RUNNING'],
  JACKETS: ['BOMBER', 'DENIM', 'PUFFER', 'WINDBREAKER', 'VARSITY', 'LEATHER', 'QUILTED'],
  HOODIES: ['PULLOVER', 'ZIP-UP', 'CROPPED', 'OVERSIZED', 'SLEEVELESS', 'GRAPHIC'],
  'ETHNIC WEAR': ['KURTA', 'LAKHNAVI KURTA', 'PRINTED KURTA', 'DAMAN WORK KURTA', 'PLAIN KURTA', 'KACHI WORK KURTA', 'BANDHANI KURTA', 'KOTI KURTA', 'EMBROIDERY KURTA', 'SHERWANI', 'PATHANI SUIT', 'NEHRU JACKET', 'DHOTI SET'],
  VEST: ['PLAIN', 'LINING', 'COLORING'], UNDERWEAR: ['LONG TRUNK', 'MINI TRUNK', 'BRIEF'],
  SLIPPERS: ['SLIDES', 'FLIP FLOPS', 'SPORTS', 'CASUAL', 'PLATFORM', 'MEMORY FOAM'],
  PERFUMES: ['EAU DE PARFUM', 'EAU DE TOILETTE', 'BODY SPRAY', 'APPAREL SPRAY', 'ATTAR', 'AIR FRESHENER', 'ROOM FRESHENER', 'DEODORANT', 'GIFT SET'],
  WALLETS: ['BIFOLD', 'TRIFOLD', 'CARD HOLDER', 'MONEY CLIP', 'CHAIN WALLET'], WATCHES: ['ANALOG', 'DIGITAL', 'SMART WATCH', 'CHRONOGRAPH', 'DRESS WATCH'],
  BELTS: ['LEATHER', 'CANVAS', 'REVERSIBLE', 'AUTO-LOCK', 'BRAIDED'], CAPS: ['BASEBALL CAP', 'SNAPBACK', 'TRUCKER HAT', 'BEANIE', 'BUCKET HAT', 'VISOR', 'DAD HAT'],
  SUNGLASSES: ['AVIATOR', 'WAYFARER', 'ROUND', 'SQUARE', 'POLARIZED', 'CLUBMASTER', 'SPORT', 'HEXAGONAL']
};
const categorySizes: Record<string, string[]> = {
  KURTA: ['36', '38', '40', '42', '44', '46', 'S', 'M', 'L', 'XL', 'XXL', '3XL'],
  SHIRTS: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL', '6XL'],
  'T-SHIRTS': ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'Free Size'],
  JEANS: ['28', '30', '32', '34', '36', '38', '40', '42'], TROUSERS: ['28', '30', '32', '34', '36', '38', '40', '42'],
  SHORTS: ['28', '30', '32', '34', '36', '38', '40', '42'], JACKETS: ['S', 'M', 'L', 'XL', 'XXL', '3XL'], HOODIES: ['S', 'M', 'L', 'XL', 'XXL', '3XL'],
  'ETHNIC WEAR': ['36', '38', '40', '42', '44', '46', 'M', 'L', 'XL', 'XXL'],
  VEST: ['S', 'M', 'L', 'XL', 'XXL', '3XL', '75cm', '80cm', '85cm', '90cm', '95cm', '100cm', '105cm', '110cm', 'Free Size'],
  UNDERWEAR: ['S', 'M', 'L', 'XL', 'XXL', '3XL', '75cm', '80cm', '85cm', '90cm', '95cm', '100cm', '105cm', '110cm', '28', '30', '32', '34', '36', '38', '40'],
  PERFUMES: ['10ml', '20ml', '30ml', '50ml', '75ml', '100ml', '120ml', '150ml', '200ml'],
  SLIPPERS: ['6', '7', '8', '9', '10', '11'], WALLETS: ['Standard', 'Slim', 'Bifold', 'Trifold'],
  WATCHES: ['Standard', 'Dial 40mm', 'Dial 42mm', 'Adjustable Strap'], BELTS: ['28-32', '32-36', '36-40', '40-44', 'Free Size', 'Adjustable'],
  CAPS: ['Free Size', 'Adjustable', 'S/M', 'L/XL', 'Snapback', 'Standard'], SUNGLASSES: ['Standard', 'Free Size', 'Medium (54mm)', 'Large (58mm)', 'Small (50mm)'],
  DEFAULT: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', 'Free Size']
};
// "1-Click batch add" presets, same as the website.
const commonBatchSizes: Record<string, string[]> = {
  KURTA: ['36', '38', '40', '42', '44', '46'], VEST: ['S', 'M', 'L', 'XL', 'XXL'], UNDERWEAR: ['S', 'M', 'L', 'XL', 'XXL'],
  PERFUMES: ['30ml', '50ml', '100ml'], JEANS: ['30', '32', '34', '36', '38'], TROUSERS: ['30', '32', '34', '36', '38'],
  SHORTS: ['30', '32', '34', '36', '38'], SLIPPERS: ['7', '8', '9', '10', '11'], WALLETS: ['Standard', 'Slim'],
  WATCHES: ['Standard', 'Dial 40mm'], BELTS: ['32-36', '36-40'], CAPS: ['Free Size', 'Adjustable'], SUNGLASSES: ['Standard', 'Free Size'],
  DEFAULT: ['S', 'M', 'L', 'XL', 'XXL']
};
const normalized = (value: string) => value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'STANDARD';
const wholeStock = (value: string) => Number.isSafeInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 100_000;

export function ProductFormDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (product: NewProductInput) => Promise<void> }) {
  const requestId = useRef(crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [category, setCategory] = useState('SHIRTS');
  const [customCategory, setCustomCategory] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [customSubCategory, setCustomSubCategory] = useState('');
  const [sku, setSku] = useState(() => `ITEM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`);
  const [mrp, setMrp] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [gstEnabled, setGstEnabled] = useState(false);
  const [gstPercent, setGstPercent] = useState('5');
  const [pickedColors, setPickedColors] = useState<PickedColor[]>([]);
  const [targetColor, setTargetColor] = useState('');
  const [allColors, setAllColors] = useState(false);
  const [stockEach, setStockEach] = useState('10');
  const [priceEach, setPriceEach] = useState('');
  const [customSize, setCustomSize] = useState('');
  const [rows, setRows] = useState<VariantRow[]>([]);
  const [bulkStock, setBulkStock] = useState('');
  const [bulkPrice, setBulkPrice] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [sizeGuideEnabled, setSizeGuideEnabled] = useState(false);
  useEffect(() => {
    const previews = images.map(file => URL.createObjectURL(file));
    setImagePreviews(previews);
    return () => previews.forEach(url => URL.revokeObjectURL(url));
  }, [images]);

  const activeCategory = (category === '__custom__' ? customCategory : category).trim().toUpperCase();
  const sizePresets = categorySizes[activeCategory] || categorySizes.DEFAULT;
  const batchPresets = commonBatchSizes[activeCategory] || commonBatchSizes.DEFAULT;
  const isPerfume = activeCategory.includes('PERFUME');
  const hexFor = (name: string) => pickedColors.find(color => color.name === colorName(name))?.hex || colorHex(name);
  const currentColor = pickedColors.some(color => color.name === targetColor) ? targetColor : pickedColors[0]?.name || 'Standard';
  // Same rule as the website: no colours = Standard; otherwise the chosen colour, or every colour.
  const targetColors = () => !pickedColors.length ? ['Standard'] : allColors ? pickedColors.map(color => color.name) : [currentColor];

  function updateRow(id: string, field: keyof VariantRow, value: string) { setRows(old => old.map(row => row.id === id ? { ...row, [field]: value } : row)); }
  function changeColors(next: PickedColor[]) {
    const keep = new Set(next.map(color => color.name));
    setRows(old => {
      // First colour picked: sizes added in Standard mode move to that colour instead of being lost.
      if (!pickedColors.length && next.length) return old.map(row => row.color === 'Standard' ? { ...row, color: next[0].name, colorHex: next[0].hex } : row);
      // Removing a colour removes its sizes, like the website.
      if (!next.length) return old.filter(row => row.color === 'Standard');
      return old.filter(row => keep.has(colorName(row.color)));
    });
    setPickedColors(next);
  }
  function addSizes(sizes: string[]) {
    if (!wholeStock(stockEach)) { setError('Stock must be a whole number.'); return; }
    const colors = targetColors();
    const clean = sizes.map(size => size.trim()).filter(Boolean);
    if (!clean.length) return;
    const next = [...rows];
    for (const color of colors) for (const size of clean) {
      const index = next.findIndex(row => colorName(row.color) === color && row.size.toLowerCase() === size.toLowerCase());
      // An existing size gets the new stock and price, as on the website.
      if (index >= 0) next[index] = { ...next[index], stock: stockEach, ...(priceEach ? { price: priceEach } : {}) };
      else next.push({ id: crypto.randomUUID(), size, color, colorHex: hexFor(color), stock: stockEach, price: priceEach, costPrice: '', barcode: '' });
    }
    if (next.length > 100) { setError('A product can have at most 100 size × colour variants.'); return; }
    setRows(next); setError('');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const form = new FormData(event.currentTarget);
    if (!rows.length) { setError('Add at least one size in "Sizes & inventory" (use Standard for one-size items).'); return; }
    const variantSkus = rows.map(row => `${sku.trim()}-${normalized(colorName(row.color))}-${normalized(row.size)}`);
    if (new Set(variantSkus).size !== variantSkus.length) { setError('Each colour and size combination must be unique.'); return; }
    if (rows.some(row => !row.size.trim() || !wholeStock(row.stock))) { setError('Every variant needs a size and a whole-number stock quantity.'); return; }
    const columns = String(form.get('sizeGuideColumns') || '').split(',').map(value => value.trim()).filter(Boolean);
    const guideLines = String(form.get('sizeGuideRows') || '').split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    if (sizeGuideEnabled && (!columns.length || guideLines.some(line => line.split(',').length !== columns.length))) {
      setError('Size guide rows must have the same number of comma-separated cells as the column headings.'); return;
    }
    const guideRows = guideLines.map(line => Object.fromEntries(line.split(',').map((value, index) => [`c${index}`, value.trim()])));
    const input: NewProductInput = {
      brand: String(form.get('brand') || '').trim(), design: String(form.get('design') || '').trim(), fabric: String(form.get('fabric') || '').trim(),
      requestId: requestId.current, name: String(form.get('name') || '').trim(), sku: sku.trim(),
      barcode: String(form.get('barcode') || '').trim() || undefined,
      category: activeCategory,
      subCategory: (subCategory === '__custom__' ? customSubCategory.trim() : subCategory).toUpperCase(),
      shortDescription: String(form.get('shortDescription') || '').trim(), description: String(form.get('description') || '').trim(),
      gsl: String(form.get('gsl') || '').trim(), mrp: Number(mrp), salePrice: Number(salePrice), costPrice: Number(costPrice || 0),
      customPrice: form.get('customPrice') === '' ? undefined : Number(form.get('customPrice')),
      gstEnabled, gstPercent: gstEnabled ? Number(gstPercent) : 0,
      publish: false, isTrending: form.get('isTrending') === 'on', giftItem: form.get('giftItem') === 'on',
      offerEnabled: form.get('offerEnabled') === 'on', offerDiscountPercentage: Number(form.get('offerDiscountPercentage') || 0),
      offerStartAt: String(form.get('offerStartAt') || '').trim() || undefined,
      offerEndAt: String(form.get('offerEndAt') || '').trim() || undefined,
      offerTitle: String(form.get('offerTitle') || '').trim(),
      offerItems: String(form.get('offerItems') || '').split(/\r?\n/).map(item => item.trim()).filter(Boolean),
      sizeGuide: { enabled: sizeGuideEnabled, unit: form.get('sizeGuideUnit') === 'cm' ? 'cm' : 'in',
        columns: sizeGuideEnabled ? columns : [], rows: sizeGuideEnabled ? guideRows : [] },
      // Colour name and swatch exactly as picked, so the website shows the same colour.
      variants: rows.map(row => ({ size: row.size.trim(), color: colorName(row.color), colorHex: hexFor(row.color),
        stock: Number(row.stock), price: Number(row.price || salePrice), costPrice: Number(row.costPrice || costPrice || 0),
        barcode: row.barcode.trim() || undefined }))
    };
    if (input.customPrice !== undefined && (!Number.isFinite(input.customPrice) || input.customPrice <= 0 || input.customPrice > input.mrp)) { setError('Custom price must be positive and cannot exceed MRP.'); return; }
    if (input.mrp <= 0 || input.salePrice <= 0 || input.salePrice > input.mrp || input.variants.some(variant => variant.price <= 0 || variant.price > input.mrp)) {
      setError('MRP and selling prices must be positive, and no selling price can exceed MRP.'); return;
    }
    if (gstEnabled && (!Number.isFinite(input.gstPercent) || input.gstPercent <= 0 || input.gstPercent > 100)) { setError('Enter a GST percentage from 0.01 to 100.'); return; }
    if (input.offerStartAt && input.offerEndAt && input.offerEndAt <= input.offerStartAt) { setError('Offer end date must be after its start date.'); return; }
    if (!input.category || input.category.length < 2) { setError('Choose or enter a category.'); return; }
    setSaving(true);
    try {
      if (images.length) {
        input.imageUrls = [];
        const csrfResponse = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
        if (!csrfResponse.ok) throw new Error('Could not verify this session for image upload. Remove the photos to save without them.');
        const csrf = await csrfResponse.json() as { token: string };
        for (const file of images) {
          const response = await fetch('/api/products/images/upload', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': file.type, 'x-csrf-token': csrf.token }, body: file });
          const result = await response.json().catch(() => ({})) as { url?: string; error?: string };
          if (!response.ok || !result.url) throw new Error(`${result.error || `Could not upload ${file.name}.`} Remove the photos to save the product without them.`);
          input.imageUrls.push(result.url);
        }
      }
      await onCreate(input);
    } catch (cause) { setError((cause as Error).message); }
    finally { setSaving(false); }
  }

  const totalStock = rows.reduce((sum, row) => sum + Number(row.stock || 0), 0);
  const stockCost = rows.reduce((sum, row) => sum + Number(row.stock || 0) * Number(row.costPrice || costPrice || 0), 0);
  const retailValue = rows.reduce((sum, row) => sum + Number(row.stock || 0) * Number(row.price || salePrice || 0), 0);
  const profit = Number(salePrice || 0) - Number(costPrice || 0);
  const addedForTarget = new Set(rows.filter(row => colorName(row.color) === targetColors()[0]).map(row => row.size.toLowerCase()));
  const section = (n: number, title: string, text: string) => <div className="product-form-section-title"><span>{n}</span><div><h3>{title}</h3><p>{text}</p></div></div>;

  return <div className="editor-backdrop" onClick={onClose}><form className="editor glass website-product-form" role="dialog" aria-modal="true" aria-label="Add product to shared website catalog" onClick={event => event.stopPropagation()} onSubmit={event => void submit(event)}>
    <div className="product-form-header"><div><span className="eyebrow">SHARED WEBSITE CATALOG</span><h2>Add new product</h2><p>Same fields, colours and sizes as the website product form. Photos are optional.</p><div className="product-form-steps" aria-label="Product form sections"><span>1 · Basic info</span><span>2 · Pricing</span><span>3 · Colours</span><span>4 · Sizes & stock</span><span>5 · Photos</span></div></div><button className="editor-close" type="button" onClick={onClose} aria-label="Close">×</button></div>
    {error && <div className="error-banner" role="alert">{error}</div>}

    <section className="product-form-section">{section(1, 'Basic information', 'Shown in the website catalog and product search.')}
      <div className="new-product-grid">
        <label>Product name<input name="name" required minLength={2} maxLength={200} autoFocus placeholder="PREMIUM OVERSIZED COTTON SHIRT" /></label>
        <label>SKU<input name="sku" required pattern="[A-Za-z0-9_.:-]+" maxLength={90} value={sku} onChange={event => setSku(event.target.value.toUpperCase())} /></label>
        <label>Category<select value={category} onChange={event => { setCategory(event.target.value); setSubCategory(''); }}>{categories.map(value => <option key={value} value={value}>{value}</option>)}<option value="__custom__">+ CUSTOM CATEGORY</option></select></label>
        {category === '__custom__' && <label>Custom category<input required value={customCategory} onChange={event => setCustomCategory(event.target.value.toUpperCase())} maxLength={100} placeholder="e.g. GYM WEAR" /></label>}
        <label>Sub-category / fit<select value={subCategory} onChange={event => setSubCategory(event.target.value)}><option value="">Optional</option>{(subCategories[activeCategory] || []).map(value => <option key={value} value={value}>{value}</option>)}<option value="__custom__">+ CUSTOM FIT</option></select></label>
        {subCategory === '__custom__' && <label>Custom fit<input required value={customSubCategory} onChange={event => setCustomSubCategory(event.target.value.toUpperCase())} maxLength={100} /></label>}
        <label>Brand<input name="brand" maxLength={100} /></label>
        <label>Design / article<input name="design" maxLength={100} /></label>
        <label>Fabric<input name="fabric" maxLength={100} /></label>
        <label>GSL (GSM / fabric weight / quality)<input name="gsl" maxLength={120} placeholder="Optional" /></label>
        <label>Product barcode<input name="barcode" pattern="[A-Za-z0-9_.:-]*" maxLength={128} placeholder="Assigned automatically if blank" /></label>
      </div>
      <div className="new-product-grid"><label>Short description<textarea name="shortDescription" rows={3} maxLength={500} placeholder="Short summary shown on product cards" /></label><label>Full description<textarea name="description" rows={3} maxLength={5000} placeholder="Material, fit, care and product details" /></label></div>
    </section>

    <section className="product-form-section">{section(2, 'Pricing & cost', 'Purchase rate stays private to the POS. Retail bills do not add GST.')}
      <div className="new-product-grid">
        <label>MRP ₹<input name="mrp" type="number" min="0" step="0.01" required value={mrp} onChange={event => setMrp(event.target.value)} /></label>
        <label>Sale price ₹ (website)<input name="salePrice" type="number" min="0" step="0.01" required value={salePrice} onChange={event => setSalePrice(event.target.value)} /></label>
        <label>Purchase rate ₹<input name="costPrice" type="number" min="0" step="0.01" value={costPrice} onChange={event => setCostPrice(event.target.value)} /></label>
        <label>Custom price ₹ (POS only)<input name="customPrice" type="number" min="0.01" step="0.01" placeholder="Uses sale price if blank" /></label>
        <label className="check-row"><input type="checkbox" checked={gstEnabled} onChange={event => setGstEnabled(event.target.checked)} />Include GST in stock value</label>
        {gstEnabled && <label>GST %<input type="number" min="0.01" max="100" step="0.01" required value={gstPercent} onChange={event => setGstPercent(event.target.value)} /></label>}
      </div>
      {salePrice && <small>Profit per piece: <strong>₹{profit.toLocaleString('en-IN')}</strong>{Number(mrp) > Number(salePrice) ? ` · ${Math.round((Number(mrp) - Number(salePrice)) / Number(mrp) * 100)}% off MRP` : ''}</small>}
    </section>

    <section className="product-form-section">{section(3, 'Colours', 'Pick from the website colour list. The same name and swatch code are saved to the website.')}
      <ColorPicker selected={pickedColors} onChange={changeColors} />
    </section>

    <section className="product-form-section">{section(4, 'Sizes & inventory', `Sizes for ${activeCategory || 'this product'}${isPerfume ? ' (volumes in ml)' : ''}. Each colour × size is a variant with its own stock and barcode.`)}
      {pickedColors.length ? <div className="size-target-bar"><label>Managing sizes for colour<span className="variant-color-select"><span className="color-swatch-dot small" style={{ background: hexFor(currentColor) }} /><select value={currentColor} disabled={allColors} onChange={event => setTargetColor(event.target.value)}>{pickedColors.map(color => <option key={color.name} value={color.name}>{color.name}</option>)}</select></span></label><label className="check-row"><input type="checkbox" checked={allColors} onChange={event => setAllColors(event.target.checked)} />Apply added sizes & stock to ALL colours at once</label></div>
        : <div className="size-target-note">Standard mode: no colour picked, so sizes are added without a colour.</div>}
      <div className="product-variant-builder">
        <div className="size-batch-row"><div><strong>1-Click batch add popular sizes</strong><span>Popular for {activeCategory || 'this category'}: {batchPresets.join(', ')}</span></div>
          <div className="size-batch-inputs"><label>Stock each<input type="number" min="0" step="1" value={stockEach} onChange={event => setStockEach(event.target.value)} /></label><label>Price ₹<input type="number" min="0" step="0.01" value={priceEach} onChange={event => setPriceEach(event.target.value)} placeholder={salePrice || 'Sale price'} /></label><button type="button" className="button primary" onClick={() => addSizes(batchPresets)}><Plus size={16} />Add all {batchPresets.length} sizes</button></div></div>
        <div className="product-builder-heading"><strong>Or pick individual {isPerfume ? 'volumes' : 'sizes'}</strong><span>Click a size to add it{pickedColors.length ? ` for ${allColors ? 'all colours' : currentColor}` : ''} with the stock and price above.</span></div>
        <div className="product-size-chips">{sizePresets.map(size => <button key={size} type="button" className={addedForTarget.has(size.toLowerCase()) ? 'selected' : ''} onClick={() => addSizes([size])}>{addedForTarget.has(size.toLowerCase()) ? '✓ ' : '+ '}{size}</button>)}</div>
        <div className="size-custom-row"><input value={customSize} onChange={event => setCustomSize(event.target.value)} maxLength={50} placeholder={isPerfume ? 'e.g. 250ml' : 'Custom size, e.g. 44 Slim or Standard'} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addSizes([customSize]); setCustomSize(''); } }} /><button type="button" className="button secondary" onClick={() => { addSizes([customSize]); setCustomSize(''); }}><Plus size={16} />Add custom size</button></div>
      </div>
      {rows.length === 0 ? <div className="size-empty">No sizes added yet. Use “Add all sizes” or click a size above.</div> : <>
        <div className="product-form-bulk"><label>Set all stock<input type="number" min="0" step="1" value={bulkStock} onChange={event => setBulkStock(event.target.value)} /></label><button className="button secondary" type="button" onClick={() => { if (bulkStock !== '') setRows(old => old.map(row => ({ ...row, stock: bulkStock }))); }}>Apply stock</button><label>Set all prices ₹<input type="number" min="0" step="0.01" value={bulkPrice} onChange={event => setBulkPrice(event.target.value)} /></label><button className="button secondary" type="button" onClick={() => { if (bulkPrice !== '') setRows(old => old.map(row => ({ ...row, price: bulkPrice }))); }}>Apply price</button></div>
        <div className="variant-table-wrap"><table className="variant-table"><thead><tr>{pickedColors.length > 0 && <th>Colour</th>}<th>Size</th><th>SKU</th><th>Price ₹</th><th>Purchase rate ₹</th><th>Stock</th><th>Barcode</th><th aria-label="Remove" /></tr></thead><tbody>
          {rows.map(row => <tr key={row.id}>
            {pickedColors.length > 0 && <td><span className="variant-color-select"><span className="color-swatch-dot small" style={{ background: hexFor(row.color) }} /><select aria-label="Colour" value={row.color} onChange={event => updateRow(row.id, 'color', event.target.value)}>{pickedColors.map(color => <option key={color.name} value={color.name}>{color.name}</option>)}</select></span></td>}
            <td><input aria-label="Size" value={row.size} onChange={event => updateRow(row.id, 'size', event.target.value)} required maxLength={50} /></td>
            <td className="variant-sku">{sku ? `${sku}-${normalized(colorName(row.color))}-${normalized(row.size)}` : '—'}</td>
            <td><input aria-label="Price" type="number" min="0" step="0.01" value={row.price} onChange={event => updateRow(row.id, 'price', event.target.value)} placeholder={salePrice || 'Price'} /></td>
            <td><input aria-label="Purchase rate" type="number" min="0" step="0.01" value={row.costPrice} onChange={event => updateRow(row.id, 'costPrice', event.target.value)} placeholder={costPrice || 'Rate'} /></td>
            <td><input aria-label="Stock" type="number" min="0" max="100000" step="1" value={row.stock} onChange={event => updateRow(row.id, 'stock', event.target.value)} required /></td>
            <td><input aria-label="Barcode" value={row.barcode} onChange={event => updateRow(row.id, 'barcode', event.target.value)} pattern="[A-Za-z0-9_.:-]*" maxLength={128} placeholder="Auto" /></td>
            <td><button className="icon-button" type="button" onClick={() => setRows(old => old.filter(item => item.id !== row.id))} aria-label={`Remove ${row.color} ${row.size}`}><Trash2 size={16} /></button></td>
          </tr>)}
        </tbody></table></div>
        <div className="product-form-totals"><span>Total stock <strong>{totalStock.toLocaleString('en-IN')} units</strong></span><span>Stock at cost <strong>₹{stockCost.toLocaleString('en-IN')}</strong></span><span>Stock retail value <strong>₹{retailValue.toLocaleString('en-IN')}</strong></span></div>
      </>}
    </section>

    <details className="product-form-section"><summary>Size guide, offers & placement</summary>
      <section><h3>Custom size guide</h3><label className="check-row"><input type="checkbox" checked={sizeGuideEnabled} onChange={event => setSizeGuideEnabled(event.target.checked)} />Show a product-specific size chart</label>{sizeGuideEnabled && <><label>Unit<select name="sizeGuideUnit"><option value="in">Inches</option><option value="cm">Centimeters</option></select></label><label>Column headings, comma separated<input name="sizeGuideColumns" placeholder="Size, Chest (in), Length (in)" required /></label><label>One row per size, comma separated<textarea name="sizeGuideRows" rows={4} placeholder={'S, 38, 27\nM, 40, 28'} required /></label></>}</section>
      <section><h3>Promotional offers</h3><div className="new-product-grid"><label className="check-row"><input name="offerEnabled" type="checkbox" />Enable offer</label><label>Offer discount %<input name="offerDiscountPercentage" type="number" min="0" max="100" step="0.01" defaultValue="0" /></label><label>Offer start date<input name="offerStartAt" type="datetime-local" /></label><label>Offer end date<input name="offerEndAt" type="datetime-local" /></label></div><label>Offer box title<input name="offerTitle" maxLength={200} placeholder="OFFERS FOR YOU – SHOP MORE, SAVE MORE!" /></label><label>Custom offer lines<textarea name="offerItems" rows={3} placeholder={'Buy 2 & Get Flat Rs. 300 OFF\nEnjoy an Additional 5% OFF on prepaid orders!'} /></label></section>
      <section><h3>Placement</h3><div className="new-product-grid"><label className="check-row"><input name="isTrending" type="checkbox" />Trending product</label><label className="check-row gift-check"><input name="giftItem" type="checkbox" /><span><strong>Gift item</strong><small>Free on bills. Adding it to a customer bill resets that customer's coins to 0.</small></span></label></div></section>
    </details>

    <section className="product-form-section">{section(5, 'Product photos (optional)', 'You can save without photos. The product is saved as a website draft; add photos and publish it from the website when ready.')}
      <label>Product images<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => { const files = Array.from(event.target.files || []); if (files.length > 10 || files.some(file => file.size > 3_000_000)) { setError('Choose up to 10 JPEG, PNG or WebP images, each under 3 MB.'); event.target.value = ''; return; } setImages(files); setError(''); }} /></label>
      {images.length > 0 && <><div className="product-form-images">{images.map((file, index) => <div key={`${file.name}-${index}`}><img src={imagePreviews[index]} alt={`Product photo ${index + 1} preview`} /><small>{file.name}</small></div>)}</div><button type="button" className="button secondary" onClick={() => setImages([])}>Remove photos</button></>}
    </section>

    <div className="product-form-actions"><button className="button secondary" type="button" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving ? 'Saving product…' : 'Add product to shared catalog'}</button></div>
  </form></div>;
}
