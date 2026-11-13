import { Router } from 'express';
import { createHash } from 'node:crypto';
import { FieldValue, type Firestore, type Transaction, type DocumentData } from 'firebase-admin/firestore';
import { z } from 'zod';
import { firebase } from './firebase.js';
import { idempotent } from './transactions.js';
import { changeStock, fiscalYear } from './commerce.js';
import { shopDate } from '../shared/customers.js';
import { validDueDate } from '../shared/credit.js';
import { stockValue, stockValueRows } from '../shared/stockGst.js';

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const paise = (v: unknown) => Math.round(Number(v || 0) * 100);
const rupees = (p: number) => p / 100;
const reject = (msg: string, status = 422): never => { throw Object.assign(new Error(msg), { status }); };
const fail = (res: any, e: any) => res.status(e.status || 503).json({ error: e.status ? e.message : 'Report data currently unavailable.' });

export const reportsRouter = Router();

reportsRouter.get('/reports/stock-gst', async (_req, res) => {
  try {
    const products = await firebase().db.collection('products').get();
    const rows = stockValueRows(products.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    const items = rows.filter(row => row.gstPercent > 0 && row.quantity > 0);
    const sum = (key: 'quantity' | 'baseValue' | 'gstValue' | 'totalValue') => Math.round(rows.reduce((total, row) => total + row[key], 0) * 100) / 100;
    res.json({ checkedAt: new Date().toISOString(), summary: {
      products: new Set(rows.map(row => row.productId)).size,
      gstProducts: new Set(items.map(row => row.productId)).size,
      units: sum('quantity'), baseValue: sum('baseValue'), gstValue: sum('gstValue'), totalValue: sum('totalValue')
    }, items });
  } catch { res.status(503).json({ error: 'Stock GST report is unavailable.' }); }
});

function range(from: unknown, to: unknown) {
  const f = String(from || shopDate()), t = String(to || f);
  if (!validDueDate(f) || !validDueDate(t) || f > t) reject('Choose valid start and end dates.');
  const start = new Date(`${f}T00:00:00+05:30`);
  const end = new Date(new Date(`${t}T00:00:00+05:30`).getTime() + 86400000);
  return { start, end, from: f, to: t };
}

// -------------------------------------------------------------------------
// DASHBOARD UNIFIED SUMMARY & TODAY'S TASKS
// -------------------------------------------------------------------------
reportsRouter.get('/reports/dashboard-summary', async (req, res) => {
  try {
    const db = firebase().db;
    const { start, end, from, to } = range(req.query.from, req.query.to);
    const channel = String(req.query.channel || '').toLowerCase(); // 'pos', 'website', or ''
    const today = shopDate();

    // Concurrently fetch period transactions and standing balances
    const [
      ordersSnap,
      returnsSnap,
      expensesSnap,
      purchasesSnap,
      customerLedgerSnap,
      supplierRefundsSnap,
      customerRefundsSnap,
      creditAccountsSnap,
      allPurchasesSnap,
      productsSnap,
      pendingRefundsSnap,
      customerProfilesSnap
    ] = await Promise.all([
      db.collection('orders').where('createdAt', '>=', start).where('createdAt', '<', end).get(),
      db.collection('erp_returns').where('createdAt', '>=', start).where('createdAt', '<', end).get(),
      db.collection('erp_expenses').where('createdAt', '>=', start).where('createdAt', '<', end).get(),
      db.collection('erp_purchases').where('createdAt', '>=', start).where('createdAt', '<', end).get(),
      // Filter kind in memory so a fresh store does not need a composite index
      // before the daily dashboard can load.
      db.collection('erp_customerLedger').where('createdAt', '>=', start).where('createdAt', '<', end).get(),
      db.collection('erp_supplierRefunds').where('createdAt', '>=', start).where('createdAt', '<', end).get(),
      db.collection('erp_refunds').where('createdAt', '>=', start).where('createdAt', '<', end).get(),
      db.collection('erp_creditAccounts').get(),
      db.collection('erp_purchases').where('payable', '>', 0).get(),
      db.collection('products').get(),
      db.collection('erp_returns').where('refundStatus', '==', 'review_required').get(),
      db.collection('erp_customerProfiles').get()
    ]);

    // 1. Process Orders in period
    let grossSalesPaise = 0;
    let discountsPaise = 0;
    let taxesPaise = 0;
    let orderCogsPaise = 0;
    let hasIncompleteCost = false;
    let salesCollectionsPaise = 0;
    let posSalesPaise = 0;
    let posCount = 0;
    let webSalesPaise = 0;
    let webCount = 0;
    const pendingOrdersList: any[] = [];

    for (const doc of ordersSnap.docs) {
      const o = doc.data();
      const status = String(o.status || '').toLowerCase();
      if (status === 'cancelled') continue;

      if (['pending', 'processing', 'unconfirmed'].includes(status)) {
        pendingOrdersList.push({
          id: doc.id,
          customer: o.customerName || 'Walk-in',
          total: Number(o.totalAmount || o.total || 0),
          status: o.status || 'Pending',
          date: o.createdAt?.toDate ? o.createdAt.toDate().toISOString() : null
        });
      }

      const isPos = o.createdBy === 'admin-pos' || o.channel === 'POS';
      const orderChannel = isPos ? 'pos' : 'website';
      if (channel && orderChannel !== channel) continue;

      const subtotal = paise(o.subtotal ?? o.totalAmount ?? 0);
      const discount = paise(o.discount ?? 0);
      const total = paise(o.totalAmount ?? o.total ?? 0);
      const tax = paise(o.tax ?? 0);

      grossSalesPaise += subtotal > 0 ? subtotal : total;
      discountsPaise += discount;
      taxesPaise += tax;

      if (isPos) {
        posSalesPaise += total;
        posCount++;
      } else {
        webSalesPaise += total;
        webCount++;
      }

      // Calculate COGS
      const items = Array.isArray(o.items) ? o.items : [];
      for (const item of items) {
        const qty = Number(item.quantity || 1);
        if (item.costKnown === true && typeof item.unitCost === 'number') {
          orderCogsPaise += paise(item.unitCost) * qty;
        } else if (item.costPrice !== undefined && typeof item.costPrice === 'number' && item.costPrice > 0) {
          orderCogsPaise += paise(item.costPrice) * qty;
        } else {
          hasIncompleteCost = true;
        }
      }

      // Payments collected on orders
      if (Array.isArray(o.payments) && o.payments.length > 0) {
        for (const p of o.payments) {
          if (['cash', 'upi', 'card'].includes(String(p.method).toLowerCase())) {
            salesCollectionsPaise += paise(p.amount || 0);
          }
        }
      } else if (o.paymentMethod !== 'credit') {
        const creditAmt = paise(o.creditAmount || 0);
        salesCollectionsPaise += Math.max(0, total - creditAmt);
      }
    }

    // 2. Returns in period
    let customerReturnsPaise = 0;
    let returnCostReversedPaise = 0;
    for (const doc of returnsSnap.docs) {
      const r = doc.data();
      customerReturnsPaise += paise(r.total || 0);
      const lines = Array.isArray(r.lines) ? r.lines : [];
      for (const l of lines) {
        if (l.restock !== false) {
          const cost = paise(l.unitCost || l.costPrice || 0);
          returnCostReversedPaise += cost * Number(l.quantity || 1);
        }
      }
    }

    const netSalesPaise = Math.max(0, grossSalesPaise - discountsPaise - customerReturnsPaise);
    const netCogsPaise = Math.max(0, orderCogsPaise - returnCostReversedPaise);
    const grossProfitPaise = netSalesPaise - netCogsPaise;
    const grossMarginPercent = netSalesPaise > 0 ? (grossProfitPaise / netSalesPaise) * 100 : 0;

    // 3. Money Received
    let udharRepaidPaise = 0;
    for (const doc of customerLedgerSnap.docs) {
      const l = doc.data();
      if (l.kind !== 'payment') continue;
      udharRepaidPaise += -paise(l.creditDelta || 0);
    }

    let supplierRefundsPaise = 0;
    for (const doc of supplierRefundsSnap.docs) {
      supplierRefundsPaise += paise(doc.data().amount || 0);
    }

    let customerRefundsPaise = 0;
    for (const doc of customerRefundsSnap.docs) {
      customerRefundsPaise += paise(doc.data().amount || 0);
    }

    const totalMoneyReceivedPaise = salesCollectionsPaise + udharRepaidPaise + supplierRefundsPaise - customerRefundsPaise;

    // 4. Purchases received in period
    let purchasesReceivedPaise = 0;
    for (const doc of purchasesSnap.docs) {
      purchasesReceivedPaise += paise(doc.data().total || 0);
    }

    // 5. Expenses in period
    let operatingExpensesPaise = 0;
    let ownerWithdrawalsPaise = 0;
    for (const doc of expensesSnap.docs) {
      const e = doc.data();
      if (e.category === 'withdrawal') ownerWithdrawalsPaise += paise(e.amount || 0);
      else operatingExpensesPaise += paise(e.amount || 0);
    }

    // 6. Current Balances
    let customerOutstandingPaise = 0;
    const overdueUdharTasks: any[] = [];
    const dueTodayUdharTasks: any[] = [];

    for (const doc of creditAccountsSnap.docs) {
      const acc = doc.data();
      const bal = paise(acc.balance || 0);
      if (bal > 0) customerOutstandingPaise += bal;

      const debts = Array.isArray(acc.debts) ? acc.debts : [];
      let custOverdue = 0;
      let custDueToday = 0;

      for (const d of debts) {
        const rem = paise(d.remaining || 0);
        if (rem <= 0) continue;
        if (d.dueDate && d.dueDate < today) custOverdue += rem;
        else if (d.dueDate && d.dueDate === today) custDueToday += rem;
      }

      if (custOverdue > 0) {
        overdueUdharTasks.push({
          customerKey: doc.id,
          name: acc.name || 'Customer',
          phone: acc.phone || '',
          amount: rupees(custOverdue),
          totalBalance: rupees(bal)
        });
      }
      if (custDueToday > 0) {
        dueTodayUdharTasks.push({
          customerKey: doc.id,
          name: acc.name || 'Customer',
          phone: acc.phone || '',
          amount: rupees(custDueToday),
          totalBalance: rupees(bal)
        });
      }
    }

    let supplierPayablePaise = 0;
    const supplierPaymentTasks: any[] = [];
    for (const doc of allPurchasesSnap.docs) {
      const p = doc.data();
      const pay = paise(p.payable || 0);
      if (pay > 0) {
        supplierPayablePaise += pay;
        supplierPaymentTasks.push({
          purchaseId: doc.id,
          supplierName: p.supplierName || 'Supplier',
          supplierInvoice: p.supplierInvoice || doc.id,
          payable: rupees(pay),
          date: p.createdAt?.toDate ? p.createdAt.toDate().toISOString() : null
        });
      }
    }

    // 7. Inventory Summary
    let totalStockUnits = 0;
    let stockCostTotalPaise = 0;
    let stockRetailTotalPaise = 0;
    let stockGstTotalPaise = 0;
    let productCount = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;
    const lowStockItems: any[] = [];

    for (const doc of productsSnap.docs) {
      const p = doc.data();
      if (p.isDeleted === true) continue;
      const pName = p.name || 'Product';
      const pSku = p.sku || doc.id;
      const lower = `${doc.id} ${pName} ${pSku}`.toLowerCase();
      if (lower.includes('demo') || lower.includes('sample')) continue;
      productCount++;
      const gstPercent = p.gstEnabled === true ? Number(p.gstPercent || 0) : 0;

      if (Array.isArray(p.variants) && p.variants.length > 0) {
        for (const v of p.variants) {
          const stk = Math.max(0, Number(v.stock ?? v.onHand ?? 0) - Number(v.reserved ?? 0));
          const cost = Number(v.costPrice ?? p.costPrice ?? 0);
          totalStockUnits += stk;
          stockCostTotalPaise += Math.round(stk * cost * 100);
          const value = stockValue(stk, cost, gstPercent);
          stockRetailTotalPaise += paise(value.baseValue);
          stockGstTotalPaise += paise(value.gstValue);
          if (stk <= 0) {
            outOfStockCount++;
            if (lowStockItems.length < 15) {
              lowStockItems.push({ id: doc.id, name: pName, sku: v.sku, available: stk, status: 'Out of stock' });
            }
          } else if (stk <= 5) {
            lowStockCount++;
            if (lowStockItems.length < 15) {
              lowStockItems.push({ id: doc.id, name: pName, sku: v.sku, available: stk, status: 'Low stock' });
            }
          }
        }
      } else {
        const stk = Math.max(0, Number(p.stock ?? p.onHand ?? 0) - Number(p.reserved ?? 0));
        const cost = Number(p.costPrice || 0);
        totalStockUnits += stk;
        stockCostTotalPaise += Math.round(stk * cost * 100);
        const value = stockValue(stk, cost, gstPercent);
        stockRetailTotalPaise += paise(value.baseValue);
        stockGstTotalPaise += paise(value.gstValue);
        if (stk <= 0) {
          outOfStockCount++;
          if (lowStockItems.length < 15) {
            lowStockItems.push({ id: doc.id, name: pName, sku: pSku, available: stk, status: 'Out of stock' });
          }
        } else if (stk <= 5) {
          lowStockCount++;
          if (lowStockItems.length < 15) {
            lowStockItems.push({ id: doc.id, name: pName, sku: pSku, available: stk, status: 'Low stock' });
          }
        }
      }
    }

    // 8. Birthdays Today
    const birthdaysToday: any[] = [];
    const todayMMDD = today.slice(5);
    for (const doc of customerProfilesSnap.docs) {
      const c = doc.data();
      if (c.dateOfBirth && String(c.dateOfBirth).slice(5) === todayMMDD) {
        birthdaysToday.push({
          name: c.name || 'Customer',
          phone: c.phone || '',
          dateOfBirth: c.dateOfBirth
        });
      }
    }

    // 9. Pending refunds
    const pendingRefunds = pendingRefundsSnap.docs.map(d => {
      const r = d.data();
      return {
        returnId: d.id,
        orderId: r.orderId,
        amount: rupees(paise(r.refundAmountToReview || 0) - paise(r.refundedAmount || 0))
      };
    });

    res.json({
      period: { from, to, channel },
      checkedAt: new Date().toISOString(),
      summary: {
        grossSales: rupees(grossSalesPaise),
        discounts: rupees(discountsPaise),
        customerReturns: rupees(customerReturnsPaise),
        netSales: rupees(netSalesPaise),
        taxCollected: rupees(taxesPaise),
        cogs: rupees(netCogsPaise),
        grossProfit: rupees(grossProfitPaise),
        grossMarginPercent: Math.round(grossMarginPercent * 10) / 10,
        hasIncompleteCost,
        moneyReceived: rupees(totalMoneyReceivedPaise),
        customerOutstanding: rupees(customerOutstandingPaise),
        purchasesReceived: rupees(purchasesReceivedPaise),
        supplierPayable: rupees(supplierPayablePaise),
        operatingExpenses: rupees(operatingExpensesPaise),
        ownerWithdrawals: rupees(ownerWithdrawalsPaise)
      },
      inventory: {
        availableUnits: totalStockUnits,
        productCount,
        stockCostValue: rupees(stockCostTotalPaise),
        stockRetailValue: rupees(stockRetailTotalPaise),
        stockGstValue: rupees(stockGstTotalPaise),
        stockTotalWithGst: rupees(stockRetailTotalPaise + stockGstTotalPaise),
        lowStockCount,
        outOfStockCount,
        lowStockItems
      },
      channelBreakdown: {
        pos: { sales: rupees(posSalesPaise), count: posCount },
        website: { sales: rupees(webSalesPaise), count: webCount }
      },
      tasks: {
        overdueUdhar: overdueUdharTasks,
        dueTodayUdhar: dueTodayUdharTasks,
        supplierPaymentsDue: supplierPaymentTasks.slice(0, 10),
        pendingOrders: pendingOrdersList.slice(0, 10),
        pendingRefunds: pendingRefunds.slice(0, 10),
        birthdaysToday: birthdaysToday.slice(0, 10),
        lowStock: lowStockItems.slice(0, 10)
      }
    });
  } catch (e) {
    fail(res, e);
  }
});

// -------------------------------------------------------------------------
// 1. SALES REPORT
// -------------------------------------------------------------------------
reportsRouter.get('/reports/sales', async (req, res) => {
  try {
    const db = firebase().db;
    const { start, end } = range(req.query.from, req.query.to);
    const channel = String(req.query.channel || '').toLowerCase(); // 'pos', 'website', or ''
    const payment = String(req.query.payment || '').toLowerCase(); // 'cash', 'upi', 'card', 'credit', or ''
    const search = String(req.query.q || '').toLowerCase().trim();

    const [orderSnaps, invoiceSnaps, returnSnaps] = await Promise.all([
      db.collection('orders').where('createdAt', '>=', start).where('createdAt', '<', end).orderBy('createdAt', 'desc').get(),
      db.collection('erp_invoices').where('createdAt', '>=', start).where('createdAt', '<', end).get(),
      db.collection('erp_returns').where('createdAt', '>=', start).where('createdAt', '<', end).get()
    ]);

    const invoicesByOrder = new Map(invoiceSnaps.docs.map(d => [d.data().orderId, { id: d.id, ...d.data() }]));
    const returnsByOrder = new Map<string, number>();
    for (const r of returnSnaps.docs) {
      const data = r.data();
      returnsByOrder.set(data.orderId, (returnsByOrder.get(data.orderId) || 0) + paise(data.total || 0));
    }

    let grossPaise = 0;
    let discountPaise = 0;
    let returnedPaise = 0;
    let netPaise = 0;
    let settledPaise = 0;
    let receivablePaise = 0;

    const items: any[] = [];

    for (const doc of orderSnaps.docs) {
      const order = doc.data();
      const invoice = invoicesByOrder.get(doc.id);
      const isPos = order.createdBy === 'admin-pos' || (invoice as any)?.channel === 'POS';
      const orderChannel = isPos ? 'POS' : 'Website';

      if (channel && orderChannel.toLowerCase() !== channel) continue;
      if (payment && String(order.paymentMethod || '').toLowerCase() !== payment) continue;

      const customerName = order.customerName || order.shippingAddress?.fullName || 'Walk-in';
      const customerPhone = order.customerPhone || order.shippingAddress?.phone || '';
      const invoiceId = invoice?.id || doc.id;

      if (search) {
        const text = `${invoiceId} ${customerName} ${customerPhone}`.toLowerCase();
        if (!text.includes(search)) continue;
      }

      const orderSubtotal = paise(order.subtotal ?? order.totalAmount ?? 0);
      const orderDiscount = paise(order.discount ?? 0);
      const orderTotal = paise(order.totalAmount ?? order.total ?? 0);
      const orderReturned = returnsByOrder.get(doc.id) || paise(order.returnedAmount || 0);

      const creditAmt = paise(order.creditAmount || (order.paymentMethod === 'credit' ? order.totalAmount : 0));
      const paidAmt = Math.max(0, orderTotal - creditAmt);

      grossPaise += orderSubtotal > 0 ? orderSubtotal : orderTotal;
      discountPaise += orderDiscount;
      returnedPaise += orderReturned;
      netPaise += Math.max(0, orderTotal - orderReturned);
      settledPaise += paidAmt;
      receivablePaise += creditAmt;

      items.push({
        id: doc.id,
        invoiceId,
        date: order.createdAt?.toDate ? order.createdAt.toDate().toISOString() : null,
        customerName,
        customerPhone,
        channel: orderChannel,
        paymentMethod: order.paymentMethod || 'cash',
        grossAmount: rupees(orderSubtotal > 0 ? orderSubtotal : orderTotal),
        discount: rupees(orderDiscount),
        netAmount: rupees(orderTotal),
        returnedAmount: rupees(orderReturned),
        settledAmount: rupees(paidAmt),
        balanceAmount: rupees(creditAmt),
        status: order.status || 'Delivered',
        paymentStatus: order.paymentStatus || (creditAmt > 0 ? 'Credit' : 'Paid'),
        items: order.items || []
      });
    }

    res.json({
      summary: {
        grossSales: rupees(grossPaise),
        discounts: rupees(discountPaise),
        customerReturns: rupees(returnedPaise),
        netSales: rupees(netPaise),
        amountSettled: rupees(settledPaise),
        remainingReceivable: rupees(receivablePaise),
        count: items.length
      },
      items
    });
  } catch (e) {
    fail(res, e);
  }
});

// -------------------------------------------------------------------------
// 2. PURCHASES REPORT
// -------------------------------------------------------------------------
reportsRouter.get('/reports/purchases', async (req, res) => {
  try {
    const db = firebase().db;
    const { start, end } = range(req.query.from, req.query.to);
    const supplierId = String(req.query.supplierId || '').trim();
    const search = String(req.query.q || '').toLowerCase().trim();

    const [purchasesSnaps, returnsSnaps] = await Promise.all([
      db.collection('erp_purchases').where('createdAt', '>=', start).where('createdAt', '<', end).orderBy('createdAt', 'desc').get(),
      db.collection('erp_supplierReturns').where('createdAt', '>=', start).where('createdAt', '<', end).get()
    ]);

    const returnsByPurchase = new Map<string, number>();
    for (const r of returnsSnaps.docs) {
      const data = r.data();
      returnsByPurchase.set(data.purchaseId, (returnsByPurchase.get(data.purchaseId) || 0) + paise(data.totalReturnValue || 0));
    }

    let receivedPaise = 0;
    let returnsPaise = 0;
    let paymentsPaise = 0;
    let creditsAppliedPaise = 0;
    let payablePaise = 0;

    const items: any[] = [];

    for (const doc of purchasesSnaps.docs) {
      const p = doc.data();
      if (supplierId && p.supplierId !== supplierId) continue;

      if (search) {
        const text = `${p.supplierName || ''} ${p.supplierInvoice || ''} ${doc.id}`.toLowerCase();
        if (!text.includes(search)) continue;
      }

      const total = paise(p.total || 0);
      const paid = paise(p.amountPaid || 0);
      const payable = paise(p.payable || 0);
      const returned = returnsByPurchase.get(doc.id) || paise(p.returnedAmount || 0);
      const creditsApplied = paise(p.creditsApplied || 0);

      receivedPaise += total;
      returnsPaise += returned;
      paymentsPaise += paid;
      creditsAppliedPaise += creditsApplied;
      payablePaise += payable;

      items.push({
        id: doc.id,
        date: p.createdAt?.toDate ? p.createdAt.toDate().toISOString() : null,
        supplierId: p.supplierId,
        supplierName: p.supplierName || '—',
        supplierInvoice: p.supplierInvoice || '—',
        total: rupees(total),
        amountPaid: rupees(paid),
        payable: rupees(payable),
        returnedAmount: rupees(returned),
        creditsApplied: rupees(creditsApplied),
        netPurchaseValue: rupees(Math.max(0, total - returned)),
        status: p.status || 'received',
        lines: p.lines || []
      });
    }

    res.json({
      summary: {
        receivedPurchaseValue: rupees(receivedPaise),
        supplierPurchaseReturns: rupees(returnsPaise),
        netPurchaseValue: rupees(Math.max(0, receivedPaise - returnsPaise)),
        paymentsAllocated: rupees(paymentsPaise),
        creditsApplied: rupees(creditsAppliedPaise),
        remainingPayable: rupees(payablePaise),
        count: items.length
      },
      items
    });
  } catch (e) {
    fail(res, e);
  }
});

// -------------------------------------------------------------------------
// 3. CUSTOMER RETURNS REPORT
// -------------------------------------------------------------------------
reportsRouter.get('/reports/customer-returns', async (req, res) => {
  try {
    const db = firebase().db;
    const { start, end } = range(req.query.from, req.query.to);
    const search = String(req.query.q || '').toLowerCase().trim();

    const [returnsSnaps, creditNotesSnaps] = await Promise.all([
      db.collection('erp_returns').where('createdAt', '>=', start).where('createdAt', '<', end).orderBy('createdAt', 'desc').get(),
      db.collection('erp_creditNotes').where('createdAt', '>=', start).where('createdAt', '<', end).get()
    ]);

    const cnByReturn = new Map(creditNotesSnaps.docs.map(d => [d.data().returnId, d.id]));

    let totalReturnsPaise = 0;
    let creditCancelledPaise = 0;
    let refundedPaise = 0;
    let pendingRefundPaise = 0;

    const items: any[] = [];

    for (const doc of returnsSnaps.docs) {
      const r = doc.data();
      const creditNoteId = r.creditNoteId || cnByReturn.get(doc.id) || '—';

      if (search) {
        const text = `${doc.id} ${r.orderId} ${creditNoteId} ${r.reason || ''}`.toLowerCase();
        if (!text.includes(search)) continue;
      }

      const total = paise(r.total || 0);
      const creditCancelled = paise(r.creditCancelled || 0);
      const refunded = paise(r.refundedAmount || 0);
      const refundToReview = paise(r.refundAmountToReview || 0);

      totalReturnsPaise += total;
      creditCancelledPaise += creditCancelled;
      refundedPaise += refunded;
      pendingRefundPaise += Math.max(0, refundToReview - refunded);

      items.push({
        id: doc.id,
        orderId: r.orderId,
        creditNoteId,
        date: r.createdAt?.toDate ? r.createdAt.toDate().toISOString() : null,
        reason: r.reason || 'General Return',
        total: rupees(total),
        creditCancelled: rupees(creditCancelled),
        refundedAmount: rupees(refunded),
        pendingRefund: rupees(Math.max(0, refundToReview - refunded)),
        refundStatus: r.refundStatus || 'not_required',
        lines: r.lines || []
      });
    }

    res.json({
      summary: {
        totalReturnsValue: rupees(totalReturnsPaise),
        creditCancelled: rupees(creditCancelledPaise),
        refundsPaid: rupees(refundedPaise),
        pendingRefunds: rupees(pendingRefundPaise),
        count: items.length
      },
      items
    });
  } catch (e) {
    fail(res, e);
  }
});

// -------------------------------------------------------------------------
// 4. SUPPLIER PURCHASE RETURNS & WORKFLOW
// -------------------------------------------------------------------------
reportsRouter.get('/purchases/returns', async (req, res) => {
  try {
    const db = firebase().db;
    const { start, end } = range(req.query.from, req.query.to);
    const supplierId = String(req.query.supplierId || '').trim();
    const search = String(req.query.q || '').toLowerCase().trim();

    const [returnsSnaps, refundSnaps] = await Promise.all([
      db.collection('erp_supplierReturns').where('createdAt', '>=', start).where('createdAt', '<', end).orderBy('createdAt', 'desc').get(),
      db.collection('erp_supplierRefunds').where('createdAt', '>=', start).where('createdAt', '<', end).get()
    ]);

    const refundsBySupplier = new Map<string, number>();
    for (const r of refundSnaps.docs) {
      const data = r.data();
      refundsBySupplier.set(data.supplierId, (refundsBySupplier.get(data.supplierId) || 0) + paise(data.amount || 0));
    }

    let totalReturnPaise = 0;
    let payablesReducedPaise = 0;
    let creditsCreatedPaise = 0;
    let refundsRecordedPaise = 0;

    for (const amt of refundsBySupplier.values()) {
      refundsRecordedPaise += amt;
    }

    const items: any[] = [];

    for (const doc of returnsSnaps.docs) {
      const r = doc.data();
      if (supplierId && r.supplierId !== supplierId) continue;

      if (search) {
        const text = `${r.returnNumber || doc.id} ${r.supplierName || ''} ${r.supplierInvoice || ''} ${r.purchaseId || ''}`.toLowerCase();
        if (!text.includes(search)) continue;
      }

      const returnVal = paise(r.totalReturnValue || 0);
      const reduced = paise(r.payableReduction || 0);
      const credit = paise(r.excessCredit || 0);
      const applied = paise(r.creditApplied || 0);

      totalReturnPaise += returnVal;
      payablesReducedPaise += reduced;
      creditsCreatedPaise += credit;

      items.push({
        id: doc.id,
        returnNumber: r.returnNumber || doc.id,
        date: r.createdAt?.toDate ? r.createdAt.toDate().toISOString() : null,
        supplierId: r.supplierId,
        supplierName: r.supplierName || '—',
        supplierInvoice: r.supplierInvoice || '—',
        purchaseId: r.purchaseId,
        returnedQuantity: r.lines?.reduce((s: number, l: any) => s + Number(l.quantity || 0), 0) || 0,
        totalReturnValue: rupees(returnVal),
        payableReduction: rupees(reduced),
        excessCredit: rupees(credit),
        creditApplied: rupees(applied),
        supplierCreditNoteRef: r.supplierCreditNoteRef || '',
        generalNote: r.generalNote || '',
        staff: r.staff || 'Store Staff',
        lines: r.lines || []
      });
    }

    // Get current total available supplier credit balance
    const accountsSnap = await db.collection('erp_supplierAccounts').get();
    let currentSupplierCreditsPaise = 0;
    accountsSnap.forEach(d => {
      currentSupplierCreditsPaise += paise(d.data().availableCredit || 0);
    });

    res.json({
      summary: {
        totalReturnValue: rupees(totalReturnPaise),
        payablesReduced: rupees(payablesReducedPaise),
        supplierCreditsCreated: rupees(creditsCreatedPaise),
        supplierRefundsRecorded: rupees(refundsRecordedPaise),
        currentAvailableCreditBalance: rupees(currentSupplierCreditsPaise),
        count: items.length
      },
      items
    });
  } catch (e) {
    fail(res, e);
  }
});

// CREATE PURCHASE RETURN
reportsRouter.post('/purchases/return', async (req, res) => {
  const schema = z.object({
    requestId: z.string().min(12).max(128).regex(/^[\w.:-]+$/),
    purchaseId: z.string().min(1).max(128),
    supplierCreditNoteRef: z.string().trim().max(100).optional().default(''),
    generalNote: z.string().trim().max(500).optional().default(''),
    lines: z.array(z.object({
      lineIndex: z.number().int().min(0),
      productId: z.string().min(1),
      sku: z.string().min(1),
      quantity: z.number().int().min(1).max(100000),
      reason: z.enum(['damaged', 'wrong_item', 'excess_stock', 'quality_issue', 'other']),
      note: z.string().trim().max(300).optional().default('')
    })).min(1).max(50)
  }).strict();

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.issues[0]?.message || 'Invalid return details.' });
    return;
  }

  try {
    const db = firebase().db;
    const input = parsed.data;

    const result = await idempotent(db, 'purchase_return_v1', input.requestId, input, async (tx: Transaction) => {
      const purchaseRef = db.collection('erp_purchases').doc(input.purchaseId);
      const purchaseSnap = await tx.get(purchaseRef);
      if (!purchaseSnap.exists) reject('Original purchase not found.', 404);
      const purchase = purchaseSnap.data()!;

      const supplierId = String(purchase.supplierId || '');
      const supplierName = String(purchase.supplierName || '');
      const supplierInvoice = String(purchase.supplierInvoice || '');

      const purchaseLines = Array.isArray(purchase.lines) ? purchase.lines : [];
      const returnedQuantities = { ...(purchase.returnedQuantities || {}) };

      // Load products
      const productIds = [...new Set(input.lines.map(l => l.productId))];
      const productRefs = productIds.map(pid => db.collection('products').doc(pid));
      const productSnaps = await tx.getAll(...productRefs);
      const productMap = new Map<string, DocumentData>();
      productSnaps.forEach((snap, idx) => {
        if (!snap.exists) reject(`Product ${productIds[idx]} not found.`, 404);
        productMap.set(productIds[idx], snap.data()!);
      });

      let totalReturnPaise = 0;
      const movements: DocumentData[] = [];
      const processedLines: any[] = [];

      for (const line of input.lines) {
        const origLine = purchaseLines[line.lineIndex];
        if (!origLine) reject(`Invalid purchase line index ${line.lineIndex}.`, 422);

        const alreadyReturned = Number(returnedQuantities[line.lineIndex] || 0);
        const returnableQty = Number(origLine.quantity || 0) - alreadyReturned;
        if (line.quantity > returnableQty) {
          reject(`Return quantity for ${origLine.name || line.sku} exceeds remaining returnable quantity (${returnableQty}).`, 422);
        }

        const product = productMap.get(line.productId)!;
        const variant = (product.variants || []).find((v: any) => v.sku === line.sku);
        const target = variant || product;
        const currentStock = Number(target.stock ?? target.quantity ?? 0);
        const reserved = Number(target.reserved || 0);

        if (currentStock < line.quantity) {
          reject(`Insufficient available stock for ${line.sku} (current: ${currentStock}, returning: ${line.quantity}).`, 422);
        }
        if (currentStock - line.quantity < reserved) {
          reject(`Cannot return stock reserved for customer orders for ${line.sku}.`, 422);
        }

        const unitCost = Number(origLine.unitCost || 0);
        const lineTotalPaise = paise(unitCost) * line.quantity;
        totalReturnPaise += lineTotalPaise;

        // Deduct stock
        const changed = changeStock(product, line.sku, -line.quantity).product;
        productMap.set(line.productId, changed);

        movements.push({
          movementId: `pr_${hash(`${input.requestId}:${line.lineIndex}`).slice(0, 24)}`,
          productId: line.productId,
          sku: line.sku,
          deltaChange: -line.quantity,
          stockAfter: currentStock - line.quantity,
          reason: 'purchase_return',
          source: 'admin',
          purchaseId: input.purchaseId,
          supplierId,
          createdAt: FieldValue.serverTimestamp()
        });

        returnedQuantities[line.lineIndex] = alreadyReturned + line.quantity;

        processedLines.push({
          lineIndex: line.lineIndex,
          productId: line.productId,
          sku: line.sku,
          name: origLine.name || line.sku,
          quantity: line.quantity,
          unitCost,
          returnValue: lineTotalPaise / 100,
          reason: line.reason,
          note: line.note
        });
      }

      // Accounting: First reduce outstanding payable on this purchase
      const currentPayablePaise = paise(purchase.payable || 0);
      const payableReductionPaise = Math.min(totalReturnPaise, currentPayablePaise);
      const newPayablePaise = Math.max(0, currentPayablePaise - payableReductionPaise);
      const excessCreditPaise = Math.max(0, totalReturnPaise - payableReductionPaise);

      // Supplier account update
      const accountRef = db.collection('erp_supplierAccounts').doc(supplierId);
      const accountSnap = await tx.get(accountRef);
      const prevCreditPaise = paise(accountSnap.data()?.availableCredit || 0);
      const newCreditPaise = prevCreditPaise + excessCreditPaise;

      tx.set(accountRef, {
        supplierId,
        supplierName,
        availableCredit: newCreditPaise / 100,
        updatedAt: FieldValue.serverTimestamp()
      }, { merge: true });

      // Update purchase
      tx.update(purchaseRef, {
        payable: newPayablePaise / 100,
        returnedQuantities,
        returnedAmount: (paise(purchase.returnedAmount || 0) + totalReturnPaise) / 100,
        updatedAt: FieldValue.serverTimestamp()
      });

      // Update products
      for (const [pid, pdata] of productMap.entries()) {
        tx.update(db.collection('products').doc(pid), {
          ...pdata,
          updatedAt: FieldValue.serverTimestamp()
        });
      }

      // Record stock movements
      for (const m of movements) {
        tx.create(db.collection('stockMovements').doc(m.movementId), m);
      }

      // Sequence for return number
      const fy = fiscalYear();
      const returnNumber = `BOG-PR-${fy}-${hash(input.requestId).slice(0, 8).toUpperCase()}`;
      const returnId = `PR-${hash(input.requestId).slice(0, 24)}`;

      // Record return in erp_supplierReturns
      tx.create(db.collection('erp_supplierReturns').doc(returnId), {
        id: returnId,
        returnNumber,
        purchaseId: input.purchaseId,
        supplierId,
        supplierName,
        supplierInvoice,
        lines: processedLines,
        totalReturnValue: totalReturnPaise / 100,
        payableReduction: payableReductionPaise / 100,
        excessCredit: excessCreditPaise / 100,
        supplierCreditNoteRef: input.supplierCreditNoteRef,
        generalNote: input.generalNote,
        staff: res.locals.owner?.name || res.locals.owner?.uid || 'Store Staff',
        createdAt: FieldValue.serverTimestamp()
      });

      return {
        returnId,
        returnNumber,
        totalReturnValue: totalReturnPaise / 100,
        payableReduction: payableReductionPaise / 100,
        excessCredit: excessCreditPaise / 100,
        newPayable: newPayablePaise / 100
      };
    });

    res.status(201).json(result);
  } catch (e) {
    fail(res, e);
  }
});

// APPLY SUPPLIER CREDIT TO ANOTHER PURCHASE
reportsRouter.post('/purchases/return/apply-credit', async (req, res) => {
  const schema = z.object({
    requestId: z.string().min(12).max(128).regex(/^[\w.:-]+$/),
    supplierId: z.string().min(1),
    targetPurchaseId: z.string().min(1),
    amount: z.number().finite().min(0.01).max(10000000)
  }).strict();

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.issues[0]?.message || 'Invalid credit application.' });
    return;
  }

  try {
    const db = firebase().db;
    const input = parsed.data;

    const result = await idempotent(db, 'supplier_credit_apply', input.requestId, input, async (tx: Transaction) => {
      const accountRef = db.collection('erp_supplierAccounts').doc(input.supplierId);
      const purchaseRef = db.collection('erp_purchases').doc(input.targetPurchaseId);

      const [accountSnap, purchaseSnap] = await tx.getAll(accountRef, purchaseRef);
      if (!accountSnap.exists) reject('Supplier account not found.', 404);
      if (!purchaseSnap.exists) reject('Target purchase not found.', 404);

      const applyPaise = paise(input.amount);
      const availablePaise = paise(accountSnap.data()?.availableCredit || 0);
      const payablePaise = paise(purchaseSnap.data()?.payable || 0);

      if (applyPaise > availablePaise) reject('Applied amount exceeds available supplier credit.', 422);
      if (applyPaise > payablePaise) reject('Applied amount exceeds outstanding purchase payable.', 422);

      tx.update(accountRef, {
        availableCredit: (availablePaise - applyPaise) / 100,
        updatedAt: FieldValue.serverTimestamp()
      });

      tx.update(purchaseRef, {
        payable: (payablePaise - applyPaise) / 100,
        creditsApplied: (paise(purchaseSnap.data()?.creditsApplied || 0) + applyPaise) / 100,
        updatedAt: FieldValue.serverTimestamp()
      });

      tx.create(db.collection('erp_supplierCreditUsage').doc(hash(input.requestId)), {
        supplierId: input.supplierId,
        purchaseId: input.targetPurchaseId,
        amount: input.amount,
        action: 'credit_applied_to_purchase',
        createdAt: FieldValue.serverTimestamp()
      });

      return { applied: true, remainingCredit: (availablePaise - applyPaise) / 100 };
    });

    res.json(result);
  } catch (e) {
    fail(res, e);
  }
});

// RECORD REFUND RECEIVED FROM SUPPLIER
reportsRouter.post('/purchases/return/refund', async (req, res) => {
  const schema = z.object({
    requestId: z.string().min(12).max(128).regex(/^[\w.:-]+$/),
    supplierId: z.string().min(1),
    amount: z.number().finite().min(0.01).max(10000000),
    method: z.enum(['cash', 'upi', 'card', 'bank']),
    reference: z.string().trim().min(1).max(100),
    note: z.string().trim().max(300).optional().default('')
  }).strict();

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.issues[0]?.message || 'Invalid refund details.' });
    return;
  }

  try {
    const db = firebase().db;
    const input = parsed.data;

    const result = await idempotent(db, 'supplier_refund', input.requestId, input, async (tx: Transaction) => {
      const accountRef = db.collection('erp_supplierAccounts').doc(input.supplierId);
      const accountSnap = await tx.get(accountRef);
      if (!accountSnap.exists) reject('Supplier account not found.', 404);

      const refundPaise = paise(input.amount);
      const availablePaise = paise(accountSnap.data()?.availableCredit || 0);

      if (refundPaise > availablePaise) reject('Refund amount exceeds available supplier credit.', 422);

      tx.update(accountRef, {
        availableCredit: (availablePaise - refundPaise) / 100,
        updatedAt: FieldValue.serverTimestamp()
      });

      tx.create(db.collection('erp_supplierRefunds').doc(hash(input.requestId)), {
        supplierId: input.supplierId,
        amount: input.amount,
        method: input.method,
        reference: input.reference,
        note: input.note,
        createdAt: FieldValue.serverTimestamp()
      });

      return { recorded: true, remainingCredit: (availablePaise - refundPaise) / 100 };
    });

    res.json(result);
  } catch (e) {
    fail(res, e);
  }
});

// -------------------------------------------------------------------------
// 5. PROFIT & LOSS REPORT
// -------------------------------------------------------------------------
reportsRouter.get('/reports/profit-loss', async (req, res) => {
  try {
    const db = firebase().db;
    const { start, end } = range(req.query.from, req.query.to);

    const [orderSnaps, returnSnaps, expenseSnaps] = await Promise.all([
      db.collection('orders').where('createdAt', '>=', start).where('createdAt', '<', end).get(),
      db.collection('erp_returns').where('createdAt', '>=', start).where('createdAt', '<', end).get(),
      db.collection('erp_expenses').where('createdAt', '>=', start).where('createdAt', '<', end).get()
    ]);

    let grossSalesPaise = 0;
    let discountsPaise = 0;
    let cogsPaise = 0;
    let knownLines = 0;
    let unknownLines = 0;
    let totalLines = 0;

    for (const doc of orderSnaps.docs) {
      const o = doc.data();
      const status = String(o.status || '').toLowerCase();
      if (status === 'cancelled') continue;

      const items = Array.isArray(o.items) ? o.items : [];
      const orderSubtotal = paise(o.subtotal ?? o.totalAmount ?? 0);
      const orderDiscount = paise(o.discount ?? 0);

      grossSalesPaise += orderSubtotal;
      discountsPaise += orderDiscount;

      for (const item of items) {
        totalLines++;
        if (item.costKnown === true && typeof item.unitCost === 'number') {
          knownLines++;
          cogsPaise += paise(item.unitCost) * Number(item.quantity || 1);
        } else if (item.costPrice !== undefined && typeof item.costPrice === 'number' && item.costPrice > 0) {
          knownLines++;
          cogsPaise += paise(item.costPrice) * Number(item.quantity || 1);
        } else {
          unknownLines++;
        }
      }
    }

    let customerReturnsPaise = 0;
    let returnCostReversedPaise = 0;
    let damagedWriteOffPaise = 0;

    for (const r of returnSnaps.docs) {
      const data = r.data();
      customerReturnsPaise += paise(data.total || 0);

      // Lines restocked vs damaged
      const lines = Array.isArray(data.lines) ? data.lines : [];
      for (const line of lines) {
        const itemCost = paise(line.unitCost || line.costPrice || 0);
        if (line.restock === false) {
          damagedWriteOffPaise += itemCost * Number(line.quantity || 1);
        } else {
          returnCostReversedPaise += itemCost * Number(line.quantity || 1);
        }
      }
    }

    // Net COGS = COGS - Restocked Cost Reversals
    const netCogsPaise = Math.max(0, cogsPaise - returnCostReversedPaise);
    const netRevenuePaise = Math.max(0, grossSalesPaise - discountsPaise - customerReturnsPaise);
    const grossProfitPaise = netRevenuePaise - netCogsPaise;
    const grossMarginPercent = netRevenuePaise > 0 ? (grossProfitPaise / netRevenuePaise) * 100 : 0;

    // Operating expenses (category === 'expense' only; 'withdrawal' excluded from OPEX!)
    let operatingExpensesPaise = 0;
    let ownerWithdrawalsPaise = 0;

    for (const doc of expenseSnaps.docs) {
      const e = doc.data();
      if (e.category === 'withdrawal') {
        ownerWithdrawalsPaise += paise(e.amount || 0);
      } else {
        operatingExpensesPaise += paise(e.amount || 0);
      }
    }

    const resultAfterExpensesPaise = grossProfitPaise - operatingExpensesPaise - damagedWriteOffPaise;
    const completenessPercent = totalLines > 0 ? Math.round((knownLines / totalLines) * 1000) / 10 : 100;

    res.json({
      figures: {
        grossSales: rupees(grossSalesPaise),
        discounts: rupees(discountsPaise),
        customerReturns: rupees(customerReturnsPaise),
        netRevenue: rupees(netRevenuePaise),
        cogs: rupees(netCogsPaise),
        grossProfit: rupees(grossProfitPaise),
        grossMarginPercent: Math.round(grossMarginPercent * 100) / 100,
        operatingExpenses: rupees(operatingExpensesPaise),
        damagedWriteOffs: rupees(damagedWriteOffPaise),
        resultAfterRecordedExpenses: rupees(resultAfterExpensesPaise),
        ownerWithdrawals: rupees(ownerWithdrawalsPaise)
      },
      completeness: {
        totalLines,
        knownLines,
        unknownLines,
        completenessPercent,
        isComplete: unknownLines === 0
      }
    });
  } catch (e) {
    fail(res, e);
  }
});

// -------------------------------------------------------------------------
// 6. BILL-WISE PROFIT REPORT
// -------------------------------------------------------------------------
reportsRouter.get('/reports/bill-profit', async (req, res) => {
  try {
    const db = firebase().db;
    const { start, end } = range(req.query.from, req.query.to);
    const view = String(req.query.view || 'lifetime').toLowerCase(); // 'lifetime' or 'period'
    const search = String(req.query.q || '').toLowerCase().trim();

    const [orderSnaps, invoiceSnaps, returnSnaps] = await Promise.all([
      db.collection('orders').where('createdAt', '>=', start).where('createdAt', '<', end).orderBy('createdAt', 'desc').get(),
      db.collection('erp_invoices').where('createdAt', '>=', start).where('createdAt', '<', end).get(),
      db.collection('erp_returns').where('createdAt', '>=', start).where('createdAt', '<', end).get()
    ]);

    const invoicesByOrder = new Map(invoiceSnaps.docs.map(d => [d.data().orderId, d.id]));
    const returnsByOrder = new Map<string, number>();
    for (const r of returnSnaps.docs) {
      const data = r.data();
      returnsByOrder.set(data.orderId, (returnsByOrder.get(data.orderId) || 0) + paise(data.total || 0));
    }

    let totalRevenuePaise = 0;
    let totalCogsPaise = 0;
    let totalGrossProfitPaise = 0;
    let billsWithFullCost = 0;

    const items: any[] = [];

    for (const doc of orderSnaps.docs) {
      const o = doc.data();
      const invoiceId = invoicesByOrder.get(doc.id) || doc.id;
      const customer = o.customerName || 'Walk-in';

      if (search && !`${invoiceId} ${customer}`.toLowerCase().includes(search)) continue;

      const subtotal = paise(o.subtotal ?? o.totalAmount ?? 0);
      const discount = paise(o.discount ?? 0);
      const returned = returnsByOrder.get(doc.id) || paise(o.returnedAmount || 0);
      const net = Math.max(0, subtotal - discount - returned);

      const lines = Array.isArray(o.items) ? o.items : [];
      let billCogs = 0;
      let hasMissingCost = false;

      for (const line of lines) {
        if (line.costKnown === true && typeof line.unitCost === 'number') {
          billCogs += paise(line.unitCost) * Number(line.quantity || 1);
        } else if (line.costPrice !== undefined && typeof line.costPrice === 'number' && line.costPrice > 0) {
          billCogs += paise(line.costPrice) * Number(line.quantity || 1);
        } else {
          hasMissingCost = true;
        }
      }

      if (!hasMissingCost) billsWithFullCost++;

      const grossProfit = net - billCogs;
      const margin = net > 0 ? (grossProfit / net) * 100 : 0;

      totalRevenuePaise += net;
      totalCogsPaise += billCogs;
      totalGrossProfitPaise += grossProfit;

      items.push({
        orderId: doc.id,
        invoiceId,
        date: o.createdAt?.toDate ? o.createdAt.toDate().toISOString() : null,
        customer,
        channel: o.createdBy === 'admin-pos' ? 'POS' : 'Website',
        saleValue: rupees(subtotal),
        discount: rupees(discount),
        returnedRevenue: rupees(returned),
        netRevenue: rupees(net),
        cogs: rupees(billCogs),
        grossProfit: rupees(grossProfit),
        marginPercent: Math.round(margin * 10) / 10,
        costStatus: hasMissingCost ? (billCogs > 0 ? 'partial' : 'unavailable') : 'complete'
      });
    }

    res.json({
      summary: {
        netRevenue: rupees(totalRevenuePaise),
        cogs: rupees(totalCogsPaise),
        grossProfit: rupees(totalGrossProfitPaise),
        overallMarginPercent: totalRevenuePaise > 0 ? Math.round((totalGrossProfitPaise / totalRevenuePaise) * 1000) / 10 : 0,
        costCompletenessPercent: items.length > 0 ? Math.round((billsWithFullCost / items.length) * 100) : 100,
        count: items.length,
        view
      },
      items
    });
  } catch (e) {
    fail(res, e);
  }
});

// -------------------------------------------------------------------------
// 7. ITEM-WISE PROFIT REPORT
// -------------------------------------------------------------------------
reportsRouter.get('/reports/item-profit', async (req, res) => {
  try {
    const db = firebase().db;
    const { start, end } = range(req.query.from, req.query.to);
    const sortBy = String(req.query.sortBy || 'profit_desc');
    const search = String(req.query.q || '').toLowerCase().trim();

    const orderSnaps = await db.collection('orders').where('createdAt', '>=', start).where('createdAt', '<', end).get();

    type ItemAgg = {
      productId: string;
      productName: string;
      sku: string;
      size: string;
      color: string;
      qtySold: number;
      qtyReturned: number;
      netRevenuePaise: number;
      cogsPaise: number;
      knownCost: boolean;
    };

    const map = new Map<string, ItemAgg>();

    for (const doc of orderSnaps.docs) {
      const o = doc.data();
      const items = Array.isArray(o.items) ? o.items : [];
      for (const item of items) {
        const sku = String(item.sku || 'UNKNOWN');
        const key = sku;

        const existing = map.get(key) || {
          productId: item.productId || '',
          productName: item.name || sku,
          sku,
          size: item.size || '—',
          color: item.color || '—',
          qtySold: 0,
          qtyReturned: 0,
          netRevenuePaise: 0,
          cogsPaise: 0,
          knownCost: true
        };

        const qty = Number(item.quantity || 1);
        const linePricePaise = paise(item.price || 0) * qty;
        const lineDiscPaise = paise(item.discount || 0);
        const netLinePaise = Math.max(0, linePricePaise - lineDiscPaise);

        existing.qtySold += qty;
        existing.netRevenuePaise += netLinePaise;

        if (item.costKnown === true && typeof item.unitCost === 'number') {
          existing.cogsPaise += paise(item.unitCost) * qty;
        } else if (item.costPrice !== undefined && typeof item.costPrice === 'number' && item.costPrice > 0) {
          existing.cogsPaise += paise(item.costPrice) * qty;
        } else {
          existing.knownCost = false;
        }

        map.set(key, existing);
      }
    }

    let rows = Array.from(map.values()).map(r => {
      const grossProfitPaise = r.netRevenuePaise - r.cogsPaise;
      const margin = r.netRevenuePaise > 0 ? (grossProfitPaise / r.netRevenuePaise) * 100 : 0;
      return {
        ...r,
        netRevenue: rupees(r.netRevenuePaise),
        cogs: rupees(r.cogsPaise),
        grossProfit: rupees(grossProfitPaise),
        marginPercent: Math.round(margin * 10) / 10,
        costStatus: r.knownCost ? 'complete' : 'unavailable'
      };
    });

    if (search) {
      rows = rows.filter(r => `${r.productName} ${r.sku}`.toLowerCase().includes(search));
    }

    if (sortBy === 'profit_desc') rows.sort((a, b) => b.grossProfit - a.grossProfit);
    else if (sortBy === 'profit_asc') rows.sort((a, b) => a.grossProfit - b.grossProfit);
    else if (sortBy === 'qty_desc') rows.sort((a, b) => b.qtySold - a.qtySold);
    else if (sortBy === 'revenue_desc') rows.sort((a, b) => b.netRevenue - a.netRevenue);

    res.json({
      items: rows,
      totalItems: rows.length
    });
  } catch (e) {
    fail(res, e);
  }
});

// -------------------------------------------------------------------------
// 8. PARTY REPORTS
// -------------------------------------------------------------------------

// CUSTOMER STATEMENT
reportsRouter.get('/reports/party/customer-statement', async (req, res) => {
  try {
    const db = firebase().db;
    const { start, end } = range(req.query.from, req.query.to);
    const phone = String(req.query.phone || '').trim();
    if (!phone) reject('Customer phone number required for statement.');

    // Opening balance: orders & credit entries prior to start date
    const [priorOrders, priorLedger] = await Promise.all([
      db.collection('orders').where('customerPhone', '==', phone).where('createdAt', '<', start).get(),
      db.collection('erp_customerLedger').where('phone', '==', phone).where('createdAt', '<', start).get()
    ]);

    let openingCreditPaise = 0;
    for (const d of priorOrders.docs) {
      const o = d.data();
      openingCreditPaise += paise(o.creditAmount || (o.paymentMethod === 'credit' ? o.totalAmount : 0));
    }
    for (const d of priorLedger.docs) {
      const l = d.data();
      if (l.kind === 'payment') openingCreditPaise -= paise(l.amount || -l.creditDelta || 0);
      if (l.kind === 'credit') openingCreditPaise += paise(l.creditDelta || l.amount || 0);
      if (l.kind === 'return') openingCreditPaise -= paise(l.amount || -l.creditDelta || 0);
    }

    // Selected period transactions
    const [periodOrders, periodLedger] = await Promise.all([
      db.collection('orders').where('customerPhone', '==', phone).where('createdAt', '>=', start).where('createdAt', '<', end).orderBy('createdAt', 'asc').get(),
      db.collection('erp_customerLedger').where('phone', '==', phone).where('createdAt', '>=', start).where('createdAt', '<', end).orderBy('createdAt', 'asc').get()
    ]);

    const txs: any[] = [];
    let runningBalancePaise = openingCreditPaise;

    for (const d of periodOrders.docs) {
      const o = d.data();
      const creditGiven = paise(o.creditAmount || (o.paymentMethod === 'credit' ? o.totalAmount : 0));
      runningBalancePaise += creditGiven;
      txs.push({
        id: d.id,
        date: o.createdAt?.toDate ? o.createdAt.toDate().toISOString() : null,
        type: 'Sale / Bill',
        reference: o.invoiceNumber || d.id,
        totalAmount: rupees(paise(o.totalAmount || 0)),
        creditDelta: rupees(creditGiven),
        paymentDelta: 0,
        runningBalance: rupees(runningBalancePaise)
      });
    }

    for (const d of periodLedger.docs) {
      const l = d.data();
      const paid = l.kind === 'payment' ? paise(l.amount || -l.creditDelta || 0) : 0;
      const ret = l.kind === 'return' ? paise(l.amount || -l.creditDelta || 0) : 0;
      runningBalancePaise -= (paid + ret);
      txs.push({
        id: d.id,
        date: l.createdAt?.toDate ? l.createdAt.toDate().toISOString() : null,
        type: l.kind === 'payment' ? 'Payment Received' : 'Return Adjustment',
        reference: l.note || l.appliesTo || d.id,
        totalAmount: 0,
        creditDelta: 0,
        paymentDelta: rupees(paid + ret),
        runningBalance: rupees(runningBalancePaise)
      });
    }

    txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    res.json({
      customerPhone: phone,
      openingBalance: rupees(openingCreditPaise),
      closingBalance: rupees(runningBalancePaise),
      transactions: txs
    });
  } catch (e) {
    fail(res, e);
  }
});

// SUPPLIER STATEMENT
reportsRouter.get('/reports/party/supplier-statement', async (req, res) => {
  try {
    const db = firebase().db;
    const { start, end } = range(req.query.from, req.query.to);
    const supplierId = String(req.query.supplierId || '').trim();
    if (!supplierId) reject('Supplier selection required.');

    const [priorPurchases, priorPayments, priorReturns] = await Promise.all([
      db.collection('erp_purchases').where('supplierId', '==', supplierId).where('createdAt', '<', start).get(),
      db.collection('erp_supplierPayments').where('supplierId', '==', supplierId).where('createdAt', '<', start).get(),
      db.collection('erp_supplierReturns').where('supplierId', '==', supplierId).where('createdAt', '<', start).get()
    ]);

    let openingPayablePaise = 0;
    for (const d of priorPurchases.docs) openingPayablePaise += paise(d.data().total || 0);
    for (const d of priorPayments.docs) openingPayablePaise -= paise(d.data().amount || 0);
    for (const d of priorReturns.docs) openingPayablePaise -= paise(d.data().payableReduction || 0);

    const [periodPurchases, periodPayments, periodReturns] = await Promise.all([
      db.collection('erp_purchases').where('supplierId', '==', supplierId).where('createdAt', '>=', start).where('createdAt', '<', end).orderBy('createdAt', 'asc').get(),
      db.collection('erp_supplierPayments').where('supplierId', '==', supplierId).where('createdAt', '>=', start).where('createdAt', '<', end).orderBy('createdAt', 'asc').get(),
      db.collection('erp_supplierReturns').where('supplierId', '==', supplierId).where('createdAt', '>=', start).where('createdAt', '<', end).orderBy('createdAt', 'asc').get()
    ]);

    const txs: any[] = [];
    let runningPayablePaise = openingPayablePaise;

    for (const d of periodPurchases.docs) {
      const p = d.data();
      const tot = paise(p.total || 0);
      runningPayablePaise += tot;
      txs.push({
        id: d.id,
        date: p.createdAt?.toDate ? p.createdAt.toDate().toISOString() : null,
        type: 'Purchase Invoice',
        reference: p.supplierInvoice || d.id,
        debit: 0,
        credit: rupees(tot),
        runningBalance: rupees(runningPayablePaise)
      });
    }

    for (const d of periodPayments.docs) {
      const p = d.data();
      const amt = paise(p.amount || 0);
      runningPayablePaise -= amt;
      txs.push({
        id: d.id,
        date: p.createdAt?.toDate ? p.createdAt.toDate().toISOString() : null,
        type: 'Payment Made',
        reference: p.note || p.method || d.id,
        debit: rupees(amt),
        credit: 0,
        runningBalance: rupees(runningPayablePaise)
      });
    }

    for (const d of periodReturns.docs) {
      const r = d.data();
      const reduced = paise(r.payableReduction || 0);
      runningPayablePaise -= reduced;
      txs.push({
        id: d.id,
        date: r.createdAt?.toDate ? r.createdAt.toDate().toISOString() : null,
        type: 'Purchase Return',
        reference: r.returnNumber || d.id,
        debit: rupees(reduced),
        credit: 0,
        runningBalance: rupees(runningPayablePaise)
      });
    }

    txs.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Current available credit
    const accSnap = await db.collection('erp_supplierAccounts').doc(supplierId).get();
    const availableCredit = rupees(paise(accSnap.data()?.availableCredit || 0));

    res.json({
      supplierId,
      openingPayable: rupees(openingPayablePaise),
      closingPayable: rupees(runningPayablePaise),
      availableCredit,
      transactions: txs
    });
  } catch (e) {
    fail(res, e);
  }
});

// OUTSTANDING UDHAR
reportsRouter.get('/reports/party/outstanding-udhar', async (_req, res) => {
  try {
    const db = firebase().db;
    const accounts = await db.collection('erp_creditAccounts').get();
    const today = shopDate();

    let totalOutstandingPaise = 0;
    let notYetDuePaise = 0;
    let overduePaise = 0;
    let undatedPaise = 0;

    const customers: any[] = [];

    for (const doc of accounts.docs) {
      const acc = doc.data();
      const balance = paise(acc.balance || 0);
      if (balance <= 0) continue;

      totalOutstandingPaise += balance;
      const debts = Array.isArray(acc.debts) ? acc.debts : [];

      let custOverduePaise = 0;
      let custNotDuePaise = 0;
      let custUndatedPaise = 0;

      for (const debt of debts) {
        const rem = paise(debt.remaining || 0);
        if (rem <= 0) continue;
        if (!debt.dueDate) {
          custUndatedPaise += rem;
        } else if (debt.dueDate < today) {
          custOverduePaise += rem;
        } else {
          custNotDuePaise += rem;
        }
      }

      overduePaise += custOverduePaise;
      notYetDuePaise += custNotDuePaise;
      undatedPaise += custUndatedPaise;

      customers.push({
        customerKey: doc.id,
        name: acc.name || 'Walk-in',
        phone: acc.phone || '—',
        balance: rupees(balance),
        notYetDue: rupees(custNotDuePaise),
        overdue: rupees(custOverduePaise),
        undated: rupees(custUndatedPaise),
        status: custOverduePaise > 0 ? 'Overdue' : 'Due Later'
      });
    }

    customers.sort((a, b) => b.balance - a.balance);

    res.json({
      summary: {
        totalOutstanding: rupees(totalOutstandingPaise),
        notYetDue: rupees(notYetDuePaise),
        overdue: rupees(overduePaise),
        undated: rupees(undatedPaise),
        customerCount: customers.length
      },
      customers
    });
  } catch (e) {
    fail(res, e);
  }
});

// SUPPLIER PAYABLES & CREDITS
reportsRouter.get('/reports/party/supplier-payables', async (_req, res) => {
  try {
    const db = firebase().db;
    const [suppliersSnap, purchasesSnap, accountsSnap] = await Promise.all([
      db.collection('erp_suppliers').get(),
      db.collection('erp_purchases').get(),
      db.collection('erp_supplierAccounts').get()
    ]);

    const accountsMap = new Map(accountsSnap.docs.map(d => [d.id, d.data()]));
    const purchasesBySupplier = new Map<string, { totalPaise: number; paidPaise: number; payablePaise: number }>();

    for (const d of purchasesSnap.docs) {
      const p = d.data();
      const supId = p.supplierId;
      const prev = purchasesBySupplier.get(supId) || { totalPaise: 0, paidPaise: 0, payablePaise: 0 };
      prev.totalPaise += paise(p.total || 0);
      prev.paidPaise += paise(p.amountPaid || 0);
      prev.payablePaise += paise(p.payable || 0);
      purchasesBySupplier.set(supId, prev);
    }

    let totalPayablesPaise = 0;
    let totalCreditsPaise = 0;
    const items: any[] = [];

    for (const d of suppliersSnap.docs) {
      const s = d.data();
      const pStats = purchasesBySupplier.get(d.id) || { totalPaise: 0, paidPaise: 0, payablePaise: 0 };
      const acc = accountsMap.get(d.id);
      const creditPaise = paise(acc?.availableCredit || 0);

      totalPayablesPaise += pStats.payablePaise;
      totalCreditsPaise += creditPaise;

      items.push({
        id: d.id,
        name: s.name || '—',
        phone: s.phone || '—',
        totalPurchases: rupees(pStats.totalPaise),
        totalPaid: rupees(pStats.paidPaise),
        outstandingPayable: rupees(pStats.payablePaise),
        availableCredit: rupees(creditPaise)
      });
    }

    items.sort((a, b) => b.outstandingPayable - a.outstandingPayable);

    res.json({
      summary: {
        totalOutstandingPayable: rupees(totalPayablesPaise),
        totalAvailableCredits: rupees(totalCreditsPaise),
        supplierCount: items.length
      },
      items
    });
  } catch (e) {
    fail(res, e);
  }
});

// -------------------------------------------------------------------------
// 9. CASH FLOW REPORT
// -------------------------------------------------------------------------
reportsRouter.get('/reports/cash-flow', async (req, res) => {
  try {
    const db = firebase().db;
    const { start, end } = range(req.query.from, req.query.to);

    const [orders, creditLedger, refunds, expenses, supplierPayments, supplierRefunds] = await Promise.all([
      db.collection('orders').where('createdAt', '>=', start).where('createdAt', '<', end).get(),
      db.collection('erp_customerLedger').where('createdAt', '>=', start).where('createdAt', '<', end).get(),
      db.collection('erp_refunds').where('createdAt', '>=', start).where('createdAt', '<', end).get(),
      db.collection('erp_expenses').where('createdAt', '>=', start).where('createdAt', '<', end).get(),
      db.collection('erp_supplierPayments').where('createdAt', '>=', start).where('createdAt', '<', end).get(),
      db.collection('erp_supplierRefunds').where('createdAt', '>=', start).where('createdAt', '<', end).get()
    ]);

    type MethodFlow = { cash: number; upi: number; card: number; bank?: number; total: number };
    const createFlow = (): MethodFlow => ({ cash: 0, upi: 0, card: 0, bank: 0, total: 0 });

    const salesInflow = createFlow();
    const udharInflow = createFlow();
    const supplierRefundInflow = createFlow();

    const customerRefundOutflow = createFlow();
    const expenseOutflow = createFlow();
    const supplierPaymentOutflow = createFlow();
    const ownerWithdrawalOutflow = createFlow();

    // Sales inflows
    for (const d of orders.docs) {
      const o = d.data();
      if (['delivered', 'returned', 'partially returned'].includes(String(o.status || '').toLowerCase())) {
        if (Array.isArray(o.payments)) {
          for (const p of o.payments) {
            const m = String(p.method || 'cash').toLowerCase() as keyof MethodFlow;
            const amt = paise(p.amount || 0);
            if (m in salesInflow) (salesInflow as any)[m] += amt;
            salesInflow.total += amt;
          }
        } else if (o.paymentMethod) {
          const m = String(o.paymentMethod).toLowerCase() as keyof MethodFlow;
          const amt = paise(o.totalAmount || 0);
          if (m in salesInflow) (salesInflow as any)[m] += amt;
          salesInflow.total += amt;
        }
      }
    }

    // Udhar repayments
    for (const d of creditLedger.docs) {
      const l = d.data();
      if (l.kind === 'payment') {
        const m = String(l.paymentMethod || 'cash').toLowerCase() as keyof MethodFlow;
        const amt = -paise(l.creditDelta || 0);
        if (m in udharInflow) (udharInflow as any)[m] += amt;
        udharInflow.total += amt;
      }
    }

    // Supplier refunds
    for (const d of supplierRefunds.docs) {
      const r = d.data();
      const m = String(r.method || 'cash').toLowerCase() as keyof MethodFlow;
      const amt = paise(r.amount || 0);
      if (m in supplierRefundInflow) (supplierRefundInflow as any)[m] += amt;
      supplierRefundInflow.total += amt;
    }

    // Customer refunds
    for (const d of refunds.docs) {
      const r = d.data();
      const m = String(r.method || 'cash').toLowerCase() as keyof MethodFlow;
      const amt = paise(r.amount || 0);
      if (m in customerRefundOutflow) (customerRefundOutflow as any)[m] += amt;
      customerRefundOutflow.total += amt;
    }

    // Expenses & Withdrawals
    for (const d of expenses.docs) {
      const e = d.data();
      const m = String(e.method || 'cash').toLowerCase() as keyof MethodFlow;
      const amt = paise(e.amount || 0);
      if (e.category === 'withdrawal') {
        if (m in ownerWithdrawalOutflow) (ownerWithdrawalOutflow as any)[m] += amt;
        ownerWithdrawalOutflow.total += amt;
      } else {
        if (m in expenseOutflow) (expenseOutflow as any)[m] += amt;
        expenseOutflow.total += amt;
      }
    }

    // Supplier payments
    for (const d of supplierPayments.docs) {
      const p = d.data();
      const m = String(p.method || 'cash').toLowerCase() as keyof MethodFlow;
      const amt = paise(p.amount || 0);
      if (m in supplierPaymentOutflow) (supplierPaymentOutflow as any)[m] += amt;
      supplierPaymentOutflow.total += amt;
    }

    const totalInflowPaise = salesInflow.total + udharInflow.total + supplierRefundInflow.total;
    const totalOutflowPaise = customerRefundOutflow.total + expenseOutflow.total + supplierPaymentOutflow.total + ownerWithdrawalOutflow.total;
    const netCashMovementPaise = totalInflowPaise - totalOutflowPaise;

    res.json({
      inflows: {
        salesCollections: { cash: rupees(salesInflow.cash), upi: rupees(salesInflow.upi), card: rupees(salesInflow.card), total: rupees(salesInflow.total) },
        udharRepayments: { cash: rupees(udharInflow.cash), upi: rupees(udharInflow.upi), card: rupees(udharInflow.card), total: rupees(udharInflow.total) },
        supplierRefunds: { cash: rupees(supplierRefundInflow.cash), upi: rupees(supplierRefundInflow.upi), card: rupees(supplierRefundInflow.card), total: rupees(supplierRefundInflow.total) },
        totalInflow: rupees(totalInflowPaise)
      },
      outflows: {
        customerRefunds: { cash: rupees(customerRefundOutflow.cash), upi: rupees(customerRefundOutflow.upi), card: rupees(customerRefundOutflow.card), total: rupees(customerRefundOutflow.total) },
        operatingExpenses: { cash: rupees(expenseOutflow.cash), upi: rupees(expenseOutflow.upi), card: rupees(expenseOutflow.card), total: rupees(expenseOutflow.total) },
        supplierPayments: { cash: rupees(supplierPaymentOutflow.cash), upi: rupees(supplierPaymentOutflow.upi), card: rupees(supplierPaymentOutflow.card), total: rupees(supplierPaymentOutflow.total) },
        ownerWithdrawals: { cash: rupees(ownerWithdrawalOutflow.cash), upi: rupees(ownerWithdrawalOutflow.upi), card: rupees(ownerWithdrawalOutflow.card), total: rupees(ownerWithdrawalOutflow.total) },
        totalOutflow: rupees(totalOutflowPaise)
      },
      netCashMovement: {
        cash: rupees(salesInflow.cash + udharInflow.cash + supplierRefundInflow.cash - customerRefundOutflow.cash - expenseOutflow.cash - supplierPaymentOutflow.cash - ownerWithdrawalOutflow.cash),
        upi: rupees(salesInflow.upi + udharInflow.upi + supplierRefundInflow.upi - customerRefundOutflow.upi - expenseOutflow.upi - supplierPaymentOutflow.upi - ownerWithdrawalOutflow.upi),
        card: rupees(salesInflow.card + udharInflow.card + supplierRefundInflow.card - customerRefundOutflow.card - expenseOutflow.card - supplierPaymentOutflow.card - ownerWithdrawalOutflow.card),
        total: rupees(netCashMovementPaise)
      }
    });
  } catch (e) {
    fail(res, e);
  }
});

// -------------------------------------------------------------------------
// 10. DAY BOOK REPORT
// -------------------------------------------------------------------------
reportsRouter.get('/reports/day-book', async (req, res) => {
  try {
    const db = firebase().db;
    const { start, end } = range(req.query.from, req.query.to);

    const [orders, returns, ledger, expenses, supplierPayments, supplierRefunds] = await Promise.all([
      db.collection('orders').where('createdAt', '>=', start).where('createdAt', '<', end).get(),
      db.collection('erp_returns').where('createdAt', '>=', start).where('createdAt', '<', end).get(),
      db.collection('erp_customerLedger').where('createdAt', '>=', start).where('createdAt', '<', end).get(),
      db.collection('erp_expenses').where('createdAt', '>=', start).where('createdAt', '<', end).get(),
      db.collection('erp_supplierPayments').where('createdAt', '>=', start).where('createdAt', '<', end).get(),
      db.collection('erp_supplierRefunds').where('createdAt', '>=', start).where('createdAt', '<', end).get()
    ]);

    const events: any[] = [];

    for (const d of orders.docs) {
      const o = d.data();
      events.push({
        id: d.id,
        timestamp: o.createdAt?.toDate ? o.createdAt.toDate().toISOString() : null,
        type: 'Sale',
        reference: o.invoiceNumber || d.id,
        party: o.customerName || 'Walk-in',
        paymentMethod: o.paymentMethod || 'cash',
        amount: rupees(paise(o.totalAmount || 0)),
        direction: 'inflow'
      });
    }

    for (const d of returns.docs) {
      const r = d.data();
      events.push({
        id: d.id,
        timestamp: r.createdAt?.toDate ? r.createdAt.toDate().toISOString() : null,
        type: 'Customer Return',
        reference: r.creditNoteId || d.id,
        party: r.orderId,
        paymentMethod: 'credit_note',
        amount: rupees(paise(r.total || 0)),
        direction: 'adjustment'
      });
    }

    for (const d of ledger.docs) {
      const l = d.data();
      if (l.kind === 'payment') {
        events.push({
          id: d.id,
          timestamp: l.createdAt?.toDate ? l.createdAt.toDate().toISOString() : null,
          type: 'Udhar Repayment',
          reference: l.note || d.id,
          party: l.customerName || l.phone || 'Customer',
          paymentMethod: l.paymentMethod || 'cash',
          amount: rupees(-paise(l.creditDelta || 0)),
          direction: 'inflow'
        });
      }
    }

    for (const d of expenses.docs) {
      const e = d.data();
      events.push({
        id: d.id,
        timestamp: e.createdAt?.toDate ? e.createdAt.toDate().toISOString() : null,
        type: e.category === 'withdrawal' ? 'Owner Withdrawal' : 'Expense',
        reference: e.note || d.id,
        party: 'Shop Operating',
        paymentMethod: e.method || 'cash',
        amount: rupees(paise(e.amount || 0)),
        direction: 'outflow'
      });
    }

    for (const d of supplierPayments.docs) {
      const p = d.data();
      events.push({
        id: d.id,
        timestamp: p.createdAt?.toDate ? p.createdAt.toDate().toISOString() : null,
        type: 'Supplier Payment',
        reference: p.note || d.id,
        party: p.supplierName || p.supplierId || 'Supplier',
        paymentMethod: p.method || 'cash',
        amount: rupees(paise(p.amount || 0)),
        direction: 'outflow'
      });
    }

    for (const d of supplierRefunds.docs) {
      const r = d.data();
      events.push({
        id: d.id,
        timestamp: r.createdAt?.toDate ? r.createdAt.toDate().toISOString() : null,
        type: 'Supplier Refund',
        reference: r.reference || d.id,
        party: r.supplierId || 'Supplier',
        paymentMethod: r.method || 'cash',
        amount: rupees(paise(r.amount || 0)),
        direction: 'inflow'
      });
    }

    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json({
      events,
      totalCount: events.length
    });
  } catch (e) {
    fail(res, e);
  }
});
