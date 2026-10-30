import { Printer } from 'lucide-react';

export type LabelProduct = {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  variants: { sku: string; barcode?: string; size?: string; color?: string }[];
};

export function BarcodeLabel({ product, onClose }: { product: LabelProduct; onClose: () => void }) {
  const variants = product.variants.length ? product.variants : [{ sku: product.sku, barcode: product.barcode }];
  return <div className="editor-backdrop" onClick={onClose}>
    <div className="editor glass barcode-editor" role="dialog" aria-modal="true" aria-label={`Print barcodes for ${product.name}`} onClick={event => event.stopPropagation()}>
      <button className="editor-close" type="button" onClick={onClose} aria-label="Close">×</button>
      <h2>Barcode labels</h2><p>{product.name} · Choose a label to print, then scan it in Quick billing.</p>
      <div className="barcode-labels">{variants.map(variant => <div className="barcode-label" key={variant.sku}>
        <strong>{product.name}</strong><span>{[variant.size, variant.color].filter(Boolean).join(' · ')}</span>
        <img src={`/api/products/${encodeURIComponent(product.id)}/label?sku=${encodeURIComponent(variant.sku)}&format=code128`} alt={`Barcode for ${variant.sku}`} />
        <small>{variant.barcode || variant.sku}</small>
        <a className="button secondary" href={`/api/products/${encodeURIComponent(product.id)}/label?sku=${encodeURIComponent(variant.sku)}&format=qrcode`} target="_blank" rel="noreferrer">QR version</a>
        <button className="button primary" type="button" onClick={event => { const selected = event.currentTarget.closest('.barcode-label'); document.querySelectorAll('.barcode-label').forEach(el => el.classList.toggle('print-selected', el === selected)); window.print(); }}><Printer size={17} />Print this label</button>
      </div>)}</div>
    </div>
  </div>;
}
