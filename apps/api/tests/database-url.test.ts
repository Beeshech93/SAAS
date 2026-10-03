import { normalizeDatabaseUrl } from '../src/lib/prisma';

jest.mock('@prisma/client', () => ({ PrismaClient: class {} }));

describe('normalizeDatabaseUrl', () => {
  it('adds pgbouncer + a small pool on Neon pooled hosts', () => {
    const u = new URL(normalizeDatabaseUrl('postgresql://u:p@ep-cool-123-pooler.us-east-2.aws.neon.tech/db?sslmode=require')!);
    expect(u.searchParams.get('pgbouncer')).toBe('true');
    expect(u.searchParams.get('connection_limit')).toBe('1');
    expect(u.searchParams.get('sslmode')).toBe('require');
  });
  it('keeps explicit settings and leaves non-pooled/local URLs untouched', () => {
    const keep = new URL(normalizeDatabaseUrl('postgresql://u:p@x-pooler.neon.tech/db?pgbouncer=false&connection_limit=5')!);
    expect(keep.searchParams.get('pgbouncer')).toBe('false');
    expect(keep.searchParams.get('connection_limit')).toBe('5');
    const direct = 'postgresql://u:p@ep-cool-123.us-east-2.aws.neon.tech/db?sslmode=require';
    expect(normalizeDatabaseUrl(direct)).toBe(direct);
    expect(normalizeDatabaseUrl('postgresql://wba:pw@localhost:5432/wba?schema=public')).toBe('postgresql://wba:pw@localhost:5432/wba?schema=public');
    expect(normalizeDatabaseUrl(undefined)).toBeUndefined();
    expect(normalizeDatabaseUrl('not a url')).toBe('not a url');
  });
});
