import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowDownLeft, Check, CheckCircle2, Search, User, Wallet } from 'lucide-react';
import { writeAdmin } from './adminApi';
import type { CreditCustomer } from '../shared/credit';

const money = (value: number) => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function PaymentInDialog({ customers, preselectedKey, onClose, onSaved }: {
  customers: CreditCustomer[];
  preselectedKey?: string;
  onClose: () => void;
  onSaved: (customerKey: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState(preselectedKey || '');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'upi' | 'card'>('cash');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const el = dialog.current!;
    const previous = document.activeElement;
    el.showModal();
    return () => {
      el.close();
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  const selectedCustomer = customers.find(c => c.customerKey === selectedKey) || null;

  // Filter customers with search
  const filteredCustomers = customers.filter(c =>
    `${c.name} ${c.phone}`.toLowerCase().includes(search.toLowerCase())
  );

  const numAmount = Number(amount) || 0;
  const currentBalance = selectedCustomer?.summary.balance ?? 0;
  const remainingBalance = Math.max(0, currentBalance - numAmount);
  const isOverpaying = numAmount > currentBalance;
  const isCompleteSettlement = numAmount > 0 && numAmount === currentBalance;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedCustomer) {
      setError('Please search and select a customer.');
      return;
    }
    if (numAmount <= 0) {
      setError('Enter a valid payment amount greater than ₹0.');
      return;
    }
    if (isOverpaying) {
      setError(`Payment cannot exceed the outstanding balance of ${money(currentBalance)}.`);
      return;
    }

    setBusy(true);
    setError('');
    try {
      await writeAdmin('credit/entries', {
        requestId: crypto.randomUUID(),
        customerKey: selectedCustomer.customerKey,
        kind: 'payment',
        amount: numAmount,
        paymentMethod: method,
        note: note.trim()
      });
      onSaved(selectedCustomer.customerKey);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="credit-dialog payment-in-dialog glass"
      aria-label="Payment In"
      onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}
      onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}
    >
      <form onSubmit={submit}>
        <header>
          <div>
            <span className="eyebrow">UDHAR / CREDIT PAYMENT</span>
            <h2><ArrowDownLeft size={22} className="credit-green" /> Payment In</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close" disabled={busy} onClick={onClose}>×</button>
        </header>

        <p className="microcopy">Search customer, enter the amount received, and review remaining balance before recording.</p>

        {/* Customer Search & Select */}
        <fieldset className="payment-in-fieldset" disabled={busy}>
          <label className="payment-in-search-label">
            <span>Find customer (by name or mobile)</span>
            <div className="payment-in-search-bar">
              <Search size={16} />
              <input
                type="text"
                placeholder="Type customer name or mobile number…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                autoFocus
              />
            </div>
          </label>

          {/* Quick Select Dropdown if many results */}
          <label>
            <span>Or choose from customer list ({filteredCustomers.length} found)</span>
            <select
              value={selectedKey}
              onChange={e => {
                setSelectedKey(e.target.value);
                setError('');
              }}
              required
            >
              <option value="">— Select a customer —</option>
              {filteredCustomers.map(c => (
                <option key={c.customerKey} value={c.customerKey}>
                  {c.name} · {c.phone} — {c.summary.balance > 0 ? `Due: ${money(c.summary.balance)}` : 'Settled'}
                </option>
              ))}
            </select>
          </label>

          {/* Selected Customer Highlight Card */}
          {selectedCustomer ? (
            <div className="payment-in-customer-card glass">
              <div className="customer-info">
                <strong><User size={16} /> {selectedCustomer.name}</strong>
                <small>{selectedCustomer.phone}</small>
              </div>
              <div className="balance-info">
                <span>Current Outstanding</span>
                <strong className={selectedCustomer.summary.balance > 0 ? 'credit-red' : 'credit-green'}>
                  {money(selectedCustomer.summary.balance)}
                </strong>
                {selectedCustomer.summary.nextDueDate && (
                  <small>Due: {selectedCustomer.summary.nextDueDate}</small>
                )}
              </div>
            </div>
          ) : (
            <div className="notice">
              Please choose a customer from the search or list above to proceed with payment.
            </div>
          )}

          {selectedCustomer && (
            <>
              {/* Payment Amount */}
              <div className="payment-amount-row">
                <label style={{ flex: 1 }}>
                  <span>Payment amount received ₹</span>
                  <input
                    type="number"
                    min="0.01"
                    max={currentBalance}
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={amount}
                    onChange={e => {
                      setAmount(e.target.value);
                      setError('');
                    }}
                  />
                </label>
                {currentBalance > 0 && (
                  <button
                    type="button"
                    className="button secondary pay-full-btn"
                    onClick={() => {
                      setAmount(currentBalance.toFixed(2));
                      setError('');
                    }}
                  >
                    Pay full ({money(currentBalance)})
                  </button>
                )}
              </div>

              {/* Live Remaining Balance Calculation Card */}
              <div className={`remaining-balance-card ${isOverpaying ? 'card-danger' : isCompleteSettlement ? 'card-success' : 'card-standard'}`}>
                <div className="calc-row">
                  <span>Current balance:</span>
                  <strong>{money(currentBalance)}</strong>
                </div>
                <div className="calc-row">
                  <span>Payment in:</span>
                  <strong className="credit-green">− {money(numAmount)}</strong>
                </div>
                <div className="calc-divider" />
                <div className="calc-row calc-result">
                  <span>Remaining balance:</span>
                  <strong className={remainingBalance > 0 ? 'credit-red' : 'credit-green'}>
                    {money(remainingBalance)}
                  </strong>
                </div>
                {isCompleteSettlement && (
                  <p className="settlement-badge"><CheckCircle2 size={15} /> Outstanding will be fully settled (₹0.00)!</p>
                )}
                {isOverpaying && (
                  <p className="overpay-error">⚠️ Payment amount exceeds the outstanding balance.</p>
                )}
              </div>

              {/* Payment Method */}
              <label>
                <span>Payment method</span>
                <select value={method} onChange={e => setMethod(e.target.value as typeof method)}>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI / Online</option>
                  <option value="card">Card</option>
                </select>
              </label>

              {/* Note */}
              <label>
                <span>Note / Reference (optional)</span>
                <input
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="e.g. Receipt #, UPI ref, or note"
                  maxLength={300}
                />
              </label>
            </>
          )}
        </fieldset>

        {error && <p className="error-banner" role="alert">{error}</p>}

        <footer>
          <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button
            className="button credit-receive"
            type="submit"
            disabled={busy || !selectedCustomer || numAmount <= 0 || isOverpaying}
          >
            {busy ? 'Saving…' : <><Check size={16} /> Record Payment In ({money(numAmount)})</>}
          </button>
        </footer>
      </form>
    </dialog>
  );
}

