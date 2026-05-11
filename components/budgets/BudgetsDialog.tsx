'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Dialog from '@/components/ui/Dialog';
import { db } from '@/lib/db/index';
import { addBudget, updateBudget, deleteBudget } from '@/lib/db/queries';
import type { Budget, BudgetPeriod, Category, Transaction } from '@/lib/db/schema';
import { monthRange, formatCLPCompact } from '@/lib/format';

interface Props {
  month: string;
  onClose: () => void;
}

const PERIODS: BudgetPeriod[] = ['monthly', 'weekly', 'yearly'];

function labelPeriod(p: BudgetPeriod): string {
  return p === 'monthly' ? 'Mensual' : p === 'weekly' ? 'Semanal' : 'Anual';
}

function spentByCategory(txs: Transaction[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const tx of txs) {
    if (tx.type !== 'expense') continue;
    if (tx.splits && tx.splits.length > 0) {
      for (const s of tx.splits) {
        out[s.categoryId] = (out[s.categoryId] ?? 0) + s.amount;
      }
    } else if (tx.categoryId) {
      out[tx.categoryId] = (out[tx.categoryId] ?? 0) + tx.amount;
    }
  }
  return out;
}

export default function BudgetsDialog({ month, onClose }: Props) {
  const budgets = useLiveQuery(
    () => db.budgets.toArray(),
    [],
    [] as Budget[]
  );

  const categories = useLiveQuery(
    () => db.categories.orderBy('name').toArray(),
    [],
    [] as Category[]
  );

  const txs = useLiveQuery(() => {
    const { from, to } = monthRange(month);
    return db.transactions.where('date').between(from, to, true, true).toArray();
  }, [month], [] as Transaction[]);

  const spent = useMemo(() => spentByCategory(txs), [txs]);

  const [catId, setCatId] = useState('');
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState<BudgetPeriod>('monthly');
  const [busy, setBusy] = useState(false);

  const canAdd = !!catId && parseInt(amount, 10) > 0;

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    const n = parseInt(amount.replace(/[^0-9]/g, ''), 10);
    if (!catId || !n || n <= 0) return;
    setBusy(true);
    try {
      await addBudget({
        categoryId: catId,
        amount: n,
        period,
        startDate: `${month}-01`,
      });
      setAmount('');
    } finally {
      setBusy(false);
    }
  };

  const catById = useMemo(() => Object.fromEntries(categories.map(c => [c.id, c])), [categories]);

  return (
    <Dialog title="Presupuestos" onClose={onClose} width={720}>
      <div className="dialog-body">
        <form onSubmit={handleAdd} className="split-row" style={{ gridTemplateColumns: '1fr 150px 150px 120px' }}>
          <select value={catId} onChange={e => setCatId(e.target.value)}>
            <option value="">Categoría…</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
          </select>
          <input
            value={amount}
            onChange={e => setAmount(e.target.value)}
            type="number"
            min={1}
            step={1}
            placeholder="Monto"
            style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}
          />
          <select value={period} onChange={e => setPeriod(e.target.value as BudgetPeriod)}>
            {PERIODS.map(p => (
              <option key={p} value={p}>{labelPeriod(p)}</option>
            ))}
          </select>
          <button className="btn btn-primary" type="submit" disabled={!canAdd || busy}>
            {busy ? 'Agregando…' : 'Agregar'}
          </button>
        </form>

        <div className="simple-list">
          {budgets.length === 0 ? (
            <div className="sidebar-empty-hint">Sin presupuestos todavía</div>
          ) : (
            budgets.map(b => {
              const cat = catById[b.categoryId];
              const s = spent[b.categoryId] ?? 0;
              const pct = b.amount > 0 ? Math.min(100, Math.round((s / b.amount) * 100)) : 0;
              return (
                <div className="budget-row" key={b.id}>
                  <div className="budget-main">
                    <div className="budget-title">{cat ? `${cat.icon} ${cat.name}` : b.categoryId}</div>
                    <div className="budget-sub">{formatCLPCompact(s)} / {formatCLPCompact(b.amount)} · {pct}%</div>
                    <div className="budget-bar">
                      <div className="budget-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>

                  <div className="budget-actions">
                    <select value={b.period} onChange={e => void updateBudget(b.id, { period: e.target.value as BudgetPeriod })}>
                      {PERIODS.map(p => (
                        <option key={p} value={p}>{labelPeriod(p)}</option>
                      ))}
                    </select>
                    <input
                      className="inline-input short"
                      type="number"
                      min={1}
                      step={1}
                      value={String(b.amount)}
                      onChange={e => void updateBudget(b.id, { amount: parseInt(e.target.value || '0', 10) || 0 })}
                    />
                    <button className="btn btn-danger" type="button" onClick={() => void deleteBudget(b.id)}>
                      Eliminar
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Dialog>
  );
}
