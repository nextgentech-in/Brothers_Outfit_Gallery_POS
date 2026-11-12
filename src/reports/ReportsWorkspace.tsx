import React, { useState, useEffect } from 'react';
import {
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
import { SalesReport } from './transactions/SalesReport';
import { PurchasesReport } from './transactions/PurchasesReport';
import { CustomerReturnsReport } from './transactions/CustomerReturnsReport';
import { SupplierReturnsReport } from './transactions/SupplierReturnsReport';
import { DayBookReport } from './transactions/DayBookReport';

import { ProfitLossReport } from './profit/ProfitLossReport';
import { BillProfitReport } from './profit/BillProfitReport';
import { ItemProfitReport } from './profit/ItemProfitReport';

import { CustomerStatementReport } from './party/CustomerStatementReport';
import { SupplierStatementReport } from './party/SupplierStatementReport';
import { OutstandingUdharReport } from './party/OutstandingUdharReport';
import { SupplierPayablesReport } from './party/SupplierPayablesReport';

import { CashFlowReport } from './cash/CashFlowReport';
import { ExpensesReport } from './cash/ExpensesReport';
import { DailyClosingReport } from './cash/DailyClosingReport';
import { StockGstReport } from './cash/StockGstReport';

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

export function ReportsWorkspace({
  role = 'owner',
  onOpenInvoice
}: {
  role?: string;
  onOpenInvoice?: (invoice: any) => void;
}) {
  const [activeReport, setActiveReport] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('report') || 'sales';
  });
  const [showAdvanced, setShowAdvanced] = useState(() => !CORE_REPORTS.has(new URLSearchParams(window.location.search).get('report') || 'sales'));
  const visibleGroups = REPORT_GROUPS.map(group => ({ ...group, items: showAdvanced ? group.items : group.items.filter(item => CORE_REPORTS.has(item.id)) })).filter(group => group.items.length);

  const handleSelectReport = (id: string) => {
    setActiveReport(id);
    const url = new URL(window.location.href);
    url.searchParams.set('report', id);
    window.history.pushState(null, '', url.toString());
  };

  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      const rep = params.get('report');
      if (rep) setActiveReport(rep);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return (
    <div className="reports-workspace-container">
      {/* SECONDARY SIDEBAR - DESKTOP */}
      <aside className="reports-secondary-sidebar" aria-label="Reports categories">
        <div className="reports-sidebar-header">
          <span className="reports-sidebar-eyebrow">WORKSPACE REPORTS</span>
          <h2 className="reports-sidebar-title">Reports & Insights</h2>
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

      {/* MOBILE REPORT SELECTOR */}
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

      {/* MAIN REPORT WORKSPACE AREA */}
      <main className="reports-main-content">
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
      </main>
    </div>
  );
}

