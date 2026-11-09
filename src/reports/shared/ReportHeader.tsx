import React from 'react';
import { RefreshCw, Printer, Download, Clock } from 'lucide-react';

interface ReportHeaderProps {
  title: string;
  description: string;
  lastUpdated?: string;
  loading?: boolean;
  onRefresh: () => void;
  onExportCsv?: () => void;
  onPrint?: () => void;
  actionButton?: React.ReactNode;
}

export function ReportHeader({
  title,
  description,
  lastUpdated,
  loading = false,
  onRefresh,
  onExportCsv,
  onPrint,
  actionButton
}: ReportHeaderProps) {
  const handlePrint = () => {
    if (onPrint) onPrint();
    else window.print();
  };

  return (
    <div className="report-header">
      <div className="report-header-info">
        <span className="report-eyebrow">BROTHERS OUTFIT GALLERY · REPORTS</span>
        <h1 className="report-title">{title}</h1>
        <p className="report-description">{description}</p>
        {lastUpdated && (
          <div className="report-last-updated">
            <Clock size={13} />
            <span>Updated {lastUpdated}</span>
          </div>
        )}
      </div>

      <div className="report-header-actions">
        {actionButton}

        {onExportCsv && (
          <button
            type="button"
            className="report-btn secondary"
            onClick={onExportCsv}
            disabled={loading}
            title="Download full matching dataset as CSV"
          >
            <Download size={15} />
            <span>Export CSV</span>
          </button>
        )}

        <button
          type="button"
          className="report-btn secondary"
          onClick={handlePrint}
          disabled={loading}
          title="Print this report"
        >
          <Printer size={15} />
          <span>Print</span>
        </button>

        <button
          type="button"
          className="report-btn refresh"
          onClick={onRefresh}
          disabled={loading}
          title="Refresh report data"
        >
          <RefreshCw size={15} className={loading ? 'spinning' : ''} />
          <span>Refresh</span>
        </button>
      </div>
    </div>
  );
}

