export function formatMoney(amount: number) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(amount || 0);
}

export function formatMonthYear(date = new Date()) {
  const month = date.toLocaleDateString('es-CL', { month: 'long' });
  return `${month} ${date.getFullYear()}`;
}

export function getMonthKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function formatTransactionDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--';

  const parts = new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'short',
  }).formatToParts(date);

  const day = parts.find((part) => part.type === 'day')?.value ?? '';
  const month = (parts.find((part) => part.type === 'month')?.value ?? '')
    .replace('.', '')
    .toLowerCase();

  return `${day} ${month}`.trim();
}

export function formatDashboardTitle(date = new Date()) {
  const month = date.toLocaleDateString('es-CL', { month: 'long' }).toLowerCase();
  return `Gastos de ${month}`;
}
