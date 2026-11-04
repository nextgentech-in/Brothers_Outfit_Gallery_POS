import { useEffect, useState } from 'react';
import { ArrowRight, ArrowDownUp, FileText, IndianRupee, Package, RefreshCw, ShoppingBag, Users } from 'lucide-react';
import type { DashboardSummary } from '../shared/contracts';

const money = (value: number) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export function Dashboard({ navigate }: { navigate: (tab: string) => void }) {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/dashboard', { credentials: 'same-origin', cache: 'no-store' });
      if (response.status === 401) { window.location.assign('/login'); return; }
      if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('The admin API is not connected on this deployment. Check its Vercel function and environment settings.');
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Dashboard data is unavailable.');
      setData(body as DashboardSummary);
    } catch (cause) { setError((cause as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const cards = [
    { label: 'Products', value: data?.products.toLocaleString('en-IN'), detail: `${data?.variants ?? '—'} variants`, icon: Package, tab: 'products' },
    { label: 'Available stock', value: data?.availableUnits.toLocaleString('en-IN'), detail: `${data?.outOfStock ?? '—'} out of stock`, icon: ArrowDownUp, tab: 'inventory' },
    { label: 'Stock retail value', value: data && money(data.stockRetailValue), detail: 'At current selling prices', icon: IndianRupee, tab: 'inventory' },
    { label: 'All orders', value: data?.orders.toLocaleString('en-IN'), detail: `${data?.pendingOrders ?? '—'} pending in recent orders`, icon: ShoppingBag, tab: 'orders' },
    { label: 'Recent order value', value: data && money(data.recentSales), detail: `From latest ${data?.sampledOrders ?? '—'} orders`, icon: IndianRupee, tab: 'reports' },
    { label: 'Customers', value: data?.customers.toLocaleString('en-IN'), detail: 'Website and shop records', icon: Users, tab: 'customers' }
  ];
  return <div className="dashboard">
    <div className="page-title"><div><span className="eyebrow">BROTHER'S OUTFIT GALLERY</span><h1>Dashboard</h1><p>Products, stock, sales and orders from your shared store database.</p></div><button className="button secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={18} />{loading ? 'Refreshing…' : 'Refresh'}</button></div>
    {error && <div className="error-banner" role="alert">{error}<button onClick={() => void load()}>Retry</button></div>}
    {!data && !error && <div className="notice" role="status">Loading your store dashboard…</div>}
    {data && <>
      {!data.businessWritesEnabled && <div className="notice" role="status">Review preview: live business writes are locked until the shared stock cutover is approved.</div>}
      <div className="dashboard-actions"><button className="button primary" onClick={() => navigate('pos')}><ShoppingBag size={18} />New bill</button><button className="button secondary" onClick={() => navigate('products')}><Package size={18} />Products</button><button className="button secondary" onClick={() => navigate('orders')}><FileText size={18} />View orders</button></div>
      <section className="dashboard-metrics" aria-label="Store metrics">{cards.map(card => <button className="glass dashboard-metric" key={card.label} onClick={() => navigate(card.tab)}><span><card.icon size={20} />{card.label}</span><strong>{card.value ?? '—'}</strong><small>{card.detail}</small></button>)}</section>
      <div className="dashboard-split"><section className="glass dashboard-panel"><div className="section-heading"><h2>Needs attention</h2><button className="text-button" onClick={() => navigate('inventory')}>Inventory <ArrowRight size={16} /></button></div><div className="dashboard-attention"><strong>{data.lowStock}</strong><span>products with 1–5 available</span><strong>{data.outOfStock}</strong><span>products out of stock</span><strong>{data.syncFailures}</strong><span>recent sync events needing review</span></div><div className="dashboard-stock-list">{data.lowStockItems.map(item => <div key={item.id}><span><strong>{item.name}</strong><small>{item.sku}</small></span><b className={item.available ? 'available' : 'unavailable'}>{item.available} left</b></div>)}{!data.lowStockItems.length && <p>Stock looks healthy.</p>}</div></section>
      <section className="glass dashboard-panel"><div className="section-heading"><h2>Order value by channel</h2><button className="text-button" onClick={() => navigate('reports')}>Reports <ArrowRight size={16} /></button></div><p className="dashboard-caption">Latest {data.sampledOrders} orders</p><div className="dashboard-channel"><span>Website</span><strong>{money(data.websiteSales)}</strong></div><div className="dashboard-channel"><span>POS</span><strong>{money(data.posSales)}</strong></div><div className="dashboard-channel total"><span>Total</span><strong>{money(data.recentSales)}</strong></div><p className="dashboard-caption">Excludes cancelled and returned orders; includes orders still processing. Full accounting is pending.</p></section></div>
      <section className="glass dashboard-panel dashboard-orders"><div className="section-heading"><h2>Recent orders</h2><button className="text-button" onClick={() => navigate('orders')}>All orders <ArrowRight size={16} /></button></div><div className="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Channel</th><th>Status</th><th>Total</th></tr></thead><tbody>{data.recentOrders.map(order => <tr key={order.id}><td><strong>{order.id}</strong><small>{order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-IN') : ''}</small></td><td>{order.customer}</td><td>{order.channel}</td><td>{order.status}</td><td>{money(order.total)}</td></tr>)}</tbody></table></div>{!data.recentOrders.length && <p>No orders yet.</p>}</section>
      <p className="dashboard-updated">Updated {new Date(data.checkedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</p>
    </>}
  </div>;
}
