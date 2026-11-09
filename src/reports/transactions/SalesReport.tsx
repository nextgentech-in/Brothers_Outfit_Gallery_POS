import { useState, useEffect, useCallback, useMemo } from 'react';
import { Eye, Printer } from 'lucide-react';
import { readAdmin } from '../../adminApi';
import { ReportHeader } from '../shared/ReportHeader';
import { ReportFilters, type FilterState, computeDatePreset } from '../shared/ReportFilters';
import { SummaryCards, type MetricCardItem } from '../shared/SummaryCards';
import { DataTable, type ColumnDef } from '../shared/DataTable';
import { downloadCsv, formatINR, formatDateINR } from '../shared/exportUtils';

export function SalesReport({ onOpenInvoice }: { onOpenInvoice?: (invoice: any) => void }) {
  const [filters, setFilters] = useState<FilterState>(() => {
    const range = computeDatePreset('thisMonth');
    return {
      preset: 'thisMonth',
      fromDate: range.fromDate,
      toDate: range.toDate,
      channel: '',
      paymentMethod: '',
      searchQuery: ''
    };
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<{ summary: any; items: any[] }>({
    summary: {
      grossSales: 0,
      discounts: 0,
      customerReturns: 0,
      netSales: 0,
      amountSettled: 0,
      remainingReceivable: 0,
      count: 0
    },
    items: []
  });
  const [lastUpdated, setLastUpdated] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<any | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({
        from: filters.fromDate,
        to: filters.toDate
      });
      if (filters.channel) q.set('channel', filters.channel);
      if (filters.paymentMethod) q.set('payment', filters.paymentMethod);
      if (filters.searchQuery) q.set('q', filters.searchQuery);

      const res = await readAdmin<{ summary: any; items: any[] }>(`reports/sales?${q.toString()}`);
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
      'Phone',
      'Channel',
      'Payment Method',
      'Gross Amount',
      'Discount',
      'Net Amount',
      'Settled Amount',
      'Udhar Receivable',
      'Status'
    ];
    const rows = data.items.map(row => [
      formatDateINR(row.date),
      row.invoiceId,
      row.customerName,
      row.customerPhone,
      row.channel,
      row.paymentMethod?.toUpperCase(),
      row.grossAmount,
      row.discount,
      row.netAmount,
      row.settledAmount,
      row.balanceAmount,
      row.status
    ]);
    downloadCsv(`Sales_Report_${filters.fromDate}_to_${filters.toDate}`, headers, rows);
  };

  const summaryCards: MetricCardItem[] = useMemo(() => [
    {
      label: 'Gross Sales',
      value: data.summary.grossSales,
      subtext: 'Sales before discounts'
    },
    {
      label: 'Discounts',
      value: data.summary.discounts,
      subtext: 'Discounts given on bills',
      variant: 'warning'
    },
    {
      label: 'Customer Returns',
      value: data.summary.customerReturns,
      subtext: 'Returns deducted from sales',
      variant: 'negative'
    },
    {
      label: 'Net Sales',
      value: data.summary.netSales,
      subtext: 'Gross − Discounts − Returns',
      variant: 'positive'
    },
    {
      label: 'Amount Settled',
      value: data.summary.amountSettled,
      subtext: 'Payments collected on invoices',
      variant: 'positive'
    },
    {
      label: 'Remaining Receivable',
      value: data.summary.remainingReceivable,
      subtext: 'Udhar pending on invoices',
      variant: data.summary.remainingReceivable > 0 ? 'negative' : 'default'
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
      key: 'invoiceId',
      header: 'Invoice #',
      sortable: true,
      render: r => <strong>{r.invoiceId}</strong>
    },
    {
      key: 'customerName',
      header: 'Customer',
      sortable: true,
      render: r => (
        <div>
          <div>{r.customerName}</div>
          {r.customerPhone && <small style={{ color: '#788398' }}>{r.customerPhone}</small>}
        </div>
      )
    },
    {
      key: 'channel',
      header: 'Channel',
      render: r => (
        <span className={`badge ${r.channel === 'POS' ? 'badge-blue' : 'badge-amber'}`}>
          {r.channel}
        </span>
      )
    },
    {
      key: 'paymentMethod',
      header: 'Payment',
      render: r => <span style={{ textTransform: 'uppercase' }}>{r.paymentMethod}</span>
    },
    {
      key: 'grossAmount',
      header: 'Gross (₹)',
      align: 'right',
      sortable: true,
      render: r => formatINR(r.grossAmount)
    },
    {
      key: 'discount',
      header: 'Discount (₹)',
      align: 'right',
      render: r => r.discount > 0 ? <span style={{ color: '#D97706' }}>−{formatINR(r.discount)}</span> : '—'
    },
    {
      key: 'netAmount',
      header: 'Net Total (₹)',
      align: 'right',
      sortable: true,
      render: r => <strong>{formatINR(r.netAmount)}</strong>
    },
    {
      key: 'settledAmount',
      header: 'Settled (₹)',
      align: 'right',
      render: r => <span style={{ color: '#16A34A' }}>{formatINR(r.settledAmount)}</span>
    },
    {
      key: 'balanceAmount',
      header: 'Receivable (₹)',
      align: 'right',
      render: r => r.balanceAmount > 0 ? <span style={{ color: '#DC2626', fontWeight: 600 }}>{formatINR(r.balanceAmount)}</span> : '—'
    },
    {
      key: 'status',
      header: 'Status',
      render: r => {
        const isPaid = r.balanceAmount === 0;
        return (
          <span className={`badge ${isPaid ? 'badge-green' : 'badge-red'}`}>
            {isPaid ? 'Settled' : 'Credit / Due'}
          </span>
        );
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
          onClick={() => setSelectedOrder(r)}
          title="View bill items"
        >
          <Eye size={13} /> View
        </button>
      )
    }
  ], []);

  return (
    <>
      <ReportHeader
        title="Sales Report"
        description="Comprehensive analysis of POS in-store and website online sales, settlements, and pending udhar."
        lastUpdated={lastUpdated}
        loading={loading}
        onRefresh={loadData}
        onExportCsv={handleExportCsv}
      />

      <ReportFilters
        filters={filters}
        onChange={setFilters}
        showChannel={true}
        showPaymentMethod={true}
        showSearch={true}
        searchPlaceholder="Search invoice #, customer name, mobile..."
      />

      {error && <div className="error-banner" style={{ margin: '0 0 16px' }}>{error}</div>}

      <SummaryCards cards={summaryCards} />

      <DataTable
        columns={columns}
        data={data.items}
        loading={loading}
        emptyMessage="No sales found in the selected date range."
      />

      {/* Bill View Modal */}
      {selectedOrder && (
        <div className="report-modal-backdrop" onClick={() => setSelectedOrder(null)}>
          <div className="report-modal-content" onClick={e => e.stopPropagation()}>
            <div className="report-modal-header">
              <h2>Invoice Details: {selectedOrder.invoiceId}</h2>
              <button
                type="button"
                className="filter-clear-btn"
                style={{ fontSize: 22 }}
                onClick={() => setSelectedOrder(null)}
              >
                ×
              </button>
            </div>
            <div className="report-modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                <div><strong>Customer:</strong> {selectedOrder.customerName} {selectedOrder.customerPhone ? `(${selectedOrder.customerPhone})` : ''}</div>
                <div><strong>Date:</strong> {formatDateINR(selectedOrder.date)}</div>
                <div><strong>Channel:</strong> {selectedOrder.channel}</div>
                <div><strong>Payment Method:</strong> {String(selectedOrder.paymentMethod).toUpperCase()}</div>
                <div><strong>Net Total:</strong> {formatINR(selectedOrder.netAmount)}</div>
                <div><strong>Settled:</strong> {formatINR(selectedOrder.settledAmount)}</div>
              </div>

              <h3 style={{ margin: '14px 0 6px', fontSize: 14 }}>Line Items</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #DDE4ED', textAlign: 'left' }}>
                    <th style={{ padding: '8px 10px' }}>Item</th>
                    <th style={{ padding: '8px 10px' }}>SKU</th>
                    <th style={{ padding: '8px 10px' }}>Qty</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Price</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedOrder.items || []).map((line: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid #EDF2F7' }}>
                      <td style={{ padding: '8px 10px' }}><strong>{line.name || line.sku}</strong></td>
                      <td style={{ padding: '8px 10px' }}>{line.sku}</td>
                      <td style={{ padding: '8px 10px' }}>{line.quantity}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>{formatINR(line.price)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}><strong>{formatINR(Number(line.price || 0) * Number(line.quantity || 1))}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="report-modal-footer">
              <button
                type="button"
                className="report-btn secondary"
                onClick={() => setSelectedOrder(null)}
              >
                Close
              </button>
              {onOpenInvoice && (
                <button
                  type="button"
                  className="report-btn primary"
                  onClick={() => {
                    const inv = {
                      id: selectedOrder.invoiceId,
                      orderId: selectedOrder.id,
                      total: selectedOrder.netAmount,
                      lines: selectedOrder.items,
                      customerName: selectedOrder.customerName,
                      customerPhone: selectedOrder.customerPhone,
                      paymentMethod: selectedOrder.paymentMethod,
                      channel: selectedOrder.channel
                    };
                    onOpenInvoice(inv);
                    setSelectedOrder(null);
                  }}
                >
                  <Printer size={15} /> Reprint Receipt
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

