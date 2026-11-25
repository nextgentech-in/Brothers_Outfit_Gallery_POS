import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { writeAdmin } from './adminApi';

export function AddSupplierDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (supplier: { id: string; name: string }) => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gstin, setGstin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setError('');
    try {
      const result = await writeAdmin<{ supplierId: string }>('suppliers/create', {
        requestId: crypto.randomUUID(),
        name: name.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        gstin: gstin.trim() || undefined
      });
      onCreated({ id: result.supplierId, name: name.trim() });
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="editor-backdrop" onClick={onClose}>
      <div className="glass table-panel" onClick={e => e.stopPropagation()} style={{ width: 'min(500px, 94vw)', margin: 'auto', maxHeight: 'calc(100vh - 40px)', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, borderBottom: '1px solid var(--line)', paddingBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Add Supplier</h2>
          <button type="button" className="icon-button" onClick={onClose} disabled={busy}>×</button>
        </div>
        {error && <p className="error-banner" role="alert">{error}</p>}
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>
            Supplier Name *
            <input
              required
              minLength={2}
              placeholder="e.g. Surat Fabrics Co."
              style={{ display: 'block', width: '100%', minHeight: 40, marginTop: 6, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--solid)', color: 'var(--text)', fontSize: 14 }}
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </label>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>
            Phone Number
            <input
              inputMode="tel"
              placeholder="+91 98765 43210"
              style={{ display: 'block', width: '100%', minHeight: 40, marginTop: 6, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--solid)', color: 'var(--text)', fontSize: 14 }}
              value={phone}
              onChange={e => setPhone(e.target.value)}
            />
          </label>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>
            Email Address
            <input
              type="email"
              placeholder="supplier@example.com"
              style={{ display: 'block', width: '100%', minHeight: 40, marginTop: 6, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--solid)', color: 'var(--text)', fontSize: 14 }}
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </label>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600 }}>
            GSTIN (Optional)
            <input
              maxLength={15}
              placeholder="24AAAAA0000A1Z5"
              style={{ display: 'block', width: '100%', minHeight: 40, marginTop: 6, padding: '8px 12px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--solid)', color: 'var(--text)', fontSize: 14 }}
              value={gstin}
              onChange={e => setGstin(e.target.value.toUpperCase())}
            />
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
            <button type="button" className="button secondary" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" className="button primary" disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Add Supplier'}</button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
