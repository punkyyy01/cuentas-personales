'use client';

import { Icon, type IconName } from '@/components/icons';
import { formatMoney, formatTransactionDate } from '@/lib/format';
import type { Transaction } from './types';

function cleanTransactionName(name: string): string {
  return name.replace(/\u200B/g, '').trim();
}

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

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

type Props = {
  transactions: Transaction[];
  deletingTransactionId: string | null;
  onEdit: (tx: Transaction) => void;
  onDelete: (id: string) => void;
};

export function TransactionList({ transactions, deletingTransactionId, onEdit, onDelete }: Props) {
  if (transactions.length === 0) {
    return (
      <div className="empty-state">
        <strong>Aún no hay gastos este mes</strong>
        <p>Sincroniza Gmail o registra un gasto manual para empezar.</p>
      </div>
    );
  }

  return (
    <div className="transaction-list">
      {transactions.map((tx) => {
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
                  onClick={() => onEdit(tx)}
                  disabled={!!deletingTransactionId}
                >
                  <Icon name="pencil" />
                </button>
                <button
                  type="button"
                  className="icon-btn danger"
                  aria-label="Eliminar transaccion"
                  title="Eliminar transaccion"
                  onClick={() => onDelete(tx.id)}
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
  );
}
