import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';

type TransactionType = 'expense' | 'income';

const PRIMARY_OWNER_FULL_NAME = (process.env.SYNC_PRIMARY_OWNER_FULL_NAME ?? 'Alberto Muñoz').trim();

const INCOME_MARKERS = [
  /has\s+recibido/i,
  /transferencia\s+recibida/i,
  /te\s+(?:han|ha)\s+transferido/i,
  /abono\s+recibid[oa]/i,
  /se\s+acredit[oa]/i,
  /deposit[oa]\s+en\s+tu\s+cuenta/i,
] as const;

const OWN_TRANSFER_MARKERS = [
  /acabas\s+de\s+realizar/i,
  /transferencia\s+de\s+fondos\s+realizada/i,
  /entre\s+tus\s+cuentas/i,
  /cuentas?\s+propias?/i,
  /misma\s+titularidad/i,
] as const;

const TRANSFER_HINTS = [
  /transferencia/i,
  /destinatari[oa]/i,
  /beneficiari[oa]/i,
  /abono\s+a/i,
  /deposito\s+a/i,
] as const;

function normalizeComparableText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanDescription(value: string) {
  return value.replace(/&#8203;|[\u200B-\u200D\uFEFF]/g, '').trim();
}

function parsePositiveInteger(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;

  const normalized = String(value).trim();
  if (!/^\d+$/.test(normalized)) return null;

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parseAmount(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed === 0) return null;
  return Math.abs(parsed);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function collectTextValues(value: unknown, collector: string[]) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) collector.push(trimmed);
    return;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    collector.push(String(value));
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectTextValues(item, collector));
    return;
  }

  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectTextValues(item, collector));
  }
}

function extractReferenceText(bankReference: unknown) {
  const chunks: string[] = [];
  collectTextValues(bankReference, chunks);
  return chunks.join(' ');
}

function pickFirstString(source: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function hasMarker(markers: readonly RegExp[], text: string) {
  return markers.some((marker) => marker.test(text));
}

function matchesOwnerName(candidateName: string, expectedOwnerName: string) {
  const normalizedCandidate = normalizeComparableText(candidateName);
  const expectedTokens = normalizeComparableText(expectedOwnerName)
    .split(' ')
    .filter((token) => token.length > 1);

  if (!normalizedCandidate || expectedTokens.length === 0) {
    return false;
  }

  return expectedTokens.every((token) => normalizedCandidate.includes(token));
}

function inferType(rawType: unknown, text: string, rawAmount: unknown): TransactionType {
  if (rawType === 'income' || rawType === 'expense') {
    return rawType;
  }

  if (hasMarker(INCOME_MARKERS, text)) {
    return 'income';
  }

  if (hasMarker(OWN_TRANSFER_MARKERS, text)) {
    return 'expense';
  }

  const numericAmount = Number(rawAmount);
  if (Number.isFinite(numericAmount) && numericAmount < 0) {
    return 'expense';
  }

  return 'expense';
}

function shouldIgnoreSelfTransfer(description: string, text: string, detectedType: TransactionType) {
  if (detectedType === 'income') return false;
  if (!matchesOwnerName(description, PRIMARY_OWNER_FULL_NAME)) return false;

  // If the destination name is the owner and this still looks like a transfer, treat it as self-transfer.
  if (hasMarker(OWN_TRANSFER_MARKERS, text)) return true;
  if (hasMarker(TRANSFER_HINTS, text)) return true;

  const normalizedDescription = normalizeComparableText(description);
  const normalizedText = normalizeComparableText(text);
  return normalizedDescription.length > 0 && normalizedText === normalizedDescription;
}

function inferCategory(explicitCategory: unknown, text: string) {
  if (typeof explicitCategory === 'string' && explicitCategory.trim()) {
    return explicitCategory.trim();
  }

  if (hasMarker(TRANSFER_HINTS, text)) {
    return 'Transferencia';
  }

  return 'Otros';
}

export async function POST(request: Request) {
  try {
    // 1. Capa de Seguridad: Validar que el request traiga tu contraseña secreta
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
      return NextResponse.json({ error: 'Acceso denegado. Token inválido.' }, { status: 401 });
    }

    // 2. Extraer y validar datos del webhook
    const body = await request.json();
    const payload = asRecord(body);
    const userId = pickFirstString(payload, ['user_id']);
    const accountId = parsePositiveInteger(payload.account_id);
    const amount = parseAmount(payload.amount);

    if (!userId || !accountId || !amount) {
      return NextResponse.json(
        {
          error: 'Campos requeridos invalidos: user_id, account_id, amount.',
        },
        { status: 400 },
      );
    }

    const descriptionInput =
      pickFirstString(payload, ['description', 'commerce', 'merchant']) ?? 'Movimiento bancario';
    const cleanTitle = cleanDescription(descriptionInput);

    const bankReference = payload.bank_reference;
    const bankReferenceRecord = asRecord(bankReference);
    const messageId = pickFirstString(bankReferenceRecord, [
      'message_id',
      'gmail_id',
      'gmail_message_id',
      'messageId',
    ]);

    const textContext = normalizeComparableText(
      [
        cleanTitle,
        pickFirstString(payload, ['subject']) ?? '',
        extractReferenceText(bankReference),
      ].join(' '),
    );

    const detectedType = inferType(payload.type, textContext, payload.amount);

    if (shouldIgnoreSelfTransfer(cleanTitle, textContext, detectedType)) {
      return NextResponse.json(
        {
          success: true,
          ignored: true,
          reason: 'self_transfer',
          description: cleanTitle,
        },
        { status: 200 },
      );
    }

    const category = inferCategory(payload.category, textContext);

    // 3. Insertar la transacción; si llega un message_id, se guarda para idempotencia.
    const { data, error } = await supabaseAdmin
      .from('transactions')
      .insert([
        {
          user_id: userId,
          account_id: accountId,
          message_id: messageId,
          amount,
          type: detectedType,
          description: cleanTitle,
          category,
          source: 'webhook_banco',
          bank_reference: bankReference,
        },
      ])
      .select();

    if (error) {
      // 23505 = unique_violation (ej. message_id ya existente).
      if (error.code === '23505' && messageId) {
        return NextResponse.json(
          {
            success: true,
            duplicate: true,
            message_id: messageId,
          },
          { status: 200 },
        );
      }

      throw error;
    }

    // 4. Responder que todo salió bien
    return NextResponse.json({ success: true, data }, { status: 201 });

  } catch (error: unknown) {
    console.error('Error procesando el webhook:', error);
    const message = error instanceof Error ? error.message : 'Error inesperado en webhook.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
