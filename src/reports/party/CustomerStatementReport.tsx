import { useState, useEffect, useCallback, useMemo } from 'react';
import { readAdmin } from '../../adminApi';
import { ReportHeader } from '../shared/ReportHeader';
import { ReportFilters, type FilterState, computeDatePreset } from '../shared/ReportFilters';
import { SummaryCards, type MetricCardItem } from '../shared/SummaryCards';
import { DataTable, type ColumnDef } from '../shared/DataTable';
import { downloadCsv, formatINR, formatDateINR } from '../shared/exportUtils';

export function CustomerStatementReport() {
  const [filters, setFilters] = useState<FilterState>(() => {
    const range = computeDatePreset('thisMonth');
    return {
      preset: 'thisMonth',
      fromDate: range.fromDate,
      toDate: range.toDate,
      searchQuery: ''
    };
  });

  const [customerPhone, setCustomerPhone] = useState('');
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<any>({
    openingBalance: 0,
    closingBalance: 0,
    transactions: []
  });
  const [lastUpdated, setLastUpdated] = useState('');

  useEffect(() => {
    readAdmin<{ items: any[] }>('customers')
      .then(res => {
        setCustomers(res.items || []);
        if (res.items?.length && !customerPhone) {
          setCustomerPhone(res.items[0].phone || '');
        }
      })
      .catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    if (!customerPhone) return;
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({
        phone: customerPhone,
        from: filters.fromDate,
        to: filters.toDate
      });

      const res = await readAdmin<any>(`reports/party/customer-statement?${q.toString()}`);
      setData(res);
      setLastUpdated(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [customerPhone, filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleExportCsv = () => {
    const headers = ['Date', 'Transaction Type', 'Reference #', 'Total Bill', 'Credit Given (+)', 'Payment Received (−)', 'Running Balance'];
    const rows = (data.transactions || []).map((row: any) => [
      formatDateINR(row.date),
      row.type,
      row.reference,
      row.totalAmount,
      row.creditDelta,
      row.paymentDelta,
      row.runningBalance
    ]);
    downloadCsv(`Customer_Statement_${customerPhone}_${filters.fromDate}_to_${filters.toDate}`, headers, rows);
  };

  const summaryCards: MetricCardItem[] = useMemo(() => [
    {
      label: 'Opening Udhar Balance',
      value: data.openingBalance || 0,
      subtext: `Prior to ${filters.fromDate}`,
      variant: (data.openingBalance || 0) > 0 ? 'negative' : 'default'
    },
    {
      label: 'Period Credit Given',
      value: (data.transactions || []).reduce((s: number, t: any) => s + (t.creditDelta || 0), 0),
      subtext: 'New udhar recorded on bills',
      variant: 'default'
    },
    {
      label: 'Period Payments Received',
      value: (data.transactions || []).reduce((s: number, t: any) => s + (t.paymentDelta || 0), 0),
      subtext: 'Cash / UPI repaid by customer',
      variant: 'positive'
    },
    {
      label: 'Closing Udhar Balance',
      value: data.closingBalance || 0,
      subtext: `As of ${filters.toDate}`,
      variant: (data.closingBalance || 0) > 0 ? 'negative' : 'positive'
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
      header: 'Type',
      render: r => {
        const isCredit = r.creditDelta > 0;
        return <span className={`badge ${isCredit ? 'badge-amber' : 'badge-green'}`}>{r.type}</span>;
      }
    },
    {
      key: 'reference',
      header: 'Reference #',
      render: r => <strong>{r.reference}</strong>
    },
    {
      key: 'creditDelta',
      header: 'Credit Given (₹)',
      align: 'right',
      render: r => r.creditDelta > 0 ? <span style={{ color: '#DC2626' }}>+{formatINR(r.creditDelta)}</span> : '—'
    },
    {
      key: 'paymentDelta',
      header: 'Payment Received (₹)',
      align: 'right',
      render: r => r.paymentDelta > 0 ? <span style={{ color: '#16A34A', fontWeight: 600 }}>−{formatINR(r.paymentDelta)}</span> : '—'
    },
    {
      key: 'runningBalance',
      header: 'Balance (₹)',
      align: 'right',
      sortable: true,
      render: r => <strong>{formatINR(r.runningBalance)}</strong>
    }
  ], []);

  return (
    <>
      <ReportHeader
        title="Customer Statement"
        description="Detailed ledger account showing opening balance, udhar sales, collections received, and closing dues for any customer."
        lastUpdated={lastUpdated}
        loading={loading}
        onRefresh={loadData}
        onExportCsv={handleExportCsv}
      />

      <div style={{ background: '#FFFFFF', border: '1px solid #DDE4ED', borderRadius: 12, padding: 16, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>Choose Customer:</span>
          <select
            value={customerPhone}
            onChange={e => setCustomerPhone(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: 6, border: '1px solid #DDE4ED', background: '#F8FAFC', fontSize: 13, minWidth: 260 }}
          >
            <option value="">Select a customer profile</option>
            {customers.map(c => (
              <option key={c.id || c.phone} value={c.phone}>
                {c.fullName || c.name || 'Customer'} · {c.phone}
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
        emptyMessage="No transactions found for this customer in the selected date range."
      />
    </>
  );
}

