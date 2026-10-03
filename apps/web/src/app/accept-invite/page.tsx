'use client';

import { useRouter } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { api } from '@/lib/api';
import { useAuth, type Me } from '@/lib/auth-context';
import { errorMessage } from '@/lib/use-resource';
import { Button, ErrorAlert, Field, Spinner } from '@/components/ui';
import { t } from '@/i18n';

function AcceptInvite() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [token, setToken] = useState<string | null>(null);
  const [info, setInfo] = useState<{ email: string; role: 'OWNER' | 'ADMIN' | 'AGENT'; businessName: string } | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const tk = new URLSearchParams(window.location.search).get('token');
    if (!tk) { setInvalid(true); return; }
    setToken(tk);
    window.history.replaceState(null, '', '/accept-invite'); // keep the token out of the address bar/history
    api<NonNullable<typeof info>>('/api/auth/invite-info', { method: 'POST', body: { token: tk } }).then(setInfo).catch(() => setInvalid(true));
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true); setError(null);
    try {
      const data = await api<Me & { accessToken: string }>('/api/auth/accept-invite', { method: 'POST', body: { token, name: f.get('name'), password: f.get('password') } });
      signIn(data);
      router.push('/dashboard');
    } catch (err) { setError(errorMessage(err)); setBusy(false); }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      {invalid ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{t('invite.invalid')}</p>
        : !info ? <Spinner label={t('common.loading')} /> : (
        <>
          <h1 className="text-2xl font-bold">{t('invite.title', { businessName: info.businessName })}</h1>
          <p className="mt-2 text-sm text-slate-600">{t('invite.intro', { role: t(`team.roles.${info.role}`) })}</p>
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <Field id="email" label={t('auth.email')} value={info.email} readOnly disabled />
            <Field id="name" name="name" label={t('auth.name')} required maxLength={100} autoComplete="name" disabled={busy} />
            <Field id="password" name="password" type="password" label={t('auth.password')} hint={t('auth.passwordHint')} required minLength={10} maxLength={72} autoComplete="new-password" disabled={busy} />
            <ErrorAlert message={error} />
            <Button type="submit" disabled={busy} className="w-full">{busy ? t('auth.submitting') : t('invite.submit')}</Button>
          </form>
        </>
      )}
    </main>
  );
}

export default function Page() {
  return <Suspense><AcceptInvite /></Suspense>;
}
