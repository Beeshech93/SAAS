import type { ReactNode } from 'react';
import { AdminShell } from '@/components/admin-shell';

export const metadata = {
  title: 'Super Admin Console — SaaS',
  description: 'Console de gestion globale et multi-tenant pour la plateforme SaaS',
};

export default function Layout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
