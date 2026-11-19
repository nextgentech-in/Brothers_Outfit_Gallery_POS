import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { deliveryDetails, deliveryFormats, type DeliveryFormat, type DeliveryOrder } from '../shared/printing';
import { readAdmin } from './adminApi';
import { printDocument, usePrintPreference } from './printing';

type Sender = { name: string; address: string; phone: string };
export function DeliverySticker({ order, onClose }: { order: DeliveryOrder; onClose: () => void }) {
  const details = deliveryDetails(order);
  const [paper, setPaper] = usePrintPreference<DeliveryFormat>('delivery', deliveryFormats, '4x6');
  const [sender, setSender] = useState<Sender | null>(null);
  const [copies, setCopies] = useState(1);
  const [name, setName] = useState(details.name), [phone, setPhone] = useState(details.phone);
  const [address, setAddress] = useState(details.lines.join('\n'));
  const [note, setNote] = useState('');
  const [printing, setPrinting] = useState(false), [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void readAdmin<Sender>('shop-details').then(data => { if (active) setSender(data); })
      .catch(() => { if (active) setError('Sender details could not load. Close and reopen the sticker to retry.'); });
    return () => { active = false; };
  }, []);
  const canPrint = Boolean(name.trim() && phone.trim() && address.trim() && sender?.name && sender.address);
  async function print() {
    if (!canPrint) return;
    setPrinting(true); setError('');
    try { await printDocument(); }
    catch (cause) { setError((cause as Error).message); }
    finally { setPrinting(false); }
  }
  return createPortal(<div className="editor-backdrop print-backdrop" onClick={onClose}>
    <div className="editor glass delivery-editor" role="dialog" aria-modal="true" aria-label={`Delivery sticker for ${order.id}`} onClick={event => event.stopPropagation()}>
      <div className="delivery-controls no-print">
        <div className="section-heading"><h2>Website delivery sticker</h2><button className="button secondary" type="button" onClick={onClose}>Close</button></div>
        <p>Order {order.id}. Address changes apply to this print only.</p>
        <div className="new-product-grid">
          <label>Sticker / paper size<select value={paper} onChange={event => setPaper(event.target.value as DeliveryFormat)}>{Object.entries(deliveryFormats).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>Copies<input type="number" min="1" max="20" step="1" value={copies} onChange={event => { const value = Number(event.target.value); setCopies(Number.isSafeInteger(value) ? Math.min(20, Math.max(1, value)) : 1); }} /></label>
          <label>Recipient name<input value={name} maxLength={160} onChange={event => setName(event.target.value)} /></label>
          <label>Recipient phone<input value={phone} maxLength={30} onChange={event => setPhone(event.target.value)} /></label>
          <label>Delivery address, including PIN code<textarea rows={4} value={address} maxLength={600} onChange={event => setAddress(event.target.value)} /></label>
          <label>Delivery note (optional)<textarea rows={2} value={note} maxLength={120} onChange={event => setNote(event.target.value)} /></label>
        </div>
        {!details.complete && <p role="status">Check and complete the recipient address before printing.</p>}
        {!details.waybill && <p role="status">This prints an address sticker with your order reference. A courier AWB appears once it has been assigned to the order.</p>}
        {!sender && !error && <p role="status">Loading sender details…</p>}
        {error && <p className="error-banner" role="alert">{error}</p>}
        <p className="print-help">Default: SEZNIK Shakti, 4 × 6 inches. Load matching labels, select the printer in the print dialog, use 100% scale, and turn headers and footers off.</p>
        <div className="section-heading"><button className="text-button" type="button" onClick={() => setPaper('4x6')}>Use shop default</button><button className="button primary" type="button" disabled={!canPrint || printing} onClick={() => void print()}><Printer size={17} />{printing ? 'Preparing sticker…' : `Print ${copies === 1 ? 'sticker' : `${copies} copies`}`}</button></div>
      </div>
      <div className="delivery-print-pages">
        {Array.from({ length: copies }, (_, index) => <article className={`delivery-sheet delivery-${paper}`} key={index}>
          <header className="delivery-label-header"><strong>{sender?.name || 'Loading sender…'}</strong><span>{order.courier || 'DELIVERY ADDRESS'}</span></header>
          <div className="delivery-order-ref">Order: <strong>{order.id}</strong></div>
          <section className="delivery-recipient"><span className="delivery-caption">SHIP TO</span><h2>{name || 'Recipient name required'}</h2><p className="delivery-address">{address || 'Delivery address required'}</p><strong>Phone: {phone || 'Required'}</strong></section>
          <div className="delivery-payment"><strong>{details.paymentLabel}</strong>{details.collect > 0 && <b>Collect ₹{details.collect.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>}</div>
          {note && <p className="delivery-note">{note}</p>}
          <div className="delivery-barcode"><span className="delivery-caption">{details.barcodeCaption}</span><img src={`/api/barcode/render?format=code128&code=${encodeURIComponent(details.barcode)}`} alt={details.barcode} /><strong>{details.barcode}</strong></div>
          <footer className="delivery-sender"><span className="delivery-caption">FROM / RETURN TO</span><strong>{sender?.name}</strong><p>{sender?.address}</p><span>{sender?.phone}</span></footer>
        </article>)}
      </div>
    </div>
  </div>, document.body);
}
