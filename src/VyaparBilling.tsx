import { useState, useRef, useEffect, useMemo } from 'react';
import { Plus, Trash2, Search, Share2, Check, Calendar, Clock, Phone, User, Banknote, QrCode, CreditCard } from 'lucide-react';
import { mobileNumber, shopDate } from '../shared/customers';
import { validDueDate, dueDateAfter } from '../shared/credit';
import type { QueuedSale } from './offlineQueue';
import { paymentBreakdown } from '../shared/payments';

export type ProductVariant = {
  sku: string;
  barcode?: string;
  variantSequence?: number;
  size?: string;
  color?: string;
  stock: number;
  price: number;
  mrp?: number;
};

export type ProductItem = {
  id: string;
  name: string;
  sku: string;
  productNumber?: number;
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
  mrp: number;
  salePrice: number;
  discountPercent: number;
  discountManual: boolean;
  discount: number;
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
  mrp: 0,
  salePrice: 0,
  discountPercent: 0,
  discountManual: false,
  discount: 0,
  amount: 0
});

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
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');

  // Invoice metadata
  const [invoiceNumber, setInvoiceNumber] = useState(initialInvoiceNumber);
  const [invoiceDate, setInvoiceDate] = useState(() => shopDate());
  const [currentTime] = useState(() =>
    new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  );

  // Payment mode options (down side of terms & conditions)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'upi' | 'card' | 'credit' | 'split'>('cash');
  const [splitCash, setSplitCash] = useState('');
  const [splitUpi, setSplitUpi] = useState('');
  const [splitCard, setSplitCard] = useState('');
  const [splitCredit, setSplitCredit] = useState('');
  const [creditDueDate, setCreditDueDate] = useState(() => dueDateAfter(7));
  const [creditWhatsAppOptIn, setCreditWhatsAppOptIn] = useState(true);
  const [whatsappOptIn, setWhatsAppOptIn] = useState(false);
  const [cashTendered, setCashTendered] = useState('');
  const [terms] = useState('Goods once sold can be exchanged within 7 days with bill tag intact.');

  // Table rows
  const [rows, setRows] = useState<BillRow[]>([createEmptyRow('row-1')]);

  // Active search dropdown tracking: rowId
  const [activeSearchRowId, setActiveSearchRowId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const scanInputRef = useRef<HTMLInputElement>(null);

  // Flat variants list for searching
  const searchableItems = useMemo(() => {
    const list: {
      productId: string;
      productNumber?: number;
      productName: string;
      sku: string;
      barcode?: string;
      variantText: string;
      stock: number;
      price: number;
      mrp: number;
      category?: string;
    }[] = [];

    for (const p of products) {
      if (p.variants && p.variants.length > 0) {
        for (const v of p.variants) {
          const detail = [v.size, v.color].filter(Boolean).join(' / ');
          list.push({
            productId: p.id,
            productNumber: p.productNumber,
            productName: p.name,
            sku: v.sku,
            barcode: v.barcode || p.barcode,
            variantText: detail ? ` (${detail})` : '',
            stock: v.stock ?? p.stock,
            price: v.price || p.price,
            mrp: v.mrp ?? p.mrp,
            category: p.category
          });
        }
      } else {
        list.push({
          productId: p.id,
          productNumber: p.productNumber,
          productName: p.name,
          sku: p.sku,
          barcode: p.barcode,
          variantText: '',
          stock: p.stock,
          price: p.price,
          mrp: p.mrp,
          category: p.category
        });
      }
    }
    return list;
  }, [products]);

  // Filtered search results with Product No (#12) and Barcode prioritization
  const searchResults = useMemo(() => {
    const raw = searchQuery.trim();
    const q = raw.toLowerCase();
    if (!q) return searchableItems.slice(0, 30);

    const cleanNum = raw.replace(/^#/, '').trim();
    const isNum = /^\d+$/.test(cleanNum);
    const parsedNum = isNum ? parseInt(cleanNum, 10) : null;

    const matches = searchableItems.filter(item => {
      if (parsedNum !== null && item.productNumber === parsedNum) return true;
      if (item.barcode && item.barcode.toLowerCase().includes(q)) return true;
      return `${item.productNumber ? `#${item.productNumber}` : ''} ${item.productName} ${item.sku} ${item.variantText} ${item.category || ''}`
        .toLowerCase()
        .includes(q);
    });

    matches.sort((a, b) => {
      if (parsedNum !== null) {
        if (a.productNumber === parsedNum && b.productNumber !== parsedNum) return -1;
        if (b.productNumber === parsedNum && a.productNumber !== parsedNum) return 1;
      }
      if (a.barcode?.toLowerCase() === q && b.barcode?.toLowerCase() !== q) return -1;
      if (b.barcode?.toLowerCase() === q && a.barcode?.toLowerCase() !== q) return 1;
      return 0;
    });

    return matches.slice(0, 30);
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
      }
    }
  }

  // Row update helpers
  function calculateRowAmount(qty: number, mrp: number, discountPercent: number, salePrice?: number) {
    const gross = Math.round(qty * mrp * 100);
    const discount = (salePrice === undefined ? Math.round(gross * discountPercent / 100) : gross - Math.round(qty * salePrice * 100)) / 100;
    return { discount, amount: Math.max(0, Math.round(gross - discount * 100) / 100) };
  }

  function updateRowField(id: string, field: keyof BillRow, value: any) {
    setRows(prev =>
      prev.map(r => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };
        if (field === 'discountPercent') updated.discountManual = true;
        if (['quantity', 'mrp', 'discountPercent'].includes(field)) {
          const { discount, amount } = calculateRowAmount(
            Number(updated.quantity || 0),
            Number(updated.mrp || 0),
            Number(updated.discountPercent || 0),
            updated.discountManual ? undefined : updated.salePrice
          );
          updated.price = Number(updated.mrp || 0);
          updated.discount = discount;
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
        const mrp = item.mrp || item.price;
        const discountPercent = mrp > 0 ? Math.round((mrp - item.price) / mrp * 10000) / 100 : 0;
        const amounts = calculateRowAmount(r.quantity, mrp, discountPercent, item.price);
        return {
          ...r,
          productId: item.productId,
          sku: item.sku,
          name: fullName,
          variantDetail: item.variantText,
          stock: item.stock,
          price: mrp,
          mrp,
          salePrice: item.price,
          discountPercent,
          discountManual: false,
          discount: amounts.discount,
          amount: amounts.amount
        };
      })
    );
    setActiveSearchRowId(null);
    setSearchQuery('');
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-qty-row="${rowId}"]`)?.focus());
  }

  function handleBarcodeScan(rawCode: string) {
    const code = rawCode.trim();
    if (!code) return;
    const cleanNum = code.replace(/^#/, '').trim();
    const isNum = /^\d+$/.test(cleanNum);
    const parsedNum = isNum ? parseInt(cleanNum, 10) : null;

    let match = searchableItems.find(item => item.barcode && item.barcode.toLowerCase() === code.toLowerCase());
    if (!match && parsedNum !== null) {
      match = searchableItems.find(item => item.productNumber === parsedNum);
    }
    if (!match) {
      match = searchableItems.find(item => item.sku.toLowerCase() === code.toLowerCase());
    }

    if (!match) {
      setError(`No product found with barcode or Product #${code}.`);
      return;
    }

    setError('');
    const emptyRow = rows.find(r => !r.productId && !r.name.trim());
    if (emptyRow) {
      handleSelectItem(emptyRow.id, match);
    } else {
      const newRowId = crypto.randomUUID();
      const fullName = `${match.productName}${match.variantText}`;
      const mrp = match.mrp || match.price;
      const discountPercent = mrp > 0 ? Math.round((mrp - match.price) / mrp * 10000) / 100 : 0;
      const amounts = calculateRowAmount(1, mrp, discountPercent, match.price);
      setRows(prev => [
        ...prev,
        {
          id: newRowId,
          productId: match!.productId,
          sku: match!.sku,
          name: fullName,
          variantDetail: match!.variantText,
          stock: match!.stock,
          quantity: 1,
          price: mrp,
          mrp,
          salePrice: match.price,
          discountPercent,
          discountManual: false,
          discount: amounts.discount,
          amount: amounts.amount
        }
      ]);
    }
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
    let totalAmount = 0;

    for (const r of rows) {
      if (r.productId || r.name.trim()) {
        const qty = Number(r.quantity || 0);
        const price = Number(r.price || 0);
        const disc = Number(r.discount || 0);
        const amt = Number(r.amount || 0);

        totalQty += qty;
        totalGross += qty * price;
        totalDiscount += disc;
        totalAmount += amt;
      }
    }

    return {
      totalQty,
      totalGross: Math.round(totalGross * 100) / 100,
      totalDiscount: Math.round(totalDiscount * 100) / 100,
      totalAmount: Math.round(totalAmount * 100) / 100
    };
  }, [rows]);

  const splitAmounts = {
    cash: Number(splitCash || 0),
    upi: Number(splitUpi || 0),
    card: Number(splitCard || 0),
    credit: Number(splitCredit || 0)
  };
  const splitAllocated = Math.round(Object.values(splitAmounts).reduce((sum, amount) => sum + amount, 0) * 100) / 100;
  const splitRemaining = Math.round((totals.totalAmount - splitAllocated) * 100) / 100;
  const hasCreditPayment = paymentMethod === 'credit' || (paymentMethod === 'split' && splitAmounts.credit > 0);

  function fillSplitBalance(method: keyof typeof splitAmounts) {
    const otherTotal = Object.entries(splitAmounts).reduce((sum, [key, amount]) => key === method ? sum : sum + amount, 0);
    const balance = Math.max(0, Math.round((totals.totalAmount - otherTotal) * 100) / 100).toFixed(2);
    if (method === 'cash') setSplitCash(balance);
    if (method === 'upi') setSplitUpi(balance);
    if (method === 'card') setSplitCard(balance);
    if (method === 'credit') setSplitCredit(balance);
  }

  // Validation & Submit
  async function handleSubmit(action: 'share' | 'new') {
    setError('');
    setSuccess('');

    const validLines = rows.filter(r => (r.productId || r.name.trim()) && r.quantity > 0);
    if (!validLines.length) {
      setError('Please add at least one item with quantity greater than zero.');
      return;
    }
    if (validLines.some(line => !line.productId || line.mrp <= 0 || line.quantity > line.stock)) {
      setError('Choose an in-stock product for each row and check its quantity and MRP.');
      return;
    }
    const payments = paymentMethod === 'split' ? [
      { method: 'cash' as const, amount: splitAmounts.cash },
      { method: 'upi' as const, amount: splitAmounts.upi },
      { method: 'card' as const, amount: splitAmounts.card },
      { method: 'credit' as const, amount: splitAmounts.credit }
    ].filter(part => part.amount > 0) : undefined;
    try { paymentBreakdown(totals.totalAmount, paymentMethod, payments, cashTendered ? Number(cashTendered) : undefined); }
    catch (cause) { setError((cause as Error).message); return; }

    if (hasCreditPayment) {
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
        discount: Number(line.discount || 0)
      })),
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      customerDateOfBirth: customerDateOfBirth || undefined,
      creditDueDate: hasCreditPayment ? creditDueDate : undefined,
      creditWhatsAppOptIn: hasCreditPayment ? creditWhatsAppOptIn : undefined,
      whatsappOptIn: Boolean(customerPhone.trim()) && (whatsappOptIn || (hasCreditPayment && creditWhatsAppOptIn)),
      discount: totals.totalDiscount,
      paymentMethod,
      payments,
      cashTendered: cashTendered ? Number(cashTendered) : undefined,
      queuedAt: new Date().toISOString(),
      state: 'pending'
    };

    try {
      await onSaveBill(payload, action);
      if (action === 'new') {
        setSuccess(`Invoice #${invoiceNumber} saved successfully! New bill ready.`);
        setRows([createEmptyRow('new-1')]);
        setCustomerName('');
        setCustomerPhone('');
        setCustomerDateOfBirth('');
        setCashTendered('');
        setSplitCash('');
        setSplitUpi('');
        setSplitCard('');
        setSplitCredit('');
        setInvoiceNumber(n => n + 1);
        requestAnimationFrame(() => scanInputRef.current?.focus());
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
    <div className="vyapar-billing-container glass" onKeyDown={event => {
      if (event.key === 'F2') {
        event.preventDefault();
        scanInputRef.current?.focus();
        scanInputRef.current?.select();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        void handleSubmit('new');
        return;
      }
      if (event.key !== 'Enter' || event.defaultPrevented || !(event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)) return;
      event.preventDefault();
      const fields = [...event.currentTarget.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input:not([type="hidden"]):not(:disabled):not([readonly]), select:not(:disabled)')].filter(field => field.offsetParent !== null);
      const next = fields[fields.indexOf(event.target) + 1];
      next?.focus();
      if (next instanceof HTMLInputElement) next.select();
    }}>
      <header className="billing-workspace-header">
        <div>
          <span className="eyebrow">QUICK BILLING</span>
          <h1>New retail bill</h1>
          <p>Scan a product, confirm quantity and payment, then save. Customer details are optional for walk-in sales.</p>
        </div>
        <div className="billing-shortcuts" aria-label="Billing keyboard shortcuts">
          <span><kbd>F2</kbd> Scan product</span>
          <span><kbd>Enter</kbd> Next field</span>
          <span><kbd>Ctrl</kbd> + <kbd>Enter</kbd> Save &amp; new</span>
        </div>
      </header>

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

      {/* Customer and bill details */}
      <div className="vyapar-top-section">
        <div className="vyapar-customer-box" ref={customerBoxRef}>
          <div className="vyapar-input-group" style={{ position: 'relative' }}>
            <label className="vyapar-label" htmlFor="billing-customer-name">
              <User size={15} /> Customer name <span>Optional</span>
            </label>
            <input
              id="billing-customer-name"
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
                  <span>Matching customers ({filteredCustomers.length})</span>
                </div>
                <div className="vyapar-dropdown-list">
                  {filteredCustomers.map(cust => (
                    <button
                      key={cust.id}
                      type="button"
                      className="vyapar-customer-dropdown-item"
                      onMouseDown={event => event.preventDefault()}
                      onClick={() => handleSelectCustomer(cust)}
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
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="vyapar-input-group">
            <label className="vyapar-label" htmlFor="billing-customer-phone">
              <Phone size={15} /> Phone number <span>Optional</span>
            </label>
            <input
              id="billing-customer-phone"
              type="tel"
              className="vyapar-field"
              placeholder="10-digit Mobile number"
              value={customerPhone}
              onChange={e => handlePhoneChange(e.target.value)}
            />
          </div>

          <div className="vyapar-input-group">
            <label className="vyapar-label" htmlFor="billing-customer-dob">
              <Calendar size={15} /> Date of birth <span>Optional</span>
            </label>
            <input
              id="billing-customer-dob"
              type="date"
              className="vyapar-field"
              value={customerDateOfBirth}
              max={shopDate()}
              onChange={e => setCustomerDateOfBirth(e.target.value)}
            />
          </div>

        </div>

        <div className="vyapar-invoice-meta-box">
          <div className="vyapar-meta-row">
            <span className="vyapar-meta-title">Bill number</span>
            <strong className="vyapar-invoice-number">#{invoiceNumber}</strong>
          </div>

          <div className="vyapar-meta-row">
            <label className="vyapar-meta-title" htmlFor="billing-date">Bill date</label>
            <div className="vyapar-meta-control">
              <input
                id="billing-date"
                type="date"
                className="vyapar-meta-value"
                value={invoiceDate}
                onChange={e => setInvoiceDate(e.target.value)}
              />
              <Calendar size={16} aria-hidden="true" />
            </div>
          </div>

          <div className="vyapar-meta-row">
            <span className="vyapar-meta-title">Time</span>
            <div className="vyapar-meta-control">
              <span className="vyapar-meta-static">{currentTime}</span>
              <Clock size={16} aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>

      <div className="billing-scan-compact">
        <input
          ref={scanInputRef}
          type="text"
          autoFocus
          aria-label="Scan barcode or enter product number"
          placeholder="Scan barcode or SKU · F2"
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleBarcodeScan((e.target as HTMLInputElement).value);
              (e.target as HTMLInputElement).value = '';
            }
          }}
        />
      </div>

      {/* Bill totals use MRP and the item discount; GST stays in stock reporting. */}
      <div className="vyapar-table-wrapper" ref={dropdownRef}>
        <table className="vyapar-items-table">
          <thead>
            <tr>
              <th style={{ width: 42, textAlign: 'center' }}>#</th>
              <th style={{ minWidth: 260 }}>ITEM</th>
              <th style={{ width: 85, textAlign: 'center' }}>QTY</th>
              <th style={{ width: 110, textAlign: 'right' }}>MRP / PIECE</th>
              <th style={{ width: 100, textAlign: 'right' }}>DISCOUNT %</th>
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
                      aria-label={`Product for row ${index + 1}`}
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
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const exact = searchableItems.find(
                            item => item.barcode && item.barcode.toLowerCase() === searchQuery.trim().toLowerCase()
                          );
                          if (exact) {
                            handleSelectItem(row.id, exact);
                            return;
                          }
                          if (searchResults.length > 0) {
                            handleSelectItem(row.id, searchResults[0]);
                          }
                        }
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
                          <button
                            key={`${item.productId}-${item.sku}`}
                            type="button"
                            className="vyapar-dropdown-item"
                            onMouseDown={event => event.preventDefault()}
                            onClick={() => handleSelectItem(row.id, item)}
                          >
                            <div className="vyapar-dropdown-item-title">
                              {item.productNumber && (
                                <span className="product-no-badge">#{item.productNumber}</span>
                              )}
                              <strong>{item.productName}</strong>
                              <span className="variant-tag">{item.variantText || 'Standard'}</span>
                              <small>{item.barcode ? `Barcode: ${item.barcode}` : `SKU: ${item.sku}`}</small>
                            </div>
                            <div className="vyapar-dropdown-item-meta">
                              <span className={`stock-pill ${item.stock > 0 ? 'in-stock' : 'no-stock'}`}>
                                {item.stock > 0 ? `${item.stock} in stock` : '0 Out of stock'}
                              </span>
                              <strong className="rate-pill">₹{item.price}</strong>
                            </div>
                          </button>
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
                    data-qty-row={row.id}
                    aria-label={`Quantity for ${row.name || `row ${index + 1}`}`}
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
                    aria-label={`MRP for ${row.name || `row ${index + 1}`}`}
                    min="0"
                    step="0.01"
                    className="vyapar-cell-input text-right"
                    value={row.mrp || ''}
                    placeholder="MRP"
                    readOnly
                  />
                </td>

                {/* DISCOUNT (Editable) */}
                <td>
                  <input
                    type="number"
                    aria-label={`Discount percentage for ${row.name || `row ${index + 1}`}`}
                    min="0"
                    max="100"
                    step="0.01"
                    className="vyapar-cell-input text-right"
                    value={row.discountPercent}
                    placeholder="0"
                    onChange={e => updateRowField(row.id, 'discountPercent', Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                  />
                  <small className="vyapar-line-discount">−₹{row.discount.toFixed(2)} for {row.quantity}</small>
                </td>

                {/* AMOUNT (Calculated & Editable) */}
                <td>
                  <strong>₹{row.amount.toFixed(2)}</strong>
                </td>

                {/* Action: Delete Row */}
                <td style={{ textAlign: 'center' }}>
                  <button
                    type="button"
                    className="vyapar-row-delete"
                    onClick={() => removeRow(row.id)}
                    aria-label={`Remove ${row.name || `row ${index + 1}`}`}
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
                Selected: <strong>{paymentMethod === 'credit' ? 'Credit / Udhar' : paymentMethod === 'split' ? 'Split payment' : paymentMethod.toUpperCase()}</strong>
              </span>
            </div>

            <div className="vyapar-payment-modes-grid">
              <button
                type="button"
                className={`vyapar-mode-btn ${paymentMethod === 'cash' ? 'active' : ''}`}
                aria-pressed={paymentMethod === 'cash'}
                onClick={() => setPaymentMethod('cash')}
              >
                <Banknote size={16} />
                <span>Cash</span>
              </button>
              <button
                type="button"
                className={`vyapar-mode-btn ${paymentMethod === 'upi' ? 'active' : ''}`}
                aria-pressed={paymentMethod === 'upi'}
                onClick={() => setPaymentMethod('upi')}
              >
                <QrCode size={16} />
                <span>UPI / QR</span>
              </button>
              <button
                type="button"
                className={`vyapar-mode-btn ${paymentMethod === 'card' ? 'active' : ''}`}
                aria-pressed={paymentMethod === 'card'}
                onClick={() => setPaymentMethod('card')}
              >
                <CreditCard size={16} />
                <span>Card / POS</span>
              </button>
              <button type="button" className={`vyapar-mode-btn ${paymentMethod === 'split' ? 'active' : ''}`} aria-pressed={paymentMethod === 'split'} onClick={() => setPaymentMethod('split')}>
                <Banknote size={16} /><span>Split payment</span>
              </button>
              <button
                type="button"
                className={`vyapar-mode-btn ${paymentMethod === 'credit' ? 'active credit-mode' : ''}`}
                aria-pressed={paymentMethod === 'credit'}
                onClick={() => setPaymentMethod('credit')}
              >
                <Clock size={16} />
                <span>Credit / Udhar</span>
              </button>
            </div>

            {paymentMethod === 'split' && <div className="vyapar-mode-detail-box split-payment-fields">
              <div className="split-payment-heading"><strong>Split the total across any combination</strong><small>Use two, three, or all four payment methods.</small></div>
              <label><span>Cash ₹</span><div><input aria-label="Split cash amount" className="vyapar-field" type="number" min="0" max={totals.totalAmount} step="0.01" value={splitCash} onChange={e => setSplitCash(e.target.value)} /><button type="button" onClick={() => fillSplitBalance('cash')}>Use balance</button></div></label>
              <label><span>UPI ₹</span><div><input aria-label="Split UPI amount" className="vyapar-field" type="number" min="0" max={totals.totalAmount} step="0.01" value={splitUpi} onChange={e => setSplitUpi(e.target.value)} /><button type="button" onClick={() => fillSplitBalance('upi')}>Use balance</button></div></label>
              <label><span>Card ₹</span><div><input aria-label="Split card amount" className="vyapar-field" type="number" min="0" max={totals.totalAmount} step="0.01" value={splitCard} onChange={e => setSplitCard(e.target.value)} /><button type="button" onClick={() => fillSplitBalance('card')}>Use balance</button></div></label>
              <label><span>Udhar ₹</span><div><input aria-label="Split udhar amount" className="vyapar-field" type="number" min="0" max={totals.totalAmount} step="0.01" value={splitCredit} onChange={e => setSplitCredit(e.target.value)} /><button type="button" onClick={() => fillSplitBalance('credit')}>Use balance</button></div></label>
              <div className={`split-payment-balance ${splitRemaining < 0 ? 'over' : splitRemaining === 0 && totals.totalAmount > 0 ? 'complete' : ''}`}>
                <span>{splitRemaining < 0 ? 'Over allocated' : splitRemaining === 0 && totals.totalAmount > 0 ? 'Fully allocated' : 'Still to allocate'}</span>
                <strong>₹{Math.abs(splitRemaining).toFixed(2)}</strong>
              </div>
            </div>}

            {/* Context details for Cash */}
            {(paymentMethod === 'cash' || (paymentMethod === 'split' && splitAmounts.cash > 0)) && (
              <div className="vyapar-mode-detail-box">
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>Cash received ₹</label>
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
            {hasCreditPayment && (
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
              <Plus size={16} /> {saving ? 'Saving…' : 'Save & New'}
            </button>

            <button
              type="button"
              className="button primary vyapar-btn-save-share"
              disabled={saving || totals.totalAmount <= 0}
              onClick={() => handleSubmit('share')}
              title="Save bill and open WhatsApp / SMS / PDF receipt sharing"
            >
              <Share2 size={16} /> {saving ? 'Saving…' : 'Save & Share'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

