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

// GET /api/transactions/[id]
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuthenticatedUser(_request);
    if (auth.response) return auth.response;

    const { id } = await params;

    const { data, error } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Transacción no encontrada' }, { status: 404 });

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

// PUT /api/transactions/[id] — Actualizar una transacción
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response) return auth.response;

    const { id } = await params;
    const body = await request.json();

    const updates: Record<string, unknown> = {};
    if (body.amount !== undefined) {
      const parsedAmount = Number(body.amount);
      if (!Number.isFinite(parsedAmount)) {
        return NextResponse.json({ error: 'Monto invalido' }, { status: 400 });
      }
      updates.amount = parsedAmount;
    }

    if (body.type !== undefined) {
      if (body.type !== 'expense' && body.type !== 'income') {
        return NextResponse.json({ error: 'Tipo de transaccion invalido' }, { status: 400 });
      }
      updates.type = body.type;
    }

    if (body.description !== undefined) {
      updates.description = String(body.description);
    }

    if (body.category !== undefined) {
      updates.category = String(body.category);
    }

    if (body.account_id !== undefined) {
      const parsedAccountId = parsePositiveInteger(body.account_id);
      if (!parsedAccountId) {
        return NextResponse.json({ error: 'account_id invalido' }, { status: 400 });
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
      updates.account_id = parsedAccountId;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No hay campos validos para actualizar' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('transactions')
      .update(updates)
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Transacción no encontrada' }, { status: 404 });
    }

    return NextResponse.json({ data: data[0] });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

// DELETE /api/transactions/[id] — Eliminar una transacción
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuthenticatedUser(_request);
    if (auth.response) return auth.response;

    const { id } = await params;

    const { data, error } = await supabaseAdmin
      .from('transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', auth.user.id)
      .select('id');

    if (error) throw error;
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Transacción no encontrada' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
