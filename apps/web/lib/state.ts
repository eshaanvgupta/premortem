'use client';
import { create } from 'zustand';
type Preferences = { reduced: boolean; toggleReduced: () => void };
export const usePreferences = create<Preferences>((set) => ({
  reduced: false,
  toggleReduced: () => set((s) => ({ reduced: !s.reduced })),
}));
