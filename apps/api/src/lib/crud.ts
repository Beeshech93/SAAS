import { z } from 'zod';
import { notFound } from './errors';

const uuid = z.string().uuid();

/** Route param guard: malformed ids behave like "not found" instead of reaching the DB. */
export function parseId(raw: unknown): string {
  const r = uuid.safeParse(raw);
  if (!r.success) throw notFound();
  return r.data;
}
