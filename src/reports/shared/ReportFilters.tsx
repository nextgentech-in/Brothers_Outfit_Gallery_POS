import { useMemo } from 'react';
import { Calendar, Search } from 'lucide-react';
import { shopDate } from '../../../shared/customers';

export type DatePreset = 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth' | 'fy' | 'custom';

export interface FilterState {
  preset: DatePreset;
  fromDate: string;
  toDate: string;
  channel?: string;
  paymentMethod?: string;
  supplierId?: string;
  status?: string;
  searchQuery?: string;
  view?: string; // e.g. for bill profit: lifetime vs period
}

interface ReportFiltersProps {
  filters: FilterState;
  onChange: (newFilters: FilterState) => void;
  showChannel?: boolean;
  showPaymentMethod?: boolean;
  showSupplier?: boolean;
  suppliers?: { id: string; name: string }[];
  showStatus?: boolean;
  statusOptions?: { label: string; value: string }[];
  showSearch?: boolean;
  searchPlaceholder?: string;
  showViewToggle?: boolean;
  viewOptions?: { label: string; value: string }[];
}

export function computeDatePreset(preset: DatePreset): { fromDate: string; toDate: string } {
  const todayStr = shopDate(); // YYYY-MM-DD
  const [year, month, day] = todayStr.split('-').map(Number);
  const now = new Date(year, month - 1, day);

  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dt = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dt}`;
  };

  switch (preset) {
    case 'today':
      return { fromDate: todayStr, toDate: todayStr };

    case 'yesterday': {
      const y = new Date(now);
      y.setDate(y.getDate() - 1);
      const s = fmt(y);
      return { fromDate: s, toDate: s };
    }

    case 'last7': {
      const past = new Date(now);
      past.setDate(past.getDate() - 6);
      return { fromDate: fmt(past), toDate: todayStr };
    }

    case 'thisMonth': {
      const start = new Date(year, month - 1, 1);
      return { fromDate: fmt(start), toDate: todayStr };
    }

    case 'lastMonth': {
      const start = new Date(year, month - 2, 1);
      const end = new Date(year, month - 1, 0); // last day of prev month
      return { fromDate: fmt(start), toDate: fmt(end) };
    }

    case 'fy': {
      // Indian Financial Year: April 1 to March 31
      const fyStartYear = month >= 4 ? year : year - 1;
      const start = new Date(fyStartYear, 3, 1); // 1st April
      return { fromDate: fmt(start), toDate: todayStr };
    }

    case 'custom':
    default:
      return { fromDate: todayStr, toDate: todayStr };
  }
}

export function ReportFilters({
  filters,
  onChange,
  showChannel = false,
  showPaymentMethod = false,
  showSupplier = false,
  suppliers = [],
  showStatus = false,
  statusOptions = [],
  showSearch = true,
  searchPlaceholder = 'Search records...',
  showViewToggle = false,
  viewOptions = []
}: ReportFiltersProps) {
  const presets: { id: DatePreset; label: string }[] = useMemo(() => [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: 'last7', label: 'Last 7 Days' },
    { id: 'thisMonth', label: 'This Month' },
    { id: 'lastMonth', label: 'Last Month' },
    { id: 'fy', label: 'Financial Year' },
    { id: 'custom', label: 'Custom' }
  ], []);

  const handlePresetClick = (p: DatePreset) => {
    if (p === 'custom') {
      onChange({ ...filters, preset: 'custom' });
    } else {
      const range = computeDatePreset(p);
      onChange({
        ...filters,
        preset: p,
        fromDate: range.fromDate,
        toDate: range.toDate
      });
    }
  };

  return (
    <div className="report-filter-panel">
      {/* Date Presets Row */}
      <div className="filter-presets-row">
        <span className="filter-label">
          <Calendar size={14} /> Date Range:
        </span>
        <div className="preset-buttons">
          {presets.map(p => (
            <button
              key={p.id}
              type="button"
              className={`preset-btn ${filters.preset === p.id ? 'active' : ''}`}
              onClick={() => handlePresetClick(p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Date Inputs */}
        <div className="filter-date-inputs">
          <label>
            <span>From</span>
            <input
              type="date"
              value={filters.fromDate}
              onChange={e => onChange({ ...filters, preset: 'custom', fromDate: e.target.value })}
            />
          </label>
          <label>
            <span>To</span>
            <input
              type="date"
              value={filters.toDate}
              onChange={e => onChange({ ...filters, preset: 'custom', toDate: e.target.value })}
            />
          </label>
        </div>
      </div>

      {/* Contextual Filters Row */}
      {(showChannel || showPaymentMethod || showSupplier || showStatus || showSearch || showViewToggle) && (
        <div className="filter-controls-row">
          {showSearch && (
            <div className="filter-search-box">
              <Search size={15} />
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={filters.searchQuery || ''}
                onChange={e => onChange({ ...filters, searchQuery: e.target.value })}
              />
              {filters.searchQuery && (
                <button
                  type="button"
                  className="filter-clear-btn"
                  onClick={() => onChange({ ...filters, searchQuery: '' })}
                >
                  ×
                </button>
              )}
            </div>
          )}

          {showChannel && (
            <div className="filter-select-group">
              <label>Channel:</label>
              <select
                value={filters.channel || ''}
                onChange={e => onChange({ ...filters, channel: e.target.value })}
              >
                <option value="">All Channels</option>
                <option value="pos">In-Store (POS)</option>
                <option value="website">Website Online</option>
              </select>
            </div>
          )}

          {showPaymentMethod && (
            <div className="filter-select-group">
              <label>Payment:</label>
              <select
                value={filters.paymentMethod || ''}
                onChange={e => onChange({ ...filters, paymentMethod: e.target.value })}
              >
                <option value="">All Methods</option>
                <option value="cash">Cash</option>
                <option value="upi">UPI / QR</option>
                <option value="card">Card / POS</option>
                <option value="credit">Credit / Udhar</option>
              </select>
            </div>
          )}

          {showSupplier && (
            <div className="filter-select-group">
              <label>Supplier:</label>
              <select
                value={filters.supplierId || ''}
                onChange={e => onChange({ ...filters, supplierId: e.target.value })}
              >
                <option value="">All Suppliers</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {showStatus && (
            <div className="filter-select-group">
              <label>Status:</label>
              <select
                value={filters.status || ''}
                onChange={e => onChange({ ...filters, status: e.target.value })}
              >
                <option value="">All Statuses</option>
                {statusOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {showViewToggle && viewOptions.length > 0 && (
            <div className="filter-view-toggle">
              {viewOptions.map(v => (
                <button
                  key={v.value}
                  type="button"
                  className={`view-btn ${filters.view === v.value ? 'active' : ''}`}
                  onClick={() => onChange({ ...filters, view: v.value })}
                >
                  {v.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
