'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { errorMessage } from '@/lib/use-resource';
import { Button, ErrorAlert, Field, SelectField, Spinner } from '@/components/ui';
import { t } from '@/i18n';

interface State {
  connected: boolean;
  integration: { provider: 'CLOUD_API' | 'EVOLUTION'; phoneNumberId: string; displayPhoneNumber: string | null; status: 'ACTIVE' | 'DISABLED'; baseUrl: string | null; instanceName: string | null } | null;
  webhookUrl: string | null;
  webhookConfigured: boolean;
  connectionState?: string;
  webhookRegistered?: boolean;
}

export default function WhatsAppPage() {
  const { me } = useAuth();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const isOwner = me?.role === 'OWNER';
  const [provider, setProvider] = useState<'CLOUD_API' | 'EVOLUTION' | null>(null);

  const load = useCallback(async () => {
    try { setState(await api<State>('/api/whatsapp')); }
    catch (e) { setError(errorMessage(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const str = (k: string) => String(f.get(k) ?? '').trim();
    const common = { displayPhoneNumber: str('displayPhoneNumber') || null, status: f.get('enabled') === 'on' ? 'ACTIVE' : 'DISABLED' };
    const body = activeProvider === 'EVOLUTION'
      ? { provider: 'EVOLUTION', baseUrl: str('baseUrl'), instanceName: str('instanceName'), ...(str('apiKey') ? { apiKey: str('apiKey') } : {}), ...common }
      : { provider: 'CLOUD_API', phoneNumberId: str('phoneNumberId'), accessToken: str('accessToken'), ...common };
    setBusy(true); setError(null); setSaved(false);
    try { setState(await api<State>('/api/whatsapp', { method: 'PUT', body })); setSaved(true); form.querySelectorAll<HTMLInputElement>('input[type=password]').forEach((x) => { x.value = ''; }); }
    catch (err) { setError(errorMessage(err)); }
    setBusy(false);
  }

  async function disconnect() {
    if (!confirm(t('whatsapp.confirmDisconnect'))) return;
    try { setState(await api<State>('/api/whatsapp', { method: 'DELETE' })); }
    catch (err) { setError(errorMessage(err)); }
  }

  if (!state) return error ? <ErrorAlert message={error} /> : <Spinner label={t('common.loading')} />;
  const i = state.integration;
  const activeProvider = provider ?? i?.provider ?? 'CLOUD_API';
  const evo = activeProvider === 'EVOLUTION';
  const label = !i ? t('whatsapp.notConnected') : i.status === 'ACTIVE' ? t('whatsapp.connected') : t('whatsapp.disabled');

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">{t('whatsapp.title')}</h1>
      <p className="mt-1 text-sm text-slate-600">{t('whatsapp.intro')}</p>
      {!isOwner && <p className="mt-2 text-sm text-slate-500">{t('whatsapp.ownerOnly')}</p>}

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <p className="text-sm text-slate-500">{t('whatsapp.status')}</p>
        <p className="mt-1 flex items-center gap-2 font-semibold">
          <span className={`h-2.5 w-2.5 rounded-full ${i?.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-hidden />
          {label}{i?.displayPhoneNumber ? ` · ${i.displayPhoneNumber}` : ''}
        </p>
        {i && (i.provider === 'EVOLUTION'
          ? <p className="mt-1 text-xs text-slate-500">Evolution : {i.instanceName} · {i.baseUrl}{state.connectionState ? ` · ${t('whatsapp.evoState')} : ${state.connectionState}` : ''}</p>
          : <p className="mt-1 text-xs text-slate-500">Phone number ID : {i.phoneNumberId}</p>)}
        {state.webhookRegistered && <p className="mt-1 text-xs text-emerald-700">{t('whatsapp.evoWebhookOk')}</p>}
      </div>

      {state.webhookUrl && (
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">{t('whatsapp.webhookTitle')}</h2>
        <code className="mt-2 block break-all rounded bg-slate-100 px-3 py-2 text-xs">{state.webhookUrl}</code>
        <p className="mt-2 text-xs text-slate-500">{i?.provider === 'EVOLUTION' ? t('whatsapp.evoWebhookHelp') : t('whatsapp.webhookHelp')}</p>
        {!state.webhookConfigured && <p role="alert" className="mt-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">{t('whatsapp.webhookMissing')}</p>}
      </div>
      )}

      {isOwner && (
        <form onSubmit={onSubmit} className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <SelectField id="provider" label={t('whatsapp.provider')} value={activeProvider} onChange={(e) => setProvider(e.target.value as 'CLOUD_API' | 'EVOLUTION')} disabled={busy}>
            <option value="CLOUD_API">{t('whatsapp.providerCloud')}</option>
            <option value="EVOLUTION">{t('whatsapp.providerEvolution')}</option>
          </SelectField>
          {evo ? (
            <>
              <Field id="baseUrl" name="baseUrl" type="url" label={t('whatsapp.evoBaseUrl')} hint={t('whatsapp.evoBaseUrlHint')} required defaultValue={i?.baseUrl ?? ''} disabled={busy} />
              <Field id="instanceName" name="instanceName" label={t('whatsapp.evoInstance')} required pattern="[\w.\-]{1,100}" defaultValue={i?.instanceName ?? ''} disabled={busy} />
              <Field id="apiKey" name="apiKey" type="password" label={t('whatsapp.evoApiKey')} hint={t('whatsapp.evoApiKeyKeep')} required={i?.provider !== 'EVOLUTION'} minLength={8} autoComplete="off" disabled={busy} />
              <Field id="displayPhoneNumber" name="displayPhoneNumber" label={t('whatsapp.displayPhone')} maxLength={30} defaultValue={i?.displayPhoneNumber ?? ''} disabled={busy} />
            </>
          ) : (
            <>
              <Field id="phoneNumberId" name="phoneNumberId" label={t('whatsapp.phoneNumberId')} required pattern="\d{5,30}" inputMode="numeric" defaultValue={i?.provider === 'CLOUD_API' ? i.phoneNumberId : ''} disabled={busy} />
              <Field id="displayPhoneNumber" name="displayPhoneNumber" label={t('whatsapp.displayPhone')} maxLength={30} defaultValue={i?.displayPhoneNumber ?? ''} disabled={busy} />
              <Field id="accessToken" name="accessToken" type="password" label={t('whatsapp.token')} hint={t('whatsapp.tokenHint')} required minLength={10} autoComplete="off" disabled={busy} />
            </>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="enabled" defaultChecked={i ? i.status === 'ACTIVE' : true} disabled={busy} /> {t('whatsapp.enabled')}
          </label>
          <ErrorAlert message={error} />
          {saved && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{t('common.saved')}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>{t('whatsapp.save')}</Button>
            {i && <Button type="button" onClick={disconnect} disabled={busy} className="bg-red-600 hover:bg-red-700">{t('whatsapp.disconnect')}</Button>}
          </div>
        </form>
      )}
    </div>
  );
}
