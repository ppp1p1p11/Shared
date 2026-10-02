import { create } from 'zustand';

import type { IconName } from '@/components/ui/Icon';

export type Toast = { id: number; message: string; icon?: IconName; tone?: 'neutral' | 'success' | 'danger'; actionLabel?: string; onAction?: () => void };

export type SheetAction = { label: string; icon?: IconName; destructive?: boolean; onPress: () => void };
export type Sheet = { title?: string; message?: string; actions: SheetAction[]; cancelLabel: string };

type OverlayState = {
  toast: Toast | null;
  sheet: Sheet | null;
  showToast: (t: Omit<Toast, 'id'>) => void;
  hideToast: () => void;
  showSheet: (s: Sheet) => void;
  hideSheet: () => void;
};

let seq = 0;

export const useOverlay = create<OverlayState>((set) => ({
  toast: null,
  sheet: null,
  showToast: (t) => set({ toast: { ...t, id: ++seq } }),
  hideToast: () => set({ toast: null }),
  showSheet: (s) => set({ sheet: s }),
  hideSheet: () => set({ sheet: null }),
}));

export const toast = (message: string, opts: Omit<Toast, 'id' | 'message'> = {}) =>
  useOverlay.getState().showToast({ message, ...opts });

export const actionSheet = (s: Sheet) => useOverlay.getState().showSheet(s);
