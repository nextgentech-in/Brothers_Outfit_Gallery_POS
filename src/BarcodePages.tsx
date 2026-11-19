import React from 'react';
import type { LabelFormat } from './ClothingLabel';
import { labelPageGroups } from '../shared/printing';

export function BarcodePages({ format, children }: { format: LabelFormat; children: React.ReactNode }) {
  const pages = labelPageGroups(React.Children.toArray(children), format);
  return <div className={`barcode-print-pages ${format.startsWith('thermal-') ? 'barcode-roll-pages' : 'barcode-a4-pages'}`}>{pages.map((page, index) =>
    <div className={`barcode-sheet-printable sheet-${format}`} key={index}>{page}</div>
  )}</div>;
}
