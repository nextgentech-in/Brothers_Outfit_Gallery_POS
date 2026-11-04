import { useEffect, useRef, useState, type FormEvent } from 'react';
import { customerDetailsError, mobileNumber, shopDate, type Customer } from '../shared/customers';

export type CustomerPhoneDetails = { phone: string; dateOfBirth: string; birthdayOffersOptIn: boolean };

export function CustomerPhoneDialog({ value, onSave, onClose }: {
  value: CustomerPhoneDetails; onSave: (value: CustomerPhoneDetails) => void; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const phoneInput = useRef<HTMLInputElement>(null);
  const [phone, setPhone] = useState(value.phone);
  const [dateOfBirth, setDateOfBirth] = useState(value.dateOfBirth);
  const [birthdayOffersOptIn, setBirthdayOffersOptIn] = useState(value.birthdayOffersOptIn);
  const [error, setError] = useState('');
  const [lookupMessage, setLookupMessage] = useState('');
  const editedBirthday = useRef(false);
  const editedOffers = useRef(false);
  const canonicalPhone = mobileNumber(phone);

  useEffect(() => {
    const element = dialog.current!;
    const previousFocus = document.activeElement;
    element.showModal();
    phoneInput.current?.focus();
    return () => {
      element.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    if (!canonicalPhone || (canonicalPhone === mobileNumber(value.phone) && value.dateOfBirth)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLookupMessage('Checking saved birthday…');
      try {
        const response = await fetch(`/api/customers/by-phone?phone=${encodeURIComponent(canonicalPhone)}`, {
          credentials: 'same-origin', signal: controller.signal
        });
        if (!response.ok) throw new Error('Lookup unavailable');
        const { customer } = await response.json() as { customer: Customer | null };
        if (controller.signal.aborted) return;
        if (customer?.dateOfBirth && !editedBirthday.current) setDateOfBirth(customer.dateOfBirth);
        if (customer && !editedOffers.current) setBirthdayOffersOptIn(customer.birthdayOffersOptIn);
        setLookupMessage(customer?.dateOfBirth ? 'Saved birthday found. Confirm it with the customer.' : 'Ask the customer for their date of birth.');
      } catch {
        if (!controller.signal.aborted) setLookupMessage('Saved details are unavailable. Enter the date of birth to continue.');
      }
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [canonicalPhone, value.phone, value.dateOfBirth]);

  function changePhone(next: string) {
    if (mobileNumber(next) !== canonicalPhone) {
      setDateOfBirth(''); setBirthdayOffersOptIn(false); setLookupMessage('');
      editedBirthday.current = false; editedOffers.current = false;
    }
    setError(''); setPhone(next);
  }

  function save(event: FormEvent) {
    event.preventDefault();
    const message = customerDetailsError(phone, dateOfBirth);
    if (message || !canonicalPhone) { setError(message || 'Enter a mobile number.'); return; }
    onSave({ phone: canonicalPhone, dateOfBirth, birthdayOffersOptIn });
  }

  return <dialog ref={dialog} className="customer-phone-dialog glass" aria-labelledby="customer-phone-title"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <form onSubmit={save}>
      <header><div><span className="eyebrow">CUSTOMER DETAILS</span><h2 id="customer-phone-title">Mobile number & birthday</h2></div>
        <button className="icon-button" type="button" aria-label="Close customer details" onClick={onClose}>×</button></header>
      <p>Ask for the customer’s date of birth when adding their mobile number. Birthdays appear in Customers for offer follow-ups.</p>
      <label>Mobile number<input ref={phoneInput} type="tel" inputMode="tel" autoComplete="tel" required maxLength={20}
        value={phone} onChange={event => changePhone(event.target.value)} placeholder="10-digit mobile or +country code" /></label>
      <label>Date of birth<input type="date" autoComplete="bday" required min="1900-01-01" max={shopDate()} value={dateOfBirth}
        onChange={event => { editedBirthday.current = true; setDateOfBirth(event.target.value); setError(''); }} /></label>
      {lookupMessage && <p className="microcopy" role="status">{lookupMessage}</p>}
      <label className="check-row"><input type="checkbox" checked={birthdayOffersOptIn} onChange={event => {
        editedOffers.current = true; setBirthdayOffersOptIn(event.target.checked);
      }} />Customer agrees to receive birthday offers on WhatsApp</label>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <footer><button type="button" className="button secondary" onClick={onClose}>Cancel</button>
        <button className="button primary" type="submit">Use customer details</button></footer>
    </form>
  </dialog>;
}
