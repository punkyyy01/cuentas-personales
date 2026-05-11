'use client';

import { useState, type FormEvent } from 'react';
import Dialog from '@/components/ui/Dialog';
import { addSavedView } from '@/lib/db/queries';

interface Props {
  onClose: () => void;
  searchQuery: string;
}

const DEFAULT_COLUMNS = ['date', 'description', 'amount', 'type', 'category', 'tags', 'notes'];

export default function SaveViewDialog({ onClose, searchQuery }: Props) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try {
      await addSavedView({
        name: n,
        filters: { search: searchQuery.trim() || undefined },
        columns: DEFAULT_COLUMNS,
        sort: { field: 'date', dir: 'desc' },
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog title="Guardar vista" onClose={onClose} width={520}>
      <form className="dialog-body" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="view-name">Nombre</label>
          <input id="view-name" value={name} onChange={e => setName(e.target.value)} placeholder="ej. Uber + transporte" maxLength={40} autoFocus />
        </div>
        <div className="field">
          <label>Query</label>
          <input value={searchQuery} disabled />
        </div>
        <div className="dialog-footer">
          <button className="btn btn-ghost" type="button" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" type="submit" disabled={busy || !name.trim()}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
