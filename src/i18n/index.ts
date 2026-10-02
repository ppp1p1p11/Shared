import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en';
import ptBR from './locales/pt-BR';
import type { LanguagePref } from '@/stores/prefs';

export type AppLanguage = 'pt-BR' | 'en';

export function detectLanguage(): AppLanguage {
  const tag = getLocales()[0]?.languageTag ?? 'en';
  return tag.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en';
}

export function resolveLanguage(pref: LanguagePref): AppLanguage {
  return pref === 'auto' ? detectLanguage() : pref;
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, 'pt-BR': { translation: ptBR } },
  lng: detectLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function setLanguage(pref: LanguagePref) {
  const lng = resolveLanguage(pref);
  if (i18n.language !== lng) i18n.changeLanguage(lng);
}

/** BCP-47 tag for Intl formatting. */
export function currentLocale(): string {
  return i18n.language === 'pt-BR' ? 'pt-BR' : 'en-US';
}

export default i18n;
