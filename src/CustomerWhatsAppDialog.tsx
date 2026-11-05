import { localizedDraft, type DraftLanguage } from '../shared/whatsappDraft';
import { readAdmin } from './adminApi';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MessageCircle, RefreshCw } from 'lucide-react';
import { mobileNumber, type Customer } from '../shared/customers';
import { displayDueDate } from '../shared/credit';

type MessageKind = '' | 'offer' | 'birthday' | 'payment' | 'thanks' | 'custom';

export function CustomerWhatsAppDialog({ customer, shopName, onClose, initialCredit }: {
  customer: Customer; shopName: string; onClose: () => void; initialCredit?: { balance: number; nextDueDate: string | null };
}) {
  const dialog = useRef<HTMLDialogElement>(null), typeInput = useRef<HTMLSelectElement>(null);
  const [language,setLanguage]=useState<DraftLanguage>(()=>(localStorage.getItem('whatsapp-draft-language') as DraftLanguage)||'en');
  const [kind, setKind] = useState<MessageKind>(initialCredit ? 'payment' : '');
  const [details, setDetails] = useState(''), [amount, setAmount] = useState(initialCredit ? String(initialCredit.balance) : ''), [date, setDate] = useState(initialCredit?.nextDueDate || '');
  const [credit, setCredit] = useState(initialCredit);
  useEffect(() => { if (!initialCredit && customer.customerKey) void readAdmin<any>(`credit/customers/${customer.customerKey}`).then(data => setCredit(data.customer.summary)).catch(() => {}); }, []);
  const [editedMessage, setEditedMessage] = useState<string | null>(null);
  const [error, setError] = useState(''), [openedUrl, setOpenedUrl] = useState('');
  const phone = mobileNumber(customer.phone), name = customer.fullName.trim() || 'Customer';
  const shop = shopName.trim() || 'Brothers Outfit Gallery';
  const amountText = Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const draft = kind === 'offer' ? [
    `Hello ${name},`, `A special offer from ${shop}:`, details.trim(),
    date ? `Offer valid until ${displayDueDate(date)}.` : '', 'Visit us or reply to know more.'
  ].filter(Boolean).join('\n\n') : kind === 'birthday' ? [
    `Happy birthday, ${name}! 🎉`, `Wishing you a wonderful day from all of us at ${shop}.`, details.trim()
  ].filter(Boolean).join('\n\n') : kind === 'payment' ? [
    `Hello ${name},`, `A payment reminder from ${shop}.`,
    amount ? `Amount due: ₹${amountText}` : '', date ? `Repayment due: ${displayDueDate(date)}` : '',
    details.trim(), 'If you have already paid, please let us know. Thank you.'
  ].filter(Boolean).join('\n\n') : kind === 'thanks' ? [
    `Hello ${name},`, `Thank you for shopping at ${shop}!`, details.trim(), 'We look forward to seeing you again.'
  ].filter(Boolean).join('\n\n') : '';
  const message = editedMessage ?? (language==='en'?draft:localizedDraft(language,kind,name,shop,amount?amountText:'',date?displayDueDate(date):'',details.trim()));
  const detailsLabel = kind === 'offer' ? 'Offer details' : kind === 'birthday' ? 'Birthday message or offer (optional)' : 'Additional note (optional)';
  useEffect(() => { setOpenedUrl(''); }, [message]);

  useEffect(() => {
    const element = dialog.current!, previous = document.activeElement;
    element.showModal(); typeInput.current?.focus();
    return () => { element.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);

  function openWhatsApp(event: FormEvent) {
    event.preventDefault(); setError('');
    if (!phone) { setError('This customer needs a valid mobile number before sharing.'); return; }
    if (!kind || !message.trim()) { setError('Choose a message type and write a message.'); return; }
    if (message.length > 4000) { setError('Keep the message within 4,000 characters.'); return; }
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(message.trim())}`;
    // Only opens a draft. The shopkeeper presses Send in their own WhatsApp account.
    window.open(url, '_blank', 'noopener,noreferrer'); setOpenedUrl(url);
  }

  return <dialog ref={dialog} className="whatsapp-compose-dialog glass" aria-labelledby="whatsapp-compose-title"
    onCancel={event => { event.preventDefault(); onClose(); }}>
    <form onSubmit={openWhatsApp}>
      <header><div><span className="eyebrow">PREPARE A MESSAGE</span><h2 id="whatsapp-compose-title">Message on WhatsApp</h2></div>
        <button type="button" className="icon-button" aria-label="Close WhatsApp message" onClick={onClose}>×</button></header>
      <div className="whatsapp-recipient"><MessageCircle size={22} /><div><strong>{name}</strong><span>{phone ? `+${phone}` : 'Mobile number unavailable'}</span></div><span className="source-tag">Manual send</span></div>
      <p>Choose a message type and fill in the details. We write the draft; you review it and tap Send in WhatsApp.</p>
      <label>Language<select aria-label="Message language" value={language} onChange={e=>{setLanguage(e.target.value as DraftLanguage);localStorage.setItem('whatsapp-draft-language',e.target.value);}}><option value="en">English</option><option value="hi">हिन्दी</option><option value="gu">ગુજરાતી</option></select></label><label>Message type<select ref={typeInput} aria-label="Message type" required value={kind} onChange={event => {
        setKind(event.target.value as MessageKind); setDetails(''); setAmount(event.target.value === 'payment' && credit ? String(credit.balance) : ''); setDate(event.target.value === 'payment' ? credit?.nextDueDate || '' : '');
        setEditedMessage(null); setError(''); setOpenedUrl('');
      }}><option value="">Choose message type</option><option value="offer">Offer / promotion</option><option value="birthday">Birthday wishes</option>
        <option value="payment">Payment / udhar reminder</option><option value="thanks">Thank-you message</option><option value="custom">Custom message</option></select></label>
      {kind === 'payment' && <div className="whatsapp-compose-fields"><label>Amount due ₹<input type="number" min="0.01" max="10000000" step="0.01" required value={amount} onChange={event => setAmount(event.target.value)} /></label>
        <label>Repayment due date<input type="date" required value={date} onChange={event => setDate(event.target.value)} /></label></div>}
      {kind && kind !== 'custom' && <label>{detailsLabel}
        <textarea aria-label={detailsLabel} rows={2} required={kind === 'offer'} maxLength={1000} value={details} onChange={event => setDetails(event.target.value)} placeholder={kind === 'offer' ? 'For example: 15% off shirts this weekend' : 'Add a personal note'} /></label>}
      {kind && kind!=='custom' && <div><button type="button" className="text-button" onClick={()=>{localStorage.setItem(`whatsapp-note-${kind}-${language}`,details);setError('Shop note saved on this device.');}}>Save note as shop template</button><button type="button" className="text-button" onClick={()=>{setDetails(localStorage.getItem(`whatsapp-note-${kind}-${language}`)||'');setEditedMessage(null);}}>Use saved shop note</button></div>}
      {kind === 'offer' && <label>Offer valid until (optional)<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>}
      {kind && <><div className="whatsapp-preview-heading"><span>Review your message</span>{kind !== 'custom' && <button type="button" className="text-button" onClick={() => setEditedMessage(null)}><RefreshCw size={14} />Rewrite from fields</button>}</div>
        {editedMessage !== null && kind !== 'custom' && <p className="microcopy">Your edited text is kept. Use Rewrite from fields to include any new field values.</p>}
        <label className="whatsapp-message-label">Message<textarea aria-label="Message" className="whatsapp-message-preview" rows={7} required maxLength={4000} value={message} onChange={event => { setEditedMessage(event.target.value); setError(''); }} /></label>
        <small className="whatsapp-character-count">{message.length.toLocaleString('en-IN')} / 4,000 characters</small></>}
      {error && <p className="error-banner" role="alert">{error}</p>}
      {openedUrl && <p className="notice" role="status">Continue in WhatsApp and tap Send. If it did not open, <a href={openedUrl} target="_blank" rel="noopener noreferrer">open the prepared message again</a>.</p>}
      <footer><button type="button" className="button secondary" onClick={onClose}>Cancel</button>
        <button type="submit" className="button whatsapp-send" disabled={!phone || !kind}><MessageCircle size={17} />Send · Open WhatsApp</button></footer>
      <p className="microcopy">Uses the WhatsApp account signed in on this device. No WhatsApp API connection is needed.</p>
    </form>
  </dialog>;
}
