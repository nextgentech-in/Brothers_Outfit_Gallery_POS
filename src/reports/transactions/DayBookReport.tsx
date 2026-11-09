import { useState, useEffect, useCallback, useMemo } from 'react';
import { readAdmin } from '../../adminApi';
import { ReportHeader } from '../shared/ReportHeader';
import { ReportFilters, type FilterState, computeDatePreset } from '../shared/ReportFilters';
import { SummaryCards, type MetricCardItem } from '../shared/SummaryCards';
import { DataTable, type ColumnDef } from '../shared/DataTable';
import { downloadCsv, formatINR, formatDateTimeINR } from '../shared/exportUtils';

export function DayBookReport() {
  const [filters, setFilters] = useState<FilterState>(() => {
    const range = computeDatePreset('today');
    return {
      preset: 'today',
      fromDate: range.fromDate,
      toDate: range.toDate,
      searchQuery: ''
    };
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [events, setEvents] = useState<any[]>([]);
  const [lastUpdated, setLastUpdated] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({
        from: filters.fromDate,
        to: filters.toDate
      });

      const res = await readAdmin<{ events: any[]; totalCount: number }>(`reports/day-book?${q.toString()}`);
      setEvents(res.events || []);
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

  const filteredEvents = useMemo(() => {
    if (!filters.searchQuery?.trim()) return events;
    const q = filters.searchQuery.toLowerCase();
    return events.filter(e =>
      `${e.type} ${e.reference} ${e.party} ${e.paymentMethod}`.toLowerCase().includes(q)
    );
  }, [events, filters.searchQuery]);

  const summary = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    filteredEvents.forEach(e => {
      if (e.direction === 'inflow') inflow += Number(e.amount || 0);
      else if (e.direction === 'outflow') outflow += Number(e.amount || 0);
    });
    return {
      inflow,
      outflow,
      net: inflow - outflow,
      count: filteredEvents.length
    };
  }, [filteredEvents]);

  const handleExportCsv = () => {
    const headers = [
      'Timestamp',
      'Transaction Type',
      'Reference / Voucher',
      'Party / Account',
      'Payment Method',
      'Amount (₹)',
      'Direction'
    ];
    const rows = filteredEvents.map(row => [
      formatDateTimeINR(row.timestamp),
      row.type,
      row.reference,
      row.party,
      row.paymentMethod?.toUpperCase(),
      row.amount,
      row.direction?.toUpperCase()
    ]);
    downloadCsv(`Day_Book_${filters.fromDate}_to_${filters.toDate}`, headers, rows);
  };

  const summaryCards: MetricCardItem[] = useMemo(() => [
    {
      label: 'Total Business Events',
      value: `${summary.count} transactions`,
      isCurrency: false,
      subtext: 'Entries recorded in day ledger'
    },
    {
      label: 'Day Inflows',
      value: summary.inflow,
      subtext: 'Sales + Udhar + Vendor refunds',
      variant: 'positive'
    },
    {
      label: 'Day Outflows',
      value: summary.outflow,
      subtext: 'Expenses + Supplier payments',
      variant: 'negative'
    },
    {
      label: 'Net Day Movement',
      value: summary.net,
      subtext: 'Inflows − Outflows',
      variant: summary.net >= 0 ? 'positive' : 'negative'
    }
  ], [summary]);

  const columns: ColumnDef<any>[] = useMemo(() => [
    {
      key: 'timestamp',
      header: 'Time',
      sortable: true,
      render: r => <div>{formatDateTimeINR(r.timestamp)}</div>
    },
    {
      key: 'type',
      header: 'Event Type',
      sortable: true,
      render: r => {
        let badge = 'badge-gray';
        if (r.type === 'Sale') badge = 'badge-green';
        else if (r.type === 'Customer Return') badge = 'badge-amber';
        else if (r.type === 'Udhar Repayment') badge = 'badge-blue';
        else if (r.type === 'Expense') badge = 'badge-red';
        else if (r.type === 'Supplier Payment') badge = 'badge-amber';
        return <span className={`badge ${badge}`}>{r.type}</span>;
      }
    },
    {
      key: 'reference',
      header: 'Reference #',
      sortable: true,
      render: r => <strong>{r.reference}</strong>
    },
    {
      key: 'party',
      header: 'Party / Description',
      sortable: true,
      render: r => <span>{r.party}</span>
    },
    {
      key: 'paymentMethod',
      header: 'Method',
      render: r => <span style={{ textTransform: 'uppercase' }}>{r.paymentMethod}</span>
    },
    {
      key: 'amount',
      header: 'Amount (₹)',
      align: 'right',
      sortable: true,
      render: r => {
        const isIn = r.direction === 'inflow';
        const isOut = r.direction === 'outflow';
        return (
          <span style={{ color: isIn ? '#16A34A' : isOut ? '#DC2626' : '#343B4D', fontWeight: 600 }}>
            {isIn ? '+' : isOut ? '−' : ''}{formatINR(r.amount)}
          </span>
        );
      }
    }
  ], []);

  return (
    <>
      <ReportHeader
        title="Day Book"
        description="Chronological record of all daily transactions across sales, collections, vendor payouts and store expenses."
        lastUpdated={lastUpdated}
        loading={loading}
        onRefresh={loadData}
        onExportCsv={handleExportCsv}
      />

      <ReportFilters
        filters={filters}
        onChange={setFilters}
        showSearch={true}
        searchPlaceholder="Filter day book events..."
      />

      {error && <div className="error-banner" style={{ margin: '0 0 16px' }}>{error}</div>}

      <SummaryCards cards={summaryCards} />

      <DataTable
        columns={columns}
        data={filteredEvents}
        loading={loading}
        emptyMessage="No day book transactions found for the selected period."
      />
    </>
  );
}

