import { createContext, useContext, useMemo, type PropsWithChildren } from 'react';
import { useColorScheme } from 'react-native';

import { usePrefs } from '@/stores/prefs';
import { darkColors, lightColors, type ColorTokens } from './tokens';

export type Theme = { scheme: 'light' | 'dark'; colors: ColorTokens };

const ThemeContext = createContext<Theme>({ scheme: 'light', colors: lightColors });

export function ThemeProvider({ children }: PropsWithChildren) {
  const system = useColorScheme();
  const appearance = usePrefs((s) => s.appearance);
  const scheme = appearance === 'system' ? (system === 'dark' ? 'dark' : 'light') : appearance;
  const value = useMemo<Theme>(() => ({ scheme, colors: scheme === 'dark' ? darkColors : lightColors }), [scheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

export function useColors() {
  return useContext(ThemeContext).colors;
}
