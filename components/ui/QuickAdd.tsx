'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import Dialog from './Dialog';
import { db } from '@/lib/db/index';
import { addTransaction, deleteTransaction } from '@/lib/db/queries';
import { formatCLP } from '@/lib/format';
import type { TransactionType } from '@/lib/db/schema';
import type { UndoableOp } from '@/hooks/useUndoRedo';

interface Props {
  onClose:      () => void;
  defaultMonth: string;   // 'YYYY-MM'
  pushUndo:     (op: UndoableOp) => void;
}

export default function QuickAdd({ onClose, defaultMonth, pushUndo }: Props) {
  const today = format(new Date(), 'yyyy-MM-dd');
  const defaultDate = today.slice(0, 7) === defaultMonth ? today : `${defaultMonth}-01`;

  const [type,   setType]   = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [desc,   setDesc]   = useState('');
  const [catId,  setCatId]  = useState('');
  const [date,   setDate]   = useState(defaultDate);
  const [busy,   setBusy]   = useState(false);

  const amountRef = useRef<HTMLInputElement>(null);
  const categories = useLiveQuery(() => db.categories.orderBy('name').toArray(), [], []);

  useEffect(() => {
    // rAF ensures element is mounted before focusing
    requestAnimationFrame(() => amountRef.current?.focus());
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(amount.replace(/[^0-9]/g, ''), 10);
    if (!parsed || parsed <= 0) return;

    setBusy(true);
    try {
      const id = await addTransaction({
        date,
        description: desc.trim(),
        amount:      parsed,
        type,
        categoryId:  catId || null,
        tags:        [],
        notes:       '',
        splits:      null,
        isRecurring: false,
        recurringGroupId: null,
      });
      pushUndo({
        description: `Nueva "${desc.trim() || formatCLP(parsed)}"`,
        undo: () => deleteTransaction(id),
        redo: async () => {},
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="Nueva transacción" onClose={onClose} width={440}>
      <form className="dialog-body" onSubmit={handleSubmit}>

        {/* Type toggle */}
        <div className="type-toggle">
          {(['expense', 'income', 'transfer'] as TransactionType[]).map(t => (
            <button
              key={t}
              type="button"
              className={`type-btn ${t}${type === t ? ' active' : ''}`}
              onClick={() => setType(t)}
            >
              {t === 'expense' ? 'Gasto' : t === 'income' ? 'Ingreso' : 'Traspaso'}
            </button>
          ))}
        </div>

        <div className="field-row">
          <div className="field" style={{ flex: '1 1 160px' }}>
            <label htmlFor="qa-amount">Monto (CLP)</label>
            <input
              ref={amountRef}
              id="qa-amount"
              type="number"
              min="1"
              step="1"
              placeholder="0"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              required
              style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums' }}
            />
          </div>
          <div className="field" style={{ flex: '1 1 130px' }}>
            <label htmlFor="qa-date">Fecha</label>
            <input
              id="qa-date"
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="qa-desc">Descripción</label>
          <input
            id="qa-desc"
            placeholder="ej. Almuerzo, Netflix, Uber..."
            value={desc}
            onChange={e => setDesc(e.target.value)}
            maxLength={200}
          />
        </div>

        <div className="field">
          <label htmlFor="qa-cat">Categoría</label>
          <select id="qa-cat" value={catId} onChange={e => setCatId(e.target.value)}>
            <option value="">Sin categoría</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
          </select>
        </div>

        <div className="dialog-footer">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={busy || !amount}
          >
            {busy ? 'Guardando…' : 'Guardar ↵'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
