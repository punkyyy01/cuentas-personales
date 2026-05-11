'use client';

import { useMemo } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { addMonths, parseISO } from 'date-fns';
import type { Category, Transaction } from '@/lib/db/schema';
import { formatCLPCompact } from '@/lib/format';

interface Props {
  month: string; // YYYY-MM
  monthTxs: Transaction[];
  allTxs: Transaction[];
  categoriesById: Record<string, Category>;
}

function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('es-CL', { month: 'short' });
}

function categorySpend(txs: Transaction[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const tx of txs) {
    if (tx.type !== 'expense') continue;
    if (tx.splits && tx.splits.length > 0) {
      for (const s of tx.splits) {
        out[s.categoryId] = (out[s.categoryId] ?? 0) + s.amount;
      }
    } else if (tx.categoryId) {
      out[tx.categoryId] = (out[tx.categoryId] ?? 0) + tx.amount;
    } else {
      out['(sin)'] = (out['(sin)'] ?? 0) + tx.amount;
    }
  }
  return out;
}

export default function Charts({ month, monthTxs, allTxs, categoriesById }: Props) {
  const pieData = useMemo(() => {
    const byCat = categorySpend(monthTxs);
    const rows = Object.entries(byCat)
      .map(([categoryId, value]) => {
        const cat = categoriesById[categoryId];
        return {
          id: categoryId,
          name: cat ? `${cat.icon} ${cat.name}` : categoryId === '(sin)' ? 'Sin categoría' : categoryId,
          value,
          color: cat?.color ?? 'var(--text-3)',
        };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
    return rows;
  }, [monthTxs, categoriesById]);

  const series = useMemo(() => {
    const base = parseISO(`${month}-01`);
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = addMonths(base, -i);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }

    const rows = months.map(m => {
      let income = 0;
      let expense = 0;
      for (const tx of allTxs) {
        if (tx.date.slice(0, 7) !== m) continue;
        if (tx.type === 'income') income += tx.amount;
        else if (tx.type === 'expense') expense += tx.amount;
      }
      return {
        month: monthLabel(m),
        income,
        expense,
        balance: income - expense,
      };
    });

    return rows;
  }, [allTxs, month]);

  return (
    <div className="charts">
      <div className="chart-card">
        <div className="chart-title">Gastos por categoría (mes)</div>
        <div className="chart-body">
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={2}>
                {pieData.map(d => (
                  <Cell key={d.id} fill={d.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: unknown) => {
                  const n = typeof value === 'number' ? value : 0;
                  return formatCLPCompact(n);
                }}
                contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 10, color: 'var(--text-1)' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="chart-card">
        <div className="chart-title">Evolución (6 meses)</div>
        <div className="chart-body">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={series} margin={{ left: 8, right: 8 }}>
              <XAxis dataKey="month" tick={{ fill: 'var(--text-3)', fontSize: 12 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} />
              <YAxis hide />
              <Tooltip
                formatter={(value: unknown, name: unknown) => {
                  const n = typeof value === 'number' ? value : 0;
                  const label = name === 'income' ? 'Ingresos' : name === 'expense' ? 'Gastos' : 'Balance';
                  return [formatCLPCompact(n), label];
                }}
                contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 10, color: 'var(--text-1)' }}
              />
              <Bar dataKey="income" fill="var(--success)" radius={[6, 6, 0, 0]} />
              <Bar dataKey="expense" fill="var(--expense)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
