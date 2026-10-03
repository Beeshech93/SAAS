/**
 * Build step of the `api` service on Vercel.
 * 1. generate the Prisma client (Vercel does not run dependency install scripts)
 * 2. production builds only: apply pending migrations using the DIRECT (unpooled) connection,
 *    inside DATABASE_SCHEMA when set. Preview builds never touch the database.
 * Keep the URL handling in sync with src/lib/prisma.ts.
 */
const { spawnSync } = require('node:child_process');

function run(args, env) {
  const r = spawnSync('npx', ['prisma', ...args], { stdio: 'inherit', env: { ...process.env, ...env } });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function withSchema(raw, schema) {
  const url = new URL(raw);
  if (schema) url.searchParams.set('schema', schema);
  return url.toString();
}

run(['generate']);

if (process.env.VERCEL_ENV === 'production') {
  const direct = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!direct) {
    console.error('DATABASE_URL_UNPOOLED / DATABASE_URL is not set: cannot run migrations.');
    process.exit(1);
  }
  const schema = process.env.DATABASE_SCHEMA || undefined;
  console.log(`Applying migrations${schema ? ` in schema "${schema}"` : ''}...`);
  run(['migrate', 'deploy'], { DATABASE_URL: withSchema(direct, schema) });
}
