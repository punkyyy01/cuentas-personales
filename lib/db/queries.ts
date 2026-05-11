import { nanoid } from 'nanoid';
import { db } from './index';
import { applyRulesToTransaction } from '@/lib/analyzers/rules';
import type {
  Transaction,
  NewTransaction,
  Category,
  NewCategory,
  Tag,
  NewTag,
  Rule,
  NewRule,
  Budget,
  NewBudget,
  SavedView,
  NewSavedView,
  Meta,
} from './schema';

// ─── Transactions ─────────────────────────────────────────────────────────────

export async function addTransaction(data: NewTransaction): Promise<string> {
  const id = nanoid();

  // Apply enabled rules on insert (local-only, no network)
  const rules = await db.rules.toArray();
  const { categoryId, tagIds } = applyRulesToTransaction(
    { ...data, id, createdAt: Date.now() },
    rules,
    {},
    {}
  );

  await db.transactions.add({
    ...data,
    categoryId,
    tags: tagIds,
    id,
    createdAt: Date.now(),
  });
  return id;
}

export async function updateTransaction(id: string, patch: Partial<Transaction>): Promise<void> {
  await db.transactions.update(id, patch);
}

export async function deleteTransaction(id: string): Promise<void> {
  await db.transactions.delete(id);
}

export async function getTransactionsByMonth(month: string): Promise<Transaction[]> {
  const from = `${month}-01`;
  const [y, m] = month.split('-').map(Number);
  const to = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  return db.transactions
    .where('date').between(from, to, true, true)
    .sortBy('date')
    .then(txs => txs.reverse());
}

export async function restoreTransaction(snapshot: Transaction): Promise<void> {
  await db.transactions.put(snapshot);
}

export async function bulkAddTransactions(rows: NewTransaction[]): Promise<void> {
  const now = Date.now();
  await db.transactions.bulkAdd(
    rows.map(r => ({ ...r, id: nanoid(), createdAt: now }))
  );
}

// ─── Categories ───────────────────────────────────────────────────────────────

export async function addCategory(data: NewCategory): Promise<string> {
  const id = nanoid();
  await db.categories.add({ ...data, id });
  return id;
}

export async function updateCategory(id: string, patch: Partial<Category>): Promise<void> {
  await db.categories.update(id, patch);
}

export async function deleteCategory(id: string): Promise<void> {
  await db.categories.delete(id);
}

export async function getCategoryMap(): Promise<Record<string, Category>> {
  const cats = await db.categories.toArray();
  return Object.fromEntries(cats.map(c => [c.id, c]));
}

// ─── Tags ─────────────────────────────────────────────────────────────────────

export async function addTag(data: NewTag): Promise<string> {
  const id = nanoid();
  await db.tags.add({ ...data, id });
  return id;
}

export async function updateTag(id: string, patch: Partial<Tag>): Promise<void> {
  await db.tags.update(id, patch);
}

export async function deleteTag(id: string): Promise<void> {
  await db.tags.delete(id);
}

export async function getTagMap(): Promise<Record<string, Tag>> {
  const tags = await db.tags.toArray();
  return Object.fromEntries(tags.map(t => [t.id, t]));
}

// ─── Rules ───────────────────────────────────────────────────────────────────

export async function addRule(data: NewRule): Promise<string> {
  const id = nanoid();
  await db.rules.add({ ...data, id });
  return id;
}

export async function updateRule(id: string, patch: Partial<Rule>): Promise<void> {
  await db.rules.update(id, patch);
}

export async function deleteRule(id: string): Promise<void> {
  await db.rules.delete(id);
}

// ─── Budgets ────────────────────────────────────────────────────────────────

export async function addBudget(data: NewBudget): Promise<string> {
  const id = nanoid();
  await db.budgets.add({ ...data, id });
  return id;
}

export async function updateBudget(id: string, patch: Partial<Budget>): Promise<void> {
  await db.budgets.update(id, patch);
}

export async function deleteBudget(id: string): Promise<void> {
  await db.budgets.delete(id);
}

// ─── Saved views ────────────────────────────────────────────────────────────

export async function addSavedView(data: NewSavedView): Promise<string> {
  const id = nanoid();
  await db.savedViews.add({ ...data, id, createdAt: Date.now() });
  return id;
}

export async function updateSavedView(id: string, patch: Partial<SavedView>): Promise<void> {
  await db.savedViews.update(id, patch);
}

export async function deleteSavedView(id: string): Promise<void> {
  await db.savedViews.delete(id);
}

// ─── Meta ───────────────────────────────────────────────────────────────────

export async function setMeta(key: string, value: string): Promise<void> {
  const row: Meta = { key, value };
  await db.meta.put(row);
}

export async function getMeta(key: string): Promise<string | null> {
  const row = await db.meta.get(key);
  return row?.value ?? null;
}

// ─── Restore / backup helpers ───────────────────────────────────────────────

export async function restoreFromBackup(payload: {
  transactions: Transaction[];
  categories: Category[];
  tags: Tag[];
  rules: Rule[];
  budgets: Budget[];
  savedViews: SavedView[];
  meta: Meta[];
}): Promise<void> {
  await db.transaction('rw', [db.transactions, db.categories, db.tags, db.rules, db.budgets, db.savedViews, db.meta], async () => {
    await Promise.all([
      db.transactions.clear(),
      db.categories.clear(),
      db.tags.clear(),
      db.rules.clear(),
      db.budgets.clear(),
      db.savedViews.clear(),
      db.meta.clear(),
    ]);

    await db.categories.bulkPut(payload.categories);
    await db.tags.bulkPut(payload.tags);
    await db.rules.bulkPut(payload.rules);
    await db.budgets.bulkPut(payload.budgets);
    await db.savedViews.bulkPut(payload.savedViews);
    await db.meta.bulkPut(payload.meta);
    await db.transactions.bulkPut(payload.transactions);
  });
}
