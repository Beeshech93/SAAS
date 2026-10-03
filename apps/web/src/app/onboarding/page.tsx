'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { errorMessage } from '@/lib/use-resource';
import { Button, ErrorAlert, Field, Spinner } from '@/components/ui';
import { t, tr } from '@/i18n';

type BizType = 'HOTEL' | 'RESTAURANT' | 'OTHER';
const TOTAL = 5;
const secondary = 'bg-slate-200 !text-slate-800 hover:bg-slate-300';

export default function OnboardingPage() {
  const { me, loading, refresh } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<BizType>('OTHER');
  const [added, setAdded] = useState<string[]>([]);
  const [faqQuestion, setFaqQuestion] = useState('');
  const [waConnected, setWaConnected] = useState(false);

  useEffect(() => {
    if (loading || done) return; // after finishing, stay on the "ready" screen
    if (!me) router.replace('/login');
    else if (me.role !== 'OWNER' || me.business.onboardedAt) router.replace('/dashboard');
  }, [loading, me, router, done]);

  useEffect(() => {
    if (me) { setName(me.business.name); setType(me.business.type); }
  }, [me]);

  if (loading || !me || me.role !== 'OWNER' || (me.business.onboardedAt && !done)) {
    return <main className="flex min-h-screen items-center justify-center"><Spinner label={t('common.loading')} /></main>;
  }

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError(null);
    try { await fn(); } catch (e) { setError(errorMessage(e)); }
    setBusy(false);
  };
  const saveBusiness = (body: Record<string, unknown>, then: () => void) => run(async () => { await api('/api/business', { method: 'PATCH', body }); then(); });

  async function finish() {
    await run(async () => { await api('/api/business/onboarding/complete', { method: 'POST' }); setDone(true); await refresh(); });
  }

  if (done) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-2xl text-brand-700" aria-hidden>✓</div>
        <h1 className="mt-6 text-3xl font-bold">{t('onboarding.readyTitle')}</h1>
        <p className="mt-3 text-slate-600">{t('onboarding.readyText')}</p>
        <Link href="/dashboard" className="mt-8 rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700">{t('onboarding.goDashboard')}</Link>
      </main>
    );
  }

  const stepNames = tr<string[]>('onboarding.steps');
  const suggestions = tr<string[]>(`faqSuggestions.${type}`);
  const next = () => { setError(null); setStep((s) => Math.min(TOTAL, s + 1)); };
  const back = () => { setError(null); setStep((s) => Math.max(1, s - 1)); };

  async function onInfo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? '').trim() || null;
    await saveBusiness({ description: s('description'), address: s('address'), phone: s('phone'), email: s('email'), website: s('website') }, next);
  }

  async function addFaq(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const q = String(f.get('question') ?? '').trim();
    const a = String(f.get('answer') ?? '').trim();
    await run(async () => {
      await api('/api/faqs', { method: 'POST', body: { question: q, answer: a } });
      setAdded((x) => [...x, q]); setFaqQuestion(''); form.reset();
    });
  }

  async function addService(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const price = String(f.get('price') ?? '').trim();
    const sName = String(f.get('name') ?? '').trim();
    await run(async () => {
      await api('/api/services', { method: 'POST', body: {
        type: type === 'HOTEL' ? 'ROOM' : type === 'RESTAURANT' ? 'MENU_ITEM' : 'SERVICE',
        name: sName, price: price === '' ? null : Number(price), currency: String(f.get('currency') ?? 'HTG'),
      } });
      setAdded((x) => [...x, sName]); form.reset();
    });
  }

  async function onWhatsApp(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await run(async () => {
      await api('/api/whatsapp', { method: 'PUT', body: { phoneNumberId: String(f.get('phoneNumberId') ?? '').trim(), accessToken: String(f.get('accessToken') ?? '').trim(), status: 'ACTIVE' } });
      setWaConnected(true);
    });
  }

  const serviceLabel = type === 'HOTEL' ? t('onboarding.s4.hotelService') : type === 'RESTAURANT' ? t('onboarding.s4.restaurantService') : t('onboarding.s4.otherService');

  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t('onboarding.title')}</h1>
        <button onClick={finish} disabled={busy} className="text-sm text-slate-500 underline hover:text-slate-700">{t('onboarding.skip')}</button>
      </div>

      <nav aria-label={t('onboarding.stepOf', { n: String(step), total: String(TOTAL) })} className="mt-6">
        <ol className="flex gap-2">
          {stepNames.map((label, i) => (
            <li key={label} className="flex-1" aria-current={i + 1 === step ? 'step' : undefined}>
              <div className={`h-1.5 rounded-full ${i + 1 <= step ? 'bg-brand-500' : 'bg-slate-200'}`} />
              <span className={`mt-1 hidden text-[11px] sm:block ${i + 1 === step ? 'font-semibold text-slate-900' : 'text-slate-500'}`}>{label}</span>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-slate-500 sm:hidden">{t('onboarding.stepOf', { n: String(step), total: String(TOTAL) })} — {stepNames[step - 1]}</p>
      </nav>

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
        {step === 1 && (
          <form onSubmit={(e) => { e.preventDefault(); void saveBusiness({ name: name.trim() }, next); }} className="space-y-4">
            <h2 className="text-lg font-semibold">{t('onboarding.s1.title')}</h2>
            <Field id="name" label={t('settings.name')} hint={t('onboarding.s1.hint')} required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
            <ErrorAlert message={error} />
            <Button type="submit" disabled={busy || !name.trim()}>{busy ? t('onboarding.saving') : t('onboarding.next')}</Button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={(e) => { e.preventDefault(); void saveBusiness({ type }, next); }} className="space-y-4">
            <h2 className="text-lg font-semibold">{t('onboarding.s2.title')}</h2>
            <fieldset className="grid gap-3 sm:grid-cols-3" disabled={busy}>
              <legend className="sr-only">{t('onboarding.s2.title')}</legend>
              {(['HOTEL', 'RESTAURANT', 'OTHER'] as const).map((k) => (
                <label key={k} className={`cursor-pointer rounded-lg border p-4 text-center text-sm font-medium ${type === k ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500' : 'border-slate-300 hover:bg-slate-50'}`}>
                  <input type="radio" name="type" value={k} checked={type === k} onChange={() => setType(k)} className="sr-only" />
                  {t(`businessTypes.${k}`)}
                </label>
              ))}
            </fieldset>
            <ErrorAlert message={error} />
            <div className="flex gap-2"><Button type="button" onClick={back} className={secondary}>{t('onboarding.back')}</Button><Button type="submit" disabled={busy}>{busy ? t('onboarding.saving') : t('onboarding.next')}</Button></div>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={onInfo} className="space-y-4">
            <h2 className="text-lg font-semibold">{t('onboarding.s3.title')}</h2>
            <p className="text-sm text-slate-600">{t('onboarding.s3.hint')}</p>
            <div>
              <label htmlFor="description" className="block text-sm font-medium">{t('settings.description')}</label>
              <textarea id="description" name="description" rows={3} maxLength={2000} disabled={busy} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <Field id="address" name="address" label={t('settings.address')} maxLength={300} disabled={busy} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="phone" name="phone" type="tel" label={t('settings.phone')} maxLength={30} disabled={busy} />
              <Field id="email" name="email" type="email" label={t('settings.email')} disabled={busy} />
            </div>
            <Field id="website" name="website" type="url" label={t('settings.website')} placeholder="https://" disabled={busy} />
            <ErrorAlert message={error} />
            <div className="flex gap-2"><Button type="button" onClick={back} className={secondary}>{t('onboarding.back')}</Button><Button type="submit" disabled={busy}>{busy ? t('onboarding.saving') : t('onboarding.next')}</Button></div>
          </form>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold">{t('onboarding.s4.title')}</h2>
              <p className="mt-1 text-sm text-slate-600">{t('onboarding.s4.hint')}</p>
            </div>

            <form onSubmit={addFaq} className="space-y-3">
              <h3 className="text-sm font-semibold">{t('onboarding.s4.faqTitle')}</h3>
              <p className="text-xs text-slate-500">{t('onboarding.s4.faqSuggest')}</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((q) => (
                  <button type="button" key={q} onClick={() => setFaqQuestion(q)} className="rounded-full border border-slate-300 px-3 py-1 text-xs hover:bg-slate-50">{q}</button>
                ))}
              </div>
              <Field id="question" name="question" label={t('faq.question')} required maxLength={300} value={faqQuestion} onChange={(e) => setFaqQuestion(e.target.value)} disabled={busy} />
              <div>
                <label htmlFor="answer" className="block text-sm font-medium">{t('faq.answer')}</label>
                <textarea id="answer" name="answer" rows={2} required maxLength={2000} disabled={busy} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <Button type="submit" disabled={busy}>{t('onboarding.s4.addFaq')}</Button>
            </form>

            <form onSubmit={addService} className="space-y-3 border-t border-slate-100 pt-5">
              <h3 className="text-sm font-semibold">{t('onboarding.s4.serviceTitle')} — {serviceLabel}</h3>
              <Field id="svc-name" name="name" label={t('services.name')} required maxLength={150} disabled={busy} />
              <div className="grid grid-cols-2 gap-3">
                <Field id="svc-price" name="price" type="number" min="0" step="0.01" label={t('services.price')} disabled={busy} />
                <div>
                  <label htmlFor="svc-cur" className="block text-sm font-medium">{t('services.currency')}</label>
                  <select id="svc-cur" name="currency" disabled={busy} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option>HTG</option><option>USD</option></select>
                </div>
              </div>
              <Button type="submit" disabled={busy}>{t('onboarding.s4.addService')}</Button>
            </form>

            <div aria-live="polite" className="text-sm">
              {added.length === 0 ? <p className="text-slate-500">{t('onboarding.s4.nothingYet')}</p> : <p className="text-emerald-700">✓ {t('onboarding.s4.added')} {added.join(' · ')}</p>}
            </div>
            <ErrorAlert message={error} />
            <div className="flex gap-2"><Button type="button" onClick={back} className={secondary}>{t('onboarding.back')}</Button><Button type="button" onClick={next}>{t('onboarding.next')}</Button></div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">{t('onboarding.s5.title')}</h2>
            <p className="text-sm text-slate-600">{t('onboarding.s5.hint')}</p>
            {waConnected ? <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{t('onboarding.s5.connected')}</p> : (
              <form onSubmit={onWhatsApp} className="space-y-4">
                <Field id="phoneNumberId" name="phoneNumberId" label={t('whatsapp.phoneNumberId')} required pattern="\d{5,30}" inputMode="numeric" disabled={busy} />
                <Field id="accessToken" name="accessToken" type="password" label={t('whatsapp.token')} hint={t('whatsapp.tokenHint')} required minLength={10} autoComplete="off" disabled={busy} />
                <Button type="submit" disabled={busy}>{t('whatsapp.save')}</Button>
              </form>
            )}
            <ErrorAlert message={error} />
            <div className="flex gap-2 border-t border-slate-100 pt-4">
              <Button type="button" onClick={back} className={secondary}>{t('onboarding.back')}</Button>
              <Button type="button" onClick={finish} disabled={busy}>{waConnected ? t('onboarding.finish') : t('onboarding.s5.later')}</Button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
