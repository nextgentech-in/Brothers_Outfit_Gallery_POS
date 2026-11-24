import React from 'react';
export type { LabelFormat } from '../shared/printing';
import type { LabelFormat } from '../shared/printing';

export type ClothingProduct = {
  id?: string;
  name: string;
  sku: string;
  productNumber?: number;
  barcode?: string;
  brand?: string;
  category?: string;
  subCategory?: string;
  design?: string;
  fabric?: string;
  gsl?: string;
  price?: number;
  salePrice?: number;
  mrp?: number;
};

export type ClothingVariant = {
  sku: string;
  barcode?: string;
  variantSequence?: number;
  size?: string;
  color?: string;
  price?: number;
  salePrice?: number;
  mrp?: number;
};

export interface ClothingLabelProps {
  product: ClothingProduct;
  variant: ClothingVariant;
  format?: LabelFormat;
  showMrp?: boolean;
  showDiscount?: boolean;
}

export function ClothingLabel({
  product,
  variant,
  format = 'thermal-50x38',
  showMrp = true
}: ClothingLabelProps) {
  const mrp = variant.mrp || product.mrp;
  const barcode = variant.barcode || product.barcode || variant.sku;

  const barcodeImgSrc = `/api/barcode/render?code=${encodeURIComponent(barcode)}&format=code128&style=slim`;

  return (
    <div className={`clothing-label-card pro-label label-fmt-${format}`}>
      <div className="pro-label-brand">BROTHERS OUTFIT GALLERY</div>
      <div className="pro-label-specs">
        <div><span>SIZE</span><strong>{variant.size || 'FREE'}</strong></div>
        <div><span>COLOUR</span><strong>{variant.color || 'STD'}</strong></div>
      </div>
      {showMrp && <div className="pro-label-price">
        <span>MRP</span><strong>{mrp ? `₹${mrp.toLocaleString('en-IN')}` : '—'}</strong>
        <small>Incl. of all taxes</small>
      </div>}
      <div className="pro-label-barcode">
        <img src={barcodeImgSrc} alt={barcode} className="label-barcode-image" loading="eager" />
        <div className="pro-label-code">{barcode}</div>
      </div>
    </div>
  );
}
