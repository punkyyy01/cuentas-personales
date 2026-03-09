import { NextResponse } from 'next/server';
import { requireAuthenticatedUser } from '@/lib/auth-user';
import { buildGoogleOAuthClient, createGoogleOAuthState } from '@/lib/google-oauth';

const GMAIL_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'openid', 'email'] as const;
const GOOGLE_CONNECT_TOKEN_COOKIE = 'google_connect_access_token';

type StartGoogleConnectResult =
  | { ok: true; authUrl: string }
  | { ok: false; status: number; reason: string; message: string };

function hasCookie(request: Request, cookieName: string) {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return false;

  return cookieHeader
    .split(';')
    .some((pair) => pair.split('=')[0]?.trim() === cookieName);
}

function withClearedConnectCookie(request: Request, response: NextResponse) {
  if (!hasCookie(request, GOOGLE_CONNECT_TOKEN_COOKIE)) {
    return response;
  }

  response.cookies.set({
    name: GOOGLE_CONNECT_TOKEN_COOKIE,
    value: '',
    maxAge: 0,
    path: '/api/google-connect/start',
    sameSite: 'lax',
  });

  return response;
}

function buildSettingsErrorRedirect(request: Request, reason: string) {
  const requestUrl = new URL(request.url);
  const target = new URL('/settings', requestUrl.origin);
  target.searchParams.set('gmail_connect', 'error');
  target.searchParams.set('reason', reason);
  return NextResponse.redirect(target);
}

async function createGoogleConnectAuthUrl(request: Request): Promise<StartGoogleConnectResult> {
  const auth = await requireAuthenticatedUser(request);
  if (auth.response) {
    return {
      ok: false,
      status: 401,
      reason: 'missing_session',
      message: 'Sesion invalida o expirada.',
    };
  }

  const oauth2Client = buildGoogleOAuthClient(request);
  if (!oauth2Client) {
    return {
      ok: false,
      status: 500,
      reason: 'missing_google_oauth_config',
      message:
        'Faltan credenciales OAuth de Google en el servidor. Configura GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET.',
    };
  }

  const state = createGoogleOAuthState(auth.user.id, '/settings');
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'select_account consent',
    include_granted_scopes: true,
    scope: [...GMAIL_SCOPES],
    state,
  });

  return { ok: true, authUrl };
}

export async function GET(request: Request) {
  try {
    const result = await createGoogleConnectAuthUrl(request);
    if (!result.ok) {
      return withClearedConnectCookie(request, buildSettingsErrorRedirect(request, result.reason));
    }

    return withClearedConnectCookie(request, NextResponse.redirect(result.authUrl));
  } catch {
    return withClearedConnectCookie(
      request,
      buildSettingsErrorRedirect(request, 'oauth_start_failed'),
    );
  }
}

export async function POST(request: Request) {
  try {
    const result = await createGoogleConnectAuthUrl(request);
    if (!result.ok) {
      return withClearedConnectCookie(
        request,
        NextResponse.json({ error: result.message }, { status: result.status }),
      );
    }

    return withClearedConnectCookie(request, NextResponse.json({ auth_url: result.authUrl }, { status: 200 }));
  } catch (error) {
    const response = NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'No se pudo iniciar la conexion OAuth de Gmail.',
      },
      { status: 500 },
    );
    return withClearedConnectCookie(request, response);
  }
}
