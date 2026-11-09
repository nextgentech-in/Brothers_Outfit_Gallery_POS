import React, { useState, useEffect, useCallback } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { readAdmin, writeAdmin } from '../../adminApi';
import { ReportHeader } from '../shared/ReportHeader';
import { shopDate } from '../../../shared/customers';
import { formatINR } from '../shared/exportUtils';

export function DailyClosingReport() {
  const [date, setDate] = useState(() => shopDate());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [savedClosing, setSavedClosing] = useState<any | null>(null);

  // Form states for closing
  const [openingCash, setOpeningCash] = useState('0');
  const [countedCash, setCountedCash] = useState('');
  const [closingNote, setClosingNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [daySummary, setDaySummary] = useState<any | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [closeRes, sumRes] = await Promise.all([
        readAdmin<{ closing: any }>(`day/closing?date=${date}`),
        readAdmin<{ summary: any }>(`reports/summary?from=${date}&to=${date}`)
      ]);
      setSavedClosing(closeRes.closing);
      setDaySummary(sumRes.summary);
      if (closeRes.closing) {
        setOpeningCash(String(closeRes.closing.openingCash || '0'));
        setCountedCash(String(closeRes.closing.countedCash || '0'));
        setClosingNote(closeRes.closing.note || '');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const cashMovement = daySummary ? Number(daySummary.cashMovement || 0) : 0;
  const expectedCash = Number(openingCash || 0) + cashMovement;
  const variance = Number(countedCash || 0) - expectedCash;

  const handleCloseDay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (countedCash === '') return;
    setBusy(true);
    setError('');
    try {
      const res = await writeAdmin('day/close', {
        requestId: `CLOSE-${date}-${Date.now()}`,
        date,
        openingCash: Number(openingCash || 0),
        countedCash: Number(countedCash || 0),
        note: closingNote.trim()
      });
      setSavedClosing(res);
      setSuccess(`Daily cash closing confirmed for ${date}. Variance: ${formatINR(variance)}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ReportHeader
        title="Daily Cash Closing"
        description="Verify physical cash in drawer against recorded sales collections, repayments, refunds and cash expenses."
        loading={loading}
        onRefresh={loadData}
      />

      <div style={{ background: '#FFFFFF', border: '1px solid #DDE4ED', borderRadius: 12, padding: 16, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Business Closing Date:</span>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #DDE4ED', background: '#F8FAFC', fontSize: 13 }}
          />
        </label>
      </div>

      {error && <div className="error-banner" style={{ margin: '16px 0 0' }}>{error}</div>}
      {success && <div className="success-banner" style={{ margin: '16px 0 0' }}>{success}</div>}

      {savedClosing && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 18px',
          background: '#F0FDF4',
          border: '1px solid #BBF7D0',
          borderRadius: 8,
          margin: '16px 0',
          fontSize: 13,
          color: '#166534'
        }}>
          <CheckCircle2 size={20} color="#16A34A" />
          <div>
            <strong>Daily Cash Closing Recorded for {date}: </strong>
            Counted {formatINR(savedClosing.countedCash)} vs Expected {formatINR(savedClosing.expectedCash)}.
            Variance: <strong>{formatINR(savedClosing.variance)}</strong>.
          </div>
        </div>
      )}

      {/* RECONCILIATION WORKBENCH */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 20 }}>
        {/* Left: Day Cash Math Breakdown */}
        <div className="report-table-panel" style={{ padding: 20 }}>
          <h2 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: '#151526' }}>
            Drawer Expected Cash Calculation
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #EDF2F7' }}>
              <span>Opening Cash in Drawer:</span>
              <strong>{formatINR(Number(openingCash || 0))}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #EDF2F7' }}>
              <span>Cash Sales Collected:</span>
              <span style={{ color: '#16A34A' }}>+{formatINR(daySummary?.cashSales || 0)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #EDF2F7' }}>
              <span>Customer Udhar Cash Repayments:</span>
              <span style={{ color: '#16A34A' }}>+{formatINR(daySummary?.creditCashCollected || 0)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #EDF2F7' }}>
              <span>Cash Refunds Paid to Customers:</span>
              <span style={{ color: '#DC2626' }}>−{formatINR(daySummary?.cashRefunds || 0)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #EDF2F7' }}>
              <span>Cash Store Expenses / Withdrawals:</span>
              <span style={{ color: '#DC2626' }}>−{formatINR(daySummary?.cashExpenses || 0)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #EDF2F7' }}>
              <span>Cash Paid to Suppliers:</span>
              <span style={{ color: '#DC2626' }}>−{formatINR(daySummary?.cashSupplierPayments || 0)}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderTop: '2px solid #CBD5E1', fontSize: 15, fontWeight: 700 }}>
              <span>Expected Cash in Till:</span>
              <span style={{ color: '#1E40AF' }}>{formatINR(expectedCash)}</span>
            </div>
          </div>
        </div>

        {/* Right: Actual Cash Count Form */}
        <div className="report-table-panel" style={{ padding: 20 }}>
          <h2 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: '#151526' }}>
            Count Physical Cash
          </h2>

          <form onSubmit={handleCloseDay} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>
              Opening Cash Balance (₹)
              <input
                type="number"
                step="0.01"
                min="0"
                value={openingCash}
                disabled={Boolean(savedClosing)}
                onChange={e => setOpeningCash(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #DDE4ED', marginTop: 4 }}
              />
            </label>

            <label style={{ fontSize: 13, fontWeight: 600 }}>
              Actual Physical Count in Drawer (₹) *
              <input
                type="number"
                step="0.01"
                min="0"
                value={countedCash}
                disabled={Boolean(savedClosing)}
                onChange={e => setCountedCash(e.target.value)}
                placeholder="Count physical notes and coins"
                required
                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #DDE4ED', marginTop: 4 }}
              />
            </label>

            <label style={{ fontSize: 13, fontWeight: 600 }}>
              Closing Remarks / Discrepancy Note
              <input
                type="text"
                value={closingNote}
                disabled={Boolean(savedClosing)}
                onChange={e => setClosingNote(e.target.value)}
                placeholder="Reason for any cash discrepancy or shift notes"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #DDE4ED', marginTop: 4 }}
              />
            </label>

            {/* LIVE VARIANCE INDICATOR */}
            <div style={{
              padding: '12px 16px',
              borderRadius: 8,
              background: variance === 0 ? '#F0FDF4' : variance < 0 ? '#FEF2F2' : '#EFF6FF',
              border: `1px solid ${variance === 0 ? '#86EFAC' : variance < 0 ? '#FCA5A5' : '#93C5FD'}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#788398', textTransform: 'uppercase' }}>
                  Cash Variance:
                </span>
                <div style={{ fontSize: 18, fontWeight: 700, color: variance === 0 ? '#16A34A' : variance < 0 ? '#DC2626' : '#2563EB' }}>
                  {formatINR(variance)}
                </div>
              </div>
              <span className={`badge ${variance === 0 ? 'badge-green' : variance < 0 ? 'badge-red' : 'badge-blue'}`}>
                {variance === 0 ? 'Exact Match' : variance < 0 ? 'Cash Shortage' : 'Cash Surplus'}
              </span>
            </div>

            {!savedClosing && (
              <button
                type="submit"
                className="report-btn primary"
                disabled={busy || countedCash === ''}
                style={{ width: '100%', justifyContent: 'center', padding: '10px 16px', fontSize: 14 }}
              >
                {busy ? 'Saving Closing Record…' : 'Lock & Save Daily Cash Closing'}
              </button>
            )}
          </form>
        </div>
      </div>
    </>
  );
}
