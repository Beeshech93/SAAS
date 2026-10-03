'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
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
      ? { provider: 'EVOLUTION', baseUrl: str('baseUrl'), instanceName: str('instanceName'), ...(str('apiKey') ? { apiKey: str('apiKey') } : {}), createInstance: f.get('createInstance') === 'on', ...common }
      : { provider: 'CLOUD_API', phoneNumberId: str('phoneNumberId'), accessToken: str('accessToken'), ...common };
    setBusy(true); setError(null); setSaved(false);
    try { setState(await api<State>('/api/whatsapp', { method: 'PUT', body })); setSaved(true); form.querySelectorAll<HTMLInputElement>('input[type=password]').forEach((x) => { x.value = ''; }); form.querySelectorAll<HTMLInputElement>('input[name=createInstance]').forEach((x) => { x.checked = false; }); }
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

      {isOwner && i?.provider === 'EVOLUTION' && i.status === 'ACTIVE' && <QrConnect />}

      {state.webhookUrl && (i || activeProvider === 'CLOUD_API') && (
      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold">{t('whatsapp.webhookTitle')}</h2>
        <code className="mt-2 block break-all rounded bg-slate-100 px-3 py-2 text-xs">{state.webhookUrl}</code>
        <p className="mt-2 text-xs text-slate-500">{i?.provider === 'EVOLUTION' ? t('whatsapp.evoWebhookHelp') : t('whatsapp.webhookHelp')}</p>
        {!state.webhookConfigured && i?.provider !== 'EVOLUTION' && <p role="alert" className="mt-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">{t('whatsapp.webhookMissing')}</p>}
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
              <div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="createInstance" disabled={busy} /> {t('whatsapp.evoCreate')}</label>
                <p className="mt-1 text-xs text-slate-500">{t('whatsapp.evoCreateHint')}</p>
              </div>
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

interface Qr { state: string; qr: string | null; pairingCode: string | null }

/** Shows the Evolution QR, renews it before it expires and detects when the phone has scanned it. */
function QrConnect() {
  const [data, setData] = useState<Qr | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchQr = useCallback(async () => {
    setBusy(true); setErr(null);
    try { setData(await api<Qr>('/api/whatsapp/qr', { method: 'POST' })); }
    catch (e) { setErr(errorMessage(e)); setActive(false); }
    setBusy(false);
  }, []);

  // While waiting: check the session every 3 s and renew the QR every ~25 s (WhatsApp rotates it).
  useEffect(() => {
    if (!active || data?.state === 'open') return;
    let ticks = 0;
    const tick = async () => {
      ticks++;
      try {
        if (ticks % 8 === 0) setData(await api<Qr>('/api/whatsapp/qr', { method: 'POST' }));
        else {
          const s = await api<{ state: string }>('/api/whatsapp/status');
          if (s.state === 'open') setData({ state: 'open', qr: null, pairingCode: null });
        }
      } catch { /* transient: next tick retries */ }
      timer.current = setTimeout(tick, 3000);
    };
    timer.current = setTimeout(tick, 3000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [active, data?.state]);

  const connected = data?.state === 'open';
  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-semibold">{t('whatsapp.qrTitle')}</h2>
      {!connected && <p className="mt-1 text-sm text-slate-600">{t('whatsapp.qrIntro')}</p>}
      {connected && <p role="status" className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">{t('whatsapp.qrConnected')}</p>}
      {data?.qr && !connected && (
        <div className="mt-3 flex flex-col items-start gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data.qr} alt="QR code WhatsApp" width={256} height={256} className="rounded-lg border border-slate-200" />
          <p className="text-xs text-slate-500">{t('whatsapp.qrWaiting')}</p>
          {data.pairingCode && <p className="text-xs text-slate-600">{t('whatsapp.qrPairing')} <code className="rounded bg-slate-100 px-1.5 py-0.5">{data.pairingCode}</code></p>}
          <p className="text-xs text-amber-700">{t('whatsapp.qrWarning')}</p>
        </div>
      )}
      <ErrorAlert message={err} />
      {!connected && (
        <div className="mt-3">
          <Button type="button" disabled={busy} onClick={() => { setActive(true); void fetchQr(); }}>{data?.qr ? t('whatsapp.qrRefresh') : t('whatsapp.qrGenerate')}</Button>
        </div>
      )}
    </div>
  );
}
