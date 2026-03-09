import { requireAuthenticatedUser, getErrorMessage } from '@/lib/auth-user';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

// GET /api/accounts — Listar cuentas de un usuario
export async function GET(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response) return auth.response;

    const { data, error } = await supabaseAdmin
      .from('accounts_cards')
      .select('*')
      .eq('user_id', auth.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

// POST /api/accounts — Crear una cuenta nueva
export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response) return auth.response;

    const body = await request.json();
    const { name, type, balance } = body;

    if (!name) {
      return NextResponse.json(
        { error: 'Campos requeridos: name' },
        { status: 400 }
      );
    }

    const parsedBalance = Number(balance);
    const safeBalance = Number.isFinite(parsedBalance) ? parsedBalance : 0;

    const { data, error } = await supabaseAdmin
      .from('accounts_cards')
      .insert([{ user_id: auth.user.id, name, type: type || 'checking', balance: safeBalance }])
      .select();

    if (error) throw error;
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
