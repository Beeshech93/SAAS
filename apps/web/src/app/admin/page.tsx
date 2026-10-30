'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui';

interface OverviewData {
  kpis: {
    totalBusinesses: number;
    activeBusinesses: number;
    suspendedBusinesses: number;
    totalUsers: number;
    totalCustomers: number;
    totalConversations: number;
    totalMessages: number;
    currentMonthMessages: number;
  };
  whatsapp: {
    cloudApi: number;
    evolution: number;
    active: number;
  };
  subscriptions: {
    byStatus: Record<string, number>;
    byPlan: Record<string, number>;
  };
  recentBusinesses: Array<{
    id: string;
    name: string;
    type: string;
    status: 'ACTIVE' | 'SUSPENDED';
    createdAt: string;
    owner: { name: string; email: string } | null;
    plan: string;
    subscriptionStatus: string;
    whatsapp: { provider: string; status: string; displayPhoneNumber: string | null } | null;
  }>;
}

export default function AdminOverviewPage() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api<OverviewData>('/api/admin/overview');
      setData(res);
    } catch (err: any) {
      setError(err?.message || 'Erreur lors du chargement des statistiques globales.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spinner label="Calcul des métriques de la plateforme…" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-950/20 p-6 text-center text-red-400">
        <p className="font-semibold">{error || 'Données indisponibles'}</p>
        <button
          onClick={fetchOverview}
          className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500 transition"
        >
          Réessayer
        </button>
      </div>
    );
  }

  const { kpis, whatsapp, subscriptions, recentBusinesses } = data;

  return (
    <div className="space-y-8 pb-12">
      {/* Top Banner */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Vue d'ensemble Plateforme
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400 border border-emerald-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Live SaaS
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Supervision globale des entreprises clientes, volumétrie des messages et santé système.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchOverview}
            className="flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-850 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition shadow-sm"
          >
            <span>🔄</span>
            <span>Actualiser</span>
          </button>
          <Link
            href="/admin/businesses"
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-brand-600/20 hover:brightness-110 transition"
          >
            <span>🏢</span>
            <span>Gérer les Entreprises</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Businesses */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-lg backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Entreprises</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400 text-lg">
              🏢
            </span>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight text-white">{kpis.totalBusinesses}</span>
            <span className="text-xs font-medium text-emerald-400">({kpis.activeBusinesses} actives)</span>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            {kpis.suspendedBusinesses > 0 ? (
              <span className="text-red-400 font-medium">{kpis.suspendedBusinesses} suspendue(s)</span>
            ) : (
              <span className="text-slate-400">0 suspension</span>
            )}
            <span>·</span>
            <Link href="/admin/businesses" className="text-brand-400 hover:underline">
              Voir tout →
            </Link>
          </div>
        </div>

        {/* Total Users & Customers */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-lg backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Utilisateurs & CRM</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 text-lg">
              👥
            </span>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight text-white">{kpis.totalUsers}</span>
            <span className="text-xs font-medium text-slate-400">comptes</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
            <span>{kpis.totalCustomers.toLocaleString()} contacts clients</span>
            <Link href="/admin/users" className="text-brand-400 hover:underline">
              Gérer →
            </Link>
          </div>
        </div>

        {/* Message Volume */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-lg backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Messages (Mois en cours)</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400 text-lg">
              💬
            </span>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight text-white">
              {kpis.currentMonthMessages.toLocaleString()}
            </span>
            <span className="text-xs font-medium text-amber-400">ce mois</span>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
            <span>Cumul historique :</span>
            <span className="font-semibold text-slate-300">{kpis.totalMessages.toLocaleString()}</span>
          </div>
        </div>

        {/* WhatsApp Integrations */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-lg backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">WhatsApp Connectés</span>
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/10 text-green-400 text-lg">
              📱
            </span>
          </div>
          <div className="mt-4 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight text-white">{whatsapp.active}</span>
            <span className="text-xs font-medium text-emerald-400">numéros actifs</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
            <span>{whatsapp.cloudApi} Meta · {whatsapp.evolution} Evolution</span>
            <Link href="/admin/whatsapp" className="text-brand-400 hover:underline">
              Détails →
            </Link>
          </div>
        </div>
      </div>

      {/* Middle Grid: Subscriptions & WhatsApp Providers */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Plans & Subscriptions Breakdown */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 shadow-lg backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-white">Abonnements & Plans</h2>
              <p className="text-xs text-slate-400">Répartition des abonnés et des périodes d'essai</p>
            </div>
            <Link
              href="/admin/subscriptions"
              className="text-xs font-semibold text-brand-400 hover:text-brand-300 transition"
            >
              Tous les plans →
            </Link>
          </div>

          <div className="mt-6 space-y-4">
            <div>
              <div className="flex justify-between text-xs font-medium text-slate-300 mb-1.5">
                <span>En période d'essai (Trial)</span>
                <span className="font-bold text-amber-400">{subscriptions.byStatus.TRIALING ?? 0}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all duration-500"
                  style={{
                    width: `${Math.min(
                      100,
                      ((subscriptions.byStatus.TRIALING ?? 0) / Math.max(1, kpis.totalBusinesses)) * 100,
                    )}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium text-slate-300 mb-1.5">
                <span>Abonnements Actifs Payants</span>
                <span className="font-bold text-emerald-400">{subscriptions.byStatus.ACTIVE ?? 0}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                  style={{
                    width: `${Math.min(
                      100,
                      ((subscriptions.byStatus.ACTIVE ?? 0) / Math.max(1, kpis.totalBusinesses)) * 100,
                    )}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium text-slate-300 mb-1.5">
                <span>Impayés / En retard (Past Due)</span>
                <span className="font-bold text-rose-400">{subscriptions.byStatus.PAST_DUE ?? 0}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-rose-500 transition-all duration-500"
                  style={{
                    width: `${Math.min(
                      100,
                      ((subscriptions.byStatus.PAST_DUE ?? 0) / Math.max(1, kpis.totalBusinesses)) * 100,
                    )}%`,
                  }}
                />
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-2 border-t border-slate-800 pt-4 text-center">
            <div className="rounded-xl bg-slate-950/60 p-3 border border-slate-800/40">
              <p className="text-[11px] font-semibold text-slate-400 uppercase">Starter</p>
              <p className="mt-1 text-lg font-bold text-white">{subscriptions.byPlan.STARTER ?? 0}</p>
            </div>
            <div className="rounded-xl bg-slate-950/60 p-3 border border-slate-800/40">
              <p className="text-[11px] font-semibold text-slate-400 uppercase">Business</p>
              <p className="mt-1 text-lg font-bold text-white">{subscriptions.byPlan.BUSINESS ?? 0}</p>
            </div>
            <div className="rounded-xl bg-slate-950/60 p-3 border border-slate-800/40">
              <p className="text-[11px] font-semibold text-slate-400 uppercase">Pro</p>
              <p className="mt-1 text-lg font-bold text-white">{subscriptions.byPlan.PRO ?? 0}</p>
            </div>
          </div>
        </div>

        {/* WhatsApp & Provider Infra */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 shadow-lg backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h2 className="text-base font-bold text-white">Infrastructure WhatsApp</h2>
              <p className="text-xs text-slate-400">Canaux de communication et webhooks</p>
            </div>
            <Link
              href="/admin/whatsapp"
              className="text-xs font-semibold text-brand-400 hover:text-brand-300 transition"
            >
              Statut des serveurs →
            </Link>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">Meta Cloud API</span>
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
              </div>
              <p className="mt-3 text-2xl font-extrabold text-white">{whatsapp.cloudApi}</p>
              <p className="mt-1 text-[11px] text-slate-500">API officielle WhatsApp Cloud</p>
            </div>

            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-400">Evolution API</span>
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
              </div>
              <p className="mt-3 text-2xl font-extrabold text-white">{whatsapp.evolution}</p>
              <p className="mt-1 text-[11px] text-slate-500">Instances QR Code autonomes</p>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-slate-800/80 bg-slate-950/40 p-4 text-xs text-slate-400 space-y-2">
            <div className="flex items-center justify-between">
              <span>Webhooks entrant Meta :</span>
              <span className="font-mono text-emerald-400 font-medium">/api/webhooks/whatsapp (Actif)</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Webhooks Evolution API :</span>
              <span className="font-mono text-emerald-400 font-medium">/api/webhooks/evolution (Actif)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Businesses Table */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 shadow-lg backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-base font-bold text-white">Dernières Entreprises Inscrites</h2>
            <p className="text-xs text-slate-400">Les 6 derniers tenants ayant rejoint la plateforme</p>
          </div>
          <Link
            href="/admin/businesses"
            className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white transition"
          >
            Voir les {kpis.totalBusinesses} entreprises →
          </Link>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="py-3 px-4">Entreprise</th>
                <th className="py-3 px-4">Propriétaire</th>
                <th className="py-3 px-4">WhatsApp</th>
                <th className="py-3 px-4">Plan</th>
                <th className="py-3 px-4">Statut</th>
                <th className="py-3 px-4">Inscription</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {recentBusinesses.map((b) => (
                <tr key={b.id} className="hover:bg-slate-800/30 transition">
                  <td className="py-3 px-4 font-semibold text-white">
                    <div className="flex items-center gap-2">
                      <span>{b.name}</span>
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400 font-mono">
                        {b.type}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    {b.owner ? (
                      <div>
                        <p className="font-medium text-slate-200">{b.owner.name}</p>
                        <p className="text-[11px] text-slate-500">{b.owner.email}</p>
                      </div>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {b.whatsapp ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        {b.whatsapp.displayPhoneNumber || b.whatsapp.provider}
                      </span>
                    ) : (
                      <span className="text-slate-500">Non configuré</span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <span className="rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 font-medium text-indigo-300">
                      {b.plan}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        b.status === 'ACTIVE'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                      }`}
                    >
                      {b.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-400">
                    {new Date(b.createdAt).toLocaleDateString('fr-FR', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <Link
                      href={`/admin/businesses/${b.id}`}
                      className="font-semibold text-brand-400 hover:text-brand-300 transition"
                    >
                      Détails →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
