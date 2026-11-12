import { useState, type FormEvent } from 'react';
import { writeAdmin } from './adminApi';

type StockVariant = { sku: string; size?: string; color?: string; stock?: number; onHand?: number; reorderThreshold?: number };
type StockProduct = { id: string; name: string; sku: string; stock: number; onHand?: number; reorderThreshold?: number; variants: StockVariant[] };

export function StockCount({ products, onSaved }: { products: StockProduct[]; onSaved: () => void }) {
  const [id, setId] = useState('');
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [thresholds, setThresholds] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const product = products.find(item => item.id === id);
  const variants = product ? product.variants.length ? product.variants : [{ sku: product.sku, stock: product.stock, onHand: product.onHand, reorderThreshold: product.reorderThreshold }] : [];
  const changed = variants.filter(variant => Number(counts[variant.sku] ?? (variant.onHand ?? variant.stock ?? 0)) !== Number(variant.onHand ?? variant.stock ?? 0) || Number(thresholds[variant.sku] ?? variant.reorderThreshold ?? 5) !== Number(variant.reorderThreshold ?? 5)).length;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!product || !changed) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await writeAdmin('inventory/count', {
        requestId: crypto.randomUUID(), productId: id,
        lines: variants.map(variant => ({
          sku: variant.sku, expected: variant.onHand ?? variant.stock ?? 0,
          counted: Number(counts[variant.sku] ?? (variant.onHand ?? variant.stock ?? 0)),
          threshold: Number(thresholds[variant.sku] ?? variant.reorderThreshold ?? 5)
        }))
      });
      setNotice('Stock count saved.'); setCounts({}); setThresholds({}); onSaved();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  return <section className="glass table-panel stock-count-panel">
    <div className="stock-count-heading"><div><span className="eyebrow">INVENTORY</span><h2>Count stock</h2><p>Choose a product, enter the physical quantity for each size or colour, and save.</p></div>{product && <span className="stock-count-change">{changed} change{changed === 1 ? '' : 's'}</span>}</div>
    <form onSubmit={event => void save(event)}>
      <label className="stock-count-picker">Product<select required value={id} onChange={event => { setId(event.target.value); setCounts({}); setThresholds({}); setNotice(''); }}><option value="">Choose a product</option>{products.map(item => <option key={item.id} value={item.id}>{item.name} · {item.sku}</option>)}</select></label>
      {product && <div className="stock-count-table-wrap"><table className="stock-count-table"><thead><tr><th>Size / colour</th><th>Current stock</th><th>Physical count</th><th>Reorder at</th></tr></thead><tbody>{variants.map(variant => <tr key={variant.sku}><td><strong>{[variant.size, variant.color].filter(Boolean).join(' / ') || 'Standard'}</strong><small>{variant.sku}</small></td><td>{variant.onHand ?? variant.stock ?? 0}</td><td><input aria-label={`Physical count for ${variant.sku}`} required type="number" min="0" step="1" value={counts[variant.sku] ?? (variant.onHand ?? variant.stock ?? 0)} onChange={event => setCounts(old => ({ ...old, [variant.sku]: event.target.value }))} /></td><td><input aria-label={`Reorder level for ${variant.sku}`} required type="number" min="0" step="1" value={thresholds[variant.sku] ?? variant.reorderThreshold ?? 5} onChange={event => setThresholds(old => ({ ...old, [variant.sku]: event.target.value }))} /></td></tr>)}</tbody></table></div>}
      <div className="stock-count-footer"><small>Count all physical units, including reserved stock. Refresh before counting after a sale.</small><button className="button primary" disabled={busy || !product || !changed}>{busy ? 'Saving…' : 'Save stock count'}</button></div>
    </form>
    {error && <p className="error-banner" role="alert">{error}</p>}{notice && <p className="success-banner" role="status">{notice}</p>}
  </section>;
}
