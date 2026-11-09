import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Eye, CheckCircle2, ArrowRightLeft, DollarSign } from 'lucide-react';
import { readAdmin, writeAdmin } from '../../adminApi';
import { ReportHeader } from '../shared/ReportHeader';
import { ReportFilters, type FilterState, computeDatePreset } from '../shared/ReportFilters';
import { SummaryCards, type MetricCardItem } from '../shared/SummaryCards';
import { DataTable, type ColumnDef } from '../shared/DataTable';
import { downloadCsv, formatINR, formatDateINR } from '../shared/exportUtils';

export function SupplierReturnsReport() {
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
  const [success, setSuccess] = useState('');
  const [data, setData] = useState<{ summary: any; items: any[] }>({
    summary: {
      totalReturnValue: 0,
      payablesReduced: 0,
      supplierCreditsCreated: 0,
      supplierRefundsRecorded: 0,
      currentAvailableCreditBalance: 0,
      count: 0
    },
    items: []
  });
  const [lastUpdated, setLastUpdated] = useState('');

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState<any | null>(null);
  const [applyCreditModal, setApplyCreditModal] = useState<{ supplierId: string; supplierName: string } | null>(null);
  const [recordRefundModal, setRecordRefundModal] = useState<{ supplierId: string; supplierName: string } | null>(null);

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

      const res = await readAdmin<{ summary: any; items: any[] }>(`purchases/returns?${q.toString()}`);
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
      'Return #',
      'Supplier',
      'Supplier Invoice',
      'Purchase Ref',
      'Returned Qty',
      'Return Value (₹)',
      'Payable Reduced (₹)',
      'Credit Created (₹)',
      'Credit Applied (₹)',
      'Staff'
    ];
    const rows = data.items.map(row => [
      formatDateINR(row.date),
      row.returnNumber,
      row.supplierName,
      row.supplierInvoice,
      row.purchaseId,
      row.returnedQuantity,
      row.totalReturnValue,
      row.payableReduction,
      row.excessCredit,
      row.creditApplied,
      row.staff
    ]);
    downloadCsv(`Supplier_Returns_${filters.fromDate}_to_${filters.toDate}`, headers, rows);
  };

  const summaryCards: MetricCardItem[] = useMemo(() => [
    {
      label: 'Total Return Value',
      value: data.summary.totalReturnValue,
      subtext: 'Goods returned to suppliers'
    },
    {
      label: 'Payables Reduced',
      value: data.summary.payablesReduced,
      subtext: 'Supplier invoice dues cleared',
      variant: 'positive'
    },
    {
      label: 'Supplier Credits Created',
      value: data.summary.supplierCreditsCreated,
      subtext: 'Excess credit stored on account',
      variant: 'info'
    },
    {
      label: 'Supplier Refunds Received',
      value: data.summary.supplierRefundsRecorded,
      subtext: 'Cash / Bank refunds collected',
      variant: 'positive'
    },
    {
      label: 'Available Credit Balance',
      value: data.summary.currentAvailableCreditBalance,
      subtext: 'Total store credits with vendors',
      variant: data.summary.currentAvailableCreditBalance > 0 ? 'info' : 'default'
    }
  ], [data.summary]);

  const columns: ColumnDef<any>[] = useMemo(() => [
    {
      key: 'date',
      header: 'Return Date',
      sortable: true,
      render: r => <div>{formatDateINR(r.date)}</div>
    },
    {
      key: 'returnNumber',
      header: 'Return #',
      sortable: true,
      render: r => <strong>{r.returnNumber}</strong>
    },
    {
      key: 'supplierName',
      header: 'Supplier',
      sortable: true,
      render: r => <div><strong>{r.supplierName}</strong><div style={{ fontSize: 11, color: '#788398' }}>Inv: {r.supplierInvoice}</div></div>
    },
    {
      key: 'purchaseId',
      header: 'Purchase Ref',
      render: r => <span>{r.purchaseId}</span>
    },
    {
      key: 'returnedQuantity',
      header: 'Qty',
      align: 'center',
      sortable: true,
      render: r => <span>{r.returnedQuantity} units</span>
    },
    {
      key: 'totalReturnValue',
      header: 'Return Value (₹)',
      align: 'right',
      sortable: true,
      render: r => <strong>{formatINR(r.totalReturnValue)}</strong>
    },
    {
      key: 'payableReduction',
      header: 'Payable Reduced (₹)',
      align: 'right',
      render: r => r.payableReduction > 0 ? <span style={{ color: '#16A34A' }}>{formatINR(r.payableReduction)}</span> : '—'
    },
    {
      key: 'excessCredit',
      header: 'Credit Created (₹)',
      align: 'right',
      render: r => r.excessCredit > 0 ? <span style={{ color: '#2563EB', fontWeight: 600 }}>{formatINR(r.excessCredit)}</span> : '—'
    },
    {
      key: 'staff',
      header: 'Staff',
      render: r => <span style={{ color: '#788398' }}>{r.staff}</span>
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'center',
      render: r => (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
          <button
            type="button"
            className="report-btn secondary"
            style={{ padding: '4px 8px', fontSize: 12 }}
            onClick={() => setSelectedReturn(r)}
            title="View return details"
          >
            <Eye size={13} />
          </button>
          {r.excessCredit > 0 && (
            <>
              <button
                type="button"
                className="report-btn secondary"
                style={{ padding: '4px 8px', fontSize: 12, color: '#2563EB' }}
                onClick={() => setApplyCreditModal({ supplierId: r.supplierId, supplierName: r.supplierName })}
                title="Apply available credit to another unpaid purchase"
              >
                <ArrowRightLeft size={13} /> Apply Credit
              </button>
              <button
                type="button"
                className="report-btn secondary"
                style={{ padding: '4px 8px', fontSize: 12, color: '#16A34A' }}
                onClick={() => setRecordRefundModal({ supplierId: r.supplierId, supplierName: r.supplierName })}
                title="Record refund received from supplier"
              >
                <DollarSign size={13} /> Record Refund
              </button>
            </>
          )}
        </div>
      )
    }
  ], []);

  return (
    <>
      <ReportHeader
        title="Supplier Purchase Returns"
        description="Process stock returns to suppliers, reduce outstanding invoice payables, and manage vendor credit notes."
        lastUpdated={lastUpdated}
        loading={loading}
        onRefresh={loadData}
        onExportCsv={handleExportCsv}
        actionButton={
          <button
            type="button"
            className="report-btn primary"
            onClick={() => setCreateModalOpen(true)}
          >
            <Plus size={16} /> Create Purchase Return
          </button>
        }
      />

      <ReportFilters
        filters={filters}
        onChange={setFilters}
        showSupplier={true}
        suppliers={suppliers}
        showSearch={true}
        searchPlaceholder="Search return #, supplier name, invoice #, purchase ref..."
      />

      {error && <div className="error-banner" style={{ margin: '0 0 16px' }}>{error}</div>}
      {success && <div className="success-banner" style={{ margin: '0 0 16px' }}>{success}</div>}

      <SummaryCards cards={summaryCards} />

      <DataTable
        columns={columns}
        data={data.items}
        loading={loading}
        emptyMessage="No supplier purchase returns recorded in the selected period."
      />

      {/* CREATE PURCHASE RETURN MODAL */}
      {createModalOpen && (
        <CreatePurchaseReturnModal
          onClose={() => setCreateModalOpen(false)}
          onSuccess={() => {
            setCreateModalOpen(false);
            setSuccess('Purchase return confirmed. Stock deducted and supplier dues updated.');
            loadData();
          }}
        />
      )}

      {/* VIEW RETURN DETAILS MODAL */}
      {selectedReturn && (
        <div className="report-modal-backdrop" onClick={() => setSelectedReturn(null)}>
          <div className="report-modal-content" onClick={e => e.stopPropagation()}>
            <div className="report-modal-header">
              <h2>Purchase Return: {selectedReturn.returnNumber}</h2>
              <button
                type="button"
                className="filter-clear-btn"
                style={{ fontSize: 22 }}
                onClick={() => setSelectedReturn(null)}
              >
                ×
              </button>
            </div>
            <div className="report-modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
                <div><strong>Supplier:</strong> {selectedReturn.supplierName}</div>
                <div><strong>Supplier Invoice:</strong> {selectedReturn.supplierInvoice}</div>
                <div><strong>Purchase Ref:</strong> {selectedReturn.purchaseId}</div>
                <div><strong>Date:</strong> {formatDateINR(selectedReturn.date)}</div>
                <div><strong>Total Return Value:</strong> {formatINR(selectedReturn.totalReturnValue)}</div>
                <div><strong>Payable Reduced:</strong> {formatINR(selectedReturn.payableReduction)}</div>
                <div><strong>Excess Credit:</strong> {formatINR(selectedReturn.excessCredit)}</div>
                <div><strong>Credit Note Ref:</strong> {selectedReturn.supplierCreditNoteRef || '—'}</div>
              </div>

              <h3 style={{ margin: '14px 0 6px', fontSize: 14 }}>Returned Items</h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #DDE4ED', textAlign: 'left' }}>
                    <th style={{ padding: '8px 10px' }}>Item</th>
                    <th style={{ padding: '8px 10px' }}>SKU</th>
                    <th style={{ padding: '8px 10px' }}>Qty</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Unit Cost</th>
                    <th style={{ padding: '8px 10px', textAlign: 'right' }}>Total Value</th>
                    <th style={{ padding: '8px 10px' }}>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {(selectedReturn.lines || []).map((line: any, i: number) => (
                    <tr key={i} style={{ borderBottom: '1px solid #EDF2F7' }}>
                      <td style={{ padding: '8px 10px' }}><strong>{line.name || line.sku}</strong></td>
                      <td style={{ padding: '8px 10px' }}>{line.sku}</td>
                      <td style={{ padding: '8px 10px' }}>{line.quantity} units</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}>{formatINR(line.unitCost)}</td>
                      <td style={{ padding: '8px 10px', textAlign: 'right' }}><strong>{formatINR(line.returnValue)}</strong></td>
                      <td style={{ padding: '8px 10px' }}><span className="badge badge-amber">{line.reason}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="report-modal-footer">
              <button
                type="button"
                className="report-btn secondary"
                onClick={() => setSelectedReturn(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* APPLY CREDIT MODAL */}
      {applyCreditModal && (
        <ApplyCreditDialog
          supplierId={applyCreditModal.supplierId}
          supplierName={applyCreditModal.supplierName}
          onClose={() => setApplyCreditModal(null)}
          onSuccess={() => {
            setApplyCreditModal(null);
            setSuccess('Supplier credit successfully applied to target purchase.');
            loadData();
          }}
        />
      )}

      {/* RECORD REFUND MODAL */}
      {recordRefundModal && (
        <RecordRefundDialog
          supplierId={recordRefundModal.supplierId}
          supplierName={recordRefundModal.supplierName}
          onClose={() => setRecordRefundModal(null)}
          onSuccess={() => {
            setRecordRefundModal(null);
            setSuccess('Supplier refund recorded successfully and added to cash flow.');
            loadData();
          }}
        />
      )}
    </>
  );
}

// -------------------------------------------------------------------------
// WORKFLOW COMPONENT: Create Purchase Return Modal
// -------------------------------------------------------------------------
function CreatePurchaseReturnModal({
  onClose,
  onSuccess
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [step, setStep] = useState<'select_purchase' | 'enter_lines' | 'confirm'>('select_purchase');
  const [purchases, setPurchases] = useState<any[]>([]);
  const [searchPurchase, setSearchPurchase] = useState('');
  const [loadingPurchases, setLoadingPurchases] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<any | null>(null);

  // Return lines input: { [lineIndex]: { quantity: number; reason: string; note: string } }
  const [returnInputs, setReturnInputs] = useState<Record<number, { quantity: number; reason: string; note: string }>>({});
  const [creditNoteRef, setCreditNoteRef] = useState('');
  const [generalNote, setGeneralNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoadingPurchases(true);
    readAdmin<{ items: any[] }>('purchases')
      .then(res => setPurchases(res.items || []))
      .catch(err => setError(err.message))
      .finally(() => setLoadingPurchases(false));
  }, []);

  const filteredPurchases = useMemo(() => {
    if (!searchPurchase.trim()) return purchases;
    const q = searchPurchase.toLowerCase();
    return purchases.filter(p =>
      `${p.supplierName} ${p.supplierInvoice} ${p.id}`.toLowerCase().includes(q)
    );
  }, [purchases, searchPurchase]);

  const handleSelectPurchase = (p: any) => {
    setSelectedPurchase(p);
    // Initialize return inputs
    const init: Record<number, { quantity: number; reason: string; note: string }> = {};
    (p.lines || []).forEach((_line: any, idx: number) => {
      init[idx] = { quantity: 0, reason: 'damaged', note: '' };
    });
    setReturnInputs(init);
    setStep('enter_lines');
  };

  // Compute live return values
  const preview = useMemo(() => {
    if (!selectedPurchase) return { totalValue: 0, payableReduction: 0, excessCredit: 0, lineCount: 0 };
    let total = 0;
    let count = 0;
    (selectedPurchase.lines || []).forEach((line: any, idx: number) => {
      const inp = returnInputs[idx];
      if (inp && inp.quantity > 0) {
        total += Number(line.unitCost || 0) * inp.quantity;
        count++;
      }
    });

    const payable = Number(selectedPurchase.payable || 0);
    const payableReduction = Math.min(total, payable);
    const excessCredit = Math.max(0, total - payableReduction);

    return { totalValue: total, payableReduction, excessCredit, lineCount: count };
  }, [selectedPurchase, returnInputs]);

  const handleSubmit = async () => {
    if (!selectedPurchase) return;
    setBusy(true);
    setError('');

    const linesToSubmit: any[] = [];
    (selectedPurchase.lines || []).forEach((line: any, idx: number) => {
      const inp = returnInputs[idx];
      if (inp && inp.quantity > 0) {
        linesToSubmit.push({
          lineIndex: idx,
          productId: line.productId,
          sku: line.sku,
          quantity: inp.quantity,
          reason: inp.reason,
          note: inp.note
        });
      }
    });

    if (linesToSubmit.length === 0) {
      setError('Please enter a return quantity greater than 0 for at least one item.');
      setBusy(false);
      return;
    }

    try {
      await writeAdmin('purchases/return', {
        requestId: `PR-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        purchaseId: selectedPurchase.id,
        supplierCreditNoteRef: creditNoteRef,
        generalNote,
        lines: linesToSubmit
      });
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="report-modal-backdrop" onClick={onClose}>
      <div className="report-modal-content" style={{ maxWidth: 880 }} onClick={e => e.stopPropagation()}>
        <div className="report-modal-header">
          <h2>
            Create Purchase Return
            {step === 'enter_lines' && selectedPurchase ? ` · ${selectedPurchase.supplierName}` : ''}
          </h2>
          <button type="button" className="filter-clear-btn" style={{ fontSize: 22 }} onClick={onClose}>
            ×
          </button>
        </div>

        <div className="report-modal-body">
          {error && <div className="error-banner">{error}</div>}

          {/* STEP 1: Select Original Purchase */}
          {step === 'select_purchase' && (
            <div>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: '#788398' }}>
                Search and select the original received purchase to return items from.
              </p>
              <input
                type="text"
                placeholder="Search by supplier name, invoice #, receipt ID..."
                value={searchPurchase}
                onChange={e => setSearchPurchase(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #DDE4ED', marginBottom: 12 }}
              />

              <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid #EDF2F7', borderRadius: 8 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #DDE4ED', textAlign: 'left' }}>
                      <th style={{ padding: '8px 12px' }}>Supplier</th>
                      <th style={{ padding: '8px 12px' }}>Invoice #</th>
                      <th style={{ padding: '8px 12px' }}>Date</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Total (₹)</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Payable (₹)</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loadingPurchases ? (
                      <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center' }}>Loading purchases…</td></tr>
                    ) : filteredPurchases.length === 0 ? (
                      <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center' }}>No matching purchases found.</td></tr>
                    ) : (
                      filteredPurchases.map(p => (
                        <tr key={p.id} style={{ borderBottom: '1px solid #EDF2F7' }}>
                          <td style={{ padding: '8px 12px' }}><strong>{p.supplierName}</strong></td>
                          <td style={{ padding: '8px 12px' }}>{p.supplierInvoice}</td>
                          <td style={{ padding: '8px 12px' }}>{formatDateINR(p.createdAt?.seconds ? new Date(p.createdAt.seconds * 1000).toISOString() : null)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right' }}>{formatINR(p.total)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'right', color: p.payable > 0 ? '#DC2626' : '#16A34A', fontWeight: 600 }}>{formatINR(p.payable)}</td>
                          <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                            <button
                              type="button"
                              className="report-btn primary"
                              style={{ padding: '3px 8px', fontSize: 12 }}
                              onClick={() => handleSelectPurchase(p)}
                            >
                              Select
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STEP 2: Enter Return Quantities & Reasons */}
          {step === 'enter_lines' && selectedPurchase && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, padding: 12, background: '#F8FAFC', borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
                <div><strong>Supplier:</strong> {selectedPurchase.supplierName}</div>
                <div><strong>Invoice #:</strong> {selectedPurchase.supplierInvoice}</div>
                <div><strong>Outstanding Dues:</strong> <span style={{ color: '#DC2626', fontWeight: 700 }}>{formatINR(selectedPurchase.payable)}</span></div>
              </div>

              <h4 style={{ margin: '0 0 8px', fontSize: 13, textTransform: 'uppercase', color: '#788398' }}>Items on Purchase</h4>
              <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid #EDF2F7', borderRadius: 8, marginBottom: 16 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #DDE4ED', textAlign: 'left' }}>
                      <th style={{ padding: '8px 10px' }}>Item / SKU</th>
                      <th style={{ padding: '8px 10px', textAlign: 'center' }}>Received</th>
                      <th style={{ padding: '8px 10px', textAlign: 'right' }}>Unit Cost</th>
                      <th style={{ padding: '8px 10px', width: 90 }}>Return Qty</th>
                      <th style={{ padding: '8px 10px' }}>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedPurchase.lines || []).map((line: any, idx: number) => {
                      const inp = returnInputs[idx] || { quantity: 0, reason: 'damaged', note: '' };
                      return (
                        <tr key={idx} style={{ borderBottom: '1px solid #EDF2F7' }}>
                          <td style={{ padding: '8px 10px' }}>
                            <strong>{line.name || line.sku}</strong>
                            <div style={{ fontSize: 11, color: '#788398' }}>{line.sku}</div>
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'center' }}>{line.quantity} units</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right' }}>{formatINR(line.unitCost)}</td>
                          <td style={{ padding: '8px 10px' }}>
                            <input
                              type="number"
                              min={0}
                              max={line.quantity}
                              value={inp.quantity}
                              onChange={e => {
                                const val = Math.min(Number(line.quantity), Math.max(0, Number(e.target.value)));
                                setReturnInputs(prev => ({
                                  ...prev,
                                  [idx]: { ...prev[idx], quantity: val }
                                }));
                              }}
                              style={{ width: '100%', padding: '4px 6px', borderRadius: 6, border: '1px solid #DDE4ED' }}
                            />
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <select
                              value={inp.reason}
                              onChange={e => {
                                const val = e.target.value;
                                setReturnInputs(prev => ({
                                  ...prev,
                                  [idx]: { ...prev[idx], reason: val }
                                }));
                              }}
                              style={{ width: '100%', padding: '4px 6px', borderRadius: 6, border: '1px solid #DDE4ED' }}
                            >
                              <option value="damaged">Damaged / Defect</option>
                              <option value="wrong_item">Wrong Item Sent</option>
                              <option value="excess_stock">Excess Stock</option>
                              <option value="quality_issue">Quality Issue</option>
                              <option value="other">Other</option>
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 4 }}>Supplier Credit Note Reference</label>
                  <input
                    type="text"
                    placeholder="e.g. VEND-CN-1049"
                    value={creditNoteRef}
                    onChange={e => setCreditNoteRef(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #DDE4ED' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12.5, fontWeight: 600, display: 'block', marginBottom: 4 }}>General Note / Remarks</label>
                  <input
                    type="text"
                    placeholder="Reason for return or transport details"
                    value={generalNote}
                    onChange={e => setGeneralNote(e.target.value)}
                    style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid #DDE4ED' }}
                  />
                </div>
              </div>

              {/* LIVE ACCOUNTING PREVIEW */}
              <div style={{ background: '#F8FAFC', border: '1px solid #DDE4ED', borderRadius: 8, padding: 14 }}>
                <h4 style={{ margin: '0 0 10px', fontSize: 13, textTransform: 'uppercase', color: '#151526' }}>
                  Accounting & Inventory Impact Preview
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, fontSize: 13 }}>
                  <div>
                    <span style={{ color: '#788398' }}>Total Return Value:</span>
                    <strong style={{ display: 'block', fontSize: 16 }}>{formatINR(preview.totalValue)}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#788398' }}>Payable Dues Reduced:</span>
                    <strong style={{ display: 'block', fontSize: 16, color: '#16A34A' }}>{formatINR(preview.payableReduction)}</strong>
                  </div>
                  <div>
                    <span style={{ color: '#788398' }}>Excess Supplier Credit:</span>
                    <strong style={{ display: 'block', fontSize: 16, color: '#2563EB' }}>{formatINR(preview.excessCredit)}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="report-modal-footer">
          {step === 'enter_lines' && (
            <button
              type="button"
              className="report-btn secondary"
              onClick={() => setStep('select_purchase')}
              disabled={busy}
            >
              Back
            </button>
          )}
          <button
            type="button"
            className="report-btn secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          {step === 'enter_lines' && (
            <button
              type="button"
              className="report-btn primary"
              onClick={handleSubmit}
              disabled={busy || preview.totalValue <= 0}
            >
              {busy ? 'Processing Return…' : 'Confirm Purchase Return'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// APPLY CREDIT DIALOG
// -------------------------------------------------------------------------
function ApplyCreditDialog({
  supplierId,
  supplierName,
  onClose,
  onSuccess
}: {
  supplierId: string;
  supplierName: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [purchases, setPurchases] = useState<any[]>([]);
  const [targetPurchaseId, setTargetPurchaseId] = useState('');
  const [amount, setAmount] = useState('');
  const [availableCredit, setAvailableCredit] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    readAdmin<{ items: any[] }>(`purchases?supplierId=${supplierId}`)
      .then(res => {
        const unpaid = (res.items || []).filter(p => Number(p.payable || 0) > 0);
        setPurchases(unpaid);
        if (unpaid.length > 0) setTargetPurchaseId(unpaid[0].id);
      });

    readAdmin<{ summary: any }>('purchases/returns')
      .then(res => {
        setAvailableCredit(res.summary?.currentAvailableCreditBalance || 0);
      });
  }, [supplierId]);

  const targetPurchase = purchases.find(p => p.id === targetPurchaseId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetPurchaseId || !Number(amount)) return;
    setBusy(true);
    setError('');
    try {
      await writeAdmin('purchases/return/apply-credit', {
        requestId: `APPLY-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        supplierId,
        targetPurchaseId,
        amount: Number(amount)
      });
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="report-modal-backdrop" onClick={onClose}>
      <div className="report-modal-content" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="report-modal-header">
            <h2>Apply Supplier Credit · {supplierName}</h2>
            <button type="button" className="filter-clear-btn" onClick={onClose}>×</button>
          </div>
          <div className="report-modal-body">
            {error && <div className="error-banner">{error}</div>}

            <p style={{ margin: 0, fontSize: 13, color: '#788398' }}>
              Apply credit earned from returns towards an outstanding unpaid invoice of this supplier.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Target Purchase / Invoice
                <select
                  value={targetPurchaseId}
                  onChange={e => setTargetPurchaseId(e.target.value)}
                  required
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #DDE4ED', marginTop: 4 }}
                >
                  {purchases.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.supplierInvoice || p.id} (Outstanding: {formatINR(p.payable)})
                    </option>
                  ))}
                  {purchases.length === 0 && <option value="">No unpaid purchases found</option>}
                </select>
              </label>

              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Amount to Apply (₹)
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={targetPurchase ? targetPurchase.payable : undefined}
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="Enter credit amount"
                  required
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #DDE4ED', marginTop: 4 }}
                />
              </label>
            </div>
          </div>
          <div className="report-modal-footer">
            <button type="button" className="report-btn secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="report-btn primary" disabled={busy || !targetPurchaseId || !Number(amount)}>
              {busy ? 'Applying…' : 'Apply Credit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// RECORD REFUND DIALOG
// -------------------------------------------------------------------------
function RecordRefundDialog({
  supplierId,
  supplierName,
  onClose,
  onSuccess
}: {
  supplierId: string;
  supplierName: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'upi' | 'card' | 'bank'>('cash');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!Number(amount) || !reference.trim()) return;
    setBusy(true);
    setError('');
    try {
      await writeAdmin('purchases/return/refund', {
        requestId: `REFUND-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        supplierId,
        amount: Number(amount),
        method,
        reference: reference.trim(),
        note: note.trim()
      });
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="report-modal-backdrop" onClick={onClose}>
      <div className="report-modal-content" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="report-modal-header">
            <h2>Record Supplier Refund · {supplierName}</h2>
            <button type="button" className="filter-clear-btn" onClick={onClose}>×</button>
          </div>
          <div className="report-modal-body">
            {error && <div className="error-banner">{error}</div>}

            <p style={{ margin: 0, fontSize: 13, color: '#788398' }}>
              Record a cash or bank refund received from the supplier. This decreases stored vendor credit and increases your cash/bank inflow.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Refund Amount (₹) *
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #DDE4ED', marginTop: 4 }}
                />
              </label>

              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Payment Method *
                <select
                  value={method}
                  onChange={e => setMethod(e.target.value as any)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #DDE4ED', marginTop: 4 }}
                >
                  <option value="cash">Cash Received</option>
                  <option value="upi">UPI / QR Transfer</option>
                  <option value="bank">Direct Bank IMPS/NEFT</option>
                  <option value="card">Card Refund</option>
                </select>
              </label>

              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Reference / Transaction ID *
                <input
                  type="text"
                  value={reference}
                  onChange={e => setReference(e.target.value)}
                  placeholder="e.g. UTR / Receipt / Note #"
                  required
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #DDE4ED', marginTop: 4 }}
                />
              </label>

              <label style={{ fontSize: 13, fontWeight: 600 }}>
                Note
                <input
                  type="text"
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Optional remarks"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #DDE4ED', marginTop: 4 }}
                />
              </label>
            </div>
          </div>
          <div className="report-modal-footer">
            <button type="button" className="report-btn secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="report-btn primary" disabled={busy || !Number(amount) || !reference.trim()}>
              {busy ? 'Recording…' : 'Record Refund'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

