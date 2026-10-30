'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Button, Spinner } from './ui';
import { LanguageSwitcher } from './language-switcher';

interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: string;
}

const ADMIN_NAV: NavItem[] = [
  { key: 'overview', label: "Vue d'ensemble", href: '/admin', icon: '📊' },
  { key: 'businesses', label: 'Entreprises (Tenants)', href: '/admin/businesses', icon: '🏢' },
  { key: 'users', label: 'Utilisateurs', href: '/admin/users', icon: '👥' },
  { key: 'whatsapp', label: 'WhatsApp & Systèmes', href: '/admin/whatsapp', icon: '💬' },
  { key: 'subscriptions', label: 'Plans & Abonnements', href: '/admin/subscriptions', icon: '💳' },
  { key: 'logs', label: "Journal d'Audit", href: '/admin/logs', icon: '📋' },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const { me, loading, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !me) {
      router.replace('/login');
    }
  }, [loading, me, router]);

  if (loading || !me) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
        <Spinner label="Chargement de la console Super Admin…" />
      </main>
    );
  }

  if (!me.user.isSuperAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        <div className="w-full max-w-md rounded-2xl border border-red-500/20 bg-slate-900/90 p-8 text-center shadow-2xl backdrop-blur-xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-3xl text-red-400">
            🚫
          </div>
          <h1 className="text-xl font-bold text-white">Accès Refusé</h1>
          <p className="mt-2 text-sm text-slate-400">
            Ce panneau est strictement réservé aux Super Administrateurs de la plateforme SaaS.
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Button
              onClick={() => router.push('/dashboard')}
              className="w-full bg-brand-600 hover:bg-brand-500 text-white"
            >
              Retourner au Dashboard Client
            </Button>
            <button
              onClick={async () => {
                await signOut();
                router.push('/login');
              }}
              className="text-xs text-slate-500 hover:text-slate-300 transition"
            >
              Se déconnecter
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 md:flex-row font-sans">
      {/* Mobile Topbar */}
      <header className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 py-3 backdrop-blur-md md:hidden">
        <div className="flex items-center gap-2">
          <span className="text-lg">👑</span>
          <span className="font-bold text-white tracking-tight">Super Admin</span>
          <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
            Console
          </span>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher theme="dark" compact />
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Menu"
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={`${
          mobileMenuOpen ? 'block' : 'hidden'
        } border-b border-slate-800 bg-slate-900/90 backdrop-blur-xl md:flex md:w-64 md:flex-col md:border-b-0 md:border-r md:border-slate-800/80`}
      >
        <div className="hidden border-b border-slate-800/80 px-5 py-5 md:block">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-amber-500 to-amber-300 shadow-lg shadow-amber-500/20 text-slate-950 font-black text-lg">
                👑
              </div>
              <div>
                <p className="font-bold tracking-tight text-white leading-tight">Super Admin</p>
                <p className="text-[11px] font-medium text-slate-400">Multi-Tenant</p>
              </div>
            </div>
            <LanguageSwitcher theme="dark" compact />
          </div>
        </div>

        {/* Navigation */}
        <nav aria-label="Navigation Super Admin" className="flex-1 space-y-1.5 px-3 py-4">
          {ADMIN_NAV.map((item) => {
            const active = pathname === item.href || (item.href !== '/admin' && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-150 ${
                  active
                    ? 'bg-gradient-to-r from-brand-600 to-emerald-600 text-white shadow-lg shadow-brand-600/20 font-semibold'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
              >
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Back to Client Dashboard & User footer */}
        <div className="border-t border-slate-800/80 p-3 space-y-2">
          <Link
            href="/dashboard"
            className="flex items-center justify-between rounded-xl border border-slate-700/60 bg-slate-800/40 px-3.5 py-2 text-xs font-medium text-slate-300 hover:border-slate-600 hover:bg-slate-800 hover:text-white transition"
          >
            <span className="flex items-center gap-2">
              <span>←</span>
              <span>Espace Client (Dashboard)</span>
            </span>
          </Link>

          <div className="flex items-center justify-between rounded-xl bg-slate-950/60 p-2.5 border border-slate-800/50">
            <div className="min-w-0 flex-1 pr-2">
              <p className="truncate text-xs font-semibold text-white">{me.user.name}</p>
              <p className="truncate text-[11px] text-slate-400">{me.user.email}</p>
            </div>
            <button
              onClick={async () => {
                await signOut();
                router.push('/login');
              }}
              title="Se déconnecter"
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-red-400 transition"
            >
              🚪
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        <div className="mx-auto max-w-7xl">{children}</div>
      </main>
    </div>
  );
}
