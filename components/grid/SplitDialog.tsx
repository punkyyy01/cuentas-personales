'use client';

import { useMemo, useState, type FormEvent } from 'react';
import Dialog from '@/components/ui/Dialog';
import type { Category, Split, Transaction } from '@/lib/db/schema';

interface Props {
  tx: Transaction;
  categories: Category[];
  onClose: () => void;
  onSave: (splits: Split[] | null) => Promise<void>;
}

function sumAmounts(splits: Split[]): number {
  return splits.reduce((acc, s) => acc + (Number.isFinite(s.amount) ? s.amount : 0), 0);
}

export default function SplitDialog({ tx, categories, onClose, onSave }: Props) {
  const initial = useMemo<Split[]>(() => {
    if (tx.splits && tx.splits.length > 0) return tx.splits;
    const fallbackCat = tx.categoryId ?? categories[0]?.id ?? 'cat-otro';
    return [{ categoryId: fallbackCat, amount: tx.amount, notes: '' }];
  }, [tx, categories]);

  const [rows, setRows] = useState<Split[]>(initial);
  const [busy, setBusy] = useState(false);

  const total = sumAmounts(rows);
  const ok = total === tx.amount && rows.every(r => r.categoryId && r.amount > 0);

  const addRow = () => {
    const cat = categories[0]?.id ?? 'cat-otro';
    setRows(r => [...r, { categoryId: cat, amount: 0, notes: '' }]);
  };

  const removeRow = (idx: number) => {
    setRows(r => r.filter((_, i) => i !== idx));
  };

  const updateRow = (idx: number, patch: Partial<Split>) => {
    setRows(r => r.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    try {
      await onSave(rows);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title={`Split · ${tx.description || 'Transacción'}`} onClose={onClose} width={620}>
      <form className="dialog-body" onSubmit={handleSubmit}>
        <div className="split-hint">
          Monto total: <b>{tx.amount.toLocaleString('es-CL')}</b> · Suma: <b className={ok ? 'ok' : 'bad'}>{total.toLocaleString('es-CL')}</b>
        </div>

        <div className="split-table">
          {rows.map((s, idx) => (
            <div className="split-row" key={idx}>
              <select
                value={s.categoryId}
                onChange={e => updateRow(idx, { categoryId: e.target.value })}
              >
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                ))}
              </select>

              <input
                type="number"
                min={1}
                step={1}
                value={String(s.amount)}
                onChange={e => updateRow(idx, { amount: parseInt(e.target.value || '0', 10) || 0 })}
                style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}
              />

              <input
                type="text"
                placeholder="Notas (opcional)"
                value={s.notes}
                onChange={e => updateRow(idx, { notes: e.target.value })}
              />

              <button type="button" className="btn btn-icon" onClick={() => removeRow(idx)} aria-label="Quitar">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M18 6L6 18" />
                  <path d="M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        <div className="split-actions">
          <button type="button" className="btn btn-secondary" onClick={addRow}>Agregar línea</button>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn btn-ghost" onClick={() => void onSave(null).then(onClose)}>
            Quitar split
          </button>
          <button type="submit" className="btn btn-primary" disabled={!ok || busy}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
         </div>
       </form>
     </Dialog>
   );
 }
