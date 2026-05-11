import Dexie, { type EntityTable } from 'dexie';
import type { Transaction, Category, Tag, Rule, Budget, SavedView, Meta } from './schema';

class PlanillaDB extends Dexie {
  transactions!: EntityTable<Transaction, 'id'>;
  categories!:   EntityTable<Category,   'id'>;
  tags!:         EntityTable<Tag,        'id'>;
  rules!:        EntityTable<Rule,       'id'>;
  budgets!:      EntityTable<Budget,     'id'>;
  savedViews!:   EntityTable<SavedView,  'id'>;
  meta!:         EntityTable<Meta,       'key'>;

  constructor() {
    super('planilla');

    this.version(1).stores({
      // *tags = multi-entry index (each element in the array is indexed)
      transactions: 'id, date, type, categoryId, *tags, createdAt, [date+categoryId]',
      categories:   'id, name, parentId',
      tags:         'id, name',
      rules:        'id, priority, categoryId, enabled',
      budgets:      'id, categoryId, period',
      savedViews:   'id, name, createdAt',
      meta:         'key',
    });

    this.on('populate', () => this._seed());
  }

  private async _seed() {
    await this.categories.bulkAdd([
      { id: 'cat-supermercado',     name: 'Supermercado',    color: '#34d399', icon: '🛒', parentId: null },
      { id: 'cat-restaurantes',     name: 'Restaurantes',    color: '#fb923c', icon: '🍽️', parentId: null },
      { id: 'cat-transporte',       name: 'Transporte',      color: '#60a5fa', icon: '🚇', parentId: null },
      { id: 'cat-salud',            name: 'Salud',           color: '#f87171', icon: '🏥', parentId: null },
      { id: 'cat-farmacia',         name: 'Farmacia',        color: '#a78bfa', icon: '💊', parentId: null },
      { id: 'cat-entretenimiento',  name: 'Entretenimiento', color: '#fbbf24', icon: '🎮', parentId: null },
      { id: 'cat-ropa',             name: 'Ropa',            color: '#ec4899', icon: '👕', parentId: null },
      { id: 'cat-servicios',        name: 'Servicios',       color: '#94a3b8', icon: '📦', parentId: null },
      { id: 'cat-arriendo',         name: 'Arriendo',        color: '#f59e0b', icon: '🏠', parentId: null },
      { id: 'cat-educacion',        name: 'Educación',       color: '#4ade80', icon: '📚', parentId: null },
      { id: 'cat-sueldo',           name: 'Sueldo',          color: '#22d3ee', icon: '💰', parentId: null },
      { id: 'cat-otro',             name: 'Otro',            color: '#6b7280', icon: '📌', parentId: null },
    ]);
  }
}

export const db = new PlanillaDB();
