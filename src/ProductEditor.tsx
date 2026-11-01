import { useState, type FormEvent } from 'react';
import { Printer } from 'lucide-react';

export type EditableProduct = {
  id: string; name: string; sku: string; barcode?: string; price: number; mrp: number; costPrice?: number;
  category: string; subCategory?: string; shortDescription?: string; description?: string; gsl?: string; active: boolean; stock: number;
  variants: { sku: string; barcode?: string; size?: string; color?: string; stock: number; price: number; costPrice?: number }[];
};

export type ProductEditInput = {
  patch: {
    name: string; barcode: string; category: string; subCategory: string; shortDescription: string; description: string; gsl: string;
    salePrice: number; mrp: number; costPrice: number; active: boolean;
    variantPatches?: { sku: string; barcode: string; size: string; color: string; price: number; costPrice: number }[];
  };
  stockAdjustments: { sku: string; delta: number; note: string }[];
};

export function ProductEditor({ product, onClose, onPrint, onSave }: { product: EditableProduct; onClose: () => void; onPrint: () => void; onSave: (input: ProductEditInput) => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const variants = product.variants.length ? product.variants : [{ sku: product.sku, barcode: product.barcode, size: 'Standard', color: 'Standard', stock: product.stock, price: product.price, costPrice: product.costPrice }];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const form = new FormData(event.currentTarget);
    const salePrice = Number(form.get('price')), mrp = Number(form.get('mrp')), costPrice = Number(form.get('costPrice') || 0);
    const editedVariants = variants.map((variant, index) => ({
      sku: variant.sku, barcode: String(form.get(`variant-barcode-${index}`) || '').trim(),
      size: String(form.get(`variant-size-${index}`) || '').trim(), color: String(form.get(`variant-color-${index}`) || '').trim(),
      price: Number(form.get(`variant-price-${index}`)), costPrice: Number(form.get(`variant-cost-${index}`) || 0)
    }));
    const stockAdjustments = variants.map((variant, index) => ({ sku: variant.sku,
      delta: Number(form.get(`variant-stock-${index}`) || 0), note: String(form.get(`variant-stock-note-${index}`) || '').trim() || 'Adjusted from Edit product' }))
      .filter(item => item.delta !== 0);
    if (salePrice <= 0 || mrp <= 0 || salePrice > mrp || editedVariants.some(variant => variant.price <= 0 || variant.price > mrp || variant.costPrice < 0)) {
      setError('Selling prices must be positive and cannot exceed MRP. Cost cannot be negative.'); return;
    }
    if (stockAdjustments.some(item => !Number.isSafeInteger(item.delta))) { setError('Stock changes must be whole numbers.'); return; }
    if (stockAdjustments.some(item => item.delta + Number(variants.find(variant => variant.sku === item.sku)?.stock || 0) < 0)) {
      setError('A stock change cannot make a variant negative.'); return;
    }
    if (editedVariants.some(variant => !variant.size || !variant.color)) { setError('Every variant needs a size and color.'); return; }
    setSaving(true);
    try {
      await onSave({ patch: {
        name: String(form.get('name') || '').trim(), barcode: String(form.get('barcode') || '').trim(),
        category: String(form.get('category') || '').trim(), subCategory: String(form.get('subCategory') || '').trim(),
        shortDescription: String(form.get('shortDescription') || '').trim(), description: String(form.get('description') || '').trim(),
        gsl: String(form.get('gsl') || '').trim(), salePrice, mrp, costPrice, active: form.get('active') === 'on',
        ...(product.variants.length ? { variantPatches: editedVariants } : {})
      }, stockAdjustments });
    } catch (cause) { setError((cause as Error).message); }
    finally { setSaving(false); }
  }

  return <div className="editor-backdrop" onClick={onClose}><form className="editor glass product-editor" role="dialog" aria-modal="true" aria-label={`Edit ${product.name}`} onClick={event => event.stopPropagation()} onSubmit={event => void submit(event)}>
    <header className="product-editor-header"><div><span className="eyebrow">EDIT SHARED PRODUCT</span><h2>{product.name}</h2><p>Update catalog details and record stock movements for every variant.</p></div><button type="button" className="editor-close" onClick={onClose} aria-label="Close">×</button></header>
    {error && <div className="error-banner" role="alert">{error}</div>}
    <section className="product-editor-section"><h3>Product details</h3><div className="product-editor-grid"><label>Name<input name="name" defaultValue={product.name} required /></label><label>Category<input name="category" defaultValue={product.category} required minLength={2} /></label><label>Sub-category / fit<input name="subCategory" defaultValue={product.subCategory || ''} /></label><label>Fabric / GSL<input name="gsl" defaultValue={product.gsl || ''} /></label><label>MRP ₹<input name="mrp" type="number" min="0" step="0.01" defaultValue={product.mrp} required /></label><label>Selling price ₹<input name="price" type="number" min="0" step="0.01" defaultValue={product.price} required /></label><label>Cost price ₹<input name="costPrice" type="number" min="0" step="0.01" defaultValue={product.costPrice || 0} /></label><label>Product barcode<input name="barcode" pattern="[A-Za-z0-9_.:-]*" defaultValue={product.barcode || ''} placeholder="SKU is used if blank" /></label></div><label>Short description<textarea name="shortDescription" rows={2} maxLength={500} defaultValue={product.shortDescription || ''} /></label><label>Full description<textarea name="description" rows={4} maxLength={5000} defaultValue={product.description || ''} /></label><label className="check-row"><input name="active" type="checkbox" defaultChecked={product.active} />Published on website</label></section>
    <section className="product-editor-section"><div className="section-heading"><div><h3>Variants and stock</h3><p>Current stock is shown below. Enter only the change, such as +5 for received stock or -2 for damage.</p></div><button className="button secondary" type="button" onClick={onPrint}><Printer size={16} />Print barcodes</button></div><div className="product-editor-variants">{variants.map((variant, index) => <article className="variant-edit-card" key={variant.sku}><div className="variant-edit-heading"><div><strong>{variant.size || 'Standard'} · {variant.color || 'Standard'}</strong><small>{variant.sku}</small></div><b className={variant.stock > 0 ? 'available' : 'unavailable'}>{variant.stock} currently in stock</b></div><div className="product-editor-grid"><label>Size<input name={`variant-size-${index}`} defaultValue={variant.size || 'Standard'} required /></label><label>Color<input name={`variant-color-${index}`} defaultValue={variant.color || 'Standard'} required /></label><label>Stock change<input name={`variant-stock-${index}`} type="number" step="1" defaultValue="0" placeholder="+5 or -2" /></label><label>Selling price ₹<input name={`variant-price-${index}`} type="number" min="0" step="0.01" defaultValue={variant.price} required /></label><label>Cost price ₹<input name={`variant-cost-${index}`} type="number" min="0" step="0.01" defaultValue={variant.costPrice || 0} /></label><label>Barcode<input name={`variant-barcode-${index}`} pattern="[A-Za-z0-9_.:-]*" defaultValue={variant.barcode || ''} /></label></div><label>Stock note<input name={`variant-stock-note-${index}`} maxLength={500} placeholder="Purchase, correction, damage…" /></label></article>)}</div></section>
    <footer className="product-editor-actions"><button className="button secondary" type="button" onClick={onClose}>Cancel</button><button className="button primary" disabled={saving}>{saving ? 'Saving changes…' : 'Save product and stock'}</button></footer>
  </form></div>;
}
