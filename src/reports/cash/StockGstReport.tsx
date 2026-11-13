import { useEffect, useState } from 'react';
import { readAdmin } from '../../adminApi';
import { downloadCsv, formatINR } from '../shared/exportUtils';
import type { StockValueRow } from '../../../shared/stockGst';

type Report = {
  checkedAt: string;
  summary: { products: number; gstProducts: number; units: number; baseValue: number; gstValue: number; totalValue: number };
  items: StockValueRow[];
};

export function StockGstReport() {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  async function load() {
    setLoading(true); setError('');
    try { setReport(await readAdmin<Report>('reports/stock-gst')); }
    catch (cause) { setError((cause as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  const summary = report?.summary;
  return <section className="stock-gst-report">
    <header className="stock-gst-report-header"><div><span className="eyebrow">STOCK & TAX</span><h1>GST stock valuation</h1><p>Current available stock, valued at cost price. GST is calculated on cost for reporting and is not added to retail bills.</p></div><div><button type="button" className="button secondary" disabled={loading} onClick={() => void load()}>Refresh</button><button type="button" className="button secondary" disabled={!report} onClick={() => report && downloadCsv('gst-stock-valuation', ['Product', 'SKU', 'Size', 'Colour', 'Qty', 'Cost price', 'GST %', 'Value without GST', 'GST value', 'Value with GST'], report.items.map(row => [row.product, row.sku, row.size, row.color, row.quantity, row.unitCostPrice, row.gstPercent, row.baseValue, row.gstValue, row.totalValue]))}>Export CSV</button></div></header>
    {error && <div className="error-banner" role="alert">{error}</div>}
    <div className="stock-summary glass"><div><span>Total products</span><strong>{summary?.products ?? '—'}</strong></div><div><span>Value without GST</span><strong>{summary ? formatINR(summary.baseValue) : '—'}</strong></div><div><span>GST value</span><strong>{summary ? formatINR(summary.gstValue) : '—'}</strong></div><div><span>Total with GST</span><strong>{summary ? formatINR(summary.totalValue) : '—'}</strong></div></div>
    <div className="glass table-panel"><h2>GST-enabled products</h2><p>{summary ? `${summary.gstProducts} products · ${summary.units} available units across all products` : loading ? 'Loading stock…' : 'No stock data loaded.'}</p><div className="table-wrap"><table><thead><tr><th>Product / SKU</th><th>Size / Colour</th><th>Qty</th><th>Cost price</th><th>GST %</th><th>Without GST</th><th>GST value</th><th>With GST</th></tr></thead><tbody>{report?.items.map(row => <tr key={`${row.productId}:${row.sku}`}><td><strong>{row.product}</strong><small>{row.sku}</small></td><td>{[row.size, row.color].filter(Boolean).join(' / ') || 'Standard'}</td><td>{row.quantity}</td><td>{formatINR(row.unitCostPrice)}</td><td>{row.gstPercent}%</td><td>{formatINR(row.baseValue)}</td><td>{formatINR(row.gstValue)}</td><td><strong>{formatINR(row.totalValue)}</strong></td></tr>)}</tbody></table></div>{report && report.items.length === 0 && <p>No GST-enabled products have available stock.</p>}{report && <small>Updated {new Date(report.checkedAt).toLocaleString('en-IN')}</small>}</div>
  </section>;
}
