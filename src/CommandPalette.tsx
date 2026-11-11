import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  X,
  ArrowRight,
  Plus,
  ShoppingCart,
  TrendingUp,
  Receipt,
  Users,
  Truck,
  Printer,
  DollarSign,
  FileText,
  RotateCcw,
  BookOpen,
  Boxes,
  MessageSquare,
  Lock,
  Calendar,
  Sparkles,
  CreditCard,
  Building
} from 'lucide-react';
import { readAdmin } from './adminApi';

export type SearchCategory = 'all' | 'actions' | 'products' | 'customers' | 'suppliers' | 'bills';

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  navigate: (tab: string) => void;
  role?: string;
  onQuickAction?: (actionId: string) => void;
}

interface ActionItem {
  id: string;
  title: string;
  subtitle: string;
  category: 'action' | 'navigation' | 'report';
  icon: React.ComponentType<{ size?: number; className?: string }>;
  aliases: string[];
  minRole?: 'cashier' | 'manager' | 'owner';
  perform: () => void;
}

export function CommandPalette({
  isOpen,
  onClose,
  navigate,
  role = 'owner',
  onQuickAction
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<SearchCategory>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Server search results
  const [remoteProducts, setRemoteProducts] = useState<any[]>([]);
  const [remoteCustomers, setRemoteCustomers] = useState<any[]>([]);
  const [remoteSuppliers, setRemoteSuppliers] = useState<any[]>([]);
  const [remoteOrders, setRemoteOrders] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Debounced server search
  useEffect(() => {
    const q = query.trim();
    if (!q || q.length < 1) {
      setRemoteProducts([]);
      setRemoteCustomers([]);
      setRemoteSuppliers([]);
      setRemoteOrders([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(async () => {
      try {
        const data = await readAdmin<{
          products: any[];
          customers: any[];
          suppliers: any[];
          orders: any[];
        }>(`search?q=${encodeURIComponent(q)}`);
        setRemoteProducts(data.products || []);
        setRemoteCustomers(data.customers || []);
        setRemoteSuppliers(data.suppliers || []);
        setRemoteOrders(data.orders || []);
      } catch {
        // Fallback gracefully on network error
      } finally {
        setIsSearching(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [query]);

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query, activeCategory]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const money = (val: number | undefined) => `₹${Number(val || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  // Complete registry of actions with transliterated aliases
  const allActions: ActionItem[] = useMemo(() => [
    {
      id: 'new-bill',
      title: 'New Bill (POS)',
      subtitle: 'Create a retail bill, apply discounts and record payment',
      category: 'action',
      icon: ShoppingCart,
      aliases: ['new bill', 'billing', 'pos', 'counter', 'naya bill', 'bill banao', 'parchi', 'vyapar billing', 'bikri'],
      perform: () => { navigate('pos'); onClose(); }
    },
    {
      id: 'receive-udhar',
      title: 'Receive Udhar Payment',
      subtitle: 'Collect customer credit balance repayment via cash, UPI, or card',
      category: 'action',
      icon: CreditCard,
      aliases: ['receive udhar', 'udhar payment', 'udhar jama', 'credit repayment', 'baaki jama', 'paise aaye', 'khata jama', 'vasooli', 'jama karvana'],
      perform: () => { navigate('credit'); onClose(); }
    },
    {
      id: 'add-purchase',
      title: 'Add Purchase / Receive Stock',
      subtitle: 'Receive goods from supplier, check invoice and update stock',
      category: 'action',
      icon: Truck,
      minRole: 'manager',
      aliases: ['add purchase', 'purchase order', 'receive goods', 'maal aaya', 'kharidi', 'khareed', 'supplier invoice', 'goods in', 'stock receive', 'maal jodo'],
      perform: () => {
        if (onQuickAction) onQuickAction('add-purchase');
        else navigate('dashboard');
        onClose();
      }
    },
    {
      id: 'add-expense',
      title: 'Add Expense (Kharcha)',
      subtitle: 'Record daily shop expense (tea, refreshments, electricity, travel)',
      category: 'action',
      icon: DollarSign,
      aliases: ['add expense', 'expense', 'kharcha', 'kharch', 'dukan kharcha', 'chai paani', 'paisa gaya', 'cash out', 'roznama kharcha'],
      perform: () => {
        if (onQuickAction) onQuickAction('add-expense');
        else navigate('reports');
        onClose();
      }
    },
    {
      id: 'add-product',
      title: 'Add Product to Catalog',
      subtitle: 'Create a new apparel product with automatic sequential Product No.',
      category: 'action',
      icon: Plus,
      minRole: 'manager',
      aliases: ['add product', 'naya product', 'item jodo', 'create item', 'naya maal', 'clothing item', 'new product'],
      perform: () => {
        if (onQuickAction) onQuickAction('add-product');
        else navigate('products');
        onClose();
      }
    },
    {
      id: 'add-customer',
      title: 'Add Customer Profile',
      subtitle: 'Register customer with phone number, birthday, and credit ledger',
      category: 'action',
      icon: Users,
      aliases: ['add customer', 'naya grahak', 'grahak jodo', 'new customer', 'party jodo', 'customer registration'],
      perform: () => {
        if (onQuickAction) onQuickAction('add-customer');
        else navigate('customers');
        onClose();
      }
    },
    {
      id: 'add-supplier',
      title: 'Add Supplier',
      subtitle: 'Register cloth manufacturer, wholesaler, or vendor',
      category: 'action',
      icon: Building,
      minRole: 'manager',
      aliases: ['add supplier', 'supplier jodo', 'vyapari jodo', 'new vendor', 'dealer', 'distributor'],
      perform: () => {
        if (onQuickAction) onQuickAction('add-supplier');
        else navigate('suppliers');
        onClose();
      }
    },
    {
      id: 'print-barcodes',
      title: 'Print Barcode Labels',
      subtitle: 'Generate and print standard Code 128 (BOG-000001-001) thermal or A4 labels',
      category: 'action',
      icon: Printer,
      aliases: ['print barcodes', 'barcode', 'label print', 'sticker', 'tags', 'thermal print', 'barcode chhapna', 'label nikalo'],
      perform: () => {
        if (onQuickAction) onQuickAction('print-barcodes');
        else navigate('products');
        onClose();
      }
    },
    {
      id: 'customer-return',
      title: 'Customer Return / Exchange',
      subtitle: 'Process return of sold garment and issue store credit or refund',
      category: 'action',
      icon: RotateCcw,
      aliases: ['customer return', 'return', 'exchange', 'wapsi', 'maal wapsi', 'badli', 'grahak wapsi', 'sales return'],
      perform: () => {
        if (onQuickAction) onQuickAction('customer-return');
        else navigate('reports');
        onClose();
      }
    },
    {
      id: 'supplier-return',
      title: 'Supplier Purchase Return',
      subtitle: 'Return damaged or defective items back to supplier with debit note',
      category: 'action',
      icon: RotateCcw,
      minRole: 'manager',
      aliases: ['supplier return', 'purchase return', 'vyapari wapsi', 'debit note', 'maal wapas bhejna', 'supplier refund'],
      perform: () => {
        if (onQuickAction) onQuickAction('supplier-return');
        else navigate('reports');
        onClose();
      }
    },
    {
      id: 'daily-closing',
      title: 'Daily Cash Closing',
      subtitle: 'Close daily cash drawer, calculate variance, and view day summary',
      category: 'action',
      icon: BookOpen,
      minRole: 'manager',
      aliases: ['daily closing', 'cash closing', 'hisaab', 'galla band', 'cash drawer', 'cash register', 'aaj ka hisaab'],
      perform: () => {
        if (onQuickAction) onQuickAction('daily-closing');
        else navigate('dashboard');
        onClose();
      }
    },
    // Navigation items
    {
      id: 'nav-dashboard',
      title: 'Dashboard Workspace',
      subtitle: 'Daily store overview, today’s KPI cards, and operational priorities',
      category: 'navigation',
      icon: TrendingUp,
      aliases: ['dashboard', 'home', 'main page', 'aaj ka kaam', 'overview', 'summary'],
      perform: () => { navigate('dashboard'); onClose(); }
    },
    {
      id: 'nav-products',
      title: 'Products & Catalog',
      subtitle: 'Browse catalog, view Product #, prices, stock, and variant details',
      category: 'navigation',
      icon: Boxes,
      aliases: ['products', 'catalog', 'items', 'maal', 'rate list', 'kapde', 'stock list'],
      perform: () => { navigate('products'); onClose(); }
    },
    {
      id: 'nav-inventory',
      title: 'Inventory & Stock Movements',
      subtitle: 'Stock counts, stock valuation table, and adjustment ledger',
      category: 'navigation',
      icon: Boxes,
      minRole: 'manager',
      aliases: ['inventory', 'stock', 'godown', 'valuation', 'kitna bacha hai', 'maal hisaab'],
      perform: () => { navigate('inventory'); onClose(); }
    },
    {
      id: 'nav-reports',
      title: 'Reports Workspace',
      subtitle: 'Financial statements, Profit & Loss, Day Book, and tax ledgers',
      category: 'report',
      icon: FileText,
      minRole: 'manager',
      aliases: ['reports', 'report', 'profit and loss', 'munafa', 'fayda', 'p&l', 'day book', 'roznamcha', 'sales report', 'bikri report'],
      perform: () => { navigate('reports'); onClose(); }
    },
    {
      id: 'nav-credit',
      title: 'Credit / Udhar Ledger',
      subtitle: 'Customer balances, overdue tracking, and repayment entries',
      category: 'navigation',
      icon: CreditCard,
      aliases: ['credit', 'udhar', 'baaki', 'lena baaki', 'khata book', 'udhar book'],
      perform: () => { navigate('credit'); onClose(); }
    },
    {
      id: 'nav-whatsapp',
      title: 'WhatsApp Automation',
      subtitle: 'Send bill copies, payment reminders, and birthday offers',
      category: 'navigation',
      icon: MessageSquare,
      aliases: ['whatsapp', 'message', 'reminder', 'sandesh', 'payment link'],
      perform: () => { navigate('whatsapp'); onClose(); }
    },
    {
      id: 'nav-orders',
      title: 'Bill History & Invoices',
      subtitle: 'Look up past invoices, view bill links, and reprint receipts',
      category: 'navigation',
      icon: Receipt,
      aliases: ['orders', 'bills', 'invoices', 'bill history', 'purani parchi', 'reprint'],
      perform: () => { navigate('orders'); onClose(); }
    }
  ], [navigate, onClose, onQuickAction]);

  // Filter actions based on role and query
  const filteredActions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allActions.filter(action => {
      // Role filtering
      if (action.minRole === 'owner' && role !== 'owner') return false;
      if (action.minRole === 'manager' && !['owner', 'manager'].includes(role)) return false;

      if (!q) return true;
      return (
        action.title.toLowerCase().includes(q) ||
        action.subtitle.toLowerCase().includes(q) ||
        action.aliases.some(alias => alias.toLowerCase().includes(q))
      );
    });
  }, [allActions, query, role]);

  // Aggregate items for keyboard selection
  type FlatItem =
    | { type: 'action'; item: ActionItem }
    | { type: 'product'; item: any }
    | { type: 'customer'; item: any }
    | { type: 'supplier'; item: any }
    | { type: 'bill'; item: any };

  const flatItems: FlatItem[] = useMemo(() => {
    const list: FlatItem[] = [];

    if (activeCategory === 'all' || activeCategory === 'actions') {
      filteredActions.forEach(item => list.push({ type: 'action', item }));
    }
    if (activeCategory === 'all' || activeCategory === 'products') {
      remoteProducts.forEach(item => list.push({ type: 'product', item }));
    }
    if (activeCategory === 'all' || activeCategory === 'customers') {
      remoteCustomers.forEach(item => list.push({ type: 'customer', item }));
    }
    if (activeCategory === 'all' || activeCategory === 'suppliers') {
      remoteSuppliers.forEach(item => list.push({ type: 'supplier', item }));
    }
    if (activeCategory === 'all' || activeCategory === 'bills') {
      remoteOrders.forEach(item => list.push({ type: 'bill', item }));
    }

    return list;
  }, [activeCategory, filteredActions, remoteProducts, remoteCustomers, remoteSuppliers, remoteOrders]);

  // Execute selected item
  const handleSelect = (entry: FlatItem) => {
    if (entry.type === 'action') {
      entry.item.perform();
    } else if (entry.type === 'product') {
      navigate('products');
      onClose();
    } else if (entry.type === 'customer') {
      navigate('customers');
      onClose();
    } else if (entry.type === 'supplier') {
      navigate('suppliers');
      onClose();
    } else if (entry.type === 'bill') {
      navigate('orders');
      onClose();
    }
  };

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1 < flatItems.length ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 >= 0 ? prev - 1 : flatItems.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flatItems[selectedIndex]) {
        handleSelect(flatItems[selectedIndex]);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="command-palette-backdrop" onClick={onClose}>
      <div
        className="command-palette glass"
        role="dialog"
        aria-modal="true"
        aria-label="Global Search and Command Palette"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="palette-input-wrap">
          <Search size={20} style={{ color: 'var(--gold)' }} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search actions, Product #, barcode, customer, bill (e.g. #12, kharcha, udhar, maal aaya)..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="icon-button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Category Filters */}
        <div className="palette-category-tabs">
          {(['all', 'actions', 'products', 'customers', 'suppliers', 'bills'] as const).map(cat => (
            <button
              key={cat}
              type="button"
              className={`palette-tab-btn ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat === 'all'
                ? 'All Results'
                : cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>

        {/* Results List */}
        <div className="palette-results-list">
          {flatItems.length > 0 ? (
            <>
              {/* Actions Section */}
              {(activeCategory === 'all' || activeCategory === 'actions') && filteredActions.length > 0 && (
                <div className="palette-group">
                  <div className="palette-group-title">
                    {query ? 'Matching Actions & Navigation' : 'Quick Actions & Tools'}
                  </div>
                  {filteredActions.map(action => {
                    const idx = flatItems.findIndex(f => f.type === 'action' && f.item.id === action.id);
                    const isSelected = idx === selectedIndex;
                    const IconComp = action.icon;
                    return (
                      <div
                        key={action.id}
                        className={`palette-result-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleSelect({ type: 'action', item: action })}
                        onMouseEnter={() => setSelectedIndex(idx)}
                      >
                        <div className="palette-item-icon">
                          <IconComp size={18} />
                        </div>
                        <div className="palette-item-content">
                          <div className="palette-item-title-row">
                            <span className="palette-item-title">{action.title}</span>
                          </div>
                          <div className="palette-item-subtitle">{action.subtitle}</div>
                        </div>
                        <ArrowRight size={15} style={{ color: 'var(--muted)' }} />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Products Section */}
              {(activeCategory === 'all' || activeCategory === 'products') && remoteProducts.length > 0 && (
                <div className="palette-group">
                  <div className="palette-group-title">Products ({remoteProducts.length})</div>
                  {remoteProducts.map(p => {
                    const idx = flatItems.findIndex(f => f.type === 'product' && f.item.id === p.id);
                    const isSelected = idx === selectedIndex;
                    return (
                      <div
                        key={p.id}
                        className={`palette-result-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleSelect({ type: 'product', item: p })}
                        onMouseEnter={() => setSelectedIndex(idx)}
                      >
                        <div className="palette-item-icon">
                          <Boxes size={18} />
                        </div>
                        <div className="palette-item-content">
                          <div className="palette-item-title-row">
                            {p.productNumber && (
                              <span className="palette-product-num-badge">#{p.productNumber}</span>
                            )}
                            <span className="palette-item-title">{p.name}</span>
                          </div>
                          <div className="palette-item-subtitle">
                            {[p.brand, p.category, p.barcode || p.sku].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                        <div className="palette-item-meta">
                          <span className={`palette-stock-badge ${p.stock > 0 ? 'in-stock' : 'no-stock'}`}>
                            {p.stock > 0 ? `${p.stock} in stock` : 'Out of stock'}
                          </span>
                          <span className="palette-rate-badge">{money(p.price)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Customers Section */}
              {(activeCategory === 'all' || activeCategory === 'customers') && remoteCustomers.length > 0 && (
                <div className="palette-group">
                  <div className="palette-group-title">Customers ({remoteCustomers.length})</div>
                  {remoteCustomers.map(c => {
                    const idx = flatItems.findIndex(f => f.type === 'customer' && f.item.id === c.id);
                    const isSelected = idx === selectedIndex;
                    return (
                      <div
                        key={c.id}
                        className={`palette-result-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleSelect({ type: 'customer', item: c })}
                        onMouseEnter={() => setSelectedIndex(idx)}
                      >
                        <div className="palette-item-icon">
                          <Users size={18} />
                        </div>
                        <div className="palette-item-content">
                          <div className="palette-item-title-row">
                            <span className="palette-item-title">{c.fullName || 'Customer'}</span>
                          </div>
                          <div className="palette-item-subtitle">{c.phone || c.email || '—'}</div>
                        </div>
                        {Number(c.balance || c.currentBalance || 0) > 0 && (
                          <div className="palette-item-meta">
                            <span className="palette-balance-badge">
                              Udhar: {money(c.balance || c.currentBalance)}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Suppliers Section */}
              {(activeCategory === 'all' || activeCategory === 'suppliers') && remoteSuppliers.length > 0 && (
                <div className="palette-group">
                  <div className="palette-group-title">Suppliers ({remoteSuppliers.length})</div>
                  {remoteSuppliers.map(s => {
                    const idx = flatItems.findIndex(f => f.type === 'supplier' && f.item.id === s.id);
                    const isSelected = idx === selectedIndex;
                    return (
                      <div
                        key={s.id}
                        className={`palette-result-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleSelect({ type: 'supplier', item: s })}
                        onMouseEnter={() => setSelectedIndex(idx)}
                      >
                        <div className="palette-item-icon">
                          <Building size={18} />
                        </div>
                        <div className="palette-item-content">
                          <div className="palette-item-title-row">
                            <span className="palette-item-title">{s.name}</span>
                          </div>
                          <div className="palette-item-subtitle">{[s.phone, s.gstin].filter(Boolean).join(' · ')}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Bills / Invoices Section */}
              {(activeCategory === 'all' || activeCategory === 'bills') && remoteOrders.length > 0 && (
                <div className="palette-group">
                  <div className="palette-group-title">Bills & Orders ({remoteOrders.length})</div>
                  {remoteOrders.map(o => {
                    const idx = flatItems.findIndex(f => f.type === 'bill' && f.item.id === o.id);
                    const isSelected = idx === selectedIndex;
                    return (
                      <div
                        key={o.id}
                        className={`palette-result-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleSelect({ type: 'bill', item: o })}
                        onMouseEnter={() => setSelectedIndex(idx)}
                      >
                        <div className="palette-item-icon">
                          <Receipt size={18} />
                        </div>
                        <div className="palette-item-content">
                          <div className="palette-item-title-row">
                            <span className="palette-item-title">Invoice #{o.id || o.orderId}</span>
                          </div>
                          <div className="palette-item-subtitle">
                            {[o.customerName, o.customerPhone].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                        <div className="palette-item-meta">
                          <span className="palette-rate-badge">{money(o.totalAmount || o.total)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="palette-empty-state">
              <p>No results found for "{query}".</p>
              <div className="palette-transliteration-hints">
                <strong>Try searching in Hindi or Gujarati:</strong>
                <span>
                  • <em>kharcha</em> (Add Expense)<br />
                  • <em>udhar / baaki</em> (Receive Udhar / Ledger)<br />
                  • <em>maal aaya</em> (Add Purchase / Receive Stock)<br />
                  • <em>munafa / fayda</em> (Profit & Loss Report)<br />
                  • <em>supplier jodo</em> (Add Supplier)<br />
                  • <em>#12 or BOG-000012-001</em> (Exact Product / Barcode)
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer with keyboard hints */}
        <div className="palette-footer">
          <div className="palette-footer-shortcuts">
            <span><kbd>↑</kbd> <kbd>↓</kbd> Navigate</span>
            <span><kbd>↵</kbd> Select</span>
            <span><kbd>esc</kbd> Close</span>
          </div>
          <span>Brothers Outfit Gallery Search</span>
        </div>
      </div>
    </div>,
    document.body
  );
}

