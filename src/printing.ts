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
  const stickers = [...document.querySelectorAll<HTMLElement>('.delivery-sheet')];
  if (stickers.some(sticker => sticker.scrollHeight > sticker.clientHeight + 1 || sticker.scrollWidth > sticker.clientWidth + 1))
    throw new Error('This address or note is too long for the sticker. Shorten it or choose a larger paper size.');
  window.print();
}
