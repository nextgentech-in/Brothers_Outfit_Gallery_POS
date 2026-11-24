import { useState } from 'react';

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

export async function printDocument() {
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
  const cleanup = fitReceiptRollPage();
  try { window.print(); } finally { cleanup(); }
}

// Receipt rolls are continuous paper: size the page to the bill so the printer
// does not feed out the blank rest of a fixed 297 mm page.
const rollPages = { '58': { page: 'thermal58', paper: 58, content: 54 }, '80': { page: 'thermal80', paper: 80, content: 76 } } as const;
function fitReceiptRollPage() {
  const sheet = document.querySelector<HTMLElement>('.print-backdrop .invoice-sheet.receipt-58, .print-backdrop .invoice-sheet.receipt-80');
  const bill = sheet?.querySelector<HTMLElement>('.pro-bill');
  if (!sheet || !bill) return () => {};
  const roll = rollPages[sheet.classList.contains('receipt-58') ? '58' : '80'];
  const probe = document.createElement('div');
  probe.className = sheet.className.replace(/\bglass\b/, '');
  probe.style.cssText = `position:absolute;left:-10000px;top:0;width:${roll.content}mm;padding:0;margin:0;max-height:none;overflow:visible;visibility:hidden`;
  probe.appendChild(bill.cloneNode(true));
  document.body.appendChild(probe);
  const mm = probe.getBoundingClientRect().height / (96 / 25.4);
  probe.remove();
  const height = Math.ceil(mm + 4 + 6); // 2 mm top/bottom margins plus a small tear-off allowance
  const style = document.createElement('style');
  style.textContent = `@media print{@page ${roll.page}{size:${roll.paper}mm ${height}mm;margin:2mm}}`;
  document.head.appendChild(style);
  return () => style.remove();
}
