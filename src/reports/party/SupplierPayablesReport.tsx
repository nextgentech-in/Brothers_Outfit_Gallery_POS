import { useState, useEffect, useCallback, useMemo } from 'react';
import { readAdmin } from '../../adminApi';
import { ReportHeader } from '../shared/ReportHeader';
import { SummaryCards, type MetricCardItem } from '../shared/SummaryCards';
import { DataTable, type ColumnDef } from '../shared/DataTable';
import { downloadCsv, formatINR } from '../shared/exportUtils';
import { Search } from 'lucide-react';

export function SupplierPayablesReport() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [data, setData] = useState<{ summary: any; items: any[] }>({
    summary: {
      totalOutstandingPayable: 0,
      totalAvailableCredits: 0,
      supplierCount: 0
    },
    items: []
  });
  const [lastUpdated, setLastUpdated] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await readAdmin<{ summary: any; items: any[] }>('reports/party/supplier-payables');
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

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return data.items;
    const q = searchQuery.toLowerCase();
    return data.items.filter(s =>
      `${s.name} ${s.phone}`.toLowerCase().includes(q)
    );
  }, [data.items, searchQuery]);

  const handleExportCsv = () => {
    const headers = ['Supplier Name', 'Phone', 'Total Invoiced Purchases (₹)', 'Total Payments (₹)', 'Outstanding Payable Dues (₹)', 'Available Supplier Credit (₹)'];
    const rows = filteredItems.map(row => [
      row.name,
      row.phone,
      row.totalPurchases,
      row.totalPaid,
      row.outstandingPayable,
      row.availableCredit
    ]);
    downloadCsv(`Supplier_Payables_${new Date().toISOString().slice(0, 10)}`, headers, rows);
  };

  const summaryCards: MetricCardItem[] = useMemo(() => [
    {
      label: 'Total Outstanding Payables',
      value: data.summary.totalOutstandingPayable,
      subtext: 'Net dues owed to suppliers',
      variant: 'negative'
    },
    {
      label: 'Total Available Credits',
      value: data.summary.totalAvailableCredits,
      subtext: 'Credits stored from returns',
      variant: 'info'
    },
    {
      label: 'Active Suppliers',
      value: `${data.summary.supplierCount || 0} vendors`,
      isCurrency: false,
      subtext: 'Supplier accounts tracked'
    }
  ], [data.summary]);

  const columns: ColumnDef<any>[] = useMemo(() => [
    {
      key: 'name',
      header: 'Supplier',
      sortable: true,
      render: r => (
        <div>
          <strong>{r.name}</strong>
          {r.phone && <div style={{ fontSize: 11, color: '#788398' }}>{r.phone}</div>}
        </div>
      )
    },
    {
      key: 'totalPurchases',
      header: 'Total Purchases (₹)',
      align: 'right',
      sortable: true,
      render: r => formatINR(r.totalPurchases)
    },
    {
      key: 'totalPaid',
      header: 'Total Paid (₹)',
      align: 'right',
      render: r => <span style={{ color: '#16A34A' }}>{formatINR(r.totalPaid)}</span>
    },
    {
      key: 'outstandingPayable',
      header: 'Outstanding Payable (₹)',
      align: 'right',
      sortable: true,
      render: r => (
        <strong style={{ color: r.outstandingPayable > 0 ? '#DC2626' : '#16A34A' }}>
          {formatINR(r.outstandingPayable)}
        </strong>
      )
    },
    {
      key: 'availableCredit',
      header: 'Available Credit (₹)',
      align: 'right',
      sortable: true,
      render: r => r.availableCredit > 0 ? (
        <span style={{ color: '#2563EB', fontWeight: 600 }}>{formatINR(r.availableCredit)}</span>
      ) : '—'
    }
  ], []);

  return (
    <>
      <ReportHeader
        title="Supplier Payables & Credits"
        description="Consolidated vendor balance summary comparing total stock purchases, payments completed, unpaid balances, and stored return credits."
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
            placeholder="Search supplier name or phone..."
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
        data={filteredItems}
        loading={loading}
        emptyMessage="No suppliers registered in the database."
      />
    </>
  );
}

