import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Printer } from 'lucide-react';
import { ClothingLabel, type ClothingProduct, type ClothingVariant, type LabelFormat } from './ClothingLabel';
import { BarcodePages } from './BarcodePages';
import { barcodeFormats } from '../shared/printing';
import { BarcodeFormatPicker } from './BarcodeFormatPicker';
import { printDocument, usePrintPreference } from './printing';

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
  const [format, setFormat] = usePrintPreference<LabelFormat>('barcode', barcodeFormats, 'thermal-50x38');
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState('');
  const [showMrp, setShowMrp] = useState(true);
  const [showDiscount, setShowDiscount] = useState(true);

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
    const clamped = Number.isSafeInteger(qty) ? Math.max(0, Math.min(200, qty)) : 0;
    setCopies(prev => {
      const updated: Record<string, number> = {};
      Object.keys(prev).forEach(k => {
        updated[k] = clamped;
      });
      return updated;
    });
  };

  const handleUpdateCopies = (key: string, val: number) => {
    const clamped = Number.isSafeInteger(val) ? Math.max(0, Math.min(200, val)) : 0;
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

  const handlePrint = async () => {
    setPrinting(true); setPrintError('');
    try { await printDocument(); }
    catch (error) { setPrintError((error as Error).message); }
    finally { setPrinting(false); }
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
          {printError && <p className="error-banner" role="alert">{printError}</p>}
          <div className="barcode-modal-header">
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>

          <div className="barcode-settings-grid">
            <BarcodeFormatPicker value={format} onChange={setFormat} />

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
          <div className="barcode-checkbox-options">
            <label className="checkbox-pill"><input type="checkbox" checked={showMrp} onChange={event => setShowMrp(event.target.checked)} />Show MRP</label>
            <label className="checkbox-pill"><input type="checkbox" checked={showDiscount} onChange={event => setShowDiscount(event.target.checked)} />Show discount</label>
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
                disabled={totalLabels === 0 || printing}
                onClick={() => void handlePrint()}
              >
                <Printer size={18} />
                <span>{printing ? 'Preparing labels…' : `Print ${totalLabels} Labels`}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Live Print / Preview Canvas */}
        <div className="barcode-preview-container">
          <div className="preview-watermark no-print">Live Print Preview</div>
          <BarcodePages format={format}>
            {printableList.map(labelItem => (
              <ClothingLabel
                key={labelItem.key}
                product={labelItem.product}
                variant={labelItem.variant}
                format={format}
                showMrp={showMrp}
                showDiscount={showDiscount}
              />
            ))}
          </BarcodePages>
          {printableList.length === 0 && <div className="empty-labels-notice no-print">No labels to display. Set copies above 0 to preview and print.</div>}
        </div>
      </div>
    </div>,
    document.body
  );
}

