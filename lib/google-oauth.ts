import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { google } from 'googleapis';

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
] as const;

const APP_BASE_URL_ENV_KEYS = [
  'NEXT_PUBLIC_SITE_URL',
  'SITE_URL',
  'NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL',
  'VERCEL_PROJECT_PRODUCTION_URL',
  'NEXT_PUBLIC_VERCEL_URL',
  'VERCEL_BRANCH_URL',
  'VERCEL_URL',
] as const;

const GOOGLE_STATE_SECRET_ENV_KEYS = [
  'GOOGLE_OAUTH_STATE_SECRET',
  'SYNC_EMAILS_SECRET',
  'CRON_SECRET',
  'SUPABASE_SERVICE_ROLE_KEY',
] as const;

const DEFAULT_CALLBACK_PATH = '/api/google-connect/callback';
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

type GoogleOAuthStatePayload = {
  uid: string;
  ts: number;
  nonce: string;
  returnPath: string;
};

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri?: string;
};

function getFirstConfiguredEnv(keys: readonly string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return null;
}

function toBase64Url(input: Buffer | string) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(input: string) {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + '='.repeat(padding), 'base64');
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function getStateSecret() {
  return getFirstConfiguredEnv(GOOGLE_STATE_SECRET_ENV_KEYS);
}

function normalizeAsAbsoluteUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(withProtocol);
  } catch {
    return null;
  }
}

function isSupabaseAuthCallbackUrl(url: URL) {
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();

  return path.startsWith('/auth/v1/callback') || host.endsWith('.supabase.co') || host.includes('.supabase.');
}

function getConfiguredRedirectUri() {
  const configured = getFirstConfiguredEnv(GOOGLE_REDIRECT_URI_ENV_KEYS);
  if (!configured) return null;

  const parsed = normalizeAsAbsoluteUrl(configured);
  if (!parsed) return null;

  // Never allow the connect flow to reuse Supabase /auth/v1/callback.
  if (isSupabaseAuthCallbackUrl(parsed)) return null;

  return parsed.toString();
}

function getAppBaseUrl(request?: Request) {
  const fromEnv = getFirstConfiguredEnv(APP_BASE_URL_ENV_KEYS);
  if (fromEnv) {
    const parsed = normalizeAsAbsoluteUrl(fromEnv);
    if (parsed) return parsed.origin;
  }

  if (!request) return null;

  const requestUrl = new URL(request.url);
  if (isSupabaseAuthCallbackUrl(requestUrl)) return null;
  return requestUrl.origin;
}

function getFallbackRedirectUri(request?: Request) {
  const appBaseUrl = getAppBaseUrl(request);
  if (!appBaseUrl) return undefined;
  return `${appBaseUrl}${DEFAULT_CALLBACK_PATH}`;
}

export function getGoogleOAuthConfig(request?: Request): GoogleOAuthConfig | null {
  const clientId = getFirstConfiguredEnv(GOOGLE_CLIENT_ID_ENV_KEYS);
  const clientSecret = getFirstConfiguredEnv(GOOGLE_CLIENT_SECRET_ENV_KEYS);
  const redirectUri = getConfiguredRedirectUri() ?? getFallbackRedirectUri(request);

  if (!clientId || !clientSecret) return null;

  return {
    clientId,
    clientSecret,
    redirectUri: redirectUri ?? undefined,
  };
}

export function buildGoogleOAuthClient(request?: Request) {
  const config = getGoogleOAuthConfig(request);
  if (!config) return null;

  return new google.auth.OAuth2(config.clientId, config.clientSecret, config.redirectUri);
}

export function createGoogleOAuthState(userId: string, returnPath = '/settings') {
  const secret = getStateSecret();
  if (!secret) {
    throw new Error(
      'Falta GOOGLE_OAUTH_STATE_SECRET (o SYNC_EMAILS_SECRET/CRON_SECRET) para asegurar el flujo OAuth de Gmail.',
    );
  }

  const payload: GoogleOAuthStatePayload = {
    uid: userId,
    ts: Date.now(),
    nonce: randomBytes(10).toString('hex'),
    returnPath: returnPath.startsWith('/') ? returnPath : '/settings',
  };

  const payloadEncoded = toBase64Url(JSON.stringify(payload));
  const signature = toBase64Url(createHmac('sha256', secret).update(payloadEncoded).digest());

  return `${payloadEncoded}.${signature}`;
}

export function verifyGoogleOAuthState(state: string):
  | { ok: true; userId: string; returnPath: string }
  | { ok: false; reason: string } {
  const secret = getStateSecret();
  if (!secret) return { ok: false, reason: 'missing_state_secret' };

  const [payloadEncoded, signature] = state.split('.');
  if (!payloadEncoded || !signature) {
    return { ok: false, reason: 'invalid_state_format' };
  }

  const expectedSignature = toBase64Url(createHmac('sha256', secret).update(payloadEncoded).digest());
  if (!safeEqual(signature, expectedSignature)) {
    return { ok: false, reason: 'invalid_state_signature' };
  }

  let payload: GoogleOAuthStatePayload;
  try {
    payload = JSON.parse(fromBase64Url(payloadEncoded).toString('utf8')) as GoogleOAuthStatePayload;
  } catch {
    return { ok: false, reason: 'invalid_state_payload' };
  }

  if (!payload?.uid || typeof payload.uid !== 'string') {
    return { ok: false, reason: 'invalid_state_user' };
  }

  if (!payload?.ts || typeof payload.ts !== 'number') {
    return { ok: false, reason: 'invalid_state_timestamp' };
  }

  if (Date.now() - payload.ts > OAUTH_STATE_MAX_AGE_MS) {
    return { ok: false, reason: 'expired_state' };
  }

  const returnPath =
    typeof payload.returnPath === 'string' && payload.returnPath.startsWith('/')
      ? payload.returnPath
      : '/settings';

  return {
    ok: true,
    userId: payload.uid,
    returnPath,
  };
}
