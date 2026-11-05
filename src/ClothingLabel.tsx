export type ClothingDetails = { name: string; sku: string; brand?: string; design?: string; fabric?: string; gsl?: string; subCategory?: string; price?: number; mrp?: number };
export function ClothingLabel({ product, variant }: { product: ClothingDetails; variant: { size?: string; color?: string; price?: number; mrp?: number } }) {
  const money = (n?: number) => n && Number.isFinite(n) ? `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—';
  return <div className="clothing-label-details"><dl>{[
    ['BRAND', product.brand || '—'], ['DESIGN', product.design || product.sku], ['SIZE', variant.size || 'Standard'],
    ['ITEM', [product.name, product.subCategory].filter(Boolean).join(' · ')], ['FABRIC', product.fabric || product.gsl || '—'], ['COLOUR', variant.color || '—'],
    ['MRP', money(variant.mrp ?? product.mrp)], ['SALE PRICE', money(variant.price ?? product.price)]
  ].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div>;
}
