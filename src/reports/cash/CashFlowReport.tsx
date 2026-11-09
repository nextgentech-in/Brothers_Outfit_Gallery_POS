import { useState, useEffect, useCallback, useMemo } from 'react';
import { readAdmin } from '../../adminApi';
import { ReportHeader } from '../shared/ReportHeader';
import { ReportFilters, type FilterState, computeDatePreset } from '../shared/ReportFilters';
import { SummaryCards, type MetricCardItem } from '../shared/SummaryCards';
import { downloadCsv, formatINR } from '../shared/exportUtils';

export function CashFlowReport() {
  const [filters, setFilters] = useState<FilterState>(() => {
    const range = computeDatePreset('thisMonth');
    return {
      preset: 'thisMonth',
      fromDate: range.fromDate,
      toDate: range.toDate
    };
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<any>({
    inflows: {
      salesCollections: { cash: 0, upi: 0, card: 0, total: 0 },
      udharRepayments: { cash: 0, upi: 0, card: 0, total: 0 },
      supplierRefunds: { cash: 0, upi: 0, card: 0, total: 0 },
      totalInflow: 0
    },
    outflows: {
      customerRefunds: { cash: 0, upi: 0, card: 0, total: 0 },
      operatingExpenses: { cash: 0, upi: 0, card: 0, total: 0 },
      supplierPayments: { cash: 0, upi: 0, card: 0, total: 0 },
      ownerWithdrawals: { cash: 0, upi: 0, card: 0, total: 0 },
      totalOutflow: 0
    },
    netCashMovement: {
      cash: 0,
      upi: 0,
      card: 0,
      total: 0
    }
  });
  const [lastUpdated, setLastUpdated] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({
        from: filters.fromDate,
        to: filters.toDate
      });

      const res = await readAdmin<any>(`reports/cash-flow?${q.toString()}`);
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

  const inf = data.inflows || {};
  const outf = data.outflows || {};
  const net = data.netCashMovement || {};

  const handleExportCsv = () => {
    const headers = ['Flow Category', 'Cash (₹)', 'UPI (₹)', 'Card (₹)', 'Total (₹)'];
    const rows = [
      ['INFLOW: Sales Collections', inf.salesCollections?.cash, inf.salesCollections?.upi, inf.salesCollections?.card, inf.salesCollections?.total],
      ['INFLOW: Udhar Repayments', inf.udharRepayments?.cash, inf.udharRepayments?.upi, inf.udharRepayments?.card, inf.udharRepayments?.total],
      ['INFLOW: Supplier Refunds', inf.supplierRefunds?.cash, inf.supplierRefunds?.upi, inf.supplierRefunds?.card, inf.supplierRefunds?.total],
      ['TOTAL CASH INFLOWS', '', '', '', inf.totalInflow],
      ['OUTFLOW: Customer Refunds', outf.customerRefunds?.cash, outf.customerRefunds?.upi, outf.customerRefunds?.card, outf.customerRefunds?.total],
      ['OUTFLOW: Operating Expenses', outf.operatingExpenses?.cash, outf.operatingExpenses?.upi, outf.operatingExpenses?.card, outf.operatingExpenses?.total],
      ['OUTFLOW: Supplier Payments', outf.supplierPayments?.cash, outf.supplierPayments?.upi, outf.supplierPayments?.card, outf.supplierPayments?.total],
      ['OUTFLOW: Owner Withdrawals', outf.ownerWithdrawals?.cash, outf.ownerWithdrawals?.upi, outf.ownerWithdrawals?.card, outf.ownerWithdrawals?.total],
      ['TOTAL CASH OUTFLOWS', '', '', '', outf.totalOutflow],
      ['NET CASH MOVEMENT', net.cash, net.upi, net.card, net.total]
    ];
    downloadCsv(`Cash_Flow_Report_${filters.fromDate}_to_${filters.toDate}`, headers, rows);
  };

  const summaryCards: MetricCardItem[] = useMemo(() => [
    {
      label: 'Total Cash Inflow',
      value: inf.totalInflow || 0,
      subtext: 'Sales + Collections + Vendor refunds',
      variant: 'positive'
    },
    {
      label: 'Total Cash Outflow',
      value: outf.totalOutflow || 0,
      subtext: 'Expenses + Suppliers + Refunds',
      variant: 'negative'
    },
    {
      label: 'Net Cash Movement',
      value: net.total || 0,
      subtext: 'Total Inflows − Outflows',
      variant: (net.total || 0) >= 0 ? 'positive' : 'negative'
    },
    {
      label: 'Physical Cash Drawer Net',
      value: net.cash || 0,
      subtext: 'Net currency movement in till',
      variant: (net.cash || 0) >= 0 ? 'positive' : 'negative'
    },
    {
      label: 'Digital UPI Net',
      value: net.upi || 0,
      subtext: 'Net QR / UPI bank collections',
      variant: (net.upi || 0) >= 0 ? 'info' : 'warning'
    }
  ], [inf, outf, net]);

  return (
    <>
      <ReportHeader
        title="Cash Flow Statement"
        description="Track actual cash, UPI and card collections and disbursements, distinct from accrued accounting sales and profits."
        lastUpdated={lastUpdated}
        loading={loading}
        onRefresh={loadData}
        onExportCsv={handleExportCsv}
      />

      <ReportFilters
        filters={filters}
        onChange={setFilters}
        showSearch={false}
      />

      {error && <div className="error-banner" style={{ margin: '0 0 16px' }}>{error}</div>}

      <SummaryCards cards={summaryCards} />

      {/* DETAILED CASH FLOW TABLE */}
      <div className="report-table-panel" style={{ marginTop: 20 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #DDE4ED' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#151526' }}>
            Cash Flow by Payment Instrument
          </h2>
          <small style={{ color: '#788398' }}>Period: {filters.fromDate} to {filters.toDate}</small>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #DDE4ED', textAlign: 'right' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left' }}>Flow Category</th>
              <th style={{ padding: '12px 16px' }}>Cash (₹)</th>
              <th style={{ padding: '12px 16px' }}>UPI (₹)</th>
              <th style={{ padding: '12px 16px' }}>Card / POS (₹)</th>
              <th style={{ padding: '12px 16px' }}>Total Movement (₹)</th>
            </tr>
          </thead>
          <tbody>
            {/* INFLOWS */}
            <tr style={{ background: '#F1F5F9' }}>
              <td colSpan={5} style={{ padding: '10px 16px', fontWeight: 700, color: '#166534', fontSize: 12, textTransform: 'uppercase' }}>
                Cash Inflows (Money Received)
              </td>
            </tr>
            <tr style={{ borderBottom: '1px solid #EDF2F7' }}>
              <td style={{ padding: '10px 16px 10px 32px' }}>Sales Collections (Bill Receipts)</td>
              <td style={{ padding: '10px 16px', textAlign: 'right' }}>{formatINR(inf.salesCollections?.cash)}</td>
              <td style={{ padding: '10px 16px', textAlign: 'right' }}>{formatINR(inf.salesCollections?.upi)}</td>
              <td style={{ padding: '10px 16px', textAlign: 'right' }}>{formatINR(inf.salesCollections?.card)}</td>
              <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600 }}>{formatINR(inf.salesCollections?.total)}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #EDF2F7' }}>
              <td style={{ padding: '10px 16px 10px 32px' }}>Udhar Repayments from Customers</td>
              <td style={{ padding: '10px 16px', textAlign: 'right' }}>{formatINR(inf.udharRepayments?.cash)}</td>
              <td style={{ padding: '10px 16px', textAlign: 'right' }}>{formatINR(inf.udharRepayments?.upi)}</td>
              <td style={{ padding: '10px 16px', textAlign: 'right' }}>{formatINR(inf.udharRepayments?.card)}</td>
              <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600 }}>{formatINR(inf.udharRepayments?.total)}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #EDF2F7' }}>
              <td style={{ padding: '10px 16px 10px 32px' }}>Vendor Return Refunds Received</td>
              <td style={{ padding: '10px 16px', textAlign: 'right' }}>{formatINR(inf.supplierRefunds?.cash)}</td>
              <td style={{ padding: '10px 16px', textAlign: 'right' }}>{formatINR(inf.supplierRefunds?.upi)}</td>
              <td style={{ padding: '10px 16px', textAlign: 'right' }}>{formatINR(inf.supplierRefunds?.card)}</td>
              <td style={{ padding: '10px 16px', textAlign: 'right', fontWeight: 600 }}>{formatINR(inf.supplierRefunds?.total)}</td>
            </tr>
            <tr style={{ background: '#DCFCE7', fontWeight: 700, borderBottom: '2px solid #86EFAC' }}>
              <td style={{ padding: '12px 16px 12px 32px', color: '#166534' }}>Total Inflows</td>
              <td style={{ padding: '12px 16px', textAlign: 'right', color: '#166534' }}>{formatINR(inf.salesCollections?.cash + inf.udharRepayments?.cash + inf.supplierRefunds?.cash)}</td>
              <td style={{ padding: '12px 16px', textAlign: 'right', color: '#166534' }}>{formatINR(inf.salesCollections?.upi + inf.udharRepayments?.upi + inf.supplierRefunds?.upi)}</td>
              <td style={{ padding: '12px 16px', textAlign: 'right', color: '#166534' }}>{formatINR(inf.salesCollections?.card + inf.udharRepayments?.card + inf.supplierRefunds?.card)}</td>
              <td style={{ padding: '12px 16px', textAlign: 'right', color: '#166534', fontSize: 14 }}>{formatINR(inf.totalInflow)}</td>
            </tr>

            {/* OUTFLOWS */}
            <tr style={{ background: '#F1F5F9' }}>
              <td colSpan={5} style={{ padding: '10px 16px', fontWeight: 700, color: '#991B1B', fontSize: 12, textTransform: 'uppercase' }}>
                Cash Outflows (Money Paid Out)
              </td>
            </tr>
            <tr style={{ borderBottom: '1px solid #EDF2F7' }}>
              <td style={{ padding: '10px 16px 10px 32px' }}>Customer Return Cash/UPI Refunds</td>
              <td style={{ padding: '10px 16px', textAlign: 'right' }}>{formatINR(outf.customerRefunds?.cash)}</td>
              <td style={{ padding: '10px 16px', textAlign: 'right' }}>{formatINR(outf.customerRefunds?.upi)}</td>
              <td style={{ padding: '10px 16px', textAlign: 'right' }}>{formatINR(outf.customerRefunds?.card)}</td>
              <td style={{ padding: '10px 16px', textAlign: 'right', color: '#DC2626' }}>−{formatINR(outf.customerRefunds?.total)}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #EDF2F7' }}>
              <td style={{ padding: '10px 16px 10px 32px' }}>Operating Store Expenses</td>
              <td style={{ padding: '10px 16px', textAlign: 'right' }}>{formatINR(outf.operatingExpenses?.cash)}</td>
              <td style={{ padding: '10px 16px', textAlign: 'right' }}>{formatINR(outf.operatingExpenses?.upi)}</td>
              <td style={{ padding: '10px 16px', textAlign: 'right' }}>{formatINR(outf.operatingExpenses?.card)}</td>
              <td style={{ padding: '10px 16px', textAlign: 'right', color: '#DC2626' }}>−{formatINR(outf.operatingExpenses?.total)}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #EDF2F7' }}>
              <td style={{ padding: '10px 16px 10px 32px' }}>Supplier Purchase Settlements</td>
              <td style={{ padding: '10px 16px', textAlign: 'right' }}>{formatINR(outf.supplierPayments?.cash)}</td>
              <td style={{ padding: '10px 16px', textAlign: 'right' }}>{formatINR(outf.supplierPayments?.upi)}</td>
              <td style={{ padding: '10px 16px', textAlign: 'right' }}>{formatINR(outf.supplierPayments?.card)}</td>
              <td style={{ padding: '10px 16px', textAlign: 'right', color: '#DC2626' }}>−{formatINR(outf.supplierPayments?.total)}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #EDF2F7' }}>
              <td style={{ padding: '10px 16px 10px 32px' }}>Owner Personal Withdrawals (Drawings)</td>
              <td style={{ padding: '10px 16px', textAlign: 'right' }}>{formatINR(outf.ownerWithdrawals?.cash)}</td>
              <td style={{ padding: '10px 16px', textAlign: 'right' }}>{formatINR(outf.ownerWithdrawals?.upi)}</td>
              <td style={{ padding: '10px 16px', textAlign: 'right' }}>{formatINR(outf.ownerWithdrawals?.card)}</td>
              <td style={{ padding: '10px 16px', textAlign: 'right', color: '#DC2626' }}>−{formatINR(outf.ownerWithdrawals?.total)}</td>
            </tr>
            <tr style={{ background: '#FEE2E2', fontWeight: 700, borderBottom: '2px solid #FCA5A5' }}>
              <td style={{ padding: '12px 16px 12px 32px', color: '#991B1B' }}>Total Outflows</td>
              <td style={{ padding: '12px 16px', textAlign: 'right', color: '#991B1B' }}>{formatINR(outf.customerRefunds?.cash + outf.operatingExpenses?.cash + outf.supplierPayments?.cash + outf.ownerWithdrawals?.cash)}</td>
              <td style={{ padding: '12px 16px', textAlign: 'right', color: '#991B1B' }}>{formatINR(outf.customerRefunds?.upi + outf.operatingExpenses?.upi + outf.supplierPayments?.upi + outf.ownerWithdrawals?.upi)}</td>
              <td style={{ padding: '12px 16px', textAlign: 'right', color: '#991B1B' }}>{formatINR(outf.customerRefunds?.card + outf.operatingExpenses?.card + outf.supplierPayments?.card + outf.ownerWithdrawals?.card)}</td>
              <td style={{ padding: '12px 16px', textAlign: 'right', color: '#991B1B', fontSize: 14 }}>{formatINR(outf.totalOutflow)}</td>
            </tr>

            {/* NET POSITION */}
            <tr style={{ background: '#E2E8F0', fontWeight: 700, fontSize: 14 }}>
              <td style={{ padding: '14px 16px', color: '#151526' }}>NET CASH POSITION</td>
              <td style={{ padding: '14px 16px', textAlign: 'right', color: net.cash >= 0 ? '#16A34A' : '#DC2626' }}>{formatINR(net.cash)}</td>
              <td style={{ padding: '14px 16px', textAlign: 'right', color: net.upi >= 0 ? '#16A34A' : '#DC2626' }}>{formatINR(net.upi)}</td>
              <td style={{ padding: '14px 16px', textAlign: 'right', color: net.card >= 0 ? '#16A34A' : '#DC2626' }}>{formatINR(net.card)}</td>
              <td style={{ padding: '14px 16px', textAlign: 'right', fontSize: 16, color: net.total >= 0 ? '#16A34A' : '#DC2626' }}>{formatINR(net.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

