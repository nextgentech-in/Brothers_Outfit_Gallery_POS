import { useEffect, useRef, useState } from 'react';
import { readAdmin, writeAdmin } from './adminApi';
import type { Customer } from '../shared/customers';

export function CustomerCoinDialog({ onClose, canReset = true }: { onClose: () => void; canReset?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [customers, setCustomers] = useState<Customer[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [resetting, setResetting] = useState(''), [notice, setNotice] = useState('');
  async function resetCoins(customer: Customer) {
    const name = customer.fullName || customer.phone;
    if (!window.confirm(`Reset ${(customer.coinBalance || 0).toLocaleString('en-IN')} coins for ${name} to 0? This cannot be undone.`)) return;
    setResetting(customer.id); setError(''); setNotice('');
    try {
      await writeAdmin('customers/coins/reset', { requestId: crypto.randomUUID(), phone: customer.phone });
      setCustomers(list => list.filter(item => item.id !== customer.id));
      setNotice(`Coins reset to 0 for ${name}.`);
    } catch (reason) { setError((reason as Error).message); }
    finally { setResetting(''); }
  }
  useEffect(() => {
    const element = dialog.current!, previous = document.activeElement;
    element.showModal();
    let active = true;
    void readAdmin<{ items: Customer[] }>('customers').then(data => {
      if (active) setCustomers(data.items.filter(customer => (customer.coinBalance || 0) > 0)
        .sort((a, b) => (b.coinBalance || 0) - (a.coinBalance || 0) || a.fullName.localeCompare(b.fullName)));
    }).catch(reason => { if (active) setError((reason as Error).message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; element.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={dialog} className="whatsapp-compose-dialog glass" aria-labelledby="customer-coins-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <div style={{ padding: 24 }}>
    <header><h2 id="customer-coins-title">Top customer coins</h2><button type="button" className="icon-button" aria-label="Close customer coins" onClick={onClose}>×</button></header>
    <p>Customers ranked by accumulated coins. Coins do not reduce bill amounts.</p>
    {loading && <p role="status">Loading customer coins…</p>}
    {error && <p role="alert" className="error-banner">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!loading && <div className="table-wrap"><table><thead><tr><th>Rank</th><th>Customer</th><th>Mobile</th><th>Coins</th>{canReset && <th>Action</th>}</tr></thead><tbody>
      {customers.slice(0, 50).map((customer, index) => <tr key={customer.id}><td>{index + 1}</td><td>{customer.fullName || 'Customer'}</td><td>{customer.phone}</td><td>{customer.coinBalance?.toLocaleString('en-IN')}</td>{canReset && <td><button type="button" className="button secondary sm" disabled={resetting === customer.id} onClick={() => void resetCoins(customer)}>{resetting === customer.id ? 'Resetting…' : 'Reset'}</button></td>}</tr>)}
      {!customers.length && <tr><td colSpan={canReset ? 5 : 4}>No customer coins earned yet.</td></tr>}
    </tbody></table>{customers.length > 50 && <small>Showing the 50 highest balances. View all balances in Customers.</small>}</div>}
    <footer><button type="button" className="button secondary" onClick={onClose}>Close</button></footer>
    </div>
  </dialog>;
}
