'use client';

import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { errorMessage, useList } from '@/lib/use-resource';
import { Button, ErrorAlert, Field, SelectField, Spinner } from '@/components/ui';
import { t } from '@/i18n';

type Trigger = 'KEYWORD' | 'WELCOME' | 'AWAY';
interface Rule { id: string; name: string; trigger: Trigger; keywords: string[]; reply: string; activeFrom: string | null; activeTo: string | null; priority: number; active: boolean }

export default function AutomationPage() {
  const { me } = useAuth();
  const { items, error, reload } = useList<Rule>('/api/auto-replies');
  const [editing, setEditing] = useState<Rule | 'new' | null>(null);
  const [trigger, setTrigger] = useState<Trigger>('KEYWORD');
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canWrite = me?.role === 'OWNER' || me?.role === 'ADMIN';

  function open(r: Rule | 'new') { setEditing(r); setTrigger(r === 'new' ? 'KEYWORD' : r.trigger); setFormError(null); }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const str = (k: string) => String(f.get(k) ?? '').trim();
    const body = {
      name: str('name'),
      trigger,
      keywords: trigger === 'KEYWORD' ? str('keywords').split(',').map((k) => k.trim()).filter(Boolean) : [],
      reply: str('reply'),
      activeFrom: trigger !== 'KEYWORD' && str('activeFrom') ? str('activeFrom') : null,
      activeTo: trigger !== 'KEYWORD' && str('activeTo') ? str('activeTo') : null,
      priority: Number(f.get('priority') ?? 0) || 0,
      active: f.get('active') === 'on',
    };
    setBusy(true); setFormError(null);
    try {
      if (editing === 'new') await api('/api/auto-replies', { method: 'POST', body });
      else if (editing) await api(`/api/auto-replies/${editing.id}`, { method: 'PATCH', body });
      setEditing(null);
      await reload();
    } catch (err) { setFormError(errorMessage(err)); }
    setBusy(false);
  }

  async function remove(id: string) {
    if (!confirm(t('common.confirmDelete'))) return;
    try { await api(`/api/auto-replies/${id}`, { method: 'DELETE' }); await reload(); }
    catch (err) { alert(errorMessage(err)); }
  }

  const cur = editing && editing !== 'new' ? editing : null;
  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('automation.title')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('automation.intro')}</p>
          <p className="mt-1 text-xs text-slate-500">{t('automation.order')} {t('automation.stopNote')}</p>
        </div>
        {canWrite && !editing && <Button onClick={() => open('new')}>{t('automation.new')}</Button>}
      </div>
      {!canWrite && <p className="mt-4 text-sm text-slate-500">{t('common.readOnly')}</p>}

      {editing && (
        <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <Field id="name" name="name" label={t('automation.name')} required maxLength={100} defaultValue={cur?.name ?? ''} disabled={busy} />
          <SelectField id="trigger" label={t('automation.trigger')} value={trigger} onChange={(e) => setTrigger(e.target.value as Trigger)} disabled={busy}>
            {(['KEYWORD', 'WELCOME', 'AWAY'] as const).map((k) => <option key={k} value={k}>{t(`automation.${k}`)}</option>)}
          </SelectField>
          {trigger === 'KEYWORD' && (
            <Field id="keywords" name="keywords" label={t('automation.keywords')} hint={t('automation.keywordsHint')} required defaultValue={cur?.keywords.join(', ') ?? ''} disabled={busy} />
          )}
          {trigger !== 'KEYWORD' && (
            <div className="grid grid-cols-2 gap-3">
              <Field id="activeFrom" name="activeFrom" type="time" label={t('automation.from')} required={trigger === 'AWAY'} defaultValue={cur?.activeFrom ?? ''} disabled={busy} />
              <Field id="activeTo" name="activeTo" type="time" label={t('automation.to')} hint={t('automation.hoursHint')} required={trigger === 'AWAY'} defaultValue={cur?.activeTo ?? ''} disabled={busy} />
            </div>
          )}
          <div>
            <label htmlFor="reply" className="block text-sm font-medium">{t('automation.reply')}</label>
            <textarea id="reply" name="reply" required maxLength={1000} rows={4} defaultValue={cur?.reply ?? ''} disabled={busy}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <Field id="priority" name="priority" type="number" min={0} max={100} label={t('automation.priority')} defaultValue={cur?.priority ?? 0} disabled={busy} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={cur ? cur.active : true} disabled={busy} /> {t('automation.active')}
          </label>
          <ErrorAlert message={formError} />
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>{t('common.save')}</Button>
            <Button type="button" onClick={() => setEditing(null)} disabled={busy} className="bg-slate-200 !text-slate-800 hover:bg-slate-300">{t('common.cancel')}</Button>
          </div>
        </form>
      )}

      <div className="mt-6 space-y-3">
        {error && <ErrorAlert message={error} />}
        {!items && !error && <Spinner label={t('common.loading')} />}
        {items?.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">{t('automation.empty')}</p>}
        {items?.map((r) => (
          <article key={r.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-medium">{r.name}</h2>
              <div className="flex gap-2 text-xs">
                <span className="rounded bg-brand-50 px-2 py-0.5 text-brand-700">{t(`automation.${r.trigger}`)}</span>
                {!r.active && <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-500">{t('automation.inactive')}</span>}
              </div>
            </div>
            {r.trigger === 'KEYWORD' && <p className="mt-1 text-xs text-slate-500">{r.keywords.join(' · ')}</p>}
            {r.activeFrom && r.activeTo && <p className="mt-1 text-xs text-slate-500">{r.activeFrom} → {r.activeTo}</p>}
            <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{r.reply}</p>
            {canWrite && (
              <div className="mt-3 flex gap-3 text-sm">
                <button className="font-medium text-brand-700 hover:underline" onClick={() => open(r)}>{t('common.edit')}</button>
                <button className="font-medium text-red-600 hover:underline" onClick={() => remove(r.id)}>{t('common.delete')}</button>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
