// ─── Transaction ──────────────────────────────────────────────────────────────

export type TransactionType = 'expense' | 'income' | 'transfer';

export interface Split {
  categoryId: string;
  amount: number;    // must sum to transaction.amount
  notes: string;
}

export interface Transaction {
  id: string;
  date: string;               // 'YYYY-MM-DD'
  description: string;
  amount: number;             // always positive; type determines sign
  type: TransactionType;
  categoryId: string | null;
  tags: string[];             // tag ids
  notes: string;
  splits: Split[] | null;     // null = not split
  isRecurring: boolean;
  recurringGroupId: string | null;
  createdAt: number;          // Date.now()
}

// ─── Category ─────────────────────────────────────────────────────────────────

export interface Category {
  id: string;
  name: string;
  color: string;        // hex
  icon: string;         // emoji
  parentId: string | null;
}

// ─── Tag ──────────────────────────────────────────────────────────────────────

export interface Tag {
  id: string;
  name: string;
  color: string;        // hex
}

// ─── Rule ─────────────────────────────────────────────────────────────────────

export type RuleField     = 'description' | 'amount' | 'notes';
export type RuleMatchType = 'contains' | 'startsWith' | 'endsWith' | 'equals' | 'regex' | 'gt' | 'lt';

export interface Rule {
  id: string;
  name: string;
  field: RuleField;
  matchType: RuleMatchType;
  matchValue: string;
  categoryId: string | null;
  tagIds: string[];
  priority: number;
  enabled: boolean;
}

// ─── Budget ───────────────────────────────────────────────────────────────────

export type BudgetPeriod = 'monthly' | 'weekly' | 'yearly';

export interface Budget {
  id: string;
  categoryId: string;
  amount: number;
  period: BudgetPeriod;
  startDate: string;    // 'YYYY-MM-DD'
}

// ─── SavedView ────────────────────────────────────────────────────────────────

export interface ViewFilters {
  period?: { from: string; to: string };
  categoryIds?: string[];
  tagIds?: string[];
  types?: TransactionType[];
  search?: string;
  amountMin?: number;
  amountMax?: number;
}

export interface SavedView {
  id: string;
  name: string;
  filters: ViewFilters;
  columns: string[];
  sort: { field: string; dir: 'asc' | 'desc' };
  createdAt: number;
}

// ─── Meta ─────────────────────────────────────────────────────────────────────

export interface Meta {
  key: string;
  value: string;
}

// ─── Insert helpers (without generated fields) ────────────────────────────────

export type NewTransaction = Omit<Transaction, 'id' | 'createdAt'>;
export type NewCategory    = Omit<Category,    'id'>;
export type NewTag         = Omit<Tag,         'id'>;
export type NewRule        = Omit<Rule,        'id'>;
export type NewBudget      = Omit<Budget,      'id'>;
export type NewSavedView   = Omit<SavedView,   'id' | 'createdAt'>;
