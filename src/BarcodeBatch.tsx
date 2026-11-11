import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ClothingLabel, type LabelFormat } from './ClothingLabel';
import { Printer, Search } from 'lucide-react';

export type BatchLabelProduct = {
  id: string;
  name: string;
  sku: string;
  productNumber?: number;
  barcode?: string;
  brand?: string;
  design?: string;
  fabric?: string;
  gsl?: string;
  category?: string;
  subCategory?: string;
  price?: number;
  mrp?: number;
  stock: number;
  variants: {
    sku: string;
    barcode?: string;
    variantSequence?: number;
    size?: string;
    color?: string;
    price?: number;
    mrp?: number;
    stock: number;
  }[];
};

type LabelRow = {
  key: string;
  product: BatchLabelProduct;
  sku: string;
  barcode?: string;
  variantSequence?: number;
  size?: string;
  color?: string;
  price?: number;
  mrp?: number;
  stock: number;
};

export function BarcodeBatch({ products, onClose }: { products: BatchLabelProduct[]; onClose: () => void }) {
  const [copies, setCopies] = useState<Record<string, number>>({});
  const [format, setFormat] = useState<LabelFormat>('thermal-50x38');
  const [showMrp, setShowMrp] = useState(true);
  const [showDiscount, setShowDiscount] = useState(true);
  const [query, setQuery] = useState('');

  const rows = useMemo<LabelRow[]>(() => products.flatMap(product => {
    const variants = product.variants && product.variants.length > 0
      ? product.variants
      : [{ sku: product.sku, barcode: product.barcode, stock: product.stock, price: product.price, mrp: product.mrp }];
    return variants.map(variant => ({ key: `${product.id}:${variant.sku}`, product, ...variant }));
  }), [products]);

  const visibleRows = useMemo(() => {
    const search = query.trim().toLowerCase();
    if (!search) return rows;
    return rows.filter(row =>
      `${row.product.productNumber ? `#${row.product.productNumber}` : ''} ${row.product.name} ${row.product.sku} ${row.sku} ${row.barcode || ''} ${row.size || ''} ${row.color || ''}`
        .toLowerCase()
        .includes(search)
    );
  }, [query, rows]);

  const labels = useMemo(() => rows.flatMap(row => Array.from({ length: copies[row.key] || 0 }, (_, copy) => ({ row, copy }))), [copies, rows]);
  const selectedProducts = new Set(labels.map(label => label.row.product.id)).size;

  const validCopies = (value: number) => Number.isSafeInteger(value) ? Math.min(200, Math.max(0, value)) : 0;
  const setVisibleCopies = (value: number) => setCopies(old => ({ ...old, ...Object.fromEntries(visibleRows.map(row => [row.key, validCopies(value)])) }));

  return createPortal(
    <div className="editor-backdrop print-backdrop" onClick={onClose}>
      <div
        className="editor glass barcode-editor barcode-batch-editor"
        role="dialog"
        aria-modal="true"
        aria-label="Print barcodes for multiple products"
        onClick={event => event.stopPropagation()}
      >
        <button className="editor-close" type="button" onClick={onClose} aria-label="Close">×</button>
        <div className="barcode-controls no-print">
          <h2>Multi-product barcode printing</h2>
          <p>Search products or product numbers, adjust label quantities, and print across thermal rolls or A4 sheets.</p>

          <label className="field-search barcode-search">
            <Search size={18} />
            <input
              placeholder="Search by Product No. (#12), name, SKU, or barcode..."
              value={query}
              onChange={event => setQuery(event.target.value)}
              autoFocus
            />
          </label>

          <div className="barcode-options">
            <label>
              Label format & size
              <select value={format} onChange={event => setFormat(event.target.value as LabelFormat)}>
                <option value="thermal-50x38">Thermal Roll: 50 × 38 mm (Standard)</option>
                <option value="thermal-50x25">Thermal Roll: 50 × 25 mm (Compact)</option>
                <option value="thermal-38x25">Thermal Roll: 38 × 25 mm (Mini)</option>
                <option value="a4-24">A4 Sheet: 24 labels (3 × 8 grid)</option>
                <option value="a4-40">A4 Sheet: 40 labels (4 × 10 grid)</option>
              </select>
            </label>
            <label>
              Set visible variants
              <input
                type="number"
                min="0"
                max="200"
                step="1"
                defaultValue="0"
                onChange={event => setVisibleCopies(Number(event.target.value))}
              />
            </label>
            <div className="barcode-checkbox-options" style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '16px' }}>
              <label className="checkbox-pill">
                <input
                  type="checkbox"
                  checked={showMrp}
                  onChange={e => setShowMrp(e.target.checked)}
                />
                <span>Show MRP</span>
              </label>
              <label className="checkbox-pill">
                <input
                  type="checkbox"
                  checked={showDiscount}
                  onChange={e => setShowDiscount(e.target.checked)}
                />
                <span>Show Discount %</span>
              </label>
            </div>
          </div>

          <div className="barcode-batch-list">
            {visibleRows.map(row => (
              <label key={row.key}>
                <span>
                  <strong>
                    {row.product.productNumber ? `#${row.product.productNumber} ` : ''}
                    {row.product.name}
                  </strong>
                  <small>
                    {[row.size || 'Standard', row.color].filter(Boolean).join(' · ')} · {row.barcode || row.sku}
                  </small>
                  <b className={row.stock > 0 ? 'available' : 'unavailable'}>{row.stock} in stock</b>
                </span>
                <input
                  type="number"
                  min="0"
                  max="200"
                  step="1"
                  value={copies[row.key] || 0}
                  onChange={event => setCopies(old => ({ ...old, [row.key]: validCopies(Number(event.target.value)) }))}
                  aria-label={`Barcode copies for ${row.product.name} ${row.sku}`}
                />
              </label>
            ))}
          </div>
          {!visibleRows.length && <p className="empty-cart">No matching product variants.</p>}

          <div className="barcode-summary">
            <strong>{labels.length} labels</strong>
            <span>{selectedProducts} products selected. Continuous rolls or A4 sheets automatically flow.</span>
            <button className="button primary" type="button" disabled={!labels.length} onClick={() => window.print()}>
              <Printer size={17} />
              Print selected barcodes
            </button>
          </div>
        </div>

        <div className={`barcode-preview-container barcode-sheet-printable sheet-${format}`}>
          {labels.map(({ row, copy }) => (
            <ClothingLabel
              key={`${row.key}:${copy}`}
              product={row.product}
              variant={row}
              format={format}
              showMrp={showMrp}
              showDiscount={showDiscount}
            />
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
