'use client';

import '@glideapps/glide-data-grid/dist/index.css';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  EditableGridCell,
  GridCell,
  GridMouseEventArgs,
  Item,
  Theme,
} from '@glideapps/glide-data-grid';
import { GridCellKind } from '@glideapps/glide-data-grid';
import { format, parse, isValid } from 'date-fns';
import { addTransaction, updateTransaction, deleteTransaction, restoreTransaction } from '@/lib/db/queries';
import { formatCLP, formatDate, monthRange } from '@/lib/format';
import { COLUMNS, COL } from './columns';
import SplitDialog from './SplitDialog';
import type { UndoableOp } from '@/hooks/useUndoRedo';
import type { Transaction, Category, Tag } from '@/lib/db/schema';

const DataEditor = dynamic(
  async () => (await import('@glideapps/glide-data-grid')).DataEditor,
  {
    ssr: false,
    loading: () => <div className="grid-loading"><span className="spinner" /></div>,
  }
);

// ─── Theme ────────────────────────────────────────────────────────────────────

const THEME: Partial<Theme> = {
  bgCell:              '#0d0d12',
  bgCellMedium:        '#13131a',
  bgHeader:            '#09090d',
  bgHeaderHasFocus:    '#16161f',
  bgHeaderHovered:     '#14141c',
  textHeader:          '#6b6b8a',
  textHeaderSelected:  '#ffffff',
  textDark:            '#dddde8',
  textMedium:          '#8484a4',
  textLight:           '#52526a',
  textBubble:          '#dddde8',
  bgBubble:            '#1e1e2a',
  bgBubbleSelected:    '#6e56cf',
  accentColor:         '#6e56cf',
  accentFg:            '#ffffff',
  accentLight:         'rgba(110, 86, 207, 0.14)',
  borderColor:         '#1e1e2a',
  drilldownBorder:     '#6e56cf',
  linkColor:           '#a78bfa',
  headerFontStyle:     '500 11px',
  baseFontStyle:       '13px',
  editorFontSize:      '13px',
  fontFamily:          'var(--font-mono, "JetBrains Mono", monospace)',
  cellHorizontalPadding: 10,
  cellVerticalPadding:   4,
  lineHeight:            1.4,
  headerIconSize:        14,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDate(raw: string): string | null {
  let d = parse(raw.trim(), 'dd/MM/yyyy', new Date());
  if (!isValid(d)) d = parse(raw.trim(), 'yyyy-MM-dd', new Date());
  return isValid(d) ? format(d, 'yyyy-MM-dd') : null;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  month:    string;        // 'YYYY-MM'
  pushUndo: (op: UndoableOp) => void;
  transactions: Transaction[];
  categoryMap:  Record<string, Category>;
  tagMap:       Record<string, Tag>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TransactionGrid({ month, pushUndo, transactions, categoryMap, tagMap }: Props) {
  const { from, to } = monthRange(month);
  const categories = Object.values(categoryMap).sort((a, b) => a.name.localeCompare(b.name));

  // ── Size ──────────────────────────────────────────────────────────────────
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 500 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    ro.observe(el);
    setSize({ width: el.clientWidth || 800, height: el.clientHeight || 500 });
    return () => ro.disconnect();
  }, []);

  // ── getCellContent ────────────────────────────────────────────────────────
  const getCellContent = useCallback(([col, row]: Item): GridCell => {
    const tx = transactions[row];
    if (!tx) return { kind: GridCellKind.Text, data: '', displayData: '', allowOverlay: false };

    switch (col) {
      case COL.DATE:
        return {
          kind: GridCellKind.Text,
          data: tx.date,
          displayData: formatDate(tx.date),
          allowOverlay: true,
        };

      case COL.DESCRIPTION:
        return {
          kind: GridCellKind.Text,
          data: tx.description,
          displayData: tx.description + (tx.isRecurring ? '  ⟲' : ''),
          allowOverlay: true,
        };

      case COL.AMOUNT:
        return {
          kind: GridCellKind.Text,
          data: tx.amount === 0 ? '' : String(tx.amount),
          displayData: tx.amount === 0 ? '' : (tx.type === 'income' ? '+' : '−') + formatCLP(tx.amount),
          allowOverlay: true,
          themeOverride: {
            textDark: tx.type === 'income' ? '#2dba77' : '#f87171',
          },
        };

      case COL.TYPE:
        return {
          kind: GridCellKind.Text,
          data: tx.type,
          displayData: tx.type === 'income' ? 'Ingreso' : tx.type === 'expense' ? 'Gasto' : 'Traspaso',
          allowOverlay: true,
        };

      case COL.CATEGORY:
        if (tx.splits && tx.splits.length > 0) {
          return {
            kind: GridCellKind.Text,
            data: 'split',
            displayData: `Split (${tx.splits.length})`,
            allowOverlay: true,
            themeOverride: { textDark: '#a78bfa' },
          };
        }
        return {
          kind: GridCellKind.Text,
          data: tx.categoryId ?? '',
          displayData: tx.categoryId ? (categoryMap[tx.categoryId]?.name ?? '') : '',
          allowOverlay: true,
        };

      case COL.TAGS:
        return {
          kind: GridCellKind.Text,
          data: tx.tags.join(','),
          displayData: tx.tags.map(id => tagMap[id]?.name ?? id).join(', '),
          allowOverlay: true,
        };

      case COL.NOTES:
        return {
          kind: GridCellKind.Text,
          data: tx.notes,
          displayData: tx.notes,
          allowOverlay: true,
        };

      default:
        return { kind: GridCellKind.Text, data: '', displayData: '', allowOverlay: false };
    }
  }, [transactions, categoryMap, tagMap]);

  // ── onCellEdited ──────────────────────────────────────────────────────────
  const onCellEdited = useCallback(([col, row]: Item, newVal: EditableGridCell) => {
    const tx = transactions[row];
    if (!tx || newVal.kind !== GridCellKind.Text) return;

    const raw  = newVal.data.trim();
    const prev = { ...tx };

    const applyAndUndo = async (patch: Partial<Transaction>) => {
      await updateTransaction(tx.id, patch);
      pushUndo({
        description: `Editar ${Object.keys(patch).join(', ')}`,
        redo: () => updateTransaction(tx.id, patch),
        undo: () => updateTransaction(
          tx.id,
          Object.fromEntries(
            Object.keys(patch).map(k => [k, prev[k as keyof Transaction]])
          ) as Partial<Transaction>
        ),
      });
    };

    switch (col) {
      case COL.DATE: {
        const d = parseDate(raw);
        if (d) void applyAndUndo({ date: d });
        break;
      }
      case COL.DESCRIPTION:
        if (raw) void applyAndUndo({ description: raw });
        break;

      case COL.AMOUNT: {
        const n = parseInt(raw.replace(/[^0-9]/g, ''), 10);
        if (!isNaN(n) && n > 0) void applyAndUndo({ amount: n });
        break;
      }

      case COL.TYPE: {
        const lc = raw.toLowerCase();
        const type =
          lc === 'ingreso' || lc === 'income'     ? 'income'   :
          lc === 'traspaso' || lc === 'transfer'  ? 'transfer' : 'expense';
        void applyAndUndo({ type });
        break;
      }

      case COL.CATEGORY: {
        const cats = Object.values(categoryMap);
        const match = cats.find(c => c.name.toLowerCase() === raw.toLowerCase());
        if (match) void applyAndUndo({ categoryId: match.id, splits: null });
        else if (raw === '') void applyAndUndo({ categoryId: null, splits: null });
        break;
      }

      case COL.TAGS: {
        const allTags = Object.values(tagMap);
        const names = raw.split(',').map(s => s.trim()).filter(Boolean);
        const ids = names
          .map(n => allTags.find(t => t.name.toLowerCase() === n.toLowerCase())?.id)
          .filter((id): id is string => !!id);
        void applyAndUndo({ tags: ids });
        break;
      }

      case COL.NOTES:
        void applyAndUndo({ notes: raw });
        break;
    }
  }, [transactions, categoryMap, tagMap, pushUndo]);

  // ── onRowAppended — trailing row creates new transaction ──────────────────
  const onRowAppended = useCallback((): void => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const date  = today >= from && today <= to ? today : from;

    void addTransaction({
      date,
      description: '',
      amount: 0,
      type: 'expense',
      categoryId: null,
      tags: [],
      notes: '',
      splits: null,
      isRecurring: false,
      recurringGroupId: null,
    }).then(id => {
      pushUndo({
        description: 'Nueva transacción',
        undo: () => deleteTransaction(id),
        redo: async () => {},
      });
    });
  }, [from, to, pushUndo]);

  // ── Context menu ──────────────────────────────────────────────────────────
  const [menuState, setMenuState] = useState<{ x: number; y: number; row: number } | null>(null);

  const onCellContextMenu = useCallback((cell: Item, event: GridMouseEventArgs) => {
    if (!('bounds' in event)) return;
    const rect = wrapRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
    setMenuState({
      x:   rect.left + event.bounds.x,
      y:   rect.top  + event.bounds.y + event.bounds.height,
      row: cell[1],
    });
  }, []);

  useEffect(() => {
    if (!menuState) return;
    const close = () => setMenuState(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuState]);

  const handleDelete = useCallback(async (row: number) => {
    const tx = transactions[row];
    if (!tx) return;
    const snapshot = { ...tx };
    await deleteTransaction(tx.id);
    pushUndo({
      description: `Eliminar "${tx.description || formatCLP(tx.amount)}"`,
      undo: () => restoreTransaction(snapshot),
      redo: () => deleteTransaction(snapshot.id),
    });
    setMenuState(null);
  }, [transactions, pushUndo]);

  // ── Split dialog ─────────────────────────────────────────────────────────
  const [splitRow, setSplitRow] = useState<number | null>(null);
  const splitTx = splitRow !== null ? transactions[splitRow] : null;

  const saveSplit = useCallback(async (splits: Transaction['splits'] | null) => {
    if (!splitTx) return;
    const prev = { ...splitTx };
    await updateTransaction(splitTx.id, { splits, categoryId: splits ? null : prev.categoryId });
    pushUndo({
      description: splits ? 'Aplicar split' : 'Quitar split',
      redo: () => updateTransaction(splitTx.id, { splits, categoryId: splits ? null : prev.categoryId }),
      undo: () => updateTransaction(splitTx.id, { splits: prev.splits, categoryId: prev.categoryId }),
    });
  }, [splitTx, pushUndo]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div ref={wrapRef} style={{ width: '100%', height: '100%' }}>
      {size.width > 0 && (
        <DataEditor
          width={size.width}
          height={size.height}
          columns={COLUMNS}
          rows={transactions.length}
          getCellContent={getCellContent}
          onCellEdited={onCellEdited}
          onCellContextMenu={onCellContextMenu}
          onRowAppended={onRowAppended}
          trailingRowOptions={{ sticky: true, tint: true, hint: 'Nueva transacción…' }}
          theme={THEME}
          rowMarkers="clickable-number"
          smoothScrollX
          smoothScrollY
          keybindings={{ search: true }}
          headerHeight={36}
          rowHeight={34}
          freezeColumns={0}
          isDraggable={false}
          experimental={{ strict: true }}
        />
      )}

      {menuState && (
        <div
          className="context-menu"
          style={{ position: 'fixed', left: menuState.x, top: menuState.y }}
          onClick={e => e.stopPropagation()}
        >
          <button
            className="context-menu-item"
            onClick={() => {
              setSplitRow(menuState.row);
              setMenuState(null);
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M16 3h5v5" />
              <path d="M21 3l-7 7" />
              <path d="M8 21H3v-5" />
              <path d="M3 21l7-7" />
            </svg>
            Split…
          </button>

          <button
            className="context-menu-item danger"
            onClick={() => void handleDelete(menuState.row)}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14H6L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4h6v2" />
            </svg>
            Eliminar fila
          </button>
        </div>
      )}

      {splitTx && (
        <SplitDialog
          tx={splitTx}
          categories={categories}
          onClose={() => setSplitRow(null)}
          onSave={saveSplit}
        />
      )}
    </div>
  );
}
