import { PrismaClient } from '@prisma/client';

/**
 * Neon's pooled endpoint ("-pooler" in the host) is PgBouncer in transaction mode: Prisma needs
 * `pgbouncer=true` there (no prepared statements) and a small per-instance pool, because each
 * serverless instance opens its own connections. Other URLs are left untouched.
 */
export function normalizeDatabaseUrl(raw: string | undefined): string | undefined {
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    if (url.hostname.includes('-pooler')) {
      if (!url.searchParams.has('pgbouncer')) url.searchParams.set('pgbouncer', 'true');
      if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '1');
    }
    return url.toString();
  } catch {
    return raw; // not a URL: let Prisma report it
  }
}

const url = normalizeDatabaseUrl(process.env.DATABASE_URL);

export const prisma = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
