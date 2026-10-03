'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui';
import { t } from '@/i18n';

interface Plan { code: string; name: string; priceCents: number; currency: string; messageLimit: number; userLimit: number; featureFlags: Record<string, boolean> }

export function Pricing() {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api<Plan[]>('/api/plans').then(setPlans).catch(() => setFailed(true));
  }, []);

  return (
    <div className="mt-10">
      {!plans && !failed && <div className="flex justify-center"><Spinner label={t('landing.pricing.loading')} /></div>}
      {failed && <p role="alert" className="text-center text-sm text-slate-600">{t('landing.pricing.error')}</p>}
      <div className="grid gap-6 md:grid-cols-3">
        {plans?.map((p) => {
          const popular = p.code === 'BUSINESS';
          return (
            <article key={p.code} className={`flex flex-col rounded-2xl border bg-white p-6 ${popular ? 'border-brand-500 ring-1 ring-brand-500' : 'border-slate-200'}`}>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{p.name}</h3>
                {popular && <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">{t('landing.pricing.popular')}</span>}
              </div>
              <p className="mt-4 text-4xl font-bold">
                {(p.priceCents / 100).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} {p.currency === 'USD' ? '$' : p.currency}
                <span className="text-sm font-normal text-slate-500"> {t('subscription.perMonth')}</span>
              </p>
              <ul className="mt-5 flex-1 space-y-2 text-sm text-slate-700">
                <li>✓ {t('subscription.messagesLimit', { n: p.messageLimit.toLocaleString('fr-FR') })}</li>
                <li>✓ {t('subscription.usersLimit', { n: String(p.userLimit) })}</li>
                {Object.entries(p.featureFlags).filter(([, on]) => on).map(([k]) => <li key={k}>✓ {t(`subscription.features.${k}`)}</li>)}
              </ul>
              <Link href="/register" className={`mt-6 rounded-lg px-4 py-2.5 text-center text-sm font-semibold ${popular ? 'bg-brand-600 text-white hover:bg-brand-700' : 'border border-slate-300 hover:bg-slate-50'}`}>
                {t('landing.pricing.start')}
              </Link>
            </article>
          );
        })}
      </div>
    </div>
  );
}
