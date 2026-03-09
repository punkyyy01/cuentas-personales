import { requireAuthenticatedUser, getErrorMessage } from '@/lib/auth-user';
import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

function getString(value: unknown) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  return null;
}

function normalizeAmount(rawAmount: unknown) {
  const n = typeof rawAmount === 'number' ? rawAmount
    : typeof rawAmount === 'string' ? Number(rawAmount.trim().replace(/\s+/g, '').replace(',', '.'))
    : NaN;
  if (!Number.isFinite(n) || n === 0) return null;
  return Math.round(Math.abs(n) * 100) / 100;
}

function mapMovementType(fintocType: unknown): 'expense' | 'income' {
  const t = getString(fintocType)?.toLowerCase() ?? '';
  if (t === 'deposit' || t === 'transfer_in' || t === 'credit') return 'income';
  return 'expense';
}

function normalizeMovementDate(value: unknown) {
  const raw = getString(value);
  if (!raw) return new Date().toISOString();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

async function findOrCreateAccountId(userId: string) {
  const { data } = await supabaseAdmin
    .from('accounts_cards')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (data?.id) return data.id;

  const { data: created } = await supabaseAdmin
    .from('accounts_cards')
    .insert({ user_id: userId, name: 'Cuenta Principal', type: 'debit_card' })
    .select('id')
    .maybeSingle();
  return created?.id ?? null;
}

async function syncMovements(linkToken: string, userId: string, secretKey: string) {
  const url = new URL('https://api.fintoc.com/v1/movements');
  url.searchParams.set('link_token', linkToken);

  const res = await fetch(url.toString(), {
    headers: { Authorization: secretKey },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Fintoc movements fetch error:', res.status, text);
    return { inserted: 0, skipped: 0, error: `Fintoc ${res.status}` };
  }

  const movements = await res.json();
  if (!Array.isArray(movements) || movements.length === 0) {
    return { inserted: 0, skipped: 0 };
  }

  const accountId = await findOrCreateAccountId(userId);
  if (!accountId) return { inserted: 0, skipped: 0, error: 'no_account' };

  let inserted = 0;
  let skipped = 0;

  for (const mov of movements) {
    const amount = normalizeAmount(mov.amount);
    if (!amount) { skipped++; continue; }

    const fintocId = getString(mov.id);
    const messageId = fintocId ? `fintoc_${fintocId}` : null;
    const description = getString(mov.description) || getString(mov.comment) || getString(mov.memo) || 'Movimiento Fintoc';
    const type = mapMovementType(mov.type);
    const transactionDate = normalizeMovementDate(mov.post_date ?? mov.transaction_date ?? mov.date);
    const currency = getString(mov.currency) ?? 'CLP';

    const { error } = await supabaseAdmin.from('transactions').insert({
      user_id: userId,
      account_id: accountId,
      amount,
      type,
      description,
      transaction_date: transactionDate,
      created_at: transactionDate,
      source: 'fintoc',
      message_id: messageId,
      bank_reference: { fintoc_id: fintocId, currency, link_token: linkToken },
    });

    if (error) {
      if (error.code === '23505') { skipped++; continue; }
      console.error('Insert movement error:', error);
      skipped++;
      continue;
    }
    inserted++;
  }

  return { inserted, skipped };
}

export async function GET(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response) return auth.response;

    const { data, error } = await supabaseAdmin
      .from('fintoc_links')
      .select('id, link_token, created_at')
      .eq('user_id', auth.user.id);

    if (error) throw error;

    const links = data ?? [];
    const linked = links.length > 0;

    const { searchParams } = new URL(request.url);
    const doSync = searchParams.get('sync') === '1';

    let syncResult: { inserted: number; skipped: number } | null = null;
    if (doSync && linked) {
      const secretKey = process.env.FINTOC_SECRET_KEY?.trim();
      if (secretKey) {
        let totalInserted = 0;
        let totalSkipped = 0;
        for (const link of links) {
          try {
            const result = await syncMovements(link.link_token, auth.user.id, secretKey);
            totalInserted += result.inserted;
            totalSkipped += result.skipped;
          } catch (e) {
            console.error('Fintoc sync error for link:', link.id, e);
          }
        }
        syncResult = { inserted: totalInserted, skipped: totalSkipped };
      }
    }

    return NextResponse.json({ linked, links, sync: syncResult });
  } catch (error) {
    console.error('Error fetching Fintoc links:', error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response) return auth.response;

    const { searchParams } = new URL(request.url);
    const linkId = searchParams.get('id');

    if (!linkId) {
      return NextResponse.json({ error: 'id es requerido' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('fintoc_links')
      .delete()
      .eq('user_id', auth.user.id)
      .eq('id', linkId);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error, 'No se pudo desconectar el banco') }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuthenticatedUser(request);
    if (auth.response) return auth.response;

    const body = (await request.json()) as Record<string, unknown>;
    const directLinkToken = typeof body?.link_token === 'string' ? body.link_token.trim() : '';
    const exchangeToken = typeof body?.exchange_token === 'string' ? body.exchange_token.trim() : '';

    if (!directLinkToken && !exchangeToken) {
      return NextResponse.json({ error: 'link_token o exchange_token es requerido' }, { status: 400 });
    }

    const secretKey = process.env.FINTOC_SECRET_KEY?.trim();
    if (!secretKey) {
      return NextResponse.json({ error: 'FINTOC_SECRET_KEY no configurada.' }, { status: 500 });
    }

    let linkToken = directLinkToken;

    // If no direct link_token, exchange token using Fintoc official endpoint.
    if (!linkToken && exchangeToken) {
      const exchangeUrl = new URL('https://api.fintoc.com/v1/links/exchange');
      exchangeUrl.searchParams.set('exchange_token', exchangeToken);

      const exchangeRes = await fetch(exchangeUrl.toString(), {
        method: 'GET',
        headers: {
          Authorization: secretKey,
          Accept: 'application/json',
        },
      });

      if (!exchangeRes.ok) {
        const text = await exchangeRes.text();
        console.error('Fintoc exchange error:', exchangeRes.status, text);
        return NextResponse.json(
          { error: `No se pudo obtener link_token (Fintoc ${exchangeRes.status}: ${text.slice(0, 200)})` },
          { status: 502 },
        );
      }

      const linkData = (await exchangeRes.json()) as Record<string, unknown>;
      const nestedLink = linkData?.link;
      const nestedLinkRecord = nestedLink && typeof nestedLink === 'object'
        ? nestedLink as Record<string, unknown>
        : null;

      linkToken =
        getString(linkData?.link_token) ??
        getString(linkData?.linkToken) ??
        getString(nestedLinkRecord?.link_token) ??
        getString(nestedLinkRecord?.linkToken) ??
        '';
    }

    if (!linkToken) {
      return NextResponse.json({ error: 'No se obtuvo link_token.' }, { status: 502 });
    }

    const { data, error } = await supabaseAdmin
      .from('fintoc_links')
      .upsert(
        { user_id: auth.user.id, link_token: linkToken },
        { onConflict: 'user_id,link_token' },
      )
      .select('id')
      .single();

    if (error) throw error;

    // Initial sync of movements right after linking
    let syncResult: { inserted: number; skipped: number; error?: string } = { inserted: 0, skipped: 0 };
    try {
      syncResult = await syncMovements(linkToken, auth.user.id, secretKey);
    } catch (syncError) {
      console.error('Initial Fintoc sync error:', syncError);
    }

    return NextResponse.json({ success: true, data, sync: syncResult });
  } catch (error) {
    console.error('Error saving Fintoc link:', error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
