import { useMemo, useState, type CSSProperties } from 'react';
import { Printer } from 'lucide-react';

export type LabelProduct = {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  variants: { sku: string; barcode?: string; size?: string; color?: string }[];
};

type LabelSize = 'compact' | 'standard' | 'large';

export function BarcodeLabel({ product, onClose }: { product: LabelProduct; onClose: () => void }) {
  const variants = product.variants.length ? product.variants : [{ sku: product.sku, barcode: product.barcode }];
  const [copies, setCopies] = useState<Record<string, number>>(() => Object.fromEntries(variants.map(variant => [variant.sku, 1])));
  const [columns, setColumns] = useState(3);
  const [labelSize, setLabelSize] = useState<LabelSize>('standard');
  const labels = useMemo(() => variants.flatMap(variant => Array.from({ length: copies[variant.sku] || 0 }, (_, copy) => ({ variant, copy }))), [copies, variants]);
  const sheetStyle = { '--barcode-columns': columns } as CSSProperties;
  const updateCopies = (sku: string, value: number) => setCopies(old => ({ ...old, [sku]: Number.isSafeInteger(value) ? Math.min(100, Math.max(0, value)) : 0 }));

  return <div className="editor-backdrop" onClick={onClose}>
    <div className="editor glass barcode-editor" role="dialog" aria-modal="true" aria-label={`Print barcodes for ${product.name}`} onClick={event => event.stopPropagation()}>
      <button className="editor-close" type="button" onClick={onClose} aria-label="Close">×</button>
      <div className="barcode-controls">
        <h2>Barcode sheet</h2><p>{product.name} · Adjust copies and layout, then print many labels on one A4 page.</p>
        <div className="barcode-options"><label>Labels per row<select value={columns} onChange={event => setColumns(Number(event.target.value))}><option value="2">2 columns</option><option value="3">3 columns</option><option value="4">4 columns</option></select></label><label>Label size<select value={labelSize} onChange={event => setLabelSize(event.target.value as LabelSize)}><option value="compact">Compact</option><option value="standard">Standard</option><option value="large">Large</option></select></label><label>Set every variant<input type="number" min="0" max="100" step="1" defaultValue="1" onChange={event => { const value = Number(event.target.value); setCopies(Object.fromEntries(variants.map(variant => [variant.sku, Number.isSafeInteger(value) ? Math.min(100, Math.max(0, value)) : 0]))); }} /></label></div>
        <div className="barcode-copy-list">{variants.map(variant => <label key={variant.sku}><span><strong>{variant.size || 'Standard'} {variant.color || ''}</strong><small>{variant.barcode || variant.sku}</small></span><input type="number" min="0" max="100" step="1" value={copies[variant.sku] || 0} onChange={event => updateCopies(variant.sku, Number(event.target.value))} aria-label={`Copies for ${variant.sku}`} /></label>)}</div>
        <div className="barcode-summary"><strong>{labels.length} labels</strong><span>Labels continue onto additional A4 pages automatically.</span><button className="button primary" type="button" disabled={!labels.length} onClick={() => window.print()}><Printer size={17} />Print barcode sheet</button></div>
      </div>
      <div className={`barcode-sheet barcode-size-${labelSize}`} style={sheetStyle}>{labels.map(({ variant, copy }) => <div className="barcode-label" key={`${variant.sku}:${copy}`}>
        <strong>{product.name}</strong><span>{[variant.size, variant.color].filter(Boolean).join(' · ') || 'Standard'}</span>
        <img src={`/api/products/${encodeURIComponent(product.id)}/label?sku=${encodeURIComponent(variant.sku)}&format=code128`} alt={`Barcode for ${variant.sku}`} />
        <small>{variant.barcode || variant.sku}</small>
      </div>)}</div>
    </div>
  </div>;
}
