import { requireAuthenticatedUser, getErrorMessage } from '@/lib/auth-user';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

function parsePositiveInteger(value: string) {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return null;

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;

  return parsed;
}

// GET /api/accounts/[id]
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuthenticatedUser(_request);
    if (auth.response) return auth.response;

    const { id } = await params;
    const accountId = parsePositiveInteger(id);
    if (!accountId) {
      return NextResponse.json({ error: 'ID de cuenta invalido' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('accounts_cards')
      .select('*')
      .eq('id', accountId)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (error) throw error;
    if (!data) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

// PUT /api/accounts/[id] — Actualizar datos de la cuenta
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response) return auth.response;

    const { id } = await params;
    const accountId = parsePositiveInteger(id);
    if (!accountId) {
      return NextResponse.json({ error: 'ID de cuenta invalido' }, { status: 400 });
    }
    const body = await request.json();

    const updates: Record<string, unknown> = {};
    if (typeof body.name === 'string') updates.name = body.name;
    if (typeof body.type === 'string') updates.type = body.type;
    if (body.balance !== undefined) {
      const parsedBalance = Number(body.balance);
      if (!Number.isFinite(parsedBalance)) {
        return NextResponse.json({ error: 'Balance invalido' }, { status: 400 });
      }
      updates.balance = parsedBalance;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No hay campos validos para actualizar' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('accounts_cards')
      .update(updates)
      .eq('id', accountId)
      .eq('user_id', auth.user.id)
      .select();

    if (error) throw error;
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });
    }

    return NextResponse.json({ data: data[0] });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

// DELETE /api/accounts/[id] — Eliminar una cuenta
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuthenticatedUser(_request);
    if (auth.response) return auth.response;

    const { id } = await params;
    const accountId = parsePositiveInteger(id);
    if (!accountId) {
      return NextResponse.json({ error: 'ID de cuenta invalido' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('accounts_cards')
      .delete()
      .eq('id', accountId)
      .eq('user_id', auth.user.id)
      .select('id');

    if (error) throw error;
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
