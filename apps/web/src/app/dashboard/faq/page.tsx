'use client';

import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { errorMessage, useList } from '@/lib/use-resource';
import { Button, ErrorAlert, Spinner } from '@/components/ui';
import { t } from '@/i18n';

interface Faq { id: string; question: string; answer: string; active: boolean }

export default function FaqPage() {
  const { me } = useAuth();
  const { items, error, reload } = useList<Faq>('/api/faqs');
  const [editing, setEditing] = useState<Faq | 'new' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canWrite = me?.role === 'OWNER' || me?.role === 'ADMIN';

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = { question: f.get('question'), answer: f.get('answer'), active: f.get('active') === 'on' };
    setBusy(true); setFormError(null);
    try {
      if (editing === 'new') await api('/api/faqs', { method: 'POST', body });
      else if (editing) await api(`/api/faqs/${editing.id}`, { method: 'PATCH', body });
      setEditing(null);
      await reload();
    } catch (err) { setFormError(errorMessage(err)); }
    setBusy(false);
  }

  async function remove(id: string) {
    if (!confirm(t('common.confirmDelete'))) return;
    try { await api(`/api/faqs/${id}`, { method: 'DELETE' }); await reload(); }
    catch (err) { alert(errorMessage(err)); }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('faq.title')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('faq.intro')}</p>
        </div>
        {canWrite && !editing && <Button onClick={() => setEditing('new')}>{t('faq.new')}</Button>}
      </div>
      {!canWrite && <p className="mt-4 text-sm text-slate-500">{t('common.readOnly')}</p>}

      {editing && (
        <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <label htmlFor="question" className="block text-sm font-medium">{t('faq.question')}</label>
            <input id="question" name="question" required maxLength={300} defaultValue={editing === 'new' ? '' : editing.question} disabled={busy}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label htmlFor="answer" className="block text-sm font-medium">{t('faq.answer')}</label>
            <textarea id="answer" name="answer" required maxLength={2000} rows={4} defaultValue={editing === 'new' ? '' : editing.answer} disabled={busy}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="active" defaultChecked={editing === 'new' ? true : editing.active} disabled={busy} /> {t('faq.active')}
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
        {items?.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">{t('faq.empty')}</p>
        )}
        {items?.map((f) => (
          <article key={f.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-medium">{f.question}</h2>
              {!f.active && <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{t('faq.inactive')}</span>}
            </div>
            <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{f.answer}</p>
            {canWrite && (
              <div className="mt-3 flex gap-3 text-sm">
                <button className="font-medium text-brand-700 hover:underline" onClick={() => setEditing(f)}>{t('common.edit')}</button>
                <button className="font-medium text-red-600 hover:underline" onClick={() => remove(f.id)}>{t('common.delete')}</button>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
