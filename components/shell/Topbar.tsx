'use client';

import { useUIStore } from '@/store/ui';
import { formatCLPCompact, formatMonthLabel } from '@/lib/format';

export interface PeriodStats {
  income:  number;
  expense: number;
  balance: number;
  count:   number;
}

interface Props {
  stats:              PeriodStats;
  onAddTransaction:   () => void;
  canUndo:            boolean;
  canRedo:            boolean;
  onUndo:             () => void;
  onRedo:             () => void;
  searchQuery:        string;
  onSearchQueryChange:(q: string) => void;
  insightsOpen:       boolean;
  onToggleInsights:   () => void;
  onOpenCommandPalette?: () => void;
}

function prevMonth(m: string) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function nextMonth(m: string) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(y, mo, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function Topbar({
  stats,
  onAddTransaction,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  searchQuery,
  onSearchQueryChange,
  insightsOpen,
  onToggleInsights,
  onOpenCommandPalette,
}: Props) {
  const { selectedMonth, setSelectedMonth } = useUIStore();

  return (
    <header className="topbar">
      {/* Month nav */}
      <div className="month-nav">
        <button
          className="btn btn-icon"
          onClick={() => setSelectedMonth(prevMonth(selectedMonth))}
          aria-label="Mes anterior"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M10 4L6 8l4 4" /></svg>
        </button>

        <span className="month-label">{formatMonthLabel(selectedMonth)}</span>

        <button
          className="btn btn-icon"
          onClick={() => setSelectedMonth(nextMonth(selectedMonth))}
          aria-label="Mes siguiente"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M6 4l4 4-4 4" /></svg>
        </button>
      </div>

      {/* Period stats */}
      {stats.count > 0 && (
        <div className="topbar-stats">
          <span className="stat income" title="Ingresos del período">
            ↑ {formatCLPCompact(stats.income)}
          </span>
          <span className="stat-sep">·</span>
          <span className="stat expense" title="Gastos del período">
            ↓ {formatCLPCompact(stats.expense)}
          </span>
          <span className="stat-sep">·</span>
          <span
            className={`stat balance ${stats.balance >= 0 ? 'positive' : 'negative'}`}
            title="Balance del período"
          >
            = {stats.balance >= 0 ? '+' : ''}{formatCLPCompact(stats.balance)}
          </span>
          <span className="stat-sep">·</span>
          <span className="stat count" title="Transacciones">
            {stats.count} tx
          </span>
        </div>
      )}

      <div className="topbar-spacer" />

      {/* Search */}
      <div className="topbar-search" aria-label="Búsqueda">
        <input
          className="search-input"
          value={searchQuery}
          onChange={e => onSearchQueryChange(e.target.value)}
          placeholder='Buscar… @cat:Supermercado #uber monto>10000'
          spellCheck={false}
        />
      </div>

      {/* Command palette */}
      {onOpenCommandPalette && (
        <button
          className="btn btn-icon"
          onClick={onOpenCommandPalette}
          title="Paleta de comandos (Ctrl+K)"
          aria-label="Abrir paleta de comandos"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 4H3v16h18V4z" />
            <path d="M7 8h10" />
            <path d="M7 12h6" />
          </svg>
        </button>
      )}

      {/* Insights panel */}
      <button
        className={`btn btn-icon${insightsOpen ? ' active' : ''}`}
        onClick={onToggleInsights}
        title="Insights (I)"
        aria-label="Abrir/cerrar insights"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 19V5" />
          <path d="M4 19h16" />
          <path d="M8 16v-6" />
          <path d="M12 16v-9" />
          <path d="M16 16v-3" />
        </svg>
      </button>

      {/* Undo / Redo */}
      <button
        className="btn btn-icon"
        onClick={onUndo}
        disabled={!canUndo}
        title="Deshacer (Ctrl+Z)"
        aria-label="Deshacer"
      >
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 7H9.5a3 3 0 0 1 0 6H7" />
          <path d="M3 7L6 4M3 7l3 3" />
        </svg>
      </button>

      <button
        className="btn btn-icon"
        onClick={onRedo}
        disabled={!canRedo}
        title="Rehacer (Ctrl+Y)"
        aria-label="Rehacer"
      >
        <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 7H5.5a3 3 0 0 0 0 6H8" />
          <path d="M12 7l-3-3m3 3l-3 3" />
        </svg>
      </button>

      {/* New transaction */}
      <button
        className="btn btn-primary"
        onClick={onAddTransaction}
        title="Nueva transacción (N)"
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="6.5" y1="1" x2="6.5" y2="12" />
          <line x1="1" y1="6.5" x2="12" y2="6.5" />
        </svg>
        Nueva
      </button>
    </header>
  );
}
