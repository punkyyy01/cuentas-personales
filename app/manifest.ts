import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ExpenseTrack',
    short_name: 'Cuentas',
    description: 'App de gestión de gastos e ingresos',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#0f172a',
    orientation: 'portrait',
    icons: [
      {
        src: '/icon',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}
