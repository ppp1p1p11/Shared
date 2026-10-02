import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type Appearance = 'system' | 'light' | 'dark';
export type LanguagePref = 'auto' | 'pt-BR' | 'en';

type PrefsState = {
  appearance: Appearance;
  language: LanguagePref;
  /** Last name typed when joining, prefilled next time (device-local). */
  lastDisplayName: string;
  wifiOnlyUploads: boolean;
  /** Grid density (photos per row), remembered across albums. */
  gridColumns: number;
  /** Account-upgrade nudge was dismissed (shown only after 2+ albums). */
  upgradeNudgeDismissed: boolean;
  /** Album ids for which the 80% storage heads-up was already shown. */
  storageWarned: Record<string, boolean>;
  /** Smart date-range suggestions the user already acted on or dismissed, per album. */
  suggestionHandled: Record<string, boolean>;
  set: (patch: Partial<Omit<PrefsState, 'set'>>) => void;
};

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      appearance: 'system',
      language: 'auto',
      lastDisplayName: '',
      wifiOnlyUploads: false,
      gridColumns: 3,
      upgradeNudgeDismissed: false,
      storageWarned: {},
      suggestionHandled: {},
      set: (patch) => set(patch),
    }),
    { name: 'rolo.prefs', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
