import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import { mobileNumber, type Customer } from '../shared/customers';

/** Pre-defined message templates that auto-fill the message body. */
const MESSAGE_TYPES = [
  { id: 'birthday', label: '🎂 Birthday Wish',
    build: (c: Customer) =>
      `Hi${c.fullName ? ` ${c.fullName}` : ''}, wishing you a very Happy Birthday from Brothers Outfit Gallery! 🎉🎂\nVisit us today to check out our special birthday offers made just for you.` },
  { id: 'new_arrival', label: '🆕 New Arrival',
    build: (c: Customer) =>
      `Hi${c.fullName ? ` ${c.fullName}` : ''}, exciting new arrivals just landed at Brothers Outfit Gallery! 🛍️\nDrop by our store or contact us to explore the latest collection.` },
  { id: 'festival_offer', label: '🎊 Festival / Sale Offer',
    build: (c: Customer) =>
      `Hi${c.fullName ? ` ${c.fullName}` : ''}, festive season is here! 🎊\nBrothers Outfit Gallery has special offers waiting for you. Visit us and grab the best deals before they're gone!` },
  { id: 'payment_reminder', label: '💳 Payment Reminder',
    build: (c: Customer) =>
      `Hi${c.fullName ? ` ${c.fullName}` : ''}, this is a friendly reminder from Brothers Outfit Gallery regarding your pending payment.\nPlease visit us or contact us at your earliest convenience. Thank you!` },
  { id: 'thank_you', label: '🙏 Thank You',
    build: (c: Customer) =>
      `Hi${c.fullName ? ` ${c.fullName}` : ''}, thank you for shopping with Brothers Outfit Gallery! 🙏\nWe truly appreciate your visit. Looking forward to serving you again soon.` },
  { id: 'custom', label: '✏️ Custom Message',
    build: (c: Customer) =>
      `Hi${c.fullName ? ` ${c.fullName}` : ''}, ` },
] as const;

export function WhatsAppMessageDialog({ customer, onClose }: {
  customer: Customer;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selectedType, setSelectedType] = useState('');
  const [message, setMessage] = useState('');
  const phone = mobileNumber(customer.phone);

  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  function selectType(typeId: string) {
    setSelectedType(typeId);
    const template = MESSAGE_TYPES.find(t => t.id === typeId);
    if (template) setMessage(template.build(customer));
  }

  function openWhatsApp() {
    if (!phone || !message.trim()) return;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message.trim())}`, '_blank', 'noopener,noreferrer');
  }

  return <dialog ref={dialog} className="whatsapp-msg-dialog glass" aria-labelledby="wa-msg-title"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <form onSubmit={event => { event.preventDefault(); openWhatsApp(); }}>
      <header>
        <div><span className="eyebrow">WHATSAPP MESSAGE</span>
          <h2 id="wa-msg-title"><MessageCircle size={20} /> Send to {customer.fullName || customer.phone}</h2>
        </div>
        <button className="icon-button" type="button" aria-label="Close" onClick={onClose}>×</button>
      </header>

      {!phone && <div className="error-banner" role="alert">This customer has no valid mobile number.</div>}

      <label>Choose message type
        <select value={selectedType} onChange={e => selectType(e.target.value)} required>
          <option value="">— Select a message type —</option>
          {MESSAGE_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </label>

      {selectedType && <>
        <label>Message preview
          <textarea rows={6} value={message} onChange={e => setMessage(e.target.value)}
            placeholder="Type your message here…" required />
        </label>
        <p className="microcopy">Edit the message above if needed. Clicking "Open WhatsApp" will open a new tab with this message pre-filled. You review and tap Send in WhatsApp.</p>
      </>}

      <footer>
        <button type="button" className="button secondary" onClick={onClose}>Cancel</button>
        <button className="button primary wa-send-btn" type="submit" disabled={!phone || !message.trim() || !selectedType}>
          <Send size={15} /> Open WhatsApp
        </button>
      </footer>
    </form>
  </dialog>;
}

