'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { errorMessage } from '@/lib/use-resource';
import { Button, ErrorAlert, Field, SelectField, Spinner } from '@/components/ui';
import { AiPreview } from '@/components/ai-preview';
import { t } from '@/i18n';

interface Business {
  name: string; type: 'HOTEL' | 'RESTAURANT' | 'OTHER'; description: string | null; address: string | null;
  phone: string | null; email: string | null; website: string | null; timezone: string; language: string; aiEnabled: boolean; aiRules: string | null;
}

export default function SettingsPage() {
  const { me } = useAuth();
  const [biz, setBiz] = useState<Business | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const isOwner = me?.role === 'OWNER';

  useEffect(() => {
    api<Business>('/api/business').then(setBiz).catch((e) => setError(errorMessage(e)));
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? '').trim();
    const body = {
      name: s('name'), type: s('type'), description: s('description') || null, address: s('address') || null,
      phone: s('phone') || null, email: s('email') || null, website: s('website') || null,
      timezone: s('timezone'), language: s('language'),
      aiEnabled: f.get('aiEnabled') === 'on', aiRules: s('aiRules') || null,
    };
    setBusy(true); setError(null); setSaved(false);
    try { setBiz(await api<Business>('/api/business', { method: 'PATCH', body })); setSaved(true); }
    catch (err) { setError(errorMessage(err)); }
    setBusy(false);
  }

  if (!biz) return error ? <ErrorAlert message={error} /> : <Spinner label={t('common.loading')} />;
  const d = !isOwner || busy;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
      {!isOwner && <p className="mt-2 text-sm text-slate-500">{t('settings.ownerOnly')}</p>}
      <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <Field id="name" name="name" label={t('settings.name')} required maxLength={120} defaultValue={biz.name} disabled={d} />
        <SelectField id="type" name="type" label={t('settings.type')} defaultValue={biz.type} disabled={d}>
          {(['HOTEL', 'RESTAURANT', 'OTHER'] as const).map((k) => <option key={k} value={k}>{t(`businessTypes.${k}`)}</option>)}
        </SelectField>
        <div>
          <label htmlFor="description" className="block text-sm font-medium">{t('settings.description')}</label>
          <textarea id="description" name="description" rows={3} maxLength={2000} defaultValue={biz.description ?? ''} disabled={d}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100" />
        </div>
        <Field id="address" name="address" label={t('settings.address')} maxLength={300} defaultValue={biz.address ?? ''} disabled={d} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="phone" name="phone" type="tel" label={t('settings.phone')} maxLength={30} defaultValue={biz.phone ?? ''} disabled={d} />
          <Field id="email" name="email" type="email" label={t('settings.email')} defaultValue={biz.email ?? ''} disabled={d} />
        </div>
        <Field id="website" name="website" type="url" label={t('settings.website')} placeholder="https://" defaultValue={biz.website ?? ''} disabled={d} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="timezone" name="timezone" label={t('settings.timezone')} required defaultValue={biz.timezone} disabled={d} />
          <SelectField id="language" name="language" label={t('settings.language')} defaultValue={biz.language} disabled={d}>
            {(['fr', 'es', 'en', 'ht'] as const).map((k) => <option key={k} value={k}>{t(`settings.languages.${k}`)}</option>)}
          </SelectField>
        </div>
        <h2 className="pt-2 text-lg font-semibold">{t('settings.aiTitle')}</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="aiEnabled" defaultChecked={biz.aiEnabled} disabled={d} /> {t('settings.aiEnabled')}
        </label>
        <div>
          <label htmlFor="aiRules" className="block text-sm font-medium">{t('settings.aiRules')}</label>
          <textarea id="aiRules" name="aiRules" rows={4} maxLength={2000} defaultValue={biz.aiRules ?? ''} disabled={d}
            aria-describedby="aiRules-hint" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100" />
          <p id="aiRules-hint" className="mt-1 text-xs text-slate-500">{t('settings.aiRulesHint')}</p>
        </div>
        <ErrorAlert message={error} />
        {saved && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{t('common.saved')}</p>}
        {isOwner && <Button type="submit" disabled={busy}>{busy ? t('auth.submitting') : t('common.save')}</Button>}
      </form>
      <AiPreview />
    </div>
  );
}
