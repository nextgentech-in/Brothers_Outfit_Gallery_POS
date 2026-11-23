import { useState } from 'react';
import { barcodeFormats, type LabelFormat, type ReceiptFormat } from '../shared/printing';

// Preferences are local to each till, so different workstations can use different media.
export function usePrintPreference<T extends string>(kind: string, options: Record<T, unknown>, fallback: T): [T, (value: T) => void] {
  const key = `brothers-print-${kind}-v1`;
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved && Object.hasOwn(options, saved) ? saved as T : fallback;
    } catch { return fallback; }
  });
  return [value, (next: T) => {
    if (!Object.hasOwn(options, next)) return;
    setValue(next);
    try { localStorage.setItem(key, next); } catch { /* Printing works when browser storage is disabled. */ }
  }];
}

export async function printDocument(pageCss?: () => string) {
  const images = [...document.querySelectorAll<HTMLImageElement>('.print-backdrop img')]
    .filter(img => !img.closest('.no-print') && img.getClientRects().length > 0);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.all([document.fonts.ready, ...images.map(async img => {
        try { await img.decode(); }
        catch { if (!img.complete || !img.naturalWidth) throw new Error('A print image could not load. Check the connection and try again.'); }
      })]),
      new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new Error('Print images are still loading. Check the connection and try again.')), 10000); })
    ]);
  } finally { clearTimeout(timer); }
  if (images.some(img => !img.complete || img.naturalWidth === 0)) throw new Error('A print image could not load. Check the connection and try again.');
  applyPageCss(pageCss?.());
  window.print();
}

// Chrome only reliably sends a custom paper size to the printer through an unnamed @page rule,
// so the exact size for the chosen media is injected just before printing.
const OVERRIDE_ID = 'print-media-override';
function applyPageCss(css?: string) {
  document.getElementById(OVERRIDE_ID)?.remove();
  if (!css) return;
  const style = document.createElement('style');
  style.id = OVERRIDE_ID;
  style.textContent = css;
  document.head.appendChild(style);
  const cleanup = () => { style.remove(); window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
}

const mm = (value: number) => `${Math.round(value * 100) / 100}mm`;
// Named @page rules in older stylesheets would otherwise win over the injected size.
const RESET_NAMED_PAGES = 'html body .print-backdrop.print-backdrop.print-backdrop,html body .print-backdrop.print-backdrop.print-backdrop *{page:auto!important}';

/** One label per page, page exactly the label size, so the printer never feeds blank labels. */
export function labelPageCss(format: LabelFormat) {
  if (!format.startsWith('thermal-')) return `@page{size:210mm 297mm;margin:0}@media print{${RESET_NAMED_PAGES}}`;
  const { width, height } = barcodeFormats[format];
  // Content is kept slightly shorter than the page; rounding past the page edge creates an extra blank label.
  const sheet = `width:${mm(width)}!important;height:${mm(height - 0.6)}!important;max-height:${mm(height - 0.6)}!important;overflow:hidden!important;box-sizing:border-box!important;margin:0!important;padding:0!important;break-inside:avoid!important;page-break-inside:avoid!important`;
  return `@page{size:${mm(width)} ${mm(height)};margin:0}
@media print{${RESET_NAMED_PAGES}
html,body{width:${mm(width)}!important;min-width:0!important;height:auto!important;min-height:0!important;margin:0!important;padding:0!important;overflow:visible!important}
.print-backdrop .barcode-print-pages{display:block!important;width:${mm(width)}!important;margin:0!important;padding:0!important;gap:0!important}
.print-backdrop .barcode-roll-pages>.barcode-sheet-printable{display:block!important;${sheet};break-after:page!important;page-break-after:always!important}
.print-backdrop .barcode-roll-pages>.barcode-sheet-printable:last-child{break-after:auto!important;page-break-after:auto!important}
.print-backdrop .barcode-roll-pages .clothing-label-card{width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;margin:0!important;border:0!important;outline:0!important;border-radius:0!important;box-shadow:none!important;break-after:auto!important;page-break-after:auto!important}}`;
}

const rollReceipts: Partial<Record<ReceiptFormat, { paper: number; content: number }>> = {
  '58': { paper: 58, content: 48 },
  '80': { paper: 80, content: 72 }
};
const fixedReceipts: Partial<Record<ReceiptFormat, [number, number, number]>> = {
  '4x6': [101.6, 152.4, 4], '100x150': [100, 150, 4], 'a5': [148, 210, 8], 'a4': [210, 297, 12]
};

/** Roll receipts get a page exactly as long as the bill, so nothing is cut and no paper is wasted. */
export function receiptPageCss(format: ReceiptFormat, sheet: HTMLElement | null) {
  const roll = rollReceipts[format];
  if (!roll) {
    const [w, h, margin] = fixedReceipts[format] ?? [210, 297, 12];
    return `@page{size:${mm(w)} ${mm(h)};margin:${mm(margin)}}@media print{${RESET_NAMED_PAGES}}`;
  }
  const length = Math.max(60, Math.ceil(measurePrintedHeight(sheet, roll.content) + 12));
  return `@page{size:${mm(roll.paper)} ${mm(length)};margin:0}
@media print{${RESET_NAMED_PAGES}
html,body{width:${mm(roll.paper)}!important;min-width:0!important;height:auto!important;margin:0!important;padding:0!important}
.print-backdrop .invoice-sheet{width:${mm(roll.content)}!important;max-width:none!important;margin:0 auto!important;padding:2mm 0 0!important}}`;
}

function measurePrintedHeight(sheet: HTMLElement | null, contentWidth: number) {
  const source = sheet?.querySelector<HTMLElement>('.receipt-paper') ?? sheet;
  if (!sheet || !source) return 200;
  const clone = source.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.no-print,.invoice-actions,.error-banner').forEach(node => node.remove());
  clone.removeAttribute('role'); clone.removeAttribute('aria-modal'); clone.setAttribute('aria-hidden', 'true');
  Object.assign(clone.style, { position: 'absolute', left: '-10000px', top: '0', width: `${contentWidth}mm`, boxSizing: 'content-box', padding: '0', margin: '0', border: '0', maxHeight: 'none', height: 'auto', overflow: 'visible', visibility: 'hidden' });
  sheet.appendChild(clone);
  const px = clone.getBoundingClientRect().height;
  clone.remove();
  return px * 25.4 / 96;
}
