import { addDays, endOfMonth, parseISO, differenceInCalendarDays } from 'date-fns';
import type { Transaction } from '@/lib/db/schema';
import type { RecurringGroup } from './recurring';

export interface ProjectionResult {
  month: string; // YYYY-MM
  today: string; // YYYY-MM-DD
  actualIncome: number;
  actualExpense: number;
  projectedIncomeRemaining: number;
  projectedExpenseRemaining: number;
  projectedIncomeTotal: number;
  projectedExpenseTotal: number;
  projectedBalanceTotal: number;
}

function isoToday(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${da}`;
}

function sameMonth(isoDate: string, month: string): boolean {
  return isoDate.slice(0, 7) === month;
}

export function computeProjection(
  month: string,
  txsInMonth: Transaction[],
  allTxs: Transaction[],
  recurringGroups: RecurringGroup[]
): ProjectionResult {
  const today = isoToday();

  let actualIncome = 0;
  let actualExpense = 0;

  for (const tx of txsInMonth) {
    if (tx.type === 'income') actualIncome += tx.amount;
    else if (tx.type === 'expense') actualExpense += tx.amount;
  }

  // Discretionary daily average (non-recurring expenses only, month-to-date)
  const discretionary = txsInMonth.filter(tx => tx.type === 'expense' && !tx.isRecurring && tx.date <= today);
  const spentDiscretionary = discretionary.reduce((acc, t) => acc + t.amount, 0);

  const monthStart = parseISO(`${month}-01`);
  const todayDate = parseISO(today);
  const elapsedDays = Math.max(1, differenceInCalendarDays(todayDate, monthStart) + 1);
  const dailyAvg = spentDiscretionary / elapsedDays;

  const end = endOfMonth(monthStart);
  const remainingDays = Math.max(0, differenceInCalendarDays(end, todayDate));
  const projectedDiscretionaryRemaining = Math.round(dailyAvg * remainingDays);

  // Recurring projection: for each recurring group, estimate future occurrences within the month.
  // We use last occurrence date and median periodicity to predict next dates.
  const byGroup = new Map<string, Transaction[]>();
  for (const tx of allTxs) {
    if (!tx.isRecurring || !tx.recurringGroupId) continue;
    const arr = byGroup.get(tx.recurringGroupId);
    if (arr) arr.push(tx);
    else byGroup.set(tx.recurringGroupId, [tx]);
  }

  let projectedIncomeRecurring = 0;
  let projectedExpenseRecurring = 0;

  for (const g of recurringGroups) {
    const txs = byGroup.get(g.id);
    if (!txs || txs.length === 0) continue;

    const sorted = [...txs].sort((a, b) => a.date.localeCompare(b.date));
    const last = sorted[sorted.length - 1];

    // Typical amount: average of last 3 occurrences
    const tail = sorted.slice(-3);
    const typicalAmount = Math.round(tail.reduce((acc, t) => acc + t.amount, 0) / tail.length);

    // Predict next occurrences after today until end-of-month
    let next = addDays(parseISO(last.date), Math.max(1, g.medianPeriodDays));
    while (next <= end) {
      const iso = next.toISOString().slice(0, 10);
      if (iso > today && sameMonth(iso, month)) {
        if (g.type === 'income') projectedIncomeRecurring += typicalAmount;
        else if (g.type === 'expense') projectedExpenseRecurring += typicalAmount;
      }
      next = addDays(next, Math.max(1, g.medianPeriodDays));
    }
  }

  const projectedIncomeRemaining = projectedIncomeRecurring;
  const projectedExpenseRemaining = projectedExpenseRecurring + projectedDiscretionaryRemaining;

  const projectedIncomeTotal = actualIncome + projectedIncomeRemaining;
  const projectedExpenseTotal = actualExpense + projectedExpenseRemaining;

  return {
    month,
    today,
    actualIncome,
    actualExpense,
    projectedIncomeRemaining,
    projectedExpenseRemaining,
    projectedIncomeTotal,
    projectedExpenseTotal,
    projectedBalanceTotal: projectedIncomeTotal - projectedExpenseTotal,
  };
}
