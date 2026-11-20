import { createPortal } from 'react-dom';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { mobileNumber } from '../shared/customers';

export type WhatsAppDraft = { name: string; phone: string; message: string };
export function WhatsAppDraftDialog({ draft, onClose }: { draft: WhatsAppDraft; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null), input = useRef<HTMLTextAreaElement>(null);
  const [message, setMessage] = useState(draft.message), [error, setError] = useState(''), [preparedUrl, setPreparedUrl] = useState('');
  const phone = mobileNumber(draft.phone);
  useEffect(() => {
    const element = dialog.current!, previous = document.activeElement;
    element.showModal(); input.current?.focus();
    return () => { element.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  function prepare(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!phone) { setError('A valid customer mobile number is required.'); return; }
    if (!message.trim() || message.length > 4000) { setError('Enter a message of up to 4,000 characters.'); return; }
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message.trim())}`;
    window.open(url, '_blank', 'noopener,noreferrer'); setPreparedUrl(url);
  }
  return createPortal(<dialog ref={dialog} className="whatsapp-compose-dialog glass" aria-labelledby="editable-whatsapp-title" onClick={event => event.stopPropagation()} onCancel={event => { event.preventDefault(); onClose(); }}>
    <form onSubmit={prepare}>
      <header><h2 id="editable-whatsapp-title">Edit WhatsApp draft</h2><button type="button" className="icon-button" aria-label="Close WhatsApp draft" onClick={onClose}>×</button></header>
      <p>{draft.name || 'Customer'} · {phone ? `+${phone}` : 'Mobile number unavailable'}</p>
      <label>Message<textarea ref={input} aria-label="WhatsApp draft message" rows={8} required maxLength={4000} value={message} onChange={event => { setMessage(event.target.value); setError(''); setPreparedUrl(''); }} /></label>
      <small>{message.length} / 4,000 characters</small>
      {error && <p className="error-banner" role="alert">{error}</p>}
      {preparedUrl && <p role="status">Draft opened in WhatsApp. Review it there and tap Send. <a href={preparedUrl} target="_blank" rel="noopener noreferrer">Open draft again</a></p>}
      <footer><button type="button" className="button secondary" onClick={() => { setMessage(draft.message); setPreparedUrl(''); }}>Reset draft</button><button type="submit" className="button whatsapp-send" disabled={!phone}>Open edited draft in WhatsApp</button></footer>
    </form>
  </dialog>, document.body);
}
