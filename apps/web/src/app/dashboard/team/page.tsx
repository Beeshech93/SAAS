'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { errorMessage } from '@/lib/use-resource';
import { Button, ErrorAlert, Field, SelectField, Spinner } from '@/components/ui';
import { t } from '@/i18n';

type Role = 'OWNER' | 'ADMIN' | 'AGENT';
interface Member { userId: string; name: string; email: string; role: Role }
interface Invite { id: string; email: string; role: Role; expiresAt: string }

export default function TeamPage() {
  const { me } = useAuth();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const isOwner = me?.role === 'OWNER';
  const allowed = isOwner || me?.role === 'ADMIN';

  const load = useCallback(async () => {
    try {
      setError(null);
      const [m, i] = await Promise.all([api<Member[]>('/api/team'), api<Invite[]>('/api/team/invitations')]);
      setMembers(m); setInvites(i);
    } catch (e) { setError(errorMessage(e)); }
  }, []);
  useEffect(() => { if (allowed) void load(); }, [allowed, load]);

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try { await fn(); await load(); } catch (e) { setError(errorMessage(e)); }
  }

  async function onInvite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true); setLink(null); setCopied(false);
    await run(async () => {
      const r = await api<{ link: string }>('/api/team/invitations', { method: 'POST', body: { email: f.get('email'), role: f.get('role') } });
      setLink(r.link); form.reset();
    });
    setBusy(false);
  }

  if (!me) return null;
  if (!allowed) return <p className="text-sm text-slate-600">{t('analytics.forbidden')}</p>;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{t('team.title')}</h1>
        <p className="mt-1 text-sm text-slate-600">{t('team.intro')}</p>
        {!isOwner && <p className="mt-2 text-sm text-slate-500">{t('team.ownerOnly')}</p>}
      </div>
      <ErrorAlert message={error} />

      {isOwner && (
        <section aria-labelledby="t-invite" className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 id="t-invite" className="font-semibold">{t('team.invite')}</h2>
          <form onSubmit={onInvite} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <Field id="email" name="email" type="email" label={t('team.email')} required disabled={busy} />
            <SelectField id="role" name="role" label={t('team.role')} defaultValue="AGENT" disabled={busy}>
              <option value="AGENT">{t('team.roles.AGENT')}</option>
              <option value="ADMIN">{t('team.roles.ADMIN')}</option>
            </SelectField>
            <Button type="submit" disabled={busy}>{t('team.send')}</Button>
          </form>
          {link && (
            <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm" role="status">
              <p className="text-emerald-800">{t('team.linkReady')}</p>
              <code className="mt-2 block break-all rounded bg-white px-2 py-1 text-xs">{link}</code>
              <button className="mt-2 font-medium text-emerald-800 underline" onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); }}>
                {copied ? t('team.copied') : t('team.copy')}
              </button>
            </div>
          )}
        </section>
      )}

      <section aria-labelledby="t-members">
        <h2 id="t-members" className="mb-3 text-lg font-semibold">{t('team.members')}</h2>
        {!members && !error && <Spinner label={t('common.loading')} />}
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {members?.map((m) => {
            const self = m.userId === me.user.id;
            const editable = isOwner && !self && m.role !== 'OWNER';
            return (
              <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{m.name}{self ? ` (${t('team.you')})` : ''}</p>
                  <p className="truncate text-sm text-slate-500">{m.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  {editable ? (
                    <select aria-label={t('team.role')} value={m.role} onChange={(e) => run(() => api(`/api/team/${m.userId}`, { method: 'PATCH', body: { role: e.target.value } }))} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                      <option value="AGENT">{t('team.roles.AGENT')}</option>
                      <option value="ADMIN">{t('team.roles.ADMIN')}</option>
                    </select>
                  ) : <span className="rounded bg-slate-100 px-2 py-1 text-xs">{t(`team.roles.${m.role}`)}</span>}
                  {editable && (
                    <button className="text-sm font-medium text-red-600 hover:underline" onClick={() => confirm(t('team.confirmRemove')) && run(() => api(`/api/team/${m.userId}`, { method: 'DELETE' }))}>{t('team.remove')}</button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="t-pending">
        <h2 id="t-pending" className="mb-3 text-lg font-semibold">{t('team.invitations')}</h2>
        {invites.length === 0 ? <p className="text-sm text-slate-500">{t('team.noInvites')}</p> : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {invites.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{i.email} · {t(`team.roles.${i.role}`)}</p>
                  <p className="text-xs text-slate-500">{t('team.expires', { date: new Date(i.expiresAt).toLocaleDateString('fr-FR') })}</p>
                </div>
                {isOwner && <button className="font-medium text-red-600 hover:underline" onClick={() => run(() => api(`/api/team/invitations/${i.id}`, { method: 'DELETE' }))}>{t('team.revoke')}</button>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
