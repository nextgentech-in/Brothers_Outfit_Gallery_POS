import { useState, useRef, useEffect, useMemo } from 'react';
import { Plus, Trash2, Search, ArrowRight, Share2, Printer, Check, RefreshCw, AlertCircle, ShoppingBag, Calendar, Clock, MapPin, Phone, User, Banknote, QrCode, CreditCard } from 'lucide-react';
import { mobileNumber, shopDate } from '../shared/customers';
import { validDueDate, dueDateAfter } from '../shared/credit';
import type { QueuedSale } from './offlineQueue';

export type ProductVariant = {
  sku: string;
  barcode?: string;
  size?: string;
  color?: string;
  stock: number;
  price: number;
};

export type ProductItem = {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  price: number;
  mrp: number;
  stock: number;
  category?: string;
  variants: ProductVariant[];
};

export type CustomerItem = {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  dateOfBirth?: string;
  address?: string;
  birthdayOffersOptIn?: boolean;
};

export type BillRow = {
  id: string;
  productId: string;
  sku: string;
  name: string;
  variantDetail?: string;
  stock: number;
  quantity: number;
  price: number;
  discount: number;
  taxPercent: number;
  taxAmount: number;
  amount: number;
};

const createEmptyRow = (id: string = crypto.randomUUID()): BillRow => ({
  id,
  productId: '',
  sku: '',
  name: '',
  stock: 0,
  quantity: 1,
  price: 0,
  discount: 0,
  taxPercent: 0,
  taxAmount: 0,
  amount: 0
});

const TAX_OPTIONS = [
  { label: '0%', value: 0 },
  { label: '5%', value: 5 },
  { label: '12%', value: 12 },
  { label: '18%', value: 18 },
  { label: '28%', value: 28 }
];

export function VyaparBilling({
  products,
  customers = [],
  role,
  initialInvoiceNumber = 101,
  onSaveBill,
  heldBillsCount = 0,
  onResumeHeld,
  onParkBill,
  saving = false
}: {
  products: ProductItem[];
  customers?: CustomerItem[];
  role?: string;
  initialInvoiceNumber?: number;
  onSaveBill: (sale: QueuedSale, action: 'share' | 'new') => Promise<void>;
  heldBillsCount?: number;
  onResumeHeld?: () => void;
  onParkBill?: (sale: QueuedSale) => Promise<void>;
  saving?: boolean;
}) {
  // Customer info & Auto-lookup state
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerDateOfBirth, setCustomerDateOfBirth] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');

  // Invoice metadata
  const [invoiceNumber, setInvoiceNumber] = useState(initialInvoiceNumber);
  const [invoiceDate, setInvoiceDate] = useState(() => shopDate());
  const [currentTime] = useState(() =>
    new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  );
  const [stateOfSupply] = useState('Gujarat');

  // Payment mode options (down side of terms & conditions)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'card' | 'credit'>('cash');
  const [creditDueDate, setCreditDueDate] = useState(() => dueDateAfter(7));
  const [creditWhatsAppOptIn, setCreditWhatsAppOptIn] = useState(true);
  const [whatsappOptIn, setWhatsAppOptIn] = useState(false);
  const [cashTendered, setCashTendered] = useState('');
  const [terms] = useState('Goods once sold can be exchanged within 7 days with bill tag intact.');

  // Table rows
  const [rows, setRows] = useState<BillRow[]>([
    createEmptyRow('row-1'),
    createEmptyRow('row-2')
  ]);

  // Active search dropdown tracking: rowId
  const [activeSearchRowId, setActiveSearchRowId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Flat variants list for searching
  const searchableItems = useMemo(() => {
    const list: {
      productId: string;
      productName: string;
      sku: string;
      barcode?: string;
      variantText: string;
      stock: number;
      price: number;
      category?: string;
    }[] = [];

    for (const p of products) {
      if (p.variants && p.variants.length > 0) {
        for (const v of p.variants) {
          const detail = [v.size, v.color].filter(Boolean).join(' / ');
          list.push({
            productId: p.id,
            productName: p.name,
            sku: v.sku,
            barcode: v.barcode || p.barcode,
            variantText: detail ? ` (${detail})` : '',
            stock: v.stock ?? p.stock,
            price: v.price || p.price,
            category: p.category
          });
        }
      } else {
        list.push({
          productId: p.id,
          productName: p.name,
          sku: p.sku,
          barcode: p.barcode,
          variantText: '',
          stock: p.stock,
          price: p.price,
          category: p.category
        });
      }
    }
    return list;
  }, [products]);

  // Filtered search results
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return searchableItems.slice(0, 30);
    return searchableItems
      .filter(item =>
        `${item.productName} ${item.sku} ${item.barcode || ''} ${item.variantText} ${item.category || ''}`
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 30);
  }, [searchableItems, searchQuery]);

  // Filtered customer auto-suggest results
  const filteredCustomers = useMemo(() => {
    const q = customerSearchQuery.trim().toLowerCase();
    if (!q) return customers.slice(0, 15);
    return customers
      .filter(c =>
        (c.fullName && c.fullName.toLowerCase().includes(q)) ||
        (c.phone && c.phone.includes(q))
      )
      .slice(0, 15);
  }, [customers, customerSearchQuery]);

  function handleSelectCustomer(cust: CustomerItem) {
    setCustomerName(cust.fullName || '');
    const rawPhone = cust.phone ? cust.phone.replace(/\D/g, '') : '';
    const cleanPhone = rawPhone.length === 12 && rawPhone.startsWith('91') ? rawPhone.slice(2) : (cust.phone || '');
    setCustomerPhone(cleanPhone);
    setCustomerDateOfBirth(cust.dateOfBirth || '');
    setCustomerAddress(cust.address || '');
    setCustomerDropdownOpen(false);
  }

  function handleNameChange(nameVal: string) {
    setCustomerName(nameVal);
    setCustomerSearchQuery(nameVal);
    setCustomerDropdownOpen(true);
    // If name matches an existing customer, auto-fill all customer information
    const match = customers.find(c => c.fullName.trim().toLowerCase() === nameVal.trim().toLowerCase());
    if (match) {
      if (!customerPhone && match.phone) {
        const rawPhone = match.phone.replace(/\D/g, '');
        const cleanPhone = rawPhone.length === 12 && rawPhone.startsWith('91') ? rawPhone.slice(2) : match.phone;
        setCustomerPhone(cleanPhone);
      }
      if (!customerDateOfBirth && match.dateOfBirth) {
        setCustomerDateOfBirth(match.dateOfBirth);
      }
      if (!customerAddress && match.address) {
        setCustomerAddress(match.address);
      }
    }
  }

  function handlePhoneChange(phoneVal: string) {
    setCustomerPhone(phoneVal);
    const digits = phoneVal.replace(/\D/g, '');
    if (digits.length === 10) {
      const match = customers.find(c => {
        const cDigits = (c.phone || '').replace(/\D/g, '');
        return cDigits === digits || cDigits.endsWith(digits);
      });
      if (match) {
        if (!customerName || customerName.trim() === '') {
          setCustomerName(match.fullName || '');
        }
        if (!customerDateOfBirth && match.dateOfBirth) {
          setCustomerDateOfBirth(match.dateOfBirth);
        }
        if (!customerAddress && match.address) {
          setCustomerAddress(match.address);
        }
      }
    }
  }

  // Row update helpers
  function calculateRowAmount(qty: number, price: number, discount: number, taxPercent: number) {
    const base = Math.max(0, qty * price - discount);
    const taxAmt = Math.round((base * taxPercent) / 100 * 100) / 100;
    const finalAmt = Math.round((base + taxAmt) * 100) / 100;
    return { taxAmount: taxAmt, amount: finalAmt };
  }

  function updateRowField(id: string, field: keyof BillRow, value: any) {
    setRows(prev =>
      prev.map(r => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };
        if (['quantity', 'price', 'discount', 'taxPercent'].includes(field)) {
          const { taxAmount, amount } = calculateRowAmount(
            Number(updated.quantity || 0),
            Number(updated.price || 0),
            Number(updated.discount || 0),
            Number(updated.taxPercent || 0)
          );
          updated.taxAmount = taxAmount;
          updated.amount = amount;
        }
        return updated;
      })
    );
  }

  function handleSelectItem(rowId: string, item: typeof searchableItems[0]) {
    setRows(prev =>
      prev.map(r => {
        if (r.id !== rowId) return r;
        const fullName = `${item.productName}${item.variantText}`;
        const { taxAmount, amount } = calculateRowAmount(
          r.quantity || 1,
          item.price,
          r.discount || 0,
          r.taxPercent || 0
        );
        return {
          ...r,
          productId: item.productId,
          sku: item.sku,
          name: fullName,
          variantDetail: item.variantText,
          stock: item.stock,
          price: item.price,
          taxAmount,
          amount
        };
      })
    );
    setActiveSearchRowId(null);
    setSearchQuery('');
  }

  function addRow() {
    setRows(prev => [...prev, createEmptyRow()]);
  }

  function removeRow(id: string) {
    if (rows.length === 1) {
      setRows([createEmptyRow()]);
      return;
    }
    setRows(prev => prev.filter(r => r.id !== id));
  }

  // Totals calculations
  const totals = useMemo(() => {
    let totalQty = 0;
    let totalGross = 0;
    let totalDiscount = 0;
    let totalTax = 0;
    let totalAmount = 0;

    for (const r of rows) {
      if (r.productId || r.name.trim()) {
        const qty = Number(r.quantity || 0);
        const price = Number(r.price || 0);
        const disc = Number(r.discount || 0);
        const tax = Number(r.taxAmount || 0);
        const amt = Number(r.amount || 0);

        totalQty += qty;
        totalGross += qty * price;
        totalDiscount += disc;
        totalTax += tax;
        totalAmount += amt;
      }
    }

    return {
      totalQty,
      totalGross: Math.round(totalGross * 100) / 100,
      totalDiscount: Math.round(totalDiscount * 100) / 100,
      totalTax: Math.round(totalTax * 100) / 100,
      totalAmount: Math.round(totalAmount * 100) / 100
    };
  }, [rows]);

  // Validation & Submit
  async function handleSubmit(action: 'share' | 'new') {
    setError('');
    setSuccess('');

    const validLines = rows.filter(r => (r.productId || r.name.trim()) && r.quantity > 0);
    if (!validLines.length) {
      setError('Please add at least one item with quantity greater than zero.');
      return;
    }

    if (paymentMethod === 'credit') {
      if (!customerName.trim()) {
        setError('Billing Name is required for Credit / Udhar.');
        return;
      }
      if (!customerPhone.trim() || !mobileNumber(customerPhone)) {
        setError('A valid 10-digit Phone No. is required for Credit / Udhar.');
        return;
      }
      if (!validDueDate(creditDueDate) || creditDueDate < shopDate()) {
        setError('Please select a repayment due date today or in the future.');
        return;
      }
    }

    const payload: QueuedSale = {
      expectedTotal: totals.totalAmount,
      requestId: crypto.randomUUID(),
      lines: validLines.map(line => ({
        productId: line.productId || products[0]?.id || 'pos-custom-item',
        sku: line.sku || line.name,
        name: line.name,
        quantity: Number(line.quantity),
        price: Number(line.price),
        discount: Number(line.discount || 0),
        tax: Number(line.taxAmount || 0),
        taxPercent: Number(line.taxPercent || 0)
      })),
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      customerDateOfBirth: customerDateOfBirth || undefined,
      customerAddress: customerAddress.trim() || undefined,
      creditDueDate: paymentMethod === 'credit' ? creditDueDate : undefined,
      creditWhatsAppOptIn: paymentMethod === 'credit' ? creditWhatsAppOptIn : undefined,
      whatsappOptIn: Boolean(customerPhone.trim()) && (whatsappOptIn || creditWhatsAppOptIn),
      discount: totals.totalDiscount,
      tax: totals.totalTax,
      paymentMethod,
      cashTendered: cashTendered ? Number(cashTendered) : undefined,
      queuedAt: new Date().toISOString(),
      state: 'pending'
    };

    try {
      await onSaveBill(payload, action);
      if (action === 'new') {
        setSuccess(`Invoice #${invoiceNumber} saved successfully! New bill ready.`);
        setRows([createEmptyRow('new-1'), createEmptyRow('new-2')]);
        setCustomerName('');
        setCustomerPhone('');
        setCustomerDateOfBirth('');
        setCustomerAddress('');
        setCashTendered('');
        setInvoiceNumber(n => n + 1);
      }
    } catch (err) {
      setError((err as Error).message || 'Failed to record bill.');
    }
  }

  // Handle outside click to close product item search dropdown and customer dropdown
  const dropdownRef = useRef<HTMLDivElement>(null);
  const customerBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setActiveSearchRowId(null);
      }
      if (customerBoxRef.current && !customerBoxRef.current.contains(e.target as Node)) {
        setCustomerDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="vyapar-billing-container glass">
      {/* Top Notification / Alerts */}
      {error && (
        <div className="error-banner" role="alert" style={{ marginBottom: 16 }}>
          <span>{error}</span>
          <button type="button" onClick={() => setError('')}>Dismiss</button>
        </div>
      )}
      {success && (
        <div className="success-banner" role="status" style={{ marginBottom: 16 }}>
          <Check size={18} />
          <span>{success}</span>
          <button type="button" onClick={() => setSuccess('')}>Dismiss</button>
        </div>
      )}

      {/* TOP METADATA BAR (Matching Vyapar Screenshot) */}
      <div className="vyapar-top-section">
        {/* Left: Customer Info (with Date of Birth, Auto-lookup on name/phone) */}
        <div className="vyapar-customer-box" ref={customerBoxRef}>
          {/* Billing Name with existing customer autocomplete dropdown */}
          <div className="vyapar-input-group" style={{ position: 'relative' }}>
            <label className="vyapar-label">
              <User size={13} style={{ display: 'inline', marginRight: 4 }} />
              Billing Name (Optional)
            </label>
            <input
              type="text"
              className="vyapar-field"
              placeholder="Search or enter customer name"
              value={customerName}
              onFocus={() => setCustomerDropdownOpen(true)}
              onChange={e => handleNameChange(e.target.value)}
            />

            {/* AUTOCOMPLETE POPUP FOR EXISTING CUSTOMERS */}
            {customerDropdownOpen && filteredCustomers.length > 0 && (
              <div className="vyapar-customer-dropdown glass">
                <div className="vyapar-dropdown-header">
                  <User size={12} />
                  <span>Existing Customers ({filteredCustomers.length}):</span>
                </div>
                <div className="vyapar-dropdown-list">
                  {filteredCustomers.map(cust => (
                    <div
                      key={cust.id}
                      className="vyapar-customer-dropdown-item"
                      onMouseDown={() => handleSelectCustomer(cust)}
                    >
                      <div className="vyapar-cust-main">
                        <strong>{cust.fullName}</strong>
                        {cust.phone && (
                          <small>
                            <Phone size={11} style={{ display: 'inline', marginRight: 3 }} />
                            {cust.phone}
                          </small>
                        )}
                      </div>
                      <div className="vyapar-cust-meta">
                        {cust.dateOfBirth && (
                          <span className="vyapar-dob-pill">DOB: {cust.dateOfBirth}</span>
                        )}
                        {cust.address && (
                          <small className="vyapar-addr-text">{cust.address}</small>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Phone Number with auto-match on 10 digits */}
          <div className="vyapar-input-group">
            <label className="vyapar-label">
              <Phone size={13} style={{ display: 'inline', marginRight: 4 }} />
              Phone No.
            </label>
            <input
              type="tel"
              className="vyapar-field"
              placeholder="10-digit Mobile number"
              value={customerPhone}
              onChange={e => handlePhoneChange(e.target.value)}
            />
          </div>

          {/* Date of Birth field */}
          <div className="vyapar-input-group">
            <label className="vyapar-label">
              <Calendar size={13} style={{ display: 'inline', marginRight: 4 }} />
              Date of Birth
            </label>
            <input
              type="date"
              className="vyapar-field"
              value={customerDateOfBirth}
              max={shopDate()}
              onChange={e => setCustomerDateOfBirth(e.target.value)}
            />
          </div>

          {/* Billing Address spanning full width */}
          <div className="vyapar-input-group full-width">
            <label className="vyapar-label">
              <MapPin size={13} style={{ display: 'inline', marginRight: 4 }} />
              Billing Address
            </label>
            <textarea
              className="vyapar-field vyapar-textarea"
              rows={2}
              placeholder="City, State, Pincode"
              value={customerAddress}
              onChange={e => setCustomerAddress(e.target.value)}
            />
          </div>
        </div>

        {/* Right: Invoice Metadata */}
        <div className="vyapar-invoice-meta-box">
          <div className="vyapar-meta-row">
            <span className="vyapar-meta-title">Invoice Number:</span>
            <input
              type="text"
              className="vyapar-meta-value"
              value={invoiceNumber}
              onChange={e => setInvoiceNumber(Number(e.target.value) || invoiceNumber)}
            />
          </div>

          <div className="vyapar-meta-row">
            <span className="vyapar-meta-title">Invoice Date:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="date"
                className="vyapar-meta-value"
                value={invoiceDate}
                onChange={e => setInvoiceDate(e.target.value)}
              />
              <Calendar size={15} style={{ color: 'var(--accent)' }} />
            </div>
          </div>

          <div className="vyapar-meta-row">
            <span className="vyapar-meta-title">Time:</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className="vyapar-meta-static">{currentTime}</span>
              <Clock size={15} style={{ color: 'var(--muted)' }} />
            </div>
          </div>

          <div className="vyapar-meta-row">
            <span className="vyapar-meta-title">State of supply:</span>
            <span className="vyapar-meta-static">{stateOfSupply}</span>
          </div>
        </div>
      </div>

      {/* ITEMS TABLE SECTION (Exact Columns requested: item, quentity, price/piece, discount, tax, amount) */}
      <div className="vyapar-table-wrapper" ref={dropdownRef}>
        <table className="vyapar-items-table">
          <thead>
            <tr>
              <th style={{ width: 42, textAlign: 'center' }}>#</th>
              <th style={{ minWidth: 260 }}>ITEM</th>
              <th style={{ width: 85, textAlign: 'center' }}>QTY</th>
              <th style={{ width: 110, textAlign: 'right' }}>PRICE/PIECE</th>
              <th style={{ width: 100, textAlign: 'right' }}>DISCOUNT (₹)</th>
              <th style={{ width: 110, textAlign: 'right' }}>TAX</th>
              <th style={{ width: 120, textAlign: 'right' }}>AMOUNT (₹)</th>
              <th style={{ width: 40, textAlign: 'center' }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id}>
                {/* # Serial */}
                <td style={{ textAlign: 'center', color: 'var(--muted)', fontWeight: 600 }}>
                  {index + 1}
                </td>

                {/* ITEM Search input with live stock dropdown like Vyapar */}
                <td style={{ position: 'relative' }}>
                  <div className="vyapar-item-input-container">
                    <input
                      type="text"
                      className="vyapar-cell-input item-name-input"
                      placeholder="Type or click to search items & stock..."
                      value={row.name}
                      onFocus={() => {
                        setActiveSearchRowId(row.id);
                        setSearchQuery(row.name);
                      }}
                      onChange={e => {
                        updateRowField(row.id, 'name', e.target.value);
                        setSearchQuery(e.target.value);
                        setActiveSearchRowId(row.id);
                      }}
                    />
                    {row.stock > 0 && (
                      <span className="vyapar-stock-badge available">
                        Stock: {row.stock}
                      </span>
                    )}
                    {row.productId && row.stock <= 0 && (
                      <span className="vyapar-stock-badge unavailable">
                        Out of stock
                      </span>
                    )}
                  </div>

                  {/* AUTOCOMPLETE POPUP DROPDOWN WITH STOCK */}
                  {activeSearchRowId === row.id && (
                    <div className="vyapar-search-dropdown glass">
                      <div className="vyapar-dropdown-header">
                        <Search size={14} />
                        <span>Select product (showing stock & rates):</span>
                      </div>
                      <div className="vyapar-dropdown-list">
                        {searchResults.map(item => (
                          <div
                            key={`${item.productId}-${item.sku}`}
                            className="vyapar-dropdown-item"
                            onMouseDown={() => handleSelectItem(row.id, item)}
                          >
                            <div className="vyapar-dropdown-item-title">
                              <strong>{item.productName}</strong>
                              <span className="variant-tag">{item.variantText || 'Standard'}</span>
                              <small>SKU: {item.sku}</small>
                            </div>
                            <div className="vyapar-dropdown-item-meta">
                              <span className={`stock-pill ${item.stock > 0 ? 'in-stock' : 'no-stock'}`}>
                                {item.stock > 0 ? `${item.stock} in stock` : '0 Out of stock'}
                              </span>
                              <strong className="rate-pill">₹{item.price}</strong>
                            </div>
                          </div>
                        ))}
                        {searchResults.length === 0 && (
                          <div className="vyapar-dropdown-empty">
                            No matching items found. Type custom name or adjust search.
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </td>

                {/* QUANTITY */}
                <td>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    className="vyapar-cell-input text-center"
                    value={row.quantity}
                    onChange={e => updateRowField(row.id, 'quantity', Math.max(1, Number(e.target.value)))}
                  />
                </td>

                {/* PRICE/PIECE (Editable) */}
                <td>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="vyapar-cell-input text-right"
                    value={row.price || ''}
                    placeholder="0.00"
                    onChange={e => updateRowField(row.id, 'price', Number(e.target.value))}
                  />
                </td>

                {/* DISCOUNT (Editable) */}
                <td>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="vyapar-cell-input text-right"
                    value={row.discount || ''}
                    placeholder="0"
                    onChange={e => updateRowField(row.id, 'discount', Number(e.target.value))}
                  />
                </td>

                {/* TAX (Editable) */}
                <td>
                  <select
                    className="vyapar-cell-input text-right"
                    value={row.taxPercent}
                    onChange={e => updateRowField(row.id, 'taxPercent', Number(e.target.value))}
                  >
                    {TAX_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </td>

                {/* AMOUNT (Calculated & Editable) */}
                <td>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="vyapar-cell-input text-right font-bold"
                    value={row.amount || ''}
                    onChange={e => updateRowField(row.id, 'amount', Number(e.target.value))}
                  />
                </td>

                {/* Action: Delete Row */}
                <td style={{ textAlign: 'center' }}>
                  <button
                    type="button"
                    className="vyapar-row-delete"
                    onClick={() => removeRow(row.id)}
                    title="Delete item row"
                  >
                    <Trash2 size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>

          {/* TOTAL SUMMARY ROW */}
          <tfoot>
            <tr className="vyapar-totals-row">
              <td colSpan={2} style={{ textAlign: 'left', paddingLeft: 16 }}>
                <strong>TOTAL</strong>
              </td>
              <td style={{ textAlign: 'center', fontWeight: 700 }}>{totals.totalQty}</td>
              <td style={{ textAlign: 'right', color: 'var(--muted)' }}>—</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>₹{totals.totalDiscount}</td>
              <td style={{ textAlign: 'right', fontWeight: 700 }}>₹{totals.totalTax}</td>
              <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--accent)', fontSize: 16 }}>
                ₹{totals.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>

        {/* ADD ROW BUTTON (Matching image on bottom-left) */}
        <div style={{ marginTop: 12 }}>
          <button type="button" className="button secondary vyapar-add-row-btn" onClick={addRow}>
            <Plus size={16} /> ADD ROW
          </button>
        </div>
      </div>

      {/* BOTTOM SECTION: NOTES, PAYMENT MODE, GRAND TOTAL & ACTION BUTTONS */}
      <div className="vyapar-bottom-section">
        {/* Left Side: Terms, Payment Mode down side of Terms, Resume Held */}
        <div className="vyapar-bottom-left">
          {/* Terms & Conditions */}
          <div className="vyapar-notes-box">
            <span className="vyapar-subhead">Terms & Conditions</span>
            <p className="vyapar-terms-text">{terms}</p>
          </div>

          {/* Payment Mode Option Down Side of Terms & Conditions */}
          <div className="vyapar-payment-panel">
            <div className="vyapar-payment-header">
              <span className="vyapar-subhead">Payment Mode</span>
              <span className="vyapar-payment-selected-tag">
                Selected: <strong>{paymentMethod === 'credit' ? 'Credit / Udhar' : paymentMethod.toUpperCase()}</strong>
              </span>
            </div>

            <div className="vyapar-payment-modes-grid">
              <button
                type="button"
                className={`vyapar-mode-btn ${paymentMethod === 'cash' ? 'active' : ''}`}
                onClick={() => setPaymentMethod('cash')}
              >
                <Banknote size={16} />
                <span>Cash</span>
              </button>
              <button
                type="button"
                className={`vyapar-mode-btn ${paymentMethod === 'upi' ? 'active' : ''}`}
                onClick={() => setPaymentMethod('upi')}
              >
                <QrCode size={16} />
                <span>UPI / QR</span>
              </button>
              <button
                type="button"
                className={`vyapar-mode-btn ${paymentMethod === 'card' ? 'active' : ''}`}
                onClick={() => setPaymentMethod('card')}
              >
                <CreditCard size={16} />
                <span>Card / POS</span>
              </button>
              <button
                type="button"
                className={`vyapar-mode-btn ${paymentMethod === 'credit' ? 'active credit-mode' : ''}`}
                onClick={() => setPaymentMethod('credit')}
              >
                <Clock size={16} />
                <span>Credit / Udhar</span>
              </button>
            </div>

            {/* Context details for Cash */}
            {paymentMethod === 'cash' && (
              <div className="vyapar-mode-detail-box">
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>Cash Received ₹:</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="vyapar-field"
                    placeholder="Exact if blank"
                    value={cashTendered}
                    onChange={e => setCashTendered(e.target.value)}
                    style={{ maxWidth: 180 }}
                  />
                </div>
                {cashTendered && Number(cashTendered) > totals.totalAmount && (
                  <p style={{ margin: '8px 0 0', color: 'var(--accent)', fontWeight: 700, fontSize: 13 }}>
                    Return Change: ₹{(Number(cashTendered) - totals.totalAmount).toFixed(2)}
                  </p>
                )}
              </div>
            )}

            {/* Context details for Credit / Udhar */}
            {paymentMethod === 'credit' && (
              <div className="vyapar-mode-detail-box credit-box">
                <span className="vyapar-subhead" style={{ color: '#d9534f' }}>
                  Credit / Udhar Repayment Details
                </span>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8 }}>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>Due Date:</label>
                  <input
                    type="date"
                    className="vyapar-field"
                    value={creditDueDate}
                    min={shopDate()}
                    onChange={e => setCreditDueDate(e.target.value)}
                    style={{ maxWidth: 180 }}
                  />
                </div>
                <label className="check-row" style={{ marginTop: 8, fontSize: 12 }}>
                  <input
                    type="checkbox"
                    checked={creditWhatsAppOptIn}
                    onChange={e => setCreditWhatsAppOptIn(e.target.checked)}
                  />
                  Send bill & automatic due reminders on WhatsApp
                </label>
              </div>
            )}

            {/* Context details for UPI */}
            {paymentMethod === 'upi' && (
              <div className="vyapar-mode-detail-box">
                <small style={{ color: 'var(--muted)', display: 'block' }}>
                  ✓ Direct UPI / QR Code payment mode selected. Instant settlement.
                </small>
              </div>
            )}

            {/* Context details for Card */}
            {paymentMethod === 'card' && (
              <div className="vyapar-mode-detail-box">
                <small style={{ color: 'var(--muted)', display: 'block' }}>
                  ✓ Card swipe / tap POS terminal payment mode selected.
                </small>
              </div>
            )}
          </div>

          {heldBillsCount > 0 && onResumeHeld && (
            <button
              type="button"
              className="button secondary vyapar-resume-held"
              onClick={onResumeHeld}
            >
              Resume Saved / Held Bills ({heldBillsCount})
            </button>
          )}
        </div>

        {/* Right Side: Totals Summary & Requested "Save & Share" / "Save & New" Buttons */}
        <div className="vyapar-bottom-right">
          <div className="vyapar-grand-total-panel">
            <div className="vyapar-summary-line">
              <span>Gross Subtotal:</span>
              <span>₹{totals.totalGross.toFixed(2)}</span>
            </div>
            {totals.totalDiscount > 0 && (
              <div className="vyapar-summary-line discount">
                <span>Discount:</span>
                <span>− ₹{totals.totalDiscount.toFixed(2)}</span>
              </div>
            )}
            {totals.totalTax > 0 && (
              <div className="vyapar-summary-line tax">
                <span>Tax:</span>
                <span>+ ₹{totals.totalTax.toFixed(2)}</span>
              </div>
            )}
            <div className="vyapar-summary-line total-highlight">
              <span>Total Amount:</span>
              <span className="big-amount">₹{totals.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* TWO PRIMARY OPTIONS REQUESTED BY USER: Save & New, Save & Share */}
          <div className="vyapar-actions-bar">
            <button
              type="button"
              className="button secondary vyapar-btn-save-new"
              disabled={saving || totals.totalAmount <= 0}
              onClick={() => handleSubmit('new')}
              title="Save bill and immediately open a new invoice form"
            >
              <Plus size={16} /> Save & New
            </button>

            <button
              type="button"
              className="button primary vyapar-btn-save-share"
              disabled={saving || totals.totalAmount <= 0}
              onClick={() => handleSubmit('share')}
              title="Save bill and open WhatsApp / SMS / PDF receipt sharing"
            >
              <Share2 size={16} /> Save & Share
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

