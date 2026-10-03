'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { errorMessage } from '@/lib/use-resource';
import { Button, ErrorAlert, Spinner } from '@/components/ui';
import { t } from '@/i18n';

type Status = 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED';
interface Conv {
  id: string; status: Status; assignedToId: string | null; aiActive: boolean; lastMessageAt: string;
  lastMessagePreview: string | null; customer: { id: string; name: string | null; phone: string } | null;
}
interface Msg { id: string; senderType: 'CUSTOMER' | 'AI' | 'AGENT' | 'SYSTEM'; content: string; direction: 'INBOUND' | 'OUTBOUND'; createdAt: string; metadata: { internal?: boolean; delivery?: 'sent' | 'failed' | 'not_configured'; error?: string } | null }

const time = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const POLL_MS = 5000;

export default function ConversationsPage() {
  const { me } = useAuth();
  const [convs, setConvs] = useState<Conv[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [members, setMembers] = useState<{ userId: string; name: string; email: string }[]>([]);
  const bottom = useRef<HTMLDivElement>(null);
  const canAssign = me?.role === 'OWNER' || me?.role === 'ADMIN';

  const loadConvs = useCallback(async () => {
    try { setConvs(await api<Conv[]>('/api/conversations')); setError(null); }
    catch (e) { setError(errorMessage(e)); }
  }, []);

  const loadMessages = useCallback(async (id: string) => {
    try { setMessages(await api<Msg[]>(`/api/messages?conversationId=${id}`)); }
    catch (e) { setError(errorMessage(e)); }
  }, []);

  useEffect(() => {
    void loadConvs();
    const id = setInterval(() => void loadConvs(), POLL_MS);
    return () => clearInterval(id);
  }, [loadConvs]);

  useEffect(() => {
    if (!selectedId) return;
    setMessages(null);
    void loadMessages(selectedId);
    const id = setInterval(() => void loadMessages(selectedId), POLL_MS);
    return () => clearInterval(id);
  }, [selectedId, loadMessages]);

  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [messages?.length]);

  useEffect(() => {
    if (canAssign) api<typeof members>('/api/team').then(setMembers).catch(() => undefined);
  }, [canAssign]);

  const selected = convs?.find((c) => c.id === selectedId) ?? null;

  async function patch(body: Record<string, unknown>) {
    if (!selected) return;
    try { await api(`/api/conversations/${selected.id}`, { method: 'PATCH', body }); await loadConvs(); }
    catch (e) { setError(errorMessage(e)); }
  }

  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selected) return;
    const form = e.currentTarget;
    const content = String(new FormData(form).get('content') ?? '').trim();
    if (!content) return;
    setSending(true);
    try {
      await api('/api/messages', { method: 'POST', body: { conversationId: selected.id, content } });
      form.reset();
      await Promise.all([loadMessages(selected.id), loadConvs()]);
    } catch (err) { setError(errorMessage(err)); }
    setSending(false);
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-6xl flex-col">
      <h1 className="mb-4 text-2xl font-bold">{t('inbox.title')}</h1>
      <ErrorAlert message={error} />
      <div className="mt-2 flex min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <ul className={`w-full divide-y divide-slate-100 overflow-y-auto md:block md:w-80 md:border-r md:border-slate-200 ${selected ? 'hidden' : ''}`}>
          {!convs && <li className="p-4"><Spinner label={t('common.loading')} /></li>}
          {convs?.length === 0 && <li className="p-6 text-sm text-slate-600">{t('inbox.empty')}</li>}
          {convs?.map((c) => (
            <li key={c.id}>
              <button onClick={() => setSelectedId(c.id)} aria-current={c.id === selectedId} className={`block w-full px-4 py-3 text-left hover:bg-slate-50 ${c.id === selectedId ? 'bg-brand-50' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{c.customer?.name ?? c.customer?.phone}</span>
                  <span className="shrink-0 text-xs text-slate-400">{time(c.lastMessageAt)}</span>
                </div>
                <p className="truncate text-sm text-slate-500">{c.lastMessagePreview ?? '—'}</p>
                <div className="mt-1 flex gap-1 text-[11px]">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5">{t(`inbox.status.${c.status}`)}</span>
                  <span className={`rounded px-1.5 py-0.5 ${c.aiActive ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                    {c.aiActive ? t('inbox.ai') : t('inbox.aiPaused')}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>

        <section className={`min-w-0 flex-1 flex-col ${selected ? 'flex' : 'hidden md:flex'}`}>
          {!selected ? (
            <p className="m-auto text-sm text-slate-500">{t('inbox.select')}</p>
          ) : (
            <>
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
                <div className="min-w-0">
                  <button className="mb-1 text-xs text-brand-700 md:hidden" onClick={() => setSelectedId(null)}>← {t('inbox.back')}</button>
                  <p className="truncate font-semibold">{selected.customer?.name ?? selected.customer?.phone}</p>
                  <p className="text-xs text-slate-500">{selected.customer?.phone} · {selected.assignedToId ? t('inbox.assigned') : t('inbox.unassigned')}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select aria-label={t('inbox.title')} value={selected.status} onChange={(e) => patch({ status: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                    {(['OPEN', 'PENDING', 'RESOLVED', 'CLOSED'] as const).map((s) => <option key={s} value={s}>{t(`inbox.status.${s}`)}</option>)}
                  </select>
                  {canAssign && members.length > 0 && (
                    <select aria-label={t('inbox.assignTo')} value={selected.assignedToId ?? ''} onChange={(e) => patch({ assignedToId: e.target.value || null })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                      <option value="">{t('inbox.unassignedOption')}</option>
                      {members.map((m) => <option key={m.userId} value={m.userId}>{m.name || m.email}</option>)}
                    </select>
                  )}
                  {canAssign && !selected.assignedToId && me && (
                    <Button className="!px-3 !py-1.5" onClick={() => patch({ assignedToId: me.user.id })}>{t('inbox.take')}</Button>
                  )}
                  {(canAssign && selected.assignedToId) && (
                    <Button className="!px-3 !py-1.5 bg-slate-700 hover:bg-slate-800" onClick={() => patch({ assignedToId: null })}>{t('inbox.giveBack')}</Button>
                  )}
                  {!canAssign && !selected.aiActive && (
                    <Button className="!px-3 !py-1.5 bg-slate-700 hover:bg-slate-800" onClick={() => patch({ aiActive: true })}>{t('inbox.giveBack')}</Button>
                  )}
                </div>
              </header>

              <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-4" aria-live="polite">
                {!messages && <Spinner label={t('common.loading')} />}
                {messages?.length === 0 && <p className="text-center text-sm text-slate-500">{t('inbox.noMessages')}</p>}
                {messages?.map((m) => m.metadata?.internal ? (
                  <p key={m.id} className="text-center text-xs text-slate-500">— {t('inbox.handoffNote')} · {time(m.createdAt)} —</p>
                ) : (
                  <div key={m.id} className={`flex ${m.direction === 'OUTBOUND' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.direction === 'OUTBOUND' ? 'bg-brand-600 text-white' : 'bg-white shadow-sm'}`}>
                      <p className="whitespace-pre-wrap break-words">{m.content}</p>
                      <p className={`mt-1 text-[10px] ${m.direction === 'OUTBOUND' ? 'text-emerald-100' : 'text-slate-400'}`}>{t(`inbox.sender.${m.senderType}`)} · {time(m.createdAt)}</p>
                      {m.direction === 'OUTBOUND' && m.metadata?.delivery === 'failed' && <p className="mt-1 text-[11px] font-medium text-amber-200" role="alert">⚠ {t('inbox.failed')}{m.metadata.error ? ` : ${m.metadata.error}` : ''}</p>}
                      {m.direction === 'OUTBOUND' && m.metadata?.delivery === 'not_configured' && <p className="mt-1 text-[11px] text-amber-200">⚠ {t('inbox.notSent')}</p>}
                    </div>
                  </div>
                ))}
                <div ref={bottom} />
              </div>

              <form onSubmit={send} className="flex gap-2 border-t border-slate-200 p-3">
                <input name="content" required maxLength={4096} autoComplete="off" placeholder={t('inbox.write')} aria-label={t('inbox.write')} disabled={sending}
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <Button type="submit" disabled={sending}>{t('inbox.send')}</Button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
