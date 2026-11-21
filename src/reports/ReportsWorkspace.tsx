import { lazy, Suspense, useState, useEffect } from 'react';
import {
  PanelLeftClose,
  PanelLeftOpen,
  ShoppingBag,
  Truck,
  RotateCcw,
  ArrowRightLeft,
  BookOpen,
  PieChart,
  FileSpreadsheet,
  Layers,
  UserCheck,
  Building2,
  Clock,
  CreditCard,
  DollarSign,
  Receipt,
  Lock,
  type LucideIcon
} from 'lucide-react';

import './reports.css';

// Reports components
const SalesReport = lazy(() => import('./transactions/SalesReport').then(module => ({ default: module.SalesReport })));
const PurchasesReport = lazy(() => import('./transactions/PurchasesReport').then(module => ({ default: module.PurchasesReport })));
const CustomerReturnsReport = lazy(() => import('./transactions/CustomerReturnsReport').then(module => ({ default: module.CustomerReturnsReport })));
const SupplierReturnsReport = lazy(() => import('./transactions/SupplierReturnsReport').then(module => ({ default: module.SupplierReturnsReport })));
const DayBookReport = lazy(() => import('./transactions/DayBookReport').then(module => ({ default: module.DayBookReport })));

const ProfitLossReport = lazy(() => import('./profit/ProfitLossReport').then(module => ({ default: module.ProfitLossReport })));
const BillProfitReport = lazy(() => import('./profit/BillProfitReport').then(module => ({ default: module.BillProfitReport })));
const ItemProfitReport = lazy(() => import('./profit/ItemProfitReport').then(module => ({ default: module.ItemProfitReport })));

const CustomerStatementReport = lazy(() => import('./party/CustomerStatementReport').then(module => ({ default: module.CustomerStatementReport })));
const SupplierStatementReport = lazy(() => import('./party/SupplierStatementReport').then(module => ({ default: module.SupplierStatementReport })));
const OutstandingUdharReport = lazy(() => import('./party/OutstandingUdharReport').then(module => ({ default: module.OutstandingUdharReport })));
const SupplierPayablesReport = lazy(() => import('./party/SupplierPayablesReport').then(module => ({ default: module.SupplierPayablesReport })));

const CashFlowReport = lazy(() => import('./cash/CashFlowReport').then(module => ({ default: module.CashFlowReport })));
const ExpensesReport = lazy(() => import('./cash/ExpensesReport').then(module => ({ default: module.ExpensesReport })));
const DailyClosingReport = lazy(() => import('./cash/DailyClosingReport').then(module => ({ default: module.DailyClosingReport })));
const StockGstReport = lazy(() => import('./cash/StockGstReport').then(module => ({ default: module.StockGstReport })));

interface ReportNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface ReportNavGroup {
  group: string;
  items: ReportNavItem[];
}

const REPORT_GROUPS: ReportNavGroup[] = [
  {
    group: 'TRANSACTION REPORTS',
    items: [
      { id: 'sales', label: 'Sales', icon: ShoppingBag },
      { id: 'purchases', label: 'Purchases', icon: Truck },
      { id: 'customer_returns', label: 'Customer Returns', icon: RotateCcw },
      { id: 'supplier_returns', label: 'Supplier Purchase Returns', icon: ArrowRightLeft },
      { id: 'day_book', label: 'Day Book', icon: BookOpen }
    ]
  },
  {
    group: 'PROFIT REPORTS',
    items: [
      { id: 'profit_loss', label: 'Profit & Loss', icon: PieChart },
      { id: 'bill_profit', label: 'Bill-wise Profit', icon: FileSpreadsheet },
      { id: 'item_profit', label: 'Item-wise Profit', icon: Layers }
    ]
  },
  {
    group: 'PARTY REPORTS',
    items: [
      { id: 'customer_statement', label: 'Customer Statement', icon: UserCheck },
      { id: 'supplier_statement', label: 'Supplier Statement', icon: Building2 },
      { id: 'outstanding_udhar', label: 'Outstanding Udhar', icon: Clock },
      { id: 'supplier_payables', label: 'Supplier Payables & Credits', icon: CreditCard }
    ]
  },
  {
    group: 'CASH REPORTS',
    items: [
      { id: 'cash_flow', label: 'Cash Flow', icon: DollarSign },
      { id: 'expenses', label: 'Expenses', icon: Receipt },
      { id: 'daily_closing', label: 'Daily Cash Closing', icon: Lock }
    ]
  },
  {
    group: 'STOCK & TAX',
    items: [{ id: 'stock_gst', label: 'GST Stock Valuation', icon: Layers }]
  }
];
const CORE_REPORTS = new Set(['sales', 'purchases', 'day_book', 'profit_loss', 'outstanding_udhar', 'expenses', 'daily_closing', 'stock_gst']);

function getReportFromUrl() {
  const report = new URLSearchParams(window.location.search).get('report');
  return REPORT_GROUPS.some(group => group.items.some(item => item.id === report)) ? report! : 'sales';
}

export function ReportsWorkspace({
  onOpenInvoice
}: {
  onOpenInvoice?: (invoice: any) => void;
}) {
  const [activeReport, setActiveReport] = useState(getReportFromUrl);
  const [showAdvanced, setShowAdvanced] = useState(() => !CORE_REPORTS.has(getReportFromUrl()));
  const [navHidden, setNavHidden] = useState(() => localStorage.getItem('bo-report-navigation') === 'hidden');
  const visibleGroups = REPORT_GROUPS.map(group => ({ ...group, items: showAdvanced ? group.items : group.items.filter(item => CORE_REPORTS.has(item.id)) })).filter(group => group.items.length);

  const handleSelectReport = (id: string) => {
    if (id === activeReport) return;
    setActiveReport(id);
    if (!CORE_REPORTS.has(id)) setShowAdvanced(true);
    const url = new URL(window.location.href);
    url.searchParams.set('report', id);
    window.history.pushState(null, '', url.toString());
  };

  useEffect(() => {
    const onPop = () => {
      const report = getReportFromUrl();
      setActiveReport(report);
      if (!CORE_REPORTS.has(report)) setShowAdvanced(true);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return (
    <div className="reports-workspace-container" data-report-nav-hidden={navHidden}>
      {/* SECONDARY SIDEBAR - DESKTOP */}
      <aside id="reports-categories" className="reports-secondary-sidebar" aria-label="Reports categories">
        <div className="reports-sidebar-header">
          <h2 className="reports-sidebar-title">Reports</h2>
        </div>

        <nav className="reports-sidebar-nav">
          {visibleGroups.map(grp => (
            <div key={grp.group} className="reports-nav-group">
              <h3 className="reports-nav-group-title">{grp.group}</h3>
              <div className="reports-nav-group-items">
                {grp.items.map(item => {
                  const Icon = item.icon;
                  const isSelected = activeReport === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`reports-nav-link ${isSelected ? 'active' : ''}`}
                      onClick={() => handleSelectReport(item.id)}
                      aria-current={isSelected ? 'page' : undefined}
                    >
                      <Icon size={16} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <button type="button" className="reports-nav-link" onClick={() => setShowAdvanced(value => !value)}>{showAdvanced ? 'Show essential reports' : 'Show more reports'}</button>
        </nav>
      </aside>

      <section className="reports-main-content" aria-label="Report results">
        <div className="reports-navigation-toolbar">
          <button type="button" className="report-btn secondary reports-navigation-toggle" aria-expanded={!navHidden} aria-controls="reports-categories" onClick={() => {
            localStorage.setItem('bo-report-navigation', navHidden ? 'visible' : 'hidden');
            setNavHidden(!navHidden);
          }}>
            {navHidden ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
            {navHidden ? 'Show report menu' : 'Hide report menu'}
          </button>
          <div className="reports-mobile-selector">
        <select
          className="reports-mobile-select"
          value={activeReport}
          onChange={e => handleSelectReport(e.target.value)}
          aria-label="Select report"
        >
          {REPORT_GROUPS.map(grp => (
            <optgroup key={grp.group} label={grp.group}>
              {grp.items.map(item => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
          </div>
        </div>
        <Suspense fallback={<p role="status" className="report-loading">Opening report…</p>}>
        {activeReport === 'sales' && <SalesReport onOpenInvoice={onOpenInvoice} />}
        {activeReport === 'purchases' && <PurchasesReport />}
        {activeReport === 'customer_returns' && <CustomerReturnsReport />}
        {activeReport === 'supplier_returns' && <SupplierReturnsReport />}
        {activeReport === 'day_book' && <DayBookReport />}

        {activeReport === 'profit_loss' && <ProfitLossReport />}
        {activeReport === 'bill_profit' && <BillProfitReport onOpenInvoice={onOpenInvoice} />}
        {activeReport === 'item_profit' && <ItemProfitReport />}

        {activeReport === 'customer_statement' && <CustomerStatementReport />}
        {activeReport === 'supplier_statement' && <SupplierStatementReport />}
        {activeReport === 'outstanding_udhar' && <OutstandingUdharReport />}
        {activeReport === 'supplier_payables' && <SupplierPayablesReport />}

        {activeReport === 'cash_flow' && <CashFlowReport />}
        {activeReport === 'expenses' && <ExpensesReport />}
        {activeReport === 'daily_closing' && <DailyClosingReport />}
        {activeReport === 'stock_gst' && <StockGstReport />}
        </Suspense>
      </section>
    </div>
  );
}

