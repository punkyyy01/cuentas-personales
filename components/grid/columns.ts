import type { GridColumn } from '@glideapps/glide-data-grid';

export const COL = {
  DATE:        0,
  DESCRIPTION: 1,
  AMOUNT:      2,
  TYPE:        3,
  CATEGORY:    4,
  TAGS:        5,
  NOTES:       6,
} as const;

export type ColIndex = typeof COL[keyof typeof COL];

export const COLUMNS: GridColumn[] = [
  { title: 'Fecha',       id: 'date',        width: 110 },
  { title: 'Descripción', id: 'description', width: 300, grow: 1 },
  { title: 'Monto',       id: 'amount',      width: 130 },
  { title: 'Tipo',        id: 'type',        width: 95  },
  { title: 'Categoría',   id: 'category',    width: 160 },
  { title: 'Tags',        id: 'tags',        width: 140 },
  { title: 'Notas',       id: 'notes',       width: 200, grow: 1 },
];
