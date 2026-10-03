import fr from './messages/fr.json';

// Add 'es' | 'en' | 'ht' here and a messages file per locale to extend later.
export type Locale = 'fr';
export const defaultLocale: Locale = 'fr';

const catalogs: Record<Locale, unknown> = { fr };

export function t(key: string, vars?: Record<string, string>, locale: Locale = defaultLocale): string {
  const value = key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], catalogs[locale]);
  if (typeof value !== 'string') return key;
  return value.replace(/\{\{(\w+)\}\}/g, (_, name: string) => vars?.[name] ?? '');
}

/** Returns a structured (array/object) entry of the catalog, e.g. a list of landing sections. */
export function tr<T>(key: string, locale: Locale = defaultLocale): T {
  return key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], catalogs[locale]) as T;
}
