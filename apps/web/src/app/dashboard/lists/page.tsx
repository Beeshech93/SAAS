'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { errorMessage, useList } from '@/lib/use-resource';
import { Button, ErrorAlert, Field, Spinner } from '@/components/ui';
import { t } from '@/i18n';

interface ListRow { id: string; name: string; memberCount: number }
interface Customer { id: string; name: string | null; phone: string }
interface AddResult { added: number; alreadyIn: number; created: number; invalid: string[]; invalidCount: number }

export default function ListsPage() {
  const { me } = useAuth();
  const { items, error, reload } = useList<ListRow>('/api/lists');
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const canWrite = me?.role === 'OWNER' || me?.role === 'ADMIN';
  if (me && !canWrite) return <p className="text-sm text-slate-500">{t('common.readOnly')}</p>;
  if (openId) return <ListDetail id={openId} onBack={() => { setOpenId(null); void reload(); }} />;

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get('name') ?? '').trim();
    setErr(null);
    try { const l = await api<ListRow>('/api/lists', { method: 'POST', body: { name } }); setCreating(false); await reload(); setOpenId(l.id); }
    catch (e2) { setErr(errorMessage(e2)); }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{t('lists.title')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('lists.intro')}</p>
        </div>
        {!creating && <Button onClick={() => setCreating(true)}>{t('lists.new')}</Button>}
      </div>
      {creating && (
        <form onSubmit={create} className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-white p-5">
          <Field id="name" name="name" label={t('lists.name')} required maxLength={80} />
          <ErrorAlert message={err} />
          <div className="flex gap-2">
            <Button type="submit">{t('common.save')}</Button>
            <Button type="button" onClick={() => setCreating(false)} className="bg-slate-200 !text-slate-800 hover:bg-slate-300">{t('common.cancel')}</Button>
          </div>
        </form>
      )}
      <div className="mt-6 space-y-3">
        {error && <ErrorAlert message={error} />}
        {!items && !error && <Spinner label={t('common.loading')} />}
        {items?.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-600">{t('lists.empty')}</p>}
        {items?.map((l) => (
          <button key={l.id} onClick={() => setOpenId(l.id)} className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white p-4 text-left hover:border-brand-500">
            <span className="font-medium">{l.name}</span>
            <span className="text-sm text-slate-500">{t('lists.members', { count: String(l.memberCount) })}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ListDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [data, setData] = useState<{ list: { id: string; name: string }; members: Customer[] } | null>(null);
  const [all, setAll] = useState<Customer[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api(`/api/lists/${id}`));
      setAll(await api<Customer[]>('/api/customers'));
    } catch (e) { setErr(errorMessage(e)); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function add(body: { contacts?: { phone: string; name?: string }[]; customerIds?: string[] }) {
    setBusy(true); setErr(null); setResult(null);
    try {
      const r = await api<AddResult>(`/api/lists/${id}/members`, { method: 'POST', body });
      setResult(t('lists.result', { added: String(r.added), already: String(r.alreadyIn), created: String(r.created), invalid: String(r.invalidCount) }) + (r.invalid.length ? ` ${t('lists.invalidList', { list: r.invalid.join(', ') })}` : ''));
      setPicked(new Set());
      await load();
    } catch (e) { setErr(errorMessage(e)); }
    setBusy(false);
  }

  function onPaste(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const text = String(new FormData(form).get('paste') ?? '');
    const contacts = text.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
      const [phone, ...rest] = line.split(/[,;\t]/);
      const name = rest.join(' ').trim();
      return { phone: phone!.trim(), ...(name ? { name } : {}) };
    }).slice(0, 500);
    if (contacts.length) void add({ contacts }).then(() => form.reset());
  }

  async function rename() {
    const name = prompt(t('lists.name'), data?.list.name)?.trim();
    if (!name) return;
    try { await api(`/api/lists/${id}`, { method: 'PATCH', body: { name } }); await load(); } catch (e) { setErr(errorMessage(e)); }
  }
  async function remove() {
    if (!confirm(t('lists.confirmDelete'))) return;
    try { await api(`/api/lists/${id}`, { method: 'DELETE' }); onBack(); } catch (e) { setErr(errorMessage(e)); }
  }
  async function removeMember(cid: string) {
    try { await api(`/api/lists/${id}/members/${cid}`, { method: 'DELETE' }); await load(); } catch (e) { setErr(errorMessage(e)); }
  }

  if (!data) return err ? <ErrorAlert message={err} /> : <Spinner label={t('common.loading')} />;
  const inList = new Set(data.members.map((m) => m.id));
  const candidates = all.filter((c) => !inList.has(c.id));

  return (
    <div className="mx-auto max-w-3xl">
      <button onClick={onBack} className="text-sm text-brand-700 hover:underline">{t('lists.back')}</button>
      <div className="mt-2 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">{data.list.name}</h1>
        <div className="flex gap-3 text-sm">
          <button className="font-medium text-brand-700 hover:underline" onClick={rename}>{t('lists.rename')}</button>
          <button className="font-medium text-red-600 hover:underline" onClick={remove}>{t('common.delete')}</button>
        </div>
      </div>
      <ErrorAlert message={err} />
      {result && <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{result}</p>}

      <form onSubmit={onPaste} className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-white p-5">
        <label htmlFor="paste" className="block text-sm font-medium">{t('lists.addPaste')}</label>
        <textarea id="paste" name="paste" rows={4} disabled={busy} placeholder="+50937001234, Jean" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <p className="text-xs text-slate-500">{t('lists.pasteHint')}</p>
        <Button type="submit" disabled={busy}>{t('lists.pasteAdd')}</Button>
      </form>

      {candidates.length > 0 && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-medium">{t('lists.addExisting')}</h2>
          <ul className="mt-2 max-h-56 space-y-1 overflow-auto text-sm">
            {candidates.map((c) => (
              <li key={c.id}>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={picked.has(c.id)} disabled={busy}
                    onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })} />
                  {c.name ?? c.phone} <span className="text-xs text-slate-500">{c.name ? c.phone : ''}</span>
                </label>
              </li>
            ))}
          </ul>
          <Button className="mt-3" disabled={busy || picked.size === 0} onClick={() => add({ customerIds: [...picked] })}>{t('lists.addSelected')} ({picked.size})</Button>
        </div>
      )}

      <div className="mt-6">
        <h2 className="font-semibold">{t('lists.members', { count: String(data.members.length) })}</h2>
        {data.members.length === 0 && <p className="mt-2 text-sm text-slate-500">{t('lists.none')}</p>}
        <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white text-sm">
          {data.members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2">
              <span>{m.name ?? m.phone} {m.name && <span className="text-xs text-slate-500">{m.phone}</span>}</span>
              <button className="text-xs font-medium text-red-600 hover:underline" onClick={() => removeMember(m.id)}>{t('lists.remove')}</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
