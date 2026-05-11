'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Dialog from '@/components/ui/Dialog';
import { db } from '@/lib/db/index';
import { addCategory, updateCategory, deleteCategory } from '@/lib/db/queries';
import type { Category } from '@/lib/db/schema';

interface Props {
  onClose: () => void;
}

export default function CategoriesDialog({ onClose }: Props) {
  const categories = useLiveQuery(
    () => db.categories.orderBy('name').toArray(),
    [],
    [] as Category[]
  );

  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📌');
  const [color, setColor] = useState('#6e56cf');
  const [busy, setBusy] = useState(false);

  const canAdd = name.trim().length > 0;

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!canAdd) return;
    setBusy(true);
    try {
      await addCategory({ name: name.trim(), icon: icon.trim() || '📌', color, parentId: null });
      setName('');
    } finally {
      setBusy(false);
    }
  };

  const idsInUse = useMemo(() => new Set(categories.map(c => c.id)), [categories]);

  return (
    <Dialog title="Categorías" onClose={onClose} width={640}>
      <div className="dialog-body">
        <form className="split-row" onSubmit={handleAdd} style={{ gridTemplateColumns: '1fr 90px 120px 120px' }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre" maxLength={40} />
          <input value={icon} onChange={e => setIcon(e.target.value)} placeholder="Icon" maxLength={3} />
          <input type="color" value={color} onChange={e => setColor(e.target.value)} title="Color" />
          <button className="btn btn-primary" type="submit" disabled={!canAdd || busy}>
            {busy ? 'Agregando…' : 'Agregar'}
          </button>
        </form>

        <div className="simple-list">
          {categories.map(c => (
            <div className="simple-row" key={c.id}>
              <div className="simple-left">
                <span className="pill" style={{ background: c.color }}>{c.icon}</span>
                <input
                  className="inline-input"
                  value={c.name}
                  onChange={e => void updateCategory(c.id, { name: e.target.value })}
                />
              </div>

              <div className="simple-right">
                <input
                  type="color"
                  value={c.color}
                  onChange={e => void updateCategory(c.id, { color: e.target.value })}
                  title="Color"
                />
                <input
                  className="inline-input short"
                  value={c.icon}
                  onChange={e => void updateCategory(c.id, { icon: e.target.value })}
                />
                <button
                  className="btn btn-danger"
                  type="button"
                  onClick={() => void deleteCategory(c.id)}
                  disabled={!idsInUse.has(c.id)}
                  title="Eliminar"
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Dialog>
  );
}
