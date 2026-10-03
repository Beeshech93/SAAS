'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Analytics } from '@/lib/analytics';
import { useAuth } from '@/lib/auth-context';
import { errorMessage } from '@/lib/use-resource';
import { StatCard } from '@/components/stat-card';
import { ErrorAlert, Spinner } from '@/components/ui';
import { t } from '@/i18n';

interface Conv { id: string; status: string; lastMessageAt: string; lastMessagePreview: string | null; aiActive: boolean; customer: { name: string | null; phone: string } | null }

export default function DashboardPage() {
  const { me } = useAuth();
  const [stats, setStats] = useState<Analytics | null>(null);
  const [recent, setRecent] = useState<Conv[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isManager = me?.role === 'OWNER' || me?.role === 'ADMIN';

  useEffect(() => {
    if (!me) return;
    api<Conv[]>('/api/conversations').then((c) => setRecent(c.slice(0, 5))).catch((e) => setError(errorMessage(e)));
    if (isManager) api<Analytics>('/api/analytics').then(setStats).catch((e) => setError(errorMessage(e)));
  }, [me, isManager]);

  if (!me) return null;
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-2xl font-bold">{t('dashboard.greeting', { businessName: me.business.name })}</h1>
      <ErrorAlert message={error} />
      {isManager && (
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {!stats && !error ? <div className="col-span-full"><Spinner label={t('common.loading')} /></div> : stats && (
            <>
              <StatCard label={t('dashboard.stats.conversations')} value={stats.conversations.total} />
              <StatCard label={t('dashboard.stats.customers')} value={stats.customers} />
              <StatCard label={t('dashboard.stats.resolved')} value={stats.conversations.resolved} />
              <StatCard label={t('dashboard.stats.pending')} value={stats.conversations.pending} />
            </>
          )}
        </div>
      )}

      <section className="mt-8" aria-labelledby="recent">
        <div className="flex items-center justify-between">
          <h2 id="recent" className="text-lg font-semibold">{t('dashboard.recent')}</h2>
          <Link href="/dashboard/conversations" className="text-sm font-medium text-brand-700 hover:underline">{t('dashboard.seeAll')}</Link>
        </div>
        <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {!recent && !error && <div className="p-4"><Spinner label={t('common.loading')} /></div>}
          {recent?.length === 0 && <p className="p-6 text-center text-sm text-slate-600">{t('dashboard.noRecent')}</p>}
          {recent?.map((c) => (
            <Link key={c.id} href="/dashboard/conversations" className="block px-4 py-3 hover:bg-slate-50">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{c.customer?.name ?? c.customer?.phone}</span>
                <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[11px]">{t(`inbox.status.${c.status}`)}</span>
              </div>
              <p className="truncate text-sm text-slate-500">{c.lastMessagePreview ?? '—'}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
