import { useState, useEffect, useCallback, useMemo } from 'react';
import { Eye } from 'lucide-react';
import { readAdmin } from '../../adminApi';
import { ReportHeader } from '../shared/ReportHeader';
import { ReportFilters, type FilterState, computeDatePreset } from '../shared/ReportFilters';
import { SummaryCards, type MetricCardItem } from '../shared/SummaryCards';
import { DataTable, type ColumnDef } from '../shared/DataTable';
import { downloadCsv, formatINR, formatDateINR } from '../shared/exportUtils';

export function PurchasesReport() {
  const [filters, setFilters] = useState<FilterState>(() => {
    const range = computeDatePreset('thisMonth');
    return {
      preset: 'thisMonth',
      fromDate: range.fromDate,
      toDate: range.toDate,
      supplierId: '',
      searchQuery: ''
    };
  });

  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<{ summary: any; items: any[] }>({
    summary: {
      receivedPurchaseValue: 0,
      supplierPurchaseReturns: 0,
      netPurchaseValue: 0,
      paymentsAllocated: 0,
      creditsApplied: 0,
      remainingPayable: 0,
      count: 0
    },
    items: []
  });
  const [lastUpdated, setLastUpdated] = useState('');
  const [selectedPurchase, setSelectedPurchase] = useState<any | null>(null);

  useEffect(() => {
    readAdmin<{ items: any[] }>('suppliers')
      .then(res => setSuppliers(res.items || []))
      .catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({
        from: filters.fromDate,
        to: filters.toDate
      });
      if (filters.supplierId) q.set('supplierId', filters.supplierId);
      if (filters.searchQuery) q.set('q', filters.searchQuery);

      const res = await readAdmin<{ summary: any; items: any[] }>(`reports/purchases?${q.toString()}`);
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
      'Purchase ID',
      'Supplier',
      'Supplier Invoice',
      'Received Value',
      'Returns Deducted',
      'Net Value',
      'Amount Paid',
      'Credits Applied',
      'Remaining Payable',
      'Status'
    ];
    const rows = data.items.map(row => [
      formatDateINR(row.date),
      row.id,
      row.supplierName,
      row.supplierInvoice,
      row.total,
      row.returnedAmount,
      row.netPurchaseValue,
      row.amountPaid,
      row.creditsApplied,
      row.payable,
      row.status
    ]);
    downloadCsv(`Purchases_Report_${filters.fromDate}_to_${filters.toDate}`, headers, rows);
  };

  const summaryCards: MetricCardItem[] = useMemo(() => [
    {
      label: 'Received Purchase Value',
      value: data.summary.receivedPurchaseValue,
      subtext: 'Total stock received at invoice value'
    },
    {
      label: 'Purchase Returns',
      value: data.summary.supplierPurchaseReturns,
      subtext: 'Goods returned to suppliers',
      variant: 'warning'
    },
    {
      label: 'Net Purchase Value',
      value: data.summary.netPurchaseValue,
      subtext: 'Received − Returned value',
      variant: 'info'
    },
    {
      label: 'Payments Allocated',
      value: data.summary.paymentsAllocated,
      subtext: 'Settlements paid towards purchases',
      variant: 'positive'
    },
    {
      label: 'Credits Applied',
      value: data.summary.creditsApplied,
      subtext: 'Supplier return credits used',
      variant: 'info'
    },
    {
      label: 'Remaining Payable',
      value: data.summary.remainingPayable,
      subtext: 'Unpaid balance on purchases',
      variant: data.summary.remainingPayable > 0 ? 'negative' : 'default'
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
      key: 'id',
      header: 'Receipt ID',
      sortable: true,
      render: r => <strong>{r.id}</strong>
    },
    {
      key: 'supplierName',
      header: 'Supplier',
      sortable: true,
      render: r => <strong>{r.supplierName}</strong>
    },
    {
      key: 'supplierInvoice',
      header: 'Supplier Inv #',
      render: r => r.supplierInvoice || '—'
    },
    {
      key: 'total',
      header: 'Received (₹)',
      align: 'right',
      sortable: true,
      render: r => formatINR(r.total)
    },
    {
      key: 'returnedAmount',
      header: 'Returned (₹)',
      align: 'right',
      render: r => r.returnedAmount > 0 ? <span style={{ color: '#D97706' }}>−{formatINR(r.returnedAmount)}</span> : '—'
    },
    {
      key: 'netPurchaseValue',
      header: 'Net Total (₹)',
      align: 'right',
      sortable: true,
      render: r => <strong>{formatINR(r.netPurchaseValue)}</strong>
    },
    {
      key: 'amountPaid',
      header: 'Paid (₹)',
      align: 'right',
      render: r => <span style={{ color: '#16A34A' }}>{formatINR(r.amountPaid)}</span>
    },
    {
      key: 'payable',
      header: 'Payable (₹)',
      align: 'right',
      sortable: true,
      render: r => r.payable > 0 ? <span style={{ color: '#DC2626', fontWeight: 600 }}>{formatINR(r.payable)}</span> : '—'
    },
    {
      key: 'status',
      header: 'Status',
      render: r => {
        const isPaid = r.payable === 0;
        return (
          <span className={`badge ${isPaid ? 'badge-green' : 'badge-amber'}`}>
            {isPaid ? 'Fully Paid' : 'Outstanding'}
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
          onClick={() => setSelectedPurchase(r)}
          title="View purchase lines"
        >
          <Eye size={13} /> View Lines
        </button>
      )
    }
  ], []);

  return (
    <>
      <ReportHeader
        title="Purchases Report"
        description="Track vendor stock receipts, invoice totals, return deductions and outstanding payables."
        lastUpdated={lastUpdated}
        loading={loading}
        onRefresh={loadData}
        onExportCsv={handleExportCsv}
      />

      <ReportFilters
        filters={filters}
        onChange={setFilters}
        showSupplier={true}
        suppliers={suppliers}
        showSearch={true}
        searchPlaceholder="Search supplier name, invoice #, receipt ID..."
      />

      {error && <div className="error-banner" style={{ margin: '0 0 16px' }}>{error}</div>}

      <SummaryCards cards={summaryCards} />

      <DataTable
        columns={columns}
        data={data.items}
        loading={loading}
        emptyMessage="No purchases found in the selected date range."
      />

      {/* Purchase Lines Modal */}
      {selectedPurchase && (
        <div className="report-modal-backdrop" onClick={() => setSelectedPurchase(null)}>
          <div className="report-modal-content" onClick={e => e.stopPropagation()}>
            <div className="report-modal-header">
              <h2>Purchase Receipt: {selectedPurchase.id}</h2>
              <button
                type="button"
                className="filter-clear-btn"
                style={{ fontSize: 22 }}
                onClick={() => setSelectedPurchase(null)}
              >
                ×
              </button>
            </div>
            <div className="report-modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                <div><strong>Supplier:</strong> {selectedPurchase.supplierName}</div>
                <div><strong>Supplier Invoice:</strong> {selectedPurchase.supplierInvoice}</div>
                <div><strong>Date:</strong> {formatDateINR(selectedPurchase.date)}</div>
                <div><strong>Total Received:</strong> {formatINR(selectedPurchase.total)}</div>
                <div><strong>Paid:</strong> {formatINR(selectedPurchase.amountPaid)}</div>
                <div><strong>Payable:</strong> {formatINR(selectedPurchase.payable)}</div>
              </div>

              <h3 style={{ margin: '14px 0 6px', fontSize: 14 }}>Received Items & Costs</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #DDE4ED', textAlign: 'left' }}>
                    <th style={{ padding: '8px 10px' }}>Item</th>
                    <th style={{ padding: '8px 10px' }}>SKU</th>
                    <th style={{ padding: '8px 10px' }}>Qty</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Unit Cost</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Sale Price</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>MRP</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Stock Value</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedPurchase.lines || []).map((line: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid #EDF2F7' }}>
                      <td style={{ padding: '8px 10px' }}><strong>{line.name || line.sku}</strong></td>
                      <td style={{ padding: '8px 10px' }}>{line.sku}</td>
                      <td style={{ padding: '8px 10px' }}>{line.quantity}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>{formatINR(line.unitCost)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>{formatINR(line.salePrice)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>{formatINR(line.mrp)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}><strong>{formatINR(line.stockValue || Number(line.unitCost || 0) * Number(line.quantity || 0))}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="report-modal-footer">
              <button
                type="button"
                className="report-btn secondary"
                onClick={() => setSelectedPurchase(null)}
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

