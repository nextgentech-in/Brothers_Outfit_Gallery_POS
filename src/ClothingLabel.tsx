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

export type LabelFormat = 'thermal-50x25' | 'thermal-50x38' | 'thermal-38x25' | 'a4-24' | 'a4-40';

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
  showMrp = true,
  showDiscount = true
}: ClothingLabelProps) {
  const sellingPrice = variant.price ?? variant.salePrice ?? product.price ?? product.salePrice ?? 0;
  const mrp = variant.mrp ?? product.mrp ?? 0;

  const discountPercent = (mrp > sellingPrice && mrp > 0)
    ? Math.round(((mrp - sellingPrice) / mrp) * 100)
    : 0;

  const barcode = variant.barcode || product.barcode || variant.sku;
  const productNoDisplay = product.productNumber ? `#${product.productNumber}` : '—';
  const sizeColor = [variant.size || 'Standard', variant.color].filter(Boolean).join(' / ');
  const brandCategory = [product.brand, product.subCategory || product.category].filter(Boolean).join(' · ');
  const fabricInfo = product.fabric || product.gsl || '';
  const designCode = product.design || '';

  const money = (val: number) => `₹${val.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  const barcodeImgSrc = `/api/barcode/render?code=${encodeURIComponent(barcode)}&format=code128`;

  return (
    <div className={`clothing-label-card label-fmt-${format}`}>
      {/* Top Header */}
      <div className="label-header">
        <span className="label-store-name">BROTHERS OUTFIT GALLERY</span>
        <span className="label-product-no">{productNoDisplay}</span>
      </div>

      {/* Item Title & Brand */}
      <div className="label-body">
        <div className="label-item-name" title={product.name}>
          {product.name}
        </div>

        {brandCategory && (
          <div className="label-meta-row">
            <span className="label-meta-brand">{brandCategory}</span>
          </div>
        )}

        {/* Prominent Variant Tags */}
        <div className="label-variant-badge-row">
          <span className="label-variant-pill">
            <strong>Size:</strong> {variant.size || 'Free'}
          </span>
          {variant.color && (
            <span className="label-variant-pill">
              <strong>Colour:</strong> {variant.color}
            </span>
          )}
          {designCode && (
            <span className="label-meta-design">
              <strong>Art:</strong> {designCode}
            </span>
          )}
        </div>

        {fabricInfo && (
          <div className="label-fabric-row">
            <span>Fabric: {fabricInfo}</span>
          </div>
        )}

        {/* Pricing & Discount */}
        <div className="label-price-section">
          <div className="label-selling-price">
            <span className="label-price-caption">OFFER:</span>
            <strong>{money(sellingPrice)}</strong>
          </div>
          {showMrp && mrp > 0 && (
            <div className="label-mrp-price">
              <span>MRP: </span>
              <del>{money(mrp)}</del>
            </div>
          )}
          {showDiscount && discountPercent > 0 && (
            <span className="label-discount-badge">{discountPercent}% OFF</span>
          )}
        </div>

        {/* Barcode Image & Human-readable text */}
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
