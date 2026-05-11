const clpFormatter = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatCLP(amount: number): string {
  return clpFormatter.format(amount);
}

export function formatCLPCompact(amount: number): string {
  if (Math.abs(amount) >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (Math.abs(amount) >= 1_000) {
    return `$${(amount / 1_000).toFixed(0)}k`;
  }
  return formatCLP(amount);
}

export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  return {
    from: `${month}-01`,
    to:   `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`,
  };
}

export function formatMonthLabel(month: string): string {
  // month = 'YYYY-MM'
  const [y, m] = month.split('-').map(Number);
  const date = new Date(y, m - 1, 1);
  return date.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
}
