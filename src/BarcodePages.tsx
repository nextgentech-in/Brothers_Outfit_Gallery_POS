import React from 'react';
import type { LabelFormat } from './ClothingLabel';

const labelsPerPage: Partial<Record<LabelFormat, number>> = {
  'a4-18': 18,
  'a4-24': 24,
  'a4-40': 40
};

export function BarcodePages({ format, children }: { format: LabelFormat; children: React.ReactNode[] }) {
  const pageSize = labelsPerPage[format] || Math.max(children.length, 1);
  const pages: React.ReactNode[][] = [];
  for (let index = 0; index < children.length; index += pageSize) {
    pages.push(children.slice(index, index + pageSize));
  }
  return <div className="barcode-print-pages">{pages.map((page, index) =>
    <div className={`barcode-sheet-printable sheet-${format}`} key={index}>{page}</div>
  )}</div>;
}
