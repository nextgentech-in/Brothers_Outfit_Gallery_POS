import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Printer } from 'lucide-react';
import { ClothingLabel, type ClothingProduct, type ClothingVariant, type LabelFormat } from './ClothingLabel';

export type PrintableItem = {
  product: ClothingProduct;
  variant: ClothingVariant;
  defaultCopies?: number;
};

export interface BarcodePrintModalProps {
  items: PrintableItem[];
  title?: string;
  subtitle?: string;
  onClose: () => void;
}

export function BarcodePrintModal({
  items,
  title = 'Print Barcode Labels',
  subtitle = 'Adjust format and quantities, preview below, and print crisp labels.',
  onClose
}: BarcodePrintModalProps) {
  const [format, setFormat] = useState<LabelFormat>('thermal-38x60');

  // Initialize copies per item key
  const [copies, setCopies] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    items.forEach((item, index) => {
      const key = `${item.product.id || index}:${item.variant.sku}`;
      initial[key] = Math.max(0, item.defaultCopies ?? 1);
    });
    return initial;
  });

  const [bulkQty, setBulkQty] = useState<number | ''>('');

  const handleSetAll = (qty: number) => {
    const clamped = Math.max(0, Math.min(200, qty));
    setCopies(prev => {
      const updated: Record<string, number> = {};
      Object.keys(prev).forEach(k => {
        updated[k] = clamped;
      });
      return updated;
    });
  };

  const handleUpdateCopies = (key: string, val: number) => {
    const clamped = Math.max(0, Math.min(200, Number.isFinite(val) ? val : 0));
    setCopies(prev => ({ ...prev, [key]: clamped }));
  };

  // Build flattened list of printable labels
  const printableList = useMemo(() => {
    const list: Array<{ key: string; product: ClothingProduct; variant: ClothingVariant; copyIdx: number }> = [];
    items.forEach((item, index) => {
      const itemKey = `${item.product.id || index}:${item.variant.sku}`;
      const count = copies[itemKey] ?? 0;
      for (let c = 0; c < count; c++) {
        list.push({
          key: `${itemKey}-copy-${c}`,
          product: item.product,
          variant: item.variant,
          copyIdx: c
        });
      }
    });
    return list;
  }, [items, copies]);

  const totalLabels = printableList.length;

  const handlePrint = () => {
    window.print();
  };

  return createPortal(
    <div className="editor-backdrop print-backdrop" onClick={onClose}>
      <div
        className="editor glass barcode-editor barcode-unified-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={e => e.stopPropagation()}
      >
        <button className="editor-close" type="button" onClick={onClose} aria-label="Close modal">
          ×
        </button>

        {/* Configuration Panel (Hidden in print) */}
        <div className="barcode-controls no-print">
          <div className="barcode-modal-header">
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>

          <div className="barcode-settings-grid">
            <div className="barcode-setting-group">
              <label>
                <strong>Label Format & Size</strong>
                <select value={format} onChange={e => setFormat(e.target.value as LabelFormat)}>
                  <option value="thermal-38x60">Clothing Tag: 38 × 60 mm (Vertical)</option>
                  <option value="thermal-50x38">Thermal Roll: 50 × 38 mm (Standard Apparel)</option>
                  <option value="thermal-50x25">Thermal Roll: 50 × 25 mm (Compact)</option>
                  <option value="thermal-38x25">Thermal Roll: 38 × 25 mm (Mini)</option>
                  <option value="a4-24">A4 Sheet: 24 labels (3 × 8 grid, 70 × 37 mm)</option>
                  <option value="a4-40">A4 Sheet: 40 labels (4 × 10 grid, 48.5 × 25.4 mm)</option>
                </select>
              </label>
            </div>

            <div className="barcode-setting-group bulk-qty-group">
              <label>
                <strong>Set All Quantities</strong>
                <div className="bulk-input-row">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    placeholder="Qty"
                    value={bulkQty}
                    onChange={e => {
                      const v = e.target.value === '' ? '' : parseInt(e.target.value, 10);
                      setBulkQty(v);
                      if (typeof v === 'number') handleSetAll(v);
                    }}
                  />
                  <button
                    type="button"
                    className="button secondary sm"
                    onClick={() => handleSetAll(1)}
                  >
                    1 each
                  </button>
                  <button
                    type="button"
                    className="button secondary sm"
                    onClick={() => handleSetAll(5)}
                  >
                    5 each
                  </button>
                </div>
              </label>
            </div>
          </div>

          {/* Items & Copies Table */}
          <div className="barcode-items-list-container">
            <span className="items-list-title">Variants to Print ({items.length} items):</span>
            <div className="barcode-items-scroll">
              {items.map((item, idx) => {
                const itemKey = `${item.product.id || idx}:${item.variant.sku}`;
                const currentCopies = copies[itemKey] ?? 0;
                return (
                  <div key={itemKey} className="barcode-variant-row">
                    <div className="variant-info">
                      <strong>
                        {item.product.productNumber ? `#${item.product.productNumber} ` : ''}
                        {item.product.name}
                      </strong>
                      <span className="variant-meta">
                        {[item.variant.size || 'Standard', item.variant.color].filter(Boolean).join(' / ')}
                        {item.variant.sku ? ` · ${item.variant.sku}` : ''}
                        {item.variant.barcode ? ` · [${item.variant.barcode}]` : ''}
                      </span>
                    </div>
                    <div className="variant-qty-input">
                      <label>
                        <span>Labels:</span>
                        <input
                          type="number"
                          min="0"
                          max="200"
                          value={currentCopies}
                          onChange={e => handleUpdateCopies(itemKey, parseInt(e.target.value, 10))}
                          aria-label={`Quantity for ${item.product.name} ${item.variant.sku}`}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Summary & Print Button */}
          <div className="barcode-summary-bar">
            <div className="summary-text">
              <strong>{totalLabels} labels ready</strong>
              <span>
                {format.startsWith('thermal')
                  ? 'Continuous roll printing with sharp thermal separation.'
                  : 'Sticker sheet printing on standard A4 paper.'}
              </span>
            </div>
            <div className="summary-actions">
              <button
                type="button"
                className="button primary"
                disabled={totalLabels === 0}
                onClick={handlePrint}
              >
                <Printer size={18} />
                <span>Print {totalLabels} Labels</span>
              </button>
            </div>
          </div>
        </div>

        {/* Live Print / Preview Canvas */}
        <div className="barcode-preview-container">
          <div className="preview-watermark no-print">Live Print Preview</div>
          <div className={`barcode-sheet-printable sheet-${format}`}>
            {printableList.map(labelItem => (
              <ClothingLabel
                key={labelItem.key}
                product={labelItem.product}
                variant={labelItem.variant}
                format={format}
              />
            ))}
            {printableList.length === 0 && (
              <div className="empty-labels-notice no-print">
                No labels to display. Set copies above 0 to preview and print.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

