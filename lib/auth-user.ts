import { supabaseAdmin } from '@/lib/supabase';
import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';

const GOOGLE_CONNECT_TOKEN_COOKIE = 'google_connect_access_token';

type AuthenticatedUserResult =
  | { user: User; response?: never }
  | { user?: never; response: NextResponse };

function getCookieValue(cookieHeader: string | null, cookieName: string) {
  if (!cookieHeader) return null;

  const cookiePairs = cookieHeader.split(';');
  for (const pair of cookiePairs) {
    const [rawName, ...rawValueParts] = pair.split('=');
    if (!rawName || rawValueParts.length === 0) continue;

    if (rawName.trim() !== cookieName) continue;
    const rawValue = rawValueParts.join('=').trim();

    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return null;
}

function extractAccessToken(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const headerToken = authHeader.slice('Bearer '.length).trim();
    if (headerToken) return headerToken;
  }

  const cookieToken = getCookieValue(request.headers.get('cookie'), GOOGLE_CONNECT_TOKEN_COOKIE);
  return cookieToken?.trim() || null;
}

export function getErrorMessage(error: unknown, fallback = 'Error interno del servidor'): string {
  return error instanceof Error ? (error.message || fallback) : fallback;
}

export async function requireAuthenticatedUser(request: Request): Promise<AuthenticatedUserResult> {
  const accessToken = extractAccessToken(request);
  if (!accessToken) {
    return { response: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  }

  const { data, error } = await supabaseAdmin.auth.getUser(accessToken);
  if (error || !data.user) {
    return { response: NextResponse.json({ error: 'Sesion invalida o expirada' }, { status: 401 }) };
  }

  return { user: data.user };
}
