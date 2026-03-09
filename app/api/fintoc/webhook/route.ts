import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { getErrorMessage } from '@/lib/auth-user';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type MovementType = 'expense' | 'income';

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

function getString(value: unknown) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function getNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const normalized = value.trim().replace(/\s+/g, '').replace(',', '.');
    if (!normalized) return null;
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function normalizeAmount(rawAmount: unknown) {
  const amount = getNumber(rawAmount);
  if (amount == null) return null;

  const positiveAmount = Math.abs(amount);
  if (!Number.isFinite(positiveAmount) || positiveAmount <= 0) return null;

  return Math.round(positiveAmount * 100) / 100;
}

function normalizeSignature(signatureHeader: string | null) {
  const header = signatureHeader?.trim();
  if (!header) return null;

  const pieces = header
    .split(',')
    .map((piece) => piece.trim())
    .filter(Boolean);

  for (const piece of pieces) {
    if (piece.startsWith('sha256=')) {
      return piece.slice('sha256='.length).trim();
    }
    if (piece.startsWith('v1=')) {
      return piece.slice('v1='.length).trim();
    }
  }

  return header;
}

// Verify Fintoc webhook signature (HMAC-SHA256)
function verifySignature(payload: string, signatureHeader: string | null, secret: string): boolean {
  const normalizedSignature = normalizeSignature(signatureHeader);
  if (!normalizedSignature || !secret) return false;

  const expectedSignature = createHmac('sha256', secret).update(payload).digest('hex');

  try {
    const sigBuffer = Buffer.from(normalizedSignature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    if (sigBuffer.length !== expectedBuffer.length) return false;
    return timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

function toPositiveInteger(value: unknown) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

async function findFirstAccountIdForUser(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('accounts_cards')
    .select('id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return toPositiveInteger(data?.id);
}

async function createDefaultAccountForUser(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('accounts_cards')
    .insert([
      {
        user_id: userId,
        name: 'Cuenta Principal',
        type: 'debit_card',
      },
    ])
    .select('id')
    .maybeSingle();

  if (error) throw error;
  return toPositiveInteger(data?.id);
}

async function resolveDestinationAccountId(userId: string) {
  const existingAccountId = await findFirstAccountIdForUser(userId);
  if (existingAccountId) return existingAccountId;

  try {
    const createdAccountId = await createDefaultAccountForUser(userId);
    if (createdAccountId) return createdAccountId;
  } catch (error) {
    console.warn('[Fintoc webhook] Failed to auto-create default account', {
      user_id: userId,
      error: error instanceof Error ? error.message : 'unknown_error',
    });
  }

  return findFirstAccountIdForUser(userId);
}

// Resolve the user_id that owns a given link_token
async function resolveUserId(linkToken: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('fintoc_links')
    .select('user_id')
    .eq('link_token', linkToken)
    .maybeSingle();

  return data?.user_id ?? null;
}

function normalizeMovementDate(value: unknown) {
  const rawValue = getString(value);
  if (!rawValue) return new Date().toISOString();

  const parsed = new Date(rawValue);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();

  return parsed.toISOString();
}

// Map Fintoc movement type to our internal type
function mapMovementType(fintocType: unknown): MovementType {
  const normalizedType = getString(fintocType)?.toLowerCase() ?? '';

  // Fintoc typically uses "charge" for expenses and "deposit" / "transfer_in" for income.
  if (normalizedType === 'deposit' || normalizedType === 'transfer_in' || normalizedType === 'credit') {
    return 'income';
  }

  return 'expense';
}

// Extract link_token from a refresh-intent event payload
function extractLinkTokenFromRefreshEvent(event: Record<string, unknown>): string | null {
  const data = asRecord(event.data);
  const link = asRecord(data.link);
  const account = asRecord(data.account);

  const candidates = [
    getString(data.link_token),
    getString(data.linkToken),
    getString(link.token),
    getString(link.link_token),
    getString(account.link_token),
    getString(event.link_token),
    getString(event.linkToken),
  ];

  return candidates.find(Boolean) ?? null;
}

// Extract Fintoc account ID from the refresh-intent event
function extractFintocAccountId(event: Record<string, unknown>): string | null {
  const data = asRecord(event.data);
  const account = asRecord(data.account);

  return (
    getString(data.refreshed_object_id) ??
    getString(data.account_id) ??
    getString(account.id) ??
    null
  );
}

// Fallback: resolve link_token via Fintoc API using account ID
async function resolveLinkTokenByFintocAccount(accountId: string): Promise<string | null> {
  const secretKey = process.env.FINTOC_SECRET_KEY;
  if (!secretKey) return null;

  try {
    const res = await fetch(
      `https://api.fintoc.com/v1/accounts/${encodeURIComponent(accountId)}`,
      { headers: { Authorization: secretKey } },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as Record<string, unknown>;
    return getString(body?.link_token) ?? null;
  } catch {
    return null;
  }
}

// Fetch movements from Fintoc API for a given link_token
async function fetchFintocMovements(linkToken: string): Promise<Record<string, unknown>[]> {
  const secretKey = process.env.FINTOC_SECRET_KEY;
  if (!secretKey) throw new Error('FINTOC_SECRET_KEY no configurada');

  const url = new URL('https://api.fintoc.com/v1/movements');
  url.searchParams.set('link_token', linkToken);

  const res = await fetch(url.toString(), {
    headers: { Authorization: secretKey },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fintoc API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data as Record<string, unknown>[];
}

async function hasTransactionWithMessageId(userId: string, messageId: string) {
  const { data, error } = await supabaseAdmin
    .from('transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('message_id', messageId)
    .limit(1);

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

// Triple deduplication step #2: proximity check against Gmail imports.
async function isDuplicateByGmailProximity(
  userId: string,
  amount: number,
  transactionDate: string,
): Promise<boolean> {
  const date = new Date(transactionDate);
  if (Number.isNaN(date.getTime())) return false;

  const dayBefore = new Date(date.getTime() - ONE_DAY_MS).toISOString();
  const dayAfter = new Date(date.getTime() + ONE_DAY_MS).toISOString();

  const gmailByCreatedAt = await supabaseAdmin
    .from('transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'expense')
    .eq('source', 'webhook_banco')
    .eq('amount', amount)
    .gte('created_at', dayBefore)
    .lte('created_at', dayAfter)
    .limit(1);

  if (gmailByCreatedAt.error) throw gmailByCreatedAt.error;
  if ((gmailByCreatedAt.data?.length ?? 0) > 0) return true;

  // Fallback for rows where date was stored in transaction_date.
  const gmailByTransactionDate = await supabaseAdmin
    .from('transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'expense')
    .eq('source', 'webhook_banco')
    .eq('amount', amount)
    .gte('transaction_date', dayBefore)
    .lte('transaction_date', dayAfter)
    .limit(1);

  if (gmailByTransactionDate.error) throw gmailByTransactionDate.error;
  return (gmailByTransactionDate.data?.length ?? 0) > 0;
}

// POST /api/fintoc/webhook — Receive Fintoc webhook events
export async function POST(request: Request) {
  try {
    // Rate limit: max 120 webhook calls per minute per IP
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
    if (!checkRateLimit(`fintoc-webhook:${ip}`, 120, 60_000)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
    }

    const rawBody = await request.text();
    const webhookSecret = process.env.FINTOC_WEBHOOK_SECRET ?? '';

    // Verify signature if secret is configured
    if (webhookSecret) {
      const signature = request.headers.get('fintoc-signature') ??
        request.headers.get('x-fintoc-signature');
      if (!verifySignature(rawBody, signature, webhookSecret)) {
        return NextResponse.json({ error: 'Firma invalida' }, { status: 401 });
      }
    }

    const event = JSON.parse(rawBody) as Record<string, unknown>;
    const eventType = getString(event.type) ?? '';

    // Handle: link.credentials_changed — banco rechazó credenciales
    if (eventType === 'link.credentials_changed') {
      const eventData = asRecord(event.data);
      console.warn('[Fintoc] link.credentials_changed — credenciales rechazadas por el banco:', {
        link_token: getString(eventData.link_token) ?? 'unknown',
      });
      return NextResponse.json({ received: true });
    }

    // Handle: account.refresh_intent.failed — refresh falló
    if (eventType === 'account.refresh_intent.failed') {
      const eventData = asRecord(event.data);
      console.warn('[Fintoc] account.refresh_intent.failed:', {
        refreshed_object_id: getString(eventData.refreshed_object_id),
        reason: getString(eventData.reason) ?? getString(eventData.failure_reason),
      });
      return NextResponse.json({ received: true });
    }

    // Handle: account.refresh_intent.succeeded — fetch and insert new movements
    if (eventType === 'account.refresh_intent.succeeded') {
      const eventData = asRecord(event.data);
      const newMovements = getNumber(eventData.new_movements);

      if (!newMovements || newMovements <= 0) {
        return NextResponse.json({ received: true, skipped: 'no_new_movements' });
      }

      // Resolve link_token from event payload, fallback to Fintoc API by account ID
      let linkToken = extractLinkTokenFromRefreshEvent(event);

      if (!linkToken) {
        const fintocAccountId = extractFintocAccountId(event);
        if (fintocAccountId) {
          linkToken = await resolveLinkTokenByFintocAccount(fintocAccountId);
        }
      }

      if (!linkToken) {
        console.warn('[Fintoc] account.refresh_intent.succeeded sin link_token resoluble');
        return NextResponse.json({ received: true, skipped: 'missing_link_token' });
      }

      const userId = await resolveUserId(linkToken);
      if (!userId) {
        console.warn('[Fintoc] No user found for link_token:', linkToken);
        return NextResponse.json({ received: true, skipped: 'unknown_link' });
      }

      const accountId = await resolveDestinationAccountId(userId);
      if (!accountId) {
        console.warn('[Fintoc] No account found for user:', userId);
        return NextResponse.json({ received: true, skipped: 'no_account' });
      }

      // Fetch actual movements from Fintoc API
      const movements = await fetchFintocMovements(linkToken);

      let inserted = 0;
      let skipped = 0;

      for (const movement of movements) {
        const fintocMovementId = getString(movement.id);
        const amount = normalizeAmount(movement.amount);
        if (!amount) {
          skipped++;
          continue;
        }

        const description =
          getString(movement.description) ||
          getString(movement.comment) ||
          getString(movement.memo) ||
          'Movimiento Fintoc';
        const type = mapMovementType(movement.type);
        const transactionDate = normalizeMovementDate(
          movement.post_date ?? movement.transaction_date ?? movement.date,
        );
        const currency = getString(movement.currency) ?? 'CLP';
        const messageId = fintocMovementId ? `fintoc_${fintocMovementId}` : null;

        // Dedup 1: Check by message_id (exact Fintoc movement ID)
        if (messageId && (await hasTransactionWithMessageId(userId, messageId))) {
          skipped++;
          continue;
        }

        // Dedup 2: Proximity with Gmail-sourced expenses (±1 day, same amount)
        if (type === 'expense' && (await isDuplicateByGmailProximity(userId, amount, transactionDate))) {
          skipped++;
          continue;
        }

        // Dedup 3: DB unique constraint on message_id as final safety net
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
          bank_reference: {
            fintoc_id: fintocMovementId,
            currency,
            raw_type: movement.type,
            link_token: linkToken,
            event_type: eventType,
          },
        });

        if (error) {
          if (error.code === '23505' && messageId) {
            skipped++;
            continue;
          }
          throw error;
        }

        inserted++;
      }

      return NextResponse.json(
        { received: true, inserted, skipped },
        { status: inserted > 0 ? 201 : 200 },
      );
    }

    // Unknown event type — acknowledge receipt
    return NextResponse.json({ received: true, unhandled: eventType });
  } catch (error) {
    console.error('[Fintoc webhook] Error:', error);
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
