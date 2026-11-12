export type StockValueRow = {
  productId: string;
  product: string;
  sku: string;
  size: string;
  color: string;
  quantity: number;
  unitSellingPrice: number;
  gstPercent: number;
  baseValue: number;
  gstValue: number;
  totalValue: number;
};

type SourceVariant = { sku?: unknown; size?: unknown; color?: unknown; stock?: unknown; onHand?: unknown; quantity?: unknown; reserved?: unknown; salePrice?: unknown; price?: unknown };
type SourceProduct = { id: string; name?: unknown; sku?: unknown; stock?: unknown; onHand?: unknown; quantity?: unknown; reserved?: unknown; salePrice?: unknown; price?: unknown; gstEnabled?: unknown; gstPercent?: unknown; isDeleted?: unknown; isDemo?: unknown; preview?: unknown; isPreview?: unknown; isSample?: unknown; variants?: unknown };

const nonnegative = (value: unknown) => Math.max(0, Number(value || 0));
export function stockValue(quantity: number, unitSellingPrice: number, gstPercent: number) {
  const basePaise = Math.round(nonnegative(quantity) * nonnegative(unitSellingPrice) * 100);
  const gstPaise = Math.round(basePaise * nonnegative(gstPercent) / 100);
  return { baseValue: basePaise / 100, gstValue: gstPaise / 100, totalValue: (basePaise + gstPaise) / 100 };
}

export function stockValueRows(products: SourceProduct[]): StockValueRow[] {
  return products.flatMap(product => {
    if (product.isDeleted === true || product.isDemo === true || product.preview === true || product.isPreview === true || product.isSample === true) return [];
    const name = String(product.name || 'Unnamed product');
    const sku = String(product.sku || product.id);
    const searchable = `${product.id} ${name} ${sku}`.toLowerCase();
    if (searchable.includes('demo') || searchable.includes('preview') || searchable.includes('sample')) return [];
    const gstPercent = product.gstEnabled === true ? nonnegative(product.gstPercent) : 0;
    const variants = Array.isArray(product.variants) && product.variants.length ? product.variants as SourceVariant[] : [product as SourceVariant];
    return variants.map(variant => {
      const reserved = variant === product ? product.reserved : variant.reserved;
      const quantity = Math.max(0, Math.trunc(nonnegative(variant.stock ?? variant.onHand ?? variant.quantity ?? product.stock ?? product.onHand ?? product.quantity) - nonnegative(reserved)));
      const unitSellingPrice = nonnegative(variant.salePrice ?? variant.price ?? product.salePrice ?? product.price);
      return { productId: product.id, product: name, sku: String(variant.sku || sku), size: String(variant.size || ''), color: String(variant.color || ''), quantity,
        unitSellingPrice, gstPercent, ...stockValue(quantity, unitSellingPrice, gstPercent) };
    });
  });
}
