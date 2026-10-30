'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useLocale } from '@/i18n';
import { LanguageSwitcher } from './language-switcher';
import { Button, Spinner } from './ui';

const NAV: { key: string; href?: string }[] = [
  { key: 'dashboard', href: '/dashboard' },
  { key: 'conversations', href: '/dashboard/conversations' },
  { key: 'customers', href: '/dashboard/customers' },
  { key: 'lists', href: '/dashboard/lists' },
  { key: 'services', href: '/dashboard/services' },
  { key: 'faq', href: '/dashboard/faq' },
  { key: 'team', href: '/dashboard/team' },
  { key: 'analytics', href: '/dashboard/analytics' },
  { key: 'whatsapp', href: '/dashboard/whatsapp' },
  { key: 'automation', href: '/dashboard/automation' },
  { key: 'campaigns', href: '/dashboard/campaigns' },
  { key: 'settings', href: '/dashboard/settings' },
  { key: 'subscription', href: '/dashboard/subscription' },
];

export function DashboardShell({ children }: { children: ReactNode }) {
  const { me, loading, signOut } = useAuth();
  const { t } = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !me) router.replace('/login');
    // New owners are guided through the setup wizard first.
    else if (me && me.role === 'OWNER' && !me.business.onboardedAt) router.replace('/onboarding');
  }, [loading, me, router]);

  if (loading || !me || (me.role === 'OWNER' && !me.business.onboardedAt)) {
    return <main className="flex min-h-screen items-center justify-center"><Spinner label={t('common.loading')} /></main>;
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="border-b border-slate-200 bg-white md:w-60 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="min-w-0 pr-2">
            <p className="truncate font-semibold text-sm">{me.business.name}</p>
            <p className="truncate text-xs text-slate-500">{me.user.email} · {t(`dashboard.role.${me.role}`)}</p>
          </div>
          <LanguageSwitcher compact theme="light" />
        </div>
        {me.user.isSuperAdmin && (
          <div className="mb-2 px-2">
            <Link
              href="/admin"
              className="flex items-center justify-between rounded-lg bg-gradient-to-r from-slate-900 to-indigo-950 px-3 py-2 text-xs font-semibold text-amber-300 shadow-sm border border-amber-400/30 hover:border-amber-400/70 transition group"
            >
              <span className="flex items-center gap-1.5">
                <span>👑</span>
                <span>Console Super Admin</span>
              </span>
              <span className="text-[10px] bg-amber-400/20 text-amber-300 px-1.5 py-0.5 rounded font-mono">
                SaaS
              </span>
            </Link>
          </div>
        )}
        <nav aria-label="Navigation principale" className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible">
          {NAV.map((item) =>
            item.href ? (
              <Link
                key={item.key}
                href={item.href}
                aria-current={pathname === item.href ? 'page' : undefined}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${pathname === item.href ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-100'}`}
              >
                {t(`nav.${item.key}`)}
              </Link>
            ) : (
              <span key={item.key} aria-disabled="true" className="flex items-center justify-between whitespace-nowrap rounded-lg px-3 py-2 text-sm text-slate-400">
                {t(`nav.${item.key}`)}
                <span className="ml-2 rounded bg-slate-100 px-1.5 text-[10px] uppercase">{t('common.soon')}</span>
              </span>
            ),
          )}
        </nav>
        <div className="hidden px-4 py-4 md:block">
          <Button onClick={async () => { await signOut(); router.push('/login'); }} className="w-full bg-slate-800 hover:bg-slate-900">
            {t('common.logout')}
          </Button>
        </div>
      </aside>
      <main className="flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
