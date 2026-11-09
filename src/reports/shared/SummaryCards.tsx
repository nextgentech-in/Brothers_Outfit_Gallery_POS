import React from 'react';
import { formatINR } from './exportUtils';

export interface MetricCardItem {
  label: string;
  value: number | string;
  isCurrency?: boolean;
  subtext?: string;
  variant?: 'default' | 'positive' | 'negative' | 'info' | 'warning';
  icon?: React.ReactNode;
}

interface SummaryCardsProps {
  cards: MetricCardItem[];
}

export function SummaryCards({ cards }: SummaryCardsProps) {
  return (
    <div className="report-summary-cards">
      {cards.map((card, idx) => {
        const displayValue = typeof card.value === 'number' && card.isCurrency !== false
          ? formatINR(card.value)
          : card.value;

        return (
          <div key={idx} className={`summary-card variant-${card.variant || 'default'}`}>
            <div className="summary-card-header">
              <span className="summary-card-label">{card.label}</span>
              {card.icon && <span className="summary-card-icon">{card.icon}</span>}
            </div>
            <div className="summary-card-value">{displayValue}</div>
            {card.subtext && <div className="summary-card-subtext">{card.subtext}</div>}
          </div>
        );
      })}
    </div>
  );
}

