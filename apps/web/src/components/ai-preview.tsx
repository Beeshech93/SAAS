'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { errorMessage } from '@/lib/use-resource';
import { Button, ErrorAlert } from './ui';
import { t } from '@/i18n';

interface Turn { role: 'user' | 'assistant'; content: string; action?: string }

/** Dry-run of the assistant against the saved business data. Nothing is stored or sent. */
export function AiPreview() {
  const { me } = useAuth();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canUse = me?.role === 'OWNER' || me?.role === 'ADMIN';

  useEffect(() => {
    if (!canUse) return;
    api<{ available: boolean }>('/api/ai/status').then((r) => setAvailable(r.available)).catch(() => setAvailable(false));
  }, [canUse]);

  if (!canUse) return null;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const message = String(new FormData(form).get('message') ?? '').trim();
    if (!message) return;
    setBusy(true); setError(null);
    try {
      const history = turns.map(({ role, content }) => ({ role, content })).slice(-10);
      const r = await api<{ action: string; reply: string | null }>('/api/ai/preview', { method: 'POST', body: { message, history } });
      setTurns((prev) => [...prev, { role: 'user', content: message }, { role: 'assistant', content: r.reply ?? '…', action: r.action }]);
      form.reset();
    } catch (err) { setError(errorMessage(err)); }
    setBusy(false);
  }

  return (
    <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="ai-preview">
      <h2 id="ai-preview" className="text-lg font-semibold">{t('ai.previewTitle')}</h2>
      <p className="mt-1 text-xs text-slate-500">{t('ai.previewHelp')}</p>
      {available === false && <p role="alert" className="mt-3 rounded bg-amber-50 px-3 py-2 text-sm text-amber-800">{t('ai.unavailable')}</p>}
      <div className="mt-3 space-y-2" aria-live="polite">
        {turns.map((m, i) => (
          <div key={i} className={`rounded-lg px-3 py-2 text-sm ${m.role === 'user' ? 'bg-slate-100' : 'bg-brand-50'}`}>
            <p className="text-[11px] font-medium text-slate-500">{t(m.role === 'user' ? 'ai.you' : 'ai.assistant')}</p>
            <p className="whitespace-pre-wrap">{m.content}</p>
            {m.action && m.action !== 'answer' && <p className="mt-1 text-[11px] text-slate-500">{t(`ai.actions.${m.action}`)}</p>}
          </div>
        ))}
      </div>
      <ErrorAlert message={error} />
      <form onSubmit={onSubmit} className="mt-3 flex gap-2">
        <input name="message" required maxLength={1000} autoComplete="off" placeholder={t('ai.placeholder')} aria-label={t('ai.placeholder')} disabled={busy || available === false}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100" />
        <Button type="submit" disabled={busy || available === false}>{t('ai.send')}</Button>
      </form>
    </section>
  );
}
