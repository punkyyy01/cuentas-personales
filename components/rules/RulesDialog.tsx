'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import Dialog from '@/components/ui/Dialog';
import { db } from '@/lib/db/index';
import { addRule, updateRule, deleteRule } from '@/lib/db/queries';
import type { Category, Rule, RuleField, RuleMatchType, Tag, Transaction } from '@/lib/db/schema';
import { applyRulesToTransaction } from '@/lib/analyzers/rules';

interface Props {
  onClose: () => void;
}

const FIELDS: RuleField[] = ['description', 'amount', 'notes'];
const MATCHES: RuleMatchType[] = ['contains', 'startsWith', 'endsWith', 'equals', 'regex', 'gt', 'lt'];

function labelField(f: RuleField): string {
  return f === 'description' ? 'Descripción' : f === 'amount' ? 'Monto' : 'Notas';
}

export default function RulesDialog({ onClose }: Props) {
  const rules = useLiveQuery(
    () => db.rules.orderBy('priority').reverse().toArray(),
    [],
    [] as Rule[]
  );

  const categories = useLiveQuery(
    () => db.categories.orderBy('name').toArray(),
    [],
    [] as Category[]
  );

  const tags = useLiveQuery(
    () => db.tags.orderBy('name').toArray(),
    [],
    [] as Tag[]
  );

  const tagByName = useMemo(() => {
    const m = new Map<string, Tag>();
    for (const t of tags) m.set(t.name.toLowerCase(), t);
    return m;
  }, [tags]);

  const [newName, setNewName] = useState('');
  const [busyApply, setBusyApply] = useState(false);

  const createRule = async (e: FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    await addRule({
      name,
      field: 'description',
      matchType: 'contains',
      matchValue: '',
      categoryId: null,
      tagIds: [],
      priority: 0,
      enabled: true,
    });
    setNewName('');
  };

  const applyToAll = async () => {
    setBusyApply(true);
    try {
      const allRules = await db.rules.toArray();
      const catsById = Object.fromEntries(categories.map(c => [c.id, c]));
      const tagsById = Object.fromEntries(tags.map(t => [t.id, t]));

      const txs = await db.transactions.toArray();
      const updated: Transaction[] = [];

      for (const tx of txs) {
        const res = applyRulesToTransaction(tx, allRules, catsById, tagsById);
        const changed = res.categoryId !== tx.categoryId || res.tagIds.join('|') !== tx.tags.join('|');
        if (changed) updated.push({ ...tx, categoryId: res.categoryId, tags: res.tagIds });
      }

      if (updated.length > 0) {
        await db.transactions.bulkPut(updated);
      }
    } finally {
      setBusyApply(false);
    }
  };

  return (
    <Dialog title="Reglas" onClose={onClose} width={860}>
      <div className="dialog-body">
        <div className="rules-top">
          <form onSubmit={createRule} className="rules-new">
            <input
              className="inline-input"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Nombre de la regla…"
              maxLength={60}
            />
            <button className="btn btn-primary" type="submit">Crear</button>
          </form>

          <button className="btn btn-secondary" onClick={() => void applyToAll()} disabled={busyApply}>
            {busyApply ? 'Aplicando…' : 'Aplicar a toda la data'}
          </button>
        </div>

        <div className="rules-list">
          {rules.length === 0 ? (
            <div className="sidebar-empty-hint">Sin reglas todavía</div>
          ) : (
            rules.map(r => (
              <div className="rule-row" key={r.id}>
                <div className="rule-main">
                  <input
                    type="checkbox"
                    checked={r.enabled}
                    onChange={e => void updateRule(r.id, { enabled: e.target.checked })}
                    title="Habilitada"
                  />

                  <input
                    className="inline-input"
                    value={r.name}
                    onChange={e => void updateRule(r.id, { name: e.target.value })}
                  />

                  <select value={r.field} onChange={e => void updateRule(r.id, { field: e.target.value as RuleField })}>
                    {FIELDS.map(f => (
                      <option key={f} value={f}>{labelField(f)}</option>
                    ))}
                  </select>

                  <select value={r.matchType} onChange={e => void updateRule(r.id, { matchType: e.target.value as RuleMatchType })}>
                    {MATCHES.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>

                  <input
                    className="inline-input"
                    value={r.matchValue}
                    onChange={e => void updateRule(r.id, { matchValue: e.target.value })}
                    placeholder={r.matchType === 'regex' ? 'regex' : 'valor'}
                  />
                </div>

                <div className="rule-actions">
                  <label className="mini-label">Prioridad</label>
                  <input
                    className="inline-input short"
                    type="number"
                    value={String(r.priority)}
                    onChange={e => void updateRule(r.id, { priority: parseInt(e.target.value || '0', 10) || 0 })}
                  />

                  <label className="mini-label">Categoría</label>
                  <select
                    value={r.categoryId ?? ''}
                    onChange={e => void updateRule(r.id, { categoryId: e.target.value || null })}
                  >
                    <option value="">(no)</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                    ))}
                  </select>

                  <label className="mini-label">Tags</label>
                  <input
                    className="inline-input"
                    value={r.tagIds.map(id => tags.find(t => t.id === id)?.name ?? id).join(', ')}
                    onChange={e => {
                      const names = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                      const ids = names
                        .map(n => tagByName.get(n.toLowerCase())?.id)
                        .filter((id): id is string => !!id);
                      void updateRule(r.id, { tagIds: ids });
                    }}
                    placeholder="ej. uber, comida"
                  />

                  <button className="btn btn-danger" type="button" onClick={() => void deleteRule(r.id)}>
                    Eliminar
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Dialog>
  );
}
