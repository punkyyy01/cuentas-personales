'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Icon } from '@/components/icons';
import { getSupabaseBrowserClient, hasSupabaseBrowserConfig } from '@/lib/supabase-browser';
import { persistGoogleRefreshToken } from '@/lib/google-tokens';

const supabase = getSupabaseBrowserClient();
const GOOGLE_CONNECT_TOKEN_COOKIE = 'google_connect_access_token';
const LAST_SYNC_KEY = 'last-gmail-sync-timestamp';

interface EmailConnection {
  email: string;
  created_at: string;
}

interface FintocLink {
  id: string;
  created_at: string;
}

function formatConnectedDate(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `Conectado el ${d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

async function getApiError(response: Response, fallbackMessage: string) {
  try {
    const payload = await response.json();
    if (typeof payload?.error === 'string' && payload.error.trim()) {
      return payload.error;
    }
  } catch { /* ignore */ }
  return fallbackMessage;
}

function normalizeEmail(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase();
}

function mapGoogleConnectReasonToMessage(reason: string | null) {
  switch (reason) {
    case 'missing_refresh_token': return 'Google no devolvio refresh token. Intenta conectar nuevamente.';
    case 'missing_connected_email': return 'No se pudo leer el email de la cuenta de Google conectada.';
    case 'missing_multi_email_constraint': return 'Falta la migracion para multiples correos. Ejecuta 2026-03-07_allow_multiple_google_tokens_per_user.sql.';
    case 'missing_user_google_tokens_table': return 'Falta la tabla user_google_tokens. Ejecuta las migraciones pendientes.';
    case 'missing_google_oauth_config': return 'Faltan credenciales OAuth de Google en el servidor.';
    case 'access_denied': return 'Cancelaste la autorizacion en Google. Puedes volver a intentarlo.';
    case 'oauth_exchange_failed': return 'No se pudo completar la conexion con Google. Intenta de nuevo.';
    case 'missing_session': return 'Tu sesion expiro. Vuelve a iniciar sesion e intenta otra vez.';
    case 'oauth_start_failed': return 'No se pudo iniciar la autorizacion con Google. Intenta de nuevo.';
    default: return 'No se pudo conectar la cuenta de Gmail.';
  }
}

function getUserInitials(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return 'U';
  const [first, second] = trimmed.split(/\s+/);
  if (first && second) return `${first.charAt(0)}${second.charAt(0)}`.toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}

type FintocConnectButtonProps = {
  onClick: () => void;
  disabled: boolean;
  isConnecting: boolean;
};

function FintocConnectButton({ onClick, disabled, isConnecting }: FintocConnectButtonProps) {
  return (
    <button
      type="button"
      className="btn-connect fintoc"
      onClick={onClick}
      disabled={disabled}
    >
      {isConnecting ? 'Conectando...' : '+ Vincular Cuenta Bancaria (Pro)'}
    </button>
  );
}

export default function SettingsPage() {
  const [authLoading, setAuthLoading] = useState(true);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [sessionAccessToken, setSessionAccessToken] = useState<string | null>(null);
  const [connections, setConnections] = useState<EmailConnection[]>([]);
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [disconnectingEmail, setDisconnectingEmail] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isFintocConnecting, setIsFintocConnecting] = useState(false);
  const [fintocLinks, setFintocLinks] = useState<FintocLink[]>([]);
  const [disconnectingFintoc, setDisconnectingFintoc] = useState<string | null>(null);
  const [fintocReady, setFintocReady] = useState(false);
  const [fintocInitKey, setFintocInitKey] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncDisplay, setLastSyncDisplay] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [showFaq, setShowFaq] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('app-theme');
    if (saved === 'light' || saved === 'dark') setTheme(saved);
  }, []);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('app-theme', theme);
  }, [theme]);

  // Store widget in ref – avoids React treating thenable objects as Promises (error #321)
  const fintocWidgetRef = useRef<any>(null);
  const fintocTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Suppress DataCloneError thrown by Fintoc SDK when it tries to postMessage
  // with non-cloneable callback references – this is an SDK bug, not ours.
  useEffect(() => {
    const handler = (event: ErrorEvent) => {
      if (
        event.error instanceof DOMException &&
        event.error.name === 'DataCloneError'
      ) {
        event.preventDefault();
      }
    };
    window.addEventListener('error', handler);
    return () => window.removeEventListener('error', handler);
  }, []);

  const loadConnections = useCallback(
    async (accessToken: string | null) => {
      if (!accessToken) {
        setConnections([]);
        return;
      }
      setEmailsLoading(true);
      try {
        const response = await fetch('/api/google-tokens', {
          method: 'GET',
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) {
          throw new Error(await getApiError(response, 'No se pudieron cargar las cuentas conectadas.'));
        }
        const payload = await response.json();
        const rawConns: unknown[] = Array.isArray(payload?.connections) ? payload.connections : [];
        const seen = new Set<string>();
        const conns: EmailConnection[] = [];
        for (const c of rawConns) {
          const obj = c as Record<string, unknown>;
          const email = normalizeEmail(typeof obj?.email === 'string' ? obj.email : '');
          if (!email || seen.has(email)) continue;
          seen.add(email);
          conns.push({ email, created_at: typeof obj?.created_at === 'string' ? obj.created_at : '' });
        }
        setConnections(conns);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : 'No se pudieron cargar las cuentas conectadas.');
        setConnections([]);
      } finally {
        setEmailsLoading(false);
      }
    },
    [],
  );

  const loadFintocLinks = useCallback(async (accessToken: string | null) => {
    if (!accessToken) { setFintocLinks([]); return; }
    try {
      const fRes = await fetch('/api/fintoc/link', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (fRes.ok) {
        const fPayload = await fRes.json();
        const rawLinks: unknown[] = Array.isArray(fPayload?.links) ? fPayload.links : [];
        setFintocLinks(rawLinks.map((l) => {
          const obj = l as Record<string, unknown>;
          return { id: String(obj?.id ?? ''), created_at: typeof obj?.created_at === 'string' ? obj.created_at : '' };
        }).filter((l) => l.id));
      }
    } catch { /* ignore */ }
  }, []);

  // Handle Gmail connect callback query params
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const status = url.searchParams.get('gmail_connect');
    if (!status) return;
    const reason = url.searchParams.get('reason');
    const connectedEmail = normalizeEmail(url.searchParams.get('email'));
    if (status === 'success') {
      setErrorMessage(null);
      setNoticeMessage(connectedEmail ? `Correo conectado correctamente: ${connectedEmail}` : 'Correo conectado correctamente.');
    } else if (status === 'error') {
      setNoticeMessage(null);
      setErrorMessage(mapGoogleConnectReasonToMessage(reason));
    }
    url.searchParams.delete('gmail_connect');
    url.searchParams.delete('reason');
    url.searchParams.delete('email');
    const cleanQuery = url.searchParams.toString();
    window.history.replaceState({}, '', `${url.pathname}${cleanQuery ? `?${cleanQuery}` : ''}`);
  }, []);

  // Load last sync display from localStorage
  useEffect(() => {
    const raw = localStorage.getItem(LAST_SYNC_KEY);
    const ts = raw ? Number.parseInt(raw, 10) : Number.NaN;
    if (!Number.isFinite(ts) || ts <= 0) return;
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) setLastSyncDisplay('hace un momento');
    else if (diffMin < 60) setLastSyncDisplay(`hace ${diffMin} min`);
    else if (diffMin < 1440) setLastSyncDisplay(`hace ${Math.floor(diffMin / 60)}h`);
    else setLastSyncDisplay(d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }));
  }, []);

  // Load auth session
  useEffect(() => {
    let mounted = true;
    if (!supabase || !hasSupabaseBrowserConfig()) { setAuthLoading(false); return; }

    const loadSession = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;
      const session = data.session ?? null;
      if (error) setErrorMessage(error.message || 'No se pudo obtener la sesion actual.');
      setAuthUser(session?.user ?? null);
      setSessionAccessToken(session?.access_token ?? null);
      try { await persistGoogleRefreshToken(session); }
      catch (error) { setErrorMessage(error instanceof Error ? error.message : 'No se pudo guardar la conexion de Gmail.'); }
      await Promise.all([
        loadConnections(session?.access_token ?? null),
        loadFintocLinks(session?.access_token ?? null),
      ]);
      setAuthLoading(false);
    };

    void loadSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (session?.provider_refresh_token) {
        void persistGoogleRefreshToken(session).catch((error) => {
          setErrorMessage(error instanceof Error ? error.message : 'No se pudo guardar la conexion de Gmail.');
        });
      }
      setAuthUser(session?.user ?? null);
      setSessionAccessToken(session?.access_token ?? null);
      void loadConnections(session?.access_token ?? null);
      setAuthLoading(false);
    });

    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, [loadConnections, loadFintocLinks]);

  // Initialize Fintoc widget with server-minted widget_token + exchange flow
  useEffect(() => {
    if (!sessionAccessToken) {
      fintocWidgetRef.current = null;
      setFintocReady(false);
      return;
    }

    const publicKey = process.env.NEXT_PUBLIC_FINTOC_PUBLIC_KEY?.trim();
    if (!publicKey) return;

    let active = true;

    const initWidget = async () => {
      if (!active) return;

      // 1. Request widget_token from backend
      const tokenRes = await fetch('/api/fintoc/link-intent', {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionAccessToken}` },
      });

      if (!tokenRes.ok) {
        setErrorMessage('No se pudo inicializar Fintoc. Recarga la pagina.');
        return;
      }

      const { widget_token: widgetToken } = (await tokenRes.json()) as { widget_token: string };
      if (!widgetToken || !active) return;

      // 2. Wait for CDN global to be available
      const waitForFintoc = (): Promise<any> =>
        new Promise((resolve) => {
          const check = () => {
            const F = (window as any).Fintoc;
            if (F) return resolve(F);
            setTimeout(check, 300);
          };
          check();
        });

      const Fintoc = await waitForFintoc();
      if (!active) return;

      // 3. Create widget with widgetToken + publicKey
      const widget = Fintoc.create({
        publicKey,
        widgetToken,
        product: 'movements',
        country: 'cl',
        holderType: 'individual',
        onEvent: (event: string) => {
          console.debug('[Fintoc] event:', event);
        },
        onSuccess: async (linkIntent: any) => {
          if (fintocTimeoutRef.current) {
            clearTimeout(fintocTimeoutRef.current);
            fintocTimeoutRef.current = null;
          }

          console.debug('[Fintoc] onSuccess data:', JSON.stringify(linkIntent));

          // Extract link_token directly (some SDK versions provide it)
          const directLinkToken =
            typeof linkIntent?.link_token === 'string'
              ? linkIntent.link_token.trim()
              : typeof linkIntent?.linkToken === 'string'
                ? linkIntent.linkToken.trim()
                : typeof linkIntent?.link?.link_token === 'string'
                  ? linkIntent.link.link_token.trim()
                  : '';

          const exchangeToken =
            typeof linkIntent?.exchangeToken === 'string'
              ? linkIntent.exchangeToken.trim()
              : typeof linkIntent?.exchange_token === 'string'
                ? linkIntent.exchange_token.trim()
                : '';

          if (!directLinkToken && !exchangeToken) {
            setErrorMessage('Fintoc no devolvio link_token ni exchange_token.');
            setIsFintocConnecting(false);
            return;
          }

          try {
            const body: Record<string, string> = {};
            if (directLinkToken) body.link_token = directLinkToken;
            if (exchangeToken) body.exchange_token = exchangeToken;

            const res = await fetch('/api/fintoc/link', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${sessionAccessToken}`,
              },
              body: JSON.stringify(body),
            });

            if (!res.ok) {
              const msg = await getApiError(res, 'No se pudo guardar el link de Fintoc.');
              throw new Error(msg);
            }

            const linkData = await res.json().catch(() => null);
            const newLinkId = typeof linkData?.data?.id === 'string' ? linkData.data.id : String(Date.now());
            setFintocLinks((prev) => [...prev, { id: newLinkId, created_at: new Date().toISOString() }]);
            setNoticeMessage('Cuenta bancaria vinculada correctamente.');
            // Reset widget so a new token is requested for the next bank link
            fintocWidgetRef.current = null;
            setFintocReady(false);
            setFintocInitKey((k) => k + 1);
          } catch (error) {
            setErrorMessage(
              error instanceof Error ? error.message : 'Error al vincular cuenta bancaria.',
            );
          } finally {
            setIsFintocConnecting(false);
          }
        },
        onExit: () => {
          if (fintocTimeoutRef.current) {
            clearTimeout(fintocTimeoutRef.current);
            fintocTimeoutRef.current = null;
          }
          setIsFintocConnecting(false);
        },
      });

      fintocWidgetRef.current = widget;
      setFintocReady(true);
    };

    void initWidget().catch((err) => {
      console.error('Fintoc init error:', err);
      setErrorMessage('No se pudo inicializar Fintoc. Recarga la pagina.');
    });

    return () => {
      active = false;
    };
  }, [sessionAccessToken, fintocInitKey]);

  const handleDisconnectEmail = useCallback(async (email: string) => {
    if (!sessionAccessToken) return;
    if (!window.confirm(`¿Desconectar ${email}? Se dejaran de importar gastos de ese correo.`)) return;
    setDisconnectingEmail(email);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/google-tokens?email=${encodeURIComponent(email)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${sessionAccessToken}` },
      });
      if (!res.ok) throw new Error(await getApiError(res, 'No se pudo desconectar la cuenta.'));
      setConnections((prev) => prev.filter((c) => c.email !== email));
      setNoticeMessage(`Cuenta ${email} desconectada.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo desconectar la cuenta.');
    } finally {
      setDisconnectingEmail(null);
    }
  }, [sessionAccessToken]);

  const handleDisconnectFintoc = useCallback(async (linkId: string) => {
    if (!sessionAccessToken) return;
    if (!window.confirm('¿Desconectar este banco? Se dejaran de importar movimientos automaticamente.')) return;
    setDisconnectingFintoc(linkId);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/fintoc/link?id=${encodeURIComponent(linkId)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${sessionAccessToken}` },
      });
      if (!res.ok) throw new Error(await getApiError(res, 'No se pudo desconectar el banco.'));
      setFintocLinks((prev) => prev.filter((l) => l.id !== linkId));
      setNoticeMessage('Banco desconectado correctamente.');
      // Reset widget so user can link again
      fintocWidgetRef.current = null;
      setFintocReady(false);
      setFintocInitKey((k) => k + 1);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'No se pudo desconectar el banco.');
    } finally {
      setDisconnectingFintoc(null);
    }
  }, [sessionAccessToken]);

  const handleManualSync = useCallback(async () => {
    if (!sessionAccessToken || isSyncing) return;
    setIsSyncing(true);
    setErrorMessage(null);
    setNoticeMessage(null);
    try {
      const res = await fetch('/api/sync-emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionAccessToken}`,
          'x-client-info': 'settings-manual-sync',
        },
        cache: 'no-store',
      });
      const payload = await res.json().catch(() => null);
      if (res.status === 412) {
        setErrorMessage('No tienes Gmail conectado. Conecta una cuenta primero.');
      } else if (!res.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : 'No se pudo sincronizar.');
      } else {
        const inserted = Number(payload?.summary?.inserted || 0);
        const now = Date.now();
        localStorage.setItem(LAST_SYNC_KEY, now.toString());
        setLastSyncDisplay('hace un momento');
        setNoticeMessage(inserted > 0 ? `Se importaron ${inserted} gasto(s) nuevos.` : 'Todo al dia, no hay gastos nuevos.');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Error sincronizando Gmail.');
    } finally {
      setIsSyncing(false);
    }
  }, [sessionAccessToken, isSyncing]);

  const handleGoogleConnect = () => {
    if (!sessionAccessToken) { setErrorMessage('Tu sesion actual no tiene access token valido. Vuelve a iniciar sesion.'); return; }
    setErrorMessage(null); setNoticeMessage(null); setIsConnecting(true);
    const secureAttribute = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${GOOGLE_CONNECT_TOKEN_COOKIE}=${encodeURIComponent(sessionAccessToken)}; Max-Age=120; Path=/api/google-connect/start; SameSite=Lax${secureAttribute}`;
    window.location.href = '/api/google-connect/start';
  };

  const handleFintocConnect = useCallback(() => {
    if (!fintocWidgetRef.current) { setErrorMessage('El widget de Fintoc no está listo. Recarga la página.'); return; }
    setErrorMessage(null);
    setIsFintocConnecting(true);
    fintocWidgetRef.current.open();
    if (fintocTimeoutRef.current) clearTimeout(fintocTimeoutRef.current);
    fintocTimeoutRef.current = setTimeout(() => {
      setIsFintocConnecting(false);
      setErrorMessage('Tiempo de espera agotado. Intenta nuevamente.');
      fintocTimeoutRef.current = null;
    }, 120_000);
  }, []);

  const handleLogout = async () => {
    if (!supabase) { window.location.href = '/'; return; }
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  const displayName =
    typeof authUser?.user_metadata?.full_name === 'string' && authUser.user_metadata.full_name.trim()
      ? authUser.user_metadata.full_name
      : authUser?.email?.split('@')[0] || 'Usuario';
  const displayEmail = authUser?.email || 'sin-email@demo.com';
  const displayInitials = getUserInitials(displayName);

  if (authLoading) {
    return (
      <div className="auth-screen">
        <div className="panel-loading">
          <div className="spinner" />
          <p>Cargando configuración...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {/* ── SIDEBAR ─── */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M4 8l5 5 4-4 7 7" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M17 16h3v-3" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="sidebar-brand-text">
            <strong>ExpenseTrack</strong>
            <span>v1.2</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <Link href="/" className="sidebar-nav-item" onClick={() => setSidebarOpen(false)}>
            <Icon name="home" className="nav-icon" /> Panel
          </Link>
          <Link href="/settings" className="sidebar-nav-item active" onClick={() => setSidebarOpen(false)}>
            <Icon name="settings" className="nav-icon" /> Configuración
          </Link>
        </nav>

        <div className="sidebar-footer">
          <button type="button" className="sidebar-theme-btn" onClick={() => setTheme((t) => t === 'dark' ? 'light' : 'dark')}>
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} className="nav-icon" />
            {theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}
          </button>
          <button type="button" className="sidebar-logout-btn" onClick={handleLogout}>
            <Icon name="logout" className="nav-icon" /> Salir
          </button>
        </div>
      </aside>

      {/* ── MAIN AREA ─── */}
      <main className="main-area">
        <header className="dashboard-header">
          <button type="button" className="mobile-menu-btn" aria-label="Abrir menu lateral" onClick={() => setSidebarOpen((o) => !o)}>
            <Icon name="menu" />
          </button>
          <div className="header-title-block">
            <h1>Configuración</h1>
            <p>Administra tu perfil y cuentas conectadas</p>
          </div>
        </header>

        <section className="dashboard-content">
          <div className="settings-grid">
            {/* ── Profile Card ─── */}
            <article className="card settings-card profile-card">
              <h2>Perfil</h2>
              <div className="profile-avatar">{displayInitials}</div>
              <h3 className="profile-name">{displayName}</h3>
              <p className="profile-email">{displayEmail}</p>
              <span className="profile-pill">
                <span className="gmail-symbol" aria-hidden="true">G</span>
                Conectado con Google
              </span>
            </article>

            {/* ── Gmail Connections ─── */}
            <article className="card settings-card">
              <h2>Cuentas de Email Conectadas</h2>
              <p className="section-description">
                Conecta las cuentas de Gmail donde recibes tus notificaciones bancarias.
                Detectaremos automáticamente tus gastos cuando lleguen emails de tu banco.
              </p>

              <div className="connected-list">
                {emailsLoading && (
                  <div className="connected-item empty"><p>Cargando cuentas conectadas...</p></div>
                )}
                {!emailsLoading && connections.length === 0 && (
                  <div className="connected-item empty"><p>Aún no tienes cuentas de correo conectadas.</p></div>
                )}
                {connections.map(({ email, created_at }) => (
                  <div className="connected-item" key={email}>
                    <div className="connected-item-icon" aria-hidden="true">
                      <Icon name="mail" />
                    </div>
                    <div className="connected-item-info">
                      <strong>{email}</strong>
                      <span>{formatConnectedDate(created_at) || <><i className="sync-dot" /> Sincronizando</>}</span>
                    </div>
                    <button
                      type="button"
                      className="connected-item-disconnect"
                      onClick={() => handleDisconnectEmail(email)}
                      disabled={disconnectingEmail === email}
                    >
                      <Icon name="trash" />
                      {disconnectingEmail === email ? 'Desconectando...' : 'Desconectar'}
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                <button type="button" className="btn-connect gmail" onClick={handleGoogleConnect} disabled={isConnecting || !sessionAccessToken}>
                  <span className="gmail-symbol" aria-hidden="true">G</span>
                  {isConnecting ? 'Conectando cuenta...' : '+ Conectar otra cuenta de Gmail'}
                </button>
                {connections.length > 0 && (
                  <button
                    type="button"
                    className="btn-connect sync"
                    onClick={handleManualSync}
                    disabled={isSyncing || !sessionAccessToken}
                  >
                    {isSyncing ? 'Sincronizando...' : 'Sincronizar ahora'}
                  </button>
                )}
              </div>

              {lastSyncDisplay && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                  Última sincronización: {lastSyncDisplay}
                </p>
              )}
              {noticeMessage && <p className="success-text">{noticeMessage}</p>}
              {errorMessage && <p className="error-text">{errorMessage}</p>}
            </article>

            {/* ── Fintoc Banking ─── */}
            <article className="card settings-card">
              <h2>Vinculación Bancaria (Fintoc)</h2>
              <p className="section-description">
                Conecta tu cuenta de Banco Estado o Falabella directamente para capturar gastos de débito y crédito en tiempo real.
              </p>

              <div className="connected-list">
                {fintocLinks.length === 0 && (
                  <div className="connected-item empty"><p>Aún no tienes bancos vinculados.</p></div>
                )}
                {fintocLinks.map((link, i) => (
                  <div className="connected-item" key={link.id}>
                    <div className="connected-item-icon" aria-hidden="true">
                      <Icon name="bank" />
                    </div>
                    <div className="connected-item-info">
                      <strong>Banco vinculado {fintocLinks.length > 1 ? i + 1 : ''}</strong>
                      <span>{formatConnectedDate(link.created_at) || <><i className="sync-dot" /> Activo</>}</span>
                    </div>
                    <button
                      type="button"
                      className="connected-item-disconnect"
                      onClick={() => handleDisconnectFintoc(link.id)}
                      disabled={disconnectingFintoc === link.id}
                    >
                      <Icon name="trash" />
                      {disconnectingFintoc === link.id ? 'Desconectando...' : 'Desconectar'}
                    </button>
                  </div>
                ))}
              </div>

              <FintocConnectButton
                onClick={handleFintocConnect}
                disabled={isFintocConnecting || !sessionAccessToken || !fintocReady}
                isConnecting={isFintocConnecting}
              />

              {!fintocReady && sessionAccessToken && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                  Cargando widget de Fintoc...
                </p>
              )}

              {/* ── Collapsible FAQ ─── */}
              <div className="fintoc-faq">
                <button type="button" className="faq-toggle" onClick={() => setShowFaq((v) => !v)}>
                  <Icon name="info" style={{ width: 16, height: 16 }} />
                  <strong>¿Cómo funciona?</strong>
                  <Icon name={showFaq ? 'chevron-down' : 'chevron-right'} style={{ width: 14, height: 14, marginLeft: 'auto' }} />
                </button>
                {showFaq && (
                  <div className="faq-content">
                    <p>
                      Fintoc se conecta directamente con tu banco para leer tus movimientos.
                      Si un gasto ya fue detectado por Gmail, no se duplicará. Tus credenciales
                      nunca se almacenan en nuestros servidores.
                    </p>
                  </div>
                )}
              </div>
            </article>
          </div>
        </section>
      </main>

      {/* Sidebar overlay */}
      {sidebarOpen && (
        <button type="button" className="sidebar-overlay" aria-label="Cerrar menu lateral" onClick={() => setSidebarOpen(false)} />
      )}
    </div>
  );
}
