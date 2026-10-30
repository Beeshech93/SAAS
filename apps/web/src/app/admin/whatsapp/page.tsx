'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui';

interface WhatsAppOverview {
  kpis: {
    totalBusinesses: number;
    totalMessages: number;
    currentMonthMessages: number;
  };
  whatsapp: {
    cloudApi: number;
    evolution: number;
    active: number;
  };
  recentBusinesses: Array<{
    id: string;
    name: string;
    status: string;
    whatsapp: {
      provider: string;
      status: string;
      displayPhoneNumber: string | null;
    } | null;
  }>;
}

export default function AdminWhatsAppPage() {
  const [data, setData] = useState<WhatsAppOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await api<WhatsAppOverview>('/api/admin/overview');
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
        <Spinner label="Vérification des canaux WhatsApp…" />
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { whatsapp } = data;

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Systèmes WhatsApp & Canaux
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Supervision des passerelles Meta Cloud API et des instances QR Code Evolution API.
        </p>
      </div>

      {/* Gateway Cards */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Meta Cloud API */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg backdrop-blur-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-xl text-blue-400">
                🌐
              </div>
              <div>
                <h2 className="font-bold text-white">Meta WhatsApp Cloud API</h2>
                <p className="text-xs text-slate-400">API Officielle Cloud (Graph API v21.0)</p>
              </div>
            </div>
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
              Opérationnel
            </span>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-slate-950/60 p-4 border border-slate-800/40 text-center">
              <p className="text-xs text-slate-400">Numéros Actifs</p>
              <p className="mt-1 text-2xl font-bold text-white">{whatsapp.cloudApi}</p>
            </div>
            <div className="rounded-xl bg-slate-950/60 p-4 border border-slate-800/40 text-center">
              <p className="text-xs text-slate-400">Endpoint Webhook</p>
              <p className="mt-1 font-mono text-xs text-emerald-400">/api/webhooks/whatsapp</p>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-slate-800/80 bg-slate-950/40 p-4 text-xs text-slate-400 space-y-2">
            <p className="font-semibold text-slate-200">Spécifications Meta :</p>
            <ul className="list-disc pl-4 space-y-1 text-slate-400">
              <li>Vérification HMAC SHA-256 via en-tête <code className="text-slate-300">X-Hub-Signature-256</code></li>
              <li>Tokens permanents chiffrés en base de données avec AES-256-GCM</li>
              <li>Gestion automatique des retries et déduplication par <code className="text-slate-300">wamid</code></li>
            </ul>
          </div>
        </div>

        {/* Evolution API */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg backdrop-blur-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-xl text-purple-400">
                📲
              </div>
              <div>
                <h2 className="font-bold text-white">Evolution API (QR Code)</h2>
                <p className="text-xs text-slate-400">Connecteur WhatsApp Web autonome</p>
              </div>
            </div>
            <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
              Opérationnel
            </span>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-slate-950/60 p-4 border border-slate-800/40 text-center">
              <p className="text-xs text-slate-400">Instances Actives</p>
              <p className="mt-1 text-2xl font-bold text-white">{whatsapp.evolution}</p>
            </div>
            <div className="rounded-xl bg-slate-950/60 p-4 border border-slate-800/40 text-center">
              <p className="text-xs text-slate-400">Endpoint Webhook</p>
              <p className="mt-1 font-mono text-xs text-emerald-400">/api/webhooks/evolution</p>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-slate-800/80 bg-slate-950/40 p-4 text-xs text-slate-400 space-y-2">
            <p className="font-semibold text-slate-200">Fonctionnalités Evolution :</p>
            <ul className="list-disc pl-4 space-y-1 text-slate-400">
              <li>Connexion directe par scan de QR Code sans compte Meta Developer</li>
              <li>Signature et secret de webhook pour sécuriser les réceptions</li>
              <li>Kit de déploiement Docker + Caddy HTTPS disponible dans <code className="text-slate-300">/deploy</code></li>
            </ul>
          </div>
        </div>
      </div>

      {/* Connected Channels List */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 shadow-lg backdrop-blur-md">
        <h2 className="text-base font-bold text-white mb-4">
          Canaux Récents Connectés
        </h2>
        <div className="space-y-3">
          {data.recentBusinesses
            .filter((b) => b.whatsapp)
            .map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-xs"
              >
                <div className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  <div>
                    <Link
                      href={`/admin/businesses/${b.id}`}
                      className="font-bold text-white hover:text-brand-400 transition"
                    >
                      {b.name}
                    </Link>
                    <p className="text-slate-500">
                      Numéro : {b.whatsapp?.displayPhoneNumber || 'Non renseigné'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300 font-mono">
                    {b.whatsapp?.provider}
                  </span>
                  <Link
                    href={`/admin/businesses/${b.id}`}
                    className="font-semibold text-brand-400 hover:text-brand-300"
                  >
                    Gérer →
                  </Link>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
