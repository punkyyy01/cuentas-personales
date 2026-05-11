'use client';

import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/index';
import { useUIStore } from '@/store/ui';
import type { Category, Transaction } from '@/lib/db/schema';
import { detectRecurringGroups, assignRecurringFlags } from '@/lib/analyzers/recurring';
import { computeProjection } from '@/lib/analyzers/projection';
import { formatCLPCompact } from '@/lib/format';
import { motion, AnimatePresence } from 'framer-motion';
import Heatmap from './Heatmap';
import Charts from './Charts';

interface Props {
  month: string;
  monthTxs: Transaction[];
  categoryMap: Record<string, Category>;
}

export default function InsightsPanel({ month, monthTxs, categoryMap }: Props) {
  const { insightsPanelOpen, setInsightsPanelOpen, selectedYear, setSelectedYear } = useUIStore();
  const allTxs = useLiveQuery(() => db.transactions.toArray(), [], [] as Transaction[]);

  const recurringGroups = useMemo(() => detectRecurringGroups(allTxs), [allTxs]);

  const projection = useMemo(
    () => computeProjection(month, monthTxs, allTxs, recurringGroups),
    [month, monthTxs, allTxs, recurringGroups]
  );

  const [busyRecurring, setBusyRecurring] = useState(false);

  const runRecurring = async () => {
    setBusyRecurring(true);
    try {
      const groups = detectRecurringGroups(allTxs);
      const flags = assignRecurringFlags(allTxs, groups);
      await db.transaction('rw', db.transactions, async () => {
        const updated = allTxs.map(tx => {
          const f = flags.get(tx.id);
          return f ? { ...tx, ...f } : tx;
        });
        await db.transactions.bulkPut(updated);
      });
    } finally {
      setBusyRecurring(false);
    }
  };

  return (
    <AnimatePresence initial={false}>
      {insightsPanelOpen && (
        <motion.section
          className="insights-panel"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 480, opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="insights-header">
            <div className="insights-title">Insights</div>
            <div className="insights-actions">
              <select
                className="insights-year"
                value={String(selectedYear)}
                onChange={e => setSelectedYear(parseInt(e.target.value, 10))}
                aria-label="Año"
              >
                {Array.from({ length: 6 }, (_, i) => {
                  const y = new Date().getFullYear() - i;
                  return <option key={y} value={y}>{y}</option>;
                })}
              </select>
              <button className="btn btn-secondary" onClick={() => void runRecurring()} disabled={busyRecurring}>
                {busyRecurring ? 'Detectando…' : 'Detectar recurrentes'}
              </button>
              <button className="btn btn-ghost" onClick={() => setInsightsPanelOpen(false)}>
                Cerrar
              </button>
            </div>
          </div>

          <div className="insights-grid">
            <div className="insight-card">
              <div className="insight-label">Recurrentes detectados</div>
              <div className="insight-value">{recurringGroups.length}</div>
              <div className="insight-sub">Grupos con ≥3 ocurrencias y periodicidad consistente</div>
            </div>

            <div className="insight-card">
              <div className="insight-label">Proyección balance mes</div>
              <div className={`insight-value ${projection.projectedBalanceTotal >= 0 ? 'pos' : 'neg'}`}>
                {projection.projectedBalanceTotal >= 0 ? '+' : ''}{formatCLPCompact(projection.projectedBalanceTotal)}
              </div>
              <div className="insight-sub">
                Ingresos {formatCLPCompact(projection.projectedIncomeTotal)} · Gastos {formatCLPCompact(projection.projectedExpenseTotal)}
              </div>
            </div>

            <div className="insight-card wide">
              <div className="insight-label">Resto del mes (estimado)</div>
              <div className="insight-sub">
                +{formatCLPCompact(projection.projectedIncomeRemaining)} ingresos · −{formatCLPCompact(projection.projectedExpenseRemaining)} gastos
              </div>
            </div>
          </div>

          <div className="insights-content">
            <Heatmap year={selectedYear} allTxs={allTxs} />
            <Charts month={month} monthTxs={monthTxs} allTxs={allTxs} categoriesById={categoryMap} />
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
