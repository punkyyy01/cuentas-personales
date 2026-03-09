import { google } from 'googleapis';
import { NextResponse } from 'next/server';
import { buildGoogleOAuthClient, verifyGoogleOAuthState } from '@/lib/google-oauth';
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

function buildSettingsRedirect(requestUrl: URL, returnPath: string, params: Record<string, string>) {
  const safePath = returnPath.startsWith('/') ? returnPath : '/settings';
  const target = new URL(safePath, requestUrl.origin);
  Object.entries(params).forEach(([key, value]) => target.searchParams.set(key, value));
  return NextResponse.redirect(target);
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const errorParam = requestUrl.searchParams.get('error')?.trim();
  const code = requestUrl.searchParams.get('code')?.trim() ?? '';
  const state = requestUrl.searchParams.get('state')?.trim() ?? '';

  if (errorParam) {
    return buildSettingsRedirect(requestUrl, '/settings', {
      gmail_connect: 'error',
      reason: errorParam,
    });
  }

  if (!code || !state) {
    return buildSettingsRedirect(requestUrl, '/settings', {
      gmail_connect: 'error',
      reason: 'missing_code_or_state',
    });
  }

  const verifiedState = verifyGoogleOAuthState(state);
  if (!verifiedState.ok) {
    return buildSettingsRedirect(requestUrl, '/settings', {
      gmail_connect: 'error',
      reason: verifiedState.reason,
    });
  }

  const returnPath = verifiedState.returnPath;

  try {
    const oauth2Client = buildGoogleOAuthClient(request);
    if (!oauth2Client) {
      return buildSettingsRedirect(requestUrl, returnPath, {
        gmail_connect: 'error',
        reason: 'missing_google_oauth_config',
      });
    }

    const tokenResponse = await oauth2Client.getToken(code);
    const refreshToken = tokenResponse.tokens.refresh_token?.trim() ?? '';
    if (!refreshToken) {
      return buildSettingsRedirect(requestUrl, returnPath, {
        gmail_connect: 'error',
        reason: 'missing_refresh_token',
      });
    }

    oauth2Client.setCredentials(tokenResponse.tokens);

    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const profileResponse = await oauth2.userinfo.get();

    const connectedEmail = profileResponse.data.email?.trim().toLowerCase() ?? '';
    const providerSub = profileResponse.data.id?.trim() || null;

    if (!connectedEmail) {
      return buildSettingsRedirect(requestUrl, returnPath, {
        gmail_connect: 'error',
        reason: 'missing_connected_email',
      });
    }

    let { error } = await supabaseAdmin.from('user_google_tokens').upsert(
      [
        {
          user_id: verifiedState.userId,
          email: connectedEmail,
          refresh_token: refreshToken,
          provider_sub: providerSub,
        },
      ],
      { onConflict: 'user_id,email' },
    );

    if (error && isMissingColumnError(error, 'provider_sub')) {
      const retry = await supabaseAdmin.from('user_google_tokens').upsert(
        [
          {
            user_id: verifiedState.userId,
            email: connectedEmail,
            refresh_token: refreshToken,
          },
        ],
        { onConflict: 'user_id,email' },
      );

      error = retry.error;
    }

    if (error) {
      if (isMissingTableError(error)) {
        return buildSettingsRedirect(requestUrl, returnPath, {
          gmail_connect: 'error',
          reason: 'missing_user_google_tokens_table',
        });
      }

      if (isSchemaConstraintError(error)) {
        return buildSettingsRedirect(requestUrl, returnPath, {
          gmail_connect: 'error',
          reason: 'missing_multi_email_constraint',
        });
      }

      throw error;
    }

    return buildSettingsRedirect(requestUrl, returnPath, {
      gmail_connect: 'success',
      email: connectedEmail,
    });
  } catch (error) {
    console.error('[google-connect/callback] Failed to exchange Google OAuth code', {
      error: error instanceof Error ? error.message : 'unknown_error',
    });

    return buildSettingsRedirect(requestUrl, returnPath, {
      gmail_connect: 'error',
      reason: 'oauth_exchange_failed',
    });
  }
}
