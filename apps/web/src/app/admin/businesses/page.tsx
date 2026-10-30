'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui';

interface BusinessItem {
  id: string;
  name: string;
  type: string;
  status: 'ACTIVE' | 'SUSPENDED';
  phone: string | null;
  email: string | null;
  createdAt: string;
  aiEnabled: boolean;
  owner: { id: string; name: string; email: string } | null;
  stats: {
    customers: number;
    conversations: number;
    messages: number;
    members: number;
  };
  subscription: {
    planCode: string;
    planName: string;
    status: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
  } | null;
  whatsapp: {
    provider: string;
    status: string;
    displayPhoneNumber: string | null;
  } | null;
}

interface ListResponse {
  items: BusinessItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export default function AdminBusinessesPage() {
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'SUSPENDED'>('ALL');
  const [page, setPage] = useState(1);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [modalBusiness, setModalBusiness] = useState<BusinessItem | null>(null);
  const [newPlanCode, setNewPlanCode] = useState<'STARTER' | 'BUSINESS' | 'PRO'>('STARTER');
  const [newSubStatus, setNewSubStatus] = useState<'ACTIVE' | 'TRIALING'>('ACTIVE');
  const [extendDays, setExtendDays] = useState(14);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchBusinesses = async (targetPage = page) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(targetPage));
      params.set('limit', '15');
      if (search.trim()) params.set('search', search.trim());
      if (statusFilter !== 'ALL') params.set('status', statusFilter);

      const res = await api<ListResponse>(`/api/admin/businesses?${params.toString()}`);
      setData(res);
      setPage(targetPage);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBusinesses(1);
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchBusinesses(1);
  };

  const handleToggleStatus = async (biz: BusinessItem) => {
    const nextStatus = biz.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    const confirmMsg =
      nextStatus === 'SUSPENDED'
        ? `Êtes-vous sûr de vouloir SUSPENDRE l'entreprise "${biz.name}" ? Ses utilisateurs ne pourront plus se connecter.`
        : `Réactiver l'entreprise "${biz.name}" ?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      setUpdatingId(biz.id);
      await api(`/api/admin/businesses/${biz.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      fetchBusinesses(page);
    } catch (err: any) {
      alert(err?.message || 'Erreur lors de la modification du statut');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleSaveSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalBusiness) return;
    try {
      setActionError(null);
      await api(`/api/admin/businesses/${modalBusiness.id}/subscription`, {
        method: 'PATCH',
        body: JSON.stringify({
          planCode: newPlanCode,
          status: newSubStatus,
          extendTrialDays: newSubStatus === 'TRIALING' ? extendDays : undefined,
        }),
      });
      setModalBusiness(null);
      fetchBusinesses(page);
    } catch (err: any) {
      setActionError(err?.message || 'Erreur lors de la mise à jour de la souscription');
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Gestion des Entreprises (Tenants)
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Répertoire de toutes les entreprises enregistrées, gestion des statuts et abonnements.
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:flex-row sm:items-center sm:justify-between backdrop-blur-md">
        <form onSubmit={handleSearchSubmit} className="flex flex-1 items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom, email, téléphone…"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  fetchBusinesses(1);
                }}
                className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>
          <button
            type="submit"
            className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700 transition"
          >
            Rechercher
          </button>
        </form>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-400">Statut :</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-white focus:border-brand-500 focus:outline-none"
          >
            <option value="ALL">Tous les statuts</option>
            <option value="ACTIVE">Actives uniquement</option>
            <option value="SUSPENDED">Suspendues</option>
          </select>
        </div>
      </div>

      {/* Data Table */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 shadow-lg backdrop-blur-md overflow-hidden">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Spinner label="Chargement des entreprises…" />
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <p className="text-3xl mb-2">🔍</p>
            <p className="font-semibold text-white">Aucune entreprise trouvée</p>
            <p className="text-xs mt-1 text-slate-500">Essayez de modifier vos critères de recherche.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="border-b border-slate-800 bg-slate-950/40 text-[11px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="py-3 px-4">Entreprise & Type</th>
                  <th className="py-3 px-4">Propriétaire</th>
                  <th className="py-3 px-4">WhatsApp</th>
                  <th className="py-3 px-4">Abonnement</th>
                  <th className="py-3 px-4">Volumétrie</th>
                  <th className="py-3 px-4">Statut</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {data.items.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3.5 px-4 font-semibold text-white">
                      <div>
                        <Link
                          href={`/admin/businesses/${b.id}`}
                          className="hover:text-brand-400 transition flex items-center gap-1.5"
                        >
                          <span>{b.name}</span>
                          <span className="text-[10px] text-slate-500">↗</span>
                        </Link>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] font-normal text-slate-400">
                          <span className="rounded bg-slate-800 px-1.5 py-0.2 font-mono text-[10px]">
                            {b.type}
                          </span>
                          <span>·</span>
                          <span>
                            Inscrit le {new Date(b.createdAt).toLocaleDateString('fr-FR')}
                          </span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      {b.owner ? (
                        <div>
                          <p className="font-medium text-slate-200">{b.owner.name}</p>
                          <p className="text-[11px] text-slate-500">{b.owner.email}</p>
                        </div>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {b.whatsapp ? (
                        <div>
                          <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            {b.whatsapp.displayPhoneNumber || 'Connecté'}
                          </span>
                          <p className="text-[10px] text-slate-500">{b.whatsapp.provider}</p>
                        </div>
                      ) : (
                        <span className="text-slate-500">Non configuré</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4">
                      {b.subscription ? (
                        <div>
                          <span className="rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 font-semibold text-indigo-300">
                            {b.subscription.planCode}
                          </span>
                          <p className="text-[10px] text-slate-400 mt-1 capitalize">
                            {b.subscription.status === 'TRIALING'
                              ? 'Essai'
                              : b.subscription.status.toLowerCase()}
                          </p>
                        </div>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 text-slate-300">
                      <div className="space-y-0.5 text-[11px]">
                        <p>{b.stats.messages} messages</p>
                        <p className="text-slate-500">{b.stats.conversations} conv · {b.stats.customers} clients</p>
                      </div>
                    </td>

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                          b.status === 'ACTIVE'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}
                      >
                        {b.status === 'ACTIVE' ? 'ACTIF' : 'SUSPENDU'}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/admin/businesses/${b.id}`}
                          className="rounded-lg bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-700 hover:text-white transition"
                        >
                          Voir
                        </Link>

                        <button
                          onClick={() => {
                            setModalBusiness(b);
                            setNewPlanCode((b.subscription?.planCode as any) || 'STARTER');
                            setNewSubStatus((b.subscription?.status as any) || 'ACTIVE');
                          }}
                          className="rounded-lg border border-slate-700 bg-slate-800/40 px-2.5 py-1 text-[11px] font-medium text-indigo-300 hover:bg-slate-800 transition"
                        >
                          Plan
                        </button>

                        <button
                          disabled={updatingId === b.id}
                          onClick={() => handleToggleStatus(b)}
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
                            b.status === 'ACTIVE'
                              ? 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20'
                              : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20'
                          }`}
                        >
                          {updatingId === b.id ? '…' : b.status === 'ACTIVE' ? 'Suspendre' : 'Activer'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination footer */}
        {data && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-800 px-4 py-3 text-xs text-slate-400">
            <div>
              Affichage de la page <span className="font-semibold text-white">{data.pagination.page}</span> sur{' '}
              <span className="font-semibold text-white">{data.pagination.totalPages}</span> ({data.pagination.total} entreprises)
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={data.pagination.page <= 1}
                onClick={() => fetchBusinesses(data.pagination.page - 1)}
                className="rounded-lg border border-slate-700 px-3 py-1 font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-40"
              >
                Précédent
              </button>
              <button
                disabled={data.pagination.page >= data.pagination.totalPages}
                onClick={() => fetchBusinesses(data.pagination.page + 1)}
                className="rounded-lg border border-slate-700 px-3 py-1 font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-40"
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Subscription Edit Modal */}
      {modalBusiness && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white">
              Modifier l'abonnement : {modalBusiness.name}
            </h3>
            <p className="mt-1 text-xs text-slate-400">
              Ajustez le niveau de formule et l'état de la souscription pour cette entreprise.
            </p>

            {actionError && (
              <p className="mt-3 rounded-lg bg-red-500/10 border border-red-500/20 p-2 text-xs text-red-400">
                {actionError}
              </p>
            )}

            <form onSubmit={handleSaveSubscription} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-300 mb-1">Formule / Plan</label>
                <select
                  value={newPlanCode}
                  onChange={(e) => setNewPlanCode(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white"
                >
                  <option value="STARTER">Starter</option>
                  <option value="BUSINESS">Business</option>
                  <option value="PRO">Pro</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-300 mb-1">Statut d'abonnement</label>
                <select
                  value={newSubStatus}
                  onChange={(e) => setNewSubStatus(e.target.value as any)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white"
                >
                  <option value="ACTIVE">Actif (Payant)</option>
                  <option value="TRIALING">En période d'essai (Trialing)</option>
                </select>
              </div>

              {newSubStatus === 'TRIALING' && (
                <div>
                  <label className="block font-medium text-slate-300 mb-1">
                    Prolonger l'essai de (jours)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={extendDays}
                    onChange={(e) => setExtendDays(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 p-2.5 text-white"
                  />
                </div>
              )}

              <div className="mt-6 flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalBusiness(null)}
                  className="rounded-xl px-4 py-2 text-slate-400 hover:text-white"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-500 transition"
                >
                  Sauvegarder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
