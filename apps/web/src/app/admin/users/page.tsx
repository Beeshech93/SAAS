'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Spinner } from '@/components/ui';

interface UserItem {
  id: string;
  name: string;
  email: string;
  isSuperAdmin: boolean;
  createdAt: string;
  memberships: Array<{
    role: string;
    business: {
      id: string;
      name: string;
      status: string;
    };
  }>;
}

interface UsersResponse {
  items: UserItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export default function AdminUsersPage() {
  const { me } = useAuth();
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [superAdminFilter, setSuperAdminFilter] = useState<'ALL' | 'TRUE' | 'FALSE'>('ALL');
  const [page, setPage] = useState(1);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchUsers = async (targetPage = page) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(targetPage));
      params.set('limit', '20');
      if (search.trim()) params.set('search', search.trim());
      if (superAdminFilter === 'TRUE') params.set('isSuperAdmin', 'true');
      if (superAdminFilter === 'FALSE') params.set('isSuperAdmin', 'false');

      const res = await api<UsersResponse>(`/api/admin/users?${params.toString()}`);
      setData(res);
      setPage(targetPage);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers(1);
  }, [superAdminFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchUsers(1);
  };

  const handleToggleSuperAdmin = async (targetUser: UserItem) => {
    const nextState = !targetUser.isSuperAdmin;
    if (targetUser.id === me?.user.id && !nextState) {
      alert('Vous ne pouvez pas révoquer vos propres privilèges Super Admin.');
      return;
    }

    const confirmMsg = nextState
      ? `Accorder les droits SUPER ADMIN à "${targetUser.name}" (${targetUser.email}) ? Cet utilisateur aura un accès complet à toute la plateforme.`
      : `Révoquer les droits Super Admin de "${targetUser.name}" ?`;

    if (!window.confirm(confirmMsg)) return;

    try {
      setTogglingId(targetUser.id);
      await api(`/api/admin/users/${targetUser.id}/superadmin`, {
        method: 'PATCH',
        body: JSON.stringify({ isSuperAdmin: nextState }),
      });
      fetchUsers(page);
    } catch (err: any) {
      alert(err?.message || 'Erreur lors de la mise à jour des privilèges');
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          Utilisateurs de la Plateforme
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Gestion des comptes utilisateurs globaux et attribution des privilèges Super Admin.
        </p>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:flex-row sm:items-center sm:justify-between backdrop-blur-md">
        <form onSubmit={handleSearchSubmit} className="flex flex-1 items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom ou email…"
              className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  fetchUsers(1);
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
          <span className="text-xs font-medium text-slate-400">Rôle Global :</span>
          <select
            value={superAdminFilter}
            onChange={(e) => setSuperAdminFilter(e.target.value as any)}
            className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-white focus:border-brand-500 focus:outline-none"
          >
            <option value="ALL">Tous les utilisateurs</option>
            <option value="TRUE">Super Admins uniquement</option>
            <option value="FALSE">Utilisateurs standards</option>
          </select>
        </div>
      </div>

      {/* Data Table */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 shadow-lg backdrop-blur-md overflow-hidden">
        {loading ? (
          <div className="flex h-64 items-center justify-center">
            <Spinner label="Chargement des utilisateurs…" />
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <p className="text-3xl mb-2">👤</p>
            <p className="font-semibold text-white">Aucun utilisateur trouvé</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="border-b border-slate-800 bg-slate-950/40 text-[11px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="py-3 px-4">Utilisateur</th>
                  <th className="py-3 px-4">Entreprise(s) associée(s)</th>
                  <th className="py-3 px-4">Privilège Super Admin</th>
                  <th className="py-3 px-4">Date création</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {data.items.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3 px-4 font-semibold text-white">
                      <div>
                        <p>{u.name}</p>
                        <p className="text-[11px] font-normal text-slate-400">{u.email}</p>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      {u.memberships.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {u.memberships.map((m, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300"
                            >
                              <span>{m.business.name}</span>
                              <span className="font-mono text-[9px] text-brand-400 font-semibold">
                                ({m.role})
                              </span>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-slate-500">Aucune entreprise</span>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      {u.isSuperAdmin ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 text-[10px] font-bold text-amber-300">
                          👑 Super Admin
                        </span>
                      ) : (
                        <span className="text-slate-500 text-[11px]">Standard</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-slate-400">
                      {new Date(u.createdAt).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <button
                        disabled={togglingId === u.id || (u.id === me?.user.id && u.isSuperAdmin)}
                        onClick={() => handleToggleSuperAdmin(u)}
                        className={`rounded-lg px-3 py-1 text-[11px] font-semibold transition ${
                          u.isSuperAdmin
                            ? 'border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 disabled:opacity-40'
                            : 'border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
                        }`}
                      >
                        {togglingId === u.id
                          ? '…'
                          : u.isSuperAdmin
                          ? 'Révoquer Admin'
                          : 'Nommer Super Admin'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {data && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-800 px-4 py-3 text-xs text-slate-400">
            <div>
              Page <span className="font-semibold text-white">{data.pagination.page}</span> sur{' '}
              <span className="font-semibold text-white">{data.pagination.totalPages}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={data.pagination.page <= 1}
                onClick={() => fetchUsers(data.pagination.page - 1)}
                className="rounded-lg border border-slate-700 px-3 py-1 font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-40"
              >
                Précédent
              </button>
              <button
                disabled={data.pagination.page >= data.pagination.totalPages}
                onClick={() => fetchUsers(data.pagination.page + 1)}
                className="rounded-lg border border-slate-700 px-3 py-1 font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-40"
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
