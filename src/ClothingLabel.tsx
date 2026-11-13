import React from 'react';

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

export type LabelFormat = 'thermal-50x25' | 'thermal-50x38' | 'thermal-38x25' | 'thermal-38x60' | 'a4-18' | 'a4-24' | 'a4-40';

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
  format = 'thermal-50x38'
}: ClothingLabelProps) {
  const barcode = variant.barcode || product.barcode || variant.sku;

  const barcodeImgSrc = `/api/barcode/render?code=${encodeURIComponent(barcode)}&format=code128`;

  return (
    <div className={`clothing-label-card label-fmt-${format}`}>
      {/* Top Header */}
      <div className="label-header">
        <span className="label-store-name">BROTHERS OUTFIT GALLERY</span>
      </div>

      <div className="label-body">
        <div className="label-variant-badge-row">
          <span className="label-variant-pill">
            <strong>Size:</strong> {variant.size || 'Free'}
          </span>
          <span className="label-variant-pill"><strong>Colour:</strong> {variant.color || 'Standard'}</span>
        </div>
        <div className="label-barcode-container">
          <img
            src={barcodeImgSrc}
            alt={barcode}
            className="label-barcode-image"
            loading="eager"
          />
          <div className="label-barcode-text">{barcode}</div>
        </div>
      </div>
    </div>
  );
}
