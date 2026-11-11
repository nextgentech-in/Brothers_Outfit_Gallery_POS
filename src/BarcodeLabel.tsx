import React from 'react';
import { BarcodePrintModal, type PrintableItem } from './BarcodePrintModal';
import type { ClothingProduct, ClothingVariant } from './ClothingLabel';

export type LabelProduct = ClothingProduct & {
  id: string;
  variants: ClothingVariant[];
};

export function BarcodeLabel({
  product,
  onClose,
  defaultCopies
}: {
  product: LabelProduct;
  onClose: () => void;
  defaultCopies?: Record<string, number>;
}) {
  const variants = product.variants && product.variants.length > 0
    ? product.variants
    : [{ sku: product.sku, barcode: product.barcode, price: product.price, mrp: product.mrp }];

  const items: PrintableItem[] = variants.map(v => ({
    product,
    variant: v,
    defaultCopies: defaultCopies?.[v.sku] ?? 1
  }));

  return (
    <BarcodePrintModal
      items={items}
      title={`Print Barcodes: ${product.name}`}
      subtitle="Select label dimensions (thermal rolls or A4 sheets), adjust quantities, and print."
      onClose={onClose}
    />
  );
}
