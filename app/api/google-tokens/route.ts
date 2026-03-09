import { NextResponse } from 'next/server';
import { requireAuthenticatedUser, getErrorMessage } from '@/lib/auth-user';
import { supabaseAdmin } from '@/lib/supabase';

function isMissingTableError(error: unknown) {
  const payload = error as { message?: string; code?: string } | null;
  const message = payload?.message ?? '';
  const code = payload?.code ?? '';
  return code === 'PGRST205' || /Could not find the table|relation .+ does not exist/i.test(message);
}

function isSchemaConstraintError(error: unknown) {
  const payload = error as { message?: string; code?: string } | null;
  const message = payload?.message ?? '';
  const code = payload?.code ?? '';
  return code === '42P10' || /no unique or exclusion constraint matching the ON CONFLICT/i.test(message);
}

function isMissingColumnError(error: unknown, columnName: string) {
  const payload = error as { message?: string; code?: string } | null;
  const message = payload?.message ?? '';
  const code = payload?.code ?? '';
  return code === '42703' || new RegExp(`column .*${columnName}.* does not exist`, 'i').test(message);
}

function normalizeEmail(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response) return auth.response;

    const { data, error } = await supabaseAdmin
      .from('user_google_tokens')
      .select('email, account_id, created_at, updated_at')
      .eq('user_id', auth.user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json(
          {
            error:
              'Falta la tabla public.user_google_tokens. Ejecuta las migraciones para gestionar conexiones de Gmail.',
          },
          { status: 500 },
        );
      }
      throw error;
    }

    const rows = Array.isArray(data) ? data : [];
    const seen = new Set<string>();
    const emails: string[] = [];

    rows.forEach((row) => {
      const normalized = normalizeEmail(typeof row?.email === 'string' ? row.email : '');
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      emails.push(normalized);
    });

    return NextResponse.json(
      {
        emails,
        connections: rows,
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error, 'No se pudieron listar los correos conectados') },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const email = normalizeEmail(searchParams.get('email') ?? '');

    if (!email) {
      return NextResponse.json({ error: 'email es requerido' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('user_google_tokens')
      .delete()
      .eq('user_id', auth.user.id)
      .eq('email', email);

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json({ error: 'Falta la tabla user_google_tokens.' }, { status: 500 });
      }
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error, 'No se pudo desconectar la cuenta') }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response) return auth.response;

    const body = await request.json();

    const refreshToken = typeof body?.refresh_token === 'string' ? body.refresh_token.trim() : '';
    const emailFromBody = normalizeEmail(typeof body?.email === 'string' ? body.email : '');
    const accountId = typeof body?.account_id === 'string' ? body.account_id.trim() : '';
    const providerSub = typeof body?.provider_sub === 'string' ? body.provider_sub.trim() : '';

    if (!refreshToken) {
      return NextResponse.json({ error: 'refresh_token es requerido' }, { status: 400 });
    }

    const safeEmail = emailFromBody || normalizeEmail(auth.user.email ?? '');
    if (!safeEmail) {
      return NextResponse.json(
        { error: 'No se pudo determinar el email de la cuenta de Google conectada.' },
        { status: 400 },
      );
    }

    const payload: Record<string, string | null> = {
      user_id: auth.user.id,
      email: safeEmail,
      refresh_token: refreshToken,
      account_id: accountId || null,
      provider_sub: providerSub || null,
    };

    let { error } = await supabaseAdmin
      .from('user_google_tokens')
      .upsert([payload], { onConflict: 'user_id,email' });

    if (error && isMissingColumnError(error, 'provider_sub')) {
      const fallbackPayload = {
        user_id: payload.user_id,
        email: payload.email,
        refresh_token: payload.refresh_token,
        account_id: payload.account_id,
      };

      const retry = await supabaseAdmin
        .from('user_google_tokens')
        .upsert([fallbackPayload], { onConflict: 'user_id,email' });

      error = retry.error;
    }

    if (error) {
      if (isMissingTableError(error)) {
        return NextResponse.json(
          {
            error:
              'Falta la tabla public.user_google_tokens. Ejecuta la migracion para guardar tokens de Google.',
          },
          { status: 500 },
        );
      }

      if (isSchemaConstraintError(error)) {
        return NextResponse.json(
          {
            error:
              'La tabla user_google_tokens aun no soporta multiples correos por usuario. Ejecuta la migracion 2026-03-07_allow_multiple_google_tokens_per_user.sql.',
          },
          { status: 500 },
        );
      }

      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error, 'No se pudo guardar el token') }, { status: 500 });
  }
}
