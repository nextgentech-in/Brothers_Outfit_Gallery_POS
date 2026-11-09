import { useState, useEffect, useCallback, useMemo } from 'react';
import { readAdmin } from '../../adminApi';
import { ReportHeader } from '../shared/ReportHeader';
import { ReportFilters, type FilterState, computeDatePreset } from '../shared/ReportFilters';
import { SummaryCards, type MetricCardItem } from '../shared/SummaryCards';
import { DataTable, type ColumnDef } from '../shared/DataTable';
import { downloadCsv, formatINR } from '../shared/exportUtils';

export function ItemProfitReport() {
  const [filters, setFilters] = useState<FilterState>(() => {
    const range = computeDatePreset('thisMonth');
    return {
      preset: 'thisMonth',
      fromDate: range.fromDate,
      toDate: range.toDate,
      searchQuery: ''
    };
  });

  const [sortBy, setSortBy] = useState('profit_desc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [lastUpdated, setLastUpdated] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({
        from: filters.fromDate,
        to: filters.toDate,
        sortBy
      });
      if (filters.searchQuery) q.set('q', filters.searchQuery);

      const res = await readAdmin<{ items: any[]; totalItems: number }>(`reports/item-profit?${q.toString()}`);
      setItems(res.items || []);
      setLastUpdated(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [filters, sortBy]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const summary = useMemo(() => {
    let totRev = 0;
    let totCogs = 0;
    let totProfit = 0;
    let totQty = 0;

    items.forEach(i => {
      totRev += Number(i.netRevenue || 0);
      totCogs += Number(i.cogs || 0);
      totProfit += Number(i.grossProfit || 0);
      totQty += Number(i.qtySold || 0);
    });

    const avgMargin = totRev > 0 ? (totProfit / totRev) * 100 : 0;

    return {
      revenue: totRev,
      cogs: totCogs,
      profit: totProfit,
      margin: Math.round(avgMargin * 10) / 10,
      qty: totQty
    };
  }, [items]);

  const handleExportCsv = () => {
    const headers = [
      'Product Name',
      'SKU',
      'Size',
      'Color',
      'Quantity Sold',
      'Net Revenue (₹)',
      'COGS (Cost) (₹)',
      'Gross Profit (₹)',
      'Gross Margin %',
      'Cost Status'
    ];
    const rows = items.map(row => [
      row.productName,
      row.sku,
      row.size,
      row.color,
      row.qtySold,
      row.netRevenue,
      row.cogs,
      row.grossProfit,
      `${row.marginPercent}%`,
      row.costStatus?.toUpperCase()
    ]);
    downloadCsv(`Item_Profit_${filters.fromDate}_to_${filters.toDate}`, headers, rows);
  };

  const summaryCards: MetricCardItem[] = useMemo(() => [
    {
      label: 'Total Units Sold',
      value: `${summary.qty.toLocaleString('en-IN')} units`,
      isCurrency: false,
      subtext: `${items.length} distinct items`
    },
    {
      label: 'Net Item Revenue',
      value: summary.revenue,
      subtext: 'Selling revenue earned'
    },
    {
      label: 'Total Item Cost',
      value: summary.cogs,
      subtext: 'Recorded inventory purchase cost',
      variant: 'default'
    },
    {
      label: 'Gross Profit',
      value: summary.profit,
      subtext: `Overall margin: ${summary.margin}%`,
      variant: summary.profit >= 0 ? 'positive' : 'negative'
    }
  ], [summary, items.length]);

  const columns: ColumnDef<any>[] = useMemo(() => [
    {
      key: 'productName',
      header: 'Product / Item',
      sortable: true,
      render: r => (
        <div>
          <strong>{r.productName}</strong>
          <div style={{ fontSize: 11, color: '#788398' }}>SKU: {r.sku}</div>
        </div>
      )
    },
    {
      key: 'size',
      header: 'Size / Color',
      render: r => <span>{[r.size, r.color].filter(x => x && x !== '—').join(' / ') || 'Standard'}</span>
    },
    {
      key: 'qtySold',
      header: 'Qty Sold',
      align: 'center',
      sortable: true,
      render: r => <strong>{r.qtySold}</strong>
    },
    {
      key: 'netRevenue',
      header: 'Net Rev (₹)',
      align: 'right',
      sortable: true,
      render: r => formatINR(r.netRevenue)
    },
    {
      key: 'cogs',
      header: 'Cost (₹)',
      align: 'right',
      render: r => <span style={{ color: '#64748B' }}>{formatINR(r.cogs)}</span>
    },
    {
      key: 'grossProfit',
      header: 'Gross Profit (₹)',
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
            {isComplete ? 'Complete' : 'Cost Missing'}
          </span>
        );
      }
    }
  ], []);

  return (
    <>
      <ReportHeader
        title="Item-wise Profit Report"
        description="SKU and variant-level profit margins and volume performance based on actual sold item purchase cost snapshots."
        lastUpdated={lastUpdated}
        loading={loading}
        onRefresh={loadData}
        onExportCsv={handleExportCsv}
      />

      <ReportFilters
        filters={filters}
        onChange={setFilters}
        showSearch={true}
        searchPlaceholder="Search product name, SKU..."
        showViewToggle={true}
        viewOptions={[
          { label: 'Highest Profit', value: 'profit_desc' },
          { label: 'Lowest / Loss', value: 'profit_asc' },
          { label: 'Most Units Sold', value: 'qty_desc' },
          { label: 'Highest Revenue', value: 'revenue_desc' }
        ]}
      />

      {error && <div className="error-banner" style={{ margin: '0 0 16px' }}>{error}</div>}

      <SummaryCards cards={summaryCards} />

      <DataTable
        columns={columns}
        data={items}
        loading={loading}
        emptyMessage="No product sales recorded in the selected period."
      />
    </>
  );
}

