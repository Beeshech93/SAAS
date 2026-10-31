'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/use-resource';
import { Button, ErrorAlert, Field, Spinner } from '@/components/ui';
import { t } from '@/i18n';

interface LeadConfig {
  hasGooglePlacesApiKey: boolean;
  source: 'database' | 'environment' | 'none';
}

interface DiscoveredLead {
  externalId: string;
  name: string;
  category?: string;
  email: string | null;
  otherEmails: string[];
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  country?: string | null;
  rating?: number | null;
  reviewsCount?: number | null;
  source: 'google_places' | 'osm' | 'web';
  socialLinks?: {
    instagram?: string;
    facebook?: string;
    linkedin?: string;
    twitter?: string;
    whatsapp?: string;
  };
  hasEmail: boolean;
}

interface SearchStats {
  total: number;
  withEmail: number;
  withPhone: number;
  withWebsite: number;
}

interface SavedLead {
  id: string;
  name: string;
  category?: string | null;
  email?: string | null;
  otherEmails: string[];
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  status: 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'UNQUALIFIED';
  rating?: number | null;
  reviewsCount?: number | null;
  socialLinks?: any;
  createdAt: string;
}

type TabType = 'search' | 'saved' | 'config';

export default function AdminLeadsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('search');
  const [config, setConfig] = useState<LeadConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);

  // Search state
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [provider, setProvider] = useState<'auto' | 'google_places' | 'osm'>('auto');
  const [maxResults, setMaxResults] = useState(20);
  const [extractEmails, setExtractEmails] = useState(true);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<DiscoveredLead[]>([]);
  const [searchStats, setSearchStats] = useState<SearchStats | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Selection & bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterOnlyWithEmail, setFilterOnlyWithEmail] = useState(false);
  const [savingLeads, setSavingLeads] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [reScanningId, setReScanningId] = useState<string | null>(null);

  // Saved leads state
  const [savedLeads, setSavedLeads] = useState<SavedLead[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [savedPage, setSavedPage] = useState(1);
  const [savedTotalPages, setSavedTotalPages] = useState(1);
  const [savedFilterStatus, setSavedFilterStatus] = useState<string>('');
  const [savedSearchQuery, setSavedSearchQuery] = useState('');

  // Config form state
  const [configKeyInput, setConfigKeyInput] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSuccess, setConfigSuccess] = useState<string | null>(null);

  // Load config on mount
  const loadConfig = useCallback(async () => {
    try {
      setLoadingConfig(true);
      const res = await api<LeadConfig>('/api/admin/leads/config');
      setConfig(res);
    } catch {
      // Ignore
    } finally {
      setLoadingConfig(false);
    }
  }, []);

  // Load saved leads
  const loadSavedLeads = useCallback(async () => {
    try {
      setLoadingSaved(true);
      const params = new URLSearchParams();
      params.set('page', String(savedPage));
      params.set('limit', '25');
      if (savedFilterStatus) params.set('status', savedFilterStatus);
      if (savedSearchQuery.trim()) params.set('search', savedSearchQuery.trim());

      const res = await api<{
        leads: SavedLead[];
        pagination: { page: number; limit: number; total: number; totalPages: number };
      }>(`/api/admin/leads?${params.toString()}`);

      setSavedLeads(res.leads);
      setSavedTotalPages(res.pagination.totalPages || 1);
    } catch (err) {
      setSearchError(errorMessage(err));
    } finally {
      setLoadingSaved(false);
    }
  }, [savedPage, savedFilterStatus, savedSearchQuery]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (activeTab === 'saved') {
      void loadSavedLeads();
    }
  }, [activeTab, loadSavedLeads]);

  // Execute Search
  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!query.trim() || !location.trim()) return;

    setSearching(true);
    setSearchError(null);
    setSuccessMessage(null);
    setSelectedIds(new Set());

    try {
      const res = await api<{ leads: DiscoveredLead[]; stats: SearchStats }>('/api/admin/leads/search', {
        method: 'POST',
        body: {
          query: query.trim(),
          location: location.trim(),
          provider,
          maxResults,
          extractEmails,
        },
      });

      setSearchResults(res.leads);
      setSearchStats(res.stats);

      // Pre-select all leads that have an email by default
      const withEmails = new Set(res.leads.filter((l) => l.hasEmail).map((l) => l.externalId));
      setSelectedIds(withEmails);
    } catch (err) {
      setSearchError(errorMessage(err));
    } finally {
      setSearching(false);
    }
  }

  // Toggle selection
  function toggleSelectLead(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(filteredList: DiscoveredLead[]) {
    if (selectedIds.size === filteredList.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredList.map((l) => l.externalId)));
    }
  }

  // Save selected leads to database
  async function handleSaveSelected() {
    const toSave = searchResults.filter((l) => selectedIds.has(l.externalId));
    if (toSave.length === 0) return;

    setSavingLeads(true);
    setSearchError(null);
    try {
      const res = await api<{ savedCount: number; skippedDuplicates: number }>('/api/admin/leads/save', {
        method: 'POST',
        body: { leads: toSave },
      });

      setSuccessMessage(
        `${t('adminLeads.savedSuccess')} (${res.savedCount} nuevos, ${res.skippedDuplicates} ya existían).`,
      );
    } catch (err) {
      setSearchError(errorMessage(err));
    } finally {
      setSavingLeads(false);
    }
  }

  // Export search results or saved to CSV
  function handleExportCsv(leadsToExport: Array<DiscoveredLead | SavedLead>) {
    if (leadsToExport.length === 0) return;

    const headers = [
      'Nombre',
      'Categoria',
      'Email Principal',
      'Otros Emails',
      'Telefono',
      'Sitio Web',
      'Direccion',
      'Ciudad',
      'Instagram',
      'Facebook',
      'LinkedIn',
      'WhatsApp',
    ];

    const rows = leadsToExport.map((l) => {
      const s = l.socialLinks || {};
      return [
        `"${(l.name || '').replace(/"/g, '""')}"`,
        `"${(l.category || '').replace(/"/g, '""')}"`,
        `"${(l.email || '').replace(/"/g, '""')}"`,
        `"${(l.otherEmails ? l.otherEmails.join('; ') : '').replace(/"/g, '""')}"`,
        `"${(l.phone || '').replace(/"/g, '""')}"`,
        `"${(l.website || '').replace(/"/g, '""')}"`,
        `"${(l.address || '').replace(/"/g, '""')}"`,
        `"${(l.city || '').replace(/"/g, '""')}"`,
        `"${(s.instagram || '').replace(/"/g, '""')}"`,
        `"${(s.facebook || '').replace(/"/g, '""')}"`,
        `"${(s.linkedin || '').replace(/"/g, '""')}"`,
        `"${(s.whatsapp || '').replace(/"/g, '""')}"`,
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `leads_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Re-scan a single website
  async function handleReScan(lead: DiscoveredLead) {
    if (!lead.website) return;
    setReScanningId(lead.externalId);
    try {
      const res = await api<{
        emails: string[];
        primaryEmail: string | null;
        phone: string | null;
        socialLinks: any;
      }>('/api/admin/leads/crawl-single', {
        method: 'POST',
        body: { url: lead.website },
      });

      setSearchResults((prev) =>
        prev.map((item) => {
          if (item.externalId !== lead.externalId) return item;
          const emails = Array.from(new Set([...(item.otherEmails || []), ...res.emails]));
          return {
            ...item,
            email: res.primaryEmail || item.email,
            otherEmails: emails.filter((e) => e !== (res.primaryEmail || item.email)),
            phone: res.phone || item.phone,
            socialLinks: { ...item.socialLinks, ...res.socialLinks },
            hasEmail: !!(res.primaryEmail || item.email),
          };
        }),
      );
    } catch {
      // Ignore
    } finally {
      setReScanningId(null);
    }
  }

  // Update status of a saved lead
  async function handleUpdateStatus(id: string, newStatus: SavedLead['status']) {
    try {
      await api(`/api/admin/leads/${id}/status`, {
        method: 'PATCH',
        body: { status: newStatus },
      });
      setSavedLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status: newStatus } : l)));
    } catch (err) {
      setSearchError(errorMessage(err));
    }
  }

  // Delete saved lead
  async function handleDeleteSavedLead(id: string) {
    if (!confirm('¿Eliminar este prospecto de la base de datos?')) return;
    try {
      await api(`/api/admin/leads/${id}`, { method: 'DELETE' });
      setSavedLeads((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      setSearchError(errorMessage(err));
    }
  }

  // Save Google Places API config
  async function handleSaveConfig(e: FormEvent) {
    e.preventDefault();
    setSavingConfig(true);
    setConfigSuccess(null);
    setSearchError(null);
    try {
      const res = await api<LeadConfig>('/api/admin/leads/config', {
        method: 'PUT',
        body: { apiKey: configKeyInput.trim() },
      });
      setConfig(res);
      setConfigSuccess(t('adminLeads.configSaved'));
      setConfigKeyInput('');
    } catch (err) {
      setSearchError(errorMessage(err));
    } finally {
      setSavingConfig(false);
    }
  }

  const displayedResults = filterOnlyWithEmail ? searchResults.filter((l) => l.hasEmail) : searchResults;

  return (
    <div className="space-y-8 pb-16">
      {/* Page Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-2xl sm:text-3xl">🎯</span>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {t('adminLeads.title')}
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-400 max-w-3xl">
            {t('adminLeads.subtitle')}
          </p>
        </div>

        {/* Engine Status Pill */}
        <div className="flex items-center gap-2">
          {config?.hasGooglePlacesApiKey ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Google Places API Activo
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              Modo Gratuito (OpenStreetMap)
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 space-x-1">
        <button
          onClick={() => setActiveTab('search')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
            activeTab === 'search'
              ? 'border-brand-500 text-white font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>🔍</span>
          <span>{t('adminLeads.tabSearch')}</span>
          {searchResults.length > 0 && (
            <span className="ml-1 rounded-full bg-brand-600/30 px-2 py-0.5 text-xs text-brand-300">
              {searchResults.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('saved')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
            activeTab === 'saved'
              ? 'border-brand-500 text-white font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>💾</span>
          <span>{t('adminLeads.tabSaved')}</span>
        </button>

        <button
          onClick={() => setActiveTab('config')}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition ${
            activeTab === 'config'
              ? 'border-brand-500 text-white font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>⚙️</span>
          <span>{t('adminLeads.tabConfig')}</span>
        </button>
      </div>

      {searchError && <ErrorAlert message={searchError} />}
      {successMessage && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300 flex items-center justify-between">
          <span>{successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-emerald-200">
            ✕
          </button>
        </div>
      )}

      {/* TAB 1: LIVE SEARCH */}
      {activeTab === 'search' && (
        <div className="space-y-6">
          {/* Search Form Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 backdrop-blur-xl shadow-xl">
            <form onSubmit={handleSearch} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
                {/* Query Input */}
                <div className="lg:col-span-4">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    {t('adminLeads.queryLabel')}
                  </label>
                  <input
                    type="text"
                    required
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('adminLeads.queryPlaceholder')}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>

                {/* Location Input */}
                <div className="lg:col-span-3">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    {t('adminLeads.locationLabel')}
                  </label>
                  <input
                    type="text"
                    required
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder={t('adminLeads.locationPlaceholder')}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>

                {/* Provider Selector */}
                <div className="lg:col-span-3">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    {t('adminLeads.providerLabel')}
                  </label>
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as any)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value="auto">{t('adminLeads.providerAuto')}</option>
                    <option value="google_places">{t('adminLeads.providerGoogle')}</option>
                    <option value="osm">{t('adminLeads.providerOsm')}</option>
                  </select>
                </div>

                {/* Max Results */}
                <div className="lg:col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                    {t('adminLeads.maxResultsLabel')}
                  </label>
                  <select
                    value={maxResults}
                    onChange={(e) => setMaxResults(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  >
                    <option value={10}>10 negocios</option>
                    <option value={20}>20 negocios</option>
                    <option value={30}>30 negocios</option>
                    <option value={50}>50 negocios</option>
                  </select>
                </div>
              </div>

              {/* Options & Action Row */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-2 border-t border-slate-800/80">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={extractEmails}
                    onChange={(e) => setExtractEmails(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-brand-600 focus:ring-brand-500"
                  />
                  <span className="text-xs text-slate-300 font-medium">
                    {t('adminLeads.extractEmailsLabel')}
                  </span>
                </label>

                <Button
                  type="submit"
                  disabled={searching}
                  className="bg-brand-600 hover:bg-brand-500 text-white font-semibold px-6 py-2.5 shadow-lg shadow-brand-600/20"
                >
                  {searching ? (
                    <span className="flex items-center gap-2">
                      <Spinner label="Buscando…" />
                      <span>{t('adminLeads.searching')}</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-2">
                      <span>🚀</span>
                      <span>{t('adminLeads.searchButton')}</span>
                    </span>
                  )}
                </Button>
              </div>
            </form>
          </div>

          {/* Stats Bar (if results) */}
          {searchStats && (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <p className="text-xs font-medium text-slate-400">{t('adminLeads.statsFound')}</p>
                <p className="mt-1 text-2xl font-bold text-white">{searchStats.total}</p>
              </div>
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <p className="text-xs font-medium text-emerald-400">{t('adminLeads.statsEmails')}</p>
                <p className="mt-1 text-2xl font-bold text-emerald-300">{searchStats.withEmail}</p>
              </div>
              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
                <p className="text-xs font-medium text-cyan-400">{t('adminLeads.statsPhones')}</p>
                <p className="mt-1 text-2xl font-bold text-cyan-300">{searchStats.withPhone}</p>
              </div>
              <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
                <p className="text-xs font-medium text-indigo-400">{t('adminLeads.statsWebsites')}</p>
                <p className="mt-1 text-2xl font-bold text-indigo-300">{searchStats.withWebsite}</p>
              </div>
            </div>
          )}

          {/* Results Action Bar */}
          {searchResults.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs font-medium text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={displayedResults.length > 0 && selectedIds.size === displayedResults.length}
                    onChange={() => toggleSelectAll(displayedResults)}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-brand-600 focus:ring-brand-500"
                  />
                  <span>
                    Seleccionar todos ({selectedIds.size}/{displayedResults.length})
                  </span>
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer border-l border-slate-800 pl-4">
                  <input
                    type="checkbox"
                    checked={filterOnlyWithEmail}
                    onChange={(e) => setFilterOnlyWithEmail(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-950 text-brand-600 focus:ring-brand-500"
                  />
                  <span>Solo con email encontrado</span>
                </label>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={handleSaveSelected}
                  disabled={selectedIds.size === 0 || savingLeads}
                  className="bg-brand-600 hover:bg-brand-500 text-white text-xs px-3.5 py-1.5 font-medium"
                >
                  {savingLeads ? 'Guardando…' : `Guardar seleccionados (${selectedIds.size})`}
                </Button>

                <button
                  onClick={() => handleExportCsv(displayedResults)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 transition"
                >
                  <span>📥</span>
                  <span>{t('adminLeads.exportCsv')}</span>
                </button>
              </div>
            </div>
          )}

          {/* Results Table */}
          {searchResults.length > 0 ? (
            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="border-b border-slate-800 bg-slate-950/60 text-[11px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="w-10 px-4 py-3"></th>
                    <th className="px-4 py-3">{t('adminLeads.colBusiness')}</th>
                    <th className="px-4 py-3">{t('adminLeads.colEmail')}</th>
                    <th className="px-4 py-3">{t('adminLeads.colPhone')}</th>
                    <th className="px-4 py-3">{t('adminLeads.colWebsite')}</th>
                    <th className="px-4 py-3">{t('adminLeads.colSocial')}</th>
                    <th className="px-4 py-3">{t('adminLeads.colAddress')}</th>
                    <th className="px-4 py-3 text-right">{t('adminLeads.colActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {displayedResults.map((lead) => {
                    const isSelected = selectedIds.has(lead.externalId);
                    return (
                      <tr
                        key={lead.externalId}
                        className={`transition hover:bg-slate-800/40 ${
                          isSelected ? 'bg-brand-500/5' : ''
                        }`}
                      >
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectLead(lead.externalId)}
                            className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-brand-600 focus:ring-brand-500 cursor-pointer"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-white text-sm leading-snug">
                            {lead.name}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            {lead.category && (
                              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                                {lead.category}
                              </span>
                            )}
                            {lead.rating && (
                              <span className="flex items-center gap-1 text-[11px] text-amber-400 font-medium">
                                ⭐ {lead.rating.toFixed(1)}
                                {lead.reviewsCount && (
                                  <span className="text-slate-500">({lead.reviewsCount})</span>
                                )}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {lead.email ? (
                            <div>
                              <a
                                href={`mailto:${lead.email}`}
                                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20"
                              >
                                <span>✉️</span>
                                <span>{lead.email}</span>
                              </a>
                              {lead.otherEmails.length > 0 && (
                                <p className="mt-0.5 text-[10px] text-slate-500">
                                  +{lead.otherEmails.length} más: {lead.otherEmails.slice(0, 2).join(', ')}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500 italic">Sin email detectado</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {lead.phone ? (
                            <a
                              href={`tel:${lead.phone}`}
                              className="text-xs font-medium text-slate-300 hover:text-white"
                            >
                              📞 {lead.phone}
                            </a>
                          ) : (
                            <span className="text-xs text-slate-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {lead.website ? (
                            <a
                              href={lead.website}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-brand-400 hover:underline max-w-[150px] truncate"
                            >
                              <span>🌐</span>
                              <span className="truncate">{lead.website.replace(/^https?:\/\//, '')}</span>
                            </a>
                          ) : (
                            <span className="text-xs text-slate-500">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {lead.socialLinks?.instagram && (
                              <a
                                href={lead.socialLinks.instagram}
                                target="_blank"
                                rel="noreferrer"
                                title="Instagram"
                                className="text-sm opacity-80 hover:opacity-100"
                              >
                                📸
                              </a>
                            )}
                            {lead.socialLinks?.facebook && (
                              <a
                                href={lead.socialLinks.facebook}
                                target="_blank"
                                rel="noreferrer"
                                title="Facebook"
                                className="text-sm opacity-80 hover:opacity-100"
                              >
                                📘
                              </a>
                            )}
                            {lead.socialLinks?.linkedin && (
                              <a
                                href={lead.socialLinks.linkedin}
                                target="_blank"
                                rel="noreferrer"
                                title="LinkedIn"
                                className="text-sm opacity-80 hover:opacity-100"
                              >
                                💼
                              </a>
                            )}
                            {lead.socialLinks?.whatsapp && (
                              <a
                                href={lead.socialLinks.whatsapp}
                                target="_blank"
                                rel="noreferrer"
                                title="WhatsApp"
                                className="text-sm opacity-80 hover:opacity-100"
                              >
                                💬
                              </a>
                            )}
                            {!lead.socialLinks?.instagram &&
                              !lead.socialLinks?.facebook &&
                              !lead.socialLinks?.linkedin &&
                              !lead.socialLinks?.whatsapp && (
                                <span className="text-slate-600 text-xs">—</span>
                              )}
                          </div>
                        </td>
                        <td className="px-4 py-3 max-w-[200px]">
                          <p className="truncate text-xs text-slate-400" title={lead.address || ''}>
                            {lead.address || lead.city || '—'}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {lead.website && (
                            <button
                              onClick={() => handleReScan(lead)}
                              disabled={reScanningId === lead.externalId}
                              className="rounded px-2 py-1 text-[11px] text-slate-400 hover:bg-slate-800 hover:text-white transition"
                              title="Re-analizar web"
                            >
                              {reScanningId === lead.externalId ? 'Escaneando…' : '🔄 Escanear'}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : searchStats && searchResults.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center">
              <span className="text-4xl">🔍</span>
              <p className="mt-3 text-sm text-slate-400">{t('adminLeads.noResults')}</p>
            </div>
          ) : null}
        </div>
      )}

      {/* TAB 2: SAVED LEADS DATABASE */}
      {activeTab === 'saved' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
            <div className="flex flex-1 items-center gap-3 w-full sm:w-auto">
              <input
                type="text"
                value={savedSearchQuery}
                onChange={(e) => setSavedSearchQuery(e.target.value)}
                placeholder="Buscar por nombre, email, ciudad..."
                className="w-full sm:w-72 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
              />
              <select
                value={savedFilterStatus}
                onChange={(e) => {
                  setSavedFilterStatus(e.target.value);
                  setSavedPage(1);
                }}
                className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-500"
              >
                <option value="">Todos los estados</option>
                <option value="NEW">Nuevos</option>
                <option value="CONTACTED">Contactados</option>
                <option value="QUALIFIED">Calificados</option>
                <option value="UNQUALIFIED">Descartados</option>
              </select>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                onClick={() => handleExportCsv(savedLeads)}
                disabled={savedLeads.length === 0}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 transition"
              >
                <span>📥</span>
                <span>Exportar Todos a CSV</span>
              </button>
            </div>
          </div>

          {/* Saved Leads Table */}
          {loadingSaved ? (
            <div className="flex h-64 items-center justify-center">
              <Spinner label="Cargando prospectos..." />
            </div>
          ) : savedLeads.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-12 text-center">
              <span className="text-4xl">📂</span>
              <p className="mt-3 text-sm text-slate-400">{t('adminLeads.emptySaved')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60 shadow-xl">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="border-b border-slate-800 bg-slate-950/60 text-[11px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-4 py-3">{t('adminLeads.colBusiness')}</th>
                    <th className="px-4 py-3">{t('adminLeads.colEmail')}</th>
                    <th className="px-4 py-3">{t('adminLeads.colPhone')}</th>
                    <th className="px-4 py-3">{t('adminLeads.colWebsite')}</th>
                    <th className="px-4 py-3">{t('adminLeads.colAddress')}</th>
                    <th className="px-4 py-3">{t('adminLeads.colStatus')}</th>
                    <th className="px-4 py-3 text-right">{t('adminLeads.colActions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {savedLeads.map((lead) => (
                    <tr key={lead.id} className="transition hover:bg-slate-800/40">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-white text-sm">{lead.name}</div>
                        {lead.category && (
                          <span className="mt-1 inline-block rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                            {lead.category}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {lead.email ? (
                          <a
                            href={`mailto:${lead.email}`}
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20"
                          >
                            <span>✉️</span>
                            <span>{lead.email}</span>
                          </a>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">{lead.phone || '—'}</td>
                      <td className="px-4 py-3">
                        {lead.website ? (
                          <a
                            href={lead.website}
                            target="_blank"
                            rel="noreferrer"
                            className="text-brand-400 hover:underline max-w-[140px] truncate block"
                          >
                            {lead.website.replace(/^https?:\/\//, '')}
                          </a>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-400 max-w-[180px] truncate">
                        {lead.city || lead.address || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={lead.status}
                          onChange={(e) => handleUpdateStatus(lead.id, e.target.value as any)}
                          className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-white focus:outline-none"
                        >
                          <option value="NEW">Nuevo</option>
                          <option value="CONTACTED">Contactado</option>
                          <option value="QUALIFIED">Calificado</option>
                          <option value="UNQUALIFIED">Descartado</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleDeleteSavedLead(lead.id)}
                          className="text-slate-400 hover:text-red-400 p-1 text-sm transition"
                          title="Eliminar prospecto"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: API CONFIGURATION */}
      {activeTab === 'config' && (
        <div className="space-y-6 max-w-3xl">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 backdrop-blur-xl shadow-xl space-y-6">
            <div>
              <h2 className="text-lg font-bold text-white">{t('adminLeads.configTitle')}</h2>
              <p className="mt-1 text-xs text-slate-400">{t('adminLeads.configSubtitle')}</p>
            </div>

            {configSuccess && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
                {configSuccess}
              </div>
            )}

            <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-4">
              <div>
                <p className="text-xs font-semibold text-white">Estado actual de la Clave</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Origen: {config?.source === 'database' ? 'Base de datos' : config?.source === 'environment' ? 'Variable de entorno' : 'No configurada'}
                </p>
              </div>
              <div>
                {config?.hasGooglePlacesApiKey ? (
                  <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-xs font-medium text-emerald-400">
                    ✓ Configurada
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-1 text-xs font-medium text-amber-300">
                    No configurada
                  </span>
                )}
              </div>
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  {t('adminLeads.apiKeyLabel')}
                </label>
                <input
                  type="password"
                  value={configKeyInput}
                  onChange={(e) => setConfigKeyInput(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none"
                />
                <p className="mt-1.5 text-[11px] text-slate-500">{t('adminLeads.apiKeyHint')}</p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="submit"
                  disabled={savingConfig}
                  className="bg-brand-600 hover:bg-brand-500 text-white text-xs px-5 py-2 font-medium"
                >
                  {savingConfig ? 'Guardando…' : 'Guardar Clave'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
