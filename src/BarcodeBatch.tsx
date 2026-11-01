import { useMemo, useState, type CSSProperties } from 'react';
import { Printer, Search } from 'lucide-react';

export type BatchLabelProduct = {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  stock: number;
  variants: { sku: string; barcode?: string; size?: string; color?: string; stock: number }[];
};

type LabelSize = 'compact' | 'standard' | 'large';
type LabelRow = { key: string; product: BatchLabelProduct; sku: string; barcode?: string; size?: string; color?: string; stock: number };

export function BarcodeBatch({ products, onClose }: { products: BatchLabelProduct[]; onClose: () => void }) {
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [columns, setColumns] = useState(3);
  const [labelSize, setLabelSize] = useState<LabelSize>('standard');
  const [query, setQuery] = useState('');
  const rows = useMemo<LabelRow[]>(() => products.flatMap(product => {
    const variants = product.variants.length ? product.variants : [{ sku: product.sku, barcode: product.barcode, stock: product.stock }];
    return variants.map(variant => ({ key: `${product.id}:${variant.sku}`, product, ...variant }));
  }), [products]);
  const visibleRows = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return rows;
    return rows.filter(row => `${row.product.name} ${row.product.sku} ${row.sku} ${row.barcode || ''} ${row.size || ''} ${row.color || ''}`.toLowerCase().includes(search));
  }, [query, rows]);
  const labels = useMemo(() => rows.flatMap(row => Array.from({ length: copies[row.key] || 0 }, (_, copy) => ({ row, copy }))), [copies, rows]);
  const selectedProducts = new Set(labels.map(label => label.row.product.id)).size;
  const sheetStyle = { '--barcode-columns': columns } as CSSProperties;
  const validCopies = (value: number) => Number.isSafeInteger(value) ? Math.min(100, Math.max(0, value)) : 0;
  const setVisibleCopies = (value: number) => setCopies(old => ({ ...old, ...Object.fromEntries(visibleRows.map(row => [row.key, validCopies(value)])) }));

  return <div className="editor-backdrop" onClick={onClose}>
    <div className="editor glass barcode-editor barcode-batch-editor" role="dialog" aria-modal="true" aria-label="Print barcodes for multiple products" onClick={event => event.stopPropagation()}>
      <button className="editor-close" type="button" onClick={onClose} aria-label="Close">×</button>
      <div className="barcode-controls">
        <h2>Multi-product barcode sheet</h2><p>Search products, enter the number of labels for each variant, and print them together on A4 pages.</p>
        <label className="field-search barcode-search"><Search size={18} /><input placeholder="Search product, SKU, size or color" value={query} onChange={event => setQuery(event.target.value)} autoFocus /></label>
        <div className="barcode-options"><label>Labels per row<select value={columns} onChange={event => setColumns(Number(event.target.value))}><option value="2">2 columns</option><option value="3">3 columns</option><option value="4">4 columns</option></select></label><label>Label size<select value={labelSize} onChange={event => setLabelSize(event.target.value as LabelSize)}><option value="compact">Compact</option><option value="standard">Standard</option><option value="large">Large</option></select></label><label>Set visible variants<input type="number" min="0" max="100" step="1" defaultValue="0" onChange={event => setVisibleCopies(Number(event.target.value))} /></label></div>
        <div className="barcode-batch-list">{visibleRows.map(row => <label key={row.key}><span><strong>{row.product.name}</strong><small>{[row.size || 'Standard', row.color].filter(Boolean).join(' · ')} · {row.sku}</small><b className={row.stock > 0 ? 'available' : 'unavailable'}>{row.stock} in stock</b></span><input type="number" min="0" max="100" step="1" value={copies[row.key] || 0} onChange={event => setCopies(old => ({ ...old, [row.key]: validCopies(Number(event.target.value)) }))} aria-label={`Barcode copies for ${row.product.name} ${row.sku}`} /></label>)}</div>
        {!visibleRows.length && <p className="empty-cart">No matching product variants.</p>}
        <div className="barcode-summary"><strong>{labels.length} labels</strong><span>{selectedProducts} products selected · extra labels continue onto another A4 page.</span><button className="button primary" type="button" disabled={!labels.length} onClick={() => window.print()}><Printer size={17} />Print selected barcodes</button></div>
      </div>
      <div className={`barcode-sheet barcode-size-${labelSize}`} style={sheetStyle}>{labels.map(({ row, copy }) => <div className="barcode-label" key={`${row.key}:${copy}`}>
        <strong>{row.product.name}</strong><span>{[row.size || 'Standard', row.color].filter(Boolean).join(' · ')}</span>
        <img src={`/api/products/${encodeURIComponent(row.product.id)}/label?sku=${encodeURIComponent(row.sku)}&format=code128`} alt={`Barcode for ${row.sku}`} />
        <small>{row.barcode || row.sku}</small>
      </div>)}</div>
    </div>
  </div>;
}
