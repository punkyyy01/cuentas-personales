import type { Session } from '@supabase/supabase-js';

export const persistGoogleRefreshToken = async (session: Session | null) => {
  const refreshToken = session?.provider_refresh_token?.trim();
  const sessionAccessToken = session?.access_token?.trim();
  if (!refreshToken || !sessionAccessToken) return;
  const userEmail = session?.user?.email ?? null;

  const response = await fetch('/api/google-tokens', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionAccessToken}`,
    },
    body: JSON.stringify({ refresh_token: refreshToken, email: userEmail }),
  });

  if (!response.ok) {
    let apiError = 'No se pudo guardar la conexion de Gmail.';
    try {
      const payload = await response.json();
      if (typeof payload?.error === 'string' && payload.error.trim()) {
        apiError = payload.error;
      }
    } catch { /* ignore */ }
    throw new Error(apiError);
  }
};
