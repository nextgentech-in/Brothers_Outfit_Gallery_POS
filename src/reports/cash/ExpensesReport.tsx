import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus } from 'lucide-react';
import { readAdmin, writeAdmin } from '../../adminApi';
import { ReportHeader } from '../shared/ReportHeader';
import { ReportFilters, type FilterState, computeDatePreset } from '../shared/ReportFilters';
import { SummaryCards, type MetricCardItem } from '../shared/SummaryCards';
import { DataTable, type ColumnDef } from '../shared/DataTable';
import { downloadCsv, formatINR, formatDateINR } from '../shared/exportUtils';

export function ExpensesReport() {
  const [filters, setFilters] = useState<FilterState>(() => {
    const range = computeDatePreset('thisMonth');
    return {
      preset: 'thisMonth',
      fromDate: range.fromDate,
      toDate: range.toDate,
      searchQuery: ''
    };
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [expenses, setExpenses] = useState<any[]>([]);
  const [lastUpdated, setLastUpdated] = useState('');
  const [recordModalOpen, setRecordModalOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({
        from: filters.fromDate,
        to: filters.toDate
      });

      // Using reports/summary which returns expenses for date range
      const res = await readAdmin<{ expenses: any[] }>(`reports/summary?${q.toString()}`);
      setExpenses(res.expenses || []);
      setLastUpdated(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredExpenses = useMemo(() => {
    if (!filters.searchQuery?.trim()) return expenses;
    const q = filters.searchQuery.toLowerCase();
    return expenses.filter(e =>
      `${e.note} ${e.category} ${e.method}`.toLowerCase().includes(q)
    );
  }, [expenses, filters.searchQuery]);

  const summary = useMemo(() => {
    let opex = 0;
    let drawings = 0;
    let cash = 0;
    let upi = 0;

    filteredExpenses.forEach(e => {
      const amt = Number(e.amount || 0);
      if (e.category === 'withdrawal') drawings += amt;
      else opex += amt;

      if (e.method === 'cash') cash += amt;
      else if (e.method === 'upi') upi += amt;
    });

    return {
      opex,
      drawings,
      total: opex + drawings,
      cash,
      upi
    };
  }, [filteredExpenses]);

  const handleExportCsv = () => {
    const headers = ['Date', 'Category', 'Amount (₹)', 'Payment Method', 'Description / Note'];
    const rows = filteredExpenses.map(row => [
      formatDateINR(row.createdAt?.seconds ? new Date(row.createdAt.seconds * 1000).toISOString() : null),
      row.category === 'withdrawal' ? 'Owner Withdrawal' : 'Operating Expense',
      row.amount,
      row.method?.toUpperCase(),
      row.note
    ]);
    downloadCsv(`Expenses_Report_${filters.fromDate}_to_${filters.toDate}`, headers, rows);
  };

  const summaryCards: MetricCardItem[] = useMemo(() => [
    {
      label: 'Operating Expenses (OPEX)',
      value: summary.opex,
      subtext: 'Rent, salaries, utility bills',
      variant: 'negative'
    },
    {
      label: 'Owner Withdrawals (Drawings)',
      value: summary.drawings,
      subtext: 'Personal drawings (excluded from OPEX)',
      variant: 'warning'
    },
    {
      label: 'Total Cash Paid',
      value: summary.cash,
      subtext: 'Physical currency paid out',
      variant: 'default'
    },
    {
      label: 'Total Digital Paid (UPI/Card)',
      value: summary.upi,
      subtext: 'Bank / QR payments made',
      variant: 'info'
    }
  ], [summary]);

  const columns: ColumnDef<any>[] = useMemo(() => [
    {
      key: 'createdAt',
      header: 'Date',
      sortable: true,
      render: r => <div>{formatDateINR(r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000).toISOString() : null)}</div>
    },
    {
      key: 'category',
      header: 'Category',
      render: r => {
        const isWithdrawal = r.category === 'withdrawal';
        return (
          <span className={`badge ${isWithdrawal ? 'badge-amber' : 'badge-red'}`}>
            {isWithdrawal ? 'Owner Withdrawal' : 'Operating Expense'}
          </span>
        );
      }
    },
    {
      key: 'note',
      header: 'Description / Purpose',
      sortable: true,
      render: r => <strong>{r.note || '—'}</strong>
    },
    {
      key: 'method',
      header: 'Method',
      render: r => <span style={{ textTransform: 'uppercase' }}>{r.method || 'cash'}</span>
    },
    {
      key: 'amount',
      header: 'Amount (₹)',
      align: 'right',
      sortable: true,
      render: r => <strong style={{ color: '#DC2626' }}>{formatINR(r.amount)}</strong>
    }
  ], []);

  return (
    <>
      <ReportHeader
        title="Store Expenses & Withdrawals"
        description="Record and analyze daily shop operating expenditures and personal owner drawings."
        lastUpdated={lastUpdated}
        loading={loading}
        onRefresh={loadData}
        onExportCsv={handleExportCsv}
        actionButton={
          <button
            type="button"
            className="report-btn primary"
            onClick={() => setRecordModalOpen(true)}
          >
            <Plus size={16} /> Record Expense
          </button>
        }
      />

      <ReportFilters
        filters={filters}
        onChange={setFilters}
        showSearch={true}
        searchPlaceholder="Search note or category..."
      />

      {error && <div className="error-banner" style={{ margin: '0 0 16px' }}>{error}</div>}
      {success && <div className="success-banner" style={{ margin: '0 0 16px' }}>{success}</div>}

      <SummaryCards cards={summaryCards} />

      <DataTable
        columns={columns}
        data={filteredExpenses}
        loading={loading}
        emptyMessage="No expenses recorded in the selected period."
      />

      {/* RECORD EXPENSE MODAL */}
      {recordModalOpen && (
        <RecordExpenseModal
          onClose={() => setRecordModalOpen(false)}
          onSuccess={() => {
            setRecordModalOpen(false);
            setSuccess('Expense recorded successfully.');
            loadData();
          }}
        />
      )}
    </>
  );
}

function RecordExpenseModal({
  onClose,
  onSuccess
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<'expense' | 'withdrawal'>('expense');
  const [method, setMethod] = useState<'cash' | 'upi' | 'card'>('cash');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!Number(amount) || !note.trim()) return;
    setBusy(true);
    setError('');
    try {
      await writeAdmin('expenses/create', {
        requestId: `EXP-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        amount: Number(amount),
        category,
        method,
        note: note.trim()
      });
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="report-modal-backdrop" onClick={onClose}>
      <div className="report-modal-content" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="report-modal-header">
            <h2>Record Expense or Withdrawal</h2>
            <button type="button" className="filter-clear-btn" onClick={onClose}>×</button>
          </div>
          <div className="report-modal-body">
            {error && <div className="error-banner">{error}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Type *
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value as any)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #DDE4ED', marginTop: 4 }}
                >
                  <option value="expense">Operating Expense (Rent, Tea, Utilities, Staff)</option>
                  <option value="withdrawal">Owner Personal Withdrawal (Drawings)</option>
                </select>
              </label>

              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Amount (₹) *
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #DDE4ED', marginTop: 4 }}
                />
              </label>

              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Payment Method *
                <select
                  value={method}
                  onChange={e => setMethod(e.target.value as any)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #DDE4ED', marginTop: 4 }}
                >
                  <option value="cash">Cash Paid</option>
                  <option value="upi">UPI / QR Transfer</option>
                  <option value="card">Card / Bank Account</option>
                </select>
              </label>

              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Description / Purpose *
                <input
                  type="text"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="e.g. Electricity bill, Shop refreshments, Cleaning"
                  required
                  minLength={2}
                  maxLength={300}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #DDE4ED', marginTop: 4 }}
                />
              </label>
            </div>
          </div>
          <div className="report-modal-footer">
            <button type="button" className="report-btn secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="report-btn primary" disabled={busy || !Number(amount) || !note.trim()}>
              {busy ? 'Saving…' : 'Record Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

