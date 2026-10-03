'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { errorMessage } from '@/lib/use-resource';
import { Button, ErrorAlert, Field, Spinner } from '@/components/ui';
import { t } from '@/i18n';

interface Customer { id: string; name: string | null; phone: string; email: string | null; country: string | null; notes: string | null }

export default function CustomersPage() {
  const { me } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<Customer[] | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Customer | 'new' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canWrite = me?.role === 'OWNER' || me?.role === 'ADMIN';

  async function load(q: string) {
    try { setError(null); setItems(await api<Customer[]>(`/api/customers${q ? `?search=${encodeURIComponent(q)}` : ''}`)); }
    catch (e) { setError(errorMessage(e)); }
  }
  useEffect(() => {
    const id = setTimeout(() => void load(search), 250); // debounce
    return () => clearTimeout(id);
  }, [search]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? '').trim();
    const body = { phone: s('phone'), name: s('name') || null, email: s('email') || null, country: s('country') || null, notes: s('notes') || null };
    setBusy(true); setFormError(null);
    try {
      if (editing === 'new') await api('/api/customers', { method: 'POST', body });
      else if (editing) await api(`/api/customers/${editing.id}`, { method: 'PATCH', body });
      setEditing(null);
      await load(search);
    } catch (err) { setFormError(errorMessage(err)); }
    setBusy(false);
  }

  async function startConversation(customerId: string) {
    try {
      await api('/api/conversations', { method: 'POST', body: { customerId } });
      router.push('/dashboard/conversations');
    } catch (err) { alert(errorMessage(err)); }
  }

  const cur = editing && editing !== 'new' ? editing : null;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('customers.title')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('customers.intro')}</p>
        </div>
        {canWrite && !editing && <Button onClick={() => { setFormError(null); setEditing('new'); }}>{t('customers.new')}</Button>}
      </div>

      {editing && (
        <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <Field id="phone" name="phone" type="tel" label={t('customers.phone')} hint={t('customers.phoneHint')} required defaultValue={cur?.phone ?? ''} disabled={busy} />
          <Field id="name" name="name" label={t('customers.name')} maxLength={120} defaultValue={cur?.name ?? ''} disabled={busy} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="email" name="email" type="email" label={t('customers.email')} defaultValue={cur?.email ?? ''} disabled={busy} />
            <Field id="country" name="country" label={t('customers.country')} maxLength={60} defaultValue={cur?.country ?? ''} disabled={busy} />
          </div>
          <div>
            <label htmlFor="notes" className="block text-sm font-medium">{t('customers.notes')}</label>
            <textarea id="notes" name="notes" rows={3} maxLength={2000} defaultValue={cur?.notes ?? ''} disabled={busy} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <ErrorAlert message={formError} />
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>{t('common.save')}</Button>
            <Button type="button" onClick={() => setEditing(null)} disabled={busy} className="bg-slate-200 !text-slate-800 hover:bg-slate-300">{t('common.cancel')}</Button>
          </div>
        </form>
      )}

      <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('customers.search')} aria-label={t('customers.search')}
        className="mt-6 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />

      <div className="mt-4 space-y-3">
        {error && <ErrorAlert message={error} />}
        {!items && !error && <Spinner label={t('common.loading')} />}
        {items?.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">{search ? t('customers.noResult') : t('customers.empty')}</p>
        )}
        {items?.map((c) => (
          <article key={c.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-medium">{c.name ?? t('customers.unnamed')}</h2>
                <p className="text-sm text-slate-600">{c.phone}{c.email ? ` · ${c.email}` : ''}{c.country ? ` · ${c.country}` : ''}</p>
              </div>
            </div>
            {c.notes && <p className="mt-2 whitespace-pre-line text-sm text-slate-500">{c.notes}</p>}
            {canWrite && (
              <div className="mt-3 flex gap-3 text-sm">
                <button className="font-medium text-brand-700 hover:underline" onClick={() => { setFormError(null); setEditing(c); }}>{t('common.edit')}</button>
                <button className="font-medium text-brand-700 hover:underline" onClick={() => startConversation(c.id)}>{t('customers.startConversation')}</button>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
