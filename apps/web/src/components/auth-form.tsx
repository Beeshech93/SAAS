'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { api, ApiRequestError } from '@/lib/api';
import { useAuth, type Me } from '@/lib/auth-context';
import { t } from '@/i18n';
import { Button, ErrorAlert, Field, SelectField } from './ui';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const { signIn } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const isRegister = mode === 'register';

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const f = new FormData(e.currentTarget);
    const body = isRegister
      ? {
          name: f.get('name'),
          email: f.get('email'),
          password: f.get('password'),
          businessName: f.get('businessName'),
          businessType: f.get('businessType'),
        }
      : { email: f.get('email'), password: f.get('password') };
    try {
      const data = await api<Me & { accessToken: string }>(`/api/auth/${mode}`, { method: 'POST', body });
      signIn(data);
      router.push('/dashboard');
    } catch (err) {
      if (err instanceof ApiRequestError) {
        const key = `auth.errors.${err.code}`;
        const msg = t(key);
        setError(err.code === 'NETWORK' ? t('common.network') : msg === key ? t('common.error') : msg);
      } else setError(t('common.error'));
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-bold">{t(isRegister ? 'auth.registerTitle' : 'auth.loginTitle')}</h1>
      <form onSubmit={onSubmit} className="mt-8 space-y-4" noValidate={false}>
        {isRegister && (
          <>
            <Field id="businessName" name="businessName" label={t('auth.businessName')} required maxLength={120} disabled={submitting} />
            <SelectField id="businessType" name="businessType" label={t('auth.businessType')} disabled={submitting} defaultValue="HOTEL">
              {(['HOTEL', 'RESTAURANT', 'OTHER'] as const).map((k) => (
                <option key={k} value={k}>{t(`businessTypes.${k}`)}</option>
              ))}
            </SelectField>
            <Field id="name" name="name" label={t('auth.name')} required maxLength={100} autoComplete="name" disabled={submitting} />
          </>
        )}
        <Field id="email" name="email" type="email" label={t('auth.email')} required autoComplete="email" disabled={submitting} />
        <Field
          id="password"
          name="password"
          type="password"
          label={t('auth.password')}
          required
          minLength={isRegister ? 10 : undefined}
          maxLength={72}
          autoComplete={isRegister ? 'new-password' : 'current-password'}
          hint={isRegister ? t('auth.passwordHint') : undefined}
          disabled={submitting}
        />
        <ErrorAlert message={error} />
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? t('auth.submitting') : t(isRegister ? 'auth.submitRegister' : 'auth.submitLogin')}
        </Button>
      </form>
      <p className="mt-6 text-sm text-slate-600">
        {t(isRegister ? 'auth.haveAccount' : 'auth.noAccount')}{' '}
        <Link href={isRegister ? '/login' : '/register'} className="font-medium text-brand-700 hover:underline">
          {t(isRegister ? 'auth.loginTitle' : 'auth.registerTitle')}
        </Link>
      </p>
    </main>
  );
}
