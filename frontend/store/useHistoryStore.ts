import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { safeStorage } from '@/lib/safeStorage';
import type { SearchHistoryEntry } from '@/types/transport';

const MAX_HISTORY_ITEMS = 30;

interface HistoryState {
  entries: SearchHistoryEntry[];
  addEntry: (entry: Omit<SearchHistoryEntry, 'id' | 'searchedAt'>) => void;
  removeEntry: (id: string) => void;
  clear: () => void;
}

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set) => ({
      entries: [],
      addEntry: (entry) =>
        set((state) => {
          const newEntry: SearchHistoryEntry = {
            ...entry,
            id: crypto.randomUUID(),
            searchedAt: new Date().toISOString()
          };
          const deduped = state.entries.filter((e) => e.query !== entry.query || e.type !== entry.type);
          return { entries: [newEntry, ...deduped].slice(0, MAX_HISTORY_ITEMS) };
        }),
      removeEntry: (id) => set((state) => ({ entries: state.entries.filter((e) => e.id !== id) })),
      clear: () => set({ entries: [] })
    }),
    { name: 'kharkivgo-history', storage: safeStorage }
  )
);
