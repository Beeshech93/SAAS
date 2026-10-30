'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui';

interface BusinessDetail {
  id: string;
  name: string;
  type: string;
  status: 'ACTIVE' | 'SUSPENDED';
  phone: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
  timezone: string;
  language: string;
  aiEnabled: boolean;
  aiRules: string | null;
  createdAt: string;
  owner: { id: string; name: string; email: string } | null;
  members: Array<{
    id: string;
    role: 'OWNER' | 'ADMIN' | 'AGENT';
    createdAt: string;
    user: { id: string; name: string; email: string; isSuperAdmin: boolean; createdAt: string };
  }>;
  subscription: {
    status: string;
    trialEndsAt: string | null;
    currentPeriodEnd: string | null;
    plan: {
      code: string;
      name: string;
      messageLimit: number;
      userLimit: number;
      priceCents: number;
    };
  } | null;
  whatsapp: {
    id: string;
    provider: string;
    status: string;
    displayPhoneNumber: string | null;
    phoneNumberId: string;
    baseUrl: string | null;
    instanceName: string | null;
    createdAt: string;
    updatedAt: string;
  } | null;
  usage: Array<{ period: string; messages: number }>;
  _count: {
    customers: number;
    conversations: number;
    messages: number;
    faqs: number;
    services: number;
    autoReplyRules: number;
    campaigns: number;
  };
}

export default function AdminBusinessDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [biz, setBiz] = useState<BusinessDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);

  const fetchDetail = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api<BusinessDetail>(`/api/admin/businesses/${id}`);
      setBiz(res);
    } catch (err: any) {
      setError(err?.message || "Impossible de charger les détails de l'entreprise");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchDetail();
  }, [id]);

  const toggleStatus = async () => {
    if (!biz) return;
    const nextStatus = biz.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    const confirmMsg =
      nextStatus === 'SUSPENDED'
        ? `Voulez-vous suspendre "${biz.name}" ? Les membres ne pourront plus accéder à l'application.`
        : `Réactiver "${biz.name}" ?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      setStatusUpdating(true);
      await api(`/api/admin/businesses/${biz.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      fetchDetail();
    } catch (err: any) {
      alert(err?.message || 'Erreur lors de la mise à jour du statut');
    } finally {
      setStatusUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spinner label="Chargement des données entreprise…" />
      </div>
    );
  }

  if (error || !biz) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-950/20 p-8 text-center text-red-400">
        <p className="font-semibold text-lg">{error || 'Entreprise introuvable'}</p>
        <Link
          href="/admin/businesses"
          className="mt-4 inline-block rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700"
        >
          ← Retour à la liste
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16">
      {/* Breadcrumb & Navigation */}
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Link href="/admin/businesses" className="hover:text-slate-200 transition">
          Entreprises
        </Link>
        <span>/</span>
        <span className="text-white font-medium">{biz.name}</span>
      </div>

      {/* Header Banner */}
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-6 sm:flex-row sm:items-center sm:justify-between shadow-xl backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-600 text-2xl shadow-lg">
            🏢
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-2xl font-bold text-white">{biz.name}</h1>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  biz.status === 'ACTIVE'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                }`}
              >
                {biz.status}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Type : <span className="font-mono text-slate-300">{biz.type}</span> · ID :{' '}
              <span className="font-mono text-[11px] text-slate-500">{biz.id}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            disabled={statusUpdating}
            onClick={toggleStatus}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition shadow-sm ${
              biz.status === 'ACTIVE'
                ? 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30'
                : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/30'
            }`}
          >
            {statusUpdating ? 'Mise à jour…' : biz.status === 'ACTIVE' ? 'Suspendre' : 'Réactiver'}
          </button>
        </div>
      </div>

      {/* Stats Summary Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3.5 text-center">
          <p className="text-[11px] text-slate-400">Messages</p>
          <p className="mt-1 text-lg font-bold text-white">{biz._count.messages}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3.5 text-center">
          <p className="text-[11px] text-slate-400">Conversations</p>
          <p className="mt-1 text-lg font-bold text-white">{biz._count.conversations}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3.5 text-center">
          <p className="text-[11px] text-slate-400">Clients CRM</p>
          <p className="mt-1 text-lg font-bold text-white">{biz._count.customers}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3.5 text-center">
          <p className="text-[11px] text-slate-400">Membres</p>
          <p className="mt-1 text-lg font-bold text-white">{biz.members.length}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3.5 text-center">
          <p className="text-[11px] text-slate-400">FAQs</p>
          <p className="mt-1 text-lg font-bold text-white">{biz._count.faqs}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3.5 text-center">
          <p className="text-[11px] text-slate-400">Services/Menu</p>
          <p className="mt-1 text-lg font-bold text-white">{biz._count.services}</p>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3.5 text-center">
          <p className="text-[11px] text-slate-400">Campagnes</p>
          <p className="mt-1 text-lg font-bold text-white">{biz._count.campaigns}</p>
        </div>
      </div>

      {/* Main 2-column details */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* WhatsApp & Infrastructure */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg backdrop-blur-md">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span>📱</span>
            <span>Intégration WhatsApp</span>
          </h2>

          {biz.whatsapp ? (
            <div className="mt-4 space-y-3 text-xs">
              <div className="flex justify-between rounded-xl bg-slate-950/60 p-3 border border-slate-800/40">
                <span className="text-slate-400">Fournisseur :</span>
                <span className="font-semibold text-white">{biz.whatsapp.provider}</span>
              </div>
              <div className="flex justify-between rounded-xl bg-slate-950/60 p-3 border border-slate-800/40">
                <span className="text-slate-400">Statut du canal :</span>
                <span className="font-semibold text-emerald-400">{biz.whatsapp.status}</span>
              </div>
              <div className="flex justify-between rounded-xl bg-slate-950/60 p-3 border border-slate-800/40">
                <span className="text-slate-400">Numéro affiché :</span>
                <span className="font-semibold text-white">{biz.whatsapp.displayPhoneNumber || '—'}</span>
              </div>
              <div className="flex justify-between rounded-xl bg-slate-950/60 p-3 border border-slate-800/40">
                <span className="text-slate-400">ID / Instance :</span>
                <span className="font-mono text-slate-300">{biz.whatsapp.phoneNumberId}</span>
              </div>
              {biz.whatsapp.baseUrl && (
                <div className="flex justify-between rounded-xl bg-slate-950/60 p-3 border border-slate-800/40">
                  <span className="text-slate-400">URL Instance :</span>
                  <span className="font-mono text-slate-300">{biz.whatsapp.baseUrl}</span>
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-slate-800 p-6 text-center text-slate-500 text-xs">
              Cette entreprise n'a pas encore connecté de numéro WhatsApp.
            </div>
          )}
        </div>

        {/* Subscription & Plan */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg backdrop-blur-md">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span>💳</span>
            <span>Formule & Souscription</span>
          </h2>

          {biz.subscription ? (
            <div className="mt-4 space-y-3 text-xs">
              <div className="flex justify-between rounded-xl bg-slate-950/60 p-3 border border-slate-800/40">
                <span className="text-slate-400">Formule actuelle :</span>
                <span className="font-bold text-indigo-300">{biz.subscription.plan.name} ({biz.subscription.plan.code})</span>
              </div>
              <div className="flex justify-between rounded-xl bg-slate-950/60 p-3 border border-slate-800/40">
                <span className="text-slate-400">Statut :</span>
                <span className="font-semibold text-white capitalize">{biz.subscription.status}</span>
              </div>
              <div className="flex justify-between rounded-xl bg-slate-950/60 p-3 border border-slate-800/40">
                <span className="text-slate-400">Quota messages / mois :</span>
                <span className="font-semibold text-white">{biz.subscription.plan.messageLimit.toLocaleString()} messages</span>
              </div>
              <div className="flex justify-between rounded-xl bg-slate-950/60 p-3 border border-slate-800/40">
                <span className="text-slate-400">Fin période d'essai :</span>
                <span className="text-slate-300">
                  {biz.subscription.trialEndsAt
                    ? new Date(biz.subscription.trialEndsAt).toLocaleDateString('fr-FR')
                    : 'N/A'}
                </span>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-slate-800 p-6 text-center text-slate-500 text-xs">
              Aucune souscription enregistrée.
            </div>
          )}
        </div>
      </div>

      {/* Team Members */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg backdrop-blur-md">
        <h2 className="text-base font-bold text-white flex items-center gap-2 mb-4">
          <span>👥</span>
          <span>Équipe & Utilisateurs Rattachés ({biz.members.length})</span>
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="border-b border-slate-800 bg-slate-950/40 text-[11px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="py-2.5 px-3">Nom</th>
                <th className="py-2.5 px-3">Email</th>
                <th className="py-2.5 px-3">Rôle Entreprise</th>
                <th className="py-2.5 px-3">Super Admin</th>
                <th className="py-2.5 px-3">Date d'ajout</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {biz.members.map((m) => (
                <tr key={m.id} className="hover:bg-slate-800/30">
                  <td className="py-3 px-3 font-semibold text-white">{m.user.name}</td>
                  <td className="py-3 px-3 text-slate-400">{m.user.email}</td>
                  <td className="py-3 px-3">
                    <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] text-slate-300">
                      {m.role}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    {m.user.isSuperAdmin ? (
                      <span className="text-amber-400 font-semibold">👑 Oui</span>
                    ) : (
                      <span className="text-slate-500">Non</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-slate-400">
                    {new Date(m.createdAt).toLocaleDateString('fr-FR')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly Usage History */}
      {biz.usage.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg backdrop-blur-md">
          <h2 className="text-base font-bold text-white flex items-center gap-2 mb-4">
            <span>📈</span>
            <span>Historique de Consommation Mensuelle</span>
          </h2>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {biz.usage.map((u) => (
              <div key={u.period} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-center">
                <p className="text-xs font-mono text-slate-400">{u.period}</p>
                <p className="mt-1 text-xl font-bold text-white">{u.messages.toLocaleString()}</p>
                <p className="text-[10px] text-slate-500">messages</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
