import { z } from 'zod';
import type {
  Transaction,
  Category,
  Tag,
  Rule,
  Budget,
  SavedView,
  Meta,
} from '@/lib/db/schema';

export const SplitSchema = z.object({
  categoryId: z.string().min(1),
  amount: z.number().int().nonnegative(),
  notes: z.string().default(''),
});

export const TransactionSchema = z.object({
  id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string(),
  amount: z.number().int().nonnegative(),
  type: z.enum(['expense', 'income', 'transfer']),
  categoryId: z.string().nullable(),
  tags: z.array(z.string()),
  notes: z.string(),
  splits: z.array(SplitSchema).nullable(),
  isRecurring: z.boolean(),
  recurringGroupId: z.string().nullable(),
  createdAt: z.number().int().nonnegative(),
});

export const CategorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().min(1),
  icon: z.string().min(1),
  parentId: z.string().nullable(),
});

export const TagSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  color: z.string().min(1),
});

export const RuleSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  field: z.enum(['description', 'amount', 'notes']),
  matchType: z.enum(['contains', 'startsWith', 'endsWith', 'equals', 'regex', 'gt', 'lt']),
  matchValue: z.string(),
  categoryId: z.string().nullable(),
  tagIds: z.array(z.string()),
  priority: z.number().int(),
  enabled: z.boolean(),
});

export const BudgetSchema = z.object({
  id: z.string().min(1),
  categoryId: z.string().min(1),
  amount: z.number().int().nonnegative(),
  period: z.enum(['monthly', 'weekly', 'yearly']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const SavedViewSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  filters: z.object({
    period: z.object({ from: z.string(), to: z.string() }).optional(),
    categoryIds: z.array(z.string()).optional(),
    tagIds: z.array(z.string()).optional(),
    types: z.array(z.enum(['expense', 'income', 'transfer'])).optional(),
    search: z.string().optional(),
    amountMin: z.number().optional(),
    amountMax: z.number().optional(),
  }),
  columns: z.array(z.string()),
  sort: z.object({ field: z.string(), dir: z.enum(['asc', 'desc']) }),
  createdAt: z.number().int().nonnegative(),
});

export const MetaSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
});

export const BackupSchemaV1 = z.object({
  version: z.literal(1),
  exportedAt: z.number().int().nonnegative(),
  data: z.object({
    transactions: z.array(TransactionSchema),
    categories: z.array(CategorySchema),
    tags: z.array(TagSchema),
    rules: z.array(RuleSchema),
    budgets: z.array(BudgetSchema),
    savedViews: z.array(SavedViewSchema),
    meta: z.array(MetaSchema),
  }),
});

export type BackupV1 = z.infer<typeof BackupSchemaV1>;

export function makeBackup(payload: {
  transactions: Transaction[];
  categories: Category[];
  tags: Tag[];
  rules: Rule[];
  budgets: Budget[];
  savedViews: SavedView[];
  meta: Meta[];
}): BackupV1 {
  return {
    version: 1,
    exportedAt: Date.now(),
    data: payload,
  };
}

export function parseBackup(json: unknown): BackupV1 {
  return BackupSchemaV1.parse(json);
}
