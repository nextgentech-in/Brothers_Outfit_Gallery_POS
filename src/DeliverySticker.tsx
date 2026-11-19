import { createPortal } from 'react-dom';
import { useState } from 'react';
import { FileDown } from 'lucide-react';
import type { DeliveryOrder } from '../shared/printing';

export function DeliverySticker({ order, onClose }: { order: DeliveryOrder; onClose: () => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [downloaded, setDownloaded] = useState(false);
  const waybill = order.waybill || order.trackingNumber;
  async function download() {
    setBusy(true); setError(''); setDownloaded(false);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(order.id)}/shipping-label`, { credentials: 'same-origin' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || 'The courier label could not load. Try again.');
      }
      if (!response.headers.get('content-type')?.includes('application/pdf')) throw new Error('The courier did not return a PDF label.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url; link.download = `delhivery-${order.id}.pdf`; document.body.append(link);
      link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloaded(true);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  return createPortal(<div className="editor-backdrop" onClick={onClose}>
    <div className="editor glass" role="dialog" aria-modal="true" aria-label={`Courier label for ${order.id}`} onClick={event => event.stopPropagation()}>
      <div className="section-heading"><h2>Delhivery shipping label</h2><button className="button secondary" type="button" onClick={onClose}>Close</button></div>
      <p>Order: <strong>{order.id}</strong><br />AWB: <strong>{waybill || 'Not assigned yet'}</strong></p>
      <p>Download the original label from the delivery API. Open the PDF and print it on the SEZNIK Shakti using 4 × 6 inch paper and actual-size scaling. Other paper sizes and copy quantities are available in the PDF print dialog.</p>
      {!waybill && <p role="status">Create the shipment through the website's existing delivery option first. Its AWB is needed to retrieve the label.</p>}
      {error && <p className="error-banner" role="alert">{error}</p>}
      {downloaded && <p className="success-banner" role="status">Courier label downloaded. Open the PDF to preview and print.</p>}
      <button className="button primary" type="button" disabled={busy || !waybill} onClick={() => void download()}><FileDown size={17} />{busy ? 'Getting courier label…' : 'Download courier label'}</button>
    </div>
  </div>, document.body);
}
