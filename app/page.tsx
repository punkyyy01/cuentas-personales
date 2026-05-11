'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/index';
import { useUIStore } from '@/store/ui';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { monthRange } from '@/lib/format';
import { filterTransactions } from '@/lib/search/query';
import { makeBackup, parseBackup } from '@/lib/backup';
import { restoreFromBackup } from '@/lib/db/queries';
import type { Transaction, Category, Tag } from '@/lib/db/schema';
import Sidebar from '@/components/shell/Sidebar';
import Topbar, { type PeriodStats } from '@/components/shell/Topbar';

const TransactionGrid = dynamic(
  () => import('@/components/grid/TransactionGrid'),
  { ssr: false, loading: () => <div className="grid-loading"><span className="spinner" /></div> }
);

const QuickAdd = dynamic(
  () => import('@/components/ui/QuickAdd'),
  { ssr: false }
);

const InsightsPanel = dynamic(
  () => import('@/components/insights/InsightsPanel'),
  { ssr: false }
);

const CommandPalette = dynamic(
  () => import('@/components/command-palette/CommandPalette'),
  { ssr: false }
);

const RulesDialog = dynamic(
  () => import('@/components/rules/RulesDialog'),
  { ssr: false }
);

const BudgetsDialog = dynamic(
  () => import('@/components/budgets/BudgetsDialog'),
  { ssr: false }
);

const CategoriesDialog = dynamic(
  () => import('@/components/rules/CategoriesDialog'),
  { ssr: false }
);

const TagsDialog = dynamic(
  () => import('@/components/rules/TagsDialog'),
  { ssr: false }
);

const SaveViewDialog = dynamic(
  () => import('@/components/saved-views/SaveViewDialog'),
  { ssr: false }
);

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Home() {
  const {
    selectedMonth,
    setSelectedMonth,
    sidebarCollapsed,
    insightsPanelOpen,
    setInsightsPanelOpen,
    searchQuery,
    setSearchQuery,
  } = useUIStore();
  const { push: pushUndo, undo, redo, canUndo, canRedo } = useUndoRedo();
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [showBudgets, setShowBudgets] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [showSaveView, setShowSaveView] = useState(false);

  const importRef = useRef<HTMLInputElement>(null);

  const exportBackup = useCallback(async () => {
    const [transactions, categories, tags, rules, budgets, savedViews, meta] = await Promise.all([
      db.transactions.toArray(),
      db.categories.toArray(),
      db.tags.toArray(),
      db.rules.toArray(),
      db.budgets.toArray(),
      db.savedViews.toArray(),
      db.meta.toArray(),
    ]);

    const backup = makeBackup({ transactions, categories, tags, rules, budgets, savedViews, meta });
    const json = JSON.stringify(backup, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `planilla-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const requestImportBackup = useCallback(() => {
    importRef.current?.click();
  }, []);

  const onImportFile = useCallback(async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsedJson: unknown = JSON.parse(text);
      const backup = parseBackup(parsedJson);
      await restoreFromBackup(backup.data);
      // Reset UI filters after a restore
      setSearchQuery('');
    } catch (e) {
      console.error(e);
      window.alert('Backup inválido o corrupto.');
    } finally {
      if (importRef.current) importRef.current.value = '';
    }
  }, [setSearchQuery]);

  // Stats for topbar — same period as the grid
  const { from, to } = monthRange(selectedMonth);
  const monthTxs = useLiveQuery(
    () => db.transactions.where('date').between(from, to, true, true).toArray(),
    [from, to],
    [] as Transaction[]
  );

  const categoryMap = useLiveQuery(
    () => db.categories.toArray().then(cats => Object.fromEntries(cats.map(c => [c.id, c]))),
    [],
    {} as Record<string, Category>
  );

  const tagMap = useLiveQuery(
    () => db.tags.toArray().then(tags => Object.fromEntries(tags.map(t => [t.id, t]))),
    [],
    {} as Record<string, Tag>
  );

  const visibleTxs = useMemo(() => {
    const txs = (monthTxs ?? [])
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    return filterTransactions(txs, searchQuery, { categoriesById: categoryMap, tagsById: tagMap });
  }, [monthTxs, searchQuery, categoryMap, tagMap]);

  const stats = useMemo<PeriodStats>(() => {
    let income = 0, expense = 0;
    for (const tx of visibleTxs ?? []) {
      if (tx.type === 'income')  income  += tx.amount;
      else if (tx.type === 'expense') expense += tx.amount;
    }
    return { income, expense, balance: income - expense, count: visibleTxs?.length ?? 0 };
  }, [visibleTxs]);

  // Global keyboard shortcuts
  const handleUndo = useCallback(() => { void undo(); }, [undo]);
  const handleRedo = useCallback(() => { void redo(); }, [redo]);
  useKeyboardShortcuts({
    onUndo: handleUndo,
    onRedo: handleRedo,
    onCommandPalette: () => setShowCommandPalette(true),
  });

  // N / Ctrl+N → quick-add (only when no input is focused and no dialog open)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isN = e.key === 'n' || e.key === 'N';
      const isCtrlN = (e.ctrlKey || e.metaKey) && (e.key === 'n' || e.key === 'N');
      if (!isN && !isCtrlN) return;
      if (e.altKey) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (showQuickAdd) return;
      e.preventDefault();
      setShowQuickAdd(true);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showQuickAdd]);

  // I key → toggle insights
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'i' && e.key !== 'I') return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      setInsightsPanelOpen(!insightsPanelOpen);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [insightsPanelOpen, setInsightsPanelOpen]);

  return (
    <>
      <div className={`app-shell${sidebarCollapsed ? ' sidebar-collapsed' : ''}`}>
        <Sidebar
          onOpenBudgets={() => setShowBudgets(true)}
          onOpenRules={() => setShowRules(true)}
          onOpenCategories={() => setShowCategories(true)}
          onOpenTags={() => setShowTags(true)}
          onSaveView={() => setShowSaveView(true)}
        />

        <div className="main-area">
          <Topbar
            stats={stats}
            onAddTransaction={() => setShowQuickAdd(true)}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={handleUndo}
            onRedo={handleRedo}
            searchQuery={searchQuery}
            onSearchQueryChange={setSearchQuery}
            insightsOpen={insightsPanelOpen}
            onToggleInsights={() => setInsightsPanelOpen(!insightsPanelOpen)}
            onOpenCommandPalette={() => setShowCommandPalette(true)}
          />

          <div className="grid-area">
            <TransactionGrid
              month={selectedMonth}
              pushUndo={pushUndo}
              transactions={visibleTxs}
              categoryMap={categoryMap}
              tagMap={tagMap}
            />
          </div>

          <InsightsPanel
            month={selectedMonth}
            monthTxs={monthTxs}
            categoryMap={categoryMap}
          />
        </div>
      </div>

      <AnimatePresence>
        {showQuickAdd && (
          <QuickAdd
            key="quick-add"
            onClose={() => setShowQuickAdd(false)}
            defaultMonth={selectedMonth}
            pushUndo={pushUndo}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showRules && <RulesDialog onClose={() => setShowRules(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {showBudgets && <BudgetsDialog month={selectedMonth} onClose={() => setShowBudgets(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {showCategories && <CategoriesDialog onClose={() => setShowCategories(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {showTags && <TagsDialog onClose={() => setShowTags(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {showSaveView && <SaveViewDialog searchQuery={searchQuery} onClose={() => setShowSaveView(false)} />}
      </AnimatePresence>

      <CommandPalette
        open={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        commands={[
          { id: 'new', title: 'Nueva transacción', shortcut: 'N', run: () => setShowQuickAdd(true) },
          { id: 'insights', title: insightsPanelOpen ? 'Cerrar insights' : 'Abrir insights', shortcut: 'I', run: () => setInsightsPanelOpen(!insightsPanelOpen) },
          { id: 'rules', title: 'Reglas', shortcut: 'Ctrl+R', run: () => setShowRules(true) },
          { id: 'budgets', title: 'Presupuestos', shortcut: 'Ctrl+B', run: () => setShowBudgets(true) },
          { id: 'cats', title: 'Categorías', run: () => setShowCategories(true) },
          { id: 'tags', title: 'Tags', run: () => setShowTags(true) },
          { id: 'save-view', title: 'Guardar vista', run: () => setShowSaveView(true) },
          { id: 'backup-export', title: 'Exportar backup (.json)', run: () => void exportBackup() },
          { id: 'backup-import', title: 'Importar backup (.json)', run: () => requestImportBackup() },
          {
            id: 'prev',
            title: 'Mes anterior',
            shortcut: '←',
            run: () => {
              const [y, m] = selectedMonth.split('-').map(Number);
              const d = new Date(y, m - 2, 1);
              setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
            },
          },
          {
            id: 'next',
            title: 'Mes siguiente',
            shortcut: '→',
            run: () => {
              const [y, m] = selectedMonth.split('-').map(Number);
              const d = new Date(y, m, 1);
              setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
            },
          },
        ]}
      />

      <input
        ref={importRef}
        type="file"
        accept="application/json,.json"
        style={{ display: 'none' }}
        onChange={e => void onImportFile(e.target.files?.[0] ?? null)}
      />
    </>
  );
}
