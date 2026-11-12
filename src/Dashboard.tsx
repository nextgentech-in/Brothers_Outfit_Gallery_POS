import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  ShoppingBag,
  Truck,
  ArrowDownLeft,
  Receipt,
  ChevronDown,
  Package,
  UserPlus,
  Building2,
  RotateCcw,
  Barcode,
  Search,
  Lock,
  RefreshCw,
  Printer,
  Download,
  ArrowRight,
  Clock,
  AlertTriangle,
  CheckCircle2,
  MessageCircle,
  X,
  PieChart,
  FileSpreadsheet,
  Layers,
  UserCheck,
  CreditCard,
  DollarSign,
  TrendingUp,
  AlertCircle,
  WifiOff,
  Cake,
  Boxes,
  SlidersHorizontal,
  ChevronRight,
  type LucideIcon
} from 'lucide-react';

import { shopDate } from '../shared/customers';
import { readAdmin, writeAdmin } from './adminApi';
import { computeDatePreset, type DatePreset } from './reports/shared/ReportFilters';
import { queuedSales, syncQueuedSales, type QueuedSale } from './offlineQueue';

// Modals and dialog components
import { ProductFormDialog, type NewProductInput } from './ProductForm';
import { PurchaseReceive, type PurchaseInput } from './PurchaseReceive';
import { BarcodeBatch, type BatchLabelProduct } from './BarcodeBatch';
import { BillHistory } from './BillHistory';
import { AddSupplierDialog, SupplierPaymentDialog, ReceiptDialog } from './Commerce';
import { CreditForm } from './CreditView';
import { CreatePurchaseReturnModal } from './reports/transactions/SupplierReturnsReport';
import { RecordExpenseModal } from './reports/cash/ExpensesReport';
import { DailyClosingReport } from './reports/cash/DailyClosingReport';

interface DashboardProps {
  navigate: (tab: string) => void;
  role?: string;
}

export interface DashboardReportData {
  period: { from: string; to: string; channel: string };
  checkedAt: string;
  summary: {
    grossSales: number;
    discounts: number;
    customerReturns: number;
    netSales: number;
    taxCollected: number;
    cogs: number;
    grossProfit: number;
    grossMarginPercent: number;
    hasIncompleteCost: boolean;
    moneyReceived: number;
    customerOutstanding: number;
    purchasesReceived: number;
    supplierPayable: number;
    operatingExpenses: number;
    ownerWithdrawals: number;
  };
  inventory: {
    productCount: number;
    availableUnits: number;
    stockCostValue: number;
    stockRetailValue: number;
    stockGstValue: number;
    stockTotalWithGst: number;
    lowStockCount: number;
    outOfStockCount: number;
    lowStockItems: Array<{ id: string; name: string; sku: string; available: number; status: string }>;
  };
  channelBreakdown: {
    pos: { sales: number; count: number };
    website: { sales: number; count: number };
  };
  tasks: {
    overdueUdhar: Array<{ customerKey: string; name: string; phone: string; amount: number; totalBalance: number }>;
    dueTodayUdhar: Array<{ customerKey: string; name: string; phone: string; amount: number; totalBalance: number }>;
    supplierPaymentsDue: Array<{ purchaseId: string; supplierName: string; supplierInvoice: string; payable: number; date: string | null }>;
    pendingOrders: Array<{ id: string; customer: string; total: number; status: string; date: string | null }>;
    pendingRefunds: Array<{ returnId: string; orderId: string; amount: number }>;
    birthdaysToday: Array<{ name: string; phone: string; dateOfBirth: string }>;
    lowStock: Array<{ id: string; name: string; sku: string; available: number; status: string }>;
  };
}

const money = (v: number) => `₹${Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function Dashboard({ navigate, role = 'owner' }: DashboardProps) {
  const [data, setData] = useState<DashboardReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Date & Channel Filters
  const [preset, setPreset] = useState<DatePreset>('today');
  const [fromDate, setFromDate] = useState(() => shopDate());
  const [toDate, setToDate] = useState(() => shopDate());
  const [channel, setChannel] = useState(''); // '' = all, 'pos', 'website'
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Offline bills on this device
  const [offlineSales, setOfflineSales] = useState<QueuedSale[]>([]);

  // Dropdown & Task expansion states
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});

  // Modals
  const [receiveUdharOpen, setReceiveUdharOpen] = useState(false);
  const [receiveUdharCustomer, setReceiveUdharCustomer] = useState<{ key: string; name: string; phone: string; balance: number } | null>(null);
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [addSupplierOpen, setAddSupplierOpen] = useState(false);
  const [paySupplierOpen, setPaySupplierOpen] = useState(false);
  const [paySupplierId, setPaySupplierId] = useState<string | null>(null);
  const [supplierReturnOpen, setSupplierReturnOpen] = useState(false);
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
  const [findBillOpen, setFindBillOpen] = useState(false);
  const [dailyClosingOpen, setDailyClosingOpen] = useState(false);
  const [receiptInvoice, setReceiptInvoice] = useState<any | null>(null);

  // Role permissions
  const isCashier = role === 'cashier';
  const canViewFinancials = role === 'owner' || role === 'manager';

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setMoreActionsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Check offline queue
  const refreshOffline = useCallback(async () => {
    try {
      const q = await queuedSales();
      setOfflineSales(q);
    } catch {
      // IndexedDB may be unavailable in private browsing
    }
  }, []);

  // Main Dashboard Data Fetch
  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({
        from: fromDate,
        to: toDate,
        ...(channel ? { channel } : {})
      });
      const res = await readAdmin<DashboardReportData>(`reports/dashboard-summary?${query.toString()}`);
      setData(res);
      setLastUpdated(new Date());
    } catch (err) {
      setError((err as Error).message || 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
      void refreshOffline();
    }
  }, [fromDate, toDate, channel, refreshOffline]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  // Handle Preset Changes
  const handlePresetSelect = (newPreset: DatePreset) => {
    setPreset(newPreset);
    if (newPreset !== 'custom') {
      const computed = computeDatePreset(newPreset);
      setFromDate(computed.fromDate);
      setToDate(computed.toDate);
    }
  };

  // Export Summary to CSV
  const handleExportSummaryCsv = () => {
    if (!data) return;
    const lines = [
      `Brothers Outfit Gallery - Daily Operations Summary`,
      `Period: ${fromDate} to ${toDate}`,
      `Sales Channel: ${channel ? channel.toUpperCase() : 'All Channels'}`,
      `Generated At: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`,
      ``,
      `--- PERIOD FINANCIAL SUMMARY ---`,
      `Gross Sales,${data.summary.grossSales}`,
      `Discounts Given,${data.summary.discounts}`,
      `Customer Returns,${data.summary.customerReturns}`,
      `Net Sales,${data.summary.netSales}`,
      `Cost of Goods Sold (COGS),${canViewFinancials ? data.summary.cogs : 'Restricted'}`,
      `Gross Profit,${canViewFinancials ? data.summary.grossProfit : 'Restricted'}`,
      `Gross Margin %,${canViewFinancials ? `${data.summary.grossMarginPercent}%` : 'Restricted'}`,
      `Tax Collected,${data.summary.taxCollected}`,
      `Total Money Received (Collections),${data.summary.moneyReceived}`,
      `Purchases Received,${canViewFinancials ? data.summary.purchasesReceived : 'Restricted'}`,
      `Operating Expenses,${canViewFinancials ? data.summary.operatingExpenses : 'Restricted'}`,
      `Owner Withdrawals,${role === 'owner' ? data.summary.ownerWithdrawals : 'Restricted'}`,
      ``,
      `--- CURRENT STANDING BALANCES ---`,
      `Customer Outstanding (Total Udhar),${data.summary.customerOutstanding}`,
      `Supplier Payable (Unsettled Dues),${canViewFinancials ? data.summary.supplierPayable : 'Restricted'}`,
      ``,
      `--- REAL-TIME INVENTORY STATUS ---`,
      `Available Stock Units,${data.inventory.availableUnits}`,
      `Stock Cost Value,${canViewFinancials ? data.inventory.stockCostValue : 'Restricted'}`,
      `Stock Selling Value Excluding GST,${data.inventory.stockRetailValue}`,
      `Stock GST Value,${data.inventory.stockGstValue}`,
      `Stock Selling Value Including GST,${data.inventory.stockTotalWithGst}`,
      `Low Stock Items Count (1-5 units),${data.inventory.lowStockCount}`,
      `Out of Stock Items Count (0 units),${data.inventory.outOfStockCount}`,
      ``,
      `--- SALES CHANNEL BREAKDOWN ---`,
      `POS (In-Store) Sales,${data.channelBreakdown.pos.sales},Bills: ${data.channelBreakdown.pos.count}`,
      `Website (Online) Sales,${data.channelBreakdown.website.sales},Orders: ${data.channelBreakdown.website.count}`
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Brothers_POS_Summary_${fromDate}_to_${toDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // WhatsApp Actions
  const handleWhatsAppReminder = (task: { phone: string; name: string; amount: number; totalBalance: number }) => {
    const raw = (task.phone || '').replace(/[^0-9]/g, '');
    const phone = raw.length === 10 ? `91${raw}` : raw;
    const msg = `Hello ${task.name},\n\nFriendly reminder from Brothers Outfit Gallery regarding your payment of ₹${task.amount.toLocaleString('en-IN')}.\n\nTotal balance: ₹${task.totalBalance.toLocaleString('en-IN')}.\n\nPlease let us know when convenient to settle. Thank you!`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const handleWhatsAppBirthday = (task: { phone: string; name: string }) => {
    const raw = (task.phone || '').replace(/[^0-9]/g, '');
    const phone = raw.length === 10 ? `91${raw}` : raw;
    const msg = `Happy Birthday ${task.name}! 🎉🎂\n\nWishing you a wonderful day and a blessed year ahead from the entire team at Brothers Outfit Gallery! Visit our store today for a special birthday discount.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  // Toggle tasks view all
  const toggleTaskExpand = (key: string) => {
    setExpandedTasks(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Open report in Reports workspace
  const openReport = (reportId: string) => {
    const url = new URL(window.location.href);
    url.pathname = '/reports';
    url.searchParams.set('report', reportId);
    window.history.pushState(null, '', url.toString());
    navigate('reports');
  };

  // Channel percentages
  const channelMetrics = useMemo(() => {
    if (!data) return { posPercent: 50, webPercent: 50, total: 0 };
    const pos = data.channelBreakdown.pos.sales;
    const web = data.channelBreakdown.website.sales;
    const total = pos + web;
    if (total <= 0) return { posPercent: 50, webPercent: 50, total: 0 };
    return {
      posPercent: Math.round((pos / total) * 100),
      webPercent: Math.round((web / total) * 100),
      total
    };
  }, [data]);

  // Tasks counts
  const totalTasksCount = useMemo(() => {
    if (!data) return 0;
    let count = 0;
    count += data.tasks.overdueUdhar.length;
    count += data.tasks.dueTodayUdhar.length;
    if (canViewFinancials) count += data.tasks.supplierPaymentsDue.length;
    count += data.tasks.lowStock.length;
    count += data.tasks.pendingOrders.length;
    count += data.tasks.pendingRefunds.length;
    count += data.tasks.birthdaysToday.length;
    count += offlineSales.length;
    return count;
  }, [data, canViewFinancials, offlineSales]);

  return (
    <div className="dashboard-root">
      {/* 1. TOP HEADER & QUICK ACTIONS */}
      <header className="dashboard-top-header">
        <div className="dashboard-title-area">
          <span className="eyebrow">STORE OPERATIONS & COMMAND CENTER</span>
          <h1>Daily Operations Workspace</h1>
          <p>Daily shop operations, real-time business summaries, customer dues, inventory tasks and financial reports.</p>
        </div>

        <div className="dashboard-quick-actions">
          {/* Primary Action Buttons */}
          <button
            type="button"
            className="button primary"
            onClick={() => navigate('pos')}
            title="Create a new sale or invoice"
          >
            <ShoppingBag size={18} />
            <span>New Bill</span>
          </button>

          {!isCashier && (
            <button
              type="button"
              className="button secondary"
              onClick={() => setPurchaseModalOpen(true)}
              title="Record incoming stock from a supplier"
            >
              <Truck size={17} />
              <span>Add Purchase</span>
            </button>
          )}

          <button
            type="button"
            className="button secondary"
            style={{ color: '#10B981', borderColor: 'rgba(16, 185, 129, 0.4)' }}
            onClick={() => {
              setReceiveUdharCustomer(null);
              setReceiveUdharOpen(true);
            }}
            title="Record customer credit repayment"
          >
            <ArrowDownLeft size={17} />
            <span>Receive Udhar Payment</span>
          </button>

          {!isCashier && (
            <button
              type="button"
              className="button secondary"
              onClick={() => setExpenseModalOpen(true)}
              title="Record store expense or withdrawal"
            >
              <Receipt size={17} />
              <span>Add Expense</span>
            </button>
          )}

          {/* More Actions Dropdown */}
          <div className="dashboard-dropdown" ref={dropdownRef}>
            <button
              type="button"
              className="button secondary"
              onClick={() => setMoreActionsOpen(!moreActionsOpen)}
              aria-expanded={moreActionsOpen}
            >
              <span>More Actions</span>
              <ChevronDown size={15} />
            </button>

            {moreActionsOpen && (
              <div className="dashboard-dropdown-menu">
                <button
                  type="button"
                  className="dashboard-dropdown-item"
                  onClick={() => {
                    setMoreActionsOpen(false);
                    setAddProductOpen(true);
                  }}
                >
                  <Package size={16} />
                  <span>Add Product</span>
                </button>

                <button
                  type="button"
                  className="dashboard-dropdown-item"
                  onClick={() => {
                    setMoreActionsOpen(false);
                    setAddCustomerOpen(true);
                  }}
                >
                  <UserPlus size={16} />
                  <span>Add Customer</span>
                </button>

                {!isCashier && (
                  <button
                    type="button"
                    className="dashboard-dropdown-item"
                    onClick={() => {
                      setMoreActionsOpen(false);
                      setAddSupplierOpen(true);
                    }}
                  >
                    <Building2 size={16} />
                    <span>Add Supplier</span>
                  </button>
                )}

                <div className="dashboard-dropdown-divider" />

                <button
                  type="button"
                  className="dashboard-dropdown-item"
                  onClick={() => {
                    setMoreActionsOpen(false);
                    setFindBillOpen(true);
                  }}
                >
                  <Search size={16} />
                  <span>Find Bill</span>
                </button>

                <button
                  type="button"
                  className="dashboard-dropdown-item"
                  onClick={() => {
                    setMoreActionsOpen(false);
                    setFindBillOpen(true);
                  }}
                >
                  <RotateCcw size={16} />
                  <span>Customer Return / Exchange</span>
                </button>

                {!isCashier && (
                  <button
                    type="button"
                    className="dashboard-dropdown-item"
                    onClick={() => {
                      setMoreActionsOpen(false);
                      setSupplierReturnOpen(true);
                    }}
                  >
                    <Truck size={16} />
                    <span>Supplier Purchase Return</span>
                  </button>
                )}

                <button
                  type="button"
                  className="dashboard-dropdown-item"
                  onClick={() => {
                    setMoreActionsOpen(false);
                    setBarcodeModalOpen(true);
                  }}
                >
                  <Barcode size={16} />
                  <span>Print Barcode Labels</span>
                </button>

                {!isCashier && (
                  <button
                    type="button"
                    className="dashboard-dropdown-item"
                    onClick={() => {
                      setMoreActionsOpen(false);
                      setDailyClosingOpen(true);
                    }}
                  >
                    <Lock size={16} />
                    <span>Daily Cash Closing</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* NOTICES & ALERTS */}
      {error && (
        <div className="error-banner" role="alert">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button type="button" onClick={() => void loadDashboard()}>Retry</button>
        </div>
      )}

      {notice && (
        <div className="success-banner" role="status" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={18} />
            <span>{notice}</span>
          </div>
          <button type="button" className="icon-button" onClick={() => setNotice('')}>×</button>
        </div>
      )}

      {/* 2. SHARED DATE & CHANNEL FILTERS */}
      <section className="dashboard-filters-card" aria-label="Shared Date & Channel Filters">
        <div className="dashboard-filters-top">
          <div className="dashboard-preset-group">
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginRight: 4 }}>
              <SlidersHorizontal size={14} style={{ display: 'inline', marginRight: 4 }} />
              Preset:
            </span>
            {(['today', 'yesterday', 'last7', 'thisMonth', 'lastMonth', 'fy', 'custom'] as DatePreset[]).map(p => {
              const labels: Record<DatePreset, string> = {
                today: 'Today',
                yesterday: 'Yesterday',
                last7: 'Last 7 Days',
                thisMonth: 'This Month',
                lastMonth: 'Last Month',
                fy: 'Financial Year',
                custom: 'Custom Range'
              };
              return (
                <button
                  key={p}
                  type="button"
                  className={`dashboard-preset-btn ${preset === p ? 'active' : ''}`}
                  onClick={() => handlePresetSelect(p)}
                >
                  {labels[p]}
                </button>
              );
            })}
          </div>

          <div className="dashboard-last-updated">
            <Clock size={14} />
            <span>Updated {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} IST</span>
          </div>
        </div>

        <div className="dashboard-filters-bottom">
          <div className="dashboard-date-inputs">
            <label>
              From:
              <input
                type="date"
                value={fromDate}
                onChange={e => {
                  setPreset('custom');
                  setFromDate(e.target.value);
                }}
              />
            </label>

            <label>
              To:
              <input
                type="date"
                value={toDate}
                onChange={e => {
                  setPreset('custom');
                  setToDate(e.target.value);
                }}
              />
            </label>

            <label style={{ marginLeft: 6 }}>
              Channel:
              <select
                className="dashboard-channel-select"
                value={channel}
                onChange={e => setChannel(e.target.value)}
              >
                <option value="">All Channels</option>
                <option value="pos">POS (In-Store)</option>
                <option value="website">Website (Online)</option>
              </select>
            </label>
          </div>

          <div className="dashboard-filter-actions">
            <button
              type="button"
              className="button secondary"
              onClick={() => void loadDashboard()}
              disabled={loading}
              title="Refresh metrics with latest data"
            >
              <RefreshCw size={14} className={loading ? 'spinning' : ''} />
              <span>{loading ? 'Refreshing…' : 'Refresh'}</span>
            </button>

            <button
              type="button"
              className="button secondary"
              onClick={handleExportSummaryCsv}
              disabled={!data}
              title="Export current summary metrics to CSV"
            >
              <Download size={14} />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              className="button secondary"
              onClick={() => window.print()}
              title="Print dashboard summary"
            >
              <Printer size={14} />
              <span>Print</span>
            </button>
          </div>
        </div>
      </section>

      {/* 3. BUSINESS SUMMARY CARDS */}
      <section aria-label="Business Key Performance Indicators">
        <div className="dashboard-section-heading">
          <h2>
            <TrendingUp size={20} style={{ color: 'var(--accent)' }} />
            Business Summary
          </h2>
          <span className="dashboard-badge-indicator">
            Period: {fromDate} to {toDate} {channel ? `· ${channel.toUpperCase()}` : ''}
          </span>
        </div>

        {/* 8 Primary Cards */}
        <div className="dashboard-kpi-grid">
          {/* 1. Net Sales */}
          <div className="dashboard-kpi-card" onClick={() => openReport('sales')}>
            <div className="dashboard-kpi-top">
              <span className="dashboard-kpi-label">Net Sales</span>
              <div className="dashboard-kpi-icon"><ShoppingBag size={18} /></div>
            </div>
            <div className="dashboard-kpi-value gold">
              {data ? money(data.summary.netSales) : '—'}
            </div>
            <div className="dashboard-kpi-subtext">
              Gross: {data ? money(data.summary.grossSales) : '—'} · Dis: {data ? money(data.summary.discounts) : '—'}
            </div>
          </div>

          {/* 2. Gross Profit */}
          {canViewFinancials ? (
            <div className="dashboard-kpi-card" onClick={() => openReport('profit_loss')}>
              <div className="dashboard-kpi-top">
                <span className="dashboard-kpi-label">Gross Profit</span>
                <div className="dashboard-kpi-icon"><PieChart size={18} /></div>
              </div>
              <div className="dashboard-kpi-value green">
                {data ? money(data.summary.grossProfit) : '—'}
              </div>
              <div className="dashboard-kpi-subtext">
                {data ? `${data.summary.grossMarginPercent}% margin` : '—'}
                {data?.summary.hasIncompleteCost && (
                  <span style={{ color: '#d9534f', display: 'block' }}>⚠️ Missing cost price on some items</span>
                )}
              </div>
            </div>
          ) : (
            <div className="dashboard-kpi-card">
              <div className="dashboard-kpi-top">
                <span className="dashboard-kpi-label">Historical Sales Tax</span>
                <div className="dashboard-kpi-icon"><Receipt size={18} /></div>
              </div>
              <div className="dashboard-kpi-value">
                {data ? money(data.summary.taxCollected) : '—'}
              </div>
              <div className="dashboard-kpi-subtext">Tax recorded on earlier sales in period</div>
            </div>
          )}

          {/* 3. Money Received */}
          <div className="dashboard-kpi-card" onClick={() => openReport('cash_flow')}>
            <div className="dashboard-kpi-top">
              <span className="dashboard-kpi-label">Money Received</span>
              <div className="dashboard-kpi-icon"><DollarSign size={18} /></div>
            </div>
            <div className="dashboard-kpi-value green">
              {data ? money(data.summary.moneyReceived) : '—'}
            </div>
            <div className="dashboard-kpi-subtext">
              Sales cash/UPI + Udhar repayments - Refunds
            </div>
          </div>

          {/* 4. Customer Outstanding (Current Balance) */}
          <div className="dashboard-kpi-card" onClick={() => openReport('outstanding_udhar')}>
            <div className="dashboard-kpi-top">
              <span className="dashboard-kpi-label">Customer Udhar</span>
              <div className="dashboard-kpi-icon"><Clock size={18} /></div>
            </div>
            <div className={`dashboard-kpi-value ${(data?.summary.customerOutstanding || 0) > 0 ? 'red' : ''}`}>
              {data ? money(data.summary.customerOutstanding) : '—'}
            </div>
            <div className="dashboard-kpi-subtext">
              Current total owed by customers across all ledgers
            </div>
          </div>

          {/* 5. Purchases Received */}
          {canViewFinancials ? (
            <div className="dashboard-kpi-card" onClick={() => openReport('purchases')}>
              <div className="dashboard-kpi-top">
                <span className="dashboard-kpi-label">Purchases Received</span>
                <div className="dashboard-kpi-icon"><Truck size={18} /></div>
              </div>
              <div className="dashboard-kpi-value">
                {data ? money(data.summary.purchasesReceived) : '—'}
              </div>
              <div className="dashboard-kpi-subtext">
                Stock received from vendors in selected period
              </div>
            </div>
          ) : (
            <div className="dashboard-kpi-card" onClick={() => navigate('pos')}>
              <div className="dashboard-kpi-top">
                <span className="dashboard-kpi-label">Total Bills</span>
                <div className="dashboard-kpi-icon"><ShoppingBag size={18} /></div>
              </div>
              <div className="dashboard-kpi-value gold">
                {data ? (data.channelBreakdown.pos.count + data.channelBreakdown.website.count).toLocaleString('en-IN') : '—'}
              </div>
              <div className="dashboard-kpi-subtext">POS + website orders in period</div>
            </div>
          )}

          {/* 6. Supplier Payable (Current Balance) */}
          {canViewFinancials && (
            <div className="dashboard-kpi-card" onClick={() => openReport('supplier_payables')}>
              <div className="dashboard-kpi-top">
                <span className="dashboard-kpi-label">Supplier Payable</span>
                <div className="dashboard-kpi-icon"><CreditCard size={18} /></div>
              </div>
              <div className={`dashboard-kpi-value ${(data?.summary.supplierPayable || 0) > 0 ? 'red' : ''}`}>
                {data ? money(data.summary.supplierPayable) : '—'}
              </div>
              <div className="dashboard-kpi-subtext">
                Current unpaid balance owed to suppliers
              </div>
            </div>
          )}

          {/* 7. Expenses */}
          {canViewFinancials && (
            <div className="dashboard-kpi-card" onClick={() => openReport('expenses')}>
              <div className="dashboard-kpi-top">
                <span className="dashboard-kpi-label">Expenses</span>
                <div className="dashboard-kpi-icon"><Receipt size={18} /></div>
              </div>
              <div className="dashboard-kpi-value red">
                {data ? money(data.summary.operatingExpenses + data.summary.ownerWithdrawals) : '—'}
              </div>
              <div className="dashboard-kpi-subtext">
                Operating: {data ? money(data.summary.operatingExpenses) : '—'}
                {role === 'owner' ? ` · Withdrawals: ${data ? money(data.summary.ownerWithdrawals) : '—'}` : ''}
              </div>
            </div>
          )}

          {/* 8. Customer Returns */}
          <div className="dashboard-kpi-card" onClick={() => openReport('customer_returns')}>
            <div className="dashboard-kpi-top">
              <span className="dashboard-kpi-label">Customer Returns</span>
              <div className="dashboard-kpi-icon"><RotateCcw size={18} /></div>
            </div>
            <div className="dashboard-kpi-value">
              {data ? money(data.summary.customerReturns) : '—'}
            </div>
            <div className="dashboard-kpi-subtext">
              Goods returned or exchanged by customers in period
            </div>
          </div>
        </div>

        {/* 4 Secondary Inventory Cards */}
        <div style={{ marginTop: 14 }}>
          <div className="dashboard-inventory-grid">
            <div className="dashboard-inv-card" onClick={() => navigate('inventory')}>
              <div className="dashboard-inv-info">
                <strong>{data ? data.inventory.availableUnits.toLocaleString('en-IN') : '—'} units</strong>
                <small>{data ? `${data.inventory.productCount} products · ` : ''}Available stock units</small>
              </div>
              <Boxes size={22} style={{ color: 'var(--accent)' }} />
            </div>

            {canViewFinancials && (
              <div className="dashboard-inv-card" onClick={() => navigate('inventory')}>
                <div className="dashboard-inv-info">
                  <strong>{data ? money(data.inventory.stockCostValue) : '—'}</strong>
                  <small>Stock Value at Purchase Cost</small>
                </div>
                <Truck size={22} style={{ color: '#10B981' }} />
              </div>
            )}

            <div className="dashboard-inv-card" onClick={() => navigate('inventory')}>
              <div className="dashboard-inv-info">
                <strong>{data ? money(data.inventory.stockRetailValue) : '—'}</strong>
                <small>Stock selling value · excluding GST</small>
              </div>
              <ShoppingBag size={22} style={{ color: 'var(--accent)' }} />
            </div>

            <div className="dashboard-inv-card" onClick={() => navigate('inventory')}>
              <div className="dashboard-inv-info"><strong>{data ? money(data.inventory.stockGstValue) : '—'}</strong><small>GST on stock at selling price</small></div>
              <ShoppingBag size={22} style={{ color: 'var(--accent)' }} />
            </div>
            <div className="dashboard-inv-card" onClick={() => navigate('inventory')}>
              <div className="dashboard-inv-info"><strong>{data ? money(data.inventory.stockTotalWithGst) : '—'}</strong><small>Stock selling value · including GST</small></div>
              <ShoppingBag size={22} style={{ color: 'var(--accent)' }} />
            </div>

            <div className="dashboard-inv-card" onClick={() => navigate('inventory')}>
              <div className="dashboard-inv-info">
                <strong style={{ color: (data?.inventory.outOfStockCount || 0) > 0 ? '#EF4444' : 'var(--text)' }}>
                  {data ? (data.inventory.lowStockCount + data.inventory.outOfStockCount) : '—'} items
                </strong>
                <small>
                  {data ? `${data.inventory.outOfStockCount} out of stock · ${data.inventory.lowStockCount} low stock` : 'Low / Out of stock'}
                </small>
              </div>
              <AlertTriangle size={22} style={{ color: '#EF4444' }} />
            </div>
          </div>
        </div>
      </section>

      {/* 4. NEEDS ATTENTION / TODAY'S TASKS */}
      <section className="dashboard-tasks-section" aria-label="Today's Priority Tasks and Alerts">
        <div className="dashboard-section-heading">
          <h2>
            <AlertCircle size={20} style={{ color: totalTasksCount > 0 ? '#EF4444' : '#10B981' }} />
            Needs Attention · Today's Tasks
          </h2>
          <span className={`dashboard-badge-indicator ${totalTasksCount > 0 ? '' : 'green'}`} style={{ borderColor: totalTasksCount > 0 ? '#EF4444' : '#10B981', color: totalTasksCount > 0 ? '#EF4444' : '#10B981' }}>
            {totalTasksCount > 0 ? `${totalTasksCount} Action Items` : 'All Caught Up 🎉'}
          </span>
        </div>

        <div className="dashboard-tasks-grid">
          {/* Task 1: Overdue Udhar */}
          {data && data.tasks.overdueUdhar.length > 0 && (
            <div className="dashboard-task-card urgent">
              <div className="dashboard-task-header">
                <div className="dashboard-task-title">
                  <Clock size={16} style={{ color: '#EF4444' }} />
                  <span>Overdue Udhar Payments</span>
                </div>
                <span className="dashboard-task-badge red">
                  {data.tasks.overdueUdhar.length} Overdue
                </span>
              </div>
              <div className="dashboard-task-items">
                {(expandedTasks['overdue'] ? data.tasks.overdueUdhar : data.tasks.overdueUdhar.slice(0, 5)).map(cust => (
                  <div key={cust.customerKey} className="dashboard-task-item">
                    <div className="dashboard-task-item-desc">
                      <strong>{cust.name}</strong>
                      <small>{cust.phone} · Overdue: <span style={{ color: '#EF4444', fontWeight: 700 }}>{money(cust.amount)}</span> (Total: {money(cust.totalBalance)})</small>
                    </div>
                    <div className="dashboard-task-actions">
                      <button
                        type="button"
                        className="dashboard-task-btn green"
                        onClick={() => {
                          setReceiveUdharCustomer({ key: cust.customerKey, name: cust.name, phone: cust.phone, balance: cust.totalBalance });
                          setReceiveUdharOpen(true);
                        }}
                        title="Record repayment"
                      >
                        Receive
                      </button>
                      <button
                        type="button"
                        className="dashboard-task-btn"
                        onClick={() => handleWhatsAppReminder(cust)}
                        title="Send WhatsApp payment reminder"
                      >
                        <MessageCircle size={12} />
                        WhatsApp
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {data.tasks.overdueUdhar.length > 5 && (
                <button
                  type="button"
                  className="dashboard-task-view-all"
                  onClick={() => toggleTaskExpand('overdue')}
                >
                  {expandedTasks['overdue'] ? 'Show less' : `View all ${data.tasks.overdueUdhar.length} overdue →`}
                </button>
              )}
            </div>
          )}

          {/* Task 2: Udhar Due Today */}
          {data && data.tasks.dueTodayUdhar.length > 0 && (
            <div className="dashboard-task-card warning">
              <div className="dashboard-task-header">
                <div className="dashboard-task-title">
                  <Clock size={16} style={{ color: 'var(--accent)' }} />
                  <span>Udhar Payments Due Today</span>
                </div>
                <span className="dashboard-task-badge gold">
                  {data.tasks.dueTodayUdhar.length} Due
                </span>
              </div>
              <div className="dashboard-task-items">
                {(expandedTasks['dueToday'] ? data.tasks.dueTodayUdhar : data.tasks.dueTodayUdhar.slice(0, 5)).map(cust => (
                  <div key={cust.customerKey} className="dashboard-task-item">
                    <div className="dashboard-task-item-desc">
                      <strong>{cust.name}</strong>
                      <small>{cust.phone} · Due Today: <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{money(cust.amount)}</span></small>
                    </div>
                    <div className="dashboard-task-actions">
                      <button
                        type="button"
                        className="dashboard-task-btn green"
                        onClick={() => {
                          setReceiveUdharCustomer({ key: cust.customerKey, name: cust.name, phone: cust.phone, balance: cust.totalBalance });
                          setReceiveUdharOpen(true);
                        }}
                      >
                        Receive
                      </button>
                      <button
                        type="button"
                        className="dashboard-task-btn"
                        onClick={() => handleWhatsAppReminder(cust)}
                      >
                        <MessageCircle size={12} />
                        WhatsApp
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {data.tasks.dueTodayUdhar.length > 5 && (
                <button
                  type="button"
                  className="dashboard-task-view-all"
                  onClick={() => toggleTaskExpand('dueToday')}
                >
                  {expandedTasks['dueToday'] ? 'Show less' : `View all ${data.tasks.dueTodayUdhar.length} due today →`}
                </button>
              )}
            </div>
          )}

          {/* Task 3: Supplier Payments Due */}
          {canViewFinancials && data && data.tasks.supplierPaymentsDue.length > 0 && (
            <div className="dashboard-task-card urgent">
              <div className="dashboard-task-header">
                <div className="dashboard-task-title">
                  <CreditCard size={16} style={{ color: '#EF4444' }} />
                  <span>Unpaid Supplier Invoices</span>
                </div>
                <span className="dashboard-task-badge red">
                  {data.tasks.supplierPaymentsDue.length} Invoices
                </span>
              </div>
              <div className="dashboard-task-items">
                {(expandedTasks['suppDues'] ? data.tasks.supplierPaymentsDue : data.tasks.supplierPaymentsDue.slice(0, 5)).map(inv => (
                  <div key={inv.purchaseId} className="dashboard-task-item">
                    <div className="dashboard-task-item-desc">
                      <strong>{inv.supplierName}</strong>
                      <small>Inv: {inv.supplierInvoice} · Payable: <span style={{ color: '#EF4444', fontWeight: 700 }}>{money(inv.payable)}</span></small>
                    </div>
                    <div className="dashboard-task-actions">
                      <button
                        type="button"
                        className="dashboard-task-btn primary"
                        onClick={() => {
                          setPaySupplierId(inv.purchaseId);
                          setPaySupplierOpen(true);
                        }}
                      >
                        Pay Supplier
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {data.tasks.supplierPaymentsDue.length > 5 && (
                <button
                  type="button"
                  className="dashboard-task-view-all"
                  onClick={() => toggleTaskExpand('suppDues')}
                >
                  {expandedTasks['suppDues'] ? 'Show less' : `View all ${data.tasks.supplierPaymentsDue.length} invoices →`}
                </button>
              )}
            </div>
          )}

          {/* Task 4: Low & Out-of-Stock Alerts */}
          {data && data.tasks.lowStock.length > 0 && (
            <div className="dashboard-task-card warning">
              <div className="dashboard-task-header">
                <div className="dashboard-task-title">
                  <Boxes size={16} style={{ color: 'var(--accent)' }} />
                  <span>Low Stock & Depleted Items</span>
                </div>
                <span className="dashboard-task-badge gold">
                  {data.tasks.lowStock.length} Items
                </span>
              </div>
              <div className="dashboard-task-items">
                {(expandedTasks['lowStock'] ? data.tasks.lowStock : data.tasks.lowStock.slice(0, 5)).map(item => (
                  <div key={`${item.id}-${item.sku}`} className="dashboard-task-item">
                    <div className="dashboard-task-item-desc">
                      <strong>{item.name}</strong>
                      <small>SKU: {item.sku} · <span style={{ color: item.available === 0 ? '#EF4444' : 'var(--accent)', fontWeight: 700 }}>{item.available} units left</span></small>
                    </div>
                    <div className="dashboard-task-actions">
                      {!isCashier && (
                        <button
                          type="button"
                          className="dashboard-task-btn primary"
                          onClick={() => setPurchaseModalOpen(true)}
                        >
                          Reorder
                        </button>
                      )}
                      <button
                        type="button"
                        className="dashboard-task-btn"
                        onClick={() => navigate('inventory')}
                      >
                        Inventory
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              {data.tasks.lowStock.length > 5 && (
                <button
                  type="button"
                  className="dashboard-task-view-all"
                  onClick={() => toggleTaskExpand('lowStock')}
                >
                  {expandedTasks['lowStock'] ? 'Show less' : `View all ${data.tasks.lowStock.length} items →`}
                </button>
              )}
            </div>
          )}

          {/* Task 5: Customer Birthdays Today */}
          {data && data.tasks.birthdaysToday.length > 0 && (
            <div className="dashboard-task-card info">
              <div className="dashboard-task-header">
                <div className="dashboard-task-title">
                  <Cake size={16} style={{ color: '#3B82F6' }} />
                  <span>Customer Birthdays Today 🎂</span>
                </div>
                <span className="dashboard-task-badge blue">
                  {data.tasks.birthdaysToday.length} Birthdays
                </span>
              </div>
              <div className="dashboard-task-items">
                {data.tasks.birthdaysToday.map((cust, idx) => (
                  <div key={idx} className="dashboard-task-item">
                    <div className="dashboard-task-item-desc">
                      <strong>{cust.name}</strong>
                      <small>{cust.phone} · Birthday Today</small>
                    </div>
                    <div className="dashboard-task-actions">
                      <button
                        type="button"
                        className="dashboard-task-btn"
                        onClick={() => handleWhatsAppBirthday(cust)}
                        title="Send Happy Birthday greeting with offer"
                      >
                        <MessageCircle size={12} />
                        WhatsApp Wish
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Task 6: Pending Online / Store Orders */}
          {data && data.tasks.pendingOrders.length > 0 && (
            <div className="dashboard-task-card info">
              <div className="dashboard-task-header">
                <div className="dashboard-task-title">
                  <ShoppingBag size={16} style={{ color: '#3B82F6' }} />
                  <span>Orders Pending Processing</span>
                </div>
                <span className="dashboard-task-badge blue">
                  {data.tasks.pendingOrders.length} Pending
                </span>
              </div>
              <div className="dashboard-task-items">
                {data.tasks.pendingOrders.map(ord => (
                  <div key={ord.id} className="dashboard-task-item">
                    <div className="dashboard-task-item-desc">
                      <strong>Order #{ord.id}</strong>
                      <small>{ord.customer} · {money(ord.total)} · Status: {ord.status}</small>
                    </div>
                    <div className="dashboard-task-actions">
                      <button
                        type="button"
                        className="dashboard-task-btn primary"
                        onClick={() => navigate('orders')}
                      >
                        View Order
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Task 7: Offline Bills on this Device */}
          {offlineSales.length > 0 && (
            <div className="dashboard-task-card urgent">
              <div className="dashboard-task-header">
                <div className="dashboard-task-title">
                  <WifiOff size={16} style={{ color: '#EF4444' }} />
                  <span>Offline Bills Pending Sync</span>
                </div>
                <span className="dashboard-task-badge red">
                  {offlineSales.length} Bills Queued
                </span>
              </div>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
                Bills were recorded without network connection and are queued locally on this device.
              </p>
              <div className="dashboard-task-actions" style={{ marginTop: 4 }}>
                <button
                  type="button"
                  className="dashboard-task-btn primary"
                  onClick={async () => {
                    try {
                      setNotice('Synchronizing offline bills with server…');
                      await syncQueuedSales(async sale => {
                        await writeAdmin('pos/sale', sale);
                      });
                      await refreshOffline();
                      void loadDashboard();
                      setNotice('Offline sales synced successfully.');
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  <RefreshCw size={12} /> Sync Now
                </button>
                <button
                  type="button"
                  className="dashboard-task-btn"
                  onClick={() => navigate('sync')}
                >
                  View Offline Queue
                </button>
              </div>
            </div>
          )}

          {/* Task 8: Pending Return Refunds */}
          {data && data.tasks.pendingRefunds.length > 0 && (
            <div className="dashboard-task-card warning">
              <div className="dashboard-task-header">
                <div className="dashboard-task-title">
                  <RotateCcw size={16} style={{ color: 'var(--accent)' }} />
                  <span>Return Refunds to Review</span>
                </div>
                <span className="dashboard-task-badge gold">
                  {data.tasks.pendingRefunds.length} Refunds
                </span>
              </div>
              <div className="dashboard-task-items">
                {data.tasks.pendingRefunds.map(ref => (
                  <div key={ref.returnId} className="dashboard-task-item">
                    <div className="dashboard-task-item-desc">
                      <strong>Return #{ref.returnId}</strong>
                      <small>Order #{ref.orderId} · Refund: {money(ref.amount)}</small>
                    </div>
                    <div className="dashboard-task-actions">
                      <button
                        type="button"
                        className="dashboard-task-btn primary"
                        onClick={() => setFindBillOpen(true)}
                      >
                        Record Refund
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* 5. OPTIONAL BUSINESS CHARTS & CHANNEL BREAKDOWN */}
      <details className="dashboard-advanced">
        <summary>More sales analysis</summary>
      <section className="dashboard-charts-grid" aria-label="Visual Business Insights">
        {/* Chart A: Sales Channel Breakdown */}
        <div className="dashboard-chart-card">
          <div className="dashboard-section-heading" style={{ marginBottom: 4 }}>
            <h2 style={{ fontSize: 16 }}>
              <Layers size={17} style={{ color: 'var(--accent)' }} />
              Sales Channel Breakdown
            </h2>
            <small style={{ color: 'var(--muted)' }}>In-Store vs Online</small>
          </div>

          <div className="dashboard-channel-bar-wrap">
            <div
              className="dashboard-channel-bar-pos"
              style={{ width: `${channelMetrics.posPercent}%` }}
              title={`POS: ${channelMetrics.posPercent}%`}
            />
            <div
              className="dashboard-channel-bar-web"
              style={{ width: `${channelMetrics.webPercent}%` }}
              title={`Website: ${channelMetrics.webPercent}%`}
            />
          </div>

          <div className="dashboard-channel-legend">
            <div className="dashboard-channel-legend-item">
              <span className="dashboard-channel-dot pos" />
              <div>
                <strong>POS (In-Store)</strong>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {data ? money(data.channelBreakdown.pos.sales) : '—'} ({data?.channelBreakdown.pos.count ?? 0} bills · {channelMetrics.posPercent}%)
                </div>
              </div>
            </div>

            <div className="dashboard-channel-legend-item" style={{ textAlign: 'right' }}>
              <span className="dashboard-channel-dot web" />
              <div>
                <strong>Website (Online)</strong>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                  {data ? money(data.channelBreakdown.website.sales) : '—'} ({data?.channelBreakdown.website.count ?? 0} orders · {channelMetrics.webPercent}%)
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Chart B: Sales vs Collections Comparison */}
        <div className="dashboard-chart-card">
          <div className="dashboard-section-heading" style={{ marginBottom: 4 }}>
            <h2 style={{ fontSize: 16 }}>
              <TrendingUp size={17} style={{ color: '#10B981' }} />
              Sales vs Actual Collections
            </h2>
            <small style={{ color: 'var(--muted)' }}>Selected Period</small>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: 'var(--muted)' }}>Net Sales (Billed):</span>
                <strong>{data ? money(data.summary.netSales) : '—'}</strong>
              </div>
              <div style={{ height: 8, background: 'var(--solid)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: '100%', height: '100%', background: 'var(--accent)' }} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: 'var(--muted)' }}>Money Collected:</span>
                <strong style={{ color: '#10B981' }}>{data ? money(data.summary.moneyReceived) : '—'}</strong>
              </div>
              <div style={{ height: 8, background: 'var(--solid)', borderRadius: 4, overflow: 'hidden' }}>
                <div
                  style={{
                    width: data && data.summary.netSales > 0
                      ? `${Math.min(100, Math.round((data.summary.moneyReceived / data.summary.netSales) * 100))}%`
                      : '0%',
                    height: '100%',
                    background: '#10B981'
                  }}
                />
              </div>
            </div>
          </div>

          <small style={{ fontSize: 11, color: 'var(--muted)' }}>
            Includes counter sales collections and Udhar recoveries minus customer refunds.
          </small>
        </div>
      </section>
      </details>

      {/* ===================================================================
          MODALS & QUICK ACTION WORKFLOWS
          =================================================================== */}

      {/* 1. RECEIVE UDHAR PAYMENT MODAL */}
      {receiveUdharOpen && (
        <ReceiveUdharModal
          initialCustomer={receiveUdharCustomer}
          onClose={() => setReceiveUdharOpen(false)}
          onSuccess={msg => {
            setReceiveUdharOpen(false);
            setNotice(msg);
            void loadDashboard();
          }}
        />
      )}

      {/* 2. ADD PURCHASE MODAL */}
      {purchaseModalOpen && (
        <PurchaseReceiveModal
          onClose={() => setPurchaseModalOpen(false)}
          onSuccess={() => {
            setPurchaseModalOpen(false);
            setNotice('Stock purchase received successfully.');
            void loadDashboard();
          }}
        />
      )}

      {/* 3. RECORD EXPENSE MODAL */}
      {expenseModalOpen && (
        <RecordExpenseModal
          onClose={() => setExpenseModalOpen(false)}
          onSuccess={() => {
            setExpenseModalOpen(false);
            setNotice('Expense recorded successfully.');
            void loadDashboard();
          }}
        />
      )}

      {/* 4. ADD PRODUCT MODAL */}
      {addProductOpen && (
        <ProductFormDialog
          onClose={() => setAddProductOpen(false)}
          onCreate={async (input: NewProductInput) => {
            await writeAdmin('products/create', input);
            setAddProductOpen(false);
            setNotice(`Product "${input.name}" created successfully.`);
            void loadDashboard();
          }}
        />
      )}

      {/* 5. ADD CUSTOMER MODAL */}
      {addCustomerOpen && (
        <CreditForm
          mode="customer"
          customer={null}
          onClose={() => setAddCustomerOpen(false)}
          onSaved={() => {
            setAddCustomerOpen(false);
            setNotice('Customer profile created successfully.');
            void loadDashboard();
          }}
        />
      )}

      {/* 6. ADD SUPPLIER MODAL */}
      {addSupplierOpen && (
        <AddSupplierDialog
          onClose={() => setAddSupplierOpen(false)}
          onCreated={() => {
            setAddSupplierOpen(false);
            setNotice('Supplier added successfully.');
            void loadDashboard();
          }}
        />
      )}

      {/* 7. PAY SUPPLIER MODAL */}
      {paySupplierOpen && (
        <PaySupplierModal
          preselectedPurchaseId={paySupplierId}
          onClose={() => setPaySupplierOpen(false)}
          onSuccess={() => {
            setPaySupplierOpen(false);
            setNotice('Supplier payment recorded successfully.');
            void loadDashboard();
          }}
        />
      )}

      {/* 8. SUPPLIER PURCHASE RETURN MODAL */}
      {supplierReturnOpen && (
        <CreatePurchaseReturnModal
          onClose={() => setSupplierReturnOpen(false)}
          onSuccess={() => {
            setSupplierReturnOpen(false);
            setNotice('Supplier purchase return confirmed. Inventory deducted and payable adjusted.');
            void loadDashboard();
          }}
        />
      )}

      {/* 9. PRINT BARCODE LABELS MODAL */}
      {barcodeModalOpen && (
        <BarcodeModal
          onClose={() => setBarcodeModalOpen(false)}
        />
      )}

      {/* 10. FIND BILL & RETURNS MODAL */}
      {findBillOpen && (
        <div className="dashboard-modal-backdrop" onClick={() => setFindBillOpen(false)}>
          <div className="dashboard-modal-panel" style={{ width: 'min(980px, 96vw)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Find Bill & Process Returns</h2>
              <button type="button" className="icon-button" onClick={() => setFindBillOpen(false)}>×</button>
            </div>
            <BillHistory onInvoice={inv => setReceiptInvoice(inv)} />
          </div>
        </div>
      )}

      {/* 11. DAILY CASH CLOSING MODAL */}
      {dailyClosingOpen && (
        <div className="dashboard-modal-backdrop" onClick={() => setDailyClosingOpen(false)}>
          <div className="dashboard-modal-panel" style={{ width: 'min(800px, 96vw)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Daily Cash Drawer Closing</h2>
              <button type="button" className="icon-button" onClick={() => setDailyClosingOpen(false)}>×</button>
            </div>
            <DailyClosingReport />
          </div>
        </div>
      )}

      {/* 12. RECEIPT VIEWER / REPRINT DIALOG */}
      {receiptInvoice && (
        <ReceiptDialog
          invoice={receiptInvoice}
          shop={null}
          onClose={() => setReceiptInvoice(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HELPER MODALS
// ---------------------------------------------------------------------------

function ReceiveUdharModal({
  initialCustomer,
  onClose,
  onSuccess
}: {
  initialCustomer: { key: string; name: string; phone: string; balance: number } | null;
  onClose: () => void;
  onSuccess: (msg: string) => void;
}) {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState(initialCustomer?.key || '');
  const [amount, setAmount] = useState(initialCustomer && initialCustomer.balance > 0 ? String(initialCustomer.balance) : '');
  const [method, setMethod] = useState<'cash' | 'upi' | 'card'>('cash');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    readAdmin<{ items: any[] }>('credit/customers')
      .then(res => {
        setCustomers(res.items || []);
      })
      .catch(err => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const selectedCustomer = useMemo(() => {
    return customers.find(c => c.customerKey === selectedKey) || (initialCustomer ? {
      customerKey: initialCustomer.key,
      name: initialCustomer.name,
      phone: initialCustomer.phone,
      summary: { balance: initialCustomer.balance }
    } : null);
  }, [customers, selectedKey, initialCustomer]);

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter(c => {
      const match = `${c.name} ${c.phone}`.toLowerCase().includes(q);
      return match;
    });
  }, [customers, search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedKey) {
      setError('Please select a customer.');
      return;
    }
    const num = Number(amount);
    if (!num || num <= 0) {
      setError('Enter a valid repayment amount.');
      return;
    }
    if (selectedCustomer && num > selectedCustomer.summary.balance) {
      setError(`Amount cannot exceed customer's outstanding balance of ₹${selectedCustomer.summary.balance}.`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await writeAdmin('credit/entries', {
        requestId: crypto.randomUUID(),
        customerKey: selectedKey,
        kind: 'payment',
        amount: num,
        paymentMethod: method,
        note: note.trim()
      });
      onSuccess(`Udhar payment of ₹${num.toLocaleString('en-IN')} recorded for ${selectedCustomer?.name || 'customer'}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dashboard-modal-backdrop" onClick={onClose}>
      <div className="dashboard-modal-panel" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Receive Udhar Payment</h2>
          <button type="button" className="icon-button" onClick={onClose}>×</button>
        </div>

        {error && <div className="error-banner" style={{ marginBottom: 14 }}>{error}</div>}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Customer Selection */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              Select Customer *
            </label>
            {!initialCustomer && (
              <input
                type="text"
                placeholder="Search by customer name or phone…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--line)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                  marginBottom: 8
                }}
              />
            )}
            <select
              required
              value={selectedKey}
              onChange={e => {
                setSelectedKey(e.target.value);
                const found = customers.find(c => c.customerKey === e.target.value);
                if (found && found.summary?.balance > 0) {
                  setAmount(String(found.summary.balance));
                }
              }}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--line)',
                background: 'var(--bg)',
                color: 'var(--text)'
              }}
            >
              <option value="">-- Choose Customer --</option>
              {filteredCustomers.map(c => (
                <option key={c.customerKey} value={c.customerKey}>
                  {c.name} ({c.phone}) - Outstanding: ₹{c.summary?.balance || 0}
                </option>
              ))}
            </select>
          </div>

          {selectedCustomer && (
            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--accent-bg)', border: '1px solid var(--line)' }}>
              <div style={{ fontSize: 13 }}>
                <strong>{selectedCustomer.name}</strong> · {selectedCustomer.phone}
              </div>
              <div style={{ fontSize: 14, marginTop: 4 }}>
                Current Outstanding: <strong style={{ color: '#EF4444' }}>₹{selectedCustomer.summary?.balance || 0}</strong>
              </div>
            </div>
          )}

          {/* Amount */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              Payment Received Amount (₹) *
            </label>
            <input
              type="number"
              required
              min="0.01"
              step="0.01"
              placeholder="Enter amount"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--line)',
                background: 'var(--bg)',
                color: 'var(--text)'
              }}
            />
          </div>

          {/* Payment Method */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              Payment Method *
            </label>
            <select
              value={method}
              onChange={e => setMethod(e.target.value as any)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--line)',
                background: 'var(--bg)',
                color: 'var(--text)'
              }}
            >
              <option value="cash">Cash</option>
              <option value="upi">UPI / QR Code</option>
              <option value="card">Card / POS Terminal</option>
            </select>
          </div>

          {/* Note */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
              Payment Reference / Note (Optional)
            </label>
            <input
              type="text"
              maxLength={200}
              placeholder="e.g. Cleared bill or UPI transaction ID"
              value={note}
              onChange={e => setNote(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: 8,
                border: '1px solid var(--line)',
                background: 'var(--bg)',
                color: 'var(--text)'
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
            <button type="button" className="button secondary" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="button primary" disabled={busy || !selectedKey || !Number(amount)}>
              {busy ? 'Saving…' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PurchaseReceiveModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [products, setProducts] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      readAdmin<{ items: any[] }>('products'),
      readAdmin<{ items: any[] }>('suppliers')
    ])
      .then(([prodRes, suppRes]) => {
        setProducts(prodRes.items || []);
        setSuppliers(suppRes.items || []);
      })
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="dashboard-modal-backdrop" onClick={onClose}>
      <div className="dashboard-modal-panel" style={{ width: 'min(920px, 96vw)' }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Receive Stock / New Purchase Order</h2>
          <button type="button" className="icon-button" onClick={onClose}>×</button>
        </div>

        {error && <div className="error-banner" style={{ marginBottom: 14 }}>{error}</div>}

        {loading ? (
          <p>Loading suppliers and product catalog…</p>
        ) : (
          <PurchaseReceive
            products={products}
            suppliers={suppliers}
            receive={async (input: PurchaseInput) => {
              await writeAdmin('purchases/receive', input);
              onSuccess();
            }}
          />
        )}
      </div>
    </div>
  );
}

function BarcodeModal({ onClose }: { onClose: () => void }) {
  const [products, setProducts] = useState<BatchLabelProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    readAdmin<{ items: any[] }>('products')
      .then(res => setProducts(res.items || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="dashboard-modal-backdrop" onClick={onClose}>
      <div className="dashboard-modal-panel" style={{ width: 'min(1080px, 96vw)' }} onClick={e => e.stopPropagation()}>
        {loading ? (
          <p>Loading product catalog for barcodes…</p>
        ) : (
          <BarcodeBatch products={products} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

function PaySupplierModal({
  preselectedPurchaseId,
  onClose,
  onSuccess
}: {
  preselectedPurchaseId: string | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      readAdmin<{ items: any[] }>('suppliers'),
      readAdmin<{ items: Array<{ id: string; balance: number }> }>('suppliers/balances').catch(() => ({ items: [] }))
    ])
      .then(([suppRes, balRes]) => {
        setSuppliers(suppRes.items || []);
        const map: Record<string, number> = {};
        for (const item of balRes.items || []) {
          map[item.id] = item.balance;
        }
        setBalances(map);
      })
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="dashboard-modal-backdrop" onClick={onClose}>
        <div className="dashboard-modal-panel" onClick={e => e.stopPropagation()}>
          <p>Loading supplier balances…</p>
        </div>
      </div>
    );
  }

  return (
    <SupplierPaymentDialog
      initialSupplierId={preselectedPurchaseId ? suppliers.find(s => s.id === preselectedPurchaseId)?.id : undefined}
      suppliers={suppliers}
      balances={balances}
      onClose={onClose}
      onPaid={onSuccess}
    />
  );
}
