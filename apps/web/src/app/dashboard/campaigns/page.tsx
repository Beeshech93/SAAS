'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { errorMessage, useList } from '@/lib/use-resource';
import { Button, ErrorAlert, Field, SelectField, Spinner } from '@/components/ui';
import { t } from '@/i18n';

type Status = 'DRAFT' | 'SENDING' | 'COMPLETED' | 'CANCELLED';
interface Campaign { id: string; name: string; message: string; recentDays: number | null; listId?: string | null; status: Status; totalCount: number; sentCount: number; failedCount: number; createdAt: string }
interface Recipient { id: string; phone: string; name: string | null; status: string; error: string | null }
interface Detail { campaign: Campaign; recipients: Recipient[]; remaining: number }
interface Batch { campaign: Campaign; remaining: number; blocked?: string }
interface Reach { total: number; reach: number; optedOut: number }

const STATUS_LABEL: Record<Status, string> = { DRAFT: 'draft', SENDING: 'sending', COMPLETED: 'completed', CANCELLED: 'cancelled' };

export default function CampaignsPage() {
  const { me } = useAuth();
  const { items, error, reload } = useList<Campaign>('/api/campaigns');
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const canWrite = me?.role === 'OWNER' || me?.role === 'ADMIN';
  if (!canWrite && me) return <p className="text-sm text-slate-500">{t('common.readOnly')}</p>;

  if (openId) return <CampaignDetail id={openId} onBack={() => { setOpenId(null); void reload(); }} />;
  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('campaigns.title')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('campaigns.intro')}</p>
          <p className="mt-1 text-xs text-slate-500">{t('campaigns.caveat')}</p>
        </div>
        {!creating && <Button onClick={() => setCreating(true)}>{t('campaigns.new')}</Button>}
      </div>
      {creating && <CreateForm onDone={async (id) => { setCreating(false); await reload(); if (id) setOpenId(id); }} />}
      <div className="mt-6 space-y-3">
        {error && <ErrorAlert message={error} />}
        {!items && !error && <Spinner label={t('common.loading')} />}
        {items?.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">{t('campaigns.empty')}</p>}
        {items?.map((c) => (
          <button key={c.id} onClick={() => setOpenId(c.id)} className="block w-full rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-brand-500">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-medium">{c.name}</h2>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{t(`campaigns.${STATUS_LABEL[c.status]}`)}</span>
            </div>
            <p className="mt-1 line-clamp-2 text-sm text-slate-600">{c.message}</p>
            {c.status !== 'DRAFT' && <p className="mt-2 text-xs text-slate-500">{t('campaigns.progress', { sent: String(c.sentCount), failed: String(c.failedCount), total: String(c.totalCount) })}</p>}
          </button>
        ))}
      </div>
    </div>
  );
}

function CreateForm({ onDone }: { onDone: (id?: string) => void | Promise<void> }) {
  const [days, setDays] = useState('');
  const [listId, setListId] = useState('');
  const { items: lists } = useList<{ id: string; name: string; memberCount: number }>('/api/lists');
  const [reach, setReach] = useState<Reach | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    const q = new URLSearchParams();
    if (days) q.set('recentDays', days);
    if (listId) q.set('listId', listId);
    api<Reach>(`/api/campaigns/audience${q.size ? `?${q}` : ''}`).then((r) => live && setReach(r)).catch(() => live && setReach(null));
    return () => { live = false; };
  }, [days, listId]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setErr(null);
    try {
      const c = await api<Campaign>('/api/campaigns', { method: 'POST', body: { name: String(f.get('name')).trim(), message: String(f.get('message')).trim(), recentDays: days ? Number(days) : null, listId: listId || null } });
      await onDone(c.id);
    } catch (e2) { setErr(errorMessage(e2)); setBusy(false); }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5">
      <Field id="name" name="name" label={t('campaigns.name')} required maxLength={100} disabled={busy} />
      <div>
        <label htmlFor="message" className="block text-sm font-medium">{t('campaigns.message')}</label>
        <textarea id="message" name="message" required maxLength={1000} rows={5} disabled={busy} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      </div>
      <SelectField id="list" label={t('campaigns.list')} value={listId} onChange={(e) => setListId(e.target.value)} disabled={busy}>
        <option value="">{t('campaigns.listAll')}</option>
        {lists?.map((l) => <option key={l.id} value={l.id}>{l.name} ({l.memberCount})</option>)}
      </SelectField>
      <SelectField id="days" label={t('campaigns.audience')} value={days} onChange={(e) => setDays(e.target.value)} disabled={busy}>
        <option value="">{t('campaigns.audienceAll')}</option>
        {[7, 30, 90].map((d) => <option key={d} value={d}>{t('campaigns.audienceRecent', { days: String(d) })}</option>)}
      </SelectField>
      {reach && <p className="text-sm text-slate-600">{t('campaigns.reach', { count: String(reach.reach), total: String(reach.total), optedOut: String(reach.optedOut) })}</p>}
      <ErrorAlert message={err} />
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>{t('common.save')}</Button>
        <Button type="button" onClick={() => onDone()} disabled={busy} className="bg-slate-200 !text-slate-800 hover:bg-slate-300">{t('common.cancel')}</Button>
      </div>
    </form>
  );
}

function CampaignDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);
  const stop = useRef(false);

  const load = useCallback(async () => {
    try { setD(await api<Detail>(`/api/campaigns/${id}`)); } catch (e) { setErr(errorMessage(e)); }
  }, [id]);
  useEffect(() => { void load(); return () => { stop.current = true; }; }, [load]);

  // The server sends a small batch per call (serverless-friendly); the page keeps calling until done.
  async function run(first: 'start' | 'process') {
    stop.current = false; setRunning(true); setErr(null); setBlocked(null);
    let path = first;
    try {
      for (;;) {
        const r = await api<Batch>(`/api/campaigns/${id}/${path}`, { method: 'POST' });
        path = 'process';
        setD((prev) => prev && { ...prev, campaign: r.campaign, remaining: r.remaining });
        if (r.blocked) { setBlocked(r.blocked); break; }
        if (r.campaign.status !== 'SENDING' || r.remaining === 0 || stop.current) break;
      }
    } catch (e) { setErr(errorMessage(e)); }
    setRunning(false);
    await load();
  }

  async function cancel() {
    if (!confirm(t('campaigns.confirmCancel'))) return;
    stop.current = true;
    try { await api(`/api/campaigns/${id}/cancel`, { method: 'POST' }); await load(); } catch (e) { setErr(errorMessage(e)); }
  }

  if (!d) return err ? <ErrorAlert message={err} /> : <Spinner label={t('common.loading')} />;
  const c = d.campaign;
  const failed = d.recipients.filter((r) => r.status === 'FAILED');
  const pct = c.totalCount ? Math.round(((c.sentCount + c.failedCount) / c.totalCount) * 100) : 0;

  return (
    <div className="mx-auto max-w-3xl">
      <button onClick={onBack} className="text-sm text-brand-700 hover:underline">{t('campaigns.back')}</button>
      <h1 className="mt-2 text-2xl font-bold">{c.name}</h1>
      <span className="mt-1 inline-block rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{t(`campaigns.${STATUS_LABEL[c.status]}`)}</span>
      <p className="mt-3 whitespace-pre-line rounded-xl border border-slate-200 bg-white p-4 text-sm">{c.message}</p>

      {c.status !== 'DRAFT' && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="h-2 overflow-hidden rounded bg-slate-100"><div className="h-2 bg-brand-600" style={{ width: `${pct}%` }} /></div>
          <p className="mt-2 text-sm text-slate-600">{t('campaigns.progress', { sent: String(c.sentCount), failed: String(c.failedCount), total: String(c.totalCount) })}</p>
          {running && <p role="status" className="mt-1 text-xs text-slate-500">{t('campaigns.running')}</p>}
          {blocked && <p role="alert" className="mt-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">{t(`campaigns.blocked${blocked}`)}</p>}
        </div>
      )}
      <ErrorAlert message={err} />

      <div className="mt-4 flex gap-2">
        {c.status === 'DRAFT' && <Button disabled={running} onClick={() => { if (confirm(t('campaigns.confirmStart'))) void run('start'); }}>{t('campaigns.start')}</Button>}
        {c.status === 'SENDING' && !running && <Button onClick={() => run('process')}>{t('campaigns.resume')}</Button>}
        {(c.status === 'SENDING' || c.status === 'DRAFT') && <Button type="button" onClick={cancel} className="bg-red-600 hover:bg-red-700">{t('campaigns.cancel')}</Button>}
      </div>

      {failed.length > 0 && (
        <div className="mt-6">
          <h2 className="font-semibold">{t('campaigns.failures')}</h2>
          <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white text-sm">
            {failed.map((r) => <li key={r.id} className="flex justify-between gap-3 px-4 py-2"><span>{r.name ?? r.phone}</span><span className="text-xs text-red-600">{r.error}</span></li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
