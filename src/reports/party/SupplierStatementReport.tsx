import { useState, useEffect, useCallback, useMemo } from 'react';
import { readAdmin } from '../../adminApi';
import { ReportHeader } from '../shared/ReportHeader';
import { ReportFilters, type FilterState, computeDatePreset } from '../shared/ReportFilters';
import { SummaryCards, type MetricCardItem } from '../shared/SummaryCards';
import { DataTable, type ColumnDef } from '../shared/DataTable';
import { downloadCsv, formatINR, formatDateINR } from '../shared/exportUtils';

export function SupplierStatementReport() {
  const [filters, setFilters] = useState<FilterState>(() => {
    const range = computeDatePreset('thisMonth');
    return {
      preset: 'thisMonth',
      fromDate: range.fromDate,
      toDate: range.toDate,
      searchQuery: ''
    };
  });

  const [supplierId, setSupplierId] = useState('');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<any>({
    openingPayable: 0,
    closingPayable: 0,
    availableCredit: 0,
    transactions: []
  });
  const [lastUpdated, setLastUpdated] = useState('');

  useEffect(() => {
    readAdmin<{ items: any[] }>('suppliers')
      .then(res => {
        setSuppliers(res.items || []);
        if (res.items?.length && !supplierId) {
          setSupplierId(res.items[0].id || '');
        }
      })
      .catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    if (!supplierId) return;
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({
        supplierId,
        from: filters.fromDate,
        to: filters.toDate
      });

      const res = await readAdmin<any>(`reports/party/supplier-statement?${q.toString()}`);
      setData(res);
      setLastUpdated(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [supplierId, filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleExportCsv = () => {
    const headers = ['Date', 'Transaction Type', 'Reference #', 'Debit (Paid/Reduced)', 'Credit (Purchase Invoice)', 'Running Payable Balance'];
    const rows = (data.transactions || []).map((row: any) => [
      formatDateINR(row.date),
      row.type,
      row.reference,
      row.debit,
      row.credit,
      row.runningBalance
    ]);
    downloadCsv(`Supplier_Statement_${supplierId}_${filters.fromDate}_to_${filters.toDate}`, headers, rows);
  };

  const summaryCards: MetricCardItem[] = useMemo(() => [
    {
      label: 'Opening Payable',
      value: data.openingPayable || 0,
      subtext: `Prior to ${filters.fromDate}`,
      variant: (data.openingPayable || 0) > 0 ? 'negative' : 'default'
    },
    {
      label: 'New Purchases Added',
      value: (data.transactions || []).reduce((s: number, t: any) => s + (t.credit || 0), 0),
      subtext: 'Invoiced received stock',
      variant: 'default'
    },
    {
      label: 'Payments & Returns',
      value: (data.transactions || []).reduce((s: number, t: any) => s + (t.debit || 0), 0),
      subtext: 'Settlements + Return deductions',
      variant: 'positive'
    },
    {
      label: 'Closing Payable Dues',
      value: data.closingPayable || 0,
      subtext: `As of ${filters.toDate}`,
      variant: (data.closingPayable || 0) > 0 ? 'negative' : 'positive'
    },
    {
      label: 'Stored Supplier Credit',
      value: data.availableCredit || 0,
      subtext: 'Credit balance with vendor',
      variant: (data.availableCredit || 0) > 0 ? 'info' : 'default'
    }
  ], [data, filters]);

  const columns: ColumnDef<any>[] = useMemo(() => [
    {
      key: 'date',
      header: 'Date',
      sortable: true,
      render: r => <div>{formatDateINR(r.date)}</div>
    },
    {
      key: 'type',
      header: 'Transaction Type',
      render: r => {
        let badge = 'badge-gray';
        if (r.type === 'Purchase Invoice') badge = 'badge-amber';
        else if (r.type === 'Payment Made') badge = 'badge-green';
        else if (r.type === 'Purchase Return') badge = 'badge-blue';
        return <span className={`badge ${badge}`}>{r.type}</span>;
      }
    },
    {
      key: 'reference',
      header: 'Reference #',
      render: r => <strong>{r.reference}</strong>
    },
    {
      key: 'credit',
      header: 'Purchase Total (₹)',
      align: 'right',
      render: r => r.credit > 0 ? <span style={{ color: '#DC2626' }}>+{formatINR(r.credit)}</span> : '—'
    },
    {
      key: 'debit',
      header: 'Paid / Returned (₹)',
      align: 'right',
      render: r => r.debit > 0 ? <span style={{ color: '#16A34A', fontWeight: 600 }}>−{formatINR(r.debit)}</span> : '—'
    },
    {
      key: 'runningBalance',
      header: 'Payable Balance (₹)',
      align: 'right',
      sortable: true,
      render: r => <strong>{formatINR(r.runningBalance)}</strong>
    }
  ], []);

  return (
    <>
      <ReportHeader
        title="Supplier Statement"
        description="Detailed vendor ledger statement showing opening payables, stock invoices, payments made, return reductions, and closing balance."
        lastUpdated={lastUpdated}
        loading={loading}
        onRefresh={loadData}
        onExportCsv={handleExportCsv}
      />

      <div style={{ background: '#FFFFFF', border: '1px solid #DDE4ED', borderRadius: 12, padding: 16, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Choose Supplier:</span>
          <select
            value={supplierId}
            onChange={e => setSupplierId(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid #DDE4ED', background: '#F8FAFC', fontSize: 13, minWidth: 260 }}
          >
            <option value="">Select a supplier</option>
            {suppliers.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <ReportFilters
        filters={filters}
        onChange={setFilters}
        showSearch={false}
      />

      {error && <div className="error-banner" style={{ margin: '0 0 16px' }}>{error}</div>}

      <SummaryCards cards={summaryCards} />

      <DataTable
        columns={columns}
        data={data.transactions || []}
        loading={loading}
        emptyMessage="No transactions found for this supplier in the selected period."
      />
    </>
  );
}

