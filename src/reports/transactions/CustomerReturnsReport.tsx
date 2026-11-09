import { useState, useEffect, useCallback, useMemo } from 'react';
import { Eye } from 'lucide-react';
import { readAdmin } from '../../adminApi';
import { ReportHeader } from '../shared/ReportHeader';
import { ReportFilters, type FilterState, computeDatePreset } from '../shared/ReportFilters';
import { SummaryCards, type MetricCardItem } from '../shared/SummaryCards';
import { DataTable, type ColumnDef } from '../shared/DataTable';
import { downloadCsv, formatINR, formatDateINR } from '../shared/exportUtils';

export function CustomerReturnsReport() {
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
  const [data, setData] = useState<{ summary: any; items: any[] }>({
    summary: {
      totalReturnsValue: 0,
      creditCancelled: 0,
      refundsPaid: 0,
      pendingRefunds: 0,
      count: 0
    },
    items: []
  });
  const [lastUpdated, setLastUpdated] = useState('');
  const [selectedReturn, setSelectedReturn] = useState<any | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({
        from: filters.fromDate,
        to: filters.toDate
      });
      if (filters.searchQuery) q.set('q', filters.searchQuery);

      const res = await readAdmin<{ summary: any; items: any[] }>(`reports/customer-returns?${q.toString()}`);
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
      'Return ID',
      'Credit Note #',
      'Order ID',
      'Return Reason',
      'Total Return (₹)',
      'Credit Dues Cancelled (₹)',
      'Refund Paid (₹)',
      'Pending Refund (₹)',
      'Refund Status'
    ];
    const rows = data.items.map(row => [
      formatDateINR(row.date),
      row.id,
      row.creditNoteId,
      row.orderId,
      row.reason,
      row.total,
      row.creditCancelled,
      row.refundedAmount,
      row.pendingRefund,
      row.refundStatus
    ]);
    downloadCsv(`Customer_Returns_${filters.fromDate}_to_${filters.toDate}`, headers, rows);
  };

  const summaryCards: MetricCardItem[] = useMemo(() => [
    {
      label: 'Total Returns Value',
      value: data.summary.totalReturnsValue,
      subtext: 'Gross merchandise returned by customers'
    },
    {
      label: 'Udhar Cancelled',
      value: data.summary.creditCancelled,
      subtext: 'Pending customer dues reduced',
      variant: 'positive'
    },
    {
      label: 'Refunds Settled',
      value: data.summary.refundsPaid,
      subtext: 'Cash / UPI refunded to customers',
      variant: 'info'
    },
    {
      label: 'Pending Refunds',
      value: data.summary.pendingRefunds,
      subtext: 'Returns requiring payout review',
      variant: data.summary.pendingRefunds > 0 ? 'warning' : 'default'
    }
  ], [data.summary]);

  const columns: ColumnDef<any>[] = useMemo(() => [
    {
      key: 'date',
      header: 'Date',
      sortable: true,
      render: r => <div>{formatDateINR(r.date)}</div>
    },
    {
      key: 'creditNoteId',
      header: 'Credit Note #',
      sortable: true,
      render: r => <strong>{r.creditNoteId}</strong>
    },
    {
      key: 'orderId',
      header: 'Original Bill ID',
      sortable: true,
      render: r => <span>{r.orderId}</span>
    },
    {
      key: 'reason',
      header: 'Return Reason',
      render: r => r.reason || 'General Return'
    },
    {
      key: 'total',
      header: 'Return Value (₹)',
      align: 'right',
      sortable: true,
      render: r => <strong>{formatINR(r.total)}</strong>
    },
    {
      key: 'creditCancelled',
      header: 'Dues Cancelled (₹)',
      align: 'right',
      render: r => r.creditCancelled > 0 ? <span style={{ color: '#16A34A' }}>{formatINR(r.creditCancelled)}</span> : '—'
    },
    {
      key: 'refundedAmount',
      header: 'Refund Paid (₹)',
      align: 'right',
      render: r => r.refundedAmount > 0 ? <span style={{ color: '#2563EB' }}>{formatINR(r.refundedAmount)}</span> : '—'
    },
    {
      key: 'pendingRefund',
      header: 'Pending Payout (₹)',
      align: 'right',
      render: r => r.pendingRefund > 0 ? <span style={{ color: '#D97706', fontWeight: 600 }}>{formatINR(r.pendingRefund)}</span> : '—'
    },
    {
      key: 'refundStatus',
      header: 'Refund Status',
      render: r => {
        const status = r.refundStatus;
        const badgeClass = status === 'paid' ? 'badge-green' : status === 'review_required' ? 'badge-amber' : 'badge-gray';
        return <span className={`badge ${badgeClass}`}>{status === 'paid' ? 'Paid' : status === 'review_required' ? 'Review Needed' : 'Completed'}</span>;
      }
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'center',
      render: r => (
        <button
          type="button"
          className="report-btn secondary"
          style={{ padding: '4px 8px', fontSize: 12 }}
          onClick={() => setSelectedReturn(r)}
          title="View return details"
        >
          <Eye size={13} /> View
        </button>
      )
    }
  ], []);

  return (
    <>
      <ReportHeader
        title="Customer Returns Report"
        description="View customer returns, credit notes issued, udhar balances cancelled and refunds paid out."
        lastUpdated={lastUpdated}
        loading={loading}
        onRefresh={loadData}
        onExportCsv={handleExportCsv}
      />

      <ReportFilters
        filters={filters}
        onChange={setFilters}
        showSearch={true}
        searchPlaceholder="Search credit note #, bill ID, reason..."
      />

      {error && <div className="error-banner" style={{ margin: '0 0 16px' }}>{error}</div>}

      <SummaryCards cards={summaryCards} />

      <DataTable
        columns={columns}
        data={data.items}
        loading={loading}
        emptyMessage="No customer returns recorded in the selected period."
      />

      {selectedReturn && (
        <div className="report-modal-backdrop" onClick={() => setSelectedReturn(null)}>
          <div className="report-modal-content" onClick={e => e.stopPropagation()}>
            <div className="report-modal-header">
              <h2>Credit Note: {selectedReturn.creditNoteId}</h2>
              <button
                type="button"
                className="filter-clear-btn"
                style={{ fontSize: 22 }}
                onClick={() => setSelectedReturn(null)}
              >
                ×
              </button>
            </div>
            <div className="report-modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                <div><strong>Original Bill:</strong> {selectedReturn.orderId}</div>
                <div><strong>Date:</strong> {formatDateINR(selectedReturn.date)}</div>
                <div><strong>Reason:</strong> {selectedReturn.reason}</div>
                <div><strong>Total Value:</strong> {formatINR(selectedReturn.total)}</div>
                <div><strong>Udhar Cancelled:</strong> {formatINR(selectedReturn.creditCancelled)}</div>
                <div><strong>Refund Paid:</strong> {formatINR(selectedReturn.refundedAmount)}</div>
              </div>

              <h3 style={{ margin: '14px 0 6px', fontSize: 14 }}>Returned Items</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #DDE4ED', textAlign: 'left' }}>
                    <th style={{ padding: '8px 10px' }}>Line #</th>
                    <th style={{ padding: '8px 10px' }}>Quantity</th>
                    <th style={{ padding: '8px 10px' }}>Restocked into Inventory</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedReturn.lines || []).map((line: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid #EDF2F7' }}>
                      <td style={{ padding: '8px 10px' }}>Item Line {line.index + 1}</td>
                      <td style={{ padding: '8px 10px' }}><strong>{line.quantity} units</strong></td>
                      <td style={{ padding: '8px 10px' }}>
                        <span className={`badge ${line.restock !== false ? 'badge-green' : 'badge-red'}`}>
                          {line.restock !== false ? 'Restocked' : 'Damaged / Write-off'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="report-modal-footer">
              <button
                type="button"
                className="report-btn secondary"
                onClick={() => setSelectedReturn(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

