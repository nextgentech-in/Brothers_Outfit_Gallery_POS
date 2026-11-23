import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, DatabaseBackup, Download, Trash2 } from 'lucide-react';
import { readAdmin, writeAdmin } from './adminApi';

type Scope = 'customers' | 'products' | 'sales' | 'purchases';
const options: { id: Scope; title: string; detail: string }[] = [
  { id: 'customers', title: 'Customers', detail: 'Customer list, udhar/credit accounts, coins and WhatsApp messages.' },
  { id: 'products', title: 'Products & stock', detail: 'All products, sizes, prices, stock and stock history. Products also disappear from the website.' },
  { id: 'sales', title: 'Bills, dashboard & reports', detail: 'Shop bills, returns, refunds, expenses and day closings. Dashboard and reports start from zero.' },
  { id: 'purchases', title: 'Suppliers & purchases', detail: 'Suppliers, purchase orders, supplier payments and returns.' }
];
const pretty = (name: string) => name.replace(/^erp_/, '').replace(/([A-Z])/g, ' $1').toLowerCase();

export function DataReset() {
  const [selected, setSelected] = useState<Scope[]>([]);
  const [preview, setPreview] = useState<{ counts: Record<string, number>; total: number } | null>(null);
  const [backedUp, setBackedUp] = useState(false);
  const [confirm, setConfirm] = useState(''), [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [done, setDone] = useState('');
  const everything = selected.length === options.length;
  const scopes = useMemo(() => everything ? ['all'] : selected, [everything, selected]);

  useEffect(() => {
    setPreview(null);
    if (!scopes.length) return;
    const controller = new AbortController();
    readAdmin<{ counts: Record<string, number>; total: number }>(`backup/reset/preview?scopes=${scopes.join(',')}`, controller.signal)
      .then(setPreview).catch(e => { if ((e as Error).name !== 'AbortError') setError((e as Error).message); });
    return () => controller.abort();
  }, [scopes]);

  const toggle = (id: Scope) => { setDone(''); setError(''); setSelected(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id]); };
  const ready = scopes.length > 0 && backedUp && confirm === 'RESET' && /^\d{4}$/.test(pin) && !busy;

  async function reset() {
    if (!ready) return;
    setBusy(true); setError(''); setDone('');
    try {
      const result = await writeAdmin<{ total: number }>('backup/reset', { scopes, pin, confirm });
      setDone(`Reset complete. ${result.total} record${result.total === 1 ? '' : 's'} deleted.`);
      setSelected([]); setConfirm(''); setPin(''); setBackedUp(false);
    } catch (e) { setError((e as Error).message); setPin(''); }
    finally { setBusy(false); }
  }

  return <section className="glass table-panel data-reset">
    <header className="data-reset-head">
      <div className="data-reset-icon"><DatabaseBackup size={20} /></div>
      <div><h2>Backup & reset data</h2><p>Download a full backup, or clear only the part of the shop data you choose. Owner PIN required.</p></div>
    </header>
    {error && <p className="error-banner" role="alert">{error}</p>}
    {done && <p className="success-banner" role="status">{done}</p>}

    <ol className="data-reset-steps">
      <li>
        <h3>Choose what to reset</h3>
        <div className="data-reset-options">
          {options.map(option => <label key={option.id} className={`data-reset-option${selected.includes(option.id) ? ' active' : ''}`}>
            <input type="checkbox" checked={selected.includes(option.id)} onChange={() => toggle(option.id)} />
            <span><strong>{option.title}</strong><small>{option.detail}</small></span>
          </label>)}
        </div>
        <button type="button" className="text-button" onClick={() => { setDone(''); setSelected(everything ? [] : options.map(o => o.id)); }}>
          {everything ? 'Clear selection' : 'Select everything (full reset)'}</button>
        {scopes.length > 0 && <div className="data-reset-preview">
          {preview ? <><strong>{preview.total} record{preview.total === 1 ? '' : 's'} will be deleted</strong>
            <span>{Object.entries(preview.counts).filter(([, n]) => n > 0).map(([name, n]) => `${pretty(name)} ${n}`).join(' · ') || 'Nothing to delete'}</span></>
            : <span>Counting records…</span>}
        </div>}
        <p className="microcopy">Always kept: website customer accounts, online orders, staff, trusted devices and shop settings.</p>
      </li>
      <li>
        <h3>Download a backup first</h3>
        <a className="button secondary" href="/api/backup/export" download onClick={() => setBackedUp(true)}><Download size={16} />Download business backup</a>
        {backedUp ? <p className="microcopy data-reset-ok">Backup download started. Keep the file safe before continuing.</p>
          : <p className="microcopy">Reset stays locked until you download a backup.</p>}
      </li>
      <li>
        <h3>Confirm with owner PIN</h3>
        <div className="data-reset-confirm">
          <label>Type RESET<input value={confirm} onChange={e => setConfirm(e.target.value.toUpperCase())} placeholder="RESET" autoComplete="off" disabled={!scopes.length || !backedUp} /></label>
          <label>Owner PIN<input type="password" inputMode="numeric" maxLength={4} pattern="[0-9]{4}" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} autoComplete="off" disabled={!scopes.length || !backedUp} /></label>
          <button type="button" className="button danger" disabled={!ready} onClick={() => void reset()}><Trash2 size={16} />{busy ? 'Deleting…' : everything ? 'Reset everything' : 'Reset selected data'}</button>
        </div>
        {scopes.length > 0 && <p className="data-reset-warning"><AlertTriangle size={15} />This cannot be undone without the backup file.</p>}
      </li>
    </ol>
  </section>;
}
