'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, ApiRequestError } from './api';
import { t } from '@/i18n';

export function errorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.code === 'NETWORK') return t('common.network');
    if (err.code === 'PLAN_LIMIT') {
      const k = `limits.${err.details?.reason}`;
      return t(k) === k ? t('limits.default') : t(k);
    }
    const key = `auth.errors.${err.code}`;
    const msg = t(key);
    if (msg !== key) return msg;
  }
  return t('common.error');
}

/** Loads a list endpoint with loading/error state and a reload() helper. */
export function useList<T>(path: string) {
  const [items, setItems] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setError(null);
      setItems(await api<T[]>(path));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [path]);

  useEffect(() => { void reload(); }, [reload]);
  return { items, error, reload };
}
