'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui';

interface SubscriptionsData {
  kpis: {
    totalBusinesses: number;
  };
  subscriptions: {
    byStatus: Record<string, number>;
    byPlan: Record<string, number>;
  };
}

export default function AdminSubscriptionsPage() {
  const [data, setData] = useState<SubscriptionsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await api<SubscriptionsData>('/api/admin/overview');
        setData(res);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spinner label="Chargement des métriques d'abonnements…" />
      </div>
    );
  }

  if (!data) return null;

  const { subscriptions } = data;

  const PLANS = [
    {
      code: 'STARTER',
      name: 'Starter',
      price: '$29 / mois',
      messages: '1 000 messages / mois',
      users: '2 membres d’équipe',
      badge: 'bg-slate-700 text-slate-200',
      activeCount: subscriptions.byPlan.STARTER ?? 0,
      description: 'Idéal pour démarrer avec les petites structures ou commerces locaux.',
    },
    {
      code: 'BUSINESS',
      name: 'Business',
      price: '$79 / mois',
      messages: '5 000 messages / mois',
      users: '5 membres d’équipe',
      badge: 'bg-brand-600/20 text-brand-400 border border-brand-500/30',
      activeCount: subscriptions.byPlan.BUSINESS ?? 0,
      description: 'La formule la plus populaire pour les hôtels et restaurants à fort trafic.',
    },
    {
      code: 'PRO',
      name: 'Pro Enterprise',
      price: '$199 / mois',
      messages: '20 000 messages / mois',
      users: '15 membres d’équipe',
      badge: 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30',
      activeCount: subscriptions.byPlan.PRO ?? 0,
      description: 'Volume élevé, campagnes WhatsApp massives et support prioritaire.',
    },
  ];

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Plans & Souscriptions de la Plateforme
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Supervision des niveaux de formules, quotas alloués et distribution des abonnés.
        </p>
      </div>

      {/* Plan Cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.code}
            className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-xl backdrop-blur-md flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className={`rounded-lg px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${plan.badge}`}>
                  {plan.name}
                </span>
                <span className="text-xs font-semibold text-slate-400">
                  {plan.activeCount} entreprise(s)
                </span>
              </div>

              <div className="mt-4">
                <span className="text-2xl font-extrabold text-white">{plan.price}</span>
              </div>

              <p className="mt-2 text-xs text-slate-400">{plan.description}</p>

              <div className="mt-6 space-y-2 border-t border-slate-800 pt-4 text-xs text-slate-300">
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span>
                  <span>{plan.messages}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span>
                  <span>{plan.users}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span>
                  <span>IA Claude Messages & Handoff</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span>
                  <span>Campagnes & Segments clients</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800">
              <Link
                href={`/admin/businesses`}
                className="block w-full text-center rounded-xl bg-slate-800 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 hover:text-white transition"
              >
                Voir les souscripteurs →
              </Link>
            </div>
          </div>
        ))}
      </div>

      {/* Subscription Breakdown Statuses */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 shadow-lg backdrop-blur-md">
        <h2 className="text-base font-bold text-white mb-4">
          Statuts Globaux des Comptes
        </h2>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-center">
            <span className="text-xs font-semibold text-amber-400 uppercase">Période d'Essai (Trial)</span>
            <p className="mt-2 text-2xl font-bold text-white">
              {subscriptions.byStatus.TRIALING ?? 0}
            </p>
            <p className="text-[10px] text-slate-500 mt-1">14 jours sans carte</p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-center">
            <span className="text-xs font-semibold text-emerald-400 uppercase">Abonnements Actifs</span>
            <p className="mt-2 text-2xl font-bold text-white">
              {subscriptions.byStatus.ACTIVE ?? 0}
            </p>
            <p className="text-[10px] text-slate-500 mt-1">Comptes validés</p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-center">
            <span className="text-xs font-semibold text-rose-400 uppercase">Impayés (Past Due)</span>
            <p className="mt-2 text-2xl font-bold text-white">
              {subscriptions.byStatus.PAST_DUE ?? 0}
            </p>
            <p className="text-[10px] text-slate-500 mt-1">En attente de régularisation</p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-center">
            <span className="text-xs font-semibold text-slate-400 uppercase">Résiliés / Expirés</span>
            <p className="mt-2 text-2xl font-bold text-white">
              {(subscriptions.byStatus.CANCELED ?? 0) + (subscriptions.byStatus.EXPIRED ?? 0)}
            </p>
            <p className="text-[10px] text-slate-500 mt-1">Accès restreint</p>
          </div>
        </div>
      </div>
    </div>
  );
}
