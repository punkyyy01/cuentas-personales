'use client';

import { useMemo, useState } from 'react';
import { startOfYear, endOfYear, eachDayOfInterval, format, getDay } from 'date-fns';
import type { Transaction } from '@/lib/db/schema';
import { formatCLPCompact } from '@/lib/format';

interface Props {
  year: number;
  allTxs: Transaction[];
}

function iso(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

export default function Heatmap({ year, allTxs }: Props) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { cells, max, byDate } = useMemo(() => {
    const start = startOfYear(new Date(year, 0, 1));
    const end = endOfYear(start);
    const days = eachDayOfInterval({ start, end });

    const totals: Record<string, number> = {};
    for (const tx of allTxs) {
      if (tx.type !== 'expense') continue;
      if (tx.date.slice(0, 4) !== String(year)) continue;
      totals[tx.date] = (totals[tx.date] ?? 0) + tx.amount;
    }

    let m = 0;
    for (const v of Object.values(totals)) m = Math.max(m, v);

    const firstDayOfWeek = 0; // Sunday
    const startDow = (getDay(start) - firstDayOfWeek + 7) % 7;

    const grid: { date: string; level: number; amount: number }[] = [];
    for (let i = 0; i < startDow; i++) grid.push({ date: '', level: 0, amount: 0 });

    for (const d of days) {
      const date = iso(d);
      const amount = totals[date] ?? 0;
      const level = m === 0 ? 0 : amount === 0 ? 0 : amount > m * 0.75 ? 4 : amount > m * 0.5 ? 3 : amount > m * 0.25 ? 2 : 1;
      grid.push({ date, level, amount });
    }

    const tail = grid.length % 7;
    if (tail !== 0) {
      for (let i = 0; i < 7 - tail; i++) grid.push({ date: '', level: 0, amount: 0 });
    }

    return { cells: grid, max: m, byDate: totals };
  }, [year, allTxs]);

  const selectedTxs = useMemo(() => {
    if (!selectedDate) return [];
    return allTxs.filter(t => t.date === selectedDate);
  }, [allTxs, selectedDate]);

  return (
    <div className="heatmap">
      <div className="heatmap-header">
        <div className="heatmap-title">Heatmap {year}</div>
        <div className="heatmap-sub">Máx día: {formatCLPCompact(max)}</div>
      </div>

      <div className="heatmap-grid" role="grid" aria-label={`Heatmap ${year}`}>
        {cells.map((c, idx) => (
          <button
            key={c.date || `blank-${idx}`}
            className={`heatmap-cell lvl-${c.level}${c.date && selectedDate === c.date ? ' selected' : ''}${c.date ? '' : ' blank'}`}
            onClick={() => c.date && setSelectedDate(c.date)}
            title={c.date ? `${c.date} · ${formatCLPCompact(c.amount)}` : ''}
            disabled={!c.date}
          />
        ))}
      </div>

      {selectedDate && (
        <div className="heatmap-drill">
          <div className="heatmap-drill-title">
            {selectedDate} · {formatCLPCompact(byDate[selectedDate] ?? 0)}
          </div>
          <div className="heatmap-drill-list">
            {selectedTxs.length === 0 ? (
              <div className="sidebar-empty-hint">Sin transacciones</div>
            ) : (
              selectedTxs.slice(0, 8).map(tx => (
                <div key={tx.id} className="heatmap-drill-row">
                  <span className="mono">{formatCLPCompact(tx.type === 'income' ? tx.amount : -tx.amount)}</span>
                  <span className="muted">{tx.description || '—'}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
