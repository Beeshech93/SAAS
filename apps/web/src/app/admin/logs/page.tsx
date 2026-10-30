'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui';

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface AuditLogItem {
  id: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string | null;
  description: string;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  actor: { id: string; name: string; email: string };
}

interface AuditLogsResponse {
  items: AuditLogItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/* ─── Action metadata helpers ────────────────────────────────────────────── */

const ACTION_META: Record<string, { emoji: string; label: string; color: string }> = {
  'business.status_updated': { emoji: '🏢', label: 'Statut entreprise', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  'subscription.updated':    { emoji: '💳', label: 'Abonnement modifié', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' },
  'user.superadmin_granted': { emoji: '👑', label: 'Super Admin accordé', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  'user.superadmin_revoked': { emoji: '🚫', label: 'Super Admin révoqué', color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
};

function getActionMeta(action: string) {
  return ACTION_META[action] ?? { emoji: '📋', label: action, color: 'text-slate-400 bg-slate-800 border-slate-700' };
}

const TARGET_ICONS: Record<string, string> = {
  Business: '🏢',
  Subscription: '💳',
  User: '👤',
};

const ALL_ACTIONS = Object.keys(ACTION_META);

/* ─── Page Component ─────────────────────────────────────────────────────── */

export default function AdminAuditLogsPage() {
  const [data, setData] = useState<AuditLogsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = useCallback(
    async (targetPage = page) => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        params.set('page', String(targetPage));
        params.set('limit', '25');
        if (search.trim()) params.set('search', search.trim());
        if (actionFilter) params.set('action', actionFilter);

        const res = await api<AuditLogsResponse>(`/api/admin/audit-logs?${params.toString()}`);
        setData(res);
        setPage(targetPage);
      } catch (err: any) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    },
    [search, actionFilter, page],
  );

  useEffect(() => {
    fetchLogs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchLogs(1);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Journal d'Audit
            </h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/10 px-2.5 py-0.5 text-xs font-medium text-violet-400 border border-violet-500/20">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
              Temps Réel
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            Traçabilité complète de toutes les actions Super Admin sur la plateforme.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchLogs(page)}
            className="flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-850 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition shadow-sm"
          >
            <span>🔄</span>
            <span>Actualiser</span>
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:flex-row sm:items-center sm:justify-between backdrop-blur-md">
        <form onSubmit={handleSearchSubmit} className="flex flex-1 items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher dans la description, action…"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  fetchLogs(1);
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
          <span className="text-xs font-medium text-slate-400">Type d'action :</span>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-white focus:border-brand-500 focus:outline-none"
          >
            <option value="">Toutes les actions</option>
            {ALL_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {getActionMeta(a).label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Counters */}
      {data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3.5 text-center">
            <p className="text-[11px] text-slate-400 uppercase font-semibold tracking-wider">Total Entrées</p>
            <p className="mt-1 text-lg font-bold text-white">{data.pagination.total}</p>
          </div>
          {ALL_ACTIONS.slice(0, 3).map((action) => {
            const meta = getActionMeta(action);
            return (
              <div key={action} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3.5 text-center">
                <p className="text-[11px] text-slate-400 uppercase font-semibold tracking-wider">{meta.label}</p>
                <p className={`mt-1 text-lg font-bold ${meta.color.split(' ')[0]}`}>
                  {data.items.filter((i) => i.action === action).length}
                  <span className="text-[10px] text-slate-500 font-normal ml-1">(cette page)</span>
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Audit Log Timeline */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 shadow-lg backdrop-blur-md overflow-hidden">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Spinner label="Chargement du journal d'audit…" />
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="p-16 text-center text-slate-400">
            <p className="text-4xl mb-3">📋</p>
            <p className="font-semibold text-white text-lg">Aucun événement enregistré</p>
            <p className="text-xs mt-2 text-slate-500">
              Les actions Super Admin apparaîtront ici dès qu'elles seront effectuées.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {data.items.map((log) => {
              const meta = getActionMeta(log.action);
              const targetIcon = TARGET_ICONS[log.targetType] ?? '📦';
              const isExpanded = expandedId === log.id;
              const createdAt = new Date(log.createdAt);

              return (
                <div
                  key={log.id}
                  className="group hover:bg-slate-800/20 transition-colors"
                >
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    className="w-full text-left px-5 py-4 flex items-start gap-4"
                  >
                    {/* Action Icon */}
                    <div className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border text-lg ${meta.color}`}>
                      {meta.emoji}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${meta.color}`}>
                          {meta.label}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
                          {targetIcon} {log.targetType}
                        </span>
                      </div>

                      <p className="mt-1.5 text-sm text-slate-200 leading-snug">
                        {log.description}
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
                        <span className="flex items-center gap-1">
                          <span className="text-slate-400">👤</span>
                          <span className="font-medium text-slate-300">{log.actor.name}</span>
                          <span>({log.actor.email})</span>
                        </span>
                        <span>·</span>
                        <span>
                          {createdAt.toLocaleDateString('fr-FR', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}{' '}
                          à {createdAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                        {log.ipAddress && (
                          <>
                            <span>·</span>
                            <span className="font-mono">{log.ipAddress}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Expand indicator */}
                    <div className="flex-shrink-0 mt-1 text-slate-500 group-hover:text-slate-300 transition">
                      <span className={`inline-block transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                        ▾
                      </span>
                    </div>
                  </button>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="px-5 pb-5 pl-[4.5rem] space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
                      {/* Metadata JSON */}
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                            Métadonnées de l'action
                          </p>
                          <div className="space-y-1.5">
                            {Object.entries(log.metadata).map(([key, value]) => (
                              <div key={key} className="flex items-start gap-3 text-xs">
                                <span className="font-mono text-slate-500 min-w-[140px]">{key}</span>
                                <span className="text-slate-300 font-medium break-all">
                                  {value === null ? (
                                    <span className="text-slate-600 italic">null</span>
                                  ) : typeof value === 'boolean' ? (
                                    <span className={value ? 'text-emerald-400' : 'text-rose-400'}>
                                      {String(value)}
                                    </span>
                                  ) : (
                                    String(value)
                                  )}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Technical details */}
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 text-[11px]">
                        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-2.5">
                          <span className="text-slate-500">Log ID :</span>
                          <p className="font-mono text-slate-400 truncate mt-0.5">{log.id}</p>
                        </div>
                        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-2.5">
                          <span className="text-slate-500">Target ID :</span>
                          <p className="font-mono text-slate-400 truncate mt-0.5">{log.targetId || '—'}</p>
                        </div>
                        <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-2.5">
                          <span className="text-slate-500">User-Agent :</span>
                          <p className="font-mono text-slate-400 truncate mt-0.5">{log.userAgent || '—'}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {data && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-800 px-5 py-3 text-xs text-slate-400">
            <div>
              Page <span className="font-semibold text-white">{data.pagination.page}</span> sur{' '}
              <span className="font-semibold text-white">{data.pagination.totalPages}</span>{' '}
              ({data.pagination.total} entrées)
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={data.pagination.page <= 1}
                onClick={() => fetchLogs(data.pagination.page - 1)}
                className="rounded-lg border border-slate-700 px-3 py-1 font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition"
              >
                ← Précédent
              </button>
              <button
                disabled={data.pagination.page >= data.pagination.totalPages}
                onClick={() => fetchLogs(data.pagination.page + 1)}
                className="rounded-lg border border-slate-700 px-3 py-1 font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition"
              >
                Suivant →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
