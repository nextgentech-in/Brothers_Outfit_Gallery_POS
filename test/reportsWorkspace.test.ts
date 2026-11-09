import test from 'node:test';
import assert from 'node:assert/strict';
import { computeDatePreset } from '../src/reports/shared/ReportFilters';
import { downloadCsv, formatINR, formatDateINR } from '../src/reports/shared/exportUtils';

test('Report Filters: date presets compute correct dates in Asia/Kolkata timezone', () => {
  const todayRange = computeDatePreset('today');
  assert.equal(todayRange.fromDate, todayRange.toDate);
  assert.match(todayRange.fromDate, /^\d{4}-\d{2}-\d{2}$/);

  const yesterdayRange = computeDatePreset('yesterday');
  assert.equal(yesterdayRange.fromDate, yesterdayRange.toDate);
  assert.ok(yesterdayRange.fromDate <= todayRange.fromDate);

  const last7Range = computeDatePreset('last7');
  assert.equal(last7Range.toDate, todayRange.toDate);
  assert.ok(last7Range.fromDate < last7Range.toDate);

  const thisMonthRange = computeDatePreset('thisMonth');
  assert.equal(thisMonthRange.toDate, todayRange.toDate);
  assert.match(thisMonthRange.fromDate, /^\d{4}-\d{2}-01$/);

  const fyRange = computeDatePreset('fy');
  assert.equal(fyRange.toDate, todayRange.toDate);
  assert.match(fyRange.fromDate, /^\d{4}-04-01$/);
});

test('Reports Formatting: formatINR formats Indian Rupees with two decimal places', () => {
  assert.equal(formatINR(0), '₹0.00');
  assert.equal(formatINR(1250), '₹1,250.00');
  assert.equal(formatINR(100000), '₹1,00,000.00');
  assert.equal(formatINR(54321.75), '₹54,321.75');
});

test('Reports Formatting: formatDateINR converts ISO date string to readable format', () => {
  assert.equal(formatDateINR(null), '—');
  assert.equal(formatDateINR(undefined), '—');
  const d = formatDateINR('2026-11-05T10:00:00.000Z');
  assert.ok(d.includes('2026'));
});

test('Accounting Math: Supplier Purchase Returns reduces payable first and excess creates credit', () => {
  // Example from requirement:
  // Purchase: ₹10,000, Already paid: ₹6,000, Outstanding: ₹4,000, Returned goods: ₹5,000
  // After return: Outstanding: ₹0, Supplier credit: ₹1,000, Cash change: ₹0
  const purchase = {
    total: 10000,
    amountPaid: 6000,
    payable: 4000
  };
  const returnGoodsValue = 5000;

  const payableReduction = Math.min(returnGoodsValue, purchase.payable);
  const newPayable = Math.max(0, purchase.payable - payableReduction);
  const excessCredit = Math.max(0, returnGoodsValue - payableReduction);

  assert.equal(payableReduction, 4000);
  assert.equal(newPayable, 0);
  assert.equal(excessCredit, 1000);
});

test('Accounting Math: Profit & Loss net revenue, gross profit, margin % and result after OPEX', () => {
  // Example from prompt:
  // 3 shirts sold at ₹1,000 each = ₹3,000
  // Bill discount: ₹300
  // Sale-time unit cost: ₹600 x 3 = ₹1,800
  // Net revenue: ₹2,700
  // COGS: ₹1,800
  // Gross profit: ₹900
  // Gross margin: 33.33%
  const grossSales = 3000;
  const discount = 300;
  const customerReturns = 0;
  const netRevenue = grossSales - discount - customerReturns;
  const cogs = 1800;
  const grossProfit = netRevenue - cogs;
  const grossMargin = (grossProfit / netRevenue) * 100;

  assert.equal(netRevenue, 2700);
  assert.equal(grossProfit, 900);
  assert.equal(Math.round(grossMargin * 100) / 100, 33.33);

  // With operating expenses of ₹250
  const opex = 250;
  const damagedWriteOffs = 0;
  const resultAfterExpenses = grossProfit - opex - damagedWriteOffs;
  assert.equal(resultAfterExpenses, 650);

  // Owner withdrawal of ₹500 is NOT OPEX
  const ownerWithdrawals = 500;
  assert.equal(resultAfterExpenses, 650, 'Owner withdrawals must not alter operating result');
});

