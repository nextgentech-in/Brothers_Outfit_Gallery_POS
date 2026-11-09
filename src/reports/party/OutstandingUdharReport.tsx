import { useState, useEffect, useCallback, useMemo } from 'react';
import { readAdmin } from '../../adminApi';
import { ReportHeader } from '../shared/ReportHeader';
import { SummaryCards, type MetricCardItem } from '../shared/SummaryCards';
import { DataTable, type ColumnDef } from '../shared/DataTable';
import { downloadCsv, formatINR } from '../shared/exportUtils';
import { Search } from 'lucide-react';

export function OutstandingUdharReport() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [data, setData] = useState<{ summary: any; customers: any[] }>({
    summary: {
      totalOutstanding: 0,
      notYetDue: 0,
      overdue: 0,
      undated: 0,
      customerCount: 0
    },
    customers: []
  });
  const [lastUpdated, setLastUpdated] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await readAdmin<{ summary: any; customers: any[] }>('reports/party/outstanding-udhar');
      setData(res);
      setLastUpdated(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredCustomers = useMemo(() => {
    if (!searchQuery.trim()) return data.customers;
    const q = searchQuery.toLowerCase();
    return data.customers.filter(c =>
      `${c.name} ${c.phone}`.toLowerCase().includes(q)
    );
  }, [data.customers, searchQuery]);

  const handleExportCsv = () => {
    const headers = ['Customer Name', 'Phone', 'Total Udhar Balance (₹)', 'Not Yet Due (₹)', 'Overdue (₹)', 'Undated (₹)', 'Aging Status'];
    const rows = filteredCustomers.map(row => [
      row.name,
      row.phone,
      row.balance,
      row.notYetDue,
      row.overdue,
      row.undated,
      row.status
    ]);
    downloadCsv(`Outstanding_Udhar_Report_${new Date().toISOString().slice(0, 10)}`, headers, rows);
  };

  const summaryCards: MetricCardItem[] = useMemo(() => [
    {
      label: 'Total Outstanding Udhar',
      value: data.summary.totalOutstanding,
      subtext: `${data.summary.customerCount || 0} customer accounts with dues`,
      variant: 'negative'
    },
    {
      label: 'Overdue Balance',
      value: data.summary.overdue,
      subtext: 'Past agreed credit due date',
      variant: (data.summary.overdue || 0) > 0 ? 'negative' : 'positive'
    },
    {
      label: 'Not Yet Due',
      value: data.summary.notYetDue,
      subtext: 'Within active payment terms',
      variant: 'default'
    },
    {
      label: 'Undated Credit',
      value: data.summary.undated,
      subtext: 'Bills without set due date',
      variant: 'warning'
    }
  ], [data.summary]);

  const columns: ColumnDef<any>[] = useMemo(() => [
    {
      key: 'name',
      header: 'Customer',
      sortable: true,
      render: r => (
        <div>
          <strong>{r.name}</strong>
          <div style={{ fontSize: 11, color: '#788398' }}>{r.phone}</div>
        </div>
      )
    },
    {
      key: 'balance',
      header: 'Total Balance (₹)',
      align: 'right',
      sortable: true,
      render: r => <strong style={{ color: '#DC2626' }}>{formatINR(r.balance)}</strong>
    },
    {
      key: 'notYetDue',
      header: 'Not Yet Due (₹)',
      align: 'right',
      render: r => r.notYetDue > 0 ? formatINR(r.notYetDue) : '—'
    },
    {
      key: 'overdue',
      header: 'Overdue (₹)',
      align: 'right',
      sortable: true,
      render: r => r.overdue > 0 ? <span style={{ color: '#DC2626', fontWeight: 700 }}>{formatINR(r.overdue)}</span> : '—'
    },
    {
      key: 'undated',
      header: 'Undated (₹)',
      align: 'right',
      render: r => r.undated > 0 ? <span style={{ color: '#D97706' }}>{formatINR(r.undated)}</span> : '—'
    },
    {
      key: 'status',
      header: 'Due Status',
      render: r => {
        const isOverdue = r.overdue > 0;
        return (
          <span className={`badge ${isOverdue ? 'badge-red' : 'badge-green'}`}>
            {isOverdue ? 'Overdue' : 'Due Later'}
          </span>
        );
      }
    }
  ], []);

  return (
    <>
      <ReportHeader
        title="Outstanding Udhar Report"
        description="Customer credit aging breakdown identifying overdue balances, upcoming dues and undated credits."
        lastUpdated={lastUpdated}
        loading={loading}
        onRefresh={loadData}
        onExportCsv={handleExportCsv}
      />

      <div style={{ background: '#FFFFFF', border: '1px solid #DDE4ED', borderRadius: 12, padding: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
        <div className="filter-search-box" style={{ maxWidth: 360 }}>
          <Search size={15} />
          <input
            type="text"
            placeholder="Search by customer name or mobile number..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button type="button" className="filter-clear-btn" onClick={() => setSearchQuery('')}>×</button>
          )}
        </div>
      </div>

      {error && <div className="error-banner" style={{ margin: '0 0 16px' }}>{error}</div>}

      <SummaryCards cards={summaryCards} />

      <DataTable
        columns={columns}
        data={filteredCustomers}
        loading={loading}
        emptyMessage="No customer udhar accounts found."
      />
    </>
  );
}

