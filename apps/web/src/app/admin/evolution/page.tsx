'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/use-resource';
import { Button, ErrorAlert, Field, Spinner } from '@/components/ui';
import { t } from '@/i18n';

interface EvolutionConfig {
  serverUrl: string | null;
  hasApiKey: boolean;
  isConfigured: boolean;
  source: 'database' | 'environment' | 'none';
}

interface TestResult {
  ok: boolean;
  error?: string;
  message?: string;
  instancesCount?: number;
}

export default function AdminEvolutionPage() {
  const [config, setConfig] = useState<EvolutionConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api<EvolutionConfig>('/api/admin/evolution');
      setConfig(res);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function onSave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const serverUrl = String(fd.get('serverUrl') ?? '').trim();
    const apiKey = String(fd.get('apiKey') ?? '').trim();
    setBusy(true); setError(null); setSaved(false); setTestResult(null);
    try {
      const res = await api<EvolutionConfig>('/api/admin/evolution', {
        method: 'PUT',
        body: { serverUrl, ...(apiKey ? { apiKey } : {}) },
      });
      setConfig(res);
      setSaved(true);
      form.querySelectorAll<HTMLInputElement>('input[type=password]').forEach((x) => { x.value = ''; });
    } catch (err) {
      setError(errorMessage(err));
    }
    setBusy(false);
  }

  async function onTest() {
    if (!config?.serverUrl) return;
    setTesting(true); setTestResult(null); setError(null);
    try {
      const res = await api<TestResult>('/api/admin/evolution/test', {
        method: 'POST',
        body: { serverUrl: config.serverUrl },
      });
      setTestResult(res);
    } catch (err) {
      setTestResult({ ok: false, error: errorMessage(err) });
    }
    setTesting(false);
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Spinner label={t('common.loading')} />
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
          {t('adminEvolution.title')}
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          {t('adminEvolution.subtitle')}
        </p>
      </div>

      {/* Status Card */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg backdrop-blur-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-xl text-purple-400">
              📲
            </div>
            <div>
              <h2 className="font-bold text-white">{t('adminEvolution.statusTitle')}</h2>
              <p className="text-xs text-slate-400">{t('adminEvolution.statusSubtitle')}</p>
            </div>
          </div>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
              config?.isConfigured
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
            }`}
          >
            {config?.isConfigured ? t('adminEvolution.configured') : t('adminEvolution.notConfigured')}
          </span>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-950/60 p-4 border border-slate-800/40 text-center">
            <p className="text-xs text-slate-400">{t('adminEvolution.serverUrl')}</p>
            <p className="mt-1 text-sm font-mono text-white truncate">
              {config?.serverUrl || '—'}
            </p>
          </div>
          <div className="rounded-xl bg-slate-950/60 p-4 border border-slate-800/40 text-center">
            <p className="text-xs text-slate-400">{t('adminEvolution.apiKeyStatus')}</p>
            <p className={`mt-1 text-sm font-semibold ${config?.hasApiKey ? 'text-emerald-400' : 'text-red-400'}`}>
              {config?.hasApiKey ? '✓ ' + t('adminEvolution.apiKeySet') : '✗ ' + t('adminEvolution.apiKeyMissing')}
            </p>
          </div>
          <div className="rounded-xl bg-slate-950/60 p-4 border border-slate-800/40 text-center">
            <p className="text-xs text-slate-400">{t('adminEvolution.source')}</p>
            <p className="mt-1 text-sm font-mono text-slate-300">
              {config?.source === 'database' ? '🗄️ Database' : config?.source === 'environment' ? '⚙️ ENV' : '—'}
            </p>
          </div>
        </div>

        {/* Test Connection */}
        {config?.isConfigured && (
          <div className="mt-6">
            <Button type="button" onClick={onTest} disabled={testing} className="bg-purple-600 hover:bg-purple-500 text-white">
              {testing ? t('adminEvolution.testing') : t('adminEvolution.testConnection')}
            </Button>
            {testResult && (
              <div className={`mt-3 rounded-xl border p-4 text-sm ${
                testResult.ok
                  ? 'border-emerald-500/20 bg-emerald-950/40 text-emerald-300'
                  : 'border-red-500/20 bg-red-950/40 text-red-300'
              }`}>
                {testResult.ok ? (
                  <>✓ {testResult.message}</>
                ) : (
                  <>✗ {testResult.error}</>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Configuration Form */}
      <form onSubmit={onSave} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg backdrop-blur-md space-y-5">
        <h2 className="text-lg font-bold text-white">{t('adminEvolution.formTitle')}</h2>
        <p className="text-sm text-slate-400">{t('adminEvolution.formSubtitle')}</p>

        <div className="space-y-4">
          <Field
            id="serverUrl"
            name="serverUrl"
            type="url"
            label={t('adminEvolution.serverUrlLabel')}
            hint={t('adminEvolution.serverUrlHint')}
            required
            defaultValue={config?.serverUrl ?? ''}
            disabled={busy}
            className="[&_input]:bg-slate-950/60 [&_input]:border-slate-700 [&_input]:text-white [&_label]:text-slate-200"
          />
          <Field
            id="apiKey"
            name="apiKey"
            type="password"
            label={t('adminEvolution.apiKeyLabel')}
            hint={config?.hasApiKey ? t('adminEvolution.apiKeyKeepHint') : t('adminEvolution.apiKeyNewHint')}
            required={!config?.hasApiKey}
            minLength={8}
            autoComplete="off"
            disabled={busy}
            className="[&_input]:bg-slate-950/60 [&_input]:border-slate-700 [&_input]:text-white [&_label]:text-slate-200"
          />
        </div>

        <ErrorAlert message={error} />
        {saved && (
          <p role="status" className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-sm text-emerald-400">
            ✓ {t('adminEvolution.saved')}
          </p>
        )}

        <div className="flex gap-3">
          <Button type="submit" disabled={busy} className="bg-brand-600 hover:bg-brand-500 text-white">
            {t('adminEvolution.saveButton')}
          </Button>
        </div>
      </form>

      {/* Info Box */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6 shadow-lg backdrop-blur-md">
        <h2 className="text-base font-bold text-white mb-4">{t('adminEvolution.infoTitle')}</h2>
        <div className="text-xs text-slate-400 space-y-2">
          <p className="font-semibold text-slate-200">{t('adminEvolution.howItWorks')}</p>
          <ul className="list-disc pl-4 space-y-1">
            <li>{t('adminEvolution.info1')}</li>
            <li>{t('adminEvolution.info2')}</li>
            <li>{t('adminEvolution.info3')}</li>
            <li>{t('adminEvolution.info4')}</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
