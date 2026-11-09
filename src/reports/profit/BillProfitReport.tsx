import { useState, useEffect, useCallback, useMemo } from 'react';
import { Eye } from 'lucide-react';
import { readAdmin } from '../../adminApi';
import { ReportHeader } from '../shared/ReportHeader';
import { ReportFilters, type FilterState, computeDatePreset } from '../shared/ReportFilters';
import { SummaryCards, type MetricCardItem } from '../shared/SummaryCards';
import { DataTable, type ColumnDef } from '../shared/DataTable';
import { downloadCsv, formatINR, formatDateINR } from '../shared/exportUtils';

export function BillProfitReport({ onOpenInvoice }: { onOpenInvoice?: (invoice: any) => void }) {
  const [filters, setFilters] = useState<FilterState>(() => {
    const range = computeDatePreset('thisMonth');
    return {
      preset: 'thisMonth',
      fromDate: range.fromDate,
      toDate: range.toDate,
      view: 'lifetime',
      searchQuery: ''
    };
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<{ summary: any; items: any[] }>({
    summary: {
      netRevenue: 0,
      cogs: 0,
      grossProfit: 0,
      overallMarginPercent: 0,
      costCompletenessPercent: 100,
      count: 0
    },
    items: []
  });
  const [lastUpdated, setLastUpdated] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({
        from: filters.fromDate,
        to: filters.toDate,
        view: filters.view || 'lifetime'
      });
      if (filters.searchQuery) q.set('q', filters.searchQuery);

      const res = await readAdmin<{ summary: any; items: any[] }>(`reports/bill-profit?${q.toString()}`);
      setData(res);
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

  const handleExportCsv = () => {
    const headers = [
      'Date',
      'Invoice #',
      'Customer',
      'Channel',
      'Sale Value',
      'Discount',
      'Returned Revenue',
      'Net Revenue',
      'COGS (Cost)',
      'Gross Profit',
      'Margin %',
      'Cost Status'
    ];
    const rows = data.items.map(row => [
      formatDateINR(row.date),
      row.invoiceId,
      row.customer,
      row.channel,
      row.saleValue,
      row.discount,
      row.returnedRevenue,
      row.netRevenue,
      row.cogs,
      row.grossProfit,
      `${row.marginPercent}%`,
      row.costStatus?.toUpperCase()
    ]);
    downloadCsv(`Bill_Profit_${filters.fromDate}_to_${filters.toDate}`, headers, rows);
  };

  const summaryCards: MetricCardItem[] = useMemo(() => [
    {
      label: 'Net Revenue',
      value: data.summary.netRevenue,
      subtext: 'Delivered bill value − Returns'
    },
    {
      label: 'Known Cost (COGS)',
      value: data.summary.cogs,
      subtext: 'Recorded item purchase costs',
      variant: 'default'
    },
    {
      label: 'Gross Profit',
      value: data.summary.grossProfit,
      subtext: `Avg margin: ${data.summary.overallMarginPercent || 0}%`,
      variant: data.summary.grossProfit >= 0 ? 'positive' : 'negative'
    },
    {
      label: 'Cost Completeness',
      value: `${data.summary.costCompletenessPercent || 100}%`,
      isCurrency: false,
      subtext: `${data.summary.count || 0} bills evaluated`,
      variant: (data.summary.costCompletenessPercent || 100) < 100 ? 'warning' : 'positive'
    }
  ], [data.summary]);

  const columns: ColumnDef<any>[] = useMemo(() => [
    {
      key: 'date',
      header: 'Bill Date',
      sortable: true,
      render: r => <div>{formatDateINR(r.date)}</div>
    },
    {
      key: 'invoiceId',
      header: 'Invoice #',
      sortable: true,
      render: r => <strong>{r.invoiceId}</strong>
    },
    {
      key: 'customer',
      header: 'Customer',
      sortable: true,
      render: r => <span>{r.customer}</span>
    },
    {
      key: 'channel',
      header: 'Channel',
      render: r => <span className={`badge ${r.channel === 'POS' ? 'badge-blue' : 'badge-amber'}`}>{r.channel}</span>
    },
    {
      key: 'saleValue',
      header: 'Sale (₹)',
      align: 'right',
      render: r => formatINR(r.saleValue)
    },
    {
      key: 'discount',
      header: 'Disc (₹)',
      align: 'right',
      render: r => r.discount > 0 ? <span style={{ color: '#D97706' }}>−{formatINR(r.discount)}</span> : '—'
    },
    {
      key: 'netRevenue',
      header: 'Net Rev (₹)',
      align: 'right',
      sortable: true,
      render: r => <strong>{formatINR(r.netRevenue)}</strong>
    },
    {
      key: 'cogs',
      header: 'COGS (₹)',
      align: 'right',
      sortable: true,
      render: r => <span style={{ color: '#64748B' }}>{formatINR(r.cogs)}</span>
    },
    {
      key: 'grossProfit',
      header: 'Profit (₹)',
      align: 'right',
      sortable: true,
      render: r => (
        <strong style={{ color: r.grossProfit >= 0 ? '#16A34A' : '#DC2626' }}>
          {formatINR(r.grossProfit)}
        </strong>
      )
    },
    {
      key: 'marginPercent',
      header: 'Margin',
      align: 'right',
      sortable: true,
      render: r => (
        <span style={{ fontWeight: 600, color: r.marginPercent >= 20 ? '#16A34A' : r.marginPercent > 0 ? '#D97706' : '#DC2626' }}>
          {r.marginPercent}%
        </span>
      )
    },
    {
      key: 'costStatus',
      header: 'Cost Status',
      render: r => {
        const isComplete = r.costStatus === 'complete';
        return (
          <span className={`badge ${isComplete ? 'badge-green' : 'badge-amber'}`}>
            {isComplete ? 'Known' : 'Partial / Missing'}
          </span>
        );
      }
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'center',
      render: r => onOpenInvoice ? (
        <button
          type="button"
          className="report-btn secondary"
          style={{ padding: '3px 8px', fontSize: 11.5 }}
          onClick={() => onOpenInvoice({ id: r.invoiceId, orderId: r.orderId })}
          title="Open invoice"
        >
          <Eye size={12} /> Bill
        </button>
      ) : null
    }
  ], [onOpenInvoice]);

  return (
    <>
      <ReportHeader
        title="Bill-wise Profit Report"
        description="Invoice-level profitability analysis showing selling revenue, purchase cost of goods sold, and gross margins."
        lastUpdated={lastUpdated}
        loading={loading}
        onRefresh={loadData}
        onExportCsv={handleExportCsv}
      />

      <ReportFilters
        filters={filters}
        onChange={setFilters}
        showSearch={true}
        searchPlaceholder="Search invoice #, customer name..."
        showViewToggle={true}
        viewOptions={[
          { label: 'Bill Lifetime View', value: 'lifetime' },
          { label: 'Period Movement View', value: 'period' }
        ]}
      />

      {error && <div className="error-banner" style={{ margin: '0 0 16px' }}>{error}</div>}

      <SummaryCards cards={summaryCards} />

      <DataTable
        columns={columns}
        data={data.items}
        loading={loading}
        emptyMessage="No invoices found in the selected date range."
      />
    </>
  );
}

