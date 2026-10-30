import { useEffect, useState } from 'react';
import fr from './messages/fr.json';
import es from './messages/es.json';
import en from './messages/en.json';

export type Locale = 'fr' | 'es' | 'en';
export const defaultLocale: Locale = 'fr';
export const supportedLocales: Locale[] = ['fr', 'es', 'en'];

export const localeLabels: Record<Locale, { label: string; flag: string }> = {
  fr: { label: 'Français', flag: '🇫🇷' },
  es: { label: 'Español', flag: '🇪🇸' },
  en: { label: 'English', flag: '🇺🇸' },
};

const catalogs: Record<Locale, unknown> = { fr, es, en };

let cachedLocale: Locale | null = null;
const listeners = new Set<(locale: Locale) => void>();

export function getLocale(): Locale {
  if (typeof window === 'undefined') return defaultLocale;
  if (cachedLocale) return cachedLocale;

  try {
    const saved = localStorage.getItem('preferred_locale') as Locale | null;
    if (saved && (saved === 'fr' || saved === 'es' || saved === 'en')) {
      cachedLocale = saved;
      return saved;
    }

    // Auto-detect browser preferred language
    const nav = (navigator.language || '').toLowerCase();
    if (nav.startsWith('es')) cachedLocale = 'es';
    else if (nav.startsWith('en')) cachedLocale = 'en';
    else cachedLocale = 'fr';
    return cachedLocale;
  } catch {
    return defaultLocale;
  }
}

export function setLocale(locale: Locale): void {
  if (!supportedLocales.includes(locale)) return;
  cachedLocale = locale;
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('preferred_locale', locale);
      document.documentElement.lang = locale;
      window.dispatchEvent(new CustomEvent('wba_locale_change', { detail: locale }));
    } catch {
      // Ignore localStorage exceptions in private browsing
    }
  }
  for (const listener of listeners) {
    try {
      listener(locale);
    } catch {
      // Ignore listener errors
    }
  }
}

export function useLocale() {
  const [current, setCurrent] = useState<Locale>(() => (typeof window !== 'undefined' ? getLocale() : defaultLocale));

  useEffect(() => {
    setCurrent(getLocale());
    const onLocaleChange = (loc: Locale) => setCurrent(loc);
    listeners.add(onLocaleChange);

    const onCustomEvent = (e: Event) => {
      const detail = (e as CustomEvent<Locale>).detail;
      if (detail) onLocaleChange(detail);
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === 'preferred_locale' && e.newValue && supportedLocales.includes(e.newValue as Locale)) {
        onLocaleChange(e.newValue as Locale);
      }
    };

    window.addEventListener('wba_locale_change', onCustomEvent);
    window.addEventListener('storage', onStorage);

    return () => {
      listeners.delete(onLocaleChange);
      window.removeEventListener('wba_locale_change', onCustomEvent);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return {
    locale: current,
    setLocale,
    t: (key: string, vars?: Record<string, string>) => t(key, vars, current),
    tr: <T>(key: string) => tr<T>(key, current),
  };
}

export function t(key: string, vars?: Record<string, string>, locale?: Locale): string {
  const active = locale ?? (typeof window !== 'undefined' ? getLocale() : defaultLocale);
  const catalog = catalogs[active] ?? catalogs[defaultLocale];
  const value = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], catalog);

  if (typeof value !== 'string') {
    // Fallback to default locale (fr)
    const fallback = key.split('.').reduce<unknown>(
      (o, k) => (o as Record<string, unknown> | undefined)?.[k],
      catalogs[defaultLocale],
    );
    if (typeof fallback !== 'string') return key;
    return fallback.replace(/\{\{(\w+)\}\}/g, (_, name: string) => vars?.[name] ?? '');
  }

  return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) => vars?.[name] ?? '');
}

/** Returns a structured (array/object) entry of the catalog, e.g. a list of landing sections. */
export function tr<T>(key: string, locale?: Locale): T {
  const active = locale ?? (typeof window !== 'undefined' ? getLocale() : defaultLocale);
  const catalog = catalogs[active] ?? catalogs[defaultLocale];
  const value = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], catalog);

  if (value === undefined) {
    return key.split('.').reduce<unknown>(
      (o, k) => (o as Record<string, unknown> | undefined)?.[k],
      catalogs[defaultLocale],
    ) as T;
  }
  return value as T;
}
