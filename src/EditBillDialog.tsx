import { useEffect, useRef, useState, type FormEvent } from 'react';
import { priceBillLine, setBillTotal, billPaise, type BillPricing } from '../shared/billPricing';
import { writeAdmin } from './adminApi';

type EditableReceipt = {
  id: string;
  revision?: number;
  total: number;
  customerName?: string;
  lines: { name?: string; sku?: string; quantity: number; price: number; discount?: number; amount?: number }[];
};

export function EditBillDialog({ orderId, invoice, canChangeTotal, onClose, onSaved }: {
  orderId: string;
  invoice: EditableReceipt;
  canChangeTotal: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [lines, setLines] = useState(() => setBillTotal(invoice.lines.map(line => priceBillLine(
    line.quantity, line.price, line.amount ?? line.price * line.quantity - (line.discount ?? 0), 'amount'
  )), invoice.total));
  const [name, setName] = useState(invoice.customerName ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const storageKey = 'bill-edit-' + invoice.id;
  const [pending, setPending] = useState(() => localStorage.getItem(storageKey));
  const total = lines.reduce((sum, line) => sum + billPaise(line.amount), 0) / 100;
  const gross = lines.reduce((sum, line) => sum + billPaise(line.mrp) * line.quantity, 0) / 100;

  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);

  function changeLine(index: number, field: 'mrp' | 'salePrice' | 'discountPercent' | 'amount', value: number) {
    setLines(previous => previous.map((line, i) => {
      if (i !== index) return line;
      if (field === 'mrp') return priceBillLine(line.quantity, value, line.amount, 'amount');
      const basis = field === 'salePrice' ? 'price' : field === 'discountPercent' ? 'percent' : 'amount';
      return priceBillLine(line.quantity, line.mrp, value, basis);
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const command = pending ?? JSON.stringify({
        requestId: crypto.randomUUID(), orderId, invoiceId: invoice.id, revision: invoice.revision ?? 0,
        customerName: name, lines: lines.map(({ mrp, amount }) => ({ mrp, amount }))
      });
      localStorage.setItem(storageKey, command);
      setPending(command);
      await writeAdmin('orders/edit-bill', JSON.parse(command));
      localStorage.removeItem(storageKey);
      onSaved();
    } catch (cause) {
      const error = cause as Error & { status?: number };
      if ([400, 401, 403, 404, 409, 422].includes(error.status ?? 0)) {
        localStorage.removeItem(storageKey);
        setPending(null);
      }
      setError(error.message);
    } finally {
      setBusy(false);
    }
  }

  const fields: { key: keyof Pick<BillPricing, 'mrp' | 'salePrice' | 'discountPercent' | 'amount'>; label: string }[] = [
    { key: 'mrp', label: 'MRP / piece' }, { key: 'salePrice', label: 'Customer price / piece' },
    { key: 'discountPercent', label: 'Discount %' }, { key: 'amount', label: 'Line total' }
  ];

  return <dialog ref={dialog} className="credit-dialog glass return-dialog edit-bill-dialog" aria-labelledby="edit-bill-title"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={submit}>
      <header><h2 id="edit-bill-title">Edit bill {invoice.id}</h2></header>
      <fieldset disabled={busy || Boolean(pending)}>
        <label>Customer name<input maxLength={120} value={name} onChange={event => setName(event.target.value)} /></label>
        <div className="table-wrap"><table>
          <thead><tr><th>Product</th><th>Qty</th>{fields.map(field => <th key={field.key}>{field.label}</th>)}</tr></thead>
          <tbody>{lines.map((line, index) => <tr key={index}>
            <td>{invoice.lines[index].name || invoice.lines[index].sku}</td>
            <td>{line.quantity}</td>
            {fields.map(field => <td key={field.key}><input type="number" min="0" step="0.01"
              aria-label={field.label + ', line ' + (index + 1)} value={line[field.key]}
              onChange={event => changeLine(index, field.key, Number(event.target.value))} /></td>)}
          </tr>)}</tbody>
        </table></div>
        <label>Total amount ₹<input type="number" min="0.01" max={gross} step="0.01" value={total}
          disabled={!canChangeTotal} onChange={event => setLines(previous => setBillTotal(previous, Number(event.target.value)))} /></label>
        {canChangeTotal && total !== invoice.total && <p>Original payment total ₹{invoice.total.toFixed(2)}. Save after reconciling the difference with the customer.</p>}
        {!canChangeTotal && <p>Split payment and udhar bills must keep their original total.</p>}
      </fieldset>
      {error && <p className="error-banner" role="alert">{error}</p>}
      {pending && <p>Retry the saved changes to confirm the previous result.</p>}
      <footer><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Close</button>
        <button className="button primary" disabled={busy || (!pending && !canChangeTotal && total !== invoice.total)}>
          {busy ? 'Saving…' : pending ? 'Retry saved changes' : 'Save changes'}
        </button></footer>
    </form>
  </dialog>;
}
