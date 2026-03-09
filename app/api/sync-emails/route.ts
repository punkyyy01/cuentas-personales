import { google, gmail_v1 } from 'googleapis';
import type { User } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth-user';
import { supabaseAdmin } from '@/lib/supabase';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';

type DetectedTransactionType = 'expense' | 'income';

type BankTypeDetectionContext = {
  body: string;
  subject: string;
};

type BankConfig = {
  name: string;
  amountRegex: RegExp;
  commerceRegex?: RegExp;
  defaultCommerce: string;
  defaultType: DetectedTransactionType;
  detectType?: (context: BankTypeDetectionContext) => DetectedTransactionType | null;
};

const BANCO_ESTADO_TRANSFER_CONFIG: BankConfig = {
  name: 'Banco Estado',
  // Captura el monto despues de "Monto transferido:"
  amountRegex: /Monto\s+transferido\s*:\s*\$?\s*([\d.,]+)/i,
  // Captura el nombre despues de "Nombre :"
  commerceRegex:
    /Nombre\s*:\s*([^\n\r]+?)(?:\s+(?:RUT|Rut|Banco|Cuenta|Fecha|Monto|Asunto|Comentario|Glosa)|$)/i,
  defaultCommerce: 'Transferencia Banco Estado',
  defaultType: 'expense',
  detectType: ({ body }) => {
    if (/Acabas\s+de\s+realizar/i.test(body)) return 'expense';
    if (/Has\s+recibido/i.test(body)) return 'income';
    return null;
  },
};

const BANK_CONFIGS: Record<string, BankConfig> = {
  'notificaciones@cl.bancofalabella.com': {
    name: 'Banco Falabella (Transferencia)',
    // Captura el monto despues de "Monto transferido"
    amountRegex: /Monto\s+transferido\s*:?\s*\$?\s*([\d.,]+)/i,
    // Captura el nombre despues de "Nombre destinatario" hasta el siguiente campo
    commerceRegex: /Nombre\s+destinatario\s+([^\n\r]+?)(?:\s+(?:Rut|Banco|Producto|Nro|Asunto|Monto)|$)/i,
    defaultCommerce: 'Transferencia Falabella',
    defaultType: 'expense',
    detectType: ({ subject }) => {
      if (/Aviso\s+de\s+transferencia\s+de\s+fondos\s+realizada/i.test(subject)) {
        return 'expense';
      }
      return null;
    },
  },
  'notificaciones@mail.falabella.com': {
    name: 'Banco Falabella (Tarjeta)',
    // Captura montos de alertas de compra (ej. "Monto compra" / "Total compra").
    amountRegex: /(?:Monto|Total)\s+(?:de\s+la\s+)?(?:compra|transaccion)\s*:?\s*\$?\s*([\d.,]+)/i,
    // Captura el comercio cuando el correo expone el campo "Comercio"/"Establecimiento".
    commerceRegex:
      /(?:Comercio|Nombre\s+comercio|Nombre\s+del\s+comercio|Establecimiento)\s*:?\s*([^\n\r]+?)(?:\s+(?:Fecha|Hora|Tarjeta|Monto|Total|Autorizacion|Nro|N°|Operacion|Detalle|Disponible)|$)/i,
    defaultCommerce: 'Compra Tarjeta Falabella',
    defaultType: 'expense',
  },
  'noreply@correo.bancoestado.cl': BANCO_ESTADO_TRANSFER_CONFIG,
  // Compatibilidad con correos antiguos de Banco Estado.
  'notificaciones@bancoestado.cl': BANCO_ESTADO_TRANSFER_CONFIG,
  'no-responder@enel.com': {
    name: 'Enel',
    amountRegex: /Total\s+a\s+pagar\s*\$?\s*([\d.]+)/i,
    defaultCommerce: 'Enel Distribucion',
    defaultType: 'expense',
  },
  'no-responder@aguasandinas.cl': {
    name: 'Aguas Andinas',
    amountRegex: /Monto\s+a\s+pagar\s*\$?\s*([\d.]+)/i,
    defaultCommerce: 'Aguas Andinas',
    defaultType: 'expense',
  },
  'facturaelectronica@vtr.cl': {
    name: 'VTR',
    amountRegex: /Total\s+a\s+pagar\s*\$?\s*([\d.]+)/i,
    defaultCommerce: 'VTR Internet/Cable',
    defaultType: 'expense',
  },

  // ── Suscripciones ──
  'info@account.netflix.com': {
    name: 'Netflix',
    amountRegex: /(?:Total|Monto|Amount|Cargo)\s*:?\s*(?:CLP|USD)?\s*\$?\s*([\d.,]+)/i,
    defaultCommerce: 'Netflix',
    defaultType: 'expense',
  },
  'no-reply@spotify.com': {
    name: 'Spotify',
    amountRegex: /(?:Total|Monto|Amount|Cargo)\s*:?\s*(?:CLP|USD)?\s*\$?\s*([\d.,]+)/i,
    defaultCommerce: 'Spotify',
    defaultType: 'expense',
  },
  'disneyplus@mail.disneyplus.com': {
    name: 'Disney+',
    amountRegex: /(?:Total|Monto|Amount|Cargo)\s*:?\s*(?:CLP|USD)?\s*\$?\s*([\d.,]+)/i,
    defaultCommerce: 'Disney+',
    defaultType: 'expense',
  },
  'noreply@email.apple.com': {
    name: 'Apple/iCloud',
    amountRegex: /(?:Total|Monto|Amount|Cargo|Price)\s*:?\s*(?:CLP|USD)?\s*\$?\s*([\d.,]+)/i,
    defaultCommerce: 'Apple/iCloud',
    defaultType: 'expense',
  },
  'googleplay-noreply@google.com': {
    name: 'Google One/Play',
    amountRegex: /(?:Total|Monto|Amount|Cargo)\s*:?\s*(?:CLP|USD)?\s*\$?\s*([\d.,]+)/i,
    defaultCommerce: 'Google One',
    defaultType: 'expense',
  },

  // ── Delivery y Transporte ──
  'uber.us@uber.com': {
    name: 'Uber',
    amountRegex: /(?:Total|Monto|Cobro|Amount)\s*:?\s*(?:CLP|USD)?\s*\$?\s*([\d.,]+)/i,
    commerceRegex: /(?:Viaje|Trip|Restaurante|Restaurant)\s*:?\s*([^\n\r]{2,60})/i,
    defaultCommerce: 'Uber',
    defaultType: 'expense',
  },
  'noreply@uber.com': {
    name: 'Uber Eats',
    amountRegex: /(?:Total|Monto|Cobro|Amount)\s*:?\s*(?:CLP|USD)?\s*\$?\s*([\d.,]+)/i,
    commerceRegex: /(?:Pedido|Order)\s+(?:de|from)\s+([^\n\r]{2,60})/i,
    defaultCommerce: 'Uber Eats',
    defaultType: 'expense',
  },
  'noreply@rappi.com': {
    name: 'Rappi',
    amountRegex: /(?:Total|Monto|Valor|Cobro)\s*:?\s*(?:CLP)?\s*\$?\s*([\d.,]+)/i,
    commerceRegex: /(?:Pedido|Orden|Tienda|Restaurant)\s*:?\s*([^\n\r]{2,60})/i,
    defaultCommerce: 'Rappi',
    defaultType: 'expense',
  },
  'info@pedidosya.com': {
    name: 'PedidosYa',
    amountRegex: /(?:Total|Monto|Valor)\s*:?\s*(?:CLP)?\s*\$?\s*([\d.,]+)/i,
    commerceRegex: /(?:Pedido|Restaurante|Restaurant|Local)\s*:?\s*([^\n\r]{2,60})/i,
    defaultCommerce: 'PedidosYa',
    defaultType: 'expense',
  },
};

const SUPPORTED_BANK_SENDERS = Object.keys(BANK_CONFIGS);
const FALABELLA_SENDERS = new Set([
  'notificaciones@cl.bancofalabella.com',
  'notificaciones@mail.falabella.com',
]);
const MAX_MESSAGES_PER_USER = clamp(
  Number(process.env.GMAIL_SYNC_MAX_MESSAGES ?? 40),
  1,
  200,
);
const PRIMARY_OWNER_FULL_NAME = (process.env.SYNC_PRIMARY_OWNER_FULL_NAME ?? 'Alberto Muñoz').trim();
const GMAIL_SYNC_AFTER_DATE_ENV_KEYS = ['GMAIL_SYNC_AFTER_DATE', 'GMAIL_SYNC_AFTER'] as const;

const EXTERNAL_INCOME_MARKERS = [
  /Has\s+recibido/i,
  /Transferencia\s+recibida/i,
  /Te\s+(?:han|ha)\s+transferido/i,
  /(?:Te\s+)?(?:han\s+)?depositado/i,
  /(?:Te\s+)?(?:han\s+)?enviado\s+una\s+transferencia/i,
  /abono\s+recibid[oa]/i,
  /se\s+acredit[oa]/i,
] as const;

const OWN_TRANSFER_MARKERS = [
  /Acabas\s+de\s+realizar/i,
  /transferencia\s+de\s+fondos\s+realizada/i,
  /entre\s+tus\s+cuentas/i,
  /cuentas?\s+propias?/i,
  /misma\s+titularidad/i,
] as const;

const OWNER_DESTINATION_HINTS = [
  'hacia',
  'destinatario',
  'destinataria',
  'beneficiario',
  'beneficiaria',
  'a nombre de',
  'abono a',
  'deposito a',
] as const;

const REFRESH_TOKEN_FIELDS = [
  'google_refresh_token',
  'provider_refresh_token',
  'gmail_refresh_token',
  'refresh_token',
] as const;

const TOKEN_TABLES = ['user_google_tokens', 'google_tokens', 'gmail_tokens'] as const;

const GOOGLE_CLIENT_ID_ENV_KEYS = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_OAUTH_CLIENT_ID',
  'GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID',
  'SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID',
] as const;

const GOOGLE_CLIENT_SECRET_ENV_KEYS = [
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_OAUTH_CLIENT_SECRET',
  'GOTRUE_EXTERNAL_GOOGLE_SECRET',
  'SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET',
] as const;

const GOOGLE_REDIRECT_URI_ENV_KEYS = [
  'GOOGLE_REDIRECT_URI',
  'GOOGLE_OAUTH_REDIRECT_URI',
  'GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI',
  'SUPABASE_AUTH_EXTERNAL_GOOGLE_REDIRECT_URI',
] as const;

const ACCOUNT_ID_FIELDS = ['default_account_id', 'sync_account_id', 'account_id'] as const;

type TokenTableName = (typeof TOKEN_TABLES)[number];
type TokenSource = TokenTableName | 'auth_metadata' | 'provider_token_header';

type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
};

type TokenLookupDebug = {
  user_google_tokens_has_refresh_token: boolean;
  google_tokens_has_refresh_token: boolean;
  gmail_tokens_has_refresh_token: boolean;
  auth_metadata_has_refresh_token: boolean;
  provider_token_header_present: boolean;
  google_oauth_configured: boolean;
  selected_token_source?: TokenSource;
};

type UserSyncDiagnostics = {
  sender_breakdown: Record<string, number>;
  falabella_messages: number;
  falabella_regex_no_match: number;
  falabella_parse_examples: string[];
  self_transfers_ignored: number;
};

type SyncUser = {
  userId: string;
  email?: string;
  refreshToken?: string;
  accessToken?: string;
  preferredAccountId?: string;
  tokenSource: TokenSource;
};

type UserSyncStatus = 'ok' | 'no_account' | 'invalid_refresh_token' | 'error';

type UserSyncResult = {
  user_id: string;
  email?: string;
  status: UserSyncStatus;
  account_id?: number;
  listed_messages: number;
  inserted: number;
  duplicates: number;
  parse_skipped: number;
  token_source?: TokenSource;
  diagnostics?: UserSyncDiagnostics;
  error?: string;
};

type ParsedTransaction = {
  amount: number;
  commerce: string;
  detectedType: DetectedTransactionType;
  shouldIgnore?: boolean;
  ignoreReason?: 'self_transfer';
};

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function parsePositiveInteger(value: string | undefined) {
  if (!value) return null;
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return null;

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function createTokenLookupDebug(): TokenLookupDebug {
  return {
    user_google_tokens_has_refresh_token: false,
    google_tokens_has_refresh_token: false,
    gmail_tokens_has_refresh_token: false,
    auth_metadata_has_refresh_token: false,
    provider_token_header_present: false,
    google_oauth_configured: false,
  };
}

function getFirstConfiguredEnv(keys: readonly string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return null;
}

function getGoogleOAuthConfig(): GoogleOAuthConfig | null {
  const clientId = getFirstConfiguredEnv(GOOGLE_CLIENT_ID_ENV_KEYS);
  const clientSecret = getFirstConfiguredEnv(GOOGLE_CLIENT_SECRET_ENV_KEYS);
  const redirectUri = getFirstConfiguredEnv(GOOGLE_REDIRECT_URI_ENV_KEYS) ?? undefined;

  if (!clientId || !clientSecret) return null;

  return {
    clientId,
    clientSecret,
    redirectUri,
  };
}

function getProviderAccessTokenFromRequest(request: Request) {
  const token = request.headers.get('x-google-provider-token')?.trim();
  return token || null;
}

function isSyncPreconditionErrorMessage(message: string) {
  return (
    /Faltan credenciales OAuth de Google/i.test(message) ||
    /No hay refresh_token ni access_token de Google/i.test(message)
  );
}

function createEmptyUserSyncDiagnostics(): UserSyncDiagnostics {
  return {
    sender_breakdown: {},
    falabella_messages: 0,
    falabella_regex_no_match: 0,
    falabella_parse_examples: [],
    self_transfers_ignored: 0,
  };
}

function incrementCounter(counter: Record<string, number>, key: string) {
  counter[key] = (counter[key] ?? 0) + 1;
}

function summarizeBodyForDiagnostics(rawBody: string) {
  return rawBody.replace(/\s+/g, ' ').trim().slice(0, 240);
}

function buildDateStringForGmailSearch(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

function normalizeSyncAfterDate(value: string | null | undefined) {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const slashDateMatch = trimmed.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (slashDateMatch) {
    return `${slashDateMatch[1]}/${slashDateMatch[2]}/${slashDateMatch[3]}`;
  }

  const dashDateMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dashDateMatch) {
    return `${dashDateMatch[1]}/${dashDateMatch[2]}/${dashDateMatch[3]}`;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return buildDateStringForGmailSearch(parsed);
}

function resolveSyncAfterDate(request: Request, now = new Date()) {
  const requestUrl = new URL(request.url);
  const afterFromQuery = normalizeSyncAfterDate(requestUrl.searchParams.get('after'));
  if (afterFromQuery) return afterFromQuery;

  const afterFromEnv = normalizeSyncAfterDate(getFirstConfiguredEnv(GMAIL_SYNC_AFTER_DATE_ENV_KEYS));
  if (afterFromEnv) return afterFromEnv;

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return buildDateStringForGmailSearch(monthStart);
}

function buildMonthlySearchQuery(afterDate: string) {
  const senderClauses = SUPPORTED_BANK_SENDERS.map((email) => `from:${email}`);
  const senderFilter = senderClauses.length > 1 ? `(${senderClauses.join(' OR ')})` : senderClauses[0];
  return `${senderFilter} after:${afterDate}`;
}

// ── Categorización Inteligente ──

type CategoryRule = {
  pattern: RegExp;
  category: string;
};

const SENDER_CATEGORY_MAP: Record<string, string> = {
  // Bancos → si el comercio indica destino, se refina abajo
  'notificaciones@cl.bancofalabella.com': 'Transferencia',
  'notificaciones@mail.falabella.com': 'Compras',
  'noreply@correo.bancoestado.cl': 'Transferencia',
  'notificaciones@bancoestado.cl': 'Transferencia',
  // Servicios
  'no-responder@enel.com': 'Hogar/Cuentas',
  'no-responder@aguasandinas.cl': 'Hogar/Cuentas',
  'facturaelectronica@vtr.cl': 'Hogar/Cuentas',
  // Suscripciones
  'info@account.netflix.com': 'Suscripciones',
  'no-reply@spotify.com': 'Suscripciones',
  'disneyplus@mail.disneyplus.com': 'Suscripciones',
  'noreply@email.apple.com': 'Suscripciones',
  'googleplay-noreply@google.com': 'Suscripciones',
  // Delivery y Transporte
  'uber.us@uber.com': 'Transporte',
  'noreply@uber.com': 'Delivery',
  'noreply@rappi.com': 'Delivery',
  'info@pedidosya.com': 'Delivery',
};

const COMMERCE_CATEGORY_RULES: CategoryRule[] = [
  // Supermercado
  { pattern: /\b(?:lider|jumbo|unimarc|tottus|acuenta|santa\s*isabel|mayorista)\b/i, category: 'Supermercado' },
  // Farmacia / Salud
  { pattern: /\b(?:farmacia|cruz\s*verde|salcobrand|ahumada|doctor|clinica|hospital|salud|dental)\b/i, category: 'Salud' },
  // Comida / Restaurant
  { pattern: /\b(?:restaur|comida|pizza|sushi|burger|mcdonalds|starbucks|cafe|panaderia|pasteleria)\b/i, category: 'Comida' },
  // Transporte
  { pattern: /\b(?:uber|cabify|didi|taxi|metro|bip|bencina|copec|shell|petrobras)\b/i, category: 'Transporte' },
  // Delivery
  { pattern: /\b(?:rappi|pedidosya|ubereats|cornershop|justo)\b/i, category: 'Delivery' },
  // Hogar / Cuentas
  { pattern: /\b(?:enel|chilquinta|aguas|luz|agua|gas|electricidad|calefon|internet|telefono)\b/i, category: 'Hogar/Cuentas' },
  // Educacion
  { pattern: /\b(?:colegio|universidad|escuela|curso|udemy|coursera|libro)\b/i, category: 'Educacion' },
  // Ropa
  { pattern: /\b(?:falabella|paris|ripley|zara|h&m|hm|nike|adidas|ropa|zapatilla)\b/i, category: 'Ropa' },
  // Ocio / Entretenimiento
  { pattern: /\b(?:cine|hoyts|cinemark|teatro|concierto|spotify|netflix|disney|entretenimiento|juego|steam|playstation|xbox)\b/i, category: 'Ocio' },
  // Suscripciones
  { pattern: /\b(?:suscripci|membresia|mensualidad|icloud|google\s*one)\b/i, category: 'Suscripciones' },
];

function inferCategory(sender: string | null, commerce: string, description: string): string {
  // 1. Buscar por remitente
  const senderKey = (sender ?? '').toLowerCase();
  const senderCategory = SENDER_CATEGORY_MAP[senderKey];

  // 2. Buscar por texto del comercio/descripcion
  const textToCheck = `${commerce} ${description}`.toLowerCase();
  for (const rule of COMMERCE_CATEGORY_RULES) {
    if (rule.pattern.test(textToCheck)) {
      return rule.category;
    }
  }

  // 3. Fallback al mapeo por sender
  if (senderCategory) return senderCategory;

  return 'Otros';
}

// Clean HTML tags before applying regex
const cleanEmailBody = (body: string): string => {
  return body.replace(/<[^>]*>?/gm, ' ');
};

function decodeBase64Url(value: string | null | undefined) {
  if (!value) return '';

  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = (4 - (normalized.length % 4)) % 4;
    return Buffer.from(normalized + '='.repeat(padding), 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_match, hexCode: string) =>
      String.fromCharCode(parseInt(hexCode, 16)),
    )
    .replace(/&#(\d+);/g, (_match, decimalCode: string) =>
      String.fromCharCode(Number(decimalCode)),
    );
}

function cleanHtmlEmailBody(html: string) {
  const withoutTags = html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]*>?/gm, ' ');

  return decodeHtmlEntities(withoutTags);
}

function collectPlainTextParts(part: gmail_v1.Schema$MessagePart | undefined, collector: string[]) {
  if (!part) return;

  const hasFilename = Boolean(part.filename && part.filename.trim());
  if (hasFilename) {
    return;
  }

  if (part.mimeType === 'text/plain' && part.body?.data) {
    const decoded = decodeBase64Url(part.body.data);
    if (decoded.trim()) collector.push(decoded);
  }

  if (Array.isArray(part.parts)) {
    part.parts.forEach((child) => collectPlainTextParts(child, collector));
  }
}

function collectHtmlParts(part: gmail_v1.Schema$MessagePart | undefined, collector: string[]) {
  if (!part) return;

  const hasFilename = Boolean(part.filename && part.filename.trim());
  if (hasFilename) {
    return;
  }

  if (part.mimeType === 'text/html' && part.body?.data) {
    const decoded = decodeBase64Url(part.body.data);
    const cleaned = cleanHtmlEmailBody(decoded);
    if (cleaned.trim()) collector.push(cleaned);
  }

  if (Array.isArray(part.parts)) {
    part.parts.forEach((child) => collectHtmlParts(child, collector));
  }
}

const extractBasicEmailBody = (message: gmail_v1.Schema$Message): string => {
  const plainTextParts: string[] = [];
  collectPlainTextParts(message.payload, plainTextParts);

  const htmlParts: string[] = [];
  collectHtmlParts(message.payload, htmlParts);

  const availableParts = [...plainTextParts, ...htmlParts].filter((part) => part.trim());
  if (availableParts.length > 0) {
    return cleanEmailBody(availableParts.join('\n'));
  }

  return cleanEmailBody(message.snippet || '');
};

function getMessageHeaderValue(message: gmail_v1.Schema$Message, headerName: string) {
  const targetName = headerName.toLowerCase();
  const headers = message.payload?.headers ?? [];
  return headers.find((header) => header.name?.toLowerCase() === targetName)?.value?.trim() ?? '';
}

function getMessageSender(message: gmail_v1.Schema$Message) {
  const fromHeader = getMessageHeaderValue(message, 'from');
  if (!fromHeader) return null;

  const inAngleBrackets = fromHeader.match(/<([^>]+)>/);
  if (inAngleBrackets?.[1]) {
    return inAngleBrackets[1].trim().toLowerCase();
  }

  const standalone = fromHeader.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (standalone?.[0]) {
    return standalone[0].trim().toLowerCase();
  }

  return fromHeader;
}

function normalizeComparableText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

function hasMarkerInTexts(markers: readonly RegExp[], values: string[]) {
  return values.some((value) => markers.some((marker) => marker.test(value)));
}

function looksLikeIncomingTransferToOwner(body: string, subject: string, expectedOwnerName: string) {
  const normalizedText = normalizeComparableText(`${body} ${subject}`);
  if (!normalizedText) return false;

  const ownerTokens = normalizeComparableText(expectedOwnerName)
    .split(' ')
    .filter((token) => token.length > 1);

  if (ownerTokens.length === 0) return false;

  const hasOwnerName = ownerTokens.every((token) => normalizedText.includes(token));
  if (!hasOwnerName) return false;

  return OWNER_DESTINATION_HINTS.some((hint) => normalizedText.includes(hint));
}

function applyOwnerIdentityRules(
  parsed: ParsedTransaction,
  body: string,
  subject: string,
): ParsedTransaction {
  if (!matchesOwnerName(parsed.commerce, PRIMARY_OWNER_FULL_NAME)) {
    return parsed;
  }

  const textsToEvaluate = [body, subject];
  if (hasMarkerInTexts(EXTERNAL_INCOME_MARKERS, textsToEvaluate)) {
    return {
      ...parsed,
      detectedType: 'income',
      shouldIgnore: false,
      ignoreReason: undefined,
    };
  }

  if (hasMarkerInTexts(OWN_TRANSFER_MARKERS, textsToEvaluate)) {
    return {
      ...parsed,
      shouldIgnore: true,
      ignoreReason: 'self_transfer',
    };
  }

  if (parsed.detectedType === 'income') {
    return {
      ...parsed,
      shouldIgnore: false,
      ignoreReason: undefined,
    };
  }

  if (looksLikeIncomingTransferToOwner(body, subject, PRIMARY_OWNER_FULL_NAME)) {
    return {
      ...parsed,
      detectedType: 'income',
      shouldIgnore: false,
      ignoreReason: undefined,
    };
  }

  return {
    ...parsed,
    shouldIgnore: true,
    ignoreReason: 'self_transfer',
  };
}

function parseLocalizedAmount(rawAmount: string) {
  const compact = rawAmount.replace(/\s/g, '').replace(/[^\d.,-]/g, '');
  if (!compact) return null;

  const hasComma = compact.includes(',');
  const hasDot = compact.includes('.');
  let normalized = compact;

  if (hasComma && hasDot) {
    normalized = compact.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    normalized = compact.replace(/,/g, '.');
  } else if (hasDot) {
    // Para montos CLP, el punto se interpreta como separador de miles.
    normalized = compact.replace(/\./g, '');
  }

  const amount = Number(normalized);
  if (!Number.isFinite(amount)) return null;
  if (amount <= 0) return null;
  return amount;
}

function getBankConfigForSender(sender: string | null): BankConfig | null {
  if (!sender) return null;
  return BANK_CONFIGS[sender.toLowerCase()] ?? null;
}

function extractTransactionFromEmail(
  rawBody: string,
  sender: string | null,
  subject: string,
): ParsedTransaction | null {
  const bankConfig = getBankConfigForSender(sender);
  if (!bankConfig) return null;

  const body = cleanEmailBody(rawBody);

  const amountMatch = body.match(bankConfig.amountRegex);
  if (!amountMatch?.[1]) {
    return null;
  }

  const amount = parseLocalizedAmount(amountMatch[1]);
  if (!amount) {
    return null;
  }

  const commerceMatch = bankConfig.commerceRegex ? body.match(bankConfig.commerceRegex) : null;
  const commerce = commerceMatch?.[1]?.trim() || bankConfig.defaultCommerce;

  if (!commerce) return null;

  const detectedType = bankConfig.detectType?.({ body, subject }) ?? bankConfig.defaultType;

  return applyOwnerIdentityRules(
    {
      amount,
      commerce,
      detectedType,
    },
    body,
    subject,
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') {
    return value as Record<string, unknown>;
  }
  return {};
}

function pickFirstString(source: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function isMissingTableError(error: unknown) {
  const payload = asRecord(error);
  const code = typeof payload.code === 'string' ? payload.code : '';
  const message = typeof payload.message === 'string' ? payload.message : '';
  return code === 'PGRST205' || /Could not find the table|relation .+ does not exist/i.test(message);
}

function toPositiveAccountId(value: unknown) {
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
  return toPositiveAccountId(data?.id);
}

async function createDefaultAccountForUser(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('accounts_cards')
    .insert([
      {
        user_id: userId,
        name: 'Cuenta Principal',
        // Using debit_card keeps compatibility with account_type enums and text columns.
        type: 'debit_card',
      },
    ])
    .select('id')
    .maybeSingle();

  if (error) throw error;
  return toPositiveAccountId(data?.id);
}

function isInvalidRefreshTokenError(error: unknown) {
  const payload = asRecord(error);
  const rawMessage =
    (typeof payload.message === 'string' && payload.message) ||
    (typeof payload.error_description === 'string' && payload.error_description) ||
    '';
  return /invalid_grant|token has been expired or revoked|invalid refresh token/i.test(rawMessage);
}

function normalizeTokenEmail(value: string | undefined) {
  const normalized = (value ?? '').trim().toLowerCase();
  return normalized || undefined;
}

function getTokenSourcePriority(source: TokenSource) {
  if (source === 'user_google_tokens') return 0;
  if (source === 'google_tokens') return 1;
  if (source === 'gmail_tokens') return 2;
  if (source === 'auth_metadata') return 3;
  return 4;
}

function buildSyncUserDedupeKey(candidate: SyncUser) {
  const normalizedEmail = normalizeTokenEmail(candidate.email);
  if (normalizedEmail) return `${candidate.userId}::${normalizedEmail}`;

  const normalizedRefresh = candidate.refreshToken?.trim() || '';
  if (normalizedRefresh) return `${candidate.userId}::${normalizedRefresh}`;

  return `${candidate.userId}::${candidate.tokenSource}`;
}

function dedupeSyncUsers(candidates: SyncUser[]) {
  const dedup = new Map<string, SyncUser>();

  candidates.forEach((candidate) => {
    const normalizedCandidate: SyncUser = {
      ...candidate,
      email: normalizeTokenEmail(candidate.email),
    };

    const key = buildSyncUserDedupeKey(normalizedCandidate);
    const existing = dedup.get(key);
    if (!existing) {
      dedup.set(key, normalizedCandidate);
      return;
    }

    if (!existing.preferredAccountId && normalizedCandidate.preferredAccountId) {
      dedup.set(key, normalizedCandidate);
      return;
    }

    const existingPriority = getTokenSourcePriority(existing.tokenSource);
    const candidatePriority = getTokenSourcePriority(normalizedCandidate.tokenSource);
    if (candidatePriority < existingPriority) {
      dedup.set(key, normalizedCandidate);
    }
  });

  return Array.from(dedup.values());
}

async function getUsersFromTokenTable(
  tableName: TokenTableName,
  userId?: string,
): Promise<SyncUser[]> {
  let query = supabaseAdmin
    .from(tableName)
    .select('user_id, email, refresh_token, account_id')
    .not('refresh_token', 'is', null);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;

  if (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }

  const rows = Array.isArray(data) ? data : [];

  const users: SyncUser[] = [];

  rows.forEach((row) => {
    const record = asRecord(row);
    const userId = pickFirstString(record, ['user_id']);
    const refreshToken = pickFirstString(record, ['refresh_token']);
    if (!userId || !refreshToken) return;

    users.push({
      userId,
      email: normalizeTokenEmail(pickFirstString(record, ['email']) ?? undefined),
      refreshToken,
      preferredAccountId: pickFirstString(record, ['account_id']) ?? undefined,
      tokenSource: tableName,
    });
  });

  return users;
}

async function getUsersFromAuthMetadata(): Promise<SyncUser[]> {
  const users: SyncUser[] = [];
  const perPage = 200;

  for (let page = 1; ; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const batch = data?.users ?? [];

    batch.forEach((user) => {
      const mergedMetadata = {
        ...asRecord(user.user_metadata),
        ...asRecord(user.app_metadata),
      };

      const refreshToken = pickFirstString(mergedMetadata, REFRESH_TOKEN_FIELDS);
      if (!refreshToken) return;

      users.push({
        userId: user.id,
        email: normalizeTokenEmail(user.email ?? undefined),
        refreshToken,
        preferredAccountId: pickFirstString(mergedMetadata, ACCOUNT_ID_FIELDS) ?? undefined,
        tokenSource: 'auth_metadata',
      });
    });

    if (batch.length < perPage) break;
  }

  return users;
}

async function getUsersWithRefreshTokens(): Promise<SyncUser[]> {
  const tokenTableSources = await Promise.all(
    TOKEN_TABLES.map((tableName) => getUsersFromTokenTable(tableName)),
  );

  const tokenTableUsers = dedupeSyncUsers(tokenTableSources.flat());
  const authMetadataUsers = dedupeSyncUsers(await getUsersFromAuthMetadata());

  if (tokenTableUsers.length === 0) {
    return authMetadataUsers;
  }

  const tokenTableUserIds = new Set(tokenTableUsers.map((candidate) => candidate.userId));
  const metadataFallback = authMetadataUsers.filter(
    (candidate) => !tokenTableUserIds.has(candidate.userId),
  );

  return [...tokenTableUsers, ...metadataFallback];
}

function getUserFromAuthMetadata(user: User): SyncUser | null {
  const mergedMetadata = {
    ...asRecord(user.user_metadata),
    ...asRecord(user.app_metadata),
  };

  const refreshToken = pickFirstString(mergedMetadata, REFRESH_TOKEN_FIELDS);
  if (!refreshToken) return null;

  return {
    userId: user.id,
    email: normalizeTokenEmail(user.email ?? undefined),
    refreshToken,
    preferredAccountId: pickFirstString(mergedMetadata, ACCOUNT_ID_FIELDS) ?? undefined,
    tokenSource: 'auth_metadata',
  };
}

async function getSyncUsersForAuthenticatedUser(
  user: User,
): Promise<{ syncUsers: SyncUser[]; tokenLookup: TokenLookupDebug }> {
  const tokenLookup = createTokenLookupDebug();

  const usersByTable = await Promise.all(
    TOKEN_TABLES.map((tableName) => getUsersFromTokenTable(tableName, user.id)),
  );

  const userGoogleTokens = usersByTable[0] ?? [];
  const googleTokens = usersByTable[1] ?? [];
  const gmailTokens = usersByTable[2] ?? [];

  tokenLookup.user_google_tokens_has_refresh_token = userGoogleTokens.length > 0;
  tokenLookup.google_tokens_has_refresh_token = googleTokens.length > 0;
  tokenLookup.gmail_tokens_has_refresh_token = gmailTokens.length > 0;

  const tokenTableCandidates = dedupeSyncUsers(usersByTable.flat());
  if (tokenTableCandidates.length > 0) {
    tokenLookup.selected_token_source = tokenTableCandidates[0].tokenSource;
    return { syncUsers: tokenTableCandidates, tokenLookup };
  }

  const metadataCandidate = getUserFromAuthMetadata(user);
  if (metadataCandidate) {
    tokenLookup.auth_metadata_has_refresh_token = true;
    tokenLookup.selected_token_source = metadataCandidate.tokenSource;
    return { syncUsers: [metadataCandidate], tokenLookup };
  }

  return { syncUsers: [], tokenLookup };
}

async function resolveDestinationAccountId(userId: string, preferredAccountId?: string) {
  const preferredAccountAsInt = parsePositiveInteger(preferredAccountId);

  if (preferredAccountAsInt) {
    const { data, error } = await supabaseAdmin
      .from('accounts_cards')
      .select('id')
      .eq('user_id', userId)
      .eq('id', preferredAccountAsInt)
      .maybeSingle();

    if (error) throw error;
    const preferredId = toPositiveAccountId(data?.id);
    if (preferredId) return preferredId;
  }

  const existingAccountId = await findFirstAccountIdForUser(userId);
  if (existingAccountId) return existingAccountId;

  try {
    const createdAccountId = await createDefaultAccountForUser(userId);
    if (createdAccountId) {
      console.info('[sync-emails] Default account created for user', {
        user_id: userId,
        account_id: createdAccountId,
      });
      return createdAccountId;
    }
  } catch (error) {
    console.warn('[sync-emails] Failed to auto-create default account', {
      user_id: userId,
      error: error instanceof Error ? error.message : 'unknown_error',
    });
  }

  return findFirstAccountIdForUser(userId);
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

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// Dedup cross-source: check if a Fintoc transaction with same amount exists within ±1 day.
async function isDuplicateByFintocProximity(
  userId: string,
  amount: number,
  emailDate: string,
): Promise<boolean> {
  const date = new Date(emailDate);
  if (Number.isNaN(date.getTime())) return false;

  const dayBefore = new Date(date.getTime() - ONE_DAY_MS).toISOString();
  const dayAfter = new Date(date.getTime() + ONE_DAY_MS).toISOString();

  const byTransactionDate = await supabaseAdmin
    .from('transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'expense')
    .eq('source', 'fintoc')
    .eq('amount', amount)
    .gte('transaction_date', dayBefore)
    .lte('transaction_date', dayAfter)
    .limit(1);

  if (byTransactionDate.error) throw byTransactionDate.error;
  if ((byTransactionDate.data?.length ?? 0) > 0) return true;

  const byCreatedAt = await supabaseAdmin
    .from('transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'expense')
    .eq('source', 'fintoc')
    .eq('amount', amount)
    .gte('created_at', dayBefore)
    .lte('created_at', dayAfter)
    .limit(1);

  if (byCreatedAt.error) throw byCreatedAt.error;
  return (byCreatedAt.data?.length ?? 0) > 0;
}

// 1) Descripcion limpia para evitar caracteres invisibles que rompen deduplicacion.
const cleanDescription = (text: string) => {
  return text.replace(/&#8203;|[\u200B-\u200D\uFEFF]/g, '').trim();
};

function getOAuthClient(refreshToken?: string, accessToken?: string) {
  const oauthConfig = getGoogleOAuthConfig();
  const normalizedRefreshToken = refreshToken?.trim() || '';
  const normalizedAccessToken = accessToken?.trim() || '';

  if (!oauthConfig && !normalizedAccessToken) {
    throw new Error(
      'Faltan credenciales OAuth de Google en el servidor. Configura GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET (o sus equivalentes de Supabase) para refrescar tokens de Gmail.',
    );
  }

  const oauth2Client = oauthConfig
    ? new google.auth.OAuth2(oauthConfig.clientId, oauthConfig.clientSecret, oauthConfig.redirectUri)
    : new google.auth.OAuth2();

  const credentials: { refresh_token?: string; access_token?: string } = {};

  if (normalizedRefreshToken) {
    credentials.refresh_token = normalizedRefreshToken;
  }

  if (normalizedAccessToken) {
    credentials.access_token = normalizedAccessToken;
  }

  if (credentials.refresh_token || credentials.access_token) {
    oauth2Client.setCredentials(credentials);
  }

  return oauth2Client;
}

async function listMessageIds(gmail: gmail_v1.Gmail, searchQuery: string) {
  const ids: string[] = [];
  let pageToken: string | undefined;

  while (ids.length < MAX_MESSAGES_PER_USER) {
    const remaining = MAX_MESSAGES_PER_USER - ids.length;

    const { data } = await gmail.users.messages.list({
      userId: 'me',
      q: searchQuery,
      maxResults: Math.min(50, remaining),
      pageToken,
      fields: 'messages(id),nextPageToken',
    });

    const pageIds = (data.messages ?? [])
      .map((message) => message.id)
      .filter((id): id is string => Boolean(id));

    ids.push(...pageIds);

    if (!data.nextPageToken || pageIds.length === 0) {
      break;
    }

    pageToken = data.nextPageToken;
  }

  return ids;
}

async function getBasicMessage(gmail: gmail_v1.Gmail, messageId: string) {
  const { data } = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
    fields:
      'id,threadId,internalDate,snippet,payload(headers(name,value),mimeType,filename,body/data,parts(mimeType,filename,body/data,parts(mimeType,filename,body/data)))',
  });

  return data;
}

function getEmailMessageDateIso(message: gmail_v1.Schema$Message) {
  const internalDateRaw = typeof message.internalDate === 'string' ? message.internalDate.trim() : '';
  if (/^\d+$/.test(internalDateRaw)) {
    const timestampMs = Number.parseInt(internalDateRaw, 10);
    if (Number.isFinite(timestampMs) && timestampMs > 0) {
      return new Date(timestampMs).toISOString();
    }
  }

  const headers = message.payload?.headers ?? [];
  const dateHeader = headers
    .find((header) => header.name?.toLowerCase() === 'date')
    ?.value?.trim();

  if (dateHeader) {
    const parsed = new Date(dateHeader);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return new Date().toISOString();
}

async function syncUserTransactions(user: SyncUser, searchQuery: string): Promise<UserSyncResult> {
  const accountId = await resolveDestinationAccountId(user.userId, user.preferredAccountId);
  const diagnostics = createEmptyUserSyncDiagnostics();

  if (!accountId || !Number.isSafeInteger(accountId)) {
    return {
      user_id: user.userId,
      email: user.email,
      status: 'no_account',
      listed_messages: 0,
      inserted: 0,
      duplicates: 0,
      parse_skipped: 0,
      token_source: user.tokenSource,
      diagnostics,
      error: 'El usuario no tiene cuentas en accounts_cards para registrar transacciones.',
    };
  }

  if (!user.refreshToken && !user.accessToken) {
    return {
      user_id: user.userId,
      email: user.email,
      status: 'error',
      account_id: accountId,
      listed_messages: 0,
      inserted: 0,
      duplicates: 0,
      parse_skipped: 0,
      token_source: user.tokenSource,
      diagnostics,
      error: 'No hay refresh_token ni access_token de Google disponibles para sincronizar.',
    };
  }

  let oauth2Client: ReturnType<typeof getOAuthClient>;
  try {
    oauth2Client = getOAuthClient(user.refreshToken, user.accessToken);
  } catch (error) {
    return {
      user_id: user.userId,
      email: user.email,
      status: 'error',
      account_id: accountId,
      listed_messages: 0,
      inserted: 0,
      duplicates: 0,
      parse_skipped: 0,
      token_source: user.tokenSource,
      diagnostics,
      error: error instanceof Error ? error.message : 'No se pudo crear el cliente OAuth de Google.',
    };
  }

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  let messageIds: string[];
  try {
    messageIds = await listMessageIds(gmail, searchQuery);
  } catch (error) {
    if (isInvalidRefreshTokenError(error)) {
      return {
        user_id: user.userId,
        email: user.email,
        status: 'invalid_refresh_token',
        account_id: accountId,
        listed_messages: 0,
        inserted: 0,
        duplicates: 0,
        parse_skipped: 0,
        token_source: user.tokenSource,
        diagnostics,
        error: 'refresh_token invalido o revocado en Google.',
      };
    }

    throw error;
  }

  let inserted = 0;
  let duplicates = 0;
  let parseSkipped = 0;

  for (const messageId of messageIds) {
    const alreadyExists = await hasTransactionWithMessageId(user.userId, messageId);
    if (alreadyExists) {
      duplicates += 1;
      continue;
    }

    const message = await getBasicMessage(gmail, messageId);
    const basicBody = extractBasicEmailBody(message);
    const sender = getMessageSender(message);
    const subject = getMessageHeaderValue(message, 'subject');
    const senderKey = sender ?? 'unknown_sender';
    incrementCounter(diagnostics.sender_breakdown, senderKey);

    const isFalabellaSender = FALABELLA_SENDERS.has(senderKey);
    if (isFalabellaSender) {
      diagnostics.falabella_messages += 1;
    }

    const parsed = extractTransactionFromEmail(basicBody, sender, subject);

    if (!parsed) {
      parseSkipped += 1;

      if (isFalabellaSender) {
        diagnostics.falabella_regex_no_match += 1;
        if (diagnostics.falabella_parse_examples.length < 3) {
          const snippet = summarizeBodyForDiagnostics(basicBody);
          if (snippet) diagnostics.falabella_parse_examples.push(snippet);
        }
      }

      continue;
    }

    if (parsed.shouldIgnore) {
      parseSkipped += 1;
      if (parsed.ignoreReason === 'self_transfer') {
        diagnostics.self_transfers_ignored += 1;
      }
      continue;
    }

    const emailDate = getEmailMessageDateIso(message);
    const merchantName = parsed.commerce;
    const amount = parsed.amount;
    const transactionType = parsed.detectedType;
    const bankReference = {
      message_id: messageId,
      sender,
      account_id: accountId,
      synced_via: 'sync_emails',
      detected_type: transactionType,
    };

    // 2.5) Categorización automática
    const autoCategory = inferCategory(sender, merchantName, subject);

    // 2.7) Dedup cross-source: skip if Fintoc already has the same expense (±1 day, same amount)
    if (transactionType === 'expense' && (await isDuplicateByFintocProximity(user.userId, amount, emailDate))) {
      duplicates += 1;
      continue;
    }

    // 2) Insercion idempotente por message_id.
    const { error: upsertError } = await supabaseAdmin
      .from('transactions')
      .upsert(
        {
          user_id: user.userId,
          account_id: accountId,
          message_id: messageId,
          description: cleanDescription(merchantName),
          amount,
          type: transactionType,
          category: autoCategory,
          source: 'webhook_banco',
          created_at: emailDate,
          bank_reference: bankReference,
        },
        {
          onConflict: 'message_id',
        },
      );

    if (upsertError) {
      console.error('Error en Upsert:', upsertError.message);
      throw new Error(upsertError.message);
    }

    inserted += 1;
  }

  if (inserted === 0) {
    console.warn('[sync-emails] summary.inserted=0 for user', {
      user_id: user.userId,
      email: user.email,
      token_source: user.tokenSource,
      listed_messages: messageIds.length,
      duplicates,
      parse_skipped: parseSkipped,
      falabella_messages: diagnostics.falabella_messages,
      falabella_regex_no_match: diagnostics.falabella_regex_no_match,
      falabella_parse_examples: diagnostics.falabella_parse_examples,
      self_transfers_ignored: diagnostics.self_transfers_ignored,
    });
  }

  return {
    user_id: user.userId,
    email: user.email,
    status: 'ok',
    account_id: accountId,
    listed_messages: messageIds.length,
    inserted,
    duplicates,
    parse_skipped: parseSkipped,
    token_source: user.tokenSource,
    diagnostics,
  };
}

function getConfiguredSyncSecrets() {
  return [process.env.SYNC_EMAILS_SECRET, process.env.CRON_SECRET]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
}

function hasValidSyncSecret(request: Request, expectedSecrets: string[]) {
  if (expectedSecrets.length === 0) return false;

  const authorization = request.headers.get('authorization') ?? '';
  const bearerToken = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : '';

  const urlSecret = new URL(request.url).searchParams.get('secret')?.trim() ?? '';
  return expectedSecrets.includes(bearerToken) || expectedSecrets.includes(urlSecret);
}

function buildSyncSummary(usersFound: number, userResults: UserSyncResult[]) {
  return {
    users_found: usersFound,
    users_ok: userResults.filter((result) => result.status === 'ok').length,
    users_no_account: userResults.filter((result) => result.status === 'no_account').length,
    users_invalid_refresh_token: userResults.filter(
      (result) => result.status === 'invalid_refresh_token',
    ).length,
    users_error: userResults.filter((result) => result.status === 'error').length,
    listed_messages: userResults.reduce((sum, result) => sum + result.listed_messages, 0),
    inserted: userResults.reduce((sum, result) => sum + result.inserted, 0),
    duplicates: userResults.reduce((sum, result) => sum + result.duplicates, 0),
    parse_skipped: userResults.reduce((sum, result) => sum + result.parse_skipped, 0),
  };
}

async function runFullSync(request: Request) {
  const startedAt = new Date().toISOString();
  const syncAfterDate = resolveSyncAfterDate(request);
  const searchQuery = buildMonthlySearchQuery(syncAfterDate);
  const users = await getUsersWithRefreshTokens();

  const userResults: UserSyncResult[] = [];
  for (const user of users) {
    try {
      const result = await syncUserTransactions(user, searchQuery);
      userResults.push(result);
    } catch (error) {
      userResults.push({
        user_id: user.userId,
        email: user.email,
        status: 'error',
        listed_messages: 0,
        inserted: 0,
        duplicates: 0,
        parse_skipped: 0,
        error: error instanceof Error ? error.message : 'Error desconocido sincronizando usuario.',
      });
    }
  }

  return NextResponse.json(
    {
      ok: true,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      sync_after: syncAfterDate,
      gmail_query: searchQuery,
      summary: buildSyncSummary(users.length, userResults),
      users: userResults,
    },
    { status: 200 },
  );
}

async function runAuthenticatedUserSync(user: User, request: Request) {
  // Rate limit: max 5 manual syncs per user per 10 minutes
  if (!checkRateLimit(`sync-emails:${user.id}`, 5, 10 * 60_000)) {
    return NextResponse.json(
      { ok: false, error: 'Demasiadas solicitudes. Espera unos minutos antes de volver a sincronizar.' },
      { status: 429 },
    );
  }

  const startedAt = new Date().toISOString();
  const syncAfterDate = resolveSyncAfterDate(request);
  const searchQuery = buildMonthlySearchQuery(syncAfterDate);
  const providerAccessToken = getProviderAccessTokenFromRequest(request);
  const { syncUsers, tokenLookup } = await getSyncUsersForAuthenticatedUser(user);

  const oauthConfig = getGoogleOAuthConfig();
  tokenLookup.google_oauth_configured = Boolean(oauthConfig);
  tokenLookup.provider_token_header_present = Boolean(providerAccessToken);

  const syncCandidates = [...syncUsers];
  if (syncCandidates.length === 0 && providerAccessToken) {
    syncCandidates.push({
      userId: user.id,
      email: user.email ?? undefined,
      accessToken: providerAccessToken,
      tokenSource: 'provider_token_header',
    });
    tokenLookup.selected_token_source = 'provider_token_header';
  }

  console.info('[sync-emails] Authenticated sync request', {
    user_id: user.id,
    email: user.email,
    sync_after: syncAfterDate,
    gmail_query: searchQuery,
    token_lookup: tokenLookup,
  });

  if (syncCandidates.length === 0) {
    console.warn('[sync-emails] Missing refresh token for authenticated user', {
      user_id: user.id,
      email: user.email,
      token_lookup: tokenLookup,
    });

    return NextResponse.json(
      {
        ok: false,
        error:
          'No hay refresh_token de Google guardado para este usuario. Vuelve a conectar Gmail en Configuracion para habilitar la sincronizacion.',
        debug: {
          reason: 'missing_refresh_token',
          token_lookup: tokenLookup,
        },
      },
      { status: 412 },
    );
  }

  const userResults: UserSyncResult[] = [];
  for (const syncCandidate of syncCandidates) {
    try {
      const result = await syncUserTransactions(syncCandidate, searchQuery);
      userResults.push(result);
    } catch (error) {
      userResults.push({
        user_id: syncCandidate.userId,
        email: syncCandidate.email,
        status: 'error',
        listed_messages: 0,
        inserted: 0,
        duplicates: 0,
        parse_skipped: 0,
        token_source: syncCandidate.tokenSource,
        error: error instanceof Error ? error.message : 'Error desconocido sincronizando correo.',
      });
    }
  }

  const statusPriority: Record<UserSyncStatus, number> = {
    ok: 0,
    invalid_refresh_token: 1,
    no_account: 2,
    error: 3,
  };

  userResults.sort((left, right) => statusPriority[left.status] - statusPriority[right.status]);

  const summary = buildSyncSummary(syncCandidates.length, userResults);
  const hasAnyOkResult = userResults.some((result) => result.status === 'ok');
  const firstNoAccountResult = userResults.find((result) => result.status === 'no_account');
  const firstInvalidTokenResult = userResults.find(
    (result) => result.status === 'invalid_refresh_token',
  );
  const firstErrorResult = userResults.find((result) => result.status === 'error');

  const debug = {
    token_lookup: tokenLookup,
    token_source: tokenLookup.selected_token_source,
    connected_tokens: syncCandidates.length,
  };

  if (summary.inserted === 0) {
    console.warn('[sync-emails] Authenticated sync finished with summary.inserted=0', {
      user_id: user.id,
      email: user.email,
      summary,
      debug,
    });
  }

  if (!hasAnyOkResult && firstNoAccountResult) {
    return NextResponse.json(
      {
        ok: false,
        error:
          firstNoAccountResult.error ||
          'No hay cuentas disponibles para registrar transacciones. Crea una cuenta y vuelve a sincronizar.',
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        sync_after: syncAfterDate,
        gmail_query: searchQuery,
        summary,
        users: userResults,
        debug,
      },
      { status: 412 },
    );
  }

  if (!hasAnyOkResult && firstInvalidTokenResult) {
    return NextResponse.json(
      {
        ok: false,
        error:
          firstInvalidTokenResult.error ||
          'El token de Gmail esta vencido o revocado. Reconecta Gmail en Configuracion para continuar.',
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        sync_after: syncAfterDate,
        gmail_query: searchQuery,
        summary,
        users: userResults,
        debug,
      },
      { status: 412 },
    );
  }

  if (!hasAnyOkResult && firstErrorResult) {
    const errorMessage =
      firstErrorResult.error || 'Error inesperado sincronizando transacciones de Gmail.';
    const statusCode = isSyncPreconditionErrorMessage(errorMessage) ? 412 : 500;

    return NextResponse.json(
      {
        ok: false,
        error: errorMessage,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        sync_after: syncAfterDate,
        gmail_query: searchQuery,
        summary,
        users: userResults,
        debug,
      },
      { status: statusCode },
    );
  }

  return NextResponse.json(
    {
      ok: true,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      sync_after: syncAfterDate,
      gmail_query: searchQuery,
      summary,
      users: userResults,
      debug,
    },
    { status: 200 },
  );
}

async function runSync(request: Request) {
  try {
    const configuredSecrets = getConfiguredSyncSecrets();
    if (hasValidSyncSecret(request, configuredSecrets)) {
      return runFullSync(request);
    }

    const auth = await requireAuthenticatedUser(request);
    if (!auth.response) {
      return runAuthenticatedUserSync(auth.user, request);
    }

    const authorization = request.headers.get('authorization') ?? '';
    const hasBearerToken = authorization.startsWith('Bearer ');

    if (configuredSecrets.length === 0 && !hasBearerToken) {
      return runFullSync(request);
    }

    if (configuredSecrets.length > 0) {
      return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
    }

    return auth.response;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Error inesperado en sincronizacion.',
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return runSync(request);
}

export async function POST(request: Request) {
  return runSync(request);
}


