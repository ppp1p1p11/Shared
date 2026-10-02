import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { recoverAfterRestart } from './logic';
import type { UploadItem, UploadSource } from './types';

export type NetworkGate = 'ok' | 'offline' | 'wifi';

type QueueState = {
  items: UploadItem[];
  network: NetworkGate;
  hydrated: boolean;
  add: (albumId: string, sources: UploadSource[]) => UploadItem[];
  patch: (id: string, patch: Partial<UploadItem>) => void;
  remove: (id: string) => void;
  clearFinished: () => void;
  retryFailed: () => void;
  resumeQuotaPaused: (albumId?: string) => void;
  setNetwork: (n: NetworkGate) => void;
};

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * The upload queue is persisted, so nothing the user queued is ever lost: not on app kill,
 * not offline, not when the owner's storage is full.
 */
export const useUploads = create<QueueState>()(
  persist(
    (set, get) => ({
      items: [],
      network: 'ok',
      hydrated: false,
      add: (albumId, sources) => {
        const now = Date.now();
        const fresh: UploadItem[] = sources.map((source, i) => ({
          id: uid(),
          albumId,
          createdAt: now + i,
          source,
          state: 'queued',
          bytesTotal: source.sizeHint ?? 0,
          bytesSent: 0,
          attempts: 0,
        }));
        set({ items: [...get().items, ...fresh] });
        return fresh;
      },
      patch: (id, patch) => set({ items: get().items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }),
      remove: (id) => set({ items: get().items.filter((i) => i.id !== id) }),
      clearFinished: () => set({ items: get().items.filter((i) => i.state !== 'done' && i.state !== 'duplicate') }),
      retryFailed: () =>
        set({ items: get().items.map((i) => (i.state === 'failed' ? { ...i, state: 'queued', attempts: 0, error: undefined, nextAttemptAt: undefined } : i)) }),
      resumeQuotaPaused: (albumId) =>
        set({
          items: get().items.map((i) =>
            i.state === 'paused_quota' && (!albumId || i.albumId === albumId) ? { ...i, state: 'queued', nextAttemptAt: undefined, error: undefined } : i,
          ),
        }),
      setNetwork: (network) => set({ network }),
    }),
    {
      name: 'rolo.uploads.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({ items: s.items }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.items = recoverAfterRestart(state.items);
          state.hydrated = true;
        }
        useUploads.setState({ hydrated: true });
      },
    },
  ),
);

export const uploadsForAlbum = (albumId: string) => useUploads.getState().items.filter((i) => i.albumId === albumId);
