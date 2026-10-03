'use client';

import { useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { errorMessage, useList } from '@/lib/use-resource';
import { Button, ErrorAlert, Field, SelectField, Spinner } from '@/components/ui';
import { t } from '@/i18n';

type Kind = 'ROOM' | 'MENU_ITEM' | 'SERVICE';
interface Service {
  id: string; type: Kind; name: string; category: string | null; description: string | null;
  price: string | null; currency: 'HTG' | 'USD'; capacity: number | null; amenities: string[]; available: boolean;
}

const DEFAULT_KIND = { HOTEL: 'ROOM', RESTAURANT: 'MENU_ITEM', OTHER: 'SERVICE' } as const;

export default function ServicesPage() {
  const { me } = useAuth();
  const { items, error, reload } = useList<Service>('/api/services');
  const [editing, setEditing] = useState<Service | 'new' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<Kind>('SERVICE');
  const canWrite = me?.role === 'OWNER' || me?.role === 'ADMIN';

  function open(s: Service | 'new') {
    setKind(s === 'new' ? DEFAULT_KIND[me?.business.type ?? 'OTHER'] : s.type);
    setFormError(null);
    setEditing(s);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const str = (k: string) => String(f.get(k) ?? '').trim();
    const price = str('price');
    const capacity = str('capacity');
    const body = {
      type: kind,
      name: str('name'),
      category: str('category') || null,
      description: str('description') || null,
      price: price === '' ? null : Number(price),
      currency: str('currency'),
      capacity: kind === 'ROOM' && capacity !== '' ? Number(capacity) : null,
      amenities: kind === 'ROOM' ? str('amenities').split(',').map((a) => a.trim()).filter(Boolean) : [],
      available: f.get('available') === 'on',
    };
    setBusy(true); setFormError(null);
    try {
      if (editing === 'new') await api('/api/services', { method: 'POST', body });
      else if (editing) await api(`/api/services/${editing.id}`, { method: 'PATCH', body });
      setEditing(null);
      await reload();
    } catch (err) { setFormError(errorMessage(err)); }
    setBusy(false);
  }

  async function remove(id: string) {
    if (!confirm(t('common.confirmDelete'))) return;
    try { await api(`/api/services/${id}`, { method: 'DELETE' }); await reload(); }
    catch (err) { alert(errorMessage(err)); }
  }

  const cur = editing && editing !== 'new' ? editing : null;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('services.title')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('services.intro')}</p>
        </div>
        {canWrite && !editing && <Button onClick={() => open('new')}>{t('services.new')}</Button>}
      </div>
      {!canWrite && <p className="mt-4 text-sm text-slate-500">{t('common.readOnly')}</p>}

      {editing && (
        <form onSubmit={onSubmit} className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5">
          <SelectField id="type" label={t('services.kind')} value={kind} onChange={(e) => setKind(e.target.value as Kind)} disabled={busy}>
            {(['ROOM', 'MENU_ITEM', 'SERVICE'] as const).map((k) => <option key={k} value={k}>{t(`services.types.${k}`)}</option>)}
          </SelectField>
          <Field id="name" name="name" label={t('services.name')} required maxLength={150} defaultValue={cur?.name ?? ''} disabled={busy} />
          {kind === 'MENU_ITEM' && <Field id="category" name="category" label={t('services.category')} maxLength={100} defaultValue={cur?.category ?? ''} disabled={busy} />}
          <div className="grid grid-cols-2 gap-4">
            <Field id="price" name="price" type="number" min="0" step="0.01" label={t('services.price')} defaultValue={cur?.price ?? ''} disabled={busy} />
            <SelectField id="currency" name="currency" label={t('services.currency')} defaultValue={cur?.currency ?? 'HTG'} disabled={busy}>
              <option value="HTG">HTG</option><option value="USD">USD</option>
            </SelectField>
          </div>
          {kind === 'ROOM' && (
            <>
              <Field id="capacity" name="capacity" type="number" min="1" max="1000" label={t('services.capacity')} defaultValue={cur?.capacity ?? ''} disabled={busy} />
              <Field id="amenities" name="amenities" label={t('services.amenities')} defaultValue={cur?.amenities.join(', ') ?? ''} disabled={busy} />
            </>
          )}
          <div>
            <label htmlFor="description" className="block text-sm font-medium">{t('services.description')}</label>
            <textarea id="description" name="description" rows={3} maxLength={2000} defaultValue={cur?.description ?? ''} disabled={busy}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="available" defaultChecked={cur?.available ?? true} disabled={busy} /> {t('services.available')}
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
          <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">{t('services.empty')}</p>
        )}
        {items?.map((s) => (
          <article key={s.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-medium">{s.name}</h2>
                <p className="text-xs text-slate-500">
                  {t(`services.types.${s.type}`)}{s.category ? ` · ${s.category}` : ''}{s.capacity ? ` · ${s.capacity} ${t('services.persons')}` : ''}
                </p>
              </div>
              <div className="text-right">
                {s.price !== null && <p className="font-semibold">{Number(s.price).toLocaleString('fr-FR')} {s.currency}</p>}
                {!s.available && <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{t('services.unavailable')}</span>}
              </div>
            </div>
            {s.description && <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{s.description}</p>}
            {s.amenities.length > 0 && <p className="mt-1 text-xs text-slate-500">{s.amenities.join(' · ')}</p>}
            {canWrite && (
              <div className="mt-3 flex gap-3 text-sm">
                <button className="font-medium text-brand-700 hover:underline" onClick={() => open(s)}>{t('common.edit')}</button>
                <button className="font-medium text-red-600 hover:underline" onClick={() => remove(s.id)}>{t('common.delete')}</button>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
