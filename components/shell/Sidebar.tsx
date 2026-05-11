'use client';

import { useUIStore } from '@/store/ui';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/index';
import type { SavedView } from '@/lib/db/schema';
import { deleteSavedView } from '@/lib/db/queries';

interface Props {
  onOpenBudgets: () => void;
  onOpenRules: () => void;
  onOpenCategories: () => void;
  onOpenTags: () => void;
  onSaveView: () => void;
}

export default function Sidebar({ onOpenBudgets, onOpenRules, onOpenCategories, onOpenTags, onSaveView }: Props) {
  const {
    sidebarCollapsed,
    setSidebarCollapsed,
    activeView,
    setActiveView,
    setSearchQuery,
  } = useUIStore();

  const savedViews = useLiveQuery(
    () => db.savedViews.orderBy('createdAt').reverse().toArray(),
    [],
    [] as SavedView[]
  );

  return (
    <aside className={`sidebar${sidebarCollapsed ? ' collapsed' : ''}`}>
      <div className="sidebar-header">
        {!sidebarCollapsed && <span className="sidebar-logo">Planilla</span>}
        <button
          className="btn btn-icon"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          aria-label={sidebarCollapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
          title={sidebarCollapsed ? 'Expandir' : 'Colapsar'}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            {sidebarCollapsed
              ? <><path d="M6 4l4 4-4 4" /></>
              : <><path d="M10 4L6 8l4 4" /></>
            }
          </svg>
        </button>
      </div>

      {!sidebarCollapsed && (
        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Vistas</div>
          {savedViews.length === 0 ? (
            <div className="sidebar-empty-hint">Sin vistas guardadas</div>
          ) : (
            savedViews.map(v => (
              <div key={v.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  className={`sidebar-item${activeView === v.id ? ' active' : ''}`}
                  onClick={() => {
                    setActiveView(v.id);
                    setSearchQuery(v.filters.search ?? '');
                  }}
                  title={v.filters.search ?? ''}
                >
                  {v.name}
                </button>
                <button
                  className="btn btn-icon"
                  onClick={() => void deleteSavedView(v.id)}
                  aria-label="Eliminar vista"
                  title="Eliminar"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="1" y1="1" x2="11" y2="11" />
                    <line x1="11" y1="1" x2="1" y2="11" />
                  </svg>
                </button>
              </div>
            ))
          )}

          <button className="sidebar-item" onClick={onSaveView}>
            + Guardar vista…
          </button>

          {activeView && (
            <button
              className="sidebar-item"
              onClick={() => {
                setActiveView(null);
                setSearchQuery('');
              }}
            >
              Limpiar vista
            </button>
          )}

          <div className="sidebar-section-label" style={{ marginTop: '1.5rem' }}>Presupuestos</div>
          <button className="sidebar-item" onClick={onOpenBudgets}>
            Abrir presupuestos…
          </button>

          <div className="sidebar-section-label" style={{ marginTop: '1.5rem' }}>Reglas</div>
          <button className="sidebar-item" onClick={onOpenRules}>
            Abrir reglas…
          </button>
          <button className="sidebar-item" onClick={onOpenCategories}>
            Categorías…
          </button>
          <button className="sidebar-item" onClick={onOpenTags}>
            Tags…
          </button>
        </nav>
      )}
    </aside>
  );
}
