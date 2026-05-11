'use client';

import { useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Dialog from '@/components/ui/Dialog';
import { db } from '@/lib/db/index';
import { addTag, updateTag, deleteTag } from '@/lib/db/queries';
import type { Tag } from '@/lib/db/schema';

interface Props {
  onClose: () => void;
}

export default function TagsDialog({ onClose }: Props) {
  const tags = useLiveQuery(
    () => db.tags.orderBy('name').toArray(),
    [],
    [] as Tag[]
  );

  const [name, setName] = useState('');
  const [color, setColor] = useState('#8470f5');
  const [busy, setBusy] = useState(false);

  const canAdd = name.trim().length > 0;

  const handleAdd = async (e: FormEvent) => {
    e.preventDefault();
    if (!canAdd) return;
    setBusy(true);
    try {
      await addTag({ name: name.trim(), color });
      setName('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="Tags" onClose={onClose} width={600}>
      <div className="dialog-body">
        <form className="split-row" onSubmit={handleAdd} style={{ gridTemplateColumns: '1fr 120px 120px' }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre" maxLength={30} />
          <input type="color" value={color} onChange={e => setColor(e.target.value)} title="Color" />
          <button className="btn btn-primary" type="submit" disabled={!canAdd || busy}>
            {busy ? 'Agregando…' : 'Agregar'}
          </button>
        </form>

        <div className="simple-list">
          {tags.map(t => (
            <div className="simple-row" key={t.id}>
              <div className="simple-left">
                <span className="pill" style={{ background: t.color }} />
                <input
                  className="inline-input"
                  value={t.name}
                  onChange={e => void updateTag(t.id, { name: e.target.value })}
                />
              </div>

              <div className="simple-right">
                <input
                  type="color"
                  value={t.color}
                  onChange={e => void updateTag(t.id, { color: e.target.value })}
                  title="Color"
                />
                <button className="btn btn-danger" type="button" onClick={() => void deleteTag(t.id)}>
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
