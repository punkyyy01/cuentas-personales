'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

interface UIState {
  selectedMonth:       string;   // 'YYYY-MM'
  sidebarCollapsed:    boolean;
  insightsPanelOpen:   boolean;
  activeView:          string | null; // saved view id
  searchQuery:         string;
  selectedYear:        number;
  setSelectedMonth:    (m: string) => void;
  setSidebarCollapsed: (v: boolean) => void;
  setInsightsPanelOpen:(v: boolean) => void;
  setActiveView:       (id: string | null) => void;
  setSearchQuery:      (q: string) => void;
  setSelectedYear:     (y: number) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      selectedMonth:        currentMonth(),
      sidebarCollapsed:     false,
      insightsPanelOpen:    false,
      activeView:           null,
      searchQuery:          '',
      selectedYear:         new Date().getFullYear(),
      setSelectedMonth:     (selectedMonth)      => set({ selectedMonth }),
      setSidebarCollapsed:  (sidebarCollapsed)   => set({ sidebarCollapsed }),
      setInsightsPanelOpen: (insightsPanelOpen)  => set({ insightsPanelOpen }),
      setActiveView:        (activeView)         => set({ activeView }),
      setSearchQuery:       (searchQuery)        => set({ searchQuery }),
      setSelectedYear:      (selectedYear)       => set({ selectedYear }),
    }),
    { name: 'planilla-ui' }
  )
);
