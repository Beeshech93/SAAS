import { PrismaClient } from '@prisma/client';

/**
 * Adapts DATABASE_URL to the runtime:
 * - `schema` (DATABASE_SCHEMA): keeps this app's tables in their own PostgreSQL schema, so a
 *   shared database (e.g. a Neon database that already has other tables in `public`) is never touched.
 * - Neon's pooled endpoint ("-pooler" in the host) is PgBouncer in transaction mode: Prisma needs
 *   `pgbouncer=true` (no prepared statements) and a small per-instance pool, because each
 *   serverless instance opens its own connections.
 * Other URLs are left untouched. Keep in sync with scripts/vercel-build.cjs.
 */
export function normalizeDatabaseUrl(raw: string | undefined, schema?: string): string | undefined {
  if (!raw) return raw;
  try {
    const url = new URL(raw);
    if (schema) url.searchParams.set('schema', schema);
    if (url.hostname.includes('-pooler')) {
      if (!url.searchParams.has('pgbouncer')) url.searchParams.set('pgbouncer', 'true');
      if (!url.searchParams.has('connection_limit')) url.searchParams.set('connection_limit', '1');
    }
    return url.toString();
  } catch {
    return raw; // not a URL: let Prisma report it
  }
}

const url = normalizeDatabaseUrl(process.env.DATABASE_URL, process.env.DATABASE_SCHEMA || undefined);

export const prisma = new PrismaClient(url ? { datasources: { db: { url } } } : undefined);
