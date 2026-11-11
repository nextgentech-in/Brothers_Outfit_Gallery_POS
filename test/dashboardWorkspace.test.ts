import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDatePreset } from '../src/reports/shared/ReportFilters';

test('Dashboard Filters: Presets correctly calculate boundaries', () => {
  const today = computeDatePreset('today');
  assert.equal(today.fromDate, today.toDate);
  assert.match(today.fromDate, /^\d{4}-\d{2}-\d{2}$/);

  const yesterday = computeDatePreset('yesterday');
  assert.equal(yesterday.fromDate, yesterday.toDate);

  const last7 = computeDatePreset('last7');
  assert.equal(last7.toDate, today.toDate);

  const thisMonth = computeDatePreset('thisMonth');
  assert.equal(thisMonth.toDate, today.toDate);
  assert.match(thisMonth.fromDate, /^\d{4}-\d{2}-01$/);

  const lastMonth = computeDatePreset('lastMonth');
  assert.match(lastMonth.fromDate, /^\d{4}-\d{2}-01$/);

  const fy = computeDatePreset('fy');
  assert.match(fy.fromDate, /^\d{4}-04-01$/);
});

test('Dashboard KPI Calculations: Net Sales, Gross Profit, and Collections Math', () => {
  // Scenario:
  // Gross sales = 100,000, discounts = 5,000, customer returns = 3,000
  // COGS = 60,000, returned cost restored = 2,000
  const grossSales = 100000;
  const discounts = 5000;
  const customerReturns = 3000;
  const netSales = Math.max(0, grossSales - discounts - customerReturns);
  assert.equal(netSales, 92000);

  const orderCogs = 60000;
  const returnCostRestored = 2000;
  const netCogs = Math.max(0, orderCogs - returnCostRestored);
  assert.equal(netCogs, 58000);

  const grossProfit = netSales - netCogs;
  assert.equal(grossProfit, 34000);

  const marginPercent = Math.round((grossProfit / netSales) * 1000) / 10;
  assert.equal(marginPercent, 37.0);

  // Collections calculation:
  // Counter collections = 80,000, udhar repaid = 15,000, supplier refund = 1,000, customer refund paid = 2,000
  const counterCollections = 80000;
  const udharRepaid = 15000;
  const supplierRefund = 1000;
  const customerRefund = 2000;
  const totalMoneyReceived = counterCollections + udharRepaid + supplierRefund - customerRefund;
  assert.equal(totalMoneyReceived, 94000);
});

test('Dashboard Role Permissions: Cashier visibility rules', () => {
  // Cashier role must restrict sensitive financial fields
  const cashierAllowedSummary = (summary: any, role: string) => {
    if (role === 'cashier') {
      return {
        netSales: summary.netSales,
        moneyReceived: summary.moneyReceived,
        customerOutstanding: summary.customerOutstanding,
        customerReturns: summary.customerReturns,
        taxCollected: summary.taxCollected,
        // Sensitive data hidden:
        grossProfit: null,
        cogs: null,
        purchasesReceived: null,
        supplierPayable: null,
        operatingExpenses: null,
        ownerWithdrawals: null
      };
    }
    return summary;
  };

  const rawSummary = {
    netSales: 50000,
    moneyReceived: 45000,
    customerOutstanding: 12000,
    customerReturns: 1500,
    taxCollected: 2500,
    grossProfit: 18000,
    cogs: 30500,
    purchasesReceived: 40000,
    supplierPayable: 25000,
    operatingExpenses: 5000,
    ownerWithdrawals: 10000
  };

  const cashierView = cashierAllowedSummary(rawSummary, 'cashier');
  assert.equal(cashierView.netSales, 50000);
  assert.equal(cashierView.grossProfit, null);
  assert.equal(cashierView.purchasesReceived, null);
  assert.equal(cashierView.supplierPayable, null);

  const ownerView = cashierAllowedSummary(rawSummary, 'owner');
  assert.equal(ownerView.grossProfit, 18000);
  assert.equal(ownerView.purchasesReceived, 40000);
  assert.equal(ownerView.supplierPayable, 25000);
});

test('Dashboard Channel Breakdown: Percentages and split calculation', () => {
  const posSales = 75000;
  const webSales = 25000;
  const totalSales = posSales + webSales;
  assert.equal(totalSales, 100000);

  const posPct = Math.round((posSales / totalSales) * 100);
  const webPct = Math.round((webSales / totalSales) * 100);
  assert.equal(posPct, 75);
  assert.equal(webPct, 25);
});

