import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDownLeft, ArrowUpRight, MessageCircle, Plus, RefreshCw, Search } from 'lucide-react';
import { readAdmin, writeAdmin } from './adminApi';
import { dueDateAfter, displayDueDate, type CreditCustomer, type CreditEntry } from '../shared/credit';
import { mobileNumber, shopDate } from '../shared/customers';

const money = (value: number) => `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
type Detail = { customer: CreditCustomer; entries: CreditEntry[] };
type FormMode = 'customer' | 'credit' | 'payment';

export function CreditDueFields({ value, onChange }: { value: string; onChange: (date: string) => void }) {
  const [days, setDays] = useState('custom');
  return <div className="credit-due-fields"><label>Return payment within<select aria-label="Return payment within" value={days} onChange={event => {
    setDays(event.target.value); if (event.target.value !== 'custom') onChange(dueDateAfter(Number(event.target.value)));
  }}><option value="custom">Choose a due date</option><option value="7">7 days</option><option value="15">15 days</option><option value="30">30 days</option></select></label>
    <label>Repayment due date<input type="date" required min={shopDate()} value={value} onChange={event => { setDays('custom'); onChange(event.target.value); }} /></label></div>;
}

function CreditForm({ mode, customer, onClose, onSaved }: { mode: FormMode; customer: CreditCustomer | null; onClose: () => void; onSaved: (key: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null), command = useRef<Record<string, unknown> | null>(null);
  const [date, setDate] = useState(dueDateAfter(7));
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState('');
  const title = mode === 'customer' ? 'Add credit customer' : mode === 'credit' ? 'You gave · Add udhar' : 'You received · Record payment';
  useEffect(() => { const el = dialog.current!, previous = document.activeElement; el.showModal(); return () => { el.close(); if (previous instanceof HTMLElement) previous.focus(); }; }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    if (!command.current) {
      const fields = new FormData(event.currentTarget);
      command.current = mode === 'customer' ? { requestId: crypto.randomUUID(), name: String(fields.get('name') || ''), phone: String(fields.get('phone') || ''),
        dateOfBirth: String(fields.get('dateOfBirth') || ''), openingAmount: Number(amount || 0), ...(Number(amount) > 0 ? { dueDate: date } : {}), creditWhatsAppOptIn: fields.get('notify') === 'on' }
        : { requestId: crypto.randomUUID(), customerKey: customer!.customerKey, kind: mode, amount: Number(amount), note: String(fields.get('note') || ''),
          ...(mode === 'credit' ? { dueDate: date } : { paymentMethod: fields.get('method') }) };
    }
    setBusy(true); setError('');
    try {
      const result = await writeAdmin<{ customerKey?: string }>(mode === 'customer' ? 'credit/customers' : 'credit/entries', command.current);
      onSaved(result.customerKey || customer!.customerKey);
    } catch (cause) {
      const status = (cause as { status?: number }).status;
      if (status && status < 500) { command.current = null; setUncertain(false); }
      else setUncertain(true);
      setError((cause as Error).message);
    } finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="credit-dialog glass" aria-label={title} onCancel={event => { event.preventDefault(); if (!busy && !uncertain) onClose(); }}>
    <form onSubmit={submit}><header><h2>{title}</h2><button type="button" className="icon-button" aria-label="Close credit form" disabled={busy || uncertain} onClick={onClose}>×</button></header>
      {customer && <p>{customer.name} · {customer.phone}<br />Outstanding: <strong className="credit-red">{money(customer.summary.balance)}</strong></p>}
      <fieldset disabled={busy || uncertain}>
        {mode === 'customer' && <><label>Customer name<input name="name" required maxLength={120} autoComplete="name" /></label><label>Mobile number<input name="phone" type="tel" inputMode="tel" required maxLength={20} placeholder="10-digit mobile or country code" /></label><label>Date of birth<input name="dateOfBirth" type="date" required min="1900-01-01" max={shopDate()} /></label></>}
        <label>{mode === 'customer' ? 'Opening udhar ₹ (optional)' : mode === 'credit' ? 'Credit given ₹' : 'Payment received ₹'}<input aria-label={mode === 'payment' ? 'Payment received amount' : 'Credit amount'} type="number" min={mode === 'customer' ? 0 : 0.01} max={mode === 'payment' ? customer?.summary.balance : 10000000} step="0.01" required={mode !== 'customer'} value={amount} onChange={event => setAmount(event.target.value)} /></label>
        {(mode === 'credit' || (mode === 'customer' && Number(amount) > 0)) && <CreditDueFields value={date} onChange={setDate} />}
        {mode === 'payment' && <label>Payment method<select name="method" aria-label="Payment method"><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option></select></label>}
        {mode !== 'customer' && <label>Note (optional)<input name="note" maxLength={300} placeholder="Bill reference or payment note" /></label>}
        {mode === 'customer' && <label className="check-row"><input name="notify" type="checkbox" />Customer agrees to automatic account, credit and payment updates on WhatsApp</label>}
      </fieldset>
      {error && <p className="error-banner" role="alert">{error}</p>}{uncertain && <p role="status">The result is unconfirmed. Retry the same entry to check it safely; its reference is retained.</p>}
      <footer><button type="button" className="button secondary" disabled={busy || uncertain} onClick={onClose}>Cancel</button><button className={`button ${mode === 'payment' ? 'credit-receive' : 'primary'}`} disabled={busy}>{busy ? 'Saving…' : uncertain ? 'Retry same entry' : mode === 'payment' ? 'Save payment' : mode === 'customer' ? 'Create customer' : 'Save credit'}</button></footer>
    </form></dialog>;
}

export function CreditView() {
  const [customers, setCustomers] = useState<CreditCustomer[]>([]), [selected, setSelected] = useState('');
  const [detailRevision, setDetailRevision] = useState(0);
  const [detail, setDetail] = useState<Detail | null>(null), [query, setQuery] = useState(''), [filter, setFilter] = useState('all');
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [loading, setLoading] = useState(false);
  const [writes, setWrites] = useState(false), [mode, setMode] = useState<FormMode | null>(null), [savingPreference, setSavingPreference] = useState(false);
  async function load() {
    setLoading(true); setError('');
    try { const [data, foundation] = await Promise.all([readAdmin<{ items: CreditCustomer[] }>('credit/customers'), readAdmin<{ businessWritesEnabled: boolean }>('foundation')]); setCustomers(data.items); setWrites(foundation.businessWritesEnabled);
      setDetailRevision(revision => revision + 1); }
    catch (cause) { setError((cause as Error).message); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    setDetail(null); if (!selected) return;
    let active = true;
    void readAdmin<Detail>(`credit/customers/${selected}`).then(data => { if (active) setDetail(data); }).catch(cause => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [selected, detailRevision]);
  async function saved(key: string) {
    setMode(null); setNotice('Credit ledger updated. Customer messages are listed in WhatsApp.');
    setSelected(key); await load();
  }
  const shown = customers.filter(customer => `${customer.name} ${customer.phone}`.toLowerCase().includes(query.toLowerCase()) &&
    (filter === 'all' || (filter === 'due' ? customer.summary.balance > 0 : filter === 'overdue' ? customer.summary.overdue > 0 : customer.summary.balance === 0)));
  const total = customers.reduce((sum, c) => sum + c.summary.balance, 0), received = customers.reduce((sum, c) => sum + c.summary.received, 0);
  return <div className="credit-page"><div className="page-title"><div><span className="eyebrow">CUSTOMER ACCOUNTS</span><h1>Udhar / Credit</h1><p>Track money given, payments received and promised repayment dates.</p></div><div className="credit-toolbar-actions"><button className="button secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={16} />Refresh</button><button className="button primary" disabled={!writes} onClick={() => setMode('customer')}><Plus size={17} />Add customer</button></div></div>
    {error && <div className="error-banner" role="alert">{error}</div>}{notice && <div className="success-banner" role="status">{notice}</div>}
    {!writes && <p className="notice">Credit changes require store activation.</p>}
    <div className="credit-totals"><div className="glass"><span>Customers owe you</span><strong className="credit-red">{money(total)}</strong></div><div className="glass"><span>Payments received</span><strong className="credit-green">{money(received)}</strong></div><div className="glass"><span>Overdue customers</span><strong className="credit-red">{customers.filter(c => c.summary.overdue > 0).length}</strong></div></div>
    <div className="credit-layout"><section className="glass table-panel"><div className="commerce-toolbar customer-toolbar"><label className="field-search"><Search size={16} /><input placeholder="Search name or mobile" value={query} onChange={event => setQuery(event.target.value)} /></label><select aria-label="Credit filter" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All customers</option><option value="due">Outstanding</option><option value="overdue">Overdue</option><option value="clear">Settled</option></select></div>
      <div className="credit-customer-list">{shown.map(customer => <button type="button" key={customer.customerKey} className={`credit-customer-row ${selected === customer.customerKey ? 'selected' : ''}`} onClick={() => setSelected(customer.customerKey)}><span><strong>{customer.name}</strong><small>{customer.phone}</small><small>{customer.summary.nextDueDate ? `Due ${displayDueDate(customer.summary.nextDueDate)}` : customer.summary.undated ? 'Due date not recorded' : 'No payment due'}</small></span><span className={customer.summary.balance > 0 ? 'credit-red' : 'credit-green'}><strong>{money(customer.summary.balance)}</strong><small>{customer.summary.overdue ? 'Overdue' : customer.summary.balance ? 'You will receive' : 'Settled'}</small></span></button>)}{!shown.length && <p className="empty-state">{loading ? 'Loading customer accounts…' : 'No customers match this filter.'}</p>}</div></section>
      <section className="glass table-panel credit-detail">{detail ? <><div className="credit-detail-heading"><div><h2>{detail.customer.name}</h2><p>{detail.customer.phone}</p></div><strong className={detail.customer.summary.balance ? 'credit-red' : 'credit-green'}>{money(detail.customer.summary.balance)}</strong></div>
        <div className="credit-entry-actions"><button className="button credit-give" disabled={!writes || detail.customer.profileAvailable === false} onClick={() => setMode('credit')}><ArrowUpRight size={17} />You gave · Add credit</button><button className="button credit-receive" disabled={!writes || detail.customer.profileAvailable === false || detail.customer.summary.balance <= 0} onClick={() => setMode('payment')}><ArrowDownLeft size={17} />You received · Payment</button></div>
        <label className="check-row credit-notify"><input type="checkbox" disabled={!writes || detail.customer.profileAvailable === false || savingPreference} checked={detail.customer.creditWhatsAppOptIn} onChange={async event => {
          const enabled = event.target.checked; setSavingPreference(true);
          try { await writeAdmin('credit/preferences', { requestId: crypto.randomUUID(), customerKey: detail.customer.customerKey, creditWhatsAppOptIn: enabled }); setDetail(current => current?.customer.customerKey === detail.customer.customerKey ? { ...current, customer: { ...current.customer, creditWhatsAppOptIn: enabled } } : current); }
          catch (cause) { setError((cause as Error).message); } finally { setSavingPreference(false); }
        }} />Customer agrees to automatic credit and payment updates on WhatsApp</label>
        {detail.customer.creditWhatsAppOptIn && mobileNumber(detail.customer.phone) && <a className="button secondary" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${mobileNumber(detail.customer.phone)}?text=${encodeURIComponent(`Hello ${detail.customer.name}, your Brothers Outfit Gallery balance is ${money(detail.customer.summary.balance)}. Repayment due: ${detail.customer.summary.nextDueDate || (detail.customer.summary.balance ? 'please contact the shop' : 'no payment due')}. Thank you.`)}`}><MessageCircle size={16} />Share balance manually</a>}
        {detail.customer.profileAvailable === false && <p className="error-banner">This older ledger has no customer profile. Restore the original customer details before recording payments.</p>}<h3>Transaction history</h3><div className="table-wrap"><table><thead><tr><th>Entry</th><th>You gave</th><th>You received / adjusted</th><th>Due date</th></tr></thead><tbody>{detail.entries.map(entry => <tr key={entry.id}><td><strong>{entry.kind === 'return' ? 'Return adjustment' : entry.creditDelta > 0 ? 'Credit given' : 'Payment received'}</strong><small>{entry.note || entry.invoiceId || entry.paymentMethod}</small><small>{entry.createdAt ? new Date(entry.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Earlier entry'}</small></td><td className="credit-red">{entry.creditDelta > 0 ? money(entry.creditDelta) : '—'}</td><td className="credit-green">{entry.creditDelta < 0 ? money(-entry.creditDelta) : '—'}</td><td>{entry.dueDate ? displayDueDate(entry.dueDate) : '—'}</td></tr>)}{!detail.entries.length && <tr><td colSpan={4}>No credit transactions yet.</td></tr>}</tbody></table></div>
        <p className="microcopy">Partial payments reduce the oldest outstanding credit first. Green return adjustments are separate from cash received.</p>
      </> : <p className="empty-state">{selected ? 'Loading ledger…' : 'Select a customer to view their udhar and record payments.'}</p>}</section></div>
    {mode && <CreditForm mode={mode} customer={detail?.customer || null} onClose={() => setMode(null)} onSaved={key => void saved(key)} />}
  </div>;
}
