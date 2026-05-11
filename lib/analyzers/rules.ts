import type { Rule, Transaction, Category, Tag } from '@/lib/db/schema';

export interface ApplyRulesResult {
  categoryId: string | null;
  tagIds: string[];
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .toLowerCase();
}

function matchRule(rule: Rule, tx: Transaction): boolean {
  const fieldValue = rule.field === 'description' ? tx.description : rule.field === 'notes' ? tx.notes : String(tx.amount);
  const v = fieldValue ?? '';

  switch (rule.matchType) {
    case 'contains':
      return normalize(v).includes(normalize(rule.matchValue));
    case 'startsWith':
      return normalize(v).startsWith(normalize(rule.matchValue));
    case 'endsWith':
      return normalize(v).endsWith(normalize(rule.matchValue));
    case 'equals':
      return normalize(v) === normalize(rule.matchValue);
    case 'regex': {
      try {
        const re = new RegExp(rule.matchValue, 'i');
        return re.test(v);
      } catch {
        return false;
      }
    }
    case 'gt': {
      const n = Number(rule.matchValue);
      return Number.isFinite(n) ? tx.amount > n : false;
    }
    case 'lt': {
      const n = Number(rule.matchValue);
      return Number.isFinite(n) ? tx.amount < n : false;
    }
    default:
      return false;
  }
}

export function applyRulesToTransaction(
  tx: Transaction,
  rules: Rule[],
  _categoriesById: Record<string, Category>,
  _tagsById: Record<string, Tag>
): ApplyRulesResult {
  // Highest priority first (bigger number = higher priority)
  const ordered = [...rules]
    .filter(r => r.enabled)
    .sort((a, b) => b.priority - a.priority);

  let categoryId: string | null = tx.categoryId;
  const tagIds = new Set(tx.tags);

  for (const rule of ordered) {
    if (!matchRule(rule, tx)) continue;

    if (rule.categoryId) categoryId = rule.categoryId;
    for (const t of rule.tagIds) tagIds.add(t);
  }

  return { categoryId, tagIds: [...tagIds] };
}
