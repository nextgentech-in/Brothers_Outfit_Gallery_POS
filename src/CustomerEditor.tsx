import { useEffect, useRef, useState, type FormEvent } from 'react';
import { readAdmin, writeAdmin } from './adminApi';
import { shopDate, type Customer } from '../shared/customers';
import type { RewardRule } from '../shared/rewards';

function ruleFrom(form: FormData): RewardRule {
  return { rate: Number(form.get('rewardRate')), minimum: 0 };
}

function RewardRuleFields({ rule }: { rule?: RewardRule }) {
  return <>
    <label>Earn rate (%)<input name="rewardRate" type="number" min="0" max="100" step="0.01" defaultValue={rule?.rate ?? 0} required /></label>
    <small>Coins accumulate at this percentage of every bill amount, including credit bills. Coins do not reduce the bill. Whole coins are rounded down. Set 0% to pause earning.</small>
  </>;
}

export function CustomerRewardsSettings() {
  const [rule, setRule] = useState<RewardRule>();
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    setError('');
    try { setRule(await readAdmin<RewardRule>('customers/reward-settings')); }
    catch (cause) { setError((cause as Error).message); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      setRule(await writeAdmin<RewardRule>('customers/reward-settings', ruleFrom(new FormData(event.currentTarget))));
      setSaved(true);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  return <details className="glass table-panel customer-default-rewards"
    onToggle={event => { if (event.currentTarget.open && !rule) void load(); }}>
    <summary>Default rewards rule</summary>
    {rule ? <form onSubmit={submit}>
      <fieldset className="customer-reward-settings" disabled={busy}>
        <RewardRuleFields rule={rule} />
      </fieldset>
      <button className="button primary" disabled={busy}>Save default rule</button>
      {saved && <p role="status">Default rewards rule saved.</p>}
    </form> : !error && <p role="status">Loading rewards settings…</p>}
    {error && <p className="error-banner" role="alert">{error}
      {!rule && <button className="button secondary" type="button" onClick={() => void load()}>Retry</button>}
    </p>}
  </details>;
}

export function CustomerEditor({ customer, onClose, onSaved }: {
  customer: Customer;
  onClose: () => void;
  onSaved: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [hasCustomRule, setHasCustomRule] = useState(Boolean(customer.rewardRule));

  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement;
    element.showModal();
    return () => { element.close(); if (previous instanceof HTMLElement) previous.focus(); };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await writeAdmin('customers/update', {
        requestId: crypto.randomUUID(), phone: customer.phone, name: form.get('name'), email: form.get('email'),
        dateOfBirth: form.get('dateOfBirth'), birthdayOffersOptIn: form.get('offers') === 'on',
        rewardRule: hasCustomRule ? ruleFrom(form) : null
      });
      onSaved();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  return <dialog ref={dialog} className="customer-phone-dialog glass" aria-label="Edit customer"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={save}>
      <header><h2>Edit customer</h2><button type="button" className="icon-button" aria-label="Close" disabled={busy} onClick={onClose}>×</button></header>
      <p>Mobile {customer.phone}</p>
      <label>Customer name<input name="name" defaultValue={customer.fullName} required maxLength={120} /></label>
      <label>Email<input name="email" type="email" defaultValue={customer.email} /></label>
      <label>Date of birth<input name="dateOfBirth" type="date" max={shopDate()} min="1900-01-01" defaultValue={customer.dateOfBirth} /></label>
      <label className="check-row"><input type="checkbox" name="offers" defaultChecked={customer.birthdayOffersOptIn} />Customer agrees to birthday offers</label>
      <fieldset className="customer-reward-settings">
        <legend>Rewards</legend>
        <label className="check-row"><input type="checkbox" checked={hasCustomRule}
          onChange={event => setHasCustomRule(event.target.checked)} />Use a custom rule for this customer</label>
        {hasCustomRule && <RewardRuleFields rule={customer.rewardRule} />}
      </fieldset>
      {error && <p className="error-banner" role="alert">{error}</p>}
      <footer><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Cancel</button>
        <button className="button primary" disabled={busy}>Save customer</button></footer>
    </form>
  </dialog>;
}
