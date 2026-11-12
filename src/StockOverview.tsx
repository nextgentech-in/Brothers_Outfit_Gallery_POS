type StockOverviewProps = {
  productCount: number;
  units: number;
  beforeGst: number;
  gst: number;
  includingGst: number;
};

const money = (value: number) => `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function StockOverview({ productCount, units, beforeGst, gst, includingGst }: StockOverviewProps) {
  return <section className="stock-overview" aria-label="Current stock valuation">
    <div className="stock-overview-heading"><div><span className="eyebrow">LIVE INVENTORY</span><h2>Stock at a glance</h2></div><span>GST is included in stock value and tax reporting, not added to retail bills.</span></div>
    <div className="stock-overview-grid">
      <div className="stock-overview-card"><span>Available stock</span><strong>{units.toLocaleString('en-IN')} units</strong><small>{productCount.toLocaleString('en-IN')} products</small></div>
      <div className="stock-overview-card"><span>Stock value before GST</span><strong>{money(beforeGst)}</strong><small>Available stock at selling price</small></div>
      <div className="stock-overview-card"><span>GST on stock</span><strong>{money(gst)}</strong><small>Only GST enabled products</small></div>
      <div className="stock-overview-card stock-overview-total"><span>Total stock value with GST</span><strong>{money(includingGst)}</strong><small>Before GST + GST on stock</small></div>
    </div>
  </section>;
}
