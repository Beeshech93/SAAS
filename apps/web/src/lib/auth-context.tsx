'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setAccessToken } from './api';

export interface Me {
  user: { id: string; email: string; name: string };
  business: { id: string; name: string; type: 'HOTEL' | 'RESTAURANT' | 'OTHER'; onboardedAt: string | null };
  role: 'OWNER' | 'ADMIN' | 'AGENT';
}

interface AuthState {
  me: Me | null;
  loading: boolean;
  signIn: (data: Me & { accessToken: string }) => void;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore the session from the httpOnly refresh cookie (access token stays in memory only).
  useEffect(() => {
    (async () => {
      try {
        const { accessToken } = await api<{ accessToken: string }>('/api/auth/refresh', { method: 'POST' });
        setAccessToken(accessToken);
        setMe(await api<Me>('/api/auth/me'));
      } catch {
        setAccessToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const signIn = useCallback((data: Me & { accessToken: string }) => {
    setAccessToken(data.accessToken);
    setMe({ user: data.user, business: data.business, role: data.role });
  }, []);

  const signOut = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setAccessToken(null);
    setMe(null);
  }, []);

  const refresh = useCallback(async () => {
    setMe(await api<Me>('/api/auth/me'));
  }, []);

  return <Ctx.Provider value={{ me, loading, signIn, signOut, refresh }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
