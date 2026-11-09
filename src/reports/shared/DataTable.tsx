import React, { useState, useMemo } from 'react';
import { ChevronDown, ChevronUp, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';

export interface ColumnDef<T> {
  key: string;
  header: string;
  render?: (row: T, index: number) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  sortValue?: (row: T) => number | string;
  width?: string | number;
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  keyField?: keyof T | ((row: T, idx: number) => string);
  emptyMessage?: string;
  defaultPageSize?: number;
  loading?: boolean;
}

export function DataTable<T>({
  columns,
  data,
  keyField,
  emptyMessage = 'No records found matching the current filters.',
  defaultPageSize = 25,
  loading = false
}: DataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  const handleHeaderClick = (col: ColumnDef<T>) => {
    if (!col.sortable) return;
    if (sortKey === col.key) {
      if (sortDirection === 'asc') setSortDirection('desc');
      else {
        setSortKey(null);
        setSortDirection('asc');
      }
    } else {
      setSortKey(col.key);
      setSortDirection('asc');
    }
    setPage(1);
  };

  const sortedData = useMemo(() => {
    if (!sortKey) return data;
    const col = columns.find(c => c.key === sortKey);
    if (!col) return data;

    const copy = [...data];
    copy.sort((a, b) => {
      let valA: any = col.sortValue ? col.sortValue(a) : (a as any)[sortKey];
      let valB: any = col.sortValue ? col.sortValue(b) : (b as any)[sortKey];

      if (valA === null || valA === undefined) valA = '';
      if (valB === null || valB === undefined) valB = '';

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDirection === 'asc' ? valA - valB : valB - valA;
      }
      return sortDirection === 'asc'
        ? String(valA).localeCompare(String(valB))
        : String(valB).localeCompare(String(valA));
    });
    return copy;
  }, [data, sortKey, sortDirection, columns]);

  const totalPages = Math.ceil(sortedData.length / pageSize) || 1;
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const paginatedData = sortedData.slice(startIdx, startIdx + pageSize);

  const getKey = (row: T, idx: number): string => {
    if (typeof keyField === 'function') return keyField(row, idx);
    if (keyField && (row as any)[keyField]) return String((row as any)[keyField]);
    return (row as any).id || (row as any).key || `row-${startIdx + idx}`;
  };

  return (
    <div className="report-table-panel">
      <div className="report-table-wrap">
        <table className="report-data-table">
          <thead>
            <tr>
              {columns.map(col => {
                const isSorted = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    style={{
                      textAlign: col.align || 'left',
                      width: col.width,
                      cursor: col.sortable ? 'pointer' : 'default'
                    }}
                    onClick={() => handleHeaderClick(col)}
                    className={col.sortable ? 'sortable-header' : ''}
                  >
                    <div
                      className="header-cell-content"
                      style={{
                        justifyContent:
                          col.align === 'right'
                            ? 'flex-end'
                            : col.align === 'center'
                            ? 'center'
                            : 'flex-start'
                      }}
                    >
                      <span>{col.header}</span>
                      {col.sortable && (
                        <span className="sort-icon">
                          {isSorted ? (
                            sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                          ) : (
                            <ChevronsUpDown size={13} className="text-muted" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} className="table-state-cell">
                  <div className="table-loading-spinner">Loading report records…</div>
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="table-state-cell empty-state">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginatedData.map((row, idx) => (
                <tr key={getKey(row, idx)}>
                  {columns.map(col => (
                    <td
                      key={col.key}
                      style={{ textAlign: col.align || 'left', width: col.width }}
                    >
                      {col.render ? col.render(row, startIdx + idx) : (row as any)[col.key] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination & Total Count Footer */}
      <div className="report-table-footer">
        <div className="table-count-label">
          Showing {sortedData.length === 0 ? 0 : startIdx + 1} to{' '}
          {Math.min(startIdx + pageSize, sortedData.length)} of {sortedData.length} entries
        </div>

        <div className="table-pagination-controls">
          <div className="page-size-selector">
            <span>Show:</span>
            <select
              value={pageSize}
              onChange={e => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              <option value={15}>15</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <div className="pagination-buttons">
            <button
              type="button"
              className="page-btn"
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
              title="Previous page"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="page-indicator">
              Page {safePage} of {totalPages}
            </span>
            <button
              type="button"
              className="page-btn"
              disabled={safePage >= totalPages}
              onClick={() => setPage(safePage + 1)}
              title="Next page"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

