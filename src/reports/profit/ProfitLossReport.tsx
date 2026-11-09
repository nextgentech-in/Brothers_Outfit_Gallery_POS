import { useState, useEffect, useCallback, useMemo } from 'react';
import { AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { readAdmin } from '../../adminApi';
import { ReportHeader } from '../shared/ReportHeader';
import { ReportFilters, type FilterState, computeDatePreset } from '../shared/ReportFilters';
import { SummaryCards, type MetricCardItem } from '../shared/SummaryCards';
import { downloadCsv, formatINR } from '../shared/exportUtils';

export function ProfitLossReport() {
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
    figures: {
      grossSales: 0,
      discounts: 0,
      customerReturns: 0,
      netRevenue: 0,
      cogs: 0,
      grossProfit: 0,
      grossMarginPercent: 0,
      operatingExpenses: 0,
      damagedWriteOffs: 0,
      resultAfterRecordedExpenses: 0,
      ownerWithdrawals: 0
    },
    completeness: {
      totalLines: 0,
      knownLines: 0,
      unknownLines: 0,
      completenessPercent: 100,
      isComplete: true
    }
  });
  const [lastUpdated, setLastUpdated] = useState('');
  const [showCalculationDetails, setShowCalculationDetails] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({
        from: filters.fromDate,
        to: filters.toDate
      });

      const res = await readAdmin<any>(`reports/profit-loss?${q.toString()}`);
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

  const f = data.figures || {};
  const c = data.completeness || {};

  const handleExportCsv = () => {
    const headers = ['Financial Metric', 'Amount (₹) / Value', 'Explanation'];
    const rows = [
      ['Gross Sales', f.grossSales, 'Sales before discounts'],
      ['Bill Discounts', -f.discounts, 'Discounts granted on sales'],
      ['Customer Returns', -f.customerReturns, 'Refunded / credited returns'],
      ['Net Revenue', f.netRevenue, 'Gross Sales − Discounts − Returns'],
      ['Cost of Goods Sold (COGS)', -f.cogs, 'Acquisition cost of items sold'],
      ['Gross Profit', f.grossProfit, 'Net Revenue − COGS'],
      ['Gross Margin %', `${f.grossMarginPercent}%`, 'Gross Profit ÷ Net Revenue'],
      ['Recorded Operating Expenses', -f.operatingExpenses, 'Shop rent, staff, electricity etc.'],
      ['Damaged Stock Write-offs', -f.damagedWriteOffs, 'Customer return items not restocked'],
      ['Result After Recorded Expenses', f.resultAfterRecordedExpenses, 'Gross Profit − OPEX − Write-offs'],
      ['Owner Withdrawals (Separate)', f.ownerWithdrawals, 'Personal drawings (excluded from OPEX)'],
      ['Cost Snapshot Completeness', `${c.completenessPercent}%`, `${c.knownLines} of ${c.totalLines} lines with known cost`]
    ];
    downloadCsv(`Profit_and_Loss_${filters.fromDate}_to_${filters.toDate}`, headers, rows);
  };

  const summaryCards: MetricCardItem[] = useMemo(() => [
    {
      label: 'Net Revenue',
      value: f.netRevenue,
      subtext: 'Gross Sales − Discounts − Returns',
      variant: 'info'
    },
    {
      label: 'Cost of Goods Sold',
      value: f.cogs,
      subtext: 'Product cost of sold units',
      variant: 'default'
    },
    {
      label: 'Gross Profit',
      value: f.grossProfit,
      subtext: `Margin: ${f.grossMarginPercent || 0}%`,
      variant: f.grossProfit >= 0 ? 'positive' : 'negative'
    },
    {
      label: 'Operating Expenses',
      value: f.operatingExpenses,
      subtext: 'Rent, salaries, utility expenses',
      variant: 'warning'
    },
    {
      label: 'Result After Expenses',
      value: f.resultAfterRecordedExpenses,
      subtext: 'Gross Profit − OPEX − Write-offs',
      variant: f.resultAfterRecordedExpenses >= 0 ? 'positive' : 'negative'
    }
  ], [f]);

  return (
    <>
      <ReportHeader
        title="Profit & Loss Statement"
        description="Comprehensive financial performance based on actual sale-time purchase costs, operating expenses and return adjustments."
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

      {/* HISTORICAL COST LIMITATION BANNER */}
      {!c.isComplete && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 18px',
          background: '#FFFBEB',
          border: '1px solid #FDE68A',
          borderRadius: 8,
          marginBottom: 16,
          fontSize: 13,
          color: '#92400E'
        }}>
          <AlertCircle size={20} style={{ flexShrink: 0, color: '#D97706' }} />
          <div>
            <strong>Historical Cost Notice: </strong>
            {c.unknownLines} sale line item(s) in this period do not have a recorded purchase cost snapshot.
            Cost completeness is <strong>{c.completenessPercent}%</strong>. Profit figures reflect only items with known costs.
          </div>
        </div>
      )}

      <SummaryCards cards={summaryCards} />

      {/* DETAILED P&L BREAKDOWN TABLE */}
      <div className="report-table-panel" style={{ marginTop: 20 }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #DDE4ED', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#151526' }}>
              Income Statement Breakdown
            </h2>
            <small style={{ color: '#788398' }}>Period: {filters.fromDate} to {filters.toDate}</small>
          </div>
          <button
            type="button"
            className="report-btn secondary"
            style={{ fontSize: 12 }}
            onClick={() => setShowCalculationDetails(!showCalculationDetails)}
          >
            {showCalculationDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {showCalculationDetails ? 'Collapse Explanation' : 'Expand Explanation'}
          </button>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
          <tbody>
            {/* REVENUE SECTION */}
            <tr style={{ background: '#F8FAFC' }}>
              <td colSpan={2} style={{ padding: '10px 20px', fontWeight: 700, color: '#151526', textTransform: 'uppercase', fontSize: 12 }}>
                1. Revenue & Sales
              </td>
            </tr>
            <tr style={{ borderBottom: '1px solid #EDF2F7' }}>
              <td style={{ padding: '10px 20px 10px 40px' }}>
                Sales Before Discounts (Gross Revenue)
                {showCalculationDetails && <div style={{ fontSize: 11.5, color: '#788398' }}>Total catalog value of all delivered store and website sales</div>}
              </td>
              <td style={{ padding: '10px 20px', textAlign: 'right', fontWeight: 600 }}>{formatINR(f.grossSales)}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #EDF2F7' }}>
              <td style={{ padding: '10px 20px 10px 40px' }}>
                Less: Customer Discounts
                {showCalculationDetails && <div style={{ fontSize: 11.5, color: '#788398' }}>Promotional and line discounts deducted at billing</div>}
              </td>
              <td style={{ padding: '10px 20px', textAlign: 'right', color: '#D97706' }}>−{formatINR(f.discounts)}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #EDF2F7' }}>
              <td style={{ padding: '10px 20px 10px 40px' }}>
                Less: Customer Returns & Credit Notes
                {showCalculationDetails && <div style={{ fontSize: 11.5, color: '#788398' }}>Reversed sale revenue from accepted customer returns</div>}
              </td>
              <td style={{ padding: '10px 20px', textAlign: 'right', color: '#DC2626' }}>−{formatINR(f.customerReturns)}</td>
            </tr>
            <tr style={{ background: '#F1F5F9', borderBottom: '2px solid #CBD5E1', fontWeight: 700 }}>
              <td style={{ padding: '12px 20px 12px 40px', color: '#151526' }}>Net Revenue</td>
              <td style={{ padding: '12px 20px', textAlign: 'right', fontSize: 15, color: '#1E40AF' }}>{formatINR(f.netRevenue)}</td>
            </tr>

            {/* COGS SECTION */}
            <tr style={{ background: '#F8FAFC' }}>
              <td colSpan={2} style={{ padding: '10px 20px', fontWeight: 700, color: '#151526', textTransform: 'uppercase', fontSize: 12 }}>
                2. Cost of Sales
              </td>
            </tr>
            <tr style={{ borderBottom: '1px solid #EDF2F7' }}>
              <td style={{ padding: '10px 20px 10px 40px' }}>
                Cost of Goods Sold (COGS)
                {showCalculationDetails && <div style={{ fontSize: 11.5, color: '#788398' }}>Authoritative purchase acquisition cost captured atomically at sale time</div>}
              </td>
              <td style={{ padding: '10px 20px', textAlign: 'right', color: '#DC2626' }}>−{formatINR(f.cogs)}</td>
            </tr>
            <tr style={{ background: '#F1F5F9', borderBottom: '2px solid #CBD5E1', fontWeight: 700 }}>
              <td style={{ padding: '12px 20px 12px 40px', color: '#151526' }}>
                Gross Profit (Gross Margin: {f.grossMarginPercent}%)
              </td>
              <td style={{ padding: '12px 20px', textAlign: 'right', fontSize: 15, color: f.grossProfit >= 0 ? '#16A34A' : '#DC2626' }}>
                {formatINR(f.grossProfit)}
              </td>
            </tr>

            {/* EXPENSES & ADJUSTMENTS */}
            <tr style={{ background: '#F8FAFC' }}>
              <td colSpan={2} style={{ padding: '10px 20px', fontWeight: 700, color: '#151526', textTransform: 'uppercase', fontSize: 12 }}>
                3. Operating Expenses & Adjustments
              </td>
            </tr>
            <tr style={{ borderBottom: '1px solid #EDF2F7' }}>
              <td style={{ padding: '10px 20px 10px 40px' }}>
                Recorded Operating Expenses (OPEX)
                {showCalculationDetails && <div style={{ fontSize: 11.5, color: '#788398' }}>Daily shop expenses, utility bills, staff costs</div>}
              </td>
              <td style={{ padding: '10px 20px', textAlign: 'right', color: '#D97706' }}>−{formatINR(f.operatingExpenses)}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #EDF2F7' }}>
              <td style={{ padding: '10px 20px 10px 40px' }}>
                Damaged Goods / Return Write-offs
                {showCalculationDetails && <div style={{ fontSize: 11.5, color: '#788398' }}>Acquisition cost of non-restockable / defective customer return items</div>}
              </td>
              <td style={{ padding: '10px 20px', textAlign: 'right', color: '#DC2626' }}>−{formatINR(f.damagedWriteOffs)}</td>
            </tr>

            {/* FINAL RESULT */}
            <tr style={{ background: '#E2E8F0', borderTop: '2px solid #94A3B8', fontWeight: 700 }}>
              <td style={{ padding: '14px 20px', fontSize: 14.5, color: '#151526' }}>
                Result After Recorded Expenses & Adjustments
                <div style={{ fontSize: 11.5, color: '#64748B', fontWeight: 400 }}>
                  (Operating Gross Profit − Recorded Expenses − Write-offs)
                </div>
              </td>
              <td style={{
                padding: '14px 20px',
                textAlign: 'right',
                fontSize: 17,
                color: f.resultAfterRecordedExpenses >= 0 ? '#16A34A' : '#DC2626'
              }}>
                {formatINR(f.resultAfterRecordedExpenses)}
              </td>
            </tr>

            {/* NON-OPEX / DRAWINGS NOTICE */}
            <tr style={{ background: '#FAF5FF', borderTop: '1px dashed #D8B4FE' }}>
              <td style={{ padding: '10px 20px', fontSize: 12.5, color: '#6B21A8' }}>
                <strong>Note: Owner Withdrawals (Drawings):</strong> {formatINR(f.ownerWithdrawals)} recorded in this period.
                Personal owner drawings are balance sheet withdrawals and are not expensed against business profit.
              </td>
              <td style={{ padding: '10px 20px', textAlign: 'right', fontSize: 12.5, color: '#6B21A8', fontWeight: 600 }}>
                {formatINR(f.ownerWithdrawals)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

