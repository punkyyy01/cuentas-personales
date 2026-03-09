import { requireAuthenticatedUser, getErrorMessage } from '@/lib/auth-user';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

// GET /api/budgets?month=YYYY-MM — Listar presupuestos del usuario
export async function GET(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month')?.trim();

    let query = supabaseAdmin
      .from('budgets')
      .select('*')
      .eq('user_id', auth.user.id)
      .order('category', { ascending: true });

    if (month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      query = query.eq('month', month);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

// POST /api/budgets — Crear o actualizar un presupuesto mensual
export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response) return auth.response;

    const body = await request.json();
    const { category, amount_limit, month } = body;

    if (!category || typeof category !== 'string' || !category.trim()) {
      return NextResponse.json({ error: 'Categoria requerida' }, { status: 400 });
    }

    const parsedLimit = Number(amount_limit);
    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
      return NextResponse.json({ error: 'Monto limite debe ser un numero positivo' }, { status: 400 });
    }

    if (!month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return NextResponse.json({ error: 'Mes invalido. Usa formato YYYY-MM' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('budgets')
      .upsert(
        {
          user_id: auth.user.id,
          category: category.trim(),
          amount_limit: parsedLimit,
          month,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,category,month' },
      )
      .select();

    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

// DELETE /api/budgets?id=UUID — Eliminar un presupuesto
export async function DELETE(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id')?.trim();

    if (!id) {
      return NextResponse.json({ error: 'id requerido' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('budgets')
      .delete()
      .eq('id', id)
      .eq('user_id', auth.user.id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
