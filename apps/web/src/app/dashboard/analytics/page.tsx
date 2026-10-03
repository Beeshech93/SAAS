'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { Analytics } from '@/lib/analytics';
import { useAuth } from '@/lib/auth-context';
import { formatDuration } from '@/lib/format';
import { errorMessage } from '@/lib/use-resource';
import { StatCard } from '@/components/stat-card';
import { ErrorAlert, Spinner } from '@/components/ui';
import { t } from '@/i18n';

export default function AnalyticsPage() {
  const { me } = useAuth();
  const [s, setS] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const allowed = me?.role === 'OWNER' || me?.role === 'ADMIN';

  useEffect(() => {
    if (allowed) api<Analytics>('/api/analytics').then(setS).catch((e) => setError(errorMessage(e)));
  }, [allowed]);

  if (!me) return null;
  if (!allowed) return <p className="text-sm text-slate-600">{t('analytics.forbidden')}</p>;
  if (!s) return error ? <ErrorAlert message={error} /> : <Spinner label={t('common.loading')} />;

  const max = Math.max(1, ...s.daily.flatMap((d) => [d.inbound, d.outbound]));
  const fr = s.firstResponse;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{t('analytics.title')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('analytics.intro')}</p>
      </div>

      <section aria-labelledby="a-conv">
        <h2 id="a-conv" className="mb-3 text-lg font-semibold">{t('analytics.conversations')}</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <StatCard label={t('analytics.total')} value={s.conversations.total} />
          <StatCard label={t('analytics.open')} value={s.conversations.open} />
          <StatCard label={t('analytics.pending')} value={s.conversations.pending} />
          <StatCard label={t('analytics.resolved')} value={s.conversations.resolved} />
          <StatCard label={t('analytics.closed')} value={s.conversations.closed} />
        </div>
      </section>

      <section aria-labelledby="a-msg">
        <h2 id="a-msg" className="mb-3 text-lg font-semibold">{t('analytics.messages')}</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label={t('analytics.customers')} value={s.customers} />
          <StatCard label={t('analytics.received')} value={s.messages.inbound} />
          <StatCard label={t('analytics.byAI')} value={s.messages.byAI} />
          <StatCard label={t('analytics.byAgent')} value={s.messages.byAgent} />
        </div>
      </section>

      <section aria-labelledby="a-resp">
        <h2 id="a-resp" className="mb-3 text-lg font-semibold">{t('analytics.firstResponse')}</h2>
        {fr.sampleSize === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-600">{t('analytics.noData')}</p>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <StatCard label={t('analytics.average')} value={formatDuration(fr.averageSeconds)} hint={t('analytics.sample', { n: String(fr.sampleSize) })} />
            <StatCard label={t('analytics.ai')} value={formatDuration(fr.aiAverageSeconds)} />
            <StatCard label={t('analytics.agent')} value={formatDuration(fr.agentAverageSeconds)} />
          </div>
        )}
      </section>

      <section aria-labelledby="a-daily">
        <h2 id="a-daily" className="mb-3 text-lg font-semibold">{t('analytics.daily')}</h2>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex h-40 items-end gap-2" role="img" aria-label={t('analytics.daily')}>
            {s.daily.map((d) => (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-32 w-full items-end justify-center gap-1">
                  <div className="w-1/3 rounded-t bg-slate-400" style={{ height: `${(d.inbound / max) * 100}%` }} title={`${t('analytics.legendIn')}: ${d.inbound}`} />
                  <div className="w-1/3 rounded-t bg-brand-500" style={{ height: `${(d.outbound / max) * 100}%` }} title={`${t('analytics.legendOut')}: ${d.outbound}`} />
                </div>
                <span className="text-[10px] text-slate-500">{d.date.slice(5)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-4 text-xs text-slate-600">
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-slate-400" /> {t('analytics.legendIn')}</span>
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-brand-500" /> {t('analytics.legendOut')}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
