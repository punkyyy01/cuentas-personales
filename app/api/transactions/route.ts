import { requireAuthenticatedUser, getErrorMessage } from '@/lib/auth-user';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

function parsePositiveInteger(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;

  const normalized = String(value).trim();
  if (!/^\d+$/.test(normalized)) return null;

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;

  return parsed;
}

type MonthRange = {
  startIso: string;
  endIso: string;
};

// UTC-3 boundary support for Chile month calculations.
const CHILE_UTC_OFFSET_MS = -3 * 60 * 60 * 1000;

function getUtc3MonthRange(year: number, monthIndex: number): MonthRange {
  const startUtcMs = Date.UTC(year, monthIndex, 1) - CHILE_UTC_OFFSET_MS;
  const endUtcMs = Date.UTC(year, monthIndex + 1, 1) - CHILE_UTC_OFFSET_MS;

  return {
    startIso: new Date(startUtcMs).toISOString(),
    endIso: new Date(endUtcMs).toISOString(),
  };
}

function getCurrentMonthRange(now = new Date()): MonthRange {
  const utc3Now = new Date(now.getTime() + CHILE_UTC_OFFSET_MS);
  return getUtc3MonthRange(utc3Now.getUTCFullYear(), utc3Now.getUTCMonth());
}

function parseMonthRange(month: string | null): MonthRange | null {
  if (!month) return null;
  const normalized = month.trim();
  const match = normalized.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!match) return null;

  const year = Number.parseInt(match[1], 10);
  const monthIndex = Number.parseInt(match[2], 10) - 1;
  return getUtc3MonthRange(year, monthIndex);
}

// GET /api/transactions — Listar transacciones (con filtros opcionales)
export async function GET(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const accountIdRaw = searchParams.get('account_id');
    const type = searchParams.get('type'); // 'expense' | 'income'
    const summary = searchParams.get('summary');
    const monthParam = searchParams.get('month');

    const monthRange = parseMonthRange(monthParam);
    if (searchParams.has('month') && !monthRange) {
      return NextResponse.json({ error: 'month invalido. Usa formato YYYY-MM' }, { status: 400 });
    }

    if (summary === 'expense_total') {
      const sourceFilter = searchParams.get('source');
      const now = new Date();
      const range = monthRange ?? getCurrentMonthRange(now);

      let query = supabaseAdmin
        .from('transactions')
        .select('amount, message_id')
        .eq('user_id', auth.user.id)
        .eq('type', 'expense')
        .gte('created_at', range.startIso)
        .lt('created_at', range.endIso);

      if (sourceFilter) {
        query = query.eq('source', sourceFilter);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Deduplicate: for rows with a message_id, keep only the first occurrence
      const seenMessageIds = new Set<string>();
      let totalExpense = 0;
      for (const tx of data ?? []) {
        const mid = tx.message_id as string | null;
        if (mid) {
          if (seenMessageIds.has(mid)) continue;
          seenMessageIds.add(mid);
        }
        totalExpense += Number(tx.amount || 0);
      }

      return NextResponse.json({ total_expense: totalExpense });
    }

    if (summary === 'category_breakdown') {
      const now = new Date();
      const range = monthRange ?? getCurrentMonthRange(now);

      const { data, error } = await supabaseAdmin
        .from('transactions')
        .select('amount, message_id, category')
        .eq('user_id', auth.user.id)
        .eq('type', 'expense')
        .gte('created_at', range.startIso)
        .lt('created_at', range.endIso);

      if (error) throw error;

      const seenMessageIds = new Set<string>();
      const categoryTotals: Record<string, number> = {};

      for (const tx of data ?? []) {
        const mid = tx.message_id as string | null;
        if (mid) {
          if (seenMessageIds.has(mid)) continue;
          seenMessageIds.add(mid);
        }
        const cat = (tx.category as string) || 'Otros';
        categoryTotals[cat] = (categoryTotals[cat] ?? 0) + Number(tx.amount || 0);
      }

      const categories = Object.entries(categoryTotals)
        .map(([category, total]) => ({ category, total }))
        .sort((a, b) => b.total - a.total);

      const totalExpense = categories.reduce((sum, c) => sum + c.total, 0);

      return NextResponse.json({ categories, total_expense: totalExpense });
    }

    if (summary === 'income_total') {
      const now = new Date();
      const range = monthRange ?? getCurrentMonthRange(now);

      const { data, error } = await supabaseAdmin
        .from('transactions')
        .select('amount, message_id')
        .eq('user_id', auth.user.id)
        .eq('type', 'income')
        .gte('created_at', range.startIso)
        .lt('created_at', range.endIso);

      if (error) throw error;

      const seenMessageIds = new Set<string>();
      let totalIncome = 0;
      for (const tx of data ?? []) {
        const mid = tx.message_id as string | null;
        if (mid) {
          if (seenMessageIds.has(mid)) continue;
          seenMessageIds.add(mid);
        }
        totalIncome += Number(tx.amount || 0);
      }

      return NextResponse.json({ total_income: totalIncome });
    }

    if (type && type !== 'expense' && type !== 'income') {
      return NextResponse.json({ error: 'Tipo de transaccion invalido' }, { status: 400 });
    }

    const accountId = parsePositiveInteger(accountIdRaw);
    if (accountIdRaw && !accountId) {
      return NextResponse.json({ error: 'account_id invalido' }, { status: 400 });
    }

    const limitParam = parseInt(searchParams.get('limit') || '50', 10);
    const offsetParam = parseInt(searchParams.get('offset') || '0', 10);
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 200) : 50;
    const offset = Number.isFinite(offsetParam) ? Math.max(offsetParam, 0) : 0;

    let query = supabaseAdmin
      .from('transactions')
      .select('*', { count: 'exact' })
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (accountId) query = query.eq('account_id', accountId);
    if (type) query = query.eq('type', type);
    if (monthRange) {
      query = query.gte('created_at', monthRange.startIso).lt('created_at', monthRange.endIso);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({ data, count });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

// POST /api/transactions — Crear una transacción manualmente
export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response) return auth.response;

    const body = await request.json();
    const { account_id, amount, type, description, category } = body;

    if (account_id == null || amount == null || !type) {
      return NextResponse.json(
        { error: 'Campos requeridos: account_id, amount, type' },
        { status: 400 }
      );
    }

    const parsedAccountId = parsePositiveInteger(account_id);
    if (!parsedAccountId) {
      return NextResponse.json({ error: 'account_id invalido' }, { status: 400 });
    }

    if (type !== 'expense' && type !== 'income') {
      return NextResponse.json({ error: 'Tipo de transaccion invalido' }, { status: 400 });
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount)) {
      return NextResponse.json({ error: 'Monto invalido' }, { status: 400 });
    }

    const { data: account, error: accountError } = await supabaseAdmin
      .from('accounts_cards')
      .select('id')
      .eq('id', parsedAccountId)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (accountError) throw accountError;
    if (!account) {
      return NextResponse.json({ error: 'Cuenta invalida o sin permisos' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('transactions')
      .insert([
        {
          user_id: auth.user.id,
          account_id: parsedAccountId,
          amount: parsedAmount,
          type,
          description,
          category,
          source: 'manual',
        },
      ])
      .select();

    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}