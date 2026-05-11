import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { Transaction, TransactionType } from '@/lib/db/schema';

export interface RecurringGroup {
  id: string;
  key: string; // normalized description
  sampleDescription: string;
  count: number;
  medianPeriodDays: number;
  avgAmount: number;
  type: TransactionType;
}

export function normalizeDescription(desc: string): string {
  return desc
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .toLowerCase()
    .replace(/[0-9]+/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stableHash(str: string): string {
  // djb2-ish hash, stable and fast, no crypto.
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

export function detectRecurringGroups(all: Transaction[]): RecurringGroup[] {
  const groups = new Map<string, Transaction[]>();

  for (const tx of all) {
    if (!tx.description.trim()) continue;
    const key = normalizeDescription(tx.description);
    if (!key) continue;
    const arr = groups.get(key);
    if (arr) arr.push(tx);
    else groups.set(key, [tx]);
  }

  const out: RecurringGroup[] = [];

  for (const [key, txs] of groups) {
    if (txs.length < 3) continue;

    const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
    const deltas: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const a = parseISO(sorted[i - 1].date);
      const b = parseISO(sorted[i].date);
      deltas.push(Math.abs(differenceInCalendarDays(b, a)));
    }

    // Require at least 2 deltas for 3 occurrences.
    if (deltas.length < 2) continue;

    const med = median(deltas);
    if (med === 0) continue;

    const ok = deltas.every(d => Math.abs(d - med) <= 3);
    if (!ok) continue;

    const type = sorted[sorted.length - 1].type;
    const avgAmount = Math.round(sorted.reduce((acc, t) => acc + t.amount, 0) / sorted.length);

    out.push({
      id: `rec-${stableHash(key)}`,
      key,
      sampleDescription: sorted[sorted.length - 1].description,
      count: sorted.length,
      medianPeriodDays: med,
      avgAmount,
      type,
    });
  }

  // Stable ordering (most frequent first)
  out.sort((a, b) => b.count - a.count || b.avgAmount - a.avgAmount);
  return out;
}

export function assignRecurringFlags(
  all: Transaction[],
  groups: RecurringGroup[]
): Map<string, { isRecurring: boolean; recurringGroupId: string | null }> {
  const keyToGroupId = new Map(groups.map(g => [g.key, g.id] as const));
  const result = new Map<string, { isRecurring: boolean; recurringGroupId: string | null }>();

  for (const tx of all) {
    const key = normalizeDescription(tx.description);
    const gid = key ? (keyToGroupId.get(key) ?? null) : null;
    if (gid) result.set(tx.id, { isRecurring: true, recurringGroupId: gid });
    else result.set(tx.id, { isRecurring: false, recurringGroupId: null });
  }

  return result;
}
