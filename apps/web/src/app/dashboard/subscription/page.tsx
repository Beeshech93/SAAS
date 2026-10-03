'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { errorMessage } from '@/lib/use-resource';
import { Button, ErrorAlert, Spinner } from '@/components/ui';
import { t } from '@/i18n';

interface Plan { code: 'STARTER' | 'BUSINESS' | 'PRO'; name: string; priceCents: number; currency: string; messageLimit: number; userLimit: number; featureFlags: Record<string, boolean> }
interface Sub {
  plan: Plan; status: string; active: boolean; trialEndsAt: string | null;
  limits: { messages: number; users: number }; usage: { messages: number; users: number; pendingInvites: number };
  plans: Plan[]; selfService: boolean;
}

function Meter({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = Math.min(100, Math.round((value / Math.max(1, max)) * 100));
  return (
    <div>
      <div className="flex justify-between text-sm"><span>{label}</span><span className="tabular-nums">{value} / {max}</span></div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max} aria-label={label}>
        <div className={`h-full ${pct >= 90 ? 'bg-red-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const price = (p: Plan) => `${(p.priceCents / 100).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} ${p.currency === 'USD' ? '$' : p.currency}`;

export default function SubscriptionPage() {
  const { me } = useAuth();
  const [s, setS] = useState<Sub | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isOwner = me?.role === 'OWNER';

  const load = useCallback(async () => {
    try { setS(await api<Sub>('/api/subscription')); } catch (e) { setError(errorMessage(e)); }
  }, []);
  useEffect(() => { if (isOwner) void load(); }, [isOwner, load]);

  async function choose(plan: string) {
    setBusy(true); setError(null); setNotice(null);
    try { await api('/api/subscription/change-plan', { method: 'POST', body: { plan } }); setNotice(t('subscription.changed')); await load(); }
    catch (e) { setError(errorMessage(e)); }
    setBusy(false);
  }

  if (!me) return null;
  if (!isOwner) return <p className="text-sm text-slate-600">{t('subscription.ownerOnly')}</p>;
  if (!s) return error ? <ErrorAlert message={error} /> : <Spinner label={t('common.loading')} />;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{t('subscription.title')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('subscription.intro')}</p>
      </div>
      <ErrorAlert message={error} />
      {notice && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>}
      {!s.active && <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{t('subscription.inactive')}</p>}

      <section className="rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="s-usage">
        <p className="text-sm text-slate-500">{t('subscription.current')}</p>
        <p className="mt-1 text-xl font-bold">{s.plan.name} <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs font-medium">{t(`subscription.status.${s.status}`)}</span></p>
        {s.status === 'TRIALING' && s.trialEndsAt && <p className="mt-1 text-sm text-slate-600">{t('subscription.trialEnds', { date: new Date(s.trialEndsAt).toLocaleDateString('fr-FR') })}</p>}
        <h2 id="s-usage" className="mb-3 mt-5 font-semibold">{t('subscription.usage')}</h2>
        <div className="space-y-4">
          <Meter label={t('subscription.messages')} value={s.usage.messages} max={s.limits.messages} />
          <Meter label={t('subscription.users')} value={s.usage.users + s.usage.pendingInvites} max={s.limits.users} />
        </div>
      </section>

      <section aria-labelledby="s-plans">
        <h2 id="s-plans" className="mb-3 text-lg font-semibold">{t('subscription.plans')}</h2>
        {!s.selfService && <p className="mb-3 text-sm text-slate-500">{t('subscription.paymentsSoon')}</p>}
        <div className="grid gap-4 md:grid-cols-3">
          {s.plans.map((p) => {
            const current = p.code === s.plan.code;
            return (
              <article key={p.code} className={`rounded-xl border bg-white p-5 ${current ? 'border-brand-500 ring-1 ring-brand-500' : 'border-slate-200'}`}>
                <h3 className="font-semibold">{p.name}</h3>
                <p className="mt-2 text-2xl font-bold">{price(p)} <span className="text-sm font-normal text-slate-500">{t('subscription.perMonth')}</span></p>
                <ul className="mt-3 space-y-1 text-sm text-slate-600">
                  <li>{t('subscription.messagesLimit', { n: p.messageLimit.toLocaleString('fr-FR') })}</li>
                  <li>{t('subscription.usersLimit', { n: String(p.userLimit) })}</li>
                  {Object.entries(p.featureFlags).filter(([, on]) => on).map(([k]) => <li key={k}>✓ {t(`subscription.features.${k}`)}</li>)}
                </ul>
                {current ? <p className="mt-4 text-sm font-medium text-brand-700">{t('subscription.currentBadge')}</p>
                  : <Button className="mt-4 w-full" disabled={busy || !s.selfService} onClick={() => choose(p.code)}>{t('subscription.choose')}</Button>}
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
