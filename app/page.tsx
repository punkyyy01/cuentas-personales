'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Icon, type IconName } from '@/components/icons';
import { getSupabaseBrowserClient, hasSupabaseBrowserConfig } from '@/lib/supabase-browser';
import { persistGoogleRefreshToken } from '@/lib/google-tokens';
import { formatMoney, getMonthKey, formatTransactionDate } from '@/lib/format';
import type { Account, Transaction, Budget, CategoryBreakdown } from '@/components/dashboard/types';

type TimeFilter = 'today' | 'week' | 'month' | 'year' | 'all';
const TIME_FILTER_LABELS: Record<TimeFilter, string> = {
  today: 'Hoy',
  week: 'Esta Semana',
  month: 'Este Mes',
  year: 'Este Año',
  all: 'Todo',
};
const PAYMENT_METHODS = [
  { id: 'debito', label: 'Débito', emoji: '💳' },
  { id: 'credito', label: 'Crédito', emoji: '💳' },
  { id: 'efectivo', label: 'Efectivo', emoji: '💵' },
  { id: 'transferencia', label: 'Transferencia', emoji: '🏦' },
  { id: 'pago', label: 'Pago', emoji: '💸' },
];
const EXPENSE_CATEGORIES = [
  { id: 'Tienda', label: 'Tienda', emoji: '🛒' },
  { id: 'Comida', label: 'Comida', emoji: '🍽️' },
  { id: 'Transporte', label: 'Transporte', emoji: '🚗' },
  { id: 'Hogar/Cuentas', label: 'Hogar', emoji: '🏠' },
  { id: 'Café', label: 'Café', emoji: '☕' },
  { id: 'Otros', label: 'Otros', emoji: '💰' },
];

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

const supabase = getSupabaseBrowserClient();

async function getApiError(response: Response, fallback: string) {
  try {
    const payload = await response.json();
    if (payload?.error && typeof payload.error === 'string') return payload.error;
  } catch {
    // Ignore response parse errors and return fallback message.
  }
  return fallback;
}

async function getJsonPayload(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function normalizeUiError(message: string) {
  const value = message.trim();
  if (/Could not find the table|schema cache|relation\s+"?accounts_cards"?\s+does not exist/i.test(value)) {
    return 'No existe la tabla public.accounts_cards en Supabase. Crea las tablas antes de usar el panel.';
  }
  return value;
}

function getCategoryIcon(category: string): IconName {
  const value = (category || '').toLowerCase();
  if (value.includes('comida') || value.includes('restaur')) return 'restaurant';
  if (value.includes('transporte') || value.includes('bencina') || value.includes('auto')) return 'car';
  if (value.includes('luz') || value.includes('agua') || value.includes('gas') || value.includes('hogar') || value.includes('cuenta')) return 'bolt';
  if (value.includes('super')) return 'cart';
  if (value.includes('salud') || value.includes('farmacia')) return 'health';
  if (value.includes('suscripci') || value.includes('membresia')) return 'subscription';
  if (value.includes('delivery')) return 'delivery';
  if (value.includes('educacion') || value.includes('curso')) return 'education';
  if (value.includes('ropa')) return 'shirt';
  if (value.includes('ocio') || value.includes('entret')) return 'gamepad';
  if (value.includes('transfer')) return 'wallet';
  return 'wallet';
}

function cleanTransactionName(name: string): string {
  return name.replace(/\u200B/g, '').trim();
}

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// All-caps descriptions -> convert to title case for readability
function formatTransactionTitle(raw: string): string {
  const cleaned = cleanTransactionName(raw);
  if (!cleaned) return 'Gasto';
  const isAllCaps = cleaned === cleaned.toUpperCase() && cleaned.length > 3;
  if (isAllCaps) return toTitleCase(cleaned);
  return cleaned;
}

function looksLikePersonName(name: string): boolean {
  if (!name || name.length < 4) return false;
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  return words.every((w) => /^[A-ZÁÉÍÓÚÑÜ][a-záéíóúñü]{1,}$/.test(w));
}

function getTransactionDisplayTitle(transaction: Transaction) {
  const raw = cleanTransactionName(transaction.description || '');
  if (raw) return formatTransactionTitle(raw);
  return 'Gasto';
}

function getTransactionSubtitle(transaction: Transaction): string {
  const desc = cleanTransactionName(transaction.description || '');
  const source = transaction.source || '';

  if (transaction.type === 'income') return 'Ingreso recibido';

  if (looksLikePersonName(desc)) return 'Transferencia enviada';

  if (source === 'fintoc') {
    const upper = desc.toUpperCase();
    if (upper.includes('SUPERMERCADO') || upper.includes('JUMBO') || upper.includes('LIDER') || upper.includes('WALMART')) return 'Compra supermercado';
    if (upper.includes('UBER') || upper.includes('CABIFY') || upper.includes('RAPPI') || upper.includes('PEDIDOS')) return 'Compra en app';
    if (upper.includes('FARMACIA') || upper.includes('SALCOBRAND') || upper.includes('CRUZ VERDE')) return 'Compra farmacia';
    return 'Compra con tarjeta';
  }

  if (source === 'webhook_banco') return 'Notificacion bancaria';

  if (source === 'manual') return 'Gasto manual';

  return '';
}

function getTransactionIconName(transaction: Transaction): IconName {
  const category = (transaction.category || '').toLowerCase();
  if (category) {
    if (category.includes('comida') || category.includes('restaur')) return 'restaurant';
    if (category.includes('transporte') || category.includes('bencina') || category.includes('auto')) return 'car';
    if (category.includes('luz') || category.includes('agua') || category.includes('gas') || category.includes('hogar') || category.includes('cuenta')) return 'bolt';
    if (category.includes('super')) return 'cart';
    if (category.includes('salud') || category.includes('farmacia')) return 'health';
    if (category.includes('suscripci') || category.includes('membresia')) return 'subscription';
    if (category.includes('delivery')) return 'delivery';
    if (category.includes('educacion') || category.includes('curso')) return 'education';
    if (category.includes('ropa')) return 'shirt';
    if (category.includes('ocio') || category.includes('entret')) return 'gamepad';
    if (category.includes('transfer')) return 'wallet';
  }

  const desc = cleanTransactionName(transaction.description || '');
  if (looksLikePersonName(desc)) return 'wallet';

  if (transaction.source === 'fintoc') return 'red-card';
  if (transaction.type === 'income') return 'arrow-down-right';

  return 'red-card';
}

const lastSyncKey = 'last-gmail-sync-timestamp';
const syncCooldownMs = 10 * 60 * 1000;

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [loginBusy, setLoginBusy] = useState(false);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totalSpent, setTotalSpent] = useState(0);
  const [loading, setLoading] = useState(true);

  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [categoryBreakdown, setCategoryBreakdown] = useState<CategoryBreakdown[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [totalIncome, setTotalIncome] = useState(0);
  const [fintocLinked, setFintocLinked] = useState(false);
  const [lastSyncDisplay, setLastSyncDisplay] = useState<string | null>(null);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deletingTransactionId, setDeletingTransactionId] = useState<string | null>(null);
  const [newTransactionType, setNewTransactionType] = useState<'expense' | 'income'>('expense');
  const [totalTransactionCount, setTotalTransactionCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const [monthKey, setMonthKey] = useState(() => getMonthKey());
  const bootstrappedRef = useRef(false);

  // New UI state for Figma design
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('month');
  const [showTimeDropdown, setShowTimeDropdown] = useState(false);
  const [expensePayMethod, setExpensePayMethod] = useState('debito');
  const [expenseCategory, setExpenseCategory] = useState('Tienda');
  const [expenseNotes, setExpenseNotes] = useState('');

  // Theme persistence
  useEffect(() => {
    const saved = localStorage.getItem('app-theme');
    if (saved === 'light' || saved === 'dark') setTheme(saved);
  }, []);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('app-theme', theme);
  }, [theme]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!showTimeDropdown) return;
    const handler = () => setShowTimeDropdown(false);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [showTimeDropdown]);

  const addToast = useCallback((message: string, type: 'success' | 'error') => {
    const normalizedMessage = normalizeUiError(message);
    const id = Date.now() + Math.floor(Math.random() * 1000);
    let wasAdded = false;

    setToasts((current) => {
      const hasDuplicate = current.some((toast) => toast.type === type && toast.message === normalizedMessage);
      if (hasDuplicate) return current;

      wasAdded = true;
      return [...current.slice(-2), { id, message: normalizedMessage, type }];
    });

    if (!wasAdded) return;

    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 3200);
  }, []);

  const authHeaderValue = useMemo(() => {
    if (!accessToken) return '';
    return `Bearer ${accessToken}`;
  }, [accessToken]);

  useEffect(() => {
    if (!session) return;

    const persist = async () => {
      await persistGoogleRefreshToken(session);
    };

    void persist();
  }, [session]);

  useLayoutEffect(() => {
    let mounted = true;

    if (!supabase || !hasSupabaseBrowserConfig()) {
      setAuthChecking(false);
      setLoading(false);
      return;
    }

    const bootstrapAuth = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;

      if (error) {
        addToast('No se pudo verificar la sesion actual', 'error');
      }

      const session = data.session;
      setSession(session ?? null);
      setAuthUser(session?.user ?? null);
      setAccessToken(session?.access_token ?? null);
      setAuthChecking(false);
      if (!session) setLoading(false);
    };

    void bootstrapAuth();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setSession(session ?? null);
      setAuthUser(session?.user ?? null);
      setAccessToken(session?.access_token ?? null);
      setAuthChecking(false);

      if (!session) {
        setAccounts([]);
        setTransactions([]);
        setTotalSpent(0);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [addToast]);

  const fetchAccounts = useCallback(async () => {
    if (!authHeaderValue) return;

    try {
      const response = await fetch('/api/accounts', {
        headers: { Authorization: authHeaderValue },
        cache: 'no-store',
      });

      if (!response.ok) {
        if (response.status === 401) {
          await supabase?.auth.signOut();
          return;
        }
        throw new Error(await getApiError(response, 'No se pudieron cargar las cuentas'));
      }

      const payload = await response.json();
      if (Array.isArray(payload.data)) {
        setAccounts(payload.data);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error cargando cuentas';
      addToast(message, 'error');
    }
  }, [authHeaderValue, addToast]);

  const fetchTransactions = useCallback(async () => {
    if (!authHeaderValue) return;

    try {
      const params = new URLSearchParams({
        month: monthKey,
        limit: '50',
        offset: '0',
      });

      const response = await fetch(`/api/transactions?${params.toString()}`, {
        headers: { Authorization: authHeaderValue },
        cache: 'no-store',
      });

      if (!response.ok) {
        if (response.status === 401) {
          await supabase?.auth.signOut();
          return;
        }
        throw new Error(await getApiError(response, 'No se pudieron cargar los gastos'));
      }

      const payload = await response.json();
      if (Array.isArray(payload.data)) {
        setTransactions(payload.data);
        setTotalTransactionCount(typeof payload.count === 'number' ? payload.count : payload.data.length);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error cargando gastos';
      addToast(message, 'error');
    }
  }, [authHeaderValue, addToast, monthKey]);

  const loadMoreTransactions = useCallback(async (currentCount: number) => {
    if (!authHeaderValue) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({
        month: monthKey,
        limit: '50',
        offset: String(currentCount),
      });

      const response = await fetch(`/api/transactions?${params.toString()}`, {
        headers: { Authorization: authHeaderValue },
        cache: 'no-store',
      });

      if (!response.ok) return;

      const payload = await response.json();
      if (Array.isArray(payload.data) && payload.data.length > 0) {
        setTransactions((prev) => [...prev, ...payload.data]);
      }
    } catch {
      // silent fail — user can retry
    } finally {
      setLoadingMore(false);
    }
  }, [authHeaderValue, monthKey]);

  const fetchTotalSpent = useCallback(async () => {
    if (!authHeaderValue) return;

    try {
      const params = new URLSearchParams({
        summary: 'expense_total',
        month: monthKey,
      });

      const response = await fetch(`/api/transactions?${params.toString()}`, {
        headers: { Authorization: authHeaderValue },
        cache: 'no-store',
      });

      if (!response.ok) {
        if (response.status === 401) {
          await supabase?.auth.signOut();
          return;
        }
        throw new Error(await getApiError(response, 'No se pudo calcular el total gastado'));
      }

      const payload = await getJsonPayload(response);
      const parsedTotal = Number(payload?.total_expense || 0);
      setTotalSpent(Number.isFinite(parsedTotal) ? parsedTotal : 0);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error calculando total gastado';
      addToast(message, 'error');
    }
  }, [authHeaderValue, addToast, monthKey]);

  const fetchCategoryBreakdown = useCallback(async () => {
    if (!authHeaderValue) return;

    try {
      const params = new URLSearchParams({
        summary: 'category_breakdown',
        month: monthKey,
      });

      const response = await fetch(`/api/transactions?${params.toString()}`, {
        headers: { Authorization: authHeaderValue },
        cache: 'no-store',
      });

      if (!response.ok) return;

      const payload = await getJsonPayload(response);
      if (Array.isArray(payload?.categories)) {
        setCategoryBreakdown(payload.categories);
      }
    } catch {
      // No bloquear la carga del dashboard por un error de categorias
    }
  }, [authHeaderValue, monthKey]);

  const fetchBudgets = useCallback(async () => {
    if (!authHeaderValue) return;

    try {
      const params = new URLSearchParams({ month: monthKey });

      const response = await fetch(`/api/budgets?${params.toString()}`, {
        headers: { Authorization: authHeaderValue },
        cache: 'no-store',
      });

      if (!response.ok) return;

      const payload = await response.json();
      if (Array.isArray(payload?.data)) {
        setBudgets(payload.data);
      }
    } catch {
      // No bloquear la carga del dashboard
    }
  }, [authHeaderValue, monthKey]);

  const fetchTotalIncome = useCallback(async () => {
    if (!authHeaderValue) return;

    try {
      const params = new URLSearchParams({
        summary: 'income_total',
        month: monthKey,
      });

      const response = await fetch(`/api/transactions?${params.toString()}`, {
        headers: { Authorization: authHeaderValue },
        cache: 'no-store',
      });

      if (!response.ok) return;

      const payload = await getJsonPayload(response);
      const parsedTotal = Number(payload?.total_income || 0);
      setTotalIncome(Number.isFinite(parsedTotal) ? parsedTotal : 0);
    } catch {
      // No bloquear la carga del dashboard
    }
  }, [authHeaderValue, monthKey]);

  const syncFintocMovements = useCallback(async () => {
    if (!authHeaderValue) return false;

    try {
      const response = await fetch('/api/fintoc/link?sync=1', {
        headers: { Authorization: authHeaderValue },
        cache: 'no-store',
      });

      if (!response.ok) return false;

      const payload = await getJsonPayload(response);
      setFintocLinked(!!payload?.linked);

      if (!payload?.linked) return false;

      const inserted = payload?.sync?.inserted ?? 0;
      if (inserted > 0) {
        addToast(`Se importaron ${inserted} movimiento(s) bancarios`, 'success');
      }

      return inserted > 0;
    } catch {
      return false;
    }
  }, [authHeaderValue, addToast]);

  const handleSaveBudget = useCallback(async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!authHeaderValue) {
      addToast('Tu sesion expiro. Inicia sesion nuevamente.', 'error');
      return;
    }

    const form = new FormData(event.currentTarget);
    const category = String(form.get('budget_category') || '').trim();
    const amountLimit = Number(form.get('budget_limit'));

    if (!category) {
      addToast('Selecciona una categoria', 'error');
      return;
    }

    if (!Number.isFinite(amountLimit) || amountLimit <= 0) {
      addToast('Ingresa un monto limite valido', 'error');
      return;
    }

    try {
      const response = await fetch('/api/budgets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeaderValue,
        },
        body: JSON.stringify({
          category,
          amount_limit: amountLimit,
          month: monthKey,
        }),
      });

      if (!response.ok) {
        throw new Error(await getApiError(response, 'No se pudo guardar el presupuesto'));
      }

      addToast('Presupuesto guardado correctamente', 'success');
      setShowBudgetModal(false);
      (event.target as HTMLFormElement).reset();
      await fetchBudgets();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error guardando presupuesto';
      addToast(message, 'error');
    }
  }, [addToast, authHeaderValue, monthKey, fetchBudgets]);

  const handleDeleteBudget = useCallback(async (budgetId: string) => {
    if (!authHeaderValue) return;

    try {
      const params = new URLSearchParams({ id: budgetId });
      const response = await fetch(`/api/budgets?${params.toString()}`, {
        method: 'DELETE',
        headers: { Authorization: authHeaderValue },
      });

      if (!response.ok) {
        throw new Error(await getApiError(response, 'No se pudo eliminar el presupuesto'));
      }

      addToast('Presupuesto eliminado', 'success');
      await fetchBudgets();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error eliminando presupuesto';
      addToast(message, 'error');
    }
  }, [authHeaderValue, addToast, fetchBudgets]);

  const handleEditTransaction = useCallback(async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!authHeaderValue || !editingTransaction) return;

    const form = new FormData(event.currentTarget);
    const description = String(form.get('description') || '').trim();
    const category = String(form.get('category') || '').trim();
    const amount = Number(form.get('amount'));
    const type = String(form.get('type') || 'expense') as 'expense' | 'income';

    if (!Number.isFinite(amount) || amount <= 0) {
      addToast('Ingresa un monto valido', 'error');
      return;
    }

    if (description.length > 200) {
      addToast('La descripcion no puede tener mas de 200 caracteres', 'error');
      return;
    }

    try {
      const response = await fetch(`/api/transactions/${editingTransaction.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: authHeaderValue },
        body: JSON.stringify({ description, category, amount, type }),
      });

      if (!response.ok) throw new Error(await getApiError(response, 'No se pudo actualizar la transaccion'));

      addToast('Transaccion actualizada', 'success');
      setEditingTransaction(null);
      await Promise.all([fetchTransactions(), fetchTotalSpent(), fetchCategoryBreakdown(), fetchTotalIncome()]);
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Error actualizando', 'error');
    }
  }, [authHeaderValue, editingTransaction, addToast, fetchTransactions, fetchTotalSpent, fetchCategoryBreakdown, fetchTotalIncome]);

  const handleDeleteTransaction = useCallback(async (id: string) => {
    if (!authHeaderValue || deletingTransactionId) return;
    if (!window.confirm('¿Eliminar esta transaccion? Esta accion no se puede deshacer.')) return;

    setDeletingTransactionId(id);
    try {
      const response = await fetch(`/api/transactions/${id}`, {
        method: 'DELETE',
        headers: { Authorization: authHeaderValue },
      });

      if (!response.ok) throw new Error(await getApiError(response, 'No se pudo eliminar'));

      addToast('Transaccion eliminada', 'success');
      await Promise.all([fetchTransactions(), fetchTotalSpent(), fetchCategoryBreakdown(), fetchTotalIncome()]);
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Error eliminando', 'error');
    } finally {
      setDeletingTransactionId(null);
    }
  }, [authHeaderValue, deletingTransactionId, addToast, fetchTransactions, fetchTotalSpent, fetchCategoryBreakdown, fetchTotalIncome]);

  const syncEmailsForCurrentUser = useCallback(async () => {
    if (!authHeaderValue) return false;

    const now = Date.now();
    const rawLastSync = localStorage.getItem(lastSyncKey);
    const parsedLastSync = rawLastSync ? Number.parseInt(rawLastSync, 10) : Number.NaN;
    const hasValidLastSync = Number.isFinite(parsedLastSync) && parsedLastSync > 0;

    if (hasValidLastSync && now - parsedLastSync < syncCooldownMs) {
      console.log('Sync omitido: ocurrió hace poco.');
      return false;
    }

    console.info('[Dashboard] Triggering /api/sync-emails on panel load');

    try {
      const response = await fetch('/api/sync-emails', {
        method: 'POST',
        headers: {
          Authorization: authHeaderValue,
          'x-client-info': 'dashboard-sync-v2',
        },
        cache: 'no-store',
      });

      const payload = await getJsonPayload(response);

      if (response.status === 401) {
        await supabase?.auth.signOut();
        return false;
      }

      if (response.status === 412) {
        const message =
          typeof payload?.error === 'string' && payload.error.trim()
            ? payload.error
            : 'Conecta Gmail en Configuracion para importar gastos automaticamente.';

        console.warn('[Dashboard] /api/sync-emails precondition failed', {
          status: response.status,
          summary: payload?.summary ?? null,
          debug: payload?.debug ?? null,
          users: Array.isArray(payload?.users) ? payload.users : [],
        });

        addToast(message, 'error');
        return false;
      }

      if (!response.ok) {
        const message =
          typeof payload?.error === 'string' && payload.error.trim()
            ? payload.error
            : 'No se pudo sincronizar Gmail';
        throw new Error(message);
      }

      const firstUser = Array.isArray(payload?.users) ? payload.users[0] : null;
      const status = typeof firstUser?.status === 'string' ? firstUser.status : '';

      if (status === 'no_account') {
        addToast('No tienes cuentas en accounts_cards. Crea una cuenta para registrar gastos.', 'error');
        return false;
      }

      if (status === 'invalid_refresh_token') {
        addToast('Tu conexion de Gmail vencio. Reconecta Gmail en Configuracion.', 'error');
        return false;
      }

      if (status === 'error') {
        const message =
          typeof firstUser?.error === 'string' && firstUser.error.trim()
            ? firstUser.error
            : 'Error sincronizando Gmail';
        addToast(message, 'error');
        return false;
      }

      const inserted = Number(payload?.summary?.inserted || 0);
      if (inserted === 0) {
        console.warn('[Dashboard] /api/sync-emails summary.inserted=0', {
          summary: payload?.summary ?? null,
          user_status: status || null,
          token_source: firstUser?.token_source ?? payload?.debug?.token_source ?? null,
          token_lookup: payload?.debug?.token_lookup ?? null,
          falabella_regex_no_match:
            Number(firstUser?.diagnostics?.falabella_regex_no_match || 0) || 0,
          falabella_parse_examples: firstUser?.diagnostics?.falabella_parse_examples ?? [],
          sender_breakdown: firstUser?.diagnostics?.sender_breakdown ?? null,
        });
      }

      if (inserted > 0) {
        addToast(`Se importaron ${inserted} gasto(s) desde Gmail`, 'success');
      }

      // Se guarda cooldown solo despues de una sincronizacion valida.
      localStorage.setItem(lastSyncKey, now.toString());
      return inserted > 0;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error sincronizando Gmail';
      addToast(message, 'error');
    }

    return false;
  }, [authHeaderValue, addToast]);

  const refreshAllData = useCallback(async () => {
    await Promise.all([fetchAccounts(), fetchTransactions(), fetchTotalSpent(), fetchCategoryBreakdown(), fetchBudgets(), fetchTotalIncome()]);
  }, [fetchAccounts, fetchTransactions, fetchTotalSpent, fetchCategoryBreakdown, fetchBudgets, fetchTotalIncome]);

  const readLastSyncDisplay = useCallback(() => {
    const raw = localStorage.getItem(lastSyncKey);
    const ts = raw ? Number.parseInt(raw, 10) : Number.NaN;
    if (!Number.isFinite(ts) || ts <= 0) { setLastSyncDisplay(null); return; }
    const diffMin = Math.floor((Date.now() - ts) / 60000);
    if (diffMin < 1) setLastSyncDisplay('hace un momento');
    else if (diffMin < 60) setLastSyncDisplay(`hace ${diffMin} min`);
    else if (diffMin < 1440) setLastSyncDisplay(`hace ${Math.floor(diffMin / 60)}h`);
    else setLastSyncDisplay(new Date(ts).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }));
  }, []);

  useEffect(() => {
    if (!authUser) return;

    readLastSyncDisplay();
    const intervalId = window.setInterval(() => {
      readLastSyncDisplay();
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [authUser, readLastSyncDisplay]);

  // Initial bootstrap – runs once when auth is ready. Does NOT re-run on month change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (authChecking || !authUser || !authHeaderValue) return;
    let cancelled = false;

    const bootstrapPanel = async () => {
      setLoading(true);
      await refreshAllData();
      const [hasNewGmail, hasNewFintoc] = await Promise.all([syncEmailsForCurrentUser(), syncFintocMovements()]);
      if (!cancelled && (hasNewGmail || hasNewFintoc)) await refreshAllData();
      if (!cancelled) {
        bootstrappedRef.current = true;
        readLastSyncDisplay();
        setLoading(false);
      }
    };

    void bootstrapPanel();
    return () => { cancelled = true; };
  }, [authChecking, authUser, authHeaderValue]); // intentionally omit fn refs – stable within auth session

  // Re-fetch when user navigates to a different month (skips initial mount)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!authHeaderValue || !bootstrappedRef.current) return;
    setLoading(true);
    void Promise.all([
      fetchTransactions(), fetchTotalSpent(), fetchCategoryBreakdown(),
      fetchBudgets(), fetchTotalIncome(),
    ]).then(() => setLoading(false));
  }, [monthKey]);

  const handleGoogleLogin = async () => {
    if (!supabase || !hasSupabaseBrowserConfig()) {
      addToast('Falta configurar NEXT_PUBLIC_SUPABASE_ANON_KEY', 'error');
      return;
    }

    setLoginBusy(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        scopes: 'https://www.googleapis.com/auth/gmail.readonly',
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    });

    if (error) {
      setLoginBusy(false);
      addToast('No se pudo iniciar sesion con Google', 'error');
    }
  };

  const handleLogout = async () => {
    await supabase?.auth.signOut();
    setAuthUser(null);
    setAccessToken(null);
    setAccounts([]);
    setTransactions([]);
    setTotalSpent(0);
  };

  const handleSaveExpense = useCallback(async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!authHeaderValue) {
      addToast('Tu sesion expiro. Inicia sesion nuevamente.', 'error');
      return;
    }

    const form = new FormData(event.currentTarget);
    const accountId = String(form.get('account_id') || '').trim();
    const amount = Number(form.get('amount'));
    const description = String(form.get('description') || '').trim();
    const category = String(form.get('category') || '').trim();

    if (!accountId) {
      addToast('Selecciona una cuenta', 'error');
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      addToast('Ingresa un monto valido', 'error');
      return;
    }

    if (description.length > 200) {
      addToast('La descripcion no puede tener mas de 200 caracteres', 'error');
      return;
    }

    try {
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeaderValue,
        },
        body: JSON.stringify({
          account_id: accountId,
          amount,
          type: newTransactionType,
          description,
          category,
        }),
      });

      if (!response.ok) {
        throw new Error(await getApiError(response, 'No se pudo guardar'));
      }

      addToast(newTransactionType === 'expense' ? 'Gasto registrado correctamente' : 'Ingreso registrado correctamente', 'success');
      setShowExpenseModal(false);
      setNewTransactionType('expense');
      event.currentTarget.reset();
      await Promise.all([fetchTransactions(), fetchAccounts(), fetchTotalSpent(), fetchTotalIncome()]);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error guardando';
      addToast(message, 'error');
    }
  }, [addToast, authHeaderValue, fetchAccounts, fetchTotalSpent, fetchTransactions, fetchTotalIncome, newTransactionType]);

  const isCurrentMonth = monthKey === getMonthKey();

  const monthLabel = useMemo(() => {
    const [year, month] = monthKey.split('-').map(Number);
    if (!Number.isFinite(year) || !Number.isFinite(month)) return 'Mes actual';

    const date = new Date(year, month - 1, 1);
    const label = date.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }, [monthKey]);

  const goToPrevMonth = useCallback(() => {
    setMonthKey((k) => {
      const [y, m] = k.split('-').map(Number);
      return getMonthKey(new Date(y, m - 2, 1));
    });
  }, []);

  const goToNextMonth = useCallback(() => {
    setMonthKey((k) => {
      const [y, m] = k.split('-').map(Number);
      return getMonthKey(new Date(y, m, 1));
    });
  }, []);

  // Filter transactions by time filter for display
  const filteredTransactions = useMemo(() => {
    const now = new Date();
    const sorted = [...transactions].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (timeFilter === 'today') {
      const todayStr = now.toISOString().split('T')[0];
      return sorted.filter((t) => (t.transaction_date || t.created_at).split('T')[0] === todayStr);
    }
    if (timeFilter === 'week') {
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      return sorted.filter((t) => new Date(t.transaction_date || t.created_at) >= weekAgo);
    }
    if (timeFilter === 'year') {
      const currentYear = now.getFullYear();
      return sorted.filter((t) => new Date(t.transaction_date || t.created_at).getFullYear() === currentYear);
    }
    return sorted;
  }, [transactions, timeFilter]);

  // Chart data: daily spending for last 7 days
  const chartData = useMemo(() => {
    const days = 7;
    const data: { date: string; total: number }[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateKey = d.toISOString().split('T')[0];
      const dayTotal = transactions
        .filter((t) => t.type === 'expense' && (t.transaction_date || t.created_at).split('T')[0] === dateKey)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      data.push({
        date: `${String(d.getDate()).padStart(2, '0')} ${d.toLocaleDateString('es-CL', { month: 'short' }).replace('.', '')}`,
        total: dayTotal,
      });
    }
    return data;
  }, [transactions]);

  // Calcular progreso de presupuestos vs gastos reales por categoria
  const budgetProgress = useMemo(() => {
    return budgets.map((budget) => {
      const catSpent = categoryBreakdown.find(
        (c) => c.category.toLowerCase() === budget.category.toLowerCase(),
      );
      const spent = catSpent?.total ?? 0;
      const percentage = budget.amount_limit > 0
        ? Math.round((spent / budget.amount_limit) * 100)
        : 0;
      return {
        ...budget,
        spent,
        percentage: Math.min(percentage, 100),
        overBudget: spent > budget.amount_limit,
        rawPercentage: percentage,
      };
    });
  }, [budgets, categoryBreakdown]);

  // Alerta de incendio: gastos >= 80% de ingresos
  const incomeAlertLevel = useMemo(() => {
    if (totalIncome <= 0) return 'none';
    const ratio = totalSpent / totalIncome;
    if (ratio >= 1) return 'critical';
    if (ratio >= 0.8) return 'warning';
    return 'none';
  }, [totalSpent, totalIncome]);

  // Colores para el desglose de categorias
  const categoryColors = useMemo(() => {
    const palette = [
      '#ff0015', '#4da3ff', '#2ed573', '#ffa502', '#a855f7',
      '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16',
      '#ef4444', '#22d3ee',
    ];
    const map: Record<string, string> = {};
    categoryBreakdown.forEach((c, i) => {
      map[c.category] = palette[i % palette.length];
    });
    return map;
  }, [categoryBreakdown]);

  // Categorias conocidas (del breakdown + las que ya tienen presupuesto)
  const allKnownCategories = useMemo(() => {
    const set = new Set<string>();
    categoryBreakdown.forEach((c) => set.add(c.category));
    ['Supermercado', 'Comida', 'Transporte', 'Delivery', 'Suscripciones', 'Hogar/Cuentas', 'Salud', 'Ropa', 'Ocio', 'Educacion', 'Transferencia', 'Otros'].forEach((c) => set.add(c));
    return Array.from(set).sort();
  }, [categoryBreakdown]);

  function getPaymentDisplay(tx: Transaction): { label: string; icon: IconName } {
    const src = tx.source || '';
    const desc = (tx.description || '').toUpperCase();
    if (src === 'fintoc' || src === 'webhook_banco') {
      if (desc.includes('TRANSFER')) return { label: 'Transferencia', icon: 'transfer' };
      return { label: 'Crédito', icon: 'credit-card' };
    }
    if (desc.includes('TRANSFER')) return { label: 'Transferencia', icon: 'transfer' };
    if (desc.includes('EFECTIVO') || desc.includes('CASH')) return { label: 'Efectivo', icon: 'cash' };
    return { label: 'Débito', icon: 'credit-card' };
  }

  if (authChecking) {
    return (
      <div className="auth-screen">
        <div className="panel-loading">
          <div className="spinner" />
          <p>Verificando sesion...</p>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="auth-logo-wrap" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="M4 8l5 5 4-4 7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M17 16h3v-3" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1>ExpenseTrack</h1>
          <p>Tracker personal con integracion bancaria</p>

          <button
            className="google-login-btn"
            type="button"
            onClick={handleGoogleLogin}
            disabled={loginBusy || !hasSupabaseBrowserConfig()}
          >
            <span className="google-symbol" aria-hidden="true">G</span>
            {loginBusy ? 'Redirigiendo a Google...' : 'Continuar con Google'}
          </button>

          {!hasSupabaseBrowserConfig() && (
            <p className="login-note error">Falta configurar NEXT_PUBLIC_SUPABASE_ANON_KEY.</p>
          )}
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
          <Link href="/" className="sidebar-nav-item active" onClick={() => setSidebarOpen(false)}>
            <Icon name="home" className="nav-icon" /> Panel
          </Link>
          <Link href="/settings" className="sidebar-nav-item" onClick={() => setSidebarOpen(false)}>
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
        <header className="dashboard-header dashboard-header-home">
          <button type="button" className="mobile-menu-btn" aria-label="Abrir menu lateral" onClick={() => setSidebarOpen((o) => !o)}>
            <Icon name="menu" />
          </button>

          <div className="header-title-block">
            <div className="header-title-row">
              <h1>Dashboard</h1>
              <div className="month-nav" role="group" aria-label="Navegacion por mes">
                <button type="button" className="month-nav-btn" onClick={goToPrevMonth} aria-label="Ir al mes anterior">
                  <Icon name="chevron-left" />
                </button>
                <span className="month-nav-label">{monthLabel}</span>
                <button
                  type="button"
                  className="month-nav-btn"
                  onClick={goToNextMonth}
                  aria-label="Ir al mes siguiente"
                  disabled={isCurrentMonth}
                  title={isCurrentMonth ? 'Ya estas en el mes actual' : 'Ir al mes siguiente'}
                >
                  <Icon name="chevron-right" />
                </button>
              </div>
            </div>
            <p>Resumen de tus gastos</p>
            {lastSyncDisplay && (
              <div className="header-sync-status">
                <span className="sync-dot" aria-hidden="true" />
                Ultima sync: {lastSyncDisplay}
              </div>
            )}
          </div>

          <div className="time-filter-wrap" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={`time-filter-btn ${showTimeDropdown ? 'open' : ''}`}
              onClick={() => setShowTimeDropdown((o) => !o)}
            >
              <Icon name="calendar" className="filter-icon" />
              {TIME_FILTER_LABELS[timeFilter]}
              <Icon name="chevron-down" className="chevron-icon" />
            </button>
            {showTimeDropdown && (
              <div className="time-filter-dropdown">
                {(['today', 'week', 'month', 'year', 'all'] as TimeFilter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    className={f === timeFilter ? 'active' : ''}
                    onClick={() => { setTimeFilter(f); setShowTimeDropdown(false); }}
                  >
                    {TIME_FILTER_LABELS[f]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>

        <section className="dashboard-content">
          {loading ? (
            <div className="summary-row">
              <div className="card skeleton-card" style={{ minHeight: 180 }}>
                <div className="skeleton skeleton-h" style={{ width: '40%', marginBottom: 12 }} />
                <div className="skeleton skeleton-lg" style={{ width: '60%', marginBottom: 16 }} />
                <div className="skeleton skeleton-h" style={{ width: '30%' }} />
              </div>
              <div className="card skeleton-card" style={{ minHeight: 180 }}>
                <div className="skeleton skeleton-h" style={{ width: '50%', marginBottom: 12 }} />
                <div className="skeleton" style={{ height: 120, borderRadius: 8 }} />
              </div>
            </div>
          ) : (
            <>
              {/* ── Summary Cards ─── */}
              <div className="summary-row">
                <div className="card summary-card">
                  <p className="summary-label">Total Gastado</p>
                  <p className="summary-value">{formatMoney(totalSpent)}</p>
                  <div className="summary-sub">
                    <Icon name="calendar" className="sub-icon" />
                    {monthLabel}
                  </div>
                  <div className="summary-card-icon">
                    <Icon name="trending-down" />
                  </div>
                </div>

                <div className="card chart-card">
                  <h3 className="chart-title">Últimos 7 días</h3>
                  <div className="chart-container">
                    <ResponsiveContainer width="100%" height={150}>
                      <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                        <defs>
                          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.3} />
                            <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={false} />
                        <YAxis tickFormatter={(v: number) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)} K` : String(v)}`} tick={{ fontSize: 11, fill: '#94A3B8' }} tickLine={false} axisLine={{ stroke: 'transparent' }} />
                        <Tooltip formatter={(v) => [formatMoney(Number(v ?? 0)), 'Gasto']} contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, color: '#e2e8f0', fontSize: 13 }} />
                        <Area type="monotone" dataKey="total" stroke="#3B82F6" strokeWidth={2} fill="url(#chartGrad)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* ── Income Alert ─── */}
              {incomeAlertLevel !== 'none' && (
                <div className={`income-alert ${incomeAlertLevel}`}>
                  <Icon name="alert-triangle" className="income-alert-icon" />
                  <div>
                    {incomeAlertLevel === 'critical' ? (
                      <>
                        <strong>Gastos superan tus ingresos</strong>
                        <p>Llevas {formatMoney(totalSpent)} gastados con solo {formatMoney(totalIncome)} de ingresos este mes.</p>
                      </>
                    ) : (
                      <>
                        <strong>Cuidado: gastos al {totalIncome > 0 ? Math.round((totalSpent / totalIncome) * 100) : 0}% de tus ingresos</strong>
                        <p>Llevas {formatMoney(totalSpent)} de {formatMoney(totalIncome)} registrados.</p>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* ── Category Breakdown ─── */}
              {categoryBreakdown.length > 0 && (
                <div className="card category-section">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                    <Icon name="pie-chart" style={{ width: 18, height: 18 }} />
                    <h2 style={{ fontSize: '1.125rem', fontWeight: 700, margin: 0 }}>Desglose por Categoría</h2>
                  </div>
                  <div className="category-grid">
                    <div className="donut-wrap">
                      <svg viewBox="0 0 42 42" className="donut-svg">
                        <circle cx="21" cy="21" r="15.9155" fill="none" stroke="var(--surface-elevated)" strokeWidth="4" />
                        {(() => {
                          const totalForChart = categoryBreakdown.reduce((s, c) => s + c.total, 0);
                          let cumulativePercent = 0;
                          return categoryBreakdown.map((cat) => {
                            const percent = totalForChart > 0 ? (cat.total / totalForChart) * 100 : 0;
                            const offset = 100 - cumulativePercent + 25;
                            cumulativePercent += percent;
                            return (
                              <circle key={cat.category} cx="21" cy="21" r="15.9155" fill="none" stroke={categoryColors[cat.category] || '#666'} strokeWidth="4" strokeDasharray={`${percent} ${100 - percent}`} strokeDashoffset={String(offset)} strokeLinecap="butt" />
                            );
                          });
                        })()}
                      </svg>
                      <div className="donut-center">
                        <span className="donut-total">{formatMoney(totalSpent)}</span>
                        <span className="donut-label">Total</span>
                      </div>
                    </div>
                    <div className="category-legend">
                      {categoryBreakdown.map((cat) => {
                        const totalForChart = categoryBreakdown.reduce((s, c) => s + c.total, 0);
                        const pct = totalForChart > 0 ? Math.round((cat.total / totalForChart) * 100) : 0;
                        return (
                          <div key={cat.category} className="legend-item">
                            <span className="legend-dot" style={{ background: categoryColors[cat.category] || '#666' }} />
                            <span className="legend-name">{cat.category}</span>
                            <span className="legend-pct">{pct}%</span>
                            <span className="legend-amount">{formatMoney(cat.total)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Budgets ─── */}
              <div className="card">
                <div className="budgets-header">
                  <h2><Icon name="target" style={{ width: 18, height: 18 }} /> Presupuestos</h2>
                  <button type="button" className="btn-secondary-sm" onClick={() => setShowBudgetModal(true)}>
                    + Nueva Meta
                  </button>
                </div>
                {budgetProgress.length === 0 ? (
                  <div className="empty-state">
                    <strong>Sin presupuestos este mes</strong>
                    <p>Define metas mensuales para controlar tus gastos por categoría.</p>
                  </div>
                ) : (
                  <div>
                    {budgetProgress.map((bp) => (
                      <div key={bp.id} className={`budget-item ${bp.overBudget ? 'over' : ''}`}>
                        <div className="budget-item-header">
                          <div className="budget-item-info">
                            <div className="budget-item-icon-wrap">
                              <Icon name={getCategoryIcon(bp.category)} />
                            </div>
                            <div>
                              <span className="budget-item-name">{bp.category}</span>
                              <span className="budget-item-amounts">{formatMoney(bp.spent)} / {formatMoney(bp.amount_limit)}</span>
                            </div>
                          </div>
                          <div className="budget-item-actions">
                            <span className={`budget-pct ${bp.overBudget ? 'over-pct' : bp.rawPercentage >= 80 ? 'warn' : ''}`}>{bp.rawPercentage}%</span>
                            <button type="button" className="icon-btn danger" onClick={() => handleDeleteBudget(bp.id)} aria-label={`Eliminar presupuesto ${bp.category}`}>
                              <Icon name="trash" />
                            </button>
                          </div>
                        </div>
                        <div className="budget-bar-track">
                          <div className={`budget-bar-fill ${bp.overBudget ? 'over' : bp.rawPercentage >= 80 ? 'warn' : ''}`} style={{ width: `${bp.percentage}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── Onboarding ─── */}
              {transactions.length === 0 && (
                <div className="card" style={{ padding: '1.25rem 1.5rem' }}>
                  <h2 style={{ marginBottom: '1rem', fontSize: '1rem', fontWeight: 700 }}>Primeros pasos</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div className="onboarding-item">
                      <span className={`onboarding-step ${fintocLinked ? 'done' : ''}`}>{fintocLinked ? '✓' : '1'}</span>
                      <div style={{ flex: 1 }}>
                        <strong style={{ fontSize: '0.875rem' }}>Vincula un banco</strong>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>Conecta Fintoc para importar movimientos automaticamente.</p>
                      </div>
                      {!fintocLinked && <Link href="/settings" style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>Ir a configuración →</Link>}
                    </div>
                    <div className="onboarding-item">
                      <span className="onboarding-step">2</span>
                      <div style={{ flex: 1 }}>
                        <strong style={{ fontSize: '0.875rem' }}>Conecta Gmail</strong>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>Importa gastos desde los correos de tu banco automaticamente.</p>
                      </div>
                      <Link href="/settings" style={{ fontSize: '0.75rem', whiteSpace: 'nowrap' }}>Ir a configuración →</Link>
                    </div>
                    <div className="onboarding-item">
                      <span className="onboarding-step">3</span>
                      <div style={{ flex: 1 }}>
                        <strong style={{ fontSize: '0.875rem' }}>O registra un gasto manual</strong>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>Usa el botón + en la esquina inferior derecha.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Transactions ─── */}
              <div className="card transactions-section">
                <div className="transactions-header">
                  <h2>Transacciones</h2>
                  <span className="transactions-count">{filteredTransactions.length} movimientos</span>
                </div>

                {filteredTransactions.length === 0 ? (
                  <div className="empty-state">
                    <strong>Aún no hay gastos este mes</strong>
                    <p>Sincroniza Gmail o registra un gasto manual para empezar.</p>
                  </div>
                ) : (
                  <div className="transaction-list">
                    {filteredTransactions.map((tx) => {

                      const isExpense = tx.type === 'expense';
                      const amount = Math.abs(Number(tx.amount || 0));
                      const subtitle = getTransactionSubtitle(tx);
                      const dateStr = formatTransactionDate(tx.transaction_date || tx.created_at);
                      const payment = getPaymentDisplay(tx);
                      const isDeleting = deletingTransactionId === tx.id;

                      return (
                        <div key={tx.id} className="transaction-item">
                          <div className="transaction-icon-wrap">
                            <Icon name={getTransactionIconName(tx)} />
                          </div>

                          <div className="transaction-info">
                            <div className="transaction-name-row">
                              <span className="transaction-name">{getTransactionDisplayTitle(tx)}</span>
                              <Icon name="check-circle" className="transaction-check" />
                            </div>
                            <div className="transaction-meta">
                              {dateStr}
                              <span className="meta-dot" />
                              <Icon name={payment.icon} className="meta-icon" />
                              {payment.label}
                            </div>
                            {subtitle && <div className="transaction-subtitle">{subtitle}</div>}
                          </div>

                          <div className="transaction-right">
                            <span className={`transaction-amount ${isExpense ? '' : 'income'}`}>
                              {isExpense ? '-' : '+'}{formatMoney(amount)}
                            </span>
                            <span className="transaction-status">
                              <span className="status-dot" />
                              {isDeleting ? 'Eliminando...' : 'Completado'}
                            </span>
                            <div className="transaction-actions">
                              <button
                                type="button"
                                className="icon-btn"
                                aria-label="Editar transaccion"
                                title="Editar transaccion"
                                onClick={() => setEditingTransaction(tx)}
                                disabled={!!deletingTransactionId}
                              >
                                <Icon name="pencil" />
                              </button>
                              <button
                                type="button"
                                className="icon-btn danger"
                                aria-label="Eliminar transaccion"
                                title="Eliminar transaccion"
                                onClick={() => handleDeleteTransaction(tx.id)}
                                disabled={!!deletingTransactionId}
                              >
                                <Icon name="trash" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {transactions.length < totalTransactionCount && (
                  <div className="load-more-container">
                    <button
                      type="button"
                      className="btn-load-more"
                      onClick={() => loadMoreTransactions(transactions.length)}
                      disabled={loadingMore}
                    >
                      {loadingMore ? 'Cargando...' : `Cargar más (${totalTransactionCount - transactions.length} restantes)`}
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </main>

      {/* Sidebar overlay (mobile) */}
      {sidebarOpen && (
        <button type="button" className="sidebar-overlay" aria-label="Cerrar menu lateral" onClick={() => setSidebarOpen(false)} />
      )}

      {/* FAB */}
      <button type="button" className="fab" onClick={() => setShowExpenseModal(true)} disabled={accounts.length === 0} aria-label="Agregar gasto">
        +
      </button>

      {/* ── Add Expense Modal ─── */}
      {showExpenseModal && (
        <div className="modal-overlay" onClick={() => { setShowExpenseModal(false); setNewTransactionType('expense'); setExpensePayMethod('debito'); setExpenseCategory('Tienda'); setExpenseNotes(''); }}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Agregar Gasto</h3>
              <button type="button" className="modal-close" onClick={() => { setShowExpenseModal(false); setNewTransactionType('expense'); }}>
                <Icon name="close" />
              </button>
            </div>

            <form className="modal-form" onSubmit={handleSaveExpense}>
              <input type="hidden" name="account_id" value={accounts[0]?.id || ''} />
              <input type="hidden" name="category" value={expenseCategory} />

              <div className="field-group">
                <label htmlFor="expense-description">Descripción</label>
                <input id="expense-description" name="description" placeholder="ej: Almuerzo con amigos" maxLength={200} />
              </div>

              <div className="field-group">
                <label htmlFor="expense-notes">Notas (opcional)</label>
                <input id="expense-notes" placeholder="Detalles adicionales..." value={expenseNotes} onChange={(e) => setExpenseNotes(e.target.value)} />
              </div>

              <div className="field-group">
                <label htmlFor="expense-amount">Monto (CLP)</label>
                <input id="expense-amount" name="amount" type="number" min="1" step="1" placeholder="0" required />
              </div>

              <div className="field-group">
                <label>Método de Pago</label>
                <div className="option-grid">
                  {PAYMENT_METHODS.map((pm) => (
                    <button key={pm.id} type="button" className={`option-card ${expensePayMethod === pm.id ? 'selected' : ''}`} onClick={() => setExpensePayMethod(pm.id)}>
                      <span className="option-emoji">{pm.emoji}</span>
                      {pm.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field-group">
                <label>Categoría</label>
                <div className="option-grid">
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <button key={cat.id} type="button" className={`option-card ${expenseCategory === cat.id ? 'selected' : ''}`} onClick={() => setExpenseCategory(cat.id)}>
                      <span className="option-emoji">{cat.emoji}</span>
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <button type="submit" className="btn-submit-full">
                Agregar Gasto
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Budget Modal ─── */}
      {showBudgetModal && (
        <div className="modal-overlay" onClick={() => setShowBudgetModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Definir presupuesto mensual</h3>
              <button type="button" className="modal-close" onClick={() => setShowBudgetModal(false)}>
                <Icon name="close" />
              </button>
            </div>

            <form className="modal-form" onSubmit={handleSaveBudget}>
              <div className="field-group">
                <label htmlFor="budget-category">Categoría</label>
                <select id="budget-category" name="budget_category" required>
                  <option value="">Selecciona una categoría</option>
                  {allKnownCategories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div className="field-group">
                <label htmlFor="budget-limit">Monto límite mensual</label>
                <input id="budget-limit" name="budget_limit" type="number" min="1" step="1" placeholder="150000" required />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setShowBudgetModal(false)}>Cancelar</button>
                <button type="submit" className="btn-submit">Guardar presupuesto</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Transaction Modal ─── */}
      {editingTransaction && (
        <div className="modal-overlay" onClick={() => setEditingTransaction(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Editar transacción</h3>
              <button type="button" className="modal-close" onClick={() => setEditingTransaction(null)}>
                <Icon name="close" />
              </button>
            </div>

            <form className="modal-form" onSubmit={handleEditTransaction}>
              <div className="type-toggle">
                <button type="button" className={`type-btn expense ${editingTransaction.type === 'expense' ? 'active' : ''}`} onClick={() => setEditingTransaction({ ...editingTransaction, type: 'expense' })}>
                  Gasto
                </button>
                <button type="button" className={`type-btn income ${editingTransaction.type === 'income' ? 'active' : ''}`} onClick={() => setEditingTransaction({ ...editingTransaction, type: 'income' })}>
                  Ingreso
                </button>
              </div>

              <input type="hidden" name="type" value={editingTransaction.type} />

              <div className="field-row">
                <div className="field-group">
                  <label htmlFor="edit-amount">Monto</label>
                  <input id="edit-amount" name="amount" type="number" min="1" step="1" defaultValue={Math.abs(editingTransaction.amount)} required />
                </div>
                <div className="field-group">
                  <label htmlFor="edit-category">Categoría</label>
                  <select id="edit-category" name="category" defaultValue={editingTransaction.category || ''}>
                    <option value="">Sin categoría</option>
                    {allKnownCategories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="field-group">
                <label htmlFor="edit-description">Descripción</label>
                <input id="edit-description" name="description" defaultValue={editingTransaction.description || ''} maxLength={200} />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setEditingTransaction(null)}>Cancelar</button>
                <button type="submit" className={`btn-submit ${editingTransaction.type === 'income' ? 'success' : 'danger'}`}>
                  Guardar cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Toasts ─── */}
      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            <Icon name={toast.type === 'success' ? 'check-circle' : 'error-circle'} />
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}